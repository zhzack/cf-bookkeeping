import { Hono } from 'hono';
import { Env, UserSession, Item, ItemWithStats, ItemExpense } from '../types';
import { requireAuth } from '../auth';

export const itemsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

itemsRouter.use('*', requireAuth);

function diffInDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  const diffTime = end - start;
  const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

// 获取大件物品列表及日均计算
itemsRouter.get('/', async (c) => {
  const user = c.get('user');
  const statusFilter = c.req.query('status'); // 'using' | 'wishlist' | 'retired' | 'sold' | 'idle'

  let sql = 'SELECT * FROM items WHERE user_id = ?';
  const params: any[] = [user.id];

  if (statusFilter) {
    sql += ' AND status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY created_at DESC';

  const { results: items } = await c.env.DB.prepare(sql).bind(...params).all<Item>();
  const todayStr = new Date().toISOString().slice(0, 10);

  // 获取该用户所有物品的追加支出
  const { results: allExpenses } = await c.env.DB.prepare(
    'SELECT * FROM item_expenses WHERE user_id = ? ORDER BY date DESC'
  ).bind(user.id).all<ItemExpense>();

  const expensesByItem: Record<string, ItemExpense[]> = {};
  for (const exp of allExpenses) {
    if (!expensesByItem[exp.item_id]) expensesByItem[exp.item_id] = [];
    expensesByItem[exp.item_id].push(exp);
  }

  let totalSpent = 0;
  let activeDailyCost = 0;
  let usingCount = 0;
  let wishlistCount = 0;
  let retiredCount = 0;
  let soldCount = 0;

  const itemsWithStats: ItemWithStats[] = items.map((item) => {
    const itemExps = expensesByItem[item.id] || [];
    const additionalCost = itemExps.reduce((sum, e) => sum + e.amount, 0);

    if (item.status === 'using') usingCount++;
    else if (item.status === 'wishlist') wishlistCount++;
    else if (item.status === 'retired') retiredCount++;
    else if (item.status === 'sold') soldCount++;

    if (item.status !== 'wishlist') {
      totalSpent += (item.price + additionalCost);
    }

    // 保修期状态计算
    let warrantyStatus: 'valid' | 'expired' | 'none' = 'none';
    let warrantyDaysLeft: number | undefined;

    if (item.warranty_date) {
      if (item.warranty_date >= todayStr) {
        warrantyStatus = 'valid';
        warrantyDaysLeft = diffInDays(todayStr, item.warranty_date);
      } else {
        warrantyStatus = 'expired';
        warrantyDaysLeft = diffInDays(item.warranty_date, todayStr);
      }
    }

    // 心愿单冷静期计算
    let coolingLeftDays: number | undefined;
    let coolingPercent: number | undefined;

    if (item.status === 'wishlist') {
      const coolingDays = item.cooling_days || 7;
      const daysSinceWish = diffInDays(item.purchase_date, todayStr);
      coolingLeftDays = Math.max(0, coolingDays - daysSinceWish);
      coolingPercent = Math.min(100, Math.round((daysSinceWish / coolingDays) * 100));

      return {
        ...item,
        days_used: 0,
        additional_cost: additionalCost,
        net_cost: item.price,
        cost_per_day: 0,
        progress_percent: 0,
        warranty_status: warrantyStatus,
        warranty_days_left: warrantyDaysLeft,
        value_level: 'normal',
        cooling_left_days: coolingLeftDays,
        cooling_percent: coolingPercent,
        expenses: itemExps,
      };
    }

    // 已购物品日均成本与回本等级计算
    const endDate = (item.status === 'retired' || item.status === 'sold') && item.retired_date
      ? item.retired_date
      : todayStr;

    const daysUsed = Math.max(1, diffInDays(item.purchase_date, endDate));
    const netCost = Math.max(0, item.price + additionalCost - (item.resale_price || 0));
    const costPerDay = Math.round((netCost / daysUsed) * 100) / 100;

    if (item.status === 'using') {
      activeDailyCost += costPerDay;
    }

    let progressPercent: number | null = null;
    if (item.expected_days && item.expected_days > 0) {
      progressPercent = Math.min(100, Math.round((daysUsed / item.expected_days) * 100));
    }

    // 价值等级评估 (分/天)
    // < 100分 (1元): ultra 已赚翻
    // 100-500分 (1-5元): high 超值利器
    // 500-2000分 (5-20元): normal 日常好物
    // > 2000分 (20元+): low 回本中
    let valueLevel: 'ultra' | 'high' | 'normal' | 'low' = 'normal';
    if (costPerDay < 100) valueLevel = 'ultra';
    else if (costPerDay < 500) valueLevel = 'high';
    else if (costPerDay < 2000) valueLevel = 'normal';
    else valueLevel = 'low';

    return {
      ...item,
      days_used: daysUsed,
      additional_cost: additionalCost,
      net_cost: netCost,
      cost_per_day: costPerDay,
      progress_percent: progressPercent,
      warranty_status: warrantyStatus,
      warranty_days_left: warrantyDaysLeft,
      value_level: valueLevel,
      expenses: itemExps,
    };
  });

  return c.json({
    items: itemsWithStats,
    summary: {
      total_spent: totalSpent,
      active_daily_cost: Math.round(activeDailyCost),
      using_count: usingCount,
      wishlist_count: wishlistCount,
      retired_count: retiredCount,
      sold_count: soldCount,
      total_count: items.length,
    },
  });
});

// 新增大件物品 / 心愿单
itemsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const { 
    name, 
    category, 
    price, 
    resale_price = 0, 
    purchase_date, 
    status = 'using', 
    retired_date, 
    expected_days, 
    warranty_date,
    location,
    cooling_days = 7,
    remark,
    sync_ledger = false,
    account_id
  } = body;

  if (!name || !name.trim()) {
    return c.json({ error: '物品名称不能为空' }, 400);
  }
  const numPrice = Math.round(Number(price));
  if (isNaN(numPrice) || numPrice <= 0) {
    return c.json({ error: '购买价格必须大于 0' }, 400);
  }
  if (!purchase_date) {
    return c.json({ error: '请选择购买日期或心愿添加日期' }, 400);
  }

  const id = 'itm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const numResale = Math.max(0, Math.round(Number(resale_price) || 0));
  const numExpected = expected_days ? Math.round(Number(expected_days)) : null;

  await c.env.DB.prepare(
    `INSERT INTO items (id, user_id, name, category, price, resale_price, purchase_date, status, retired_date, expected_days, warranty_date, location, cooling_days, remark)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    name.trim(),
    category?.trim() || '数码科技',
    numPrice,
    numResale,
    purchase_date,
    status,
    retired_date || null,
    numExpected,
    warranty_date || null,
    location?.trim() || null,
    cooling_days || 7,
    remark?.trim() || null
  ).run();

  // 若选择同步记账流水
  if (sync_ledger && account_id && status === 'using') {
    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (id, user_id, type, amount, account_id, transaction_time, remark)
       VALUES (?, ?, 'expense', ?, ?, ?, ?)`
    ).bind(
      txId,
      user.id,
      numPrice,
      account_id,
      `${purchase_date} 12:00:00`,
      `购买大件: ${name.trim()}`
    ).run();
  }

  return c.json({ id, message: '录入成功' });
});

// 更新大件信息
itemsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const { 
    name, 
    category, 
    price, 
    resale_price, 
    purchase_date, 
    status, 
    retired_date, 
    expected_days, 
    warranty_date,
    location,
    cooling_days,
    remark 
  } = body;

  if (!name || !name.trim()) {
    return c.json({ error: '物品名称不能为空' }, 400);
  }
  const numPrice = Math.round(Number(price));
  if (isNaN(numPrice) || numPrice <= 0) {
    return c.json({ error: '购买价格必须大于 0' }, 400);
  }

  const numResale = Math.max(0, Math.round(Number(resale_price) || 0));
  const numExpected = expected_days ? Math.round(Number(expected_days)) : null;

  const res = await c.env.DB.prepare(
    `UPDATE items 
     SET name = ?, category = ?, price = ?, resale_price = ?, purchase_date = ?, status = ?, retired_date = ?, expected_days = ?, warranty_date = ?, location = ?, cooling_days = ?, remark = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    name.trim(),
    category?.trim() || '其他',
    numPrice,
    numResale,
    purchase_date,
    status,
    retired_date || null,
    numExpected,
    warranty_date || null,
    location?.trim() || null,
    cooling_days || 7,
    remark?.trim() || null,
    id,
    user.id
  ).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该物品或无权修改' }, 404);
  }

  return c.json({ message: '物品更新成功' });
});

// 快速修改状态（标记损坏、转卖二手、标记闲置、恢复在用）
itemsRouter.patch('/:id/status', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { status, retired_date, resale_price, remark } = await c.req.json();

  if (!['using', 'wishlist', 'retired', 'sold', 'idle'].includes(status)) {
    return c.json({ error: '无效的状态' }, 400);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const finalRetiredDate = status === 'retired' || status === 'sold'
    ? (retired_date || todayStr)
    : null;

  let updateSql = 'UPDATE items SET status = ?, retired_date = ?';
  const params: any[] = [status, finalRetiredDate];

  if (resale_price !== undefined) {
    updateSql += ', resale_price = ?';
    params.push(Math.round(Number(resale_price) || 0));
  }
  if (remark !== undefined) {
    updateSql += ', remark = ?';
    params.push(remark);
  }

  updateSql += ' WHERE id = ? AND user_id = ?';
  params.push(id, user.id);

  const res = await c.env.DB.prepare(updateSql).bind(...params).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该物品或无权修改' }, 404);
  }

  return c.json({ message: '状态更新成功' });
});

// 心愿单确认购买转为服役物品
itemsRouter.post('/:id/convert-wishlist', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { account_id, purchase_date, price } = await c.req.json();

  const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ? AND user_id = ?').bind(id, user.id).first<Item>();
  if (!item) {
    return c.json({ error: '物品不存在' }, 404);
  }

  const finalDate = purchase_date || new Date().toISOString().slice(0, 10);
  const finalPrice = price ? Math.round(Number(price) * 100) : item.price;

  // 更新为服役状态
  await c.env.DB.prepare(
    'UPDATE items SET status = "using", purchase_date = ?, price = ? WHERE id = ? AND user_id = ?'
  ).bind(finalDate, finalPrice, id, user.id).run();

  // 若选择了付款账户，同步向记账账本写入一笔支出
  if (account_id) {
    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (id, user_id, type, amount, account_id, transaction_time, remark)
       VALUES (?, ?, 'expense', ?, ?, ?, ?)`
    ).bind(
      txId,
      user.id,
      finalPrice,
      account_id,
      `${finalDate} 12:00:00`,
      `心愿单拔草购买: ${item.name}`
    ).run();
  }

  return c.json({ message: '恭喜！已转为服役物品' });
});

// 为物品追加配件/维修/维护支出
itemsRouter.post('/:id/expenses', async (c) => {
  const user = c.get('user');
  const itemId = c.req.param('id');
  const { amount, description, date, sync_ledger, account_id } = await c.req.json();

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '请输入有效的支出金额' }, 400);
  }
  if (!description || !description.trim()) {
    return c.json({ error: '请输入费用说明' }, 400);
  }

  const expId = 'exp_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const expDate = date || new Date().toISOString().slice(0, 10);

  await c.env.DB.prepare(
    `INSERT INTO item_expenses (id, item_id, user_id, amount, description, date)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(expId, itemId, user.id, numAmount, description.trim(), expDate).run();

  // 若勾选同步记账流水
  if (sync_ledger && account_id) {
    const txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (id, user_id, type, amount, account_id, transaction_time, remark)
       VALUES (?, ?, 'expense', ?, ?, ?, ?)`
    ).bind(
      txId,
      user.id,
      numAmount,
      account_id,
      `${expDate} 12:00:00`,
      `大件追加支出: ${description.trim()}`
    ).run();
  }

  return c.json({ id: expId, message: '追加费用成功' });
});

// 删除物品追加支出
itemsRouter.delete('/:id/expenses/:expId', async (c) => {
  const user = c.get('user');
  const expId = c.req.param('expId');

  await c.env.DB.prepare(
    'DELETE FROM item_expenses WHERE id = ? AND user_id = ?'
  ).bind(expId, user.id).run();

  return c.json({ message: '已删除该笔追加支出' });
});

// 删除大件物品
itemsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const res = await c.env.DB.prepare(
    'DELETE FROM items WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该物品或无权删除' }, 404);
  }

  return c.json({ message: '物品已删除' });
});
