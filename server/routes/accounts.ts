import { Hono } from 'hono';
import { Env, UserSession, Account } from '../types';
import { requireAuth } from '../auth';

export const accountsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

accountsRouter.use('*', requireAuth);

// 获取所有账户（包含动态实时余额计算）
accountsRouter.get('/', async (c) => {
  const user = c.get('user');

  // 动态精确计算账户余额，防止任何数据不一致漂移，并关联外汇牌价折算 CNY 价值
  const sql = `
    SELECT 
      a.id,
      a.user_id,
      a.name,
      a.type,
      COALESCE(a.currency, 'CNY') AS currency,
      a.initial_balance,
      a.icon,
      a.color,
      a.sort_order,
      a.created_at,
      COALESCE(cr.symbol, '¥') AS currency_symbol,
      COALESCE(cr.name, '人民币') AS currency_name,
      COALESCE(cr.rate_to_cny, 1.0) AS rate_to_cny,
      (
        a.initial_balance 
        + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = a.id), 0)
        + COALESCE((SELECT SUM(COALESCE(t.target_amount, t.amount)) FROM transactions t WHERE t.destination_account_id = a.id AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'transfer'), 0)
      ) AS current_balance
    FROM accounts a
    LEFT JOIN currency_rates cr ON cr.code = COALESCE(a.currency, 'CNY')
    WHERE a.user_id = ?
    ORDER BY a.sort_order ASC, a.created_at ASC
  `;

  const { results } = await c.env.DB.prepare(sql).bind(user.id).all<Account>();
  const accounts = (results || []).map((acc) => ({
    ...acc,
    cny_current_balance: Math.round(acc.current_balance * (acc.rate_to_cny || 1.0)),
  }));

  return c.json({ accounts });
});

// 创建新账户
accountsRouter.post('/', async (c) => {
  const user = c.get('user');
  const { name, type, initial_balance = 0, currency = 'CNY', icon, color } = await c.req.json();

  if (!name || !name.trim()) {
    return c.json({ error: '账户名称不能为空' }, 400);
  }

  const validTypes = ['cash', 'bank', 'alipay', 'wechat', 'credit', 'other'];
  const accountType = validTypes.includes(type) ? type : 'other';
  const currencyCode = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'CNY';
  const id = 'acc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  // 获取最大 sort_order
  const maxSortRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) as max_sort FROM accounts WHERE user_id = ?'
  ).bind(user.id).first<{ max_sort: number }>();
  const sortOrder = (maxSortRow?.max_sort || 0) + 1;

  const initBalInCents = Math.round(Number(initial_balance) || 0);

  await c.env.DB.prepare(
    `INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance, icon, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, name.trim(), accountType, currencyCode, initBalInCents, initBalInCents, icon || 'Wallet', color || '#3B82F6', sortOrder).run();

  return c.json({ id, message: '账户创建成功' });
});

// 更新账户
accountsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { name, type, initial_balance, currency, icon, color } = await c.req.json();

  if (!name || !name.trim()) {
    return c.json({ error: '账户名称不能为空' }, 400);
  }

  const initBalInCents = Math.round(Number(initial_balance) || 0);
  const currencyCode = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : undefined;

  const res = currencyCode
    ? await c.env.DB.prepare(
        `UPDATE accounts 
         SET name = ?, type = ?, initial_balance = ?, currency = ?, icon = ?, color = ?
         WHERE id = ? AND user_id = ?`
      ).bind(name.trim(), type, initBalInCents, currencyCode, icon, color, id, user.id).run()
    : await c.env.DB.prepare(
        `UPDATE accounts 
         SET name = ?, type = ?, initial_balance = ?, icon = ?, color = ?
         WHERE id = ? AND user_id = ?`
      ).bind(name.trim(), type, initBalInCents, icon, color, id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该账户或无权修改' }, 404);
  }

  return c.json({ message: '账户更新成功' });
});

// 删除账户
accountsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // 检查是否有关联流水
  const transCount = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM transactions WHERE (account_id = ? OR destination_account_id = ?) AND user_id = ?'
  ).bind(id, id, user.id).first<{ count: number }>();

  if ((transCount?.count || 0) > 0) {
    return c.json({ error: '该账户下存在交易流水记录，请先删除或转移相关流水后再删除该账户' }, 400);
  }

  const res = await c.env.DB.prepare(
    'DELETE FROM accounts WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该账户或无权删除' }, 404);
  }

  return c.json({ message: '账户已删除' });
});

