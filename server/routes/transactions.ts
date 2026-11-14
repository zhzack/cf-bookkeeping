import { Hono } from 'hono';
import { Env, UserSession, Transaction, Account, Category } from '../types';
import { requireAuth } from '../auth';
import { AutoRuleLike, matchAutoRules } from '../../src/utils/ruleMatcher';
import {
  getNowUTC8Str,
  matchAccount,
  matchCategory,
  normalizeTimeString,
  parseQuickText,
} from '../quickParse';
import {
  MAX_PHOTOS_PER_RECORD,
  ValidatedPhoto,
  validatePhotoDataUrls,
  insertPhotos,
  listPhotos,
  syncPhotos,
  deletePhotosByParent,
  servePhotoBinary,
} from '../photos';

export const transactionsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

transactionsRouter.use('*', requireAuth);

interface ItemDetailsInput {
  name?: string;
  category?: string;
  expected_days?: number | string | null;
  warranty_date?: string | null;
  location?: string | null;
  remark?: string | null;
}

async function createItemRecord(
  db: D1Database,
  userId: string,
  priceCents: number,
  purchaseDate: string,
  details: ItemDetailsInput,
  photos: ValidatedPhoto[]
): Promise<string> {
  const itemId = 'itm_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const numExpected = details.expected_days ? Math.round(Number(details.expected_days)) : null;
  await db
    .prepare(
      `INSERT INTO items (id, user_id, name, category, price, resale_price, purchase_date, status, retired_date, expected_days, warranty_date, location, cooling_days, remark)
       VALUES (?, ?, ?, ?, ?, 0, ?, 'using', NULL, ?, ?, ?, 7, ?)`
    )
    .bind(
      itemId,
      userId,
      details.name!.trim(),
      details.category?.trim() || '数码科技',
      priceCents,
      purchaseDate,
      numExpected && numExpected > 0 ? numExpected : null,
      details.warranty_date || null,
      details.location?.trim() || null,
      details.remark?.trim() || null
    )
    .run();

  if (photos.length > 0) {
    await insertPhotos(db, 'item_photos', 'item_id', itemId, userId, photos);
  }
  return itemId;
}

const PRESET_SCENES = [
  '日常三餐',
  '通勤出行',
  '外卖夜宵',
  '居家日用',
  '社交聚会',
  '约会请客',
  '旅行出差',
  '情绪消费',
  '自我提升',
  '人情往来',
  '医疗健康',
  '固定订阅',
];

function normalizeScene(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, 24) : null;
}

function escapeLikePattern(str: string): string {
  return str.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function normalizeDailyCostFields(
  type: string,
  amortizeDaysRaw: unknown,
  amortizeStartDateRaw: unknown,
  excludeDailyCostRaw: unknown,
  transactionTime: string
): { amortizeDays: number | null; amortizeStartDate: string | null; excludeDailyCost: number; error?: string } {
  if (type !== 'expense') {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const excludeDailyCost = excludeDailyCostRaw ? 1 : 0;
  if (excludeDailyCost) {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 1 };
  }

  if (amortizeDaysRaw === null || amortizeDaysRaw === undefined || amortizeDaysRaw === '') {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const parsedDays = Math.round(Number(amortizeDaysRaw));
  if (isNaN(parsedDays) || parsedDays < 1 || parsedDays > 36500) {
    return {
      amortizeDays: null,
      amortizeStartDate: null,
      excludeDailyCost: 0,
      error: '摊销天数需在 1 ~ 36500 天之间',
    };
  }

  if (parsedDays <= 1) {
    return { amortizeDays: null, amortizeStartDate: null, excludeDailyCost: 0 };
  }

  const rawStart = typeof amortizeStartDateRaw === 'string' ? amortizeStartDateRaw.trim().slice(0, 10) : '';
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(rawStart) ? rawStart : transactionTime.slice(0, 10);

  return {
    amortizeDays: parsedDays,
    amortizeStartDate: startDate,
    excludeDailyCost: 0,
  };
}

interface TxFilterInput {
  month?: string;
  startDate?: string;
  endDate?: string;
  accountId?: string;
  categoryId?: string;
  type?: string;
  scene?: string;
  search?: string;
  exactRemark?: string;
}

const TX_LIST_JOINS = `
  FROM transactions t
  LEFT JOIN accounts a ON t.account_id = a.id
  LEFT JOIN accounts da ON t.destination_account_id = da.id
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN items i ON t.item_id = i.id
  LEFT JOIN prepaid_cards pc ON t.card_id = pc.id
`;

function buildTransactionFilterClause(userId: string, filter: TxFilterInput) {
  let whereClause = 'WHERE t.user_id = ?';
  const params: any[] = [userId];

  if (filter.startDate && /^\d{4}-\d{2}-\d{2}$/.test(filter.startDate)) {
    whereClause += ' AND t.transaction_time >= ?';
    params.push(`${filter.startDate} 00:00:00`);
  }
  if (filter.endDate && /^\d{4}-\d{2}-\d{2}$/.test(filter.endDate)) {
    whereClause += ' AND t.transaction_time <= ?';
    params.push(`${filter.endDate} 23:59:59`);
  }
  if (!filter.startDate && !filter.endDate && filter.month && filter.month !== 'all') {
    whereClause += ' AND t.transaction_time LIKE ?';
    params.push(`${filter.month}%`);
  }

  if (filter.accountId) {
    whereClause += ' AND (t.account_id = ? OR t.destination_account_id = ?)';
    params.push(filter.accountId, filter.accountId);
  }

  if (filter.categoryId) {
    if (filter.categoryId === '__uncategorized__') {
      whereClause += " AND (t.category_id IS NULL OR t.category_id = '')";
    } else {
      whereClause += ' AND t.category_id = ?';
      params.push(filter.categoryId);
    }
  }

  if (filter.type) {
    whereClause += ' AND t.type = ?';
    params.push(filter.type);
  }

  if (filter.scene) {
    if (filter.scene === '__none__') {
      whereClause += " AND (t.scene IS NULL OR TRIM(t.scene) = '')";
    } else {
      whereClause += ' AND t.scene = ?';
      params.push(filter.scene);
    }
  }

  if (filter.exactRemark !== undefined) {
    whereClause += " AND TRIM(COALESCE(t.remark, '')) = ?";
    params.push(filter.exactRemark);
  }

  const trimmedSearch = filter.search?.trim() || '';
  if (trimmedSearch) {
    const pattern = `%${escapeLikePattern(trimmedSearch)}%`;
    whereClause += ` AND (
      COALESCE(t.remark, '') LIKE ? ESCAPE '\\'
      OR COALESCE(t.scene, '') LIKE ? ESCAPE '\\'
      OR COALESCE(c.name, '') LIKE ? ESCAPE '\\'
      OR COALESCE(a.name, '') LIKE ? ESCAPE '\\'
      OR COALESCE(da.name, '') LIKE ? ESCAPE '\\'
      OR COALESCE(i.name, '') LIKE ? ESCAPE '\\'
      OR COALESCE(pc.name, '') LIKE ? ESCAPE '\\'
      OR printf('%.2f', t.amount / 100.0) LIKE ? ESCAPE '\\'
    )`;
    params.push(pattern, pattern, pattern, pattern, pattern, pattern, pattern);
  }

  return { whereClause, params };
}

// 获取常用与历史消费场景列表
transactionsRouter.get('/scenes', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `SELECT scene, COUNT(*) AS count
     FROM transactions
     WHERE user_id = ? AND scene IS NOT NULL AND TRIM(scene) != ''
     GROUP BY scene
     ORDER BY count DESC, scene ASC`
  )
    .bind(user.id)
    .all<{ scene: string; count: number }>();

  const countMap: Record<string, number> = {};
  const merged: string[] = [];
  for (const row of results) {
    if (row.scene) {
      countMap[row.scene] = row.count;
      merged.push(row.scene);
    }
  }
  for (const preset of PRESET_SCENES) {
    if (!merged.includes(preset)) merged.push(preset);
  }

  return c.json({
    scenes: merged,
    presets: PRESET_SCENES,
    used: results,
  });
});

type BatchScope = 'ids' | 'category' | 'account' | 'account_category' | 'remark' | 'filter';

function buildBatchFilterInput(body: any, scope: Exclude<BatchScope, 'ids'>): { filterInput?: TxFilterInput; error?: string } {
  if (scope === 'filter') {
    const f = body?.filter || {};
    return {
      filterInput: {
        month: typeof f.month === 'string' ? f.month : undefined,
        startDate: typeof f.start_date === 'string' ? f.start_date : undefined,
        endDate: typeof f.end_date === 'string' ? f.end_date : undefined,
        accountId: typeof f.account_id === 'string' ? f.account_id : undefined,
        categoryId: typeof f.category_id === 'string' ? f.category_id : undefined,
        type: typeof f.type === 'string' ? f.type : undefined,
        scene: typeof f.scene === 'string' ? f.scene : undefined,
        search: typeof f.search === 'string' ? f.search : undefined,
      },
    };
  }

  const txType = body?.type === 'income' ? 'income' : body?.type === 'expense' ? 'expense' : undefined;
  if (scope === 'remark') {
    const exactRemark = typeof body?.remark === 'string' ? body.remark.trim() : '';
    if (!exactRemark) {
      return { error: '缺少备注/商户内容，无法按同类备注批量操作' };
    }
    return {
      filterInput: {
        type: txType,
        exactRemark,
        startDate: typeof body?.start_date === 'string' ? body.start_date : undefined,
        endDate: typeof body?.end_date === 'string' ? body.end_date : undefined,
      },
    };
  }
  const categoryId = typeof body?.category_id === 'string' ? body.category_id.trim() : '';
  const accountId = typeof body?.account_id === 'string' ? body.account_id.trim() : '';

  if ((scope === 'category' || scope === 'account_category') && !categoryId) {
    return { error: '缺少分类参数，无法按分类批量操作' };
  }
  if ((scope === 'account' || scope === 'account_category') && !accountId) {
    return { error: '缺少账户参数，无法按账户批量操作' };
  }

  return {
    filterInput: {
      type: txType,
      categoryId: scope === 'category' || scope === 'account_category' ? categoryId : undefined,
      accountId: scope === 'account' || scope === 'account_category' ? accountId : undefined,
      startDate: typeof body?.start_date === 'string' ? body.start_date : undefined,
      endDate: typeof body?.end_date === 'string' ? body.end_date : undefined,
    },
  };
}

function normalizeBatchIds(rawIds: unknown): string[] {
  if (!Array.isArray(rawIds)) return [];
  return Array.from(
    new Set(
      rawIds
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim())
    )
  ).slice(0, 500);
}

// 按多选ID / 分类 / 账户 / 组合 / 当前筛选条件批量标记消费场景（支持 preview 统计数量）
transactionsRouter.patch('/batch-scene', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const scope = body?.scope as BatchScope;
  const isPreview = Boolean(body?.preview);
  const normalizedScene = normalizeScene(body?.scene);
  const onlyUntagged = body?.only_untagged !== undefined ? Boolean(body.only_untagged) : true;

  if (!['ids', 'category', 'account', 'account_category', 'remark', 'filter'].includes(scope)) {
    return c.json({ error: '无效的批量标记范围' }, 400);
  }

  const untaggedSql =
    onlyUntagged && normalizedScene !== null ? " AND (scene IS NULL OR TRIM(scene) = '')" : '';

  if (scope === 'ids') {
    const ids = normalizeBatchIds(body?.ids);
    if (ids.length === 0) {
      return isPreview
        ? c.json({ total_count: 0, untagged_count: 0 })
        : c.json({ error: '请先选择要标记的流水' }, 400);
    }

    const CHUNK = 80;
    if (isPreview) {
      let totalCount = 0;
      let untaggedCount = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        const row = await c.env.DB.prepare(
          `SELECT
            COUNT(*) AS total_count,
            COALESCE(SUM(CASE WHEN scene IS NULL OR TRIM(scene) = '' THEN 1 ELSE 0 END), 0) AS untagged_count
           FROM transactions
           WHERE user_id = ? AND type != 'transfer' AND id IN (${placeholders})`
        )
          .bind(user.id, ...slice)
          .first<{ total_count: number; untagged_count: number }>();
        totalCount += row?.total_count || 0;
        untaggedCount += row?.untagged_count || 0;
      }
      return c.json({ total_count: totalCount, untagged_count: untaggedCount });
    }

    let updated = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const res = await c.env.DB.prepare(
        `UPDATE transactions
         SET scene = ?
         WHERE user_id = ? AND type != 'transfer' ${untaggedSql} AND id IN (${placeholders})`
      )
        .bind(normalizedScene, user.id, ...slice)
        .run();
      updated += res.meta.changes || 0;
    }

    return c.json({
      updated,
      scene: normalizedScene,
      message: normalizedScene
        ? `已为 ${updated} 笔流水批量标记「${normalizedScene}」`
        : `已清除 ${updated} 笔流水的消费场景`,
    });
  }

  const resolved = buildBatchFilterInput(body, scope);
  if (resolved.error || !resolved.filterInput) {
    return c.json({ error: resolved.error || '参数无效' }, 400);
  }
  const { whereClause, params } = buildTransactionFilterClause(user.id, {
    ...resolved.filterInput,
    type: resolved.filterInput.type || (scope !== 'filter' ? 'expense' : undefined),
  });
  const targetSubquery = `
    SELECT t.id
    ${TX_LIST_JOINS}
    ${whereClause}
    AND t.type != 'transfer'
  `;

  if (isPreview) {
    const counts = await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN scene IS NULL OR TRIM(scene) = '' THEN 1 ELSE 0 END), 0) AS untagged_count
       FROM transactions
       WHERE user_id = ? AND id IN (${targetSubquery})`
    )
      .bind(user.id, ...params)
      .first<{ total_count: number; untagged_count: number }>();

    return c.json({
      total_count: counts?.total_count || 0,
      untagged_count: counts?.untagged_count || 0,
    });
  }

  const updateRes = await c.env.DB.prepare(
    `UPDATE transactions
     SET scene = ?
     WHERE user_id = ?
       AND type != 'transfer'
       ${untaggedSql}
       AND id IN (${targetSubquery})`
  )
    .bind(normalizedScene, user.id, ...params)
    .run();

  const updated = updateRes.meta.changes || 0;
  return c.json({
    updated,
    scene: normalizedScene,
    message: normalizedScene
      ? `已为 ${updated} 笔流水批量标记「${normalizedScene}」`
      : `已清除 ${updated} 笔流水的消费场景`,
  });
});

// 批量修改分类（支持按多选 ID / 筛选结果 / 原分类 / 账户 / 账户+分类，自动按目标分类收支类型隔离防护）
transactionsRouter.patch('/batch-category', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const scope = body?.scope as BatchScope;
  const isPreview = Boolean(body?.preview);
  const targetCategoryId = typeof body?.target_category_id === 'string' ? body.target_category_id.trim() : '';
  const onlyUncategorized = Boolean(body?.only_uncategorized);

  if (!['ids', 'category', 'account', 'account_category', 'remark', 'filter'].includes(scope)) {
    return c.json({ error: '无效的批量分类范围' }, 400);
  }

  let targetCategory: { id: string; name: string; type: 'expense' | 'income' } | null = null;
  if (targetCategoryId) {
    targetCategory = await c.env.DB.prepare(
      'SELECT id, name, type FROM categories WHERE id = ? AND user_id = ?'
    )
      .bind(targetCategoryId, user.id)
      .first<{ id: string; name: string; type: 'expense' | 'income' }>();
    if (!targetCategory) {
      return c.json({ error: '目标分类不存在或无权限' }, 400);
    }
  } else if (!isPreview) {
    return c.json({ error: '请选择目标分类' }, 400);
  }

  const uncatSql = onlyUncategorized ? " AND (category_id IS NULL OR category_id = '')" : '';
  const CHUNK = 80;

  if (scope === 'ids') {
    const ids = normalizeBatchIds(body?.ids);
    if (ids.length === 0) {
      return isPreview
        ? c.json({ total_count: 0, expense_count: 0, income_count: 0, eligible_count: 0 })
        : c.json({ error: '请先选择要调整分类的流水' }, 400);
    }

    if (isPreview) {
      let totalCount = 0;
      let expenseCount = 0;
      let incomeCount = 0;
      let eligibleCount = 0;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const placeholders = slice.map(() => '?').join(',');
        const row = await c.env.DB.prepare(
          `SELECT
            COUNT(*) AS total_count,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count,
            COALESCE(SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END), 0) AS income_count,
            COALESCE(SUM(CASE WHEN type = ? ${uncatSql} THEN 1 ELSE 0 END), 0) AS eligible_count
           FROM transactions
           WHERE user_id = ? AND type IN ('expense', 'income') AND id IN (${placeholders})`
        )
          .bind(targetCategory?.type || 'expense', user.id, ...slice)
          .first<{ total_count: number; expense_count: number; income_count: number; eligible_count: number }>();
        totalCount += row?.total_count || 0;
        expenseCount += row?.expense_count || 0;
        incomeCount += row?.income_count || 0;
        eligibleCount += row?.eligible_count || 0;
      }
      return c.json({
        total_count: totalCount,
        expense_count: expenseCount,
        income_count: incomeCount,
        eligible_count: eligibleCount,
      });
    }

    let updated = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const placeholders = slice.map(() => '?').join(',');
      const res = await c.env.DB.prepare(
        `UPDATE transactions
         SET category_id = ?
         WHERE user_id = ? AND type = ? ${uncatSql} AND id IN (${placeholders})`
      )
        .bind(targetCategory!.id, user.id, targetCategory!.type, ...slice)
        .run();
      updated += res.meta.changes || 0;
    }

    return c.json({
      updated,
      category_id: targetCategory!.id,
      category_name: targetCategory!.name,
      message: `已将 ${updated} 笔${targetCategory!.type === 'expense' ? '支出' : '收入'}归类到「${targetCategory!.name}」`,
    });
  }

  const resolved = buildBatchFilterInput(body, scope);
  if (resolved.error || !resolved.filterInput) {
    return c.json({ error: resolved.error || '参数无效' }, 400);
  }
  const { whereClause, params } = buildTransactionFilterClause(user.id, resolved.filterInput);
  const targetSubquery = `
    SELECT t.id
    ${TX_LIST_JOINS}
    ${whereClause}
    AND t.type IN ('expense', 'income')
  `;

  if (isPreview) {
    const counts = await c.env.DB.prepare(
      `SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END), 0) AS expense_count,
        COALESCE(SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END), 0) AS income_count,
        COALESCE(SUM(CASE WHEN type = ? ${uncatSql} THEN 1 ELSE 0 END), 0) AS eligible_count
       FROM transactions
       WHERE user_id = ? AND id IN (${targetSubquery})`
    )
      .bind(targetCategory?.type || 'expense', user.id, ...params)
      .first<{ total_count: number; expense_count: number; income_count: number; eligible_count: number }>();

    return c.json({
      total_count: counts?.total_count || 0,
      expense_count: counts?.expense_count || 0,
      income_count: counts?.income_count || 0,
      eligible_count: counts?.eligible_count || 0,
    });
  }

  const updateRes = await c.env.DB.prepare(
    `UPDATE transactions
     SET category_id = ?
     WHERE user_id = ?
       AND type = ?
       ${uncatSql}
       AND id IN (${targetSubquery})`
  )
    .bind(targetCategory!.id, user.id, targetCategory!.type, ...params)
    .run();

  const updated = updateRes.meta.changes || 0;
  return c.json({
    updated,
    category_id: targetCategory!.id,
    category_name: targetCategory!.name,
    message: `已将 ${updated} 笔${targetCategory!.type === 'expense' ? '支出' : '收入'}归类到「${targetCategory!.name}」`,
  });
});

// 查询流水列表
transactionsRouter.get('/', async (c) => {
  const user = c.get('user');
  const sort = c.req.query('sort') || 'time_desc';
  const limit = Math.min(Number(c.req.query('limit')) || 100, 500);
  const offset = Number(c.req.query('offset')) || 0;

  const { whereClause, params } = buildTransactionFilterClause(user.id, {
    month: c.req.query('month'),
    startDate: c.req.query('start_date'),
    endDate: c.req.query('end_date'),
    accountId: c.req.query('account_id'),
    categoryId: c.req.query('category_id'),
    type: c.req.query('type'),
    scene: c.req.query('scene'),
    search: c.req.query('search'),
  });

  const orderByClause =
    sort === 'amount_desc'
      ? 'ORDER BY t.amount DESC, t.transaction_time DESC'
      : 'ORDER BY t.transaction_time DESC, t.created_at DESC';

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
      t.scene,
      t.amortize_days,
      t.amortize_start_date,
      COALESCE(t.exclude_daily_cost, 0) AS exclude_daily_cost,
      t.item_id,
      t.card_id,
      t.source,
      t.external_id,
      t.created_at,
      a.name AS account_name,
      da.name AS destination_account_name,
      c.name AS category_name,
      c.icon AS category_icon,
      c.color AS category_color,
      i.name AS item_name,
      pc.name AS card_name,
      (SELECT COUNT(*) FROM transaction_photos p WHERE p.transaction_id = t.id) AS photo_count,
      (SELECT p.id FROM transaction_photos p WHERE p.transaction_id = t.id ORDER BY p.created_at ASC LIMIT 1) AS first_photo_id
    ${TX_LIST_JOINS}
    ${whereClause}
    ${orderByClause}
    LIMIT ? OFFSET ?
  `;

  const { results } = await c.env.DB.prepare(querySql).bind(...params, limit, offset).all<Transaction>();

  // 统计当前筛选条件下的总收支（复用相同 LEFT JOIN 以支持 search 对分类/账户/大件名的过滤）
  const sumSql = `
    SELECT 
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expense,
      COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0) AS total_income,
      COALESCE(COUNT(*), 0) AS total_count
    ${TX_LIST_JOINS}
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

// 直接读取单张照片二进制（用于 <img> 缩略图与大图展示）
transactionsRouter.get('/photos/:photoId', async (c) => {
  const user = c.get('user');
  const photoId = c.req.param('photoId');
  const res = await servePhotoBinary(c.env.DB, 'transaction_photos', photoId, user.id);
  if (!res) {
    return c.json({ error: '照片不存在' }, 404);
  }
  return res;
});

// 查询某笔流水的全部照片
transactionsRouter.get('/:id/photos', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const photos = await listPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);
  return c.json({ photos });
});

// 新增一条流水
transactionsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const {
    type,
    amount,
    account_id,
    destination_account_id,
    category_id,
    transaction_time,
    remark,
    scene,
    amortize_days,
    amortize_start_date,
    exclude_daily_cost,
    card_id,
    photos,
    convert_to_item,
    item_details,
  } = body;

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
  const isConvertToItem = type === 'expense' && Boolean(convert_to_item);

  const dailyCost = normalizeDailyCostFields(
    type,
    isConvertToItem ? null : amortize_days,
    isConvertToItem ? null : amortize_start_date,
    isConvertToItem ? 1 : exclude_daily_cost,
    time
  );
  if (dailyCost.error) {
    return c.json({ error: dailyCost.error }, 400);
  }

  const photoCheck = validatePhotoDataUrls(photos);
  if (photoCheck.error) {
    return c.json({ error: photoCheck.error }, 400);
  }

  let createdItemId: string | null = null;
  if (isConvertToItem) {
    const resolvedName = (item_details?.name || remark || '').trim();
    if (!resolvedName) {
      return c.json({ error: '标记为大件时请填写物品名称' }, 400);
    }
    createdItemId = await createItemRecord(
      c.env.DB,
      user.id,
      numAmount,
      time.slice(0, 10),
      { ...item_details, name: resolvedName, remark: item_details?.remark || remark },
      photoCheck.items
    );
  }

  const resolvedCardId = typeof card_id === 'string' && card_id.trim() ? card_id.trim() : null;

  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, scene, amortize_days, amortize_start_date, exclude_daily_cost, item_id, card_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    user.id,
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? (typeof category_id === 'string' && category_id.trim() ? category_id.trim() : null) : null,
    time,
    remark?.trim() || (createdItemId ? `购买大件: ${(item_details?.name || '').trim()}` : null),
    normalizeScene(scene),
    dailyCost.amortizeDays,
    dailyCost.amortizeStartDate,
    dailyCost.excludeDailyCost,
    createdItemId,
    resolvedCardId
  ).run();

  if (photoCheck.items.length > 0) {
    await insertPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id, photoCheck.items);
  }

  return c.json({
    id,
    item_id: createdItemId,
    message: createdItemId ? '记账并已录入持物大件' : '记账成功',
  });
});

// 将已有的一笔支出流水转为持物大件并补充信息
transactionsRouter.post('/:id/convert-to-item', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    name,
    category,
    expected_days,
    warranty_date,
    location,
    remark,
    copy_photo_ids,
    new_photos,
  } = body;

  const tx = await c.env.DB.prepare(
    'SELECT id, type, amount, transaction_time, remark, item_id FROM transactions WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{
      id: string;
      type: string;
      amount: number;
      transaction_time: string;
      remark: string | null;
      item_id: string | null;
    }>();

  if (!tx) {
    return c.json({ error: '未找到该流水记录' }, 404);
  }
  if (tx.type !== 'expense') {
    return c.json({ error: '仅支持将支出流水转为持物大件' }, 400);
  }
  if (tx.item_id) {
    return c.json({ error: '该笔流水已关联持物大件' }, 400);
  }

  const finalName = (name || tx.remark || '').trim();
  if (!finalName) {
    return c.json({ error: '请输入大件物品名称' }, 400);
  }

  const newPhotoCheck = validatePhotoDataUrls(new_photos);
  if (newPhotoCheck.error) {
    return c.json({ error: newPhotoCheck.error }, 400);
  }

  const txPhotos = await listPhotos(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);
  const selectedTxPhotos = Array.isArray(copy_photo_ids)
    ? txPhotos.filter((p) => copy_photo_ids.includes(p.id))
    : txPhotos;

  const copiedValidated: ValidatedPhoto[] = selectedTxPhotos.map((p) => ({
    mimeType: p.mime_type,
    dataUrl: p.data_url,
    sizeBytes: p.size_bytes,
  }));

  const combinedPhotos = [...copiedValidated, ...newPhotoCheck.items];
  if (combinedPhotos.length > MAX_PHOTOS_PER_RECORD) {
    return c.json({ error: `大件最多只能保存 ${MAX_PHOTOS_PER_RECORD} 张照片` }, 400);
  }

  const itemId = await createItemRecord(
    c.env.DB,
    user.id,
    tx.amount,
    tx.transaction_time.slice(0, 10),
    {
      name: finalName,
      category,
      expected_days,
      warranty_date,
      location,
      remark: remark !== undefined ? remark : tx.remark,
    },
    combinedPhotos
  );

  await c.env.DB.prepare(
    `UPDATE transactions
     SET item_id = ?, exclude_daily_cost = 1, amortize_days = NULL, amortize_start_date = NULL
     WHERE id = ? AND user_id = ?`
  )
    .bind(itemId, id, user.id)
    .run();

  return c.json({ item_id: itemId, message: '已将该笔开销转为持物大件' });
});

// 将已有的一笔支出流水转为会员充值卡或计次卡
transactionsRouter.post('/:id/convert-to-card', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    name,
    type = 'balance', // 'balance' | 'times'
    merchant,
    initial_value,
    gift_amount = 0,
    valid_until,
    remark,
    icon = 'credit-card',
    color = '#6366f1',
  } = body;

  const tx = await c.env.DB.prepare(
    'SELECT id, type, amount, account_id, transaction_time, remark, card_id FROM transactions WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<{
      id: string;
      type: string;
      amount: number;
      account_id: string;
      transaction_time: string;
      remark: string | null;
      card_id: string | null;
    }>();

  if (!tx) {
    return c.json({ error: '未找到该流水记录' }, 404);
  }
  if (tx.type !== 'expense') {
    return c.json({ error: '仅支持将支出流水转为充值卡' }, 400);
  }
  if (tx.card_id) {
    return c.json({ error: '该笔流水已关联充值卡' }, 400);
  }

  const finalName = (name || tx.remark || '').trim();
  if (!finalName) {
    return c.json({ error: '请输入充值卡名称' }, 400);
  }

  const giftCents = Math.round(Number(gift_amount) || 0);
  let parsedValue = 0;
  if (type === 'times') {
    parsedValue = Math.round(Number(initial_value) || 0);
    if (parsedValue <= 0) {
      return c.json({ error: '计次卡总次数必须大于 0' }, 400);
    }
  } else {
    // 余额卡: 若用户未显式填初始面值，则默认等于流水金额 + 赠送金
    parsedValue = initial_value !== undefined && Number(initial_value) > 0
      ? Math.round(Number(initial_value))
      : (tx.amount + giftCents);
    if (parsedValue <= 0) {
      return c.json({ error: '储值卡卡内面值必须大于 0' }, 400);
    }
  }

  const cardId = 'crd_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  await c.env.DB.prepare(
    `INSERT INTO prepaid_cards (
      id, user_id, name, type, merchant, icon, color,
      initial_amount, initial_value, gift_amount, current_value,
      total_spent_amount, total_value, status, valid_until, linked_transaction_id, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)`
  ).bind(
    cardId,
    user.id,
    finalName,
    type,
    merchant?.trim() || null,
    icon,
    color,
    tx.amount,
    parsedValue,
    giftCents,
    parsedValue,
    tx.amount,
    parsedValue,
    valid_until || null,
    id,
    remark?.trim() || tx.remark || null
  ).run();

  // 记录初始 recharge 日志
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
    tx.amount,
    id,
    tx.account_id,
    tx.transaction_time,
    `流水转充值卡: ${finalName}`
  ).run();

  // 将该笔大额流水的 exclude_daily_cost 设为 1，并绑定 card_id
  await c.env.DB.prepare(
    `UPDATE transactions
     SET card_id = ?, exclude_daily_cost = 1, amortize_days = NULL, amortize_start_date = NULL
     WHERE id = ? AND user_id = ?`
  ).bind(cardId, id, user.id).run();

  return c.json({ card_id: cardId, message: '已将该笔开销转为会员充值卡' });
});

// 单独更新或清除某笔流水的消费场景
transactionsRouter.patch('/:id/scene', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const normalizedScene = normalizeScene(body?.scene);

  const res = await c.env.DB.prepare(
    'UPDATE transactions SET scene = ? WHERE id = ? AND user_id = ?'
  )
    .bind(normalizedScene, id, user.id)
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该流水记录' }, 404);
  }

  return c.json({
    id,
    scene: normalizedScene,
    message: normalizedScene ? `已标记场景「${normalizedScene}」` : '已清除消费场景',
  });
});

// 修改流水
transactionsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const {
    type,
    amount,
    account_id,
    destination_account_id,
    category_id,
    transaction_time,
    remark,
    scene,
    amortize_days,
    amortize_start_date,
    exclude_daily_cost,
    keep_photo_ids,
    new_photos,
  } = body;

  const numAmount = Math.round(Number(amount));
  if (isNaN(numAmount) || numAmount <= 0) {
    return c.json({ error: '金额必须是大于 0 的数字' }, 400);
  }

  const time = transaction_time || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const dailyCost = normalizeDailyCostFields(type, amortize_days, amortize_start_date, exclude_daily_cost, time);
  if (dailyCost.error) {
    return c.json({ error: dailyCost.error }, 400);
  }

  const newPhotoCheck = validatePhotoDataUrls(new_photos);
  if (newPhotoCheck.error) {
    return c.json({ error: newPhotoCheck.error }, 400);
  }

  const shouldSyncPhotos = Array.isArray(keep_photo_ids) || Array.isArray(new_photos);

  const res = await c.env.DB.prepare(
    `UPDATE transactions 
     SET type = ?, amount = ?, account_id = ?, destination_account_id = ?, category_id = ?, transaction_time = ?, remark = ?, scene = ?, amortize_days = ?, amortize_start_date = ?, exclude_daily_cost = ?
     WHERE id = ? AND user_id = ?`
  ).bind(
    type,
    numAmount,
    account_id,
    type === 'transfer' ? destination_account_id : null,
    type !== 'transfer' ? (typeof category_id === 'string' && category_id.trim() ? category_id.trim() : null) : null,
    time,
    remark?.trim() || null,
    normalizeScene(scene),
    dailyCost.amortizeDays,
    dailyCost.amortizeStartDate,
    dailyCost.excludeDailyCost,
    id,
    user.id
  ).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权修改' }, 404);
  }

  if (shouldSyncPhotos) {
    const syncRes = await syncPhotos(
      c.env.DB,
      'transaction_photos',
      'transaction_id',
      id,
      user.id,
      keep_photo_ids,
      newPhotoCheck.items
    );
    if (syncRes.error) {
      return c.json({ error: syncRes.error }, 400);
    }
  }

  return c.json({ message: '修改成功' });
});

// 删除流水
transactionsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  await deletePhotosByParent(c.env.DB, 'transaction_photos', 'transaction_id', id, user.id);

  const res = await c.env.DB.prepare(
    'DELETE FROM transactions WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该记录或无权删除' }, 404);
  }

  return c.json({ message: '删除成功' });
});

// 查询已导入的外部交易单号，用于导入前自动标记重复记录
transactionsRouter.post('/import/check-duplicates', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const rawIds: unknown = body?.external_ids;
  if (!Array.isArray(rawIds)) {
    return c.json({ error: 'external_ids 必须为数组' }, 400);
  }

  const uniqueIds = Array.from(
    new Set(
      rawIds
        .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v) => v.trim())
    )
  ).slice(0, 2000);

  if (uniqueIds.length === 0) {
    return c.json({ existing_ids: [] });
  }

  const existingIds: string[] = [];
  const CHUNK = 80;
  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const slice = uniqueIds.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT external_id FROM transactions WHERE user_id = ? AND external_id IN (${placeholders})`
    )
      .bind(user.id, ...slice)
      .all<{ external_id: string }>();

    for (const r of results) {
      if (r.external_id) existingIds.push(r.external_id);
    }
  }

  return c.json({ existing_ids: existingIds });
});

// 批量导入账单流水（支持微信/支付宝等对账单，带严格幂等去重）
transactionsRouter.post('/import', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const rows = body?.rows;

  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: '导入记录不能为空' }, 400);
  }
  if (rows.length > 500) {
    return c.json({ error: '单次最多提交 500 条记录，请分批导入' }, 400);
  }

  const [{ results: userAccounts }, { results: userCategories }] = await Promise.all([
    c.env.DB.prepare('SELECT id FROM accounts WHERE user_id = ?').bind(user.id).all<{ id: string }>(),
    c.env.DB.prepare('SELECT id FROM categories WHERE user_id = ?').bind(user.id).all<{ id: string }>(),
  ]);
  const accountSet = new Set(userAccounts.map((a) => a.id));
  const categorySet = new Set(userCategories.map((cat) => cat.id));

  // 查询库内已存在的 external_id
  const candidateExtIds = Array.from(
    new Set(
      rows
        .map((r: any) => (typeof r?.external_id === 'string' ? r.external_id.trim() : ''))
        .filter((id: string) => id.length > 0)
    )
  );
  const existingSet = new Set<string>();
  const CHUNK = 80;
  for (let i = 0; i < candidateExtIds.length; i += CHUNK) {
    const slice = candidateExtIds.slice(i, i + CHUNK);
    const placeholders = slice.map(() => '?').join(',');
    const { results } = await c.env.DB.prepare(
      `SELECT external_id FROM transactions WHERE user_id = ? AND external_id IN (${placeholders})`
    )
      .bind(user.id, ...slice)
      .all<{ external_id: string }>();
    for (const r of results) {
      if (r.external_id) existingSet.add(r.external_id);
    }
  }

  let skippedDuplicates = 0;
  let skippedInvalid = 0;
  const statements: D1PreparedStatement[] = [];

  for (const row of rows) {
    const type = row?.type;
    const amount = Math.round(Number(row?.amount));
    const accountId = typeof row?.account_id === 'string' ? row.account_id.trim() : '';
    const destAccountId =
      typeof row?.destination_account_id === 'string' && row.destination_account_id.trim()
        ? row.destination_account_id.trim()
        : null;
    const extId = typeof row?.external_id === 'string' && row.external_id.trim() ? row.external_id.trim().slice(0, 128) : null;

    if (extId && existingSet.has(extId)) {
      skippedDuplicates++;
      continue;
    }

    if (
      !['expense', 'income', 'transfer'].includes(type) ||
      isNaN(amount) ||
      amount <= 0 ||
      !accountSet.has(accountId) ||
      (type === 'transfer' && (!destAccountId || destAccountId === accountId || !accountSet.has(destAccountId)))
    ) {
      skippedInvalid++;
      continue;
    }

    const timeStr = normalizeTimeString(row?.transaction_time);
    const dailyCost = normalizeDailyCostFields(
      type,
      row?.amortize_days,
      row?.amortize_start_date,
      row?.exclude_daily_cost,
      timeStr
    );
    if (dailyCost.error) {
      skippedInvalid++;
      continue;
    }

    const catId =
      type !== 'transfer' && typeof row?.category_id === 'string' && categorySet.has(row.category_id)
        ? row.category_id
        : null;
    const source = ['wechat', 'alipay', 'shortcut', 'manual'].includes(row?.source) ? row.source : 'manual';
    const remark = typeof row?.remark === 'string' && row.remark.trim() ? row.remark.trim().slice(0, 160) : null;
    const rowScene = normalizeScene(row?.scene);
    const id = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

    if (extId) existingSet.add(extId);

    statements.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, scene, amortize_days, amortize_start_date, exclude_daily_cost, source, external_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id,
        user.id,
        type,
        amount,
        accountId,
        type === 'transfer' ? destAccountId : null,
        catId,
        timeStr,
        remark,
        rowScene,
        dailyCost.amortizeDays,
        dailyCost.amortizeStartDate,
        dailyCost.excludeDailyCost,
        source,
        extId
      )
    );
  }

  for (let i = 0; i < statements.length; i += CHUNK) {
    await c.env.DB.batch(statements.slice(i, i + CHUNK));
  }

  return c.json({
    imported: statements.length,
    skipped_duplicates: skippedDuplicates,
    skipped_invalid: skippedInvalid,
    message: `成功导入 ${statements.length} 笔，跳过重复 ${skippedDuplicates} 笔`,
  });
});

// iOS 快捷指令 / 手机自动化极速记账接口（支持按名称模糊匹配、文本自动提取金额、默认元单位）
transactionsRouter.post('/quick', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();

  const parsedText = parseQuickText(body?.text);
  const rawExternalId =
    typeof body?.external_id === 'string' && body.external_id.trim()
      ? `sc:${body.external_id.trim().slice(0, 120)}`
      : null;

  if (rawExternalId) {
    const dup = await c.env.DB.prepare(
      'SELECT id FROM transactions WHERE user_id = ? AND external_id = ?'
    )
      .bind(user.id, rawExternalId)
      .first<{ id: string }>();
    if (dup) {
      return c.json({ id: dup.id, duplicate: true, message: '该请求已记录，已自动去重跳过' });
    }
  }

  const finalType: 'expense' | 'income' | 'transfer' = ['expense', 'income', 'transfer'].includes(body?.type)
    ? body.type
    : parsedText.type || 'expense';

  let amountCents = 0;
  if (body?.amount_cents !== undefined && body?.amount_cents !== null && body?.amount_cents !== '') {
    amountCents = Math.round(Number(body.amount_cents));
  } else if (body?.amount !== undefined && body?.amount !== null && body?.amount !== '') {
    const rawNum = Number(String(body.amount).replace(/[¥￥,\s元]/g, ''));
    amountCents = body?.unit === 'cents' ? Math.round(rawNum) : Math.round(rawNum * 100);
  } else if (parsedText.amountYuan !== undefined) {
    amountCents = Math.round(parsedText.amountYuan * 100);
  }

  if (isNaN(amountCents) || amountCents <= 0) {
    return c.json({ error: '未能识别有效金额，请传入 amount（元）或包含金额的 text' }, 400);
  }

  const [{ results: accounts }, { results: categories }, { results: userRules }] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
      .bind(user.id)
      .all<Account>(),
    c.env.DB.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC')
      .bind(user.id)
      .all<Category>(),
    c.env.DB.prepare(
      'SELECT * FROM auto_rules WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC, created_at ASC'
    )
      .bind(user.id)
      .all<AutoRuleLike>(),
  ]);

  if (accounts.length === 0) {
    return c.json({ error: '请先在网页端创建至少一个记账账户' }, 400);
  }

  const account = matchAccount(accounts, body?.account_id || body?.account || parsedText.accountHint);
  if (!account) {
    return c.json({ error: '未匹配到有效账户' }, 400);
  }

  let destAccount: Account | undefined;
  if (finalType === 'transfer') {
    const destHint = body?.destination_account_id || body?.destination_account;
    destAccount = destHint ? matchAccount(accounts, destHint) : undefined;
    if (!destAccount || destAccount.id === account.id) {
      return c.json({ error: '转账模式下请传入不同的 destination_account' }, 400);
    }
  }

  const finalRemark =
    (typeof body?.remark === 'string' && body.remark.trim()) ||
    parsedText.remark ||
    '快捷指令记账';

  const ruleMatch =
    finalType !== 'transfer'
      ? matchAutoRules(userRules, {
          type: finalType,
          text: `${finalRemark} ${body?.text || ''}`,
          accountId: account.id,
        })
      : { categoryId: null, scene: null };

  const ruleMatchedCat =
    ruleMatch.categoryId
      ? categories.find((cat) => cat.id === ruleMatch.categoryId && cat.type === finalType)
      : undefined;

  const matchedCategory =
    finalType !== 'transfer'
      ? !body?.category_id && !body?.category && ruleMatchedCat
        ? ruleMatchedCat
        : matchCategory(
            categories,
            finalType,
            body?.category_id || body?.category,
            `${finalRemark} ${body?.text || ''}`
          )
      : undefined;

  const finalTime = normalizeTimeString(body?.transaction_time);
  const dailyCost = normalizeDailyCostFields(
    finalType,
    body?.amortize_days,
    body?.amortize_start_date,
    body?.exclude_daily_cost,
    finalTime
  );
  if (dailyCost.error) {
    return c.json({ error: dailyCost.error }, 400);
  }

  const finalScene = normalizeScene(body?.scene) || normalizeScene(ruleMatch.scene);
  const id = 'tx_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, account_id, destination_account_id, category_id, transaction_time, remark, scene, amortize_days, amortize_start_date, exclude_daily_cost, source, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'shortcut', ?)`
  )
    .bind(
      id,
      user.id,
      finalType,
      amountCents,
      account.id,
      finalType === 'transfer' && destAccount ? destAccount.id : null,
      matchedCategory ? matchedCategory.id : null,
      finalTime,
      finalRemark.slice(0, 160),
      finalScene,
      dailyCost.amortizeDays,
      dailyCost.amortizeStartDate,
      dailyCost.excludeDailyCost,
      rawExternalId
    )
    .run();

  const amountYuanStr = (amountCents / 100).toFixed(2);
  const actionLabel = finalType === 'expense' ? '支出' : finalType === 'income' ? '收入' : '转账';
  const summaryLabel =
    finalType === 'transfer' && destAccount
      ? `${account.name} → ${destAccount.name}`
      : `${account.name} · ${matchedCategory?.name || '未分类'}`;

  return c.json({
    id,
    duplicate: false,
    type: finalType,
    amount: amountCents,
    amount_yuan: amountYuanStr,
    account_id: account.id,
    account_name: account.name,
    category_id: matchedCategory?.id || null,
    category_name: matchedCategory?.name || null,
    transaction_time: finalTime,
    remark: finalRemark,
    source: 'shortcut',
    message: `已记账：${summaryLabel} ${actionLabel} ¥${amountYuanStr}（${finalRemark}）`,
  });
});

// 生成并下载预置好当前账号 Token 与 Endpoint 的 .shortcut 快捷指令文件
transactionsRouter.get('/shortcut-file', async (c) => {
  const token = c.req.query('token') || '';
  const reqUrl = new URL(c.req.url);
  const host = `${reqUrl.protocol}//${reqUrl.host}`;
  const endpoint = `${host}/api/transactions/quick`;

  const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>WFWorkflowActions</key>
    <array>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.ask</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFAskActionPrompt</key>
                <string>请输入消费内容（如：午饭 25、咖啡 18.5、打车 32）</string>
                <key>WFInputType</key>
                <string>Text</string>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.downloadurl</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFURL</key>
                <string>${endpoint}</string>
                <key>WFHTTPMethod</key>
                <string>POST</string>
                <key>WFHTTPBodyType</key>
                <string>JSON</string>
                <key>WFHTTPHeaders</key>
                <dict>
                    <key>Value</key>
                    <dict>
                        <key>WFDictionaryFieldValueItems</key>
                        <array>
                            <dict>
                                <key>WFKey</key>
                                <dict><key>Value</key><dict><key>string</key><string>Authorization</string></dict></dict>
                                <key>WFValue</key>
                                <dict><key>Value</key><dict><key>string</key><string>Bearer ${token || 'REPLACE_WITH_YOUR_TOKEN'}</string></dict></dict>
                            </dict>
                            <dict>
                                <key>WFKey</key>
                                <dict><key>Value</key><dict><key>string</key><string>Content-Type</string></dict></dict>
                                <key>WFValue</key>
                                <dict><key>Value</key><dict><key>string</key><string>application/json</string></dict></dict>
                            </dict>
                        </array>
                    </dict>
                    <key>WFSerializationType</key>
                    <string>WFDictionaryFieldValue</string>
                </dict>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.notification</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFNotificationActionTitle</key>
                <string>记账成功</string>
                <key>WFNotificationActionBody</key>
                <string>云端轻记账已入账并自动分类</string>
            </dict>
        </dict>
    </array>
    <key>WFWorkflowClientVersion</key>
    <string>2600.0</string>
    <key>WFWorkflowMinimumClientVersion</key>
    <integer>900</integer>
</dict>
</plist>`;

  c.header('Content-Type', 'application/x-apple-aspen-config');
  c.header('Content-Disposition', 'attachment; filename="随手记账.shortcut"');
  return c.body(plistXml);
});

