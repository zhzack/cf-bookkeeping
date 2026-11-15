import { PhotoRecord } from './types';

export const MAX_PHOTOS_PER_RECORD = 3;
export const MAX_PHOTO_DATA_URL_LEN = 700_000;
const PHOTO_DATA_URL_RE = /^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

export type PhotoTable = 'transaction_photos' | 'item_photos';
export type PhotoFkCol = 'transaction_id' | 'item_id';

export interface ValidatedPhoto {
  mimeType: string;
  dataUrl: string;
  sizeBytes: number;
}

export function validatePhotoDataUrls(rawPhotos: unknown): { items: ValidatedPhoto[]; error?: string } {
  if (rawPhotos === undefined || rawPhotos === null) {
    return { items: [] };
  }
  if (!Array.isArray(rawPhotos)) {
    return { items: [], error: '照片数据格式无效' };
  }
  if (rawPhotos.length > MAX_PHOTOS_PER_RECORD) {
    return { items: [], error: `最多只能上传 ${MAX_PHOTOS_PER_RECORD} 张照片` };
  }

  const items: ValidatedPhoto[] = [];
  for (const raw of rawPhotos) {
    if (typeof raw !== 'string') {
      return { items: [], error: '照片数据格式无效' };
    }
    if (raw.length > MAX_PHOTO_DATA_URL_LEN) {
      return { items: [], error: '单张照片压缩后体积过大，请换一张或裁剪后再试' };
    }
    const match = raw.match(PHOTO_DATA_URL_RE);
    if (!match) {
      return { items: [], error: '仅支持 JPG/PNG/WebP/GIF 格式的图片' };
    }
    const mimeType = match[1] === 'image/jpg' ? 'image/jpeg' : match[1];
    const sizeBytes = Math.floor((match[2].length * 3) / 4);
    items.push({ mimeType, dataUrl: raw, sizeBytes });
  }
  return { items };
}

function base64ToUint8Array(dataUrl: string): Uint8Array {
  const base64Part = dataUrl.split(',')[1] || '';
  const binaryStr = atob(base64Part);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export async function insertPhotos(
  db: D1Database,
  bucket: R2Bucket | undefined,
  table: PhotoTable,
  fkCol: PhotoFkCol,
  parentId: string,
  userId: string,
  photos: ValidatedPhoto[]
) {
  for (const photo of photos) {
    const photoId = 'pho_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    let storedDataUrl = photo.dataUrl;

    // 优先存储至 Cloudflare R2 对象存储，降低 D1 数据库负载
    if (bucket) {
      try {
        const ext = photo.mimeType.includes('png')
          ? 'png'
          : photo.mimeType.includes('webp')
          ? 'webp'
          : 'jpg';
        const r2Key = `photos/${table}/${userId}/${photoId}.${ext}`;
        const bytes = base64ToUint8Array(photo.dataUrl);

        await bucket.put(r2Key, bytes, {
          httpMetadata: { contentType: photo.mimeType },
          customMetadata: { parentId, userId, photoId },
        });
        storedDataUrl = `r2:${r2Key}`;
      } catch (err) {
        console.warn('R2 对象存储写入失败，自动降级回退至 D1 数据库存储:', err);
      }
    }

    await db
      .prepare(
        `INSERT INTO ${table} (id, ${fkCol}, user_id, mime_type, data_url, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(photoId, parentId, userId, photo.mimeType, storedDataUrl, photo.sizeBytes)
      .run();
  }
}

export async function listPhotos(
  db: D1Database,
  table: PhotoTable,
  fkCol: PhotoFkCol,
  parentId: string,
  userId: string
): Promise<PhotoRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT id, ${fkCol}, mime_type, data_url, size_bytes, created_at
       FROM ${table}
       WHERE ${fkCol} = ? AND user_id = ?
       ORDER BY created_at ASC`
    )
    .bind(parentId, userId)
    .all<PhotoRecord>();

  const routePrefix = table === 'transaction_photos' ? 'transactions' : 'items';

  return (results || []).map((row) => ({
    ...row,
    // 如果存储在 R2，转换为标准的二进制流 API 访问路径
    data_url: row.data_url.startsWith('r2:')
      ? `/api/${routePrefix}/photos/${row.id}`
      : row.data_url,
  }));
}

export async function syncPhotos(
  db: D1Database,
  bucket: R2Bucket | undefined,
  table: PhotoTable,
  fkCol: PhotoFkCol,
  parentId: string,
  userId: string,
  keepPhotoIdsRaw: unknown,
  newPhotos: ValidatedPhoto[]
): Promise<{ error?: string }> {
  const hasKeep = Array.isArray(keepPhotoIdsRaw);
  const keepIds: string[] = hasKeep
    ? keepPhotoIdsRaw.filter((pid: unknown): pid is string => typeof pid === 'string')
    : [];

  const existingRes = await db
    .prepare(`SELECT id, data_url FROM ${table} WHERE ${fkCol} = ? AND user_id = ?`)
    .bind(parentId, userId)
    .all<{ id: string; data_url: string }>();

  const keptExistingCount = hasKeep
    ? existingRes.results.filter((row) => keepIds.includes(row.id)).length
    : existingRes.results.length;

  if (keptExistingCount + newPhotos.length > MAX_PHOTOS_PER_RECORD) {
    return { error: `最多只能保存 ${MAX_PHOTOS_PER_RECORD} 张照片` };
  }

  if (hasKeep) {
    for (const row of existingRes.results) {
      if (!keepIds.includes(row.id)) {
        if (bucket && row.data_url.startsWith('r2:')) {
          try {
            await bucket.delete(row.data_url.slice(3));
          } catch (err) {
            console.warn('R2 对象删除失败:', err);
          }
        }
        await db.prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ?`).bind(row.id, userId).run();
      }
    }
  }

  if (newPhotos.length > 0) {
    await insertPhotos(db, bucket, table, fkCol, parentId, userId, newPhotos);
  }

  return {};
}

export async function deletePhotosByParent(
  db: D1Database,
  bucket: R2Bucket | undefined,
  table: PhotoTable,
  fkCol: PhotoFkCol,
  parentId: string,
  userId: string
) {
  if (bucket) {
    try {
      const { results } = await db
        .prepare(`SELECT data_url FROM ${table} WHERE ${fkCol} = ? AND user_id = ?`)
        .bind(parentId, userId)
        .all<{ data_url: string }>();

      for (const row of results || []) {
        if (row.data_url.startsWith('r2:')) {
          await bucket.delete(row.data_url.slice(3)).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('级联清理 R2 照片失败:', err);
    }
  }

  await db.prepare(`DELETE FROM ${table} WHERE ${fkCol} = ? AND user_id = ?`).bind(parentId, userId).run();
}

export async function servePhotoBinary(
  db: D1Database,
  bucket: R2Bucket | undefined,
  table: PhotoTable,
  photoId: string,
  userId: string
): Promise<Response | null> {
  const photo = await db
    .prepare(`SELECT mime_type, data_url FROM ${table} WHERE id = ? AND user_id = ?`)
    .bind(photoId, userId)
    .first<{ mime_type: string; data_url: string }>();

  if (!photo) return null;

  // 1. 如果是存放在 Cloudflare R2 的对象
  if (photo.data_url.startsWith('r2:') && bucket) {
    const r2Key = photo.data_url.slice(3);
    const obj = await bucket.get(r2Key);
    if (obj) {
      return new Response(obj.body, {
        headers: {
          'Content-Type': photo.mime_type || obj.httpMetadata?.contentType || 'image/jpeg',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }

  // 2. 如果是历史存放在 D1 的 Base64
  const bytes = base64ToUint8Array(photo.data_url);

  return new Response(bytes as any, {
    headers: {
      'Content-Type': photo.mime_type || 'image/jpeg',
      'Cache-Control': 'private, max-age=86400',
    },
  });
}
