import { Hono } from 'hono';
import { Env, UserSession, BudgetStatusResponse, BudgetOverview, CategoryBudgetDetail } from '../types';
import { requireAuth } from '../auth';

export const budgetsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

budgetsRouter.use('*', requireAuth);

function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getLocalTodayStr(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

// 查询指定月份的预算状况与超支指标
budgetsRouter.get('/', async (c) => {
  const user = c.get('user');
  const todayStr = getLocalTodayStr();
  const currentMonthStr = todayStr.slice(0, 7);

  const reqMonth = c.req.query('month');
  const targetMonth = reqMonth && /^\d{4}-\d{2}$/.test(reqMonth) ? reqMonth : currentMonthStr;

  const [year, month] = targetMonth.split('-').map(Number);
  const daysInMonth = getDaysInMonth(year, month);
  const startTime = `${targetMonth}-01 00:00:00`;
  const endTime = `${targetMonth}-${String(daysInMonth).padStart(2, '0')} 23:59:59`;

  const isCurrentMonth = targetMonth === currentMonthStr;
  const isPastMonth = targetMonth < currentMonthStr;
  const dayOfMonth = isCurrentMonth ? Number(todayStr.slice(8, 10)) : isPastMonth ? daysInMonth : 0;
  const daysRemaining = isCurrentMonth ? Math.max(1, daysInMonth - dayOfMonth + 1) : isPastMonth ? 0 : daysInMonth;

  // 1. 获取当月与默认基准预算配置
  const budgetsSql = `
    SELECT id, month, category_id, amount, alert_threshold
    FROM budgets
    WHERE user_id = ? AND (month = ? OR month = 'default')
  `;
  const { results: rawBudgets } = await c.env.DB.prepare(budgetsSql)
    .bind(user.id, targetMonth)
    .all<{
      id: string;
      month: string;
      category_id: string | null;
      amount: number;
      alert_threshold: number;
    }>();

  // 分类预算字典与总预算字典（优先使用当月单独配置，否则降级回退到 default 模板）
  let overallBudgetRow = rawBudgets.find((b) => b.month === targetMonth && !b.category_id);
  let isDefaultTemplate = false;
  if (!overallBudgetRow) {
    overallBudgetRow = rawBudgets.find((b) => b.month === 'default' && !b.category_id);
    if (overallBudgetRow) isDefaultTemplate = true;
  }

  const categoryBudgetMap = new Map<string, { id: string; amount: number; alert_threshold: number; is_custom: boolean }>();
  // 先载入 default 模板
  for (const b of rawBudgets) {
    if (b.month === 'default' && b.category_id) {
      categoryBudgetMap.set(b.category_id, {
        id: b.id,
        amount: b.amount,
        alert_threshold: b.alert_threshold || 80,
        is_custom: false,
      });
    }
  }
  // 用当月特定月份覆盖
  for (const b of rawBudgets) {
    if (b.month === targetMonth && b.category_id) {
      categoryBudgetMap.set(b.category_id, {
        id: b.id,
        amount: b.amount,
        alert_threshold: b.alert_threshold || 80,
        is_custom: true,
      });
    }
  }

  // 2. 统计当月总支出（考虑跨币种折算 CNY）
  const totalExpenseSql = `
    SELECT 
      COALESCE(SUM(ROUND(t.amount * COALESCE(cr.rate_to_cny, 1.0))), 0) AS total_expense
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN currency_rates cr ON cr.code = COALESCE(a.currency, 'CNY')
    WHERE t.user_id = ? AND t.type = 'expense' AND t.transaction_time >= ? AND t.transaction_time <= ?
  `;
  const totalExpenseRow = await c.env.DB.prepare(totalExpenseSql)
    .bind(user.id, startTime, endTime)
    .first<{ total_expense: number }>();
  const totalSpent = totalExpenseRow?.total_expense || 0;

  // 3. 统计各分类当月支出
  const categoryExpenseSql = `
    SELECT 
      t.category_id,
      COALESCE(c.name, '未分类') AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      COALESCE(SUM(ROUND(t.amount * COALESCE(cr.rate_to_cny, 1.0))), 0) AS spent_amount
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    LEFT JOIN currency_rates cr ON cr.code = COALESCE(a.currency, 'CNY')
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.user_id = ? AND t.type = 'expense' AND t.transaction_time >= ? AND t.transaction_time <= ?
    GROUP BY t.category_id
  `;
  const { results: categoryExpenses } = await c.env.DB.prepare(categoryExpenseSql)
    .bind(user.id, startTime, endTime)
    .all<{
      category_id: string | null;
      category_name: string;
      category_icon?: string;
      category_color?: string;
      spent_amount: number;
    }>();

  const categorySpentMap = new Map<string, number>();
  for (const row of categoryExpenses || []) {
    if (row.category_id) {
      categorySpentMap.set(row.category_id, row.spent_amount);
    }
  }

  // 4. 获取用户所有分类列表，确保已设预算但当月尚未消费的分类也能正确展示
  const { results: allCategories } = await c.env.DB.prepare(
    "SELECT id, name, icon, color FROM categories WHERE user_id = ? AND type = 'expense' ORDER BY sort_order ASC, created_at ASC"
  )
    .bind(user.id)
    .all<{ id: string; name: string; icon?: string; color?: string }>();
  const allCatMap = new Map(allCategories.map((c) => [c.id, c]));

  // 5. 组装总体预算指标
  let overall: BudgetOverview | null = null;
  if (overallBudgetRow && overallBudgetRow.amount > 0) {
    const budgetAmount = overallBudgetRow.amount;
    const remaining = budgetAmount - totalSpent;
    const usagePercent = Math.round((totalSpent / budgetAmount) * 1000) / 10;
    const threshold = overallBudgetRow.alert_threshold || 80;
    const status: 'normal' | 'warning' | 'exceeded' =
      totalSpent > budgetAmount ? 'exceeded' : usagePercent >= threshold ? 'warning' : 'normal';

    const dailyAllowance = remaining > 0 && daysRemaining > 0 ? Math.round(remaining / daysRemaining) : 0;

    overall = {
      budget_amount: budgetAmount,
      spent_amount: totalSpent,
      remaining_amount: remaining,
      usage_percent: usagePercent,
      days_in_month: daysInMonth,
      day_of_month: dayOfMonth,
      days_remaining: daysRemaining,
      daily_allowance: dailyAllowance,
      status,
    };
  }

  // 6. 组装各分类预算指标
  const categoriesList: CategoryBudgetDetail[] = [];
  const budgetedCategoryIds = new Set<string>();

  for (const [catId, bInfo] of categoryBudgetMap.entries()) {
    budgetedCategoryIds.add(catId);
    const cat = allCatMap.get(catId);
    const spent = categorySpentMap.get(catId) || 0;
    const remaining = bInfo.amount - spent;
    const usagePercent = bInfo.amount > 0 ? Math.round((spent / bInfo.amount) * 1000) / 10 : 0;
    const status: 'normal' | 'warning' | 'exceeded' =
      spent > bInfo.amount ? 'exceeded' : usagePercent >= bInfo.alert_threshold ? 'warning' : 'normal';

    categoriesList.push({
      id: bInfo.id,
      category_id: catId,
      category_name: cat?.name || '未知分类',
      category_icon: cat?.icon,
      category_color: cat?.color,
      budget_amount: bInfo.amount,
      spent_amount: spent,
      remaining_amount: remaining,
      usage_percent: usagePercent,
      alert_threshold: bInfo.alert_threshold,
      status,
      is_custom: bInfo.is_custom,
    });
  }

  // 按预算超支或使用比例从高到低排序，方便用户优先感知告警项
  categoriesList.sort((a, b) => b.usage_percent - a.usage_percent);

  // 7. 收集当月有支出但尚未设定分类专属预算的项目
  const unbudgetedCategories: {
    category_id: string;
    category_name: string;
    category_icon?: string;
    category_color?: string;
    spent_amount: number;
  }[] = [];

  for (const row of categoryExpenses || []) {
    if (row.category_id && !budgetedCategoryIds.has(row.category_id)) {
      unbudgetedCategories.push({
        category_id: row.category_id,
        category_name: row.category_name,
        category_icon: row.category_icon,
        category_color: row.category_color,
        spent_amount: row.spent_amount,
      });
    }
  }

  const response: BudgetStatusResponse = {
    month: targetMonth,
    is_default_template: isDefaultTemplate,
    overall,
    categories: categoriesList,
    unbudgeted_categories: unbudgetedCategories,
  };

  return c.json(response);
});

// 单项设置/更新预算
budgetsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { month = 'default', category_id = null, amount, alert_threshold = 80 } = body;

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '预算金额必须是大于 0 的有效数值' }, 400);
  }

  const targetMonth = month && (/^\d{4}-\d{2}$/.test(month) || month === 'default') ? month : 'default';
  const targetCategory = typeof category_id === 'string' && category_id.trim() ? category_id.trim() : null;
  const numThreshold = Math.max(1, Math.min(100, Math.round(Number(alert_threshold) || 80)));

  // 检查是否已存在记录
  const existing = await c.env.DB.prepare(
    'SELECT id FROM budgets WHERE user_id = ? AND month = ? AND COALESCE(category_id, "__total__") = ?'
  )
    .bind(user.id, targetMonth, targetCategory || '__total__')
    .first<{ id: string }>();

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (existing) {
    await c.env.DB.prepare(
      'UPDATE budgets SET amount = ?, alert_threshold = ?, updated_at = ? WHERE id = ?'
    )
      .bind(numAmount, numThreshold, now, existing.id)
      .run();
    return c.json({ id: existing.id, message: '预算更新成功' });
  }

  const id = 'bdg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO budgets (id, user_id, month, category_id, amount, alert_threshold, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, user.id, targetMonth, targetCategory, numAmount, numThreshold, now, now)
    .run();

  return c.json({ id, message: '预算设置成功' });
});

// 批量设置/更新月度预算与分类子预算
budgetsRouter.post('/batch', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    month = 'default',
    overall_amount,
    alert_threshold = 80,
    copy_to_default = false,
    category_budgets = [],
  } = body;

  const targetMonth = month && (/^\d{4}-\d{2}$/.test(month) || month === 'default') ? month : 'default';
  const numThreshold = Math.max(1, Math.min(100, Math.round(Number(alert_threshold) || 80)));
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);

  const monthsToUpdate = [targetMonth];
  if (copy_to_default && targetMonth !== 'default') {
    monthsToUpdate.push('default');
  }

  for (const m of monthsToUpdate) {
    // 1. 设置月度总预算
    if (overall_amount !== undefined && overall_amount !== null) {
      const numOverall = Math.round(Number(overall_amount));
      if (numOverall > 0) {
        const existing = await c.env.DB.prepare(
          'SELECT id FROM budgets WHERE user_id = ? AND month = ? AND category_id IS NULL'
        )
          .bind(user.id, m)
          .first<{ id: string }>();

        if (existing) {
          await c.env.DB.prepare(
            'UPDATE budgets SET amount = ?, alert_threshold = ?, updated_at = ? WHERE id = ?'
          )
            .bind(numOverall, numThreshold, now, existing.id)
            .run();
        } else {
          const id = 'bdg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
          await c.env.DB.prepare(
            `INSERT INTO budgets (id, user_id, month, category_id, amount, alert_threshold, created_at, updated_at)
             VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`
          )
            .bind(id, user.id, m, numOverall, numThreshold, now, now)
            .run();
        }
      } else {
        // 金额为 0 时删除总预算限制
        await c.env.DB.prepare(
          'DELETE FROM budgets WHERE user_id = ? AND month = ? AND category_id IS NULL'
        )
          .bind(user.id, m)
          .run();
      }
    }

    // 2. 设置各分类子预算
    if (Array.isArray(category_budgets)) {
      for (const cb of category_budgets) {
        if (!cb.category_id) continue;
        const numCatAmount = Math.round(Number(cb.amount));
        const catThreshold = Math.max(1, Math.min(100, Math.round(Number(cb.alert_threshold) || numThreshold)));

        if (numCatAmount > 0) {
          const existing = await c.env.DB.prepare(
            'SELECT id FROM budgets WHERE user_id = ? AND month = ? AND category_id = ?'
          )
            .bind(user.id, m, cb.category_id)
            .first<{ id: string }>();

          if (existing) {
            await c.env.DB.prepare(
              'UPDATE budgets SET amount = ?, alert_threshold = ?, updated_at = ? WHERE id = ?'
            )
              .bind(numCatAmount, catThreshold, now, existing.id)
              .run();
          } else {
            const id = 'bdg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
            await c.env.DB.prepare(
              `INSERT INTO budgets (id, user_id, month, category_id, amount, alert_threshold, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            )
              .bind(id, user.id, m, cb.category_id, numCatAmount, catThreshold, now, now)
              .run();
          }
        } else {
          // 金额为 0 时删除该分类预算
          await c.env.DB.prepare(
            'DELETE FROM budgets WHERE user_id = ? AND month = ? AND category_id = ?'
          )
            .bind(user.id, m, cb.category_id)
            .run();
        }
      }
    }
  }

  return c.json({ message: '预算配置保存成功' });
});

// 删除指定预算
budgetsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const res = await c.env.DB.prepare('DELETE FROM budgets WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该预算或无权删除' }, 404);
  }

  return c.json({ message: '预算已清除' });
});
