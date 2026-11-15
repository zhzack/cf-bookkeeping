import { Hono } from 'hono';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';
import {
  getExchangeRates,
  fetchLiveExchangeRates,
  updateExchangeRate,
} from '../exchangeRate';

export const currencyRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

currencyRouter.use('*', requireAuth);

// 获取所有币种汇率
currencyRouter.get('/rates', async (c) => {
  const rates = await getExchangeRates(c.env.DB);
  return c.json({ rates });
});

// 手动触发拉取最新实时外汇牌价
currencyRouter.post('/refresh', async (c) => {
  const result = await fetchLiveExchangeRates(c.env.DB);
  return c.json({
    message: '汇率已更新至最新牌价',
    updated_count: result.updatedCount,
    rates: result.rates,
  });
});

// 自定义/手动修改指定币种对人民币汇率
currencyRouter.put('/rate/:code', async (c) => {
  const code = c.req.param('code');
  const body = await c.req.json();
  const rateToCny = Number(body?.rate_to_cny);

  if (isNaN(rateToCny) || rateToCny <= 0) {
    return c.json({ error: '汇率必须为大于 0 的有效数值' }, 400);
  }

  const updated = await updateExchangeRate(c.env.DB, code, rateToCny);
  if (!updated) {
    return c.json({ error: '更新汇率失败' }, 500);
  }

  return c.json({
    message: `${code} 汇率已更新`,
    rate: updated,
  });
});
