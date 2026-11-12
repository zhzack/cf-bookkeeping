import { Hono } from 'hono';
import { Env, UserSession, Transaction } from '../types';
import { requireAuth } from '../auth';

export const transactionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

transactionsRouter.use('*', requireAuth);

// 查询流水列表
transactionsRouter.get('/', async (c) => {
  const user = c.get('user');
  const month = c.req.query('month'); // YYYY-MM
  const accountId = c.req.query('account_id');
  const categoryId = c.req.query('category_id');
  const type = c.req.query('type');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const offset = Number(c.req.query('offset')) || 0;

  let whereClause = 'WHERE t.user_id = ?';
  const params: any[] = [user.id];

  if (month) {
    whereClause += ' AND t.transaction_time LIKE ?';
    params.push(`${month}%`);
  }

  if (accountId) {
    whereClause += ' AND (t.account_id = ? OR t.destination_account_id = ?)';
    params.push(accountId, accountId);
  }

  if (categoryId) {
    whereClause += ' AND t.category_id = ?';
    params.push(categoryId);
  }

  if (type) {
    whereClause += ' AND t.type = ?';
    params.push(type);
  }

  const querySql = `
    SELECT 
      t.id,
      t.user_id,
      t.type,
      t.amount,
      t.account_id,
      t.destination_account_id,
      t.category_id,
      t.transaction_time,
      t.remark,
      t.created_at,
      a.name AS account_name,
      da.name AS destination_account_name,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN accounts da ON t.destination_account_id = da.id
    LEFT JOIN categories c ON t.category_id = c.id
    ${whereClause}
    ORDER BY t.transaction_time DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await c.env.DB.prepare(querySql).bind(...params, limit, offset).all<Transaction>();

  // 统计当前筛选条件下的总收支
  const sumSql = `
    SELECT 
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(COUNT(*), 0) AS total_count
    FROM transactions t
    ${whereClause}
  `;

  const summary = await c.env.DB.prepare(sumSql).bind(...params).first<{
    total_expense: number;
    total_income: number;
    total_count: number;
  }>();

  return c.json({
    transactions: results,
    summary: {
      total_expense: summary?.total_expense || 0,
      total_income: summary?.total_income || 0,
      total_count: summary?.total_count || 0,
      balance: (summary?.total_income || 0) - (summary?.total_expense || 0),
    },
  });
});

// 新增一条流水
transactionsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { type, amount, account_id, destination_account_id, category_id, transaction_time, remark } = body;

  if (!type || !['expense', 'income', 'transfer'].includes(type)) {
    return c.json({ error: '交易类型无效' }, 400);
  }

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '金额必须是大于 0 的数字' }, 400);
  }

  if (!account_id) {
    return c.json({ error: '请选择关联账户' }, 400);
  }

  // 验证账户属于当前用户
  const acc = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ?'
  ).bind(account_id, user.id).first();
  if (!acc) {
    return c.json({ error: '源账户不存在或无权限' }, 400);
  }

  if (type === 'transfer') {
    if (!destination_account_id) {
      return c.json({ error: '转账必须选择转入账户' }, 400);
    }
    if (destination_account_id === account_id) {
      return c.json({ error: '转入账户不能与转出账户相同' }, 400);
    }
    const destAcc = await c.env.DB.prepare(
      'SELECT id FROM accounts WHERE id = ? AND user_id = ?'
    ).bind(destination_account_id, user.id).first();
    if (!destAcc) {
      return c.json({ error: '转入账户不存在或无权限' }, 400);
    }
  }

  const id = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const time = transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19);

  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? category_id : null,
    time,
    remark?.trim() || null
  ).run();

  return c.json({ id, message: '记账成功' });
});

// 修改流水
transactionsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { type, amount, account_id, destination_account_id, category_id, transaction_time, remark } = body;

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '金额必须是大于 0 的数字' }, 400);
  }

  const res = await c.env.DB.prepare(
    `UPDATE transactions 
     SET type = ?, amount = ?, account_id = ?, destination_account_id = ?, category_id = ?, transaction_time = ?, remark = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? category_id : null,
    transaction_time,
    remark?.trim() || null,
    id,
    user.id
  ).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权修改' }, 404);
  }

  return c.json({ message: '修改成功' });
});

// 删除流水
transactionsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const res = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权删除' }, 404);
  }

  return c.json({ message: '删除成功' });
});

