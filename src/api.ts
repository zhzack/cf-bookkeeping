export async function fetchApi<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // 若本地存有通过 URL 回传的 sso_token，附加至 Authorization 标头以防第三方 Cookie 策略阻断
  if (typeof window !== 'undefined' && !headers.has('Authorization')) {
    const ssoToken = sessionStorage.getItem('sso_token');
    if (ssoToken) {
      headers.set('Authorization', `Bearer ${ssoToken}`);
    }
  }

  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers,
  });

  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;

  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !url.includes('/api/auth/me') && !url.includes('/api/auth/login')) {
      window.dispatchEvent(new CustomEvent('auth:unauthorized'));
    }
    throw new Error(data?.error || `网络请求错误 (${res.status})`);
  }

  return data as T;
}

export const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  HKD: 'HK$',
  EUR: '€',
  GBP: '£',
  JPY: 'JP¥',
  SGD: 'S$',
  AUD: 'A$',
  CAD: 'C$',
  THB: '฿',
  KRW: '₩',
  MOP: 'MOP$',
  TWD: 'NT$',
  MYR: 'RM',
  CHF: 'CHF',
  NZD: 'NZ$',
};

export function getCurrencySymbol(currencyCode?: string): string {
  if (!currencyCode) return '¥';
  return CURRENCY_SYMBOLS[currencyCode.toUpperCase()] || currencyCode;
}

// 格式化金额：分 -> 元 (带千分位)，支持多币种符号
export function formatCurrency(cents: number, showSign: boolean = false, currencyCode: string = 'CNY'): string {
  const symbol = getCurrencySymbol(currencyCode);
  const val = (cents / 100).toFixed(2);
  const parts = val.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.join('.');
  if (showSign && cents > 0) return `+${symbol}${formatted}`;
  if (showSign && cents < 0) return `-${symbol}${formatted.replace('-', '')}`;
  return `${symbol}${formatted}`;
}

// 格式化日期时间
export function formatDateTime(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString.replace(' ', 'T'));
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${month}月${day}日 ${hours}:${minutes}`;
}

