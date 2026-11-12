import { Account, Category } from '../types';
import { AutoRuleLike, matchAutoRules } from './ruleMatcher';

export type BillProvider = 'wechat' | 'alipay';

export interface ParsedBillRow {
  tempId: string;
  external_id: string;
  source: BillProvider;
  type: 'expense' | 'income';
  rawDirection: string;
  amount: number; // 单位：分
  transaction_time: string;
  counterparty: string;
  product: string;
  categoryLabel: string;
  payMethod: string;
  statusText: string;
  remark: string;
  account_id: string;
  category_id: string;
  scene?: string | null;
  matchedRuleName?: string | null;
  isDuplicate: boolean;
  defaultSelected: boolean;
  skipReason?: string;
}

export interface ParseBillResult {
  provider: BillProvider;
  rows: ParsedBillRow[];
}

function excelColToIndex(colRef: string): number {
  const letters = colRef.replace(/[^A-Z]/gi, '').toUpperCase();
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return Math.max(0, idx - 1);
}

async function inflateDeflateRaw(data: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持直接解压 .xlsx 文件，请先将账单另存为 .csv 后导入');
  }
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return await new Response(stream).text();
}

async function readZipTextEntries(buffer: ArrayBuffer): Promise<Record<string, string>> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // 检测 ZIP 头（.xlsx 本质也是 PKZIP）
  if (bytes.length < 22 || view.getUint32(0, true) !== 0x04034b50) {
    throw new Error('文件格式无效或已加密（如果文件带解压密码，请先用密码解压后再上传未加密的 .xlsx/.csv）');
  }

  let eocdPos = -1;
  const minPos = Math.max(0, bytes.length - 65558);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdPos = i;
      break;
    }
  }
  if (eocdPos < 0) {
    throw new Error('无法读取 .xlsx 目录结构，建议先另存为 .csv 导入');
  }

  const totalEntries = view.getUint16(eocdPos + 10, true);
  let cdOffset = view.getUint32(eocdPos + 16, true);
  const decoder = new TextDecoder('utf-8');
  const wanted: Record<string, string> = {};

  for (let i = 0; i < totalEntries && cdOffset + 46 <= bytes.length; i++) {
    if (view.getUint32(cdOffset, true) !== 0x02014b50) break;

    const flags = view.getUint16(cdOffset + 8, true);
    const method = view.getUint16(cdOffset + 10, true);
    const compressedSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localOffset = view.getUint32(cdOffset + 42, true);

    const fileName = decoder.decode(bytes.subarray(cdOffset + 46, cdOffset + 46 + nameLen));
    cdOffset += 46 + nameLen + extraLen + commentLen;

    const isTarget =
      fileName === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d*\.xml$/i.test(fileName);
    if (!isTarget) continue;

    if (flags & 1) {
      throw new Error('该账单文件受密码保护，请先解密/取消密码后重新上传');
    }

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) {
      continue;
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const slice = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      wanted[fileName] = decoder.decode(slice);
    } else if (method === 8) {
      wanted[fileName] = await inflateDeflateRaw(slice);
    }
  }

  return wanted;
}

async function parseXlsxMatrix(buffer: ArrayBuffer): Promise<string[][]> {
  const entries = await readZipTextEntries(buffer);
  const sheetKey =
    entries['xl/worksheets/sheet1.xml']
      ? 'xl/worksheets/sheet1.xml'
      : Object.keys(entries)
          .filter((k) => /^xl\/worksheets\/sheet\d*\.xml$/i.test(k))
          .sort()[0];

  if (!sheetKey || !entries[sheetKey]) {
    throw new Error('未在 .xlsx 中找到工作表内容，请确认上传的是微信官方导出的账单明细');
  }

  const parser = new DOMParser();
  const sharedStrings: string[] = [];
  if (entries['xl/sharedStrings.xml']) {
    const ssDoc = parser.parseFromString(entries['xl/sharedStrings.xml'], 'application/xml');
    const siNodes = Array.from(ssDoc.getElementsByTagName('si'));
    for (const si of siNodes) {
      const tNodes = Array.from(si.getElementsByTagName('t'));
      sharedStrings.push(tNodes.map((n) => n.textContent || '').join(''));
    }
  }

  const sheetDoc = parser.parseFromString(entries[sheetKey], 'application/xml');
  const rowNodes = Array.from(sheetDoc.getElementsByTagName('row'));
  const matrix: string[][] = [];

  for (const rowNode of rowNodes) {
    const cells = Array.from(rowNode.getElementsByTagName('c'));
    const rowArr: string[] = [];
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const ref = cell.getAttribute('r');
      const colIdx = ref ? excelColToIndex(ref) : i;
      const cellType = cell.getAttribute('t');
      let value = '';

      if (cellType === 's') {
        const v = cell.getElementsByTagName('v')[0]?.textContent;
        const idx = v ? Number(v) : -1;
        value = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : '';
      } else if (cellType === 'inlineStr') {
        const tNodes = Array.from(cell.getElementsByTagName('t'));
        value = tNodes.map((t) => t.textContent || '').join('');
      } else {
        value = cell.getElementsByTagName('v')[0]?.textContent || '';
      }

      while (rowArr.length <= colIdx) rowArr.push('');
      rowArr[colIdx] = value.trim();
    }
    if (rowArr.some((c) => c.length > 0)) {
      matrix.push(rowArr);
    }
  }

  return matrix;
}

function decodeCsvText(buffer: ArrayBuffer): string {
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  const hasKeywords = /(交易时间|交易创建时间|交易对方|收\/支)/.test(utf8Text);
  if (hasKeywords && !utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }
  try {
    return new TextDecoder('gb18030').decode(buffer);
  } catch {
    return utf8Text;
  }
}

function parseCsvMatrix(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r') {
      if (clean[i + 1] === '\n') i++;
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (ch === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function normalizeDateTime(raw: string): string {
  const trimmed = (raw || '').trim();
  // 微信导出的 .xlsx 中交易时间通常为 Excel 序列日期数值（如 46338.756157407406）
  if (/^\d{5}(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num) && num > 25000 && num < 90000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.round(num * 86400000))
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19);
    }
  }

  const slashNormalized = trimmed.replace(/\//g, '-');
  const m = slashNormalized.match(/^(\d{4}-\d{1,2}-\d{1,2})\s+(\d{1,2}:\d{2})(?::(\d{2}))?/);
  if (m) {
    const d = m[1].split('-').map((p, i) => (i === 0 ? p : p.padStart(2, '0'))).join('-');
    const t = m[2].split(':').map((p) => p.padStart(2, '0')).join(':');
    const s = (m[3] || '00').padStart(2, '0');
    return `${d} ${t}:${s}`;
  }
  return slashNormalized.slice(0, 19);
}

function guessAccountId(
  accounts: Account[],
  provider: BillProvider,
  payMethod: string,
  fallbackId: string
): string {
  const pm = (payMethod || '').trim();
  if (pm && pm !== '/') {
    const exact = accounts.find((a) => a.name === pm);
    if (exact) return exact.id;
    const partial = accounts.find((a) => pm.includes(a.name) || a.name.includes(pm));
    if (partial) return partial.id;
    // 尾号匹配（如 招商银行信用卡(1391)）
    const tailMatch = pm.match(/\((\d{4})\)/);
    if (tailMatch) {
      const byTail = accounts.find((a) => a.name.includes(tailMatch[1]));
      if (byTail) return byTail.id;
    }
    if (/微信|零钱/.test(pm)) {
      const wx = accounts.find((a) => a.type === 'wechat');
      if (wx) return wx.id;
    }
    if (/支付宝|花呗|余额宝|亲情卡/.test(pm)) {
      const ali = accounts.find((a) => a.type === 'alipay');
      if (ali) return ali.id;
    }
    if (/信用卡/.test(pm)) {
      const credit = accounts.find((a) => a.type === 'credit') || accounts.find((a) => a.type === 'bank');
      if (credit) return credit.id;
    }
    if (/银行|储蓄|卡/.test(pm)) {
      const bank = accounts.find((a) => a.type === 'bank') || accounts.find((a) => a.type === 'credit');
      if (bank) return bank.id;
    }
  }
  const byProvider = accounts.find((a) => a.type === provider);
  return byProvider?.id || fallbackId || accounts[0]?.id || '';
}

const IMPORT_CAT_RULES: Array<{ names: string[]; keywords: RegExp }> = [
  {
    names: ['餐饮', '美食'],
    keywords: /(餐饮|美食|饿了么|美团|瑞幸|星巴克|库迪|麦当劳|肯德基|霸王茶姬|喜茶|奈雪|饭|面|粉|奶茶|咖啡|食堂|外卖|面包|火锅|烧烤)/i,
  },
  {
    names: ['交通', '出行'],
    keywords: /(交通|出行|滴滴|高德|网约车|地铁|公交|12306|铁路|高铁|航空|加油|充电|高速|停车|单车|哈啰|青桔)/i,
  },
  {
    names: ['住房', '物业'],
    keywords: /(房租|租金|物业|水费|电费|燃气|宽带|网费|话费|中国移动|中国联通|中国电信|供电|供暖|住房|家居)/i,
  },
  {
    names: ['日常', '百货', '购物'],
    keywords: /(日用|百货|超市|便利店|7-11|全家|罗森|盒马|山姆|淘宝|拼多多|京东|购物|商城|菜鸟)/i,
  },
  {
    names: ['数码', '电器'],
    keywords: /(数码|电器|apple|苹果|小米|华为|电脑|手机|阿里云|腾讯云|cloudflare|软件|会员)/i,
  },
  {
    names: ['休闲', '娱乐'],
    keywords: /(休闲|娱乐|电影|影院|游戏|steam|b站|bilibili|腾讯视频|爱奇艺|网易云|qq音乐|旅游|酒店)/i,
  },
  {
    names: ['医疗', '健康'],
    keywords: /(医疗|健康|医院|药房|药店|体检|诊所|牙科|医保)/i,
  },
  {
    names: ['服饰', '装扮'],
    keywords: /(服饰|装扮|优衣库|鞋|衣|裤|理发|美妆|护肤|洗衣)/i,
  },
  {
    names: ['人情', '往来'],
    keywords: /(红包|转账|亲友|礼金|送礼|人情)/i,
  },
  {
    names: ['工资', '薪酬'],
    keywords: /(工资|薪资|发薪)/i,
  },
  {
    names: ['投资', '理财'],
    keywords: /(收益|利息|分红|理财|基金|余额宝)/i,
  },
];

function guessCategoryId(
  categories: Category[],
  txType: 'expense' | 'income',
  combinedText: string,
  fallbackExpenseId: string,
  fallbackIncomeId: string
): string {
  const candidates = categories.filter((c) => c.type === txType);
  if (candidates.length === 0) return '';

  // 1. 直接分类名包含匹配（例如支付宝自带“餐饮美食”分类）
  const direct = candidates.find((c) => combinedText.includes(c.name));
  if (direct) return direct.id;

  // 2. 关键词规则匹配
  for (const rule of IMPORT_CAT_RULES) {
    if (rule.keywords.test(combinedText)) {
      const cat = candidates.find((c) => rule.names.some((k) => c.name.includes(k)));
      if (cat) return cat.id;
    }
  }

  const explicitFallback = txType === 'expense' ? fallbackExpenseId : fallbackIncomeId;
  if (explicitFallback && candidates.some((c) => c.id === explicitFallback)) {
    return explicitFallback;
  }
  return (candidates.find((c) => c.name.includes('其他')) || candidates[0]).id;
}

export function applyRulesToParsedRow(
  categories: Category[],
  rules: AutoRuleLike[],
  row: {
    type: 'expense' | 'income';
    account_id: string;
    categoryLabel: string;
    counterparty: string;
    product: string;
    remark: string;
  },
  fallbackExpenseCatId: string,
  fallbackIncomeCatId: string
): { category_id: string; scene: string | null; matchedRuleName: string | null } {
  const combinedText = `${row.categoryLabel} ${row.counterparty} ${row.product} ${row.remark}`;
  const customMatch = matchAutoRules(rules, {
    type: row.type,
    text: combinedText,
    accountId: row.account_id,
  });

  const validRuleCat =
    customMatch.categoryId &&
    categories.some((c) => c.id === customMatch.categoryId && c.type === row.type)
      ? customMatch.categoryId
      : null;

  const category_id =
    validRuleCat ||
    guessCategoryId(
      categories,
      row.type,
      combinedText,
      fallbackExpenseCatId,
      fallbackIncomeCatId
    );

  const matchedRuleName =
    (validRuleCat ? customMatch.matchedCategoryRule?.name : undefined) ||
    (customMatch.scene ? customMatch.matchedSceneRule?.name : undefined) ||
    null;

  return {
    category_id,
    scene: customMatch.scene || null,
    matchedRuleName,
  };
}

export async function parseBillFile(
  file: File,
  accounts: Account[],
  categories: Category[],
  fallbackAccountId: string,
  fallbackExpenseCatId: string,
  fallbackIncomeCatId: string,
  rules: AutoRuleLike[] = []
): Promise<ParseBillResult> {
  const name = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  let matrix: string[][];
  if (name.endsWith('.xlsx')) {
    matrix = await parseXlsxMatrix(buffer);
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    matrix = parseCsvMatrix(decodeCsvText(buffer));
  } else if (name.endsWith('.zip')) {
    throw new Error('检测到上传的是 .zip 压缩包，请先用邮箱/账单解压密码将里面的 .csv 或 .xlsx 解压出来后再上传');
  } else {
    throw new Error('请上传微信导出的 .xlsx/.csv 或支付宝导出的 .csv 账单文件');
  }

  // 查找表头行（前 50 行内同时包含时间、对方/商品、金额关键词）
  let headerIdx = -1;
  for (let i = 0; i < Math.min(matrix.length, 50); i++) {
    const joined = matrix[i].join('|');
    if (
      (joined.includes('交易时间') || joined.includes('交易创建时间')) &&
      joined.includes('交易对方') &&
      (joined.includes('金额') || joined.includes('收/支'))
    ) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx < 0) {
    throw new Error('未识别到微信或支付宝标准账单表头，请确认文件是微信/支付宝官方导出的明细对账单');
  }

  const headers = matrix[headerIdx].map((h) => h.trim());
  const topMeta = matrix.slice(0, headerIdx).flat().join(' ');
  const isWechat =
    topMeta.includes('微信支付') ||
    headers.includes('交易类型') ||
    headers.includes('当前状态') ||
    headers.includes('支付方式');
  const provider: BillProvider = isWechat ? 'wechat' : 'alipay';

  const col = (...names: string[]) => {
    for (const n of names) {
      const idx = headers.findIndex((h) => h === n || h.includes(n));
      if (idx >= 0) return idx;
    }
    return -1;
  };

  const idxTime = col('交易时间', '付款时间', '交易创建时间');
  const idxCategory = col('交易分类', '交易类型');
  const idxCounterparty = col('交易对方');
  const idxProduct = col('商品说明', '商品', '商品名称');
  const idxDirection = col('收/支');
  const idxAmount = col('金额(元)', '金额（元）', '金额');
  const idxPayMethod = col('收/付款方式', '支付方式');
  const idxStatus = col('交易状态', '当前状态', '资金状态');
  const idxTradeNo = col('交易订单号', '交易单号', '交易号');
  const idxRemark = col('备注');

  const rows: ParsedBillRow[] = [];
  for (let r = headerIdx + 1; r < matrix.length; r++) {
    const cells = matrix[r];
    if (!cells || cells.length < 3) continue;

    const rawTime = idxTime >= 0 ? cells[idxTime] || '' : '';
    const timeStr = normalizeDateTime(rawTime);
    if (!/^\d{4}-\d{2}-\d{2}/.test(timeStr)) continue;

    const rawAmount = idxAmount >= 0 ? (cells[idxAmount] || '').replace(/[¥￥,\s元]/g, '') : '';
    const amountYuan = Math.abs(Number(rawAmount));
    if (isNaN(amountYuan) || amountYuan <= 0) continue;

    const rawDir = idxDirection >= 0 ? (cells[idxDirection] || '').trim() : '';
    const isIncome = rawDir === '收入' || rawDir.includes('收入');
    const isExpense = rawDir === '支出' || rawDir.includes('支出');
    const isNeutral = !isIncome && !isExpense;

    const statusText = idxStatus >= 0 ? (cells[idxStatus] || '').trim() : '';
    const counterparty = idxCounterparty >= 0 ? (cells[idxCounterparty] || '').trim() : '';
    const product = idxProduct >= 0 ? (cells[idxProduct] || '').trim() : '';
    const catLabel = idxCategory >= 0 ? (cells[idxCategory] || '').trim() : '';
    const payMethod = idxPayMethod >= 0 ? (cells[idxPayMethod] || '').trim() : '';
    const rawRemark = idxRemark >= 0 ? (cells[idxRemark] || '').trim() : '';
    const tradeNo = idxTradeNo >= 0 ? (cells[idxTradeNo] || '').replace(/\t/g, '').trim() : '';
    const amountCents = Math.round(amountYuan * 100);

    const externalId = tradeNo
      ? `${provider === 'wechat' ? 'wx' : 'ali'}:${tradeNo}`
      : `${provider}:${timeStr}:${amountCents}:${counterparty.slice(0, 16)}`;

    const remarkParts = [counterparty, product, rawRemark]
      .filter((s) => s && s !== '/' && s !== '-')
      .filter((s, i, arr) => arr.indexOf(s) === i);
    const remark = remarkParts.join(' · ').slice(0, 120) || (provider === 'wechat' ? '微信账单' : '支付宝账单');

    const txType: 'expense' | 'income' = isIncome ? 'income' : 'expense';
    const isClosed = /(交易关闭|已关闭|全额退款|支付失败|退款关闭)/.test(statusText);

    let skipReason: string | undefined;
    if (isNeutral) skipReason = '不计收支/资金流转';
    else if (isClosed) skipReason = statusText;

    const resolvedAccountId = guessAccountId(accounts, provider, payMethod, fallbackAccountId);
    const ruleApplied = applyRulesToParsedRow(
      categories,
      rules,
      {
        type: txType,
        account_id: resolvedAccountId,
        categoryLabel: catLabel,
        counterparty,
        product,
        remark: `${remark} ${rawRemark}`,
      },
      fallbackExpenseCatId,
      fallbackIncomeCatId
    );

    rows.push({
      tempId: `${r}_${externalId}`,
      external_id: externalId,
      source: provider,
      type: txType,
      rawDirection: rawDir || '未标明',
      amount: amountCents,
      transaction_time: timeStr,
      counterparty: counterparty || '-',
      product: product || '-',
      categoryLabel: catLabel || '-',
      payMethod: payMethod || '-',
      statusText: statusText || '-',
      remark,
      account_id: resolvedAccountId,
      category_id: ruleApplied.category_id,
      scene: ruleApplied.scene,
      matchedRuleName: ruleApplied.matchedRuleName,
      isDuplicate: false,
      defaultSelected: !isNeutral && !isClosed,
      skipReason,
    });
  }

  if (rows.length === 0) {
    throw new Error('未解析出有效的收支流水记录，请检查账单时间范围是否为空');
  }

  return { provider, rows };
}
