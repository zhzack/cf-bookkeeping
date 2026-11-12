import { Hono } from 'hono';
import { Env, UserSession, Item, ItemExpense } from '../types';
import { requireAuth } from '../auth';

export const statsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

statsRouter.use('*', requireAuth);

const MS_PER_DAY = 86400000;

function getTodayUTC8(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function parseDateUTC(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatDateUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function addDaysStr(dateStr: string, days: number): string {
  return formatDateUTC(parseDateUTC(dateStr) + days * MS_PER_DAY);
}

function diffDays(startStr: string, endStr: string): number {
  return Math.max(0, Math.floor((parseDateUTC(endStr) - parseDateUTC(startStr)) / MS_PER_DAY));
}

function diffDaysInclusive(startStr: string, endStr: string): number {
  return Math.floor((parseDateUTC(endStr) - parseDateUTC(startStr)) / MS_PER_DAY) + 1;
}

function getPrevMonth(monthStr: string): string {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getMonthEvalRange(monthStr: string, todayStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthStart = `${monthStr}-01`;
  const monthLastDay = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
  const currentMonthStr = todayStr.slice(0, 7);

  if (monthStr === currentMonthStr) {
    return {
      monthStart,
      monthEnd: todayStr,
      elapsedDays: Math.max(1, Number(todayStr.slice(8, 10))),
      daysInMonth,
      isCurrentMonth: true,
      isFutureMonth: false,
    };
  }

  return {
    monthStart,
    monthEnd: monthLastDay,
    elapsedDays: daysInMonth,
    daysInMonth,
    isCurrentMonth: false,
    isFutureMonth: monthStr > currentMonthStr,
  };
}

interface AmortizedTxRow {
  id: string;
  amount: number;
  transaction_time: string;
  remark: string | null;
  amortize_days: number;
  amortize_start_date: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
}

interface PlainExpenseRow {
  amount: number;
  day: string;
  exclude_daily_cost: number;
}

function computeDailyCostForMonth(params: {
  monthStr: string;
  todayStr: string;
  amortizedTxs: AmortizedTxRow[];
  plainExpenses: PlainExpenseRow[];
  items: Item[];
  expensesByItem: Record<string, ItemExpense[]>;
}) {
  const { monthStr, todayStr, amortizedTxs, plainExpenses, items, expensesByItem } = params;
  const range = getMonthEvalRange(monthStr, todayStr);

  // 1. 固定开销摊销
  let amortizedMonthTotalFloat = 0;
  const amortizedItems: Array<{
    id: string;
    remark: string | null;
    category_name: string | null;
    category_icon: string | null;
    category_color: string | null;
    total_amount: number;
    amortize_days: number;
    start_date: string;
    end_date: string;
    daily_amount: number;
    overlap_days: number;
    month_amount: number;
    remaining_days: number;
  }> = [];

  for (const tx of amortizedTxs) {
    const startDate = tx.amortize_start_date || tx.transaction_time.slice(0, 10);
    const endDate = addDaysStr(startDate, tx.amortize_days - 1);
    const overlapStart = startDate > range.monthStart ? startDate : range.monthStart;
    const overlapEnd = endDate < range.monthEnd ? endDate : range.monthEnd;

    if (overlapStart <= overlapEnd) {
      const overlapDays = diffDaysInclusive(overlapStart, overlapEnd);
      const dailyFloat = tx.amount / tx.amortize_days;
      const monthAmountFloat = dailyFloat * overlapDays;
      amortizedMonthTotalFloat += monthAmountFloat;

      const remainingDays = todayStr <= endDate
        ? diffDaysInclusive(todayStr > startDate ? todayStr : startDate, endDate)
        : 0;

      amortizedItems.push({
        id: tx.id,
        remark: tx.remark,
        category_name: tx.category_name,
        category_icon: tx.category_icon,
        category_color: tx.category_color,
        total_amount: tx.amount,
        amortize_days: tx.amortize_days,
        start_date: startDate,
        end_date: endDate,
        daily_amount: Math.round(dailyFloat),
        overlap_days: overlapDays,
        month_amount: Math.round(monthAmountFloat),
        remaining_days: remainingDays,
      });
    }
  }

  const amortizedMonthTotal = Math.round(amortizedMonthTotalFloat);
  const amortizedDailyCost = range.elapsedDays > 0
    ? Math.round(amortizedMonthTotalFloat / range.elapsedDays)
    : 0;

  // 2. 日常流水消费（排除已分摊流水与大件同步流水）
  let variableExpenseTotal = 0;
  let excludedExpenseTotal = 0;
  if (!range.isFutureMonth) {
    for (const exp of plainExpenses) {
      if (exp.day >= range.monthStart && exp.day <= range.monthEnd) {
        if (exp.exclude_daily_cost) {
          excludedExpenseTotal += exp.amount;
        } else {
          variableExpenseTotal += exp.amount;
        }
      }
    }
  }

  const variableDailyCost = !range.isFutureMonth && range.elapsedDays > 0
    ? Math.round(variableExpenseTotal / range.elapsedDays)
    : 0;

  // 3. 持物大件日均摊薄
  let itemDailyCostFloat = 0;
  let activeItemCount = 0;

  if (!range.isFutureMonth) {
    for (const item of items) {
      if (item.status === 'wishlist' || item.status === 'idle') continue;
      if (item.purchase_date > range.monthEnd) continue;

      const isActiveInMonth = range.isCurrentMonth
        ? item.status === 'using'
        : item.status === 'using' ||
          ((item.status === 'retired' || item.status === 'sold') &&
            Boolean(item.retired_date && item.retired_date > range.monthEnd));

      if (!isActiveInMonth) continue;

      activeItemCount++;
      const itemExps = expensesByItem[item.id] || [];
      const additionalCost = itemExps
        .filter((e) => e.date <= range.monthEnd)
        .reduce((sum, e) => sum + e.amount, 0);

      const daysUsed = Math.max(1, diffDays(item.purchase_date, range.monthEnd));
      const netCost = Math.max(0, item.price + additionalCost - (item.resale_price || 0));
      const costPerDay = Math.round((netCost / daysUsed) * 100) / 100;
      itemDailyCostFloat += costPerDay;
    }
  }

  const itemDailyCost = Math.round(itemDailyCostFloat);
  const totalDailyCost = amortizedDailyCost + variableDailyCost + itemDailyCost;

  return {
    range,
    totalDailyCost,
    amortizedDailyCost,
    variableDailyCost,
    itemDailyCost,
    variableExpenseTotal,
    amortizedMonthTotal,
    excludedExpenseTotal,
    activeItemCount,
    amortizedItems,
  };
}

statsRouter.get('/overview', async (c) => {
  const user = c.get('user');
  const todayParam = c.req.query('today');
  const todayStr = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : getTodayUTC8();
  const monthParam = c.req.query('month');
  const currentMonth = monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : todayStr.slice(0, 7);
  const prevMonth = getPrevMonth(currentMonth);

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

  // 5. 每日生活成本（固定开销摊销 + 日常流水 + 大件摊薄 + 环比上月）
  const amortizedSql = `
    SELECT
      t.id,
      t.amount,
      t.transaction_time,
      t.remark,
      t.amortize_days,
      t.amortize_start_date,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ?
      AND t.type = 'expense'
      AND t.amortize_days > 1
      AND COALESCE(t.exclude_daily_cost, 0) = 0
    ORDER BY t.transaction_time DESC
  `;

  const plainExpenseSql = `
    SELECT
      amount,
      SUBSTR(transaction_time, 1, 10) AS day,
      COALESCE(exclude_daily_cost, 0) AS exclude_daily_cost
    FROM transactions
    WHERE user_id = ?
      AND type = 'expense'
      AND (amortize_days IS NULL OR amortize_days <= 1)
      AND (transaction_time LIKE ? OR transaction_time LIKE ?)
  `;

  const [amortizedRes, plainExpRes, itemsRes, itemExpRes] = await Promise.all([
    c.env.DB.prepare(amortizedSql).bind(user.id).all<AmortizedTxRow>(),
    c.env.DB.prepare(plainExpenseSql).bind(user.id, `${currentMonth}%`, `${prevMonth}%`).all<PlainExpenseRow>(),
    c.env.DB.prepare('SELECT * FROM items WHERE user_id = ?').bind(user.id).all<Item>(),
    c.env.DB.prepare('SELECT * FROM item_expenses WHERE user_id = ?').bind(user.id).all<ItemExpense>(),
  ]);

  const expensesByItem: Record<string, ItemExpense[]> = {};
  for (const exp of itemExpRes.results) {
    if (!expensesByItem[exp.item_id]) expensesByItem[exp.item_id] = [];
    expensesByItem[exp.item_id].push(exp);
  }

  const currCost = computeDailyCostForMonth({
    monthStr: currentMonth,
    todayStr,
    amortizedTxs: amortizedRes.results,
    plainExpenses: plainExpRes.results,
    items: itemsRes.results,
    expensesByItem,
  });

  const prevCost = computeDailyCostForMonth({
    monthStr: prevMonth,
    todayStr,
    amortizedTxs: amortizedRes.results,
    plainExpenses: plainExpRes.results,
    items: itemsRes.results,
    expensesByItem,
  });

  const momDiff = currCost.totalDailyCost - prevCost.totalDailyCost;
  const momPercent = prevCost.totalDailyCost > 0
    ? Math.round((momDiff / prevCost.totalDailyCost) * 1000) / 10
    : null;

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
    daily_cost: {
      total_daily_cost: currCost.totalDailyCost,
      amortized_daily_cost: currCost.amortizedDailyCost,
      variable_daily_cost: currCost.variableDailyCost,
      item_daily_cost: currCost.itemDailyCost,
      elapsed_days: currCost.range.elapsedDays,
      days_in_month: currCost.range.daysInMonth,
      month_start: currCost.range.monthStart,
      month_end: currCost.range.monthEnd,
      variable_expense_total: currCost.variableExpenseTotal,
      amortized_month_total: currCost.amortizedMonthTotal,
      excluded_expense_total: currCost.excludedExpenseTotal,
      active_item_count: currCost.activeItemCount,
      prev_total_daily_cost: prevCost.totalDailyCost,
      mom_diff: momDiff,
      mom_percent: momPercent,
      amortized_items: currCost.amortizedItems,
    },
  });
});

