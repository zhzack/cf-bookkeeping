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

export type StatsPeriod = 'week' | 'month' | 'year';

interface PeriodEvalRange {
  period: StatsPeriod;
  anchor: string;
  prevAnchor: string;
  periodLabel: string;
  periodStart: string;
  periodLastDay: string;
  evalEnd: string;
  elapsedDays: number;
  totalDays: number;
  isCurrent: boolean;
  isFuture: boolean;
}

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function getPeriodEvalRange(period: StatsPeriod, rawAnchor: string | undefined, todayStr: string): PeriodEvalRange {
  if (period === 'week') {
    const baseDate =
      rawAnchor && /^\d{4}-\d{2}-\d{2}$/.test(rawAnchor)
        ? rawAnchor
        : rawAnchor && /^\d{4}-\d{2}$/.test(rawAnchor)
        ? `${rawAnchor}-01`
        : todayStr;
    const dow = new Date(parseDateUTC(baseDate)).getUTCDay();
    const offsetFromMon = dow === 0 ? 6 : dow - 1;
    const periodStart = addDaysStr(baseDate, -offsetFromMon);
    const periodLastDay = addDaysStr(periodStart, 6);
    const isCurrent = todayStr >= periodStart && todayStr <= periodLastDay;
    const isFuture = periodStart > todayStr;
    const elapsedDays = isCurrent ? Math.max(1, diffDaysInclusive(periodStart, todayStr)) : 7;

    return {
      period: 'week',
      anchor: periodStart,
      prevAnchor: addDaysStr(periodStart, -7),
      periodLabel: `${periodStart.slice(5).replace('-', '/')} ~ ${periodLastDay.slice(5).replace('-', '/')} 周`,
      periodStart,
      periodLastDay,
      evalEnd: isCurrent ? todayStr : periodLastDay,
      elapsedDays,
      totalDays: 7,
      isCurrent,
      isFuture,
    };
  }

  if (period === 'year') {
    const yearStr =
      rawAnchor && /^\d{4}/.test(rawAnchor) ? rawAnchor.slice(0, 4) : todayStr.slice(0, 4);
    const periodStart = `${yearStr}-01-01`;
    const periodLastDay = `${yearStr}-12-31`;
    const currentYear = todayStr.slice(0, 4);
    const isCurrent = yearStr === currentYear;
    const isFuture = yearStr > currentYear;
    const totalDays = diffDaysInclusive(periodStart, periodLastDay);
    const elapsedDays = isCurrent ? Math.max(1, diffDaysInclusive(periodStart, todayStr)) : totalDays;

    return {
      period: 'year',
      anchor: yearStr,
      prevAnchor: String(Number(yearStr) - 1),
      periodLabel: `${yearStr} 年`,
      periodStart,
      periodLastDay,
      evalEnd: isCurrent ? todayStr : periodLastDay,
      elapsedDays,
      totalDays,
      isCurrent,
      isFuture,
    };
  }

  // 默认按月统计
  const monthStr =
    rawAnchor && /^\d{4}-\d{2}/.test(rawAnchor) ? rawAnchor.slice(0, 7) : todayStr.slice(0, 7);
  const [y, m] = monthStr.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const periodStart = `${monthStr}-01`;
  const periodLastDay = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`;
  const currentMonthStr = todayStr.slice(0, 7);
  const isCurrent = monthStr === currentMonthStr;
  const isFuture = monthStr > currentMonthStr;
  const elapsedDays = isCurrent ? Math.max(1, Number(todayStr.slice(8, 10))) : daysInMonth;

  return {
    period: 'month',
    anchor: monthStr,
    prevAnchor: getPrevMonth(monthStr),
    periodLabel: `${y} 年 ${String(m).padStart(2, '0')} 月`,
    periodStart,
    periodLastDay,
    evalEnd: isCurrent ? todayStr : periodLastDay,
    elapsedDays,
    totalDays: daysInMonth,
    isCurrent,
    isFuture,
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

function computeDailyCostForRange(params: {
  range: PeriodEvalRange;
  todayStr: string;
  amortizedTxs: AmortizedTxRow[];
  plainExpenses: PlainExpenseRow[];
  items: Item[];
  expensesByItem: Record<string, ItemExpense[]>;
}) {
  const { range, todayStr, amortizedTxs, plainExpenses, items, expensesByItem } = params;

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
    const overlapStart = startDate > range.periodStart ? startDate : range.periodStart;
    const overlapEnd = endDate < range.evalEnd ? endDate : range.evalEnd;

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
  if (!range.isFuture) {
    for (const exp of plainExpenses) {
      if (exp.day >= range.periodStart && exp.day <= range.evalEnd) {
        if (exp.exclude_daily_cost) {
          excludedExpenseTotal += exp.amount;
        } else {
          variableExpenseTotal += exp.amount;
        }
      }
    }
  }

  const variableDailyCost = !range.isFuture && range.elapsedDays > 0
    ? Math.round(variableExpenseTotal / range.elapsedDays)
    : 0;

  // 3. 持物大件日均摊薄
  let itemDailyCostFloat = 0;
  let activeItemCount = 0;

  if (!range.isFuture) {
    for (const item of items) {
      if (item.status === 'wishlist' || item.status === 'idle') continue;
      if (item.purchase_date > range.evalEnd) continue;

      const isActiveInPeriod = range.isCurrent
        ? item.status === 'using'
        : item.status === 'using' ||
          ((item.status === 'retired' || item.status === 'sold') &&
            Boolean(item.retired_date && item.retired_date > range.evalEnd));

      if (!isActiveInPeriod) continue;

      activeItemCount++;
      const itemExps = expensesByItem[item.id] || [];
      const additionalCost = itemExps
        .filter((e) => e.date <= range.evalEnd)
        .reduce((sum, e) => sum + e.amount, 0);

      const daysUsed = Math.max(1, diffDays(item.purchase_date, range.evalEnd));
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
  const periodParam = c.req.query('period');
  const period: StatsPeriod =
    periodParam === 'week' || periodParam === 'year' || periodParam === 'month' ? periodParam : 'month';
  const anchorParam = c.req.query('date') || c.req.query('month');

  const currRange = getPeriodEvalRange(period, anchorParam, todayStr);
  const prevRange = getPeriodEvalRange(period, currRange.prevAnchor, todayStr);
  const startTime = `${currRange.periodStart} 00:00:00`;
  const endTime = `${currRange.periodLastDay} 23:59:59`;

  // 1. 各账户当前余额计算（多币种折算基准货币 CNY 资产与净资产）
  const accountsSql = `
    SELECT 
      a.id,
      a.name,
      a.type,
      COALESCE(a.currency, 'CNY') AS currency,
      COALESCE(cr.rate_to_cny, 1.0) AS rate_to_cny,
      (
        a.initial_balance 
        + COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = a.id), 0)
        + COALESCE((SELECT SUM(COALESCE(t.target_amount, t.amount)) FROM transactions t WHERE t.destination_account_id = a.id AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'transfer'), 0)
      ) AS balance
    FROM accounts a
    LEFT JOIN currency_rates cr ON cr.code = COALESCE(a.currency, 'CNY')
    WHERE a.user_id = ?
  `;
  const { results: accountBalances } = await c.env.DB.prepare(accountsSql).bind(user.id).all<{
    id: string;
    name: string;
    type: string;
    currency: string;
    rate_to_cny: number;
    balance: number;
  }>();

  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accountBalances || []) {
    const rate = acc.rate_to_cny || 1.0;
    const cnyBalance = Math.round(acc.balance * rate);
    if (cnyBalance >= 0) {
      totalAssets += cnyBalance;
    } else {
      totalLiabilities += Math.abs(cnyBalance);
    }
  }

  const netWorth = totalAssets - totalLiabilities;

  // 2. 所选周期（周/月/年）总收支
  const periodSumSql = `
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS period_expense,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS period_income
    FROM transactions
    WHERE user_id = ? AND transaction_time >= ? AND transaction_time <= ?
  `;
  const periodSummary = await c.env.DB.prepare(periodSumSql).bind(user.id, startTime, endTime).first<{
    period_expense: number;
    period_income: number;
  }>();

  const periodExpense = periodSummary?.period_expense || 0;
  const periodIncome = periodSummary?.period_income || 0;
  const periodSurplus = periodIncome - periodExpense;

  // 3. 所选周期支出分类占比（兼容未关联分类记录）
  const categoryBreakdownSql = `
    SELECT 
      COALESCE(c.id, '__uncategorized__') AS id,
      COALESCE(c.name, '未分类') AS name,
      COALESCE(c.icon, 'HelpCircle') AS icon,
      COALESCE(c.color, '#94a3b8') AS color,
      SUM(t.amount) as total_amount,
      COUNT(t.id) as count
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.transaction_time >= ? AND t.transaction_time <= ?
    GROUP BY COALESCE(c.id, '__uncategorized__')
    ORDER BY total_amount DESC
  `;
  const { results: rawCategoryBreakdown } = await c.env.DB.prepare(categoryBreakdownSql)
    .bind(user.id, startTime, endTime)
    .all<{
      id: string;
      name: string;
      icon: string;
      color: string;
      total_amount: number;
      count: number;
    }>();

  const categoryBreakdown = rawCategoryBreakdown.map((item) => ({
    ...item,
    percentage: periodExpense > 0 ? Math.round((item.total_amount / periodExpense) * 1000) / 10 : 0,
  }));

  // 3b. 所选周期消费场景分布
  const sceneBreakdownSql = `
    SELECT
      TRIM(scene) AS scene,
      SUM(amount) AS total_amount,
      COUNT(id) AS count
    FROM transactions
    WHERE user_id = ? AND type = 'expense'
      AND transaction_time >= ? AND transaction_time <= ?
      AND scene IS NOT NULL AND TRIM(scene) != ''
    GROUP BY TRIM(scene)
    ORDER BY total_amount DESC
  `;
  const { results: rawSceneBreakdown } = await c.env.DB.prepare(sceneBreakdownSql)
    .bind(user.id, startTime, endTime)
    .all<{ scene: string; total_amount: number; count: number }>();

  const sceneBreakdown = rawSceneBreakdown.map((item) => ({
    ...item,
    percentage: periodExpense > 0 ? Math.round((item.total_amount / periodExpense) * 1000) / 10 : 0,
  }));

  // 4. 支出趋势（周/月按天补齐 0 值；年按 1~12 月补齐 0 值）
  const trendUnit: 'day' | 'month' = period === 'year' ? 'month' : 'day';
  const trendSql =
    trendUnit === 'month'
      ? `
        SELECT
          SUBSTR(transaction_time, 1, 7) AS bucket,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income
        FROM transactions
        WHERE user_id = ? AND transaction_time >= ? AND transaction_time <= ?
        GROUP BY SUBSTR(transaction_time, 1, 7)
        ORDER BY bucket ASC
      `
      : `
        SELECT
          SUBSTR(transaction_time, 1, 10) AS bucket,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income
        FROM transactions
        WHERE user_id = ? AND transaction_time >= ? AND transaction_time <= ?
        GROUP BY SUBSTR(transaction_time, 1, 10)
        ORDER BY bucket ASC
      `;

  const { results: rawTrend } = await c.env.DB.prepare(trendSql)
    .bind(user.id, startTime, endTime)
    .all<{ bucket: string; expense: number; income: number }>();

  const bucketMap = new Map(rawTrend.map((r) => [r.bucket, r]));
  const trend: Array<{ key: string; label: string; expense: number; income: number }> = [];
  const dailyTrend: Array<{ day: string; expense: number; income: number }> = [];

  if (trendUnit === 'month') {
    const yearStr = currRange.anchor;
    for (let m = 1; m <= 12; m++) {
      const key = `${yearStr}-${String(m).padStart(2, '0')}`;
      const hit = bucketMap.get(key);
      trend.push({
        key,
        label: `${m}月`,
        expense: hit?.expense || 0,
        income: hit?.income || 0,
      });
    }
  } else {
    let cursor = currRange.periodStart;
    while (cursor <= currRange.periodLastDay) {
      const hit = bucketMap.get(cursor);
      const expense = hit?.expense || 0;
      const income = hit?.income || 0;
      const dow = new Date(parseDateUTC(cursor)).getUTCDay();
      const label = period === 'week' ? `${WEEKDAY_NAMES[dow]}` : cursor.slice(8, 10);
      trend.push({ key: cursor, label, expense, income });
      dailyTrend.push({ day: cursor, expense, income });
      cursor = addDaysStr(cursor, 1);
    }
  }

  // 5. 每日生活成本（固定开销摊销 + 日常流水 + 大件摊薄 + 环比上一周期）
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
      AND transaction_time >= ?
      AND transaction_time <= ?
  `;

  const plainQueryStart = `${prevRange.periodStart} 00:00:00`;
  const plainQueryEnd = `${currRange.periodLastDay} 23:59:59`;

  const [amortizedRes, plainExpRes, itemsRes, itemExpRes] = await Promise.all([
    c.env.DB.prepare(amortizedSql).bind(user.id).all<AmortizedTxRow>(),
    c.env.DB.prepare(plainExpenseSql).bind(user.id, plainQueryStart, plainQueryEnd).all<PlainExpenseRow>(),
    c.env.DB.prepare('SELECT * FROM items WHERE user_id = ?').bind(user.id).all<Item>(),
    c.env.DB.prepare('SELECT * FROM item_expenses WHERE user_id = ?').bind(user.id).all<ItemExpense>(),
  ]);

  const expensesByItem: Record<string, ItemExpense[]> = {};
  for (const exp of itemExpRes.results) {
    if (!expensesByItem[exp.item_id]) expensesByItem[exp.item_id] = [];
    expensesByItem[exp.item_id].push(exp);
  }

  const currCost = computeDailyCostForRange({
    range: currRange,
    todayStr,
    amortizedTxs: amortizedRes.results,
    plainExpenses: plainExpRes.results,
    items: itemsRes.results,
    expensesByItem,
  });

  const prevCost = computeDailyCostForRange({
    range: prevRange,
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
    period,
    anchor: currRange.anchor,
    period_label: currRange.periodLabel,
    period_start: currRange.periodStart,
    period_end: currRange.periodLastDay,
    month: currRange.periodStart.slice(0, 7),
    assets: {
      total_assets: totalAssets,
      total_liabilities: totalLiabilities,
      net_worth: netWorth,
    },
    month_summary: {
      expense: periodExpense,
      income: periodIncome,
      surplus: periodSurplus,
    },
    category_breakdown: categoryBreakdown,
    scene_breakdown: sceneBreakdown,
    trend_unit: trendUnit,
    trend,
    daily_trend: dailyTrend,
    daily_cost: {
      total_daily_cost: currCost.totalDailyCost,
      amortized_daily_cost: currCost.amortizedDailyCost,
      variable_daily_cost: currCost.variableDailyCost,
      item_daily_cost: currCost.itemDailyCost,
      elapsed_days: currCost.range.elapsedDays,
      days_in_month: currCost.range.totalDays,
      month_start: currCost.range.periodStart,
      month_end: currCost.range.evalEnd,
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

