import { Hono } from 'hono';
import { Env, UserSession, PrepaidCard, PrepaidCardWithStats, PrepaidCardLog, Account } from '../types';
import { requireAuth } from '../auth';

export const cardsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

cardsRouter.use('*', requireAuth);

function diffInDays(startDateStr: string, endDateStr: string): number {
  const start = new Date(startDateStr).getTime();
  const end = new Date(endDateStr).getTime();
  const diffTime = end - start;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

function computeCardStats(card: PrepaidCard, todayStr: string): PrepaidCardWithStats {
  const isTimes = card.type === 'times';
  
  // 单次/单位折算成本(分)
  let perUnitCost = 0;
  if (isTimes) {
    perUnitCost = card.total_value > 0 ? Math.round(card.total_spent_amount / card.total_value) : 0;
  } else {
    // 余额卡: 折算实际花费成本比例 (例如充1000送200，实际每花1元卡内余额折合0.83元实付)
    perUnitCost = card.total_value > 0 ? Math.round((card.total_spent_amount * 100) / card.total_value) : 100;
  }

  // 已消费价值 (已扣分 或 已消费次数)
  const consumedValue = Math.max(0, card.total_value - card.current_value);

  // 剩余折合人民币残值(分)
  let remainingWorth = 0;
  if (isTimes) {
    remainingWorth = Math.max(0, card.current_value * perUnitCost);
  } else {
    // 余额卡直接取剩余面值折算实付残值
    remainingWorth = card.total_value > 0 
      ? Math.round(card.current_value * (card.total_spent_amount / card.total_value))
      : card.current_value;
  }

  // 使用进度 (0 ~ 100%)
  const usagePercent = card.total_value > 0
    ? Math.min(100, Math.max(0, Math.round((consumedValue / card.total_value) * 100)))
    : 0;

  // 有效期状态
  let expirationStatus: 'none' | 'valid' | 'expiring' | 'expired' = 'none';
  let daysLeft: number | undefined = undefined;

  if (card.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(card.valid_until)) {
    daysLeft = diffInDays(todayStr, card.valid_until);
    if (daysLeft < 0) {
      expirationStatus = 'expired';
    } else if (daysLeft <= 30) {
      expirationStatus = 'expiring';
    } else {
      expirationStatus = 'valid';
    }
  }

  return {
    ...card,
    per_unit_cost: perUnitCost,
    remaining_worth: remainingWorth,
    consumed_value: consumedValue,
    usage_percent: usagePercent,
    expiration_status: expirationStatus,
    days_left: daysLeft,
  };
}

// 辅助方法：确保获取或创建一个“会员储值卡专款”虚拟账户，供核销记账流水使用
async function getOrCreatePrepaidAccount(db: D1Database, userId: string, preferredAccountId?: string): Promise<string> {
  if (preferredAccountId) {
    const acc = await db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
      .bind(preferredAccountId, userId).first<{ id: string }>();
    if (acc) return acc.id;
  }

  // 查找是否有现成的会员卡/充值卡相关账户
  const existing = await db.prepare(
    "SELECT id FROM accounts WHERE user_id = ? AND (name LIKE '%充值卡%' OR name LIKE '%会员卡%' OR name LIKE '%预付%') LIMIT 1"
  ).bind(userId).first<{ id: string }>();
  if (existing) return existing.id;

  // 若无，取用户的第一个账户
  const firstAcc = await db.prepare(
    'SELECT id FROM accounts WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1'
  ).bind(userId).first<{ id: string }>();
  if (firstAcc) return firstAcc.id;

  // 兜底新建一个
  const newAccId = 'acc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await db.prepare(
    `INSERT INTO accounts (id, user_id, name, type, initial_balance, current_balance, icon, color, sort_order)
     VALUES (?, ?, '会员储值卡', 'other', 0, 0, 'credit-card', '#6366f1', 99)`
  ).bind(newAccId, userId).run();

  return newAccId;
}

// 1. 获取充值卡列表与汇总看板
cardsRouter.get('/', async (c) => {
  const user = c.get('user');
  const statusParam = c.req.query('status') || 'all';
  const todayStr = new Date().toISOString().slice(0, 10);

  let sql = 'SELECT * FROM prepaid_cards WHERE user_id = ?';
  const params: any[] = [user.id];

  if (statusParam === 'active') {
    sql += " AND status = 'active'";
  } else if (statusParam === 'exhausted') {
    sql += " AND status = 'exhausted'";
  } else if (statusParam === 'expired') {
    sql += " AND status = 'expired'";
  } else if (statusParam === 'refunded') {
    sql += " AND status = 'refunded'";
  }
  sql += ' ORDER BY status ASC, created_at DESC';

  const { results: rawCards } = await c.env.DB.prepare(sql).bind(...params).all<PrepaidCard>();
  const cards = (rawCards || []).map((card) => computeCardStats(card, todayStr));

  // 汇总统计 (基于全部 active 卡片计算)
  const allCardsQuery = await c.env.DB.prepare(
    'SELECT * FROM prepaid_cards WHERE user_id = ?'
  ).bind(user.id).all<PrepaidCard>();
  const allStats = (allCardsQuery.results || []).map((card) => computeCardStats(card, todayStr));

  const totalCards = allStats.length;
  const activeCards = allStats.filter((c) => c.status === 'active').length;
  const totalRemainingWorth = allStats
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + c.remaining_worth, 0);
  const totalSpentAmount = allStats.reduce((sum, c) => sum + c.total_spent_amount, 0);
  const expiringCount = allStats.filter((c) => c.status === 'active' && c.expiration_status === 'expiring').length;
  const timesCardsCount = allStats.filter((c) => c.type === 'times').length;
  const balanceCardsCount = allStats.filter((c) => c.type === 'balance').length;

  return c.json({
    cards,
    summary: {
      total_cards: totalCards,
      active_cards: activeCards,
      total_remaining_worth: totalRemainingWorth,
      total_spent_amount: totalSpentAmount,
      expiring_count: expiringCount,
      times_cards_count: timesCardsCount,
      balance_cards_count: balanceCardsCount,
    },
  });
});

// 2. 获取单张充值卡详情与完整日志
cardsRouter.get('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const todayStr = new Date().toISOString().slice(0, 10);

  const rawCard = await c.env.DB.prepare(
    'SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).first<PrepaidCard>();

  if (!rawCard) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  const card = computeCardStats(rawCard, todayStr);

  const { results: rawLogs } = await c.env.DB.prepare(
    `SELECT l.*, a.name AS account_name
     FROM prepaid_card_logs l
     LEFT JOIN accounts a ON l.account_id = a.id
     WHERE l.card_id = ? AND l.user_id = ?
     ORDER BY l.log_time DESC, l.created_at DESC`
  ).bind(id, user.id).all<PrepaidCardLog>();

  return c.json({ card, logs: rawLogs || [] });
});

// 3. 新建充值卡 (独立开卡或从账户充值)
cardsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const {
    name,
    type,
    merchant,
    icon = 'credit-card',
    color = '#6366f1',
    amount = 0,             // 实付充值金额 (元或分，前端传分，或数值)
    initial_value,          // 面值分 (储值卡) 或 初始次数 (计次卡)
    gift_amount = 0,        // 赠送金额 (分，仅储值卡)
    valid_until,            // YYYY-MM-DD
    remark,
    account_id,             // 充值付款账户
    sync_ledger = false,    // 是否同步记账流水
    category_id,
    transaction_time,
  } = body;

  if (!name || !name.trim()) {
    return c.json({ error: '卡片名称不能为空' }, 400);
  }
  if (type !== 'balance' && type !== 'times') {
    return c.json({ error: '卡片类型必须为 balance (储值余额卡) 或 times (计次卡)' }, 400);
  }

  const amountCents = Math.round(Number(amount) || 0);
  const giftCents = Math.round(Number(gift_amount) || 0);
  const parsedValue = Math.round(Number(initial_value) || 0);

  if (parsedValue <= 0) {
    return c.json({ error: type === 'times' ? '初始次数必须大于 0' : '卡内初始面值必须大于 0' }, 400);
  }

  const cardId = 'crd_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const nowStr = transaction_time || new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 1. 插入充值卡主表
  await c.env.DB.prepare(
    `INSERT INTO prepaid_cards (
      id, user_id, name, type, merchant, icon, color,
      initial_amount, initial_value, gift_amount, current_value,
      total_spent_amount, total_value, status, valid_until, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
  ).bind(
    cardId,
    user.id,
    name.trim(),
    type,
    merchant?.trim() || null,
    icon || 'credit-card',
    color || '#6366f1',
    amountCents,
    parsedValue,
    giftCents,
    parsedValue,
    amountCents,
    parsedValue,
    valid_until || null,
    remark?.trim() || null
  ).run();

  let createdTxId: string | null = null;

  // 2. 若选择同步记录扣款支出流水
  if (sync_ledger && account_id && amountCents > 0) {
    createdTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, user_id, type, amount, account_id, category_id,
        transaction_time, remark, exclude_daily_cost, card_id, source
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, 1, ?, 'prepaid_card')`
    ).bind(
      createdTxId,
      user.id,
      amountCents,
      account_id,
      category_id || null,
      nowStr,
      `办卡充值: ${name.trim()}${merchant ? ` (${merchant.trim()})` : ''}`,
      cardId
    ).run();

    // 更新 card 绑定的首次流水
    await c.env.DB.prepare('UPDATE prepaid_cards SET linked_transaction_id = ? WHERE id = ?')
      .bind(createdTxId, cardId).run();
  }

  // 3. 写入初始 recharge 日志
  const logId = 'clg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO prepaid_card_logs (
      id, card_id, user_id, type, delta_value, actual_amount,
      transaction_id, account_id, log_time, remark
    ) VALUES (?, ?, ?, 'recharge', ?, ?, ?, ?, ?, ?)`
  ).bind(
    logId,
    cardId,
    user.id,
    parsedValue,
    amountCents,
    createdTxId,
    account_id || null,
    nowStr,
    `首次开卡充值${type === 'times' ? ` ${parsedValue} 次` : ` 额度`}`
  ).run();

  return c.json({ id: cardId, message: '充值卡创建成功' }, 201);
});

// 4. 修改充值卡基本信息
cardsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();

  const { name, merchant, icon, color, valid_until, remark, status } = body;

  const card = await c.env.DB.prepare('SELECT id FROM prepaid_cards WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first();
  if (!card) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  await c.env.DB.prepare(
    `UPDATE prepaid_cards
     SET name = COALESCE(?, name),
         merchant = ?,
         icon = COALESCE(?, icon),
         color = COALESCE(?, color),
         valid_until = ?,
         remark = ?,
         status = COALESCE(?, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(
    name?.trim() || null,
    merchant !== undefined ? (merchant?.trim() || null) : null,
    icon || null,
    color || null,
    valid_until !== undefined ? (valid_until || null) : null,
    remark !== undefined ? (remark?.trim() || null) : null,
    status || null,
    id,
    user.id
  ).run();

  return c.json({ message: '修改成功' });
});

// 5. 删除充值卡
cardsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  const card = await c.env.DB.prepare('SELECT id FROM prepaid_cards WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first();
  if (!card) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  // 解绑关联流水中的 card_id
  await c.env.DB.prepare('UPDATE transactions SET card_id = NULL WHERE card_id = ? AND user_id = ?')
    .bind(id, user.id).run();

  // 删除卡片日志及卡片
  await c.env.DB.prepare('DELETE FROM prepaid_card_logs WHERE card_id = ? AND user_id = ?').bind(id, user.id).run();
  await c.env.DB.prepare('DELETE FROM prepaid_cards WHERE id = ? AND user_id = ?').bind(id, user.id).run();

  return c.json({ message: '充值卡已删除' });
});

// 6. 核销消费 (打卡扣次 或 扣除卡内余额)
cardsRouter.post('/:id/consume', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();

  const {
    value,                  // 扣减面值 (计次卡为扣减次数如 1，余额卡为扣减金额分)
    remark,                 // 消费说明 (如: "理发+洗吹", "背部私教课")
    date,                   // 消费时间
    sync_ledger = false,    // 是否同步在记账明细中生成一条生活消费流水
    category_id,            // 分类
    scene,                  // 消费场景
    account_id,             // 虚拟入账账户
  } = body;

  const card = await c.env.DB.prepare('SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<PrepaidCard>();
  if (!card) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  const consumeVal = Math.round(Number(value) || 0);
  if (consumeVal <= 0) {
    return c.json({ error: card.type === 'times' ? '扣减次数必须大于 0' : '扣减金额必须大于 0' }, 400);
  }

  if (card.current_value < consumeVal) {
    return c.json({
      error: card.type === 'times'
        ? `卡内剩余次数不足 (仅剩 ${card.current_value} 次，无法扣减 ${consumeVal} 次)`
        : `卡内剩余金额不足 (仅剩 ${(card.current_value / 100).toFixed(2)} 元，无法扣减 ${(consumeVal / 100).toFixed(2)} 元)`
    }, 400);
  }

  const isTimes = card.type === 'times';
  // 计算本次消费对应的人民币实付折算金额(分)
  let actualAmountCents = 0;
  if (isTimes) {
    const perUnitCost = card.total_value > 0 ? Math.round(card.total_spent_amount / card.total_value) : 0;
    actualAmountCents = perUnitCost * consumeVal;
  } else {
    // 余额卡扣减金额即为消费金额
    actualAmountCents = consumeVal;
  }

  const newCurrentValue = card.current_value - consumeVal;
  const newStatus = newCurrentValue === 0 ? 'exhausted' : card.status;
  const nowStr = date || new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 更新卡片剩余
  await c.env.DB.prepare(
    `UPDATE prepaid_cards
     SET current_value = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(newCurrentValue, newStatus, id, user.id).run();

  let createdTxId: string | null = null;

  // 若勾选了同步生活记账流水：真实计入当期生活成本 (exclude_daily_cost = 0)
  if (sync_ledger && actualAmountCents > 0) {
    const targetAccId = await getOrCreatePrepaidAccount(c.env.DB, user.id, account_id);
    createdTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    const txRemark = remark?.trim() 
      ? `[${card.name}] ${remark.trim()}`
      : `[${card.name}] ${isTimes ? `打卡消费 ${consumeVal} 次` : '卡内余额消费'}`;

    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, user_id, type, amount, account_id, category_id,
        transaction_time, remark, scene, exclude_daily_cost, card_id, source
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, ?, 0, ?, 'prepaid_card')`
    ).bind(
      createdTxId,
      user.id,
      actualAmountCents,
      targetAccId,
      category_id || null,
      nowStr,
      txRemark,
      scene || null,
      id
    ).run();
  }

  // 记录日志
  const logId = 'clg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO prepaid_card_logs (
      id, card_id, user_id, type, delta_value, actual_amount,
      transaction_id, account_id, log_time, remark
    ) VALUES (?, ?, ?, 'consume', ?, ?, ?, ?, ?, ?)`
  ).bind(
    logId,
    id,
    user.id,
    -consumeVal,
    actualAmountCents,
    createdTxId,
    account_id || null,
    nowStr,
    remark?.trim() || (isTimes ? `打卡核销 ${consumeVal} 次` : `卡内消费 ${(consumeVal / 100).toFixed(2)} 元`)
  ).run();

  return c.json({
    message: isTimes ? `成功核销 ${consumeVal} 次，剩余 ${newCurrentValue} 次` : `成功扣减 ${(consumeVal / 100).toFixed(2)} 元，剩余 ${(newCurrentValue / 100).toFixed(2)} 元`,
    current_value: newCurrentValue,
    status: newStatus,
    transaction_id: createdTxId,
  });
});

// 7. 续充充值 (追加金额与面值/次数)
cardsRouter.post('/:id/recharge', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();

  const {
    amount = 0,             // 实付充值金额 (分)
    value,                  // 充值面值 (分) 或 充值次数 (正整数)
    gift_amount = 0,        // 赠送金额 (分，储值卡)
    remark,
    date,
    account_id,
    sync_ledger = false,
    category_id,
  } = body;

  const card = await c.env.DB.prepare('SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<PrepaidCard>();
  if (!card) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  const addAmountCents = Math.round(Number(amount) || 0);
  const addValue = Math.round(Number(value) || 0);
  const addGiftCents = Math.round(Number(gift_amount) || 0);

  if (addValue <= 0) {
    return c.json({ error: card.type === 'times' ? '追加次数必须大于 0' : '充值面值必须大于 0' }, 400);
  }

  const newCurrentValue = card.current_value + addValue;
  const newTotalValue = card.total_value + addValue;
  const newTotalSpent = card.total_spent_amount + addAmountCents;
  const newGiftAmount = card.gift_amount + addGiftCents;
  const newStatus = card.status === 'exhausted' ? 'active' : card.status;
  const nowStr = date || new Date().toISOString().slice(0, 19).replace('T', ' ');

  // 更新卡片
  await c.env.DB.prepare(
    `UPDATE prepaid_cards
     SET current_value = ?,
         total_value = ?,
         total_spent_amount = ?,
         gift_amount = ?,
         status = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(newCurrentValue, newTotalValue, newTotalSpent, newGiftAmount, newStatus, id, user.id).run();

  let createdTxId: string | null = null;

  // 若选择同步扣款流水
  if (sync_ledger && account_id && addAmountCents > 0) {
    createdTxId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      `INSERT INTO transactions (
        id, user_id, type, amount, account_id, category_id,
        transaction_time, remark, exclude_daily_cost, card_id, source
      ) VALUES (?, ?, 'expense', ?, ?, ?, ?, ?, 1, ?, 'prepaid_card')`
    ).bind(
      createdTxId,
      user.id,
      addAmountCents,
      account_id,
      category_id || null,
      nowStr,
      `充值卡续充: ${card.name}`,
      id
    ).run();
  }

  // 记录日志
  const logId = 'clg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO prepaid_card_logs (
      id, card_id, user_id, type, delta_value, actual_amount,
      transaction_id, account_id, log_time, remark
    ) VALUES (?, ?, ?, 'recharge', ?, ?, ?, ?, ?, ?)`
  ).bind(
    logId,
    id,
    user.id,
    addValue,
    addAmountCents,
    createdTxId,
    account_id || null,
    nowStr,
    remark?.trim() || (card.type === 'times' ? `续充 ${addValue} 次` : `充值续费 ${(addValue / 100).toFixed(2)} 元`)
  ).run();

  return c.json({
    message: '续充成功',
    current_value: newCurrentValue,
    total_spent_amount: newTotalSpent,
    status: newStatus,
  });
});

// 8. 手动校准卡内剩余
cardsRouter.post('/:id/adjust', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();

  const { target_value, remark } = body;

  const card = await c.env.DB.prepare('SELECT * FROM prepaid_cards WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<PrepaidCard>();
  if (!card) {
    return c.json({ error: '未找到该充值卡' }, 404);
  }

  const parsedTarget = Math.round(Number(target_value));
  if (isNaN(parsedTarget) || parsedTarget < 0) {
    return c.json({ error: '目标值不能为负数' }, 400);
  }

  const delta = parsedTarget - card.current_value;
  if (delta === 0) {
    return c.json({ message: '卡内数值未发生变化' });
  }

  const newStatus = parsedTarget === 0 ? 'exhausted' : (card.status === 'exhausted' ? 'active' : card.status);
  const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await c.env.DB.prepare(
    `UPDATE prepaid_cards
     SET current_value = ?, status = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND user_id = ?`
  ).bind(parsedTarget, newStatus, id, user.id).run();

  const logId = 'clg_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO prepaid_card_logs (
      id, card_id, user_id, type, delta_value, actual_amount,
      transaction_id, account_id, log_time, remark
    ) VALUES (?, ?, ?, 'adjust', ?, 0, NULL, NULL, ?, ?)`
  ).bind(
    logId,
    id,
    user.id,
    delta,
    nowStr,
    remark?.trim() || `手动校准剩余为 ${card.type === 'times' ? `${parsedTarget} 次` : `${(parsedTarget / 100).toFixed(2)} 元`}`
  ).run();

  return c.json({ message: '校准完成', current_value: parsedTarget, status: newStatus });
});
