const MAX_OUTPUT_LEN = 650_000;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('无法解析该图片格式，请尝试 JPG/PNG/WebP 图片'));
    img.src = src;
  });
}

/**
 * 浏览器端压缩账单照片为 JPEG Data URL，控制体积以适配 Cloudflare D1 存储。
 */
export async function compressImageToDataUrl(file: File, maxDim = 1280): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`文件 "${file.name}" 不是图片`);
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawDataUrl);

  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width >= height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('浏览器不支持图片压缩');
  }

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const qualities = [0.78, 0.65, 0.52];
  for (const q of qualities) {
    const result = canvas.toDataURL('image/jpeg', q);
    if (result.length <= MAX_OUTPUT_LEN) {
      return result;
    }
  }

  throw new Error(`图片 "${file.name}" 压缩后仍过大，请裁剪后重试`);
}

export function getLocalTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}
