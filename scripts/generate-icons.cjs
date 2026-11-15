const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. 生成精美的矢量 SVG 图标
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#4338ca" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="24" flood-color="#1e1b4b" flood-opacity="0.35" />
    </filter>
  </defs>

  <!-- 背景圆角矩形 -->
  <rect width="512" height="512" rx="128" fill="url(#bg)" />

  <!-- 主体钱包图标 -->
  <g filter="url(#shadow)">
    <!-- 顶部微露的账单/卡片 -->
    <rect x="176" y="112" width="160" height="90" rx="16" fill="url(#cardGrad)" transform="rotate(-6 256 157)" />
    <rect x="160" y="132" width="192" height="110" rx="20" fill="#ffffff" fill-opacity="0.9" />
    <rect x="184" y="156" width="96" height="12" rx="6" fill="#cbd5e1" />
    <rect x="184" y="180" width="64" height="12" rx="6" fill="#94a3b8" />

    <!-- 钱包皮夹外壳 -->
    <rect x="106" y="180" width="300" height="210" rx="36" fill="#1e1b4b" fill-opacity="0.15" />
    <rect x="106" y="170" width="300" height="210" rx="36" fill="#ffffff" />

    <!-- 钱包内衬与卡扣细节 -->
    <path d="M106 240 Q256 260 406 240 L406 344 A36 36 0 0 1 370 380 L142 380 A36 36 0 0 1 106 344 Z" fill="#f8fafc" />
    
    <!-- 闭合卡扣搭扣 -->
    <rect x="330" y="246" width="86" height="60" rx="18" fill="#4f46e5" />
    <circle cx="362" cy="276" r="10" fill="#fbbf24" />
  </g>
</svg>`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);

// 2. 纯 Node 生成标准 PNG 二进制文件 (无需额外依赖)
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(len + 12);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, len + 8));
  chunk.writeUInt32BE(crc, len + 8);
  return chunk;
}

function createPng(size) {
  // 生成标准 RGBA 像素矩阵
  const rawRows = [];
  const radius = size * 0.22; // 圆角半径
  const center = size / 2;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // Filter: None
    for (let x = 0; x < size; x++) {
      const idx = 1 + x * 4;
      
      // 检查是否在圆角矩形内
      const dx = Math.abs(x - center) - (center - radius);
      const dy = Math.abs(y - center) - (center - radius);
      const isInside = dx <= 0 || dy <= 0 || (dx * dx + dy * dy <= radius * radius);

      if (!isInside) {
        row[idx] = 0;
        row[idx + 1] = 0;
        row[idx + 2] = 0;
        row[idx + 3] = 0;
        continue;
      }

      // 绘制渐变背景 (#6366f1 -> #4338ca)
      const grad = (x + y) / (size * 2);
      const r = Math.round(99 * (1 - grad) + 67 * grad);
      const g = Math.round(102 * (1 - grad) + 56 * grad);
      const b = Math.round(241 * (1 - grad) + 202 * grad);

      // 绘制中心钱包图标白色区域 (归一化坐标 0~1)
      const nx = x / size;
      const ny = y / size;

      let pixelR = r, pixelG = g, pixelB = b;

      // 钱包外框主体 (0.24 <= nx <= 0.76, 0.35 <= ny <= 0.74)
      if (nx >= 0.24 && nx <= 0.76 && ny >= 0.35 && ny <= 0.74) {
        pixelR = 255;
        pixelG = 255;
        pixelB = 255;

        // 钱包右侧金色扣子
        if (nx >= 0.65 && nx <= 0.82 && ny >= 0.49 && ny <= 0.61) {
          pixelR = 79;
          pixelG = 70;
          pixelB = 229;
          const distToGold = Math.hypot(nx - 0.72, ny - 0.55);
          if (distToGold < 0.025) {
            pixelR = 251;
            pixelG = 191;
            pixelB = 36;
          }
        }
      }
      // 钱包上方微露卡片 (0.34 <= nx <= 0.66, 0.25 <= ny <= 0.35)
      else if (nx >= 0.34 && nx <= 0.66 && ny >= 0.25 && ny <= 0.36) {
        pixelR = 56;
        pixelG = 189;
        pixelB = 248; // 天蓝色
      }

      row[idx] = pixelR;
      row[idx + 1] = pixelG;
      row[idx + 2] = pixelB;
      row[idx + 3] = 255;
    }
    rawRows.push(row);
  }

  const uncompressed = Buffer.concat(rawRows);
  const compressed = zlib.deflateSync(uncompressed, { level: 9 });

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits per sample
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const chunks = [
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ];

  return Buffer.concat(chunks);
}

fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180));

console.log('PWA 高清图标生成完成: icon.svg, favicon.svg, pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png');
