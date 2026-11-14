import { Hono } from 'hono';
import { Env, UserSession, Subscription, SubscriptionWithStats, SubscriptionsSummary, Transaction } from '../types';
import { requireAuth } from '../auth';

export const subscriptionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

subscriptionsRouter.use('*', requireAuth);

function diffInDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  const diffTime = end - start;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// 计算下一个扣费日 (支持月、季、年、周，并安全处理月末天数溢出)
export function computeNextBillingDate(currentDateStr: string, periodType: string, periodInterval: number = 1): string {
  const [year, month, day] = currentDateStr.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day));
  const interval = Math.max(1, periodInterval || 1);

  if (periodType === 'weekly') {
    nextDate.setUTCDate(nextDate.getUTCDate() + (7 * interval));
  } else if (periodType === 'monthly') {
    const targetMonth = nextDate.getUTCMonth() + interval;
    nextDate.setUTCMonth(targetMonth);
    // 月末天数溢出回退 (如 1月31日 + 1个月 -> 2月28日)
    const expectedMonth = (month - 1 + interval) % 12;
    if (nextDate.getUTCMonth() !== expectedMonth) {
      nextDate.setUTCDate(0);
    }
  } else if (periodType === 'quarterly') {
    const targetMonth = nextDate.getUTCMonth() + (3 * interval);
    nextDate.setUTCMonth(targetMonth);
  } else if (periodType === 'yearly') {
    nextDate.setUTCFullYear(nextDate.getUTCFullYear() + interval);
  }

  const y = nextDate.getUTCFullYear();
  const m = String(nextDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(nextDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function computeSubscriptionStats(sub: Subscription, todayStr: string): SubscriptionWithStats {
  const interval = Math.max(1, sub.period_interval || 1);
  let monthlyAmt = 0;

  if (sub.period_type === 'monthly') {
    monthlyAmt = Math.round(sub.amount / interval);
  } else if (sub.period_type === 'yearly') {
    monthlyAmt = Math.round(sub.amount / (12 * interval));
  } else if (sub.period_type === 'weekly') {
    monthlyAmt = Math.round((sub.amount * 52) / (12 * interval));
  } else if (sub.period_type === 'quarterly') {
    monthlyAmt = Math.round(sub.amount / (3 * interval));
  }

  const yearlyAmt = monthlyAmt * 12;
  const daysUntil = diffInDays(todayStr, sub.next_billing_date);

  let billingStatus: 'today' | 'upcoming' | 'overdue' | 'future' = 'future';
  if (daysUntil === 0) {
    billingStatus = 'today';
  } else if (daysUntil < 0) {
    billingStatus = 'overdue';
  } else if (daysUntil <= 7) {
    billingStatus = 'upcoming';
  }

  const isPending = sub.status === 'active' && sub.auto_record === 0 && sub.next_billing_date <= todayStr;

  return {
    ...sub,
    monthly_equivalent_amount: monthlyAmt,
    yearly_equivalent_amount: yearlyAmt,
    days_until_billing: daysUntil,
    billing_status: billingStatus,
    is_pending_confirmation: isPending,
  };
}

// 执行单笔扣款入账操作，并自动滚动下一次扣款日期
export async function processSingleSubscriptionBilling(
  db: D1Database,
  sub: Subscription,
  billingDateStr: string
): Promise<{ transaction_id: string; next_billing_date: string }> {
  const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const txTime = `${billingDateStr} 09:00:00`;

  // 获取有效扣款账户 (若无则取首个账户)
  let accountId = sub.account_id;
  if (!accountId) {
    const firstAcc = await db.prepare(
      'SELECT id FROM accounts WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1'
    ).bind(sub.user_id).first<{ id: string }>();
    accountId = firstAcc?.id || null;
  }

  // 插入记账支出流水
  await db.prepare(
    `INSERT INTO transactions (
      id, user_id, type, amount, account_id, category_id,
      transaction_time, remark, exclude_daily_cost, subscription_id, source
    ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, 0, ?, 'subscription')`
  ).bind(
    txId,
    sub.user_id,
    sub.amount,
    accountId,
    sub.category_id || null,
    txTime,
    `[周期扣费] ${sub.name}`,
    sub.id
  ).run();

  // 计算并更新下个扣款日
  const nextBilling = computeNextBillingDate(sub.next_billing_date, sub.period_type, sub.period_interval);
  await db.prepare(
    `UPDATE subscriptions
     SET next_billing_date = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(nextBilling, sub.id).run();

  return { transaction_id: txId, next_billing_date: nextBilling };
}

// 自动扫描并处理到期且开启自动记账的订阅 (Cron / 请求随路自动触发)
export async function processDueSubscriptions(db: D1Database, userId?: string): Promise<number> {
  const todayStr = new Date().toISOString().slice(0, 10);
  let sql = `
    SELECT * FROM subscriptions
    WHERE status = 'active'
      AND auto_record = 1
      AND next_billing_date <= ?
  `;
  const params: any[] = [todayStr];
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }

  const { results: dueSubs } = await db.prepare(sql).bind(...params).all<Subscription>();
  if (!dueSubs || dueSubs.length === 0) return 0;

  let count = 0;
  for (const sub of dueSubs) {
    try {
      await processSingleSubscriptionBilling(db, sub, sub.next_billing_date);
      count++;
    } catch (err) {
      console.error(`Failed to process auto subscription ${sub.id}:`, err);
    }
  }
  return count;
}

// 1. 获取订阅列表与汇总看板
subscriptionsRouter.get('/', async (c) => {
  const user = c.get('user');
  const statusParam = c.req.query('status') || 'active';
  const todayStr = new Date().toISOString().slice(0, 10);

  // 随路自愈：自动执行今日或以前到期且开启 auto_record 的订阅入账
  await processDueSubscriptions(c.env.DB, user.id);

  let sql = `
    SELECT 
      s.*,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      a.name AS account_name
    FROM subscriptions s
    LEFT JOIN categories c ON s.category_id = c.id
    LEFT JOIN accounts a ON s.account_id = a.id
    WHERE s.user_id = ?
  `;
  const params: any[] = [user.id];

  if (statusParam === 'active') {
    sql += " AND s.status = 'active'";
  } else if (statusParam === 'paused') {
    sql += " AND s.status = 'paused'";
  } else if (statusParam === 'cancelled') {
    sql += " AND s.status = 'cancelled'";
  }
  sql += ' ORDER BY s.status ASC, s.next_billing_date ASC, s.created_at DESC';

  const { results: rawSubs } = await c.env.DB.prepare(sql).bind(...params).all<Subscription>();
  const subscriptions = (rawSubs || []).map((sub) => computeSubscriptionStats(sub, todayStr));

  // 获取全部 active 订阅以计算全局汇总统计
  const allActiveQuery = await c.env.DB.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active'"
  ).bind(user.id).all<Subscription>();
  const allActiveStats = (allActiveQuery.results || []).map((sub) => computeSubscriptionStats(sub, todayStr));

  const monthlyTotal = allActiveStats.reduce((sum, s) => sum + s.monthly_equivalent_amount, 0);
  const yearlyTotal = allActiveStats.reduce((sum, s) => sum + s.yearly_equivalent_amount, 0);
  const upcoming7Days = allActiveStats.filter((s) => s.days_until_billing >= 0 && s.days_until_billing <= 7).length;
  const pendingConfirmation = allActiveStats.filter((s) => s.is_pending_confirmation).length;

  const summary: SubscriptionsSummary = {
    total_active_count: allActiveStats.length,
    monthly_total_cost: monthlyTotal,
    yearly_total_cost: yearlyTotal,
    upcoming_7_days_count: upcoming7Days,
    pending_confirmation_count: pendingConfirmation,
  };

  return c.json({ subscriptions, summary });
});

// 2. 获取单张订阅详情及扣费历史流水
subscriptionsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const todayStr = new Date().toISOString().slice(0, 10);

  const rawSub = await c.env.DB.prepare(
    `SELECT 
      s.*,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      a.name AS account_name
     FROM subscriptions s
     LEFT JOIN categories c ON s.category_id = c.id
     LEFT JOIN accounts a ON s.account_id = a.id
     WHERE s.id = ? AND s.user_id = ?`
  ).bind(id, user.id).first<Subscription>();

  if (!rawSub) {
    return c.json({ error: '未找到该订阅项目' }, 404);
  }

  const subscription = computeSubscriptionStats(rawSub, todayStr);

  // 查询该订阅关联的历史扣费流水
  const { results: history } = await c.env.DB.prepare(
    `SELECT t.*, a.name AS account_name
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.subscription_id = ? AND t.user_id = ?
     ORDER BY t.transaction_time DESC, t.created_at DESC`
  ).bind(id, user.id).all<Transaction>();

  return c.json({ subscription, history: history || [] });
});

// 3. 新建订阅
subscriptionsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const {
    name,
    category_id,
    account_id,
    amount,                     // 元或分
    currency = 'CNY',
    period_type = 'monthly',    // 'monthly' | 'yearly' | 'weekly' | 'quarterly'
    period_interval = 1,
    billing_day,
    first_billing_date,
    auto_record = 1,
    icon = 'calendar',
    color = '#3b82f6',
    remark,
    record_first_bill_now = false,
  } = body;

  if (!name || !name.trim()) {
    return c.json({ error: '订阅名称不能为空' }, 400);
  }

  const numAmount = Math.round(Number(amount) || 0);
  if (numAmount <= 0) {
    return c.json({ error: '每期扣款金额必须大于 0' }, 400);
  }

  const validTypes = ['monthly', 'yearly', 'weekly', 'quarterly'];
  if (!validTypes.includes(period_type)) {
    return c.json({ error: '周期类型无效' }, 400);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const firstDate = first_billing_date || todayStr;
  const subId = 'sub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const parsedDay = Number(billing_day) || Number(firstDate.slice(8, 10)) || 1;

  let nextBilling = firstDate;

  // 若选择立即记入首期账单
  let firstTxId: string | null = null;
  if (record_first_bill_now) {
    firstTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, user_id, type, amount, account_id, category_id,
        transaction_time, remark, exclude_daily_cost, subscription_id, source
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, 0, ?, 'subscription')`
    ).bind(
      firstTxId,
      user.id,
      numAmount,
      account_id || null,
      category_id || null,
      `${firstDate} 09:00:00`,
      `[周期扣费] ${name.trim()}`,
      subId
    ).run();

    // 下个扣款日自动后移一个周期
    nextBilling = computeNextBillingDate(firstDate, period_type, period_interval);
  }

  await c.env.DB.prepare(
    `INSERT INTO subscriptions (
      id, user_id, name, category_id, account_id, amount, currency,
      period_type, period_interval, billing_day, first_billing_date,
      next_billing_date, auto_record, status, icon, color, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(
    subId,
    user.id,
    name.trim(),
    category_id || null,
    account_id || null,
    numAmount,
    currency,
    period_type,
    Math.max(1, Number(period_interval) || 1),
    parsedDay,
    firstDate,
    nextBilling,
    auto_record ? 1 : 0,
    icon || 'calendar',
    color || '#3b82f6',
    remark?.trim() || null
  ).run();

  return c.json({ id: subId, message: '订阅创建成功', first_transaction_id: firstTxId }, 201);
});

// 4. 修改订阅
subscriptionsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();

  const {
    name,
    category_id,
    account_id,
    amount,
    currency,
    period_type,
    period_interval,
    billing_day,
    next_billing_date,
    auto_record,
    status,
    icon,
    color,
    remark,
  } = body;

  const existing = await c.env.DB.prepare(
    'SELECT id FROM subscriptions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();
  if (!existing) {
    return c.json({ error: '未找到该订阅' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE subscriptions
     SET name = COALESCE(?, name),
         category_id = ?,
         account_id = ?,
         amount = COALESCE(?, amount),
         currency = COALESCE(?, currency),
         period_type = COALESCE(?, period_type),
         period_interval = COALESCE(?, period_interval),
         billing_day = COALESCE(?, billing_day),
         next_billing_date = COALESCE(?, next_billing_date),
         auto_record = COALESCE(?, auto_record),
         status = COALESCE(?, status),
         icon = COALESCE(?, icon),
         color = COALESCE(?, color),
         remark = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(
    name?.trim() || null,
    category_id !== undefined ? (category_id || null) : null,
    account_id !== undefined ? (account_id || null) : null,
    amount !== undefined ? Math.round(Number(amount)) : null,
    currency || null,
    period_type || null,
    period_interval ? Math.max(1, Number(period_interval)) : null,
    billing_day ? Number(billing_day) : null,
    next_billing_date || null,
    auto_record !== undefined ? (auto_record ? 1 : 0) : null,
    status || null,
    icon || null,
    color || null,
    remark !== undefined ? (remark?.trim() || null) : null,
    id,
    user.id
  ).run();

  return c.json({ message: '修改成功' });
});

// 5. 删除订阅
subscriptionsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const existing = await c.env.DB.prepare(
    'SELECT id FROM subscriptions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first();
  if (!existing) {
    return c.json({ error: '未找到该订阅' }, 404);
  }

  // 解绑流水中的 subscription_id
  await c.env.DB.prepare('UPDATE transactions SET subscription_id = NULL WHERE subscription_id = ? AND user_id = ?')
    .bind(id, user.id).run();

  await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ? AND user_id = ?').bind(id, user.id).run();

  return c.json({ message: '订阅已删除' });
});

// 6. 立即入账一期 (供待确认打勾或提前续费)
subscriptionsRouter.post('/:id/bill-now', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const sub = await c.env.DB.prepare(
    'SELECT * FROM subscriptions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first<Subscription>();
  if (!sub) {
    return c.json({ error: '未找到该订阅' }, 404);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const billingDate = sub.next_billing_date <= todayStr ? sub.next_billing_date : todayStr;

  const res = await processSingleSubscriptionBilling(c.env.DB, sub, billingDate);

  return c.json({
    message: `已为「${sub.name}」成功记入一期扣款，下次扣款日更新为 ${res.next_billing_date}`,
    ...res,
  });
});

// 7. 切换暂停/恢复状态
subscriptionsRouter.post('/:id/toggle-pause', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const sub = await c.env.DB.prepare(
    'SELECT id, status, name FROM subscriptions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first<{ id: string; status: string; name: string }>();
  if (!sub) {
    return c.json({ error: '未找到该订阅' }, 404);
  }

  const newStatus = sub.status === 'paused' ? 'active' : 'paused';
  await c.env.DB.prepare(
    'UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?'
  ).bind(newStatus, id, user.id).run();

  return c.json({
    message: newStatus === 'paused' ? `已暂停「${sub.name}」` : `已恢复「${sub.name}」`,
    status: newStatus,
  });
});
