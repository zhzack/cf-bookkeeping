import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PositionedText {
  str: string;
  x: number;
  y: number;
  w: number;
  cx: number;
}

interface TextLine {
  y: number;
  items: PositionedText[];
}

function joinWrappedCell(existing: string, continuation: string): string {
  if (!existing) return continuation;
  if (!continuation) return existing;
  // 若两段首尾均为英文字母，则补空格；数字/中文/单号折行则直接无缝拼接
  const endsWithLetter = /[A-Za-z]$/.test(existing);
  const startsWithLetter = /^[A-Za-z]/.test(continuation);
  if (endsWithLetter && startsWithLetter && !/^[A-Z0-9_-]{8,}$/i.test(existing)) {
    return `${existing} ${continuation}`;
  }
  return `${existing}${continuation}`;
}

export async function parsePdfMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const bytes = new Uint8Array(buffer);
  // 校验 PDF 文件头
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 || // %
    bytes[1] !== 0x50 || // P
    bytes[2] !== 0x44 || // D
    bytes[3] !== 0x46 || // F
    bytes[4] !== 0x2d    // -
  ) {
    throw new Error('文件不是有效的 PDF 账单文件');
  }

  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });

  let doc: pdfjsLib.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (err: any) {
    if (err?.name === 'PasswordException') {
      throw new Error('该 PDF 账单受密码保护，请先解除 PDF 密码后再上传');
    }
    throw new Error(`PDF 解析失败：${err?.message || '文件可能已损坏'}`);
  }

  const matrix: string[][] = [];
  let headerCaptured = false;
  let colCenters: number[] = [];

  try {
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const tc = await page.getTextContent();

      const rawItems: PositionedText[] = [];
      for (const item of tc.items) {
        if (!('str' in item)) continue;
        const text = (item.str || '').trim();
        if (!text) continue;
        const x = Number(item.transform?.[4] ?? 0);
        const y = Number(item.transform?.[5] ?? 0);
        const w = Number(item.width ?? 0);
        rawItems.push({ str: text, x, y, w, cx: x + w / 2 });
      }

      if (rawItems.length === 0) continue;

      // 按 y 降序（页面从上到下）、x 升序（从左到右）排序并聚类为视觉行
      rawItems.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: TextLine[] = [];
      for (const it of rawItems) {
        let line = lines.find((l) => Math.abs(l.y - it.y) <= 3.5);
        if (!line) {
          line = { y: it.y, items: [] };
          lines.push(line);
        }
        line.items.push(it);
      }
      for (const line of lines) {
        line.items.sort((a, b) => a.x - b.x);
      }

      // 寻找当前页的账单表头行
      let pageHeaderIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const joined = lines[i].items.map((it) => it.str).join('|');
        if (
          (joined.includes('交易时间') || joined.includes('交易创建时间')) &&
          joined.includes('交易对方') &&
          (joined.includes('金额') || joined.includes('收/支'))
        ) {
          pageHeaderIdx = i;
          break;
        }
      }

      if (pageHeaderIdx >= 0) {
        const headerItems = lines[pageHeaderIdx].items;
        colCenters = headerItems.map((it) => it.cx);
        if (!headerCaptured) {
          // 保留表头前的元信息行（用于识别 抖音支付 / 微信支付 / 支付宝）
          for (let i = 0; i < pageHeaderIdx; i++) {
            matrix.push(lines[i].items.map((it) => it.str));
          }
          matrix.push(headerItems.map((it) => it.str));
          headerCaptured = true;
        }
      } else if (!headerCaptured) {
        continue;
      } else {
        // 尾页声明页（如抖音账单第 11 页“说明”）无表头也无日期行，跳过
        const hasTimestamp = lines.some((l) =>
          l.items.some((it) => /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(it.str))
        );
        if (!hasTimestamp) continue;
      }

      if (colCenters.length === 0) continue;

      const assignCol = (cx: number): number => {
        let best = 0;
        let bestDist = Infinity;
        for (let i = 0; i < colCenters.length; i++) {
          const dist = Math.abs(cx - colCenters[i]);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        }
        return best;
      };

      const startIdx = pageHeaderIdx >= 0 ? pageHeaderIdx + 1 : 0;
      let activeRow: string[] | null = null;
      let activeRowY = 0;

      for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        const fullLineText = line.items.map((it) => it.str).join(' ').trim();
        // 忽略页码（如 "1/ 11"、"2/11"、"第 1 页"）
        if (/^\d+\s*\/\s*\d+$/.test(fullLineText) || /^第\s*\d+\s*页/.test(fullLineText)) {
          continue;
        }

        const cells = new Array<string>(colCenters.length).fill('');
        for (const it of line.items) {
          const cIdx = assignCol(it.cx);
          cells[cIdx] = cells[cIdx] ? `${cells[cIdx]} ${it.str}` : it.str;
        }

        if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(cells[0])) {
          activeRow = cells;
          activeRowY = line.y;
          matrix.push(activeRow);
        } else if (activeRow && !cells[0] && Math.abs(activeRowY - line.y) <= 24) {
          // 同一单元格的自动折行续行（如 银行卡尾号、商户名称、商家单号）
          for (let c = 1; c < cells.length; c++) {
            if (cells[c]) {
              activeRow[c] = joinWrappedCell(activeRow[c], cells[c]);
            }
          }
        }
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  return matrix;
}
