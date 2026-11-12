import { Account, Category } from './types';

export function getNowUTC8Str(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

export function normalizeTimeString(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return getNowUTC8Str();
  const trimmed = raw.trim().replace(/\//g, '-');
  // YYYY-MM-DD HH:mm:ss 或 YYYY-MM-DDTHH:mm(:ss)
  const fullMatch = trimmed.match(/^(\d{4}-\d{1,2}-\d{1,2})[T\s](\d{1,2}:\d{2})(?::(\d{2}))?/);
  if (fullMatch) {
    const parts = fullMatch[1].split('-').map((p, i) => (i === 0 ? p : p.padStart(2, '0')));
    const timeParts = fullMatch[2].split(':').map((p) => p.padStart(2, '0'));
    const sec = (fullMatch[3] || '00').padStart(2, '0');
    return `${parts.join('-')} ${timeParts.join(':')}:${sec}`;
  }
  const dateOnly = trimmed.match(/^(\d{4}-\d{1,2}-\d{1,2})$/);
  if (dateOnly) {
    const parts = dateOnly[1].split('-').map((p, i) => (i === 0 ? p : p.padStart(2, '0')));
    return `${parts.join('-')} 12:00:00`;
  }
  return getNowUTC8Str();
}

export interface ParsedQuickText {
  type?: 'expense' | 'income';
  amountYuan?: number;
  accountHint?: string;
  remark?: string;
}

/**
 * 解析 iOS 快捷指令传入的自然语言记账文本或支付截图 OCR 文本。
 * 例: "微信支付 向 瑞幸咖啡 付款 ¥18.50", "支付宝收款 200元", "午饭 25.5"
 */
export function parseQuickText(rawText?: string | null): ParsedQuickText {
  if (!rawText || typeof rawText !== 'string') return {};
  const text = rawText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return {};

  let type: 'expense' | 'income' | undefined;
  if (/(收入|收款|到账|转入|发工资|入账|退款成功|退款到账)/.test(text)) {
    type = 'income';
  } else if (/(支出|付款|支付|消费|扣款|买了|花了)/.test(text)) {
    type = 'expense';
  }

  let accountHint: string | undefined;
  if (/微信|零钱/.test(text)) accountHint = '微信';
  else if (/支付宝|花呗|余额宝/.test(text)) accountHint = '支付宝';
  else if (/银行|储蓄卡|信用卡|招行|工行|建行|农行|中行/.test(text)) accountHint = '银行';
  else if (/现金/.test(text)) accountHint = '现金';

  // 先去掉日期与时间片段，避免将 2026-11-12 或 14:30 误识别成金额
  const cleanedForAmount = text
    .replace(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?/g, ' ')
    .replace(/\d{1,2}:\d{2}(:\d{2})?/g, ' ')
    .replace(/\*{2,}\d+/g, ' ');

  // 优先匹配带货币符号或单位的数字，其次匹配正负小数/数字
  const currencyMatch =
    cleanedForAmount.match(/[¥￥]\s*(-?\d[\d,]*(?:\.\d{1,2})?)/) ||
    cleanedForAmount.match(/(-?\d[\d,]*(?:\.\d{1,2})?)\s*元/) ||
    cleanedForAmount.match(/(?:^|\s)(-?\d[\d,]*(?:\.\d{1,2})?)(?:\s|$)/);

  let amountYuan: number | undefined;
  let remarkSource = text;
  if (currencyMatch) {
    const numeric = Number(currencyMatch[1].replace(/,/g, ''));
    if (!isNaN(numeric) && numeric !== 0) {
      if (numeric < 0 && !type) type = 'expense';
      amountYuan = Math.abs(numeric);
    }
    remarkSource = cleanedForAmount.replace(currencyMatch[0], ' ');
  }

  // 清洗出干净的商户/备注摘要
  const remark = remarkSource
    .replace(/(微信支付|支付宝|付款成功|支付成功|收款成功|确认交易|向|消费|支出|收入|付款|交易单号.*|订单号.*)/g, ' ')
    .replace(/[¥￥元]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);

  return {
    type,
    amountYuan,
    accountHint,
    remark: remark || undefined,
  };
}

export function matchAccount(accounts: Account[], hint?: string | null): Account | undefined {
  if (accounts.length === 0) return undefined;
  const raw = (hint || '').trim();
  if (!raw) return accounts[0];

  const byId = accounts.find((a) => a.id === raw);
  if (byId) return byId;

  const lower = raw.toLowerCase();
  const byExact = accounts.find((a) => a.name.toLowerCase() === lower);
  if (byExact) return byExact;

  const byPartial = accounts.find(
    (a) => a.name.toLowerCase().includes(lower) || lower.includes(a.name.toLowerCase())
  );
  if (byPartial) return byPartial;

  // 类型兜底（如 hint="微信"/"零钱" -> account.type === 'wechat'）
  if (/微信|零钱/.test(raw)) {
    const acc = accounts.find((a) => a.type === 'wechat');
    if (acc) return acc;
  }
  if (/支付宝|花呗|余额宝/.test(raw)) {
    const acc = accounts.find((a) => a.type === 'alipay');
    if (acc) return acc;
  }
  if (/银行|卡/.test(raw)) {
    const acc = accounts.find((a) => a.type === 'bank' || a.type === 'credit');
    if (acc) return acc;
  }
  if (/现金/.test(raw)) {
    const acc = accounts.find((a) => a.type === 'cash');
    if (acc) return acc;
  }

  return accounts[0];
}

const CATEGORY_KEYWORDS: Array<{ categoryKeys: string[]; keywords: RegExp }> = [
  {
    categoryKeys: ['餐饮', '美食', '饮食'],
    keywords: /(餐|饭|面|粉|奶茶|咖啡|瑞幸|星巴克|库迪|麦当劳|肯德基|美团|饿了么|外卖|火锅|烧烤|食堂|小吃|面包|甜品|饮料|饮品)/i,
  },
  {
    categoryKeys: ['交通', '出行'],
    keywords: /(打车|滴滴|高德|网约车|出租|地铁|公交|铁路|12306|高铁|火车|机票|航空|加油|充电|高速|停车|哈啰|青桔|单车|交通)/i,
  },
  {
    categoryKeys: ['住房', '物业', '居住', '水电'],
    keywords: /(房租|租金|物业|水费|电费|燃气|宽带|网费|话费|联通|移动|电信|供暖|装修|家居|宜家)/i,
  },
  {
    categoryKeys: ['日用', '百货', '购物', '日百'],
    keywords: /(超市|便利店|7-11|全家|罗森|盒马|山姆|淘宝|天猫|拼多多|京东|百货|日用|纸巾|洗护)/i,
  },
  {
    categoryKeys: ['数码', '电器', '电子'],
    keywords: /(数码|手机|电脑|耳机|充电器|苹果|apple|小米|华为|联想|联想|显示器|键盘|鼠标|云服务器|软件|会员)/i,
  },
  {
    categoryKeys: ['医疗', '健康', '看病'],
    keywords: /(医院|药房|药店|体检|牙科|口腔|挂号|医疗|医保|疫苗|诊所)/i,
  },
  {
    categoryKeys: ['娱乐', '休闲', '游玩'],
    keywords: /(电影|影院|门票|游戏|steam|腾讯视频|爱奇艺|bilibili|b站|网易云|qq音乐|健身|ktv|旅游|酒店|景区)/i,
  },
  {
    categoryKeys: ['服饰', '装扮', '美容'],
    keywords: /(优衣库|zara|鞋|服装|衣服|裤|包|护肤|美妆|理发|剪发|洗衣)/i,
  },
  {
    categoryKeys: ['人情', '往来', '红包', '礼金'],
    keywords: /(红包|礼金|转给|亲友|送礼|请客|份子)/i,
  },
  {
    categoryKeys: ['工资', '薪酬'],
    keywords: /(工资|薪资|发薪|代发)/i,
  },
  {
    categoryKeys: ['理财', '投资', '利息', '分红'],
    keywords: /(收益|利息|分红|基金|余额宝|理财|返现)/i,
  },
];

export function matchCategory(
  categories: Category[],
  txType: 'expense' | 'income',
  categoryHint?: string | null,
  textHint?: string | null
): Category | undefined {
  const candidates = categories.filter((c) => c.type === txType);
  if (candidates.length === 0) return undefined;

  const rawHint = (categoryHint || '').trim();
  if (rawHint) {
    const byId = candidates.find((c) => c.id === rawHint);
    if (byId) return byId;

    const lower = rawHint.toLowerCase();
    const byExact = candidates.find((c) => c.name.toLowerCase() === lower);
    if (byExact) return byExact;

    const byPartial = candidates.find(
      (c) => c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
    );
    if (byPartial) return byPartial;
  }

  const combinedText = `${rawHint} ${textHint || ''}`.trim();
  if (combinedText) {
    for (const rule of CATEGORY_KEYWORDS) {
      if (rule.keywords.test(combinedText)) {
        const matched = candidates.find((c) =>
          rule.categoryKeys.some((k) => c.name.includes(k))
        );
        if (matched) return matched;
      }
    }
  }

  return candidates.find((c) => c.name.includes('其他')) || candidates[0];
}
