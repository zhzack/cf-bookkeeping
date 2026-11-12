export async function fetchApi<T = any>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error || `网络请求错误 (${res.status})`);
  }

  return data as T;
}

// 格式化金额：分 -> 元 (带千分位)
export function formatCurrency(cents: number, showSign: boolean = false): string {
  const yuan = (cents / 100).toFixed(2);
  const parts = yuan.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formatted = parts.join('.');
  if (showSign && cents > 0) return `+¥${formatted}`;
  if (showSign && cents < 0) return `-¥${formatted.replace('-', '')}`;
  return `¥${formatted}`;
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

