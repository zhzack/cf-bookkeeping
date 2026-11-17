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

async function getAccountTxNetDelta(db: D1Database, accountId: string): Promise<number> {
  const row = await db
    .prepare(
      `SELECT (
        COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount WHEN t.type = 'expense' THEN -t.amount ELSE 0 END) FROM transactions t WHERE t.account_id = ?), 0)
        + COALESCE((SELECT SUM(COALESCE(t.target_amount, t.amount)) FROM transactions t WHERE t.destination_account_id = ? AND t.type = 'transfer'), 0)
        - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = ? AND t.type = 'transfer'), 0)
      ) AS tx_delta`
    )
    .bind(accountId, accountId, accountId)
    .first<{ tx_delta: number }>();
  return Math.round(Number(row?.tx_delta) || 0);
}

// 更新账户（支持直接传 initial_balance 或传 target_current_balance 自动反推初始余额）
accountsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const { name, type, initial_balance, target_current_balance, currency, icon, color } = await c.req.json();

  if (!name || !name.trim()) {
    return c.json({ error: '账户名称不能为空' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id FROM accounts WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{ id: string }>();

  if (!existing) {
    return c.json({ error: '未找到该账户或无权修改' }, 404);
  }

  let initBalInCents: number;
  let currentBalInCents: number;
  const txDelta = await getAccountTxNetDelta(c.env.DB, id);

  if (target_current_balance !== undefined && target_current_balance !== null) {
    const targetNum = Number(target_current_balance);
    if (!Number.isFinite(targetNum)) {
      return c.json({ error: '请输入有效的当前余额' }, 400);
    }
    currentBalInCents = Math.round(targetNum);
    initBalInCents = currentBalInCents - txDelta;
  } else {
    initBalInCents = Math.round(Number(initial_balance) || 0);
    currentBalInCents = initBalInCents + txDelta;
  }

  const currencyCode = typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : undefined;

  const res = currencyCode
    ? await c.env.DB.prepare(
        `UPDATE accounts 
         SET name = ?, type = ?, initial_balance = ?, current_balance = ?, currency = ?, icon = ?, color = ?
         WHERE id = ? AND user_id = ?`
      ).bind(name.trim(), type, initBalInCents, currentBalInCents, currencyCode, icon, color, id, user.id).run()
    : await c.env.DB.prepare(
        `UPDATE accounts 
         SET name = ?, type = ?, initial_balance = ?, current_balance = ?, icon = ?, color = ?
         WHERE id = ? AND user_id = ?`
      ).bind(name.trim(), type, initBalInCents, currentBalInCents, icon, color, id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该账户或无权修改' }, 404);
  }

  return c.json({
    message: '账户更新成功',
    initial_balance: initBalInCents,
    current_balance: currentBalInCents,
  });
});

function formatNowUtc8(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  return now.toISOString().replace('T', ' ').slice(0, 19);
}

async function resolveFallbackCategoryId(
  db: D1Database,
  userId: string,
  txType: 'expense' | 'income',
  preferredId?: string | null
): Promise<string | null> {
  if (preferredId) {
    const valid = await db
      .prepare('SELECT id FROM categories WHERE id = ? AND user_id = ? AND type = ?')
      .bind(preferredId, userId, txType)
      .first<{ id: string }>();
    if (valid) return valid.id;
  }
  const { results } = await db
    .prepare('SELECT id, name FROM categories WHERE user_id = ? AND type = ? ORDER BY sort_order ASC, created_at ASC')
    .bind(userId, txType)
    .all<{ id: string; name: string }>();
  const list = results || [];
  const other = list.find((c) => c.name.includes('其他'));
  return (other || list[0])?.id || null;
}

// 快速校准单账户余额：支持 'initial'(反推初始值) 与 'transaction'(补录漏记差额流水)
accountsRouter.post('/:id/calibrate', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const {
    current_balance,
    mode = 'initial',
    category_id,
    remark,
  } = await c.req.json();

  const targetNum = Number(current_balance);
  if (current_balance === undefined || current_balance === null || !Number.isFinite(targetNum)) {
    return c.json({ error: '请输入有效的当前余额' }, 400);
  }

  const existing = await c.env.DB.prepare(
    'SELECT id, name, initial_balance FROM accounts WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{ id: string; name: string; initial_balance: number }>();

  if (!existing) {
    return c.json({ error: '未找到该账户或无权修改' }, 404);
  }

  const targetCents = Math.round(targetNum);
  const txDelta = await getAccountTxNetDelta(c.env.DB, id);
  const currentBookCents = Math.round(Number(existing.initial_balance) || 0) + txDelta;

  if (mode === 'transaction') {
    const diff = targetCents - currentBookCents;
    let txId: string | null = null;
    let txType: 'expense' | 'income' | null = null;

    if (diff !== 0) {
      txType = diff < 0 ? 'expense' : 'income';
      const absAmount = Math.abs(diff);
      const resolvedCatId = await resolveFallbackCategoryId(c.env.DB, user.id, txType, category_id);
      txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const defaultRemark =
        txType === 'expense'
          ? `[账户对账] ${existing.name} 漏记消费差额补录`
          : `[账户对账] ${existing.name} 漏记收入/利息差额补录`;

      await c.env.DB.prepare(
        `INSERT INTO transactions (
          id, user_id, type, amount, account_id, category_id,
          transaction_time, remark, exclude_daily_cost, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual')`
      )
        .bind(
          txId,
          user.id,
          txType,
          absAmount,
          id,
          resolvedCatId,
          formatNowUtc8(),
          (typeof remark === 'string' && remark.trim() ? remark.trim() : defaultRemark).slice(0, 160)
        )
        .run();
    }

    await c.env.DB.prepare(
      'UPDATE accounts SET current_balance = ? WHERE id = ? AND user_id = ?'
    )
      .bind(targetCents, id, user.id)
      .run();

    return c.json({
      message: diff === 0 ? '账面余额与实际余额完全一致，无需补录' : '已完成对账并补录差额流水',
      diff,
      transaction_id: txId,
      tx_type: txType,
      initial_balance: existing.initial_balance,
      current_balance: targetCents,
    });
  }

  const newInitialCents = targetCents - txDelta;
  await c.env.DB.prepare(
    `UPDATE accounts
     SET initial_balance = ?, current_balance = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(newInitialCents, targetCents, id, user.id)
    .run();

  return c.json({
    message: '账户余额已校准',
    initial_balance: newInitialCents,
    current_balance: targetCents,
    tx_delta: txDelta,
  });
});

// 多账户联动总账对账（如：储蓄卡 + 微信钱包 + 支付宝 合并核对漏记消费并自动归集平账）
accountsRouter.post('/reconcile', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    main_account_id,
    entries,
    record_diff_as_tx = true,
    expense_category_id,
    income_category_id,
    remark,
  } = body as {
    main_account_id: string;
    entries: Array<{ account_id: string; actual_balance: number }>;
    record_diff_as_tx?: boolean;
    expense_category_id?: string | null;
    income_category_id?: string | null;
    remark?: string | null;
  };

  if (!main_account_id || !Array.isArray(entries) || entries.length === 0) {
    return c.json({ error: '请至少选择一个参与对账的账户' }, 400);
  }

  if (!entries.some((e) => e.account_id === main_account_id)) {
    return c.json({ error: '主结算账户必须包含在参与对账的账户列表中' }, 400);
  }

  // 读取参与账户的实时状态
  const resolvedEntries: Array<{
    id: string;
    name: string;
    currency: string;
    initial_balance: number;
    book_balance: number;
    actual_balance: number;
  }> = [];

  for (const entry of entries) {
    const acc = await c.env.DB.prepare(
      `SELECT id, name, COALESCE(currency, 'CNY') AS currency, initial_balance
       FROM accounts WHERE id = ? AND user_id = ?`
    )
      .bind(entry.account_id, user.id)
      .first<{ id: string; name: string; currency: string; initial_balance: number }>();

    if (!acc) {
      return c.json({ error: '包含无效或无权访问的账户' }, 404);
    }

    const actualNum = Number(entry.actual_balance);
    if (!Number.isFinite(actualNum)) {
      return c.json({ error: `账户「${acc.name}」的实际余额格式无效` }, 400);
    }

    const txDelta = await getAccountTxNetDelta(c.env.DB, acc.id);
    const bookBalance = Math.round(Number(acc.initial_balance) || 0) + txDelta;
    resolvedEntries.push({
      id: acc.id,
      name: acc.name,
      currency: acc.currency.toUpperCase(),
      initial_balance: Math.round(Number(acc.initial_balance) || 0),
      book_balance: bookBalance,
      actual_balance: Math.round(actualNum),
    });
  }

  const currencies = new Set(resolvedEntries.map((e) => e.currency));
  if (currencies.size > 1) {
    return c.json({ error: '多账户合并对账仅支持相同币种的账户（例如全部为 CNY 账户）' }, 400);
  }

  const totalBook = resolvedEntries.reduce((s, e) => s + e.book_balance, 0);
  const totalActual = resolvedEntries.reduce((s, e) => s + e.actual_balance, 0);
  const diff = totalActual - totalBook;

  let txId: string | null = null;
  let txType: 'expense' | 'income' | null = null;
  const statements: D1PreparedStatement[] = [];

  if (record_diff_as_tx && diff !== 0) {
    txType = diff < 0 ? 'expense' : 'income';
    const absAmount = Math.abs(diff);
    const preferredCat = txType === 'expense' ? expense_category_id : income_category_id;
    const catId = await resolveFallbackCategoryId(c.env.DB, user.id, txType, preferredCat);
    txId = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    const namesStr = resolvedEntries.map((e) => e.name).join(' + ');
    const defaultRemark =
      txType === 'expense'
        ? `[总账对账] 漏记消费差额补录 (${namesStr})`
        : `[总账对账] 漏记收入/入账差额补录 (${namesStr})`;

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (
          id, user_id, type, amount, account_id, category_id,
          transaction_time, remark, exclude_daily_cost, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'manual')`
      ).bind(
        txId,
        user.id,
        txType,
        absAmount,
        main_account_id,
        catId,
        formatNowUtc8(),
        (typeof remark === 'string' && remark.trim() ? remark.trim() : defaultRemark).slice(0, 160)
      )
    );
  }

  // 对非主账户（如微信钱包、支付宝）进行渠道归集：将其账面与实际差额吸收进主账户的 initial_balance
  // 数学守恒验证：主账户最终余额 = book_main + (record_diff_as_tx ? diff : actual_main - book_main) - sum(delta_other) == actual_main
  let otherDeltaSum = 0;
  for (const item of resolvedEntries) {
    if (item.id === main_account_id) continue;
    const delta = item.actual_balance - item.book_balance;
    otherDeltaSum += delta;
    const newInitial = item.initial_balance + delta;
    statements.push(
      c.env.DB.prepare(
        'UPDATE accounts SET initial_balance = ?, current_balance = ? WHERE id = ? AND user_id = ?'
      ).bind(newInitial, item.actual_balance, item.id, user.id)
    );
  }

  const mainItem = resolvedEntries.find((e) => e.id === main_account_id)!;
  const newMainInitial = record_diff_as_tx
    ? mainItem.initial_balance - otherDeltaSum
    : mainItem.initial_balance + (mainItem.actual_balance - mainItem.book_balance);

  statements.push(
    c.env.DB.prepare(
      'UPDATE accounts SET initial_balance = ?, current_balance = ? WHERE id = ? AND user_id = ?'
    ).bind(newMainInitial, mainItem.actual_balance, mainItem.id, user.id)
  );

  await c.env.DB.batch(statements);

  return c.json({
    message:
      diff === 0
        ? '总账核对完全一致，已完成渠道余额归集对齐'
        : record_diff_as_tx
        ? `对账完成：已自动补录一笔 ${txType === 'expense' ? '漏记支出' : '漏记收入'}，各账户余额已对齐`
        : '已完成多账户基线余额对齐',
    total_book: totalBook,
    total_actual: totalActual,
    diff,
    transaction_id: txId,
    tx_type: txType,
  });
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

