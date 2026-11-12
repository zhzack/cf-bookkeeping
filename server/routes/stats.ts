import { Hono } from 'hono';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';

export const statsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

statsRouter.use('*', requireAuth);

statsRouter.get('/overview', async (c) => {
  const user = c.get('user');
  const now = new Date();
  const currentMonth = c.req.query('month') || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // 1. 各账户当前余额计算
  const accountsSql = `
    SELECT 
      a.id,
      a.name,
      a.type,
      (
        a.initial_balance 
        + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = a.id), 0)
        + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.destination_account_id = a.id AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'transfer'), 0)
      ) AS balance
    FROM accounts a
    WHERE a.user_id = ?
  `;
  const { results: accountBalances } = await c.env.DB.prepare(accountsSql).bind(user.id).all<{ id: string; name: string; type: string; balance: number }>();

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accountBalances) {
    if (acc.balance >= 0) {
      totalAssets += acc.balance;
    } else {
      totalLiabilities += Math.abs(acc.balance);
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  // 2. 本月总收支
  const monthSumSql = `
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS month_expense,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS month_income
    FROM transactions
    WHERE user_id = ? AND transaction_time LIKE ?
  `;
  const monthSummary = await c.env.DB.prepare(monthSumSql).bind(user.id, `${currentMonth}%`).first<{
    month_expense: number;
    month_income: number;
  }>();

  const monthExpense = monthSummary?.month_expense || 0;
  const monthIncome = monthSummary?.month_income || 0;
  const monthSurplus = monthIncome - monthExpense;

  // 3. 本月支出分类占比
  const categoryBreakdownSql = `
    SELECT 
      c.id,
      c.name,
      c.icon,
      c.color,
      SUM(t.amount) as total_amount,
      COUNT(t.id) as count
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.transaction_time LIKE ?
    GROUP BY c.id
    ORDER BY total_amount DESC
  `;
  const { results: rawCategoryBreakdown } = await c.env.DB.prepare(categoryBreakdownSql).bind(user.id, `${currentMonth}%`).all<{
    id: string;
    name: string;
    icon: string;
    color: string;
    total_amount: number;
    count: number;
  }>();

  const categoryBreakdown = rawCategoryBreakdown.map((item) => ({
    ...item,
    percentage: monthExpense > 0 ? Math.round((item.total_amount / monthExpense) * 1000) / 10 : 0,
  }));

  // 4. 每日支出趋势 (当月按天统计)
  const dailyTrendSql = `
    SELECT 
      SUBSTR(transaction_time, 1, 10) as day,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as expense,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as income
    FROM transactions
    WHERE user_id = ? AND transaction_time LIKE ?
    GROUP BY SUBSTR(transaction_time, 1, 10)
    ORDER BY day ASC
  `;
  const { results: dailyTrend } = await c.env.DB.prepare(dailyTrendSql).bind(user.id, `${currentMonth}%`).all<{
    day: string;
    expense: number;
    income: number;
  }>();

  return c.json({
    month: currentMonth,
    assets: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth,
    },
    month_summary: {
      expense: monthExpense,
      income: monthIncome,
      surplus: monthSurplus,
    },
    category_breakdown: categoryBreakdown,
    daily_trend: dailyTrend,
  });
});

