import { Hono } from 'hono';
import { Env, UserSession, Transaction } from '../types';
import { requireAuth } from '../auth';
import {
  MAX_PHOTOS_PER_RECORD,
  ValidatedPhoto,
  validatePhotoDataUrls,
  insertPhotos,
  listPhotos,
  syncPhotos,
  deletePhotosByParent,
  servePhotoBinary,
} from '../photos';

export const transactionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

transactionsRouter.use('*', requireAuth);

interface ItemDetailsInput {
  name?: string;
  category?: string;
  expected_days?: number | string | null;
  warranty_date?: string | null;
  location?: string | null;
  remark?: string | null;
}

async function createItemRecord(
  db: D1Database,
  userId: string,
  priceCents: number,
  purchaseDate: string,
  details: ItemDetailsInput,
  photos: ValidatedPhoto[]
): Promise<string> {
  const itemId = 'itm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const numExpected = details.expected_days ? Math.round(Number(details.expected_days)) : null;
  await db
    .prepare(
      `INSERT INTO items (id, user_id, name, category, price, resale_price, purchase_date, status, retired_date, expected_days, warranty_date, location, cooling_days, remark)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'using', NULL, ?, ?, ?, 7, ?)`
    )
    .bind(
      itemId,
      userId,
      details.name!.trim(),
      details.category?.trim() || '数码科技',
      priceCents,
      purchaseDate,
      numExpected && numExpected > 0 ? numExpected : null,
      details.warranty_date || null,
      details.location?.trim() || null,
      details.remark?.trim() || null
    )
    .run();

  if (photos.length > 0) {
    await insertPhotos(db, 'item_photos', 'item_id', itemId, userId, photos);
  }
  return itemId;
}

function normalizeDailyCostFields(
  type: string,
  amortizeDaysRaw: unknown,
  amortizeStartDateRaw: unknown,
  excludeDailyCostRaw: unknown,
  transactionTime: string
): { amortizeDays: number | null; amortizeStartDate: string | null; excludeDailyCost: number; error?: string } {
  if (type !== 'expense') {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const excludeDailyCost = excludeDailyCostRaw ? 1 : 0;
  if (excludeDailyCost) {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 1 };
  }

  if (amortizeDaysRaw === null || amortizeDaysRaw === undefined || amortizeDaysRaw === '') {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const parsedDays = Math.round(Number(amortizeDaysRaw));
  if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 36500) {
    return {
      amortizeDays: null,
      amortizeStartDate: null,
      excludeDailyCost: 0,
      error: '摊销天数需在 1 ~ 36500 天之间',
    };
  }

  if (parsedDays <= 1) {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const rawStart = typeof amortizeStartDateRaw === 'string' ? amortizeStartDateRaw.trim().slice(0, 10) : '';
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : transactionTime.slice(0, 10);

  return {
    amortizeDays: parsedDays,
    amortizeStartDate: startDate,
    excludeDailyCost: 0,
  };
}

// 查询流水列表
transactionsRouter.get('/', async (c) => {
  const user = c.get('user');
  const month = c.req.query('month'); // YYYY-MM
  const accountId = c.req.query('account_id');
  const categoryId = c.req.query('category_id');
  const type = c.req.query('type');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const offset = Number(c.req.query('offset')) || 0;

  let whereClause = 'WHERE t.user_id = ?';
  const params: any[] = [user.id];

  if (month) {
    whereClause += ' AND t.transaction_time LIKE ?';
    params.push(`${month}%`);
  }

  if (accountId) {
    whereClause += ' AND (t.account_id = ? OR t.destination_account_id = ?)';
    params.push(accountId, accountId);
  }

  if (categoryId) {
    whereClause += ' AND t.category_id = ?';
    params.push(categoryId);
  }

  if (type) {
    whereClause += ' AND t.type = ?';
    params.push(type);
  }

  const querySql = `
    SELECT 
      t.id,
      t.user_id,
      t.type,
      t.amount,
      t.account_id,
      t.destination_account_id,
      t.category_id,
      t.transaction_time,
      t.remark,
      t.amortize_days,
      t.amortize_start_date,
      COALESCE(t.exclude_daily_cost, 0) AS exclude_daily_cost,
      t.item_id,
      t.created_at,
      a.name AS account_name,
      da.name AS destination_account_name,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      i.name AS item_name,
      (SELECT COUNT(*) FROM transaction_photos p WHERE p.transaction_id = t.id) AS photo_count,
      (SELECT p.id FROM transaction_photos p WHERE p.transaction_id = t.id ORDER BY p.created_at ASC LIMIT 1) AS first_photo_id
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts da ON t.destination_account_id = da.id
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN items i ON t.item_id = i.id
    ${whereClause}
    ORDER BY t.transaction_time DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await c.env.DB.prepare(querySql).bind(...params, limit, offset).all<Transaction>();

  // 统计当前筛选条件下的总收支
  const sumSql = `
    SELECT 
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(COUNT(*), 0) AS total_count
    FROM transactions t
    ${whereClause}
  `;

  const summary = await c.env.DB.prepare(sumSql).bind(...params).first<{
    total_expense: number;
    total_income: number;
    total_count: number;
  }>();

  return c.json({
    transactions: results,
    summary: {
      total_expense: summary?.total_expense || 0,
      total_income: summary?.total_income || 0,
      total_count: summary?.total_count || 0,
      balance: (summary?.total_income || 0) - (summary?.total_expense || 0),
    },
  });
});

// 直接读取单张照片二进制（用于 <img> 缩略图与大图展示）
transactionsRouter.get('/photos/:photoId', async (c) => {
  const user = c.get('user');
  const photoId = c.req.param('photoId');
  const res = await servePhotoBinary(c.env.DB, 'transaction_photos', photoId, user.id);
  if (!res) {
    return c.json({ error: '照片不存在' }, 404);
  }
  return res;
});

// 查询某笔流水的全部照片
transactionsRouter.get('/:id/photos', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const photos = await listPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);
  return c.json({ photos });
});

// 新增一条流水
transactionsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    type,
    amount,
    account_id,
    destination_account_id,
    category_id,
    transaction_time,
    remark,
    amortize_days,
    amortize_start_date,
    exclude_daily_cost,
    photos,
    convert_to_item,
    item_details,
  } = body;

  if (!type || !['expense', 'income', 'transfer'].includes(type)) {
    return c.json({ error: '交易类型无效' }, 400);
  }

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '金额必须是大于 0 的数字' }, 400);
  }

  if (!account_id) {
    return c.json({ error: '请选择关联账户' }, 400);
  }

  // 验证账户属于当前用户
  const acc = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ?'
  ).bind(account_id, user.id).first();
  if (!acc) {
    return c.json({ error: '源账户不存在或无权限' }, 400);
  }

  if (type === 'transfer') {
    if (!destination_account_id) {
      return c.json({ error: '转账必须选择转入账户' }, 400);
    }
    if (destination_account_id === account_id) {
      return c.json({ error: '转入账户不能与转出账户相同' }, 400);
    }
    const destAcc = await c.env.DB.prepare(
      'SELECT id FROM accounts WHERE id = ? AND user_id = ?'
    ).bind(destination_account_id, user.id).first();
    if (!destAcc) {
      return c.json({ error: '转入账户不存在或无权限' }, 400);
    }
  }

  const id = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const time = transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const isConvertToItem = type === 'expense' && Boolean(convert_to_item);

  const dailyCost = normalizeDailyCostFields(
    type,
    isConvertToItem ? null : amortize_days,
    isConvertToItem ? null : amortize_start_date,
    isConvertToItem ? 1 : exclude_daily_cost,
    time
  );
  if (dailyCost.error) {
    return c.json({ error: dailyCost.error }, 400);
  }

  const photoCheck = validatePhotoDataUrls(photos);
  if (photoCheck.error) {
    return c.json({ error: photoCheck.error }, 400);
  }

  let createdItemId: string | null = null;
  if (isConvertToItem) {
    const resolvedName = (item_details?.name || remark || '').trim();
    if (!resolvedName) {
      return c.json({ error: '标记为大件时请填写物品名称' }, 400);
    }
    createdItemId = await createItemRecord(
      c.env.DB,
      user.id,
      numAmount,
      time.slice(0, 10),
      { ...item_details, name: resolvedName, remark: item_details?.remark || remark },
      photoCheck.items
    );
  }

  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, amortize_days, amortize_start_date, exclude_daily_cost, item_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? category_id : null,
    time,
    remark?.trim() || (createdItemId ? `购买大件: ${(item_details?.name || '').trim()}` : null),
    dailyCost.amortizeDays,
    dailyCost.amortizeStartDate,
    dailyCost.excludeDailyCost,
    createdItemId
  ).run();

  if (photoCheck.items.length > 0) {
    await insertPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id, photoCheck.items);
  }

  return c.json({
    id,
    item_id: createdItemId,
    message: createdItemId ? '记账并已录入持物大件' : '记账成功',
  });
});

// 将已有的一笔支出流水转为持物大件并补充信息
transactionsRouter.post('/:id/convert-to-item', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    name,
    category,
    expected_days,
    warranty_date,
    location,
    remark,
    copy_photo_ids,
    new_photos,
  } = body;

  const tx = await c.env.DB.prepare(
    'SELECT id, type, amount, transaction_time, remark, item_id FROM transactions WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{
      id: string;
      type: string;
      amount: number;
      transaction_time: string;
      remark: string | null;
      item_id: string | null;
    }>();

  if (!tx) {
    return c.json({ error: '未找到该流水记录' }, 404);
  }
  if (tx.type !== 'expense') {
    return c.json({ error: '仅支持将支出流水转为持物大件' }, 400);
  }
  if (tx.item_id) {
    return c.json({ error: '该笔流水已关联持物大件' }, 400);
  }

  const finalName = (name || tx.remark || '').trim();
  if (!finalName) {
    return c.json({ error: '请输入大件物品名称' }, 400);
  }

  const newPhotoCheck = validatePhotoDataUrls(new_photos);
  if (newPhotoCheck.error) {
    return c.json({ error: newPhotoCheck.error }, 400);
  }

  const txPhotos = await listPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);
  const selectedTxPhotos = Array.isArray(copy_photo_ids)
    ? txPhotos.filter((p) => copy_photo_ids.includes(p.id))
    : txPhotos;

  const copiedValidated: ValidatedPhoto[] = selectedTxPhotos.map((p) => ({
    mimeType: p.mime_type,
    dataUrl: p.data_url,
    sizeBytes: p.size_bytes,
  }));

  const combinedPhotos = [...copiedValidated, ...newPhotoCheck.items];
  if (combinedPhotos.length > MAX_PHOTOS_PER_RECORD) {
    return c.json({ error: `大件最多只能保存 ${MAX_PHOTOS_PER_RECORD} 张照片` }, 400);
  }

  const itemId = await createItemRecord(
    c.env.DB,
    user.id,
    tx.amount,
    tx.transaction_time.slice(0, 10),
    {
      name: finalName,
      category,
      expected_days,
      warranty_date,
      location,
      remark: remark !== undefined ? remark : tx.remark,
    },
    combinedPhotos
  );

  await c.env.DB.prepare(
    `UPDATE transactions
     SET item_id = ?, exclude_daily_cost = 1, amortize_days = NULL, amortize_start_date = NULL
     WHERE id = ? AND user_id = ?`
  )
    .bind(itemId, id, user.id)
    .run();

  return c.json({ item_id: itemId, message: '已将该笔开销转为持物大件' });
});

// 修改流水
transactionsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    type,
    amount,
    account_id,
    destination_account_id,
    category_id,
    transaction_time,
    remark,
    amortize_days,
    amortize_start_date,
    exclude_daily_cost,
    keep_photo_ids,
    new_photos,
  } = body;

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '金额必须是大于 0 的数字' }, 400);
  }

  const time = transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const dailyCost = normalizeDailyCostFields(type, amortize_days, amortize_start_date, exclude_daily_cost, time);
  if (dailyCost.error) {
    return c.json({ error: dailyCost.error }, 400);
  }

  const newPhotoCheck = validatePhotoDataUrls(new_photos);
  if (newPhotoCheck.error) {
    return c.json({ error: newPhotoCheck.error }, 400);
  }

  const shouldSyncPhotos = Array.isArray(keep_photo_ids) || Array.isArray(new_photos);

  const res = await c.env.DB.prepare(
    `UPDATE transactions 
     SET type = ?, amount = ?, account_id = ?, destination_account_id = ?, category_id = ?, transaction_time = ?, remark = ?, amortize_days = ?, amortize_start_date = ?, exclude_daily_cost = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? category_id : null,
    time,
    remark?.trim() || null,
    dailyCost.amortizeDays,
    dailyCost.amortizeStartDate,
    dailyCost.excludeDailyCost,
    id,
    user.id
  ).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权修改' }, 404);
  }

  if (shouldSyncPhotos) {
    const syncRes = await syncPhotos(
      c.env.DB,
      'transaction_photos',
      'transaction_id',
      id,
      user.id,
      keep_photo_ids,
      newPhotoCheck.items
    );
    if (syncRes.error) {
      return c.json({ error: syncRes.error }, 400);
    }
  }

  return c.json({ message: '修改成功' });
});

// 删除流水
transactionsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await deletePhotosByParent(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);

  const res = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权删除' }, 404);
  }

  return c.json({ message: '删除成功' });
});

