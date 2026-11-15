import { Hono } from 'hono';
import { Env, UserSession, Account, Category, Transaction, ItemWithStats, PrepaidCard, Subscription } from '../types';
import { requireAuth } from '../auth';

export const backupRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

backupRouter.use('*', requireAuth);

/**
 * 辅助函数：CSV 字段转义 (处理双引号、逗号、换行)
 */
function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 辅助函数：生成单行 CSV
 */
function toCsvLine(cells: any[]): string {
  return cells.map(escapeCsvCell).join(',') + '\r\n';
}

/**
 * 辅助函数：批量执行 D1 语句 (按 50 句分批，避免超出 D1 单批限制)
 */
async function batchExecuteInChunks(db: D1Database, stmts: D1PreparedStatement[], chunkSize = 50): Promise<void> {
  for (let i = 0; i < stmts.length; i += chunkSize) {
    const chunk = stmts.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      await db.batch(chunk);
    }
  }
}

// 1. 全量数据导出 (JSON) —— 无限制导出所有表
backupRouter.get('/export-full', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const [
    accountsRes,
    categoriesRes,
    transRes,
    itemsRes,
    itemExpensesRes,
    cardsRes,
    cardLogsRes,
    subsRes,
    rulesRes,
  ] = await Promise.all([
    db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all(),
    db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all(),
    db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY transaction_time DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM items WHERE user_id = ? ORDER BY purchase_date DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM item_expenses WHERE user_id = ? ORDER BY expense_date DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM prepaid_cards WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM prepaid_card_logs WHERE user_id = ? ORDER BY log_time DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC').bind(user.id).all(),
    db.prepare('SELECT * FROM auto_rules WHERE user_id = ? ORDER BY priority ASC').bind(user.id).all(),
  ]);

  const backupData = {
    app: 'cf-bookkeeping',
    version: '2.0',
    export_time: new Date().toISOString(),
    user: {
      username: user.username,
      nickname: user.nickname,
    },
    counts: {
      accounts: accountsRes.results?.length || 0,
      categories: categoriesRes.results?.length || 0,
      transactions: transRes.results?.length || 0,
      items: itemsRes.results?.length || 0,
      item_expenses: itemExpensesRes.results?.length || 0,
      prepaid_cards: cardsRes.results?.length || 0,
      prepaid_card_logs: cardLogsRes.results?.length || 0,
      subscriptions: subsRes.results?.length || 0,
      auto_rules: rulesRes.results?.length || 0,
    },
    data: {
      accounts: accountsRes.results || [],
      categories: categoriesRes.results || [],
      transactions: transRes.results || [],
      items: itemsRes.results || [],
      item_expenses: itemExpensesRes.results || [],
      prepaid_cards: cardsRes.results || [],
      prepaid_card_logs: cardLogsRes.results || [],
      subscriptions: subsRes.results || [],
      auto_rules: rulesRes.results || [],
    },
  };

  return c.json(backupData);
});

// 2. 全量数据恢复 (JSON) —— 包含智能合并 (merge) 与完全覆盖 (overwrite)
backupRouter.post('/restore-full', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json<{ backup_data: any; mode?: 'merge' | 'overwrite' }>();

  if (!body.backup_data || typeof body.backup_data !== 'object') {
    return c.json({ error: '无效的备份数据文件' }, 400);
  }

  const rawData = body.backup_data.data || body.backup_data;
  const mode = body.mode === 'overwrite' ? 'overwrite' : 'merge';

  const accounts: any[] = Array.isArray(rawData.accounts) ? rawData.accounts : [];
  const categories: any[] = Array.isArray(rawData.categories) ? rawData.categories : [];
  const items: any[] = Array.isArray(rawData.items) ? rawData.items : [];
  const itemExpenses: any[] = Array.isArray(rawData.item_expenses) ? rawData.item_expenses : [];
  const cards: any[] = Array.isArray(rawData.prepaid_cards) ? rawData.prepaid_cards : [];
  const cardLogs: any[] = Array.isArray(rawData.prepaid_card_logs) ? rawData.prepaid_card_logs : [];
  const subs: any[] = Array.isArray(rawData.subscriptions) ? rawData.subscriptions : [];
  const rules: any[] = Array.isArray(rawData.auto_rules) ? rawData.auto_rules : [];
  const transactions: any[] = Array.isArray(rawData.transactions) ? rawData.transactions : [];

  if (accounts.length === 0 && categories.length === 0 && transactions.length === 0) {
    return c.json({ error: '备份文件中未找到有效的记账数据' }, 400);
  }

  // 如果是完全覆盖模式，先清空当前用户的数据 (按依赖倒序删除)
  if (mode === 'overwrite') {
    await db.batch([
      db.prepare('DELETE FROM transactions WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM item_expenses WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM prepaid_card_logs WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM subscriptions WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM prepaid_cards WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM items WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM auto_rules WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM categories WHERE user_id = ?').bind(user.id),
      db.prepare('DELETE FROM accounts WHERE user_id = ?').bind(user.id),
    ]);
  }

  const stmts: D1PreparedStatement[] = [];

  // 1. 账户导入 (强制绑定当前 user.id)
  for (const a of accounts) {
    if (!a.id || !a.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance, icon, color, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             initial_balance = excluded.initial_balance,
             icon = excluded.icon,
             color = excluded.color,
             sort_order = excluded.sort_order`
        )
        .bind(
          a.id,
          user.id,
          a.name,
          a.type || 'other',
          a.currency || 'CNY',
          a.initial_balance || 0,
          a.current_balance || 0,
          a.icon || 'wallet',
          a.color || '#6366f1',
          a.sort_order || 0
        )
    );
  }

  // 2. 分类导入
  for (const cat of categories) {
    if (!cat.id || !cat.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO categories (id, user_id, name, type, icon, color, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             icon = excluded.icon,
             color = excluded.color,
             sort_order = excluded.sort_order`
        )
        .bind(
          cat.id,
          user.id,
          cat.name,
          cat.type || 'expense',
          cat.icon || 'tag',
          cat.color || '#64748B',
          cat.sort_order || 0
        )
    );
  }

  // 3. 大件物品导入
  for (const it of items) {
    if (!it.id || !it.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO items (id, user_id, name, category, price, purchase_date, status, salvage_value, expected_lifespan_days, warranty_deadline, location, remark, wishlist_cooling_days, wishlist_created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category = excluded.category,
             price = excluded.price,
             purchase_date = excluded.purchase_date,
             status = excluded.status,
             salvage_value = excluded.salvage_value,
             expected_lifespan_days = excluded.expected_lifespan_days,
             warranty_deadline = excluded.warranty_deadline,
             location = excluded.location,
             remark = excluded.remark,
             wishlist_cooling_days = excluded.wishlist_cooling_days,
             wishlist_created_at = excluded.wishlist_created_at`
        )
        .bind(
          it.id,
          user.id,
          it.name,
          it.category || '数码电器',
          it.price || 0,
          it.purchase_date || new Date().toISOString().slice(0, 10),
          it.status || 'active',
          it.salvage_value || 0,
          it.expected_lifespan_days || 1095,
          it.warranty_deadline || null,
          it.location || null,
          it.remark || null,
          it.wishlist_cooling_days || null,
          it.wishlist_created_at || null
        )
    );
  }

  // 4. 大件追加费用导入
  for (const ie of itemExpenses) {
    if (!ie.id || !ie.item_id) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO item_expenses (id, user_id, item_id, amount, remark, expense_date)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             amount = excluded.amount,
             remark = excluded.remark,
             expense_date = excluded.expense_date`
        )
        .bind(ie.id, user.id, ie.item_id, ie.amount || 0, ie.remark || '', ie.expense_date || new Date().toISOString().slice(0, 10))
    );
  }

  // 5. 充值卡与次卡导入
  for (const pc of cards) {
    if (!pc.id || !pc.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO prepaid_cards (id, user_id, name, type, merchant, icon, color, initial_amount, initial_value, gift_amount, current_value, total_spent_amount, total_value, status, valid_until, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             type = excluded.type,
             merchant = excluded.merchant,
             current_value = excluded.current_value,
             total_spent_amount = excluded.total_spent_amount,
             total_value = excluded.total_value,
             status = excluded.status,
             valid_until = excluded.valid_until,
             remark = excluded.remark`
        )
        .bind(
          pc.id,
          user.id,
          pc.name,
          pc.type || 'balance',
          pc.merchant || null,
          pc.icon || 'credit-card',
          pc.color || '#6366f1',
          pc.initial_amount || 0,
          pc.initial_value || 0,
          pc.gift_amount || 0,
          pc.current_value || 0,
          pc.total_spent_amount || 0,
          pc.total_value || 0,
          pc.status || 'active',
          pc.valid_until || null,
          pc.remark || null
        )
    );
  }

  // 6. 订阅导入
  for (const s of subs) {
    if (!s.id || !s.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO subscriptions (id, user_id, name, category_id, account_id, amount, currency, period_type, period_interval, billing_day, first_billing_date, next_billing_date, auto_record, status, icon, color, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             category_id = excluded.category_id,
             account_id = excluded.account_id,
             amount = excluded.amount,
             period_type = excluded.period_type,
             period_interval = excluded.period_interval,
             next_billing_date = excluded.next_billing_date,
             auto_record = excluded.auto_record,
             status = excluded.status,
             icon = excluded.icon,
             color = excluded.color,
             remark = excluded.remark`
        )
        .bind(
          s.id,
          user.id,
          s.name,
          s.category_id || null,
          s.account_id || null,
          s.amount || 0,
          s.currency || 'CNY',
          s.period_type || 'monthly',
          s.period_interval || 1,
          s.billing_day || 1,
          s.first_billing_date || new Date().toISOString().slice(0, 10),
          s.next_billing_date || new Date().toISOString().slice(0, 10),
          s.auto_record ?? 1,
          s.status || 'active',
          s.icon || 'calendar',
          s.color || '#3b82f6',
          s.remark || null
        )
    );
  }

  // 7. 记账流水导入
  for (const t of transactions) {
    if (!t.id || typeof t.amount !== 'number') continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, scene, item_id, card_id, subscription_id, external_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             type = excluded.type,
             amount = excluded.amount,
             account_id = excluded.account_id,
             destination_account_id = excluded.destination_account_id,
             category_id = excluded.category_id,
             transaction_time = excluded.transaction_time,
             remark = excluded.remark,
             scene = excluded.scene,
             item_id = excluded.item_id,
             card_id = excluded.card_id,
             subscription_id = excluded.subscription_id,
             external_id = excluded.external_id`
        )
        .bind(
          t.id,
          user.id,
          t.type || 'expense',
          t.amount,
          t.account_id,
          t.destination_account_id || null,
          t.category_id || null,
          t.transaction_time || new Date().toISOString(),
          t.remark || null,
          t.scene || null,
          t.item_id || null,
          t.card_id || null,
          t.subscription_id || null,
          t.external_id || null
        )
    );
  }

  // 8. 充值卡日志导入
  for (const log of cardLogs) {
    if (!log.id || !log.card_id) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO prepaid_card_logs (id, card_id, user_id, type, delta_value, actual_amount, transaction_id, account_id, log_time, remark)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             delta_value = excluded.delta_value,
             actual_amount = excluded.actual_amount,
             remark = excluded.remark`
        )
        .bind(
          log.id,
          log.card_id,
          user.id,
          log.type || 'consume',
          log.delta_value || 0,
          log.actual_amount || 0,
          log.transaction_id || null,
          log.account_id || null,
          log.log_time || new Date().toISOString().slice(0, 19),
          log.remark || null
        )
    );
  }

  // 9. 自动规则导入
  for (const r of rules) {
    if (!r.id || !r.name) continue;
    stmts.push(
      db
        .prepare(
          `INSERT INTO auto_rules (id, user_id, name, pattern, match_type, transaction_type, target_account_id, target_category_id, target_scene, priority, enabled)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             pattern = excluded.pattern,
             match_type = excluded.match_type,
             priority = excluded.priority,
             enabled = excluded.enabled`
        )
        .bind(
          r.id,
          user.id,
          r.name,
          r.pattern || '',
          r.match_type || 'contains',
          r.transaction_type || 'expense',
          r.target_account_id || null,
          r.target_category_id || null,
          r.target_scene || null,
          r.priority || 0,
          r.enabled ?? 1
        )
    );
  }

  // 分批提交写操作
  await batchExecuteInChunks(db, stmts, 50);

  return c.json({
    success: true,
    message: '灾备恢复执行成功',
    restored: {
      accounts: accounts.length,
      categories: categories.length,
      items: items.length,
      item_expenses: itemExpenses.length,
      prepaid_cards: cards.length,
      subscriptions: subs.length,
      transactions: transactions.length,
      auto_rules: rules.length,
    },
  });
});

// 3. 规范 CSV 导出 (带 UTF-8 BOM 兼容 Excel)
backupRouter.get('/export-csv', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const scope = c.req.query('scope') || 'transactions'; // 'transactions' | 'items' | 'cards' | 'subscriptions'
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  // UTF-8 BOM，确保 Windows/Mac Excel 打开中文不乱码
  const BOM = '\uFEFF';
  let csvContent = BOM;
  let filename = `cf_bookkeeping_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;

  if (scope === 'transactions') {
    let query = `
      SELECT t.*, 
             a.name AS account_name, 
             da.name AS dest_account_name, 
             c.name AS category_name,
             i.name AS item_name,
             pc.name AS card_name,
             s.name AS sub_name
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN items i ON t.item_id = i.id
      LEFT JOIN prepaid_cards pc ON t.card_id = pc.id
      LEFT JOIN subscriptions s ON t.subscription_id = s.id
      WHERE t.user_id = ?
    `;
    const params: any[] = [user.id];
    if (startDate) {
      query += ' AND t.transaction_time >= ?';
      params.push(`${startDate} 00:00:00`);
    }
    if (endDate) {
      query += ' AND t.transaction_time <= ?';
      params.push(`${endDate} 23:59:59`);
    }
    query += ' ORDER BY t.transaction_time DESC';

    const rows = await db.prepare(query).bind(...params).all<any>();

    // CSV 表头
    csvContent += toCsvLine([
      '交易单号',
      '交易时间',
      '类型',
      '金额(元)',
      '扣款/发生账户',
      '转入账户',
      '分类',
      '消费场景',
      '商户或备注说明',
      '关联大件资产',
      '关联充值卡',
      '关联周期订阅',
      '外部交易单号',
    ]);

    for (const r of rows.results || []) {
      const typeLabel = r.type === 'income' ? '收入' : r.type === 'transfer' ? '内部转账' : '支出';
      const amountYuan = (r.amount / 100).toFixed(2);
      csvContent += toCsvLine([
        r.id,
        r.transaction_time,
        typeLabel,
        amountYuan,
        r.account_name || '未知账户',
        r.dest_account_name || '',
        r.category_name || (r.type === 'transfer' ? '转账' : '未分类'),
        r.scene || '',
        r.remark || '',
        r.item_name || '',
        r.card_name || '',
        r.sub_name || '',
        r.external_id || '',
      ]);
    }
  } else if (scope === 'items') {
    const rows = await db
      .prepare(
        `SELECT i.*, COALESCE(SUM(ie.amount), 0) AS total_extra
         FROM items i
         LEFT JOIN item_expenses ie ON i.id = ie.item_id
         WHERE i.user_id = ?
         GROUP BY i.id
         ORDER BY i.purchase_date DESC`
      )
      .bind(user.id)
      .all<any>();

    csvContent += toCsvLine([
      '物品名称',
      '状态',
      '分类',
      '买入日期',
      '购入原价(元)',
      '配件维护追加(元)',
      '二手残值(元)',
      '净持有支出(元)',
      '服役天数',
      '日均成本(元/天)',
      '质保到期日',
      '存放位置',
      '备注说明',
    ]);

    const today = new Date();
    for (const it of rows.results || []) {
      const buyDate = new Date(it.purchase_date);
      const days = Math.max(1, Math.floor((today.getTime() - buyDate.getTime()) / (1000 * 3600 * 24)) + 1);
      const netAmount = (it.price || 0) + (it.total_extra || 0) - (it.salvage_value || 0);
      const dailyYuan = (netAmount / days / 100).toFixed(2);

      let statusLabel = '服役在用中';
      if (it.status === 'idle') statusLabel = '闲置吃灰';
      else if (it.status === 'broken') statusLabel = '损坏淘汰';
      else if (it.status === 'resold') statusLabel = '已出二手';
      else if (it.status === 'wishlist') statusLabel = '冷静期心愿单';

      csvContent += toCsvLine([
        it.name,
        statusLabel,
        it.category || '数码电器',
        it.purchase_date,
        (it.price / 100).toFixed(2),
        (it.total_extra / 100).toFixed(2),
        (it.salvage_value / 100).toFixed(2),
        (netAmount / 100).toFixed(2),
        days,
        dailyYuan,
        it.warranty_deadline || '',
        it.location || '',
        it.remark || '',
      ]);
    }
  } else if (scope === 'cards') {
    const rows = await db
      .prepare('SELECT * FROM prepaid_cards WHERE user_id = ? ORDER BY created_at DESC')
      .bind(user.id)
      .all<any>();

    csvContent += toCsvLine([
      '会员卡名称',
      '类型',
      '商家门店',
      '累计实付金额(元)',
      '总面值或总次数',
      '当前剩余面值或次数',
      '折算剩余价值(元)',
      '单次折算成本(元)',
      '有效期截止日',
      '状态',
      '备注说明',
    ]);

    for (const c of rows.results || []) {
      const isTimes = c.type === 'times';
      const perUnitCostYuan = isTimes && c.total_value > 0 ? (c.total_spent_amount / c.total_value / 100).toFixed(2) : '-';
      const remainingWorthYuan = isTimes && c.total_value > 0 ? ((c.total_spent_amount / c.total_value) * c.current_value / 100).toFixed(2) : (c.current_value / 100).toFixed(2);

      csvContent += toCsvLine([
        c.name,
        isTimes ? '计次卡' : '储值余额卡',
        c.merchant || '',
        (c.total_spent_amount / 100).toFixed(2),
        isTimes ? `${c.total_value} 次` : `${(c.total_value / 100).toFixed(2)} 元`,
        isTimes ? `${c.current_value} 次` : `${(c.current_value / 100).toFixed(2)} 元`,
        remainingWorthYuan,
        perUnitCostYuan,
        c.valid_until || '长期有效',
        c.status === 'active' ? '正常在役' : c.status === 'exhausted' ? '已用尽' : c.status === 'expired' ? '已过期' : '已退款',
        c.remark || '',
      ]);
    }
  } else if (scope === 'subscriptions') {
    const rows = await db
      .prepare(
        `SELECT s.*, a.name AS account_name, c.name AS category_name
         FROM subscriptions s
         LEFT JOIN accounts a ON s.account_id = a.id
         LEFT JOIN categories c ON s.category_id = c.id
         WHERE s.user_id = ?
         ORDER BY s.created_at DESC`
      )
      .bind(user.id)
      .all<any>();

    csvContent += toCsvLine([
      '订阅服务名称',
      '周期类型',
      '每期扣费(元)',
      '折合月度支出(元/月)',
      '结算账户',
      '分类',
      '下次预计扣费日',
      '自动扣款入账',
      '状态',
      '备注说明',
    ]);

    for (const s of rows.results || []) {
      const interval = Math.max(1, s.period_interval || 1);
      let monthlyAmt = s.amount;
      if (s.period_type === 'monthly') monthlyAmt = Math.round(s.amount / interval);
      else if (s.period_type === 'yearly') monthlyAmt = Math.round(s.amount / (12 * interval));
      else if (s.period_type === 'weekly') monthlyAmt = Math.round((s.amount * 52) / (12 * interval));
      else if (s.period_type === 'quarterly') monthlyAmt = Math.round(s.amount / (3 * interval));

      const periodLabel = s.period_type === 'yearly' ? '按年' : s.period_type === 'weekly' ? '按周' : s.period_type === 'quarterly' ? '按季' : '按月';

      csvContent += toCsvLine([
        s.name,
        periodLabel,
        (s.amount / 100).toFixed(2),
        (monthlyAmt / 100).toFixed(2),
        s.account_name || '未指定账户',
        s.category_name || '未分类',
        s.next_billing_date,
        s.auto_record === 1 ? '是 (自动)' : '否 (手动确认)',
        s.status === 'active' ? '正常在役' : s.status === 'paused' ? '已暂停' : '已取消',
        s.remark || '',
      ]);
    }
  }

  return new Response(csvContent, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// 4. 解析第三方记账应用 CSV (钱迹 Qianji / 随手记 / 鲨鱼记账 / 通用记账)
backupRouter.post('/parse-third-party', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json<{ csv_text: string; app_source?: string }>();

  if (!body.csv_text || !body.csv_text.trim()) {
    return c.json({ error: 'CSV 内容为空' }, 400);
  }

  const [accountsRes, categoriesRes] = await Promise.all([
    db.prepare('SELECT * FROM accounts WHERE user_id = ?').bind(user.id).all<Account>(),
    db.prepare('SELECT * FROM categories WHERE user_id = ?').bind(user.id).all<Category>(),
  ]);

  const existingAccounts = accountsRes.results || [];
  const existingCategories = categoriesRes.results || [];

  const lines = body.csv_text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return c.json({ error: 'CSV 行数过少，未找到有效的记账数据' }, 400);
  }

  // 辅助解析单行 CSV
  const parseRow = (line: string): string[] => {
    const res: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = !inQuote;
        }
      } else if (ch === ',' && !inQuote) {
        res.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur.trim());
    return res;
  };

  const header = parseRow(lines[0]);
  const headerIdx: Record<string, number> = {};
  header.forEach((col, idx) => {
    headerIdx[col.replace(/^[\uFEFF]/, '').trim()] = idx;
  });

  // 常见字段名探测 (兼容钱迹、随手记、鲨鱼、标准格式)
  const findCol = (...names: string[]) => {
    for (const n of names) {
      if (headerIdx[n] !== undefined) return headerIdx[n];
    }
    return -1;
  };

  const timeIdx = findCol('时间', '日期', '交易时间', '记账时间', 'Time', 'Date');
  const typeIdx = findCol('类型', '收支类型', '交易类型', 'Type');
  const amountIdx = findCol('金额', '金额(元)', '交易金额', 'Amount');
  const catIdx = findCol('分类', '一级分类', '类别', 'Category');
  const subCatIdx = findCol('二级分类', '子分类', '子类别', 'SubCategory');
  const accIdx = findCol('账户', '账户1', '支付账户', '资产账户', 'Account');
  const destAccIdx = findCol('账户2', '转入账户', '目标账户', 'ToAccount');
  const remarkIdx = findCol('备注', '商品说明', '商户', '说明', 'Remark', 'Note');
  const sceneIdx = findCol('场景', '标签', '消费场景', 'Tag');

  if (timeIdx === -1 || amountIdx === -1) {
    return c.json({ error: '未能识别 CSV 中的“时间”或“金额”列，请核对 CSV 表头格式' }, 400);
  }

  const parsedItems: any[] = [];
  const discoveredAccounts = new Set<string>();
  const discoveredCategories = new Set<string>();

  for (let i = 1; i < lines.length; i++) {
    const cells = parseRow(lines[i]);
    if (cells.length < 2) continue;

    const rawTime = cells[timeIdx] || '';
    const rawAmount = cells[amountIdx] || '0';
    const rawType = typeIdx !== -1 ? cells[typeIdx] : '';
    const rawCat = catIdx !== -1 ? cells[catIdx] : '';
    const rawSubCat = subCatIdx !== -1 ? cells[subCatIdx] : '';
    const rawAcc = accIdx !== -1 ? cells[accIdx] : '';
    const rawDestAcc = destAccIdx !== -1 ? cells[destAccIdx] : '';
    const rawRemark = remarkIdx !== -1 ? cells[remarkIdx] : '';
    const rawScene = sceneIdx !== -1 ? cells[sceneIdx] : '';

    const cleanAmtNum = parseFloat(rawAmount.replace(/[¥￥, ]/g, ''));
    if (isNaN(cleanAmtNum) || cleanAmtNum === 0) continue;

    let type: 'expense' | 'income' | 'transfer' = 'expense';
    if (rawType.includes('收入') || rawType.toLowerCase() === 'income') {
      type = 'income';
    } else if (rawType.includes('转账') || rawType.toLowerCase() === 'transfer' || (rawDestAcc && rawDestAcc !== rawAcc)) {
      type = 'transfer';
    }

    const finalCatName = rawSubCat ? `${rawCat}/${rawSubCat}` : rawCat || (type === 'transfer' ? '转账' : '未分类');
    const finalAccName = rawAcc || '通用账户';

    if (finalAccName) discoveredAccounts.add(finalAccName);
    if (finalCatName && type !== 'transfer') discoveredCategories.add(finalCatName);

    // 标准化时间格式 (YYYY-MM-DD HH:mm:ss)
    let formattedTime = rawTime.replace(/\//g, '-').trim();
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(formattedTime)) {
      formattedTime += ' 12:00:00';
    } else if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{2}$/.test(formattedTime)) {
      formattedTime += ':00';
    }

    parsedItems.push({
      temp_id: `temp_${i}`,
      transaction_time: formattedTime,
      type,
      amount: Math.round(Math.abs(cleanAmtNum) * 100),
      amount_yuan: Math.abs(cleanAmtNum),
      account_name: finalAccName,
      dest_account_name: rawDestAcc || undefined,
      category_name: finalCatName,
      remark: rawRemark || undefined,
      scene: rawScene || undefined,
    });
  }

  return c.json({
    total_parsed: parsedItems.length,
    discovered_accounts: Array.from(discoveredAccounts),
    discovered_categories: Array.from(discoveredCategories),
    sample_rows: parsedItems.slice(0, 10),
    all_rows: parsedItems,
  });
});

// 5. 批量提交第三方记账数据落库 (支持自动补充缺失账户与分类)
backupRouter.post('/import-third-party', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json<{
    rows: Array<{
      transaction_time: string;
      type: 'expense' | 'income' | 'transfer';
      amount: number; // 单位：分
      account_name: string;
      dest_account_name?: string;
      category_name?: string;
      remark?: string;
      scene?: string;
    }>;
    create_missing_accounts?: boolean;
    create_missing_categories?: boolean;
  }>();

  if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
    return c.json({ error: '导入数据行为空' }, 400);
  }

  // 1. 查询现有的账户与分类
  const [accountsRes, categoriesRes] = await Promise.all([
    db.prepare('SELECT * FROM accounts WHERE user_id = ?').bind(user.id).all<Account>(),
    db.prepare('SELECT * FROM categories WHERE user_id = ?').bind(user.id).all<Category>(),
  ]);

  const accountMap = new Map<string, string>();
  for (const a of accountsRes.results || []) {
    accountMap.set(a.name.toLowerCase(), a.id);
  }

  const categoryMap = new Map<string, string>();
  for (const cat of categoriesRes.results || []) {
    categoryMap.set(`${cat.name.toLowerCase()}_${cat.type}`, cat.id);
  }

  const newEntitiesStmts: D1PreparedStatement[] = [];

  // 辅助函数：根据名称获取或创建账户
  const getOrCreateAccountId = (name: string): string => {
    const key = name.trim().toLowerCase();
    if (accountMap.has(key)) return accountMap.get(key)!;

    const newId = `acc_imp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    accountMap.set(key, newId);
    newEntitiesStmts.push(
      db
        .prepare(
          'INSERT INTO accounts (id, user_id, name, type, currency, initial_balance, current_balance, icon, color) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)'
        )
        .bind(newId, user.id, name.trim(), 'other', 'CNY', 'wallet', '#6366f1')
    );
    return newId;
  };

  // 辅助函数：根据名称获取或创建分类
  const getOrCreateCategoryId = (name: string, type: 'expense' | 'income'): string => {
    const key = `${name.trim().toLowerCase()}_${type}`;
    if (categoryMap.has(key)) return categoryMap.get(key)!;

    const newId = `cat_imp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    categoryMap.set(key, newId);
    newEntitiesStmts.push(
      db
        .prepare('INSERT INTO categories (id, user_id, name, type, icon, color) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(newId, user.id, name.trim(), type, 'tag', '#64748B')
    );
    return newId;
  };

  // 2. 先插入补充的缺失账户与分类
  for (const r of body.rows) {
    if (r.account_name) getOrCreateAccountId(r.account_name);
    if (r.dest_account_name) getOrCreateAccountId(r.dest_account_name);
    if (r.category_name && r.type !== 'transfer') {
      getOrCreateCategoryId(r.category_name, r.type);
    }
  }

  if (newEntitiesStmts.length > 0) {
    await batchExecuteInChunks(db, newEntitiesStmts, 50);
  }

  // 3. 构建 transactions 插入语句
  const txStmts: D1PreparedStatement[] = [];
  for (const r of body.rows) {
    const txId = `tx_imp_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const accId = getOrCreateAccountId(r.account_name);
    const destAccId = r.type === 'transfer' && r.dest_account_name ? getOrCreateAccountId(r.dest_account_name) : null;
    const catId = r.type !== 'transfer' && r.category_name ? getOrCreateCategoryId(r.category_name, r.type) : null;

    txStmts.push(
      db
        .prepare(
          `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, scene)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          txId,
          user.id,
          r.type,
          r.amount,
          accId,
          destAccId,
          catId,
          r.transaction_time,
          r.remark || null,
          r.scene || null
        )
    );
  }

  await batchExecuteInChunks(db, txStmts, 50);

  return c.json({
    success: true,
    imported_count: txStmts.length,
    new_accounts_count: accountMap.size - (accountsRes.results?.length || 0),
    new_categories_count: categoryMap.size - (categoriesRes.results?.length || 0),
  });
});
