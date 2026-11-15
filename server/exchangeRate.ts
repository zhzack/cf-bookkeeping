import { CurrencyRate } from './types';

export interface CurrencyConfig {
  name: string;
  symbol: string;
  defaultRate: number;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  CNY: { name: '人民币', symbol: '¥', defaultRate: 1.0 },
  USD: { name: '美元', symbol: '$', defaultRate: 7.24 },
  HKD: { name: '港币', symbol: 'HK$', defaultRate: 0.93 },
  EUR: { name: '欧元', symbol: '€', defaultRate: 7.85 },
  GBP: { name: '英镑', symbol: '£', defaultRate: 9.42 },
  JPY: { name: '日元', symbol: 'JP¥', defaultRate: 0.047 },
  SGD: { name: '新加坡元', symbol: 'S$', defaultRate: 5.48 },
  AUD: { name: '澳元', symbol: 'A$', defaultRate: 4.75 },
  CAD: { name: '加元', symbol: 'C$', defaultRate: 5.21 },
  THB: { name: '泰铢', symbol: '฿', defaultRate: 0.21 },
  KRW: { name: '韩元', symbol: '₩', defaultRate: 0.0052 },
  MOP: { name: '澳门元', symbol: 'MOP$', defaultRate: 0.90 },
  TWD: { name: '新台币', symbol: 'NT$', defaultRate: 0.22 },
  MYR: { name: '马来西亚林吉特', symbol: 'RM', defaultRate: 1.62 },
  CHF: { name: '瑞士法郎', symbol: 'CHF', defaultRate: 8.25 },
  NZD: { name: '新西兰元', symbol: 'NZ$', defaultRate: 4.35 },
};

/**
 * 确保所有受支持的基础货币在数据库中均有初始化记录
 */
export async function ensureDefaultRates(db: D1Database): Promise<void> {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  for (const [code, info] of Object.entries(SUPPORTED_CURRENCIES)) {
    await db
      .prepare(
        `INSERT OR IGNORE INTO currency_rates (code, name, symbol, rate_to_cny, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(code, info.name, info.symbol, info.defaultRate, now)
      .run();
  }
}

/**
 * 从数据库读取当前所有货币汇率
 */
export async function getExchangeRates(db: D1Database): Promise<CurrencyRate[]> {
  await ensureDefaultRates(db);
  const { results } = await db
    .prepare('SELECT * FROM currency_rates ORDER BY code ASC')
    .all<CurrencyRate>();
  return results || [];
}

/**
 * 从公开免费汇率接口 (open.er-api.com) 拉取最新汇率并更新至数据库
 */
export async function fetchLiveExchangeRates(db: D1Database): Promise<{ updatedCount: number; rates: CurrencyRate[] }> {
  await ensureDefaultRates(db);
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let updatedCount = 0;

  try {
    const res = await fetch('https://open.er-api.com/v6/latest/CNY', {
      headers: { 'User-Agent': 'cf-bookkeeping/1.0' },
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data && data.rates && typeof data.rates === 'object') {
        for (const [code, info] of Object.entries(SUPPORTED_CURRENCIES)) {
          if (code === 'CNY') {
            await db
              .prepare(
                `INSERT OR REPLACE INTO currency_rates (code, name, symbol, rate_to_cny, updated_at)
                 VALUES ('CNY', '人民币', '¥', 1.0, ?)`
              )
              .bind(now)
              .run();
            updatedCount++;
          } else if (data.rates[code] && data.rates[code] > 0) {
            // open.er-api.com 基准货币是 CNY，data.rates[code] 表示 1 CNY 换多少外币
            // 因此 1 单位该外币 = (1.0 / rates[code]) 人民币
            const rawRate = 1.0 / data.rates[code];
            const rateToCny = Math.round(rawRate * 100000) / 100000;
            await db
              .prepare(
                `INSERT OR REPLACE INTO currency_rates (code, name, symbol, rate_to_cny, updated_at)
                 VALUES (?, ?, ?, ?, ?)`
              )
              .bind(code, info.name, info.symbol, rateToCny, now)
              .run();
            updatedCount++;
          }
        }
      }
    }
  } catch (err) {
    console.warn('拉取实时汇率失败，已保留现有汇率基准:', err);
  }

  const { results } = await db
    .prepare('SELECT * FROM currency_rates ORDER BY code ASC')
    .all<CurrencyRate>();
  return { updatedCount, rates: results || [] };
}

/**
 * 手动更新指定货币的自定义汇率
 */
export async function updateExchangeRate(
  db: D1Database,
  code: string,
  rateToCny: number
): Promise<CurrencyRate | null> {
  const upper = code.trim().toUpperCase();
  const info = SUPPORTED_CURRENCIES[upper];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  await db
    .prepare(
      `INSERT OR REPLACE INTO currency_rates (code, name, symbol, rate_to_cny, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(
      upper,
      info?.name || upper,
      info?.symbol || upper,
      Math.max(0.000001, rateToCny),
      now
    )
    .run();

  const rate = await db
    .prepare('SELECT * FROM currency_rates WHERE code = ?')
    .bind(upper)
    .first<CurrencyRate>();
  return rate || null;
}
