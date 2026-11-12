import { Hono } from 'hono';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';
import {
  AutoRuleLike,
  matchAutoRules,
  normalizeRuleKeywordsString,
  parseRuleKeywords,
} from '../../src/utils/ruleMatcher';

export const rulesRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

rulesRouter.use('*', requireAuth);

interface RuleDbRow extends AutoRuleLike {
  user_id: string;
  created_at: string;
  account_name?: string | null;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  category_type?: 'expense' | 'income' | null;
}

const RULE_SELECT_SQL = `
  SELECT r.*,
         a.name AS account_name,
         c.name AS category_name,
         c.icon AS category_icon,
         c.color AS category_color,
         c.type AS category_type
  FROM auto_rules r
  LEFT JOIN accounts a ON r.account_id = a.id
  LEFT JOIN categories c ON r.category_id = c.id
`;

function normalizeRuleScene(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, 24);
  return trimmed.length > 0 ? trimmed : null;
}

async function validateRuleInput(
  db: D1Database,
  userId: string,
  body: any
): Promise<{
  error?: string;
  data?: {
    name: string;
    txType: 'all' | 'expense' | 'income';
    keywords: string;
    matchMode: 'contains' | 'exact';
    accountId: string | null;
    categoryId: string | null;
    scene: string | null;
    priority: number;
    enabled: number;
  };
}> {
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!rawName) {
    return { error: '请输入规则名称' };
  }
  const name = rawName.slice(0, 30);

  const txType: 'all' | 'expense' | 'income' = ['all', 'expense', 'income'].includes(body?.tx_type)
    ? body.tx_type
    : 'all';
  const matchMode: 'contains' | 'exact' = body?.match_mode === 'exact' ? 'exact' : 'contains';

  const rawKeywords = typeof body?.keywords === 'string' ? body.keywords : '';
  const kws = parseRuleKeywords(rawKeywords);
  if (kws.length === 0) {
    return { error: '请填写至少一个匹配关键词（多个可用逗号分隔）' };
  }
  const keywords = normalizeRuleKeywordsString(rawKeywords).slice(0, 300);

  const accountId =
    typeof body?.account_id === 'string' && body.account_id.trim() ? body.account_id.trim() : null;
  if (accountId) {
    const acc = await db
      .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?')
      .bind(accountId, userId)
      .first();
    if (!acc) {
      return { error: '指定的适用账户不存在或无权限' };
    }
  }

  const categoryId =
    typeof body?.category_id === 'string' && body.category_id.trim() ? body.category_id.trim() : null;
  if (categoryId) {
    const cat = await db
      .prepare('SELECT id, type FROM categories WHERE id = ? AND user_id = ?')
      .bind(categoryId, userId)
      .first<{ id: string; type: 'expense' | 'income' }>();
    if (!cat) {
      return { error: '指定的目标分类不存在或无权限' };
    }
    if (txType !== 'all' && cat.type !== txType) {
      return { error: `该分类属于${cat.type === 'expense' ? '支出' : '收入'}，与所选规则适用类型不一致` };
    }
  }

  const scene = normalizeRuleScene(body?.scene);
  if (!categoryId && !scene) {
    return { error: '请至少设置一个命中后的自动操作：目标分类 或 消费场景' };
  }

  const parsedPriority = Math.round(Number(body?.priority));
  const priority =
    !isNaN(parsedPriority) && parsedPriority >= 1 && parsedPriority <= 999 ? parsedPriority : 100;
  const enabled = body?.enabled === false || body?.enabled === 0 ? 0 : 1;

  return {
    data: {
      name,
      txType,
      keywords,
      matchMode,
      accountId,
      categoryId,
      scene,
      priority,
      enabled,
    },
  };
}

async function applyRulesToUserTransactions(
  db: D1Database,
  userId: string,
  rules: AutoRuleLike[],
  options: { preview: boolean; overwrite: boolean; month?: string; ignoreEnabledFlag?: boolean }
) {
  const [{ results: cats }, { results: txs }] = await Promise.all([
    db
      .prepare('SELECT id, type FROM categories WHERE user_id = ?')
      .bind(userId)
      .all<{ id: string; type: 'expense' | 'income' }>(),
    options.month && /^\d{4}-\d{2}$/.test(options.month)
      ? db
          .prepare(
            `SELECT id, type, account_id, category_id, scene, remark
             FROM transactions
             WHERE user_id = ? AND type IN ('expense', 'income') AND transaction_time LIKE ?`
          )
          .bind(userId, `${options.month}%`)
          .all<{
            id: string;
            type: 'expense' | 'income';
            account_id: string;
            category_id: string | null;
            scene: string | null;
            remark: string | null;
          }>()
      : db
          .prepare(
            `SELECT id, type, account_id, category_id, scene, remark
             FROM transactions
             WHERE user_id = ? AND type IN ('expense', 'income')`
          )
          .bind(userId)
          .all<{
            id: string;
            type: 'expense' | 'income';
            account_id: string;
            category_id: string | null;
            scene: string | null;
            remark: string | null;
          }>(),
  ]);

  const catTypeMap = new Map(cats.map((c) => [c.id, c.type]));
  const pendingUpdates: Array<{ id: string; nextCatId?: string; nextScene?: string }> = [];
  let matchedCount = 0;
  let categoryUpdates = 0;
  let sceneUpdates = 0;

  for (const tx of txs) {
    const matched = matchAutoRules(
      rules,
      { type: tx.type, text: tx.remark || '', accountId: tx.account_id },
      Boolean(options.ignoreEnabledFlag)
    );
    if (!matched.categoryId && !matched.scene) continue;
    matchedCount++;

    let nextCatId: string | undefined;
    if (matched.categoryId && catTypeMap.get(matched.categoryId) === tx.type) {
      const canSetCat = options.overwrite || !tx.category_id;
      if (canSetCat && tx.category_id !== matched.categoryId) {
        nextCatId = matched.categoryId;
      }
    }

    let nextScene: string | undefined;
    if (matched.scene) {
      const currentScene = (tx.scene || '').trim();
      const canSetScene = options.overwrite || !currentScene;
      if (canSetScene && currentScene !== matched.scene) {
        nextScene = matched.scene;
      }
    }

    if (nextCatId !== undefined || nextScene !== undefined) {
      if (nextCatId !== undefined) categoryUpdates++;
      if (nextScene !== undefined) sceneUpdates++;
      pendingUpdates.push({ id: tx.id, nextCatId, nextScene });
    }
  }

  if (!options.preview && pendingUpdates.length > 0) {
    const BATCH_SIZE = 50;
    for (let i = 0; i < pendingUpdates.length; i += BATCH_SIZE) {
      const slice = pendingUpdates.slice(i, i + BATCH_SIZE);
      const stmts: D1PreparedStatement[] = slice.map((item) => {
        if (item.nextCatId !== undefined && item.nextScene !== undefined) {
          return db
            .prepare('UPDATE transactions SET category_id = ?, scene = ? WHERE id = ? AND user_id = ?')
            .bind(item.nextCatId, item.nextScene, item.id, userId);
        }
        if (item.nextCatId !== undefined) {
          return db
            .prepare('UPDATE transactions SET category_id = ? WHERE id = ? AND user_id = ?')
            .bind(item.nextCatId, item.id, userId);
        }
        return db
          .prepare('UPDATE transactions SET scene = ? WHERE id = ? AND user_id = ?')
          .bind(item.nextScene!, item.id, userId);
      });
      await db.batch(stmts);
    }
  }

  return {
    matched_count: matchedCount,
    updated_count: pendingUpdates.length,
    category_updates: categoryUpdates,
    scene_updates: sceneUpdates,
  };
}

// 获取当前用户的自动规则列表
rulesRouter.get('/', async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    `${RULE_SELECT_SQL}
     WHERE r.user_id = ?
     ORDER BY r.priority DESC, r.created_at ASC`
  )
    .bind(user.id)
    .all<RuleDbRow>();

  return c.json({ rules: results });
});

// 新增规则
rulesRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const check = await validateRuleInput(c.env.DB, user.id, body);
  if (check.error || !check.data) {
    return c.json({ error: check.error || '规则参数无效' }, 400);
  }

  const d = check.data;
  const id = 'rule_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  await c.env.DB.prepare(
    `INSERT INTO auto_rules (id, user_id, name, tx_type, keywords, match_mode, account_id, category_id, scene, priority, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      user.id,
      d.name,
      d.txType,
      d.keywords,
      d.matchMode,
      d.accountId,
      d.categoryId,
      d.scene,
      d.priority,
      d.enabled
    )
    .run();

  const created = await c.env.DB.prepare(`${RULE_SELECT_SQL} WHERE r.id = ? AND r.user_id = ?`)
    .bind(id, user.id)
    .first<RuleDbRow>();

  return c.json({ id, rule: created, message: '规则添加成功' });
});

// 一键将全部启用规则应用到已有流水
rulesRouter.post('/apply-all', async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const preview = Boolean(body?.preview);
  const overwrite = Boolean(body?.overwrite);
  const month = typeof body?.month === 'string' ? body.month : undefined;

  const { results: rules } = await c.env.DB.prepare(
    `SELECT * FROM auto_rules WHERE user_id = ? AND enabled = 1 ORDER BY priority DESC, created_at ASC`
  )
    .bind(user.id)
    .all<RuleDbRow>();

  if (rules.length === 0) {
    return c.json({
      matched_count: 0,
      updated_count: 0,
      category_updates: 0,
      scene_updates: 0,
      message: '暂无启用的规则',
    });
  }

  const stats = await applyRulesToUserTransactions(c.env.DB, user.id, rules, {
    preview,
    overwrite,
    month,
    ignoreEnabledFlag: false,
  });

  return c.json({
    ...stats,
    message: preview
      ? `匹配 ${stats.matched_count} 笔，预计更新 ${stats.updated_count} 笔流水`
      : `已应用全部启用规则，共更新 ${stats.updated_count} 笔流水（分类 ${stats.category_updates} 笔，场景 ${stats.scene_updates} 笔）`,
  });
});

// 编辑规则
rulesRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT id FROM auto_rules WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first();
  if (!existing) {
    return c.json({ error: '未找到该规则或无权修改' }, 404);
  }

  const body = await c.req.json();
  const check = await validateRuleInput(c.env.DB, user.id, body);
  if (check.error || !check.data) {
    return c.json({ error: check.error || '规则参数无效' }, 400);
  }

  const d = check.data;
  await c.env.DB.prepare(
    `UPDATE auto_rules
     SET name = ?, tx_type = ?, keywords = ?, match_mode = ?, account_id = ?, category_id = ?, scene = ?, priority = ?, enabled = ?
     WHERE id = ? AND user_id = ?`
  )
    .bind(
      d.name,
      d.txType,
      d.keywords,
      d.matchMode,
      d.accountId,
      d.categoryId,
      d.scene,
      d.priority,
      d.enabled,
      id,
      user.id
    )
    .run();

  const updated = await c.env.DB.prepare(`${RULE_SELECT_SQL} WHERE r.id = ? AND r.user_id = ?`)
    .bind(id, user.id)
    .first<RuleDbRow>();

  return c.json({ rule: updated, message: '规则更新成功' });
});

// 删除规则
rulesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const res = await c.env.DB.prepare('DELETE FROM auto_rules WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该规则或无权删除' }, 404);
  }
  return c.json({ message: '规则已删除' });
});

// 将单条规则立即预览或应用到历史流水
rulesRouter.post('/:id/apply', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const rule = await c.env.DB.prepare('SELECT * FROM auto_rules WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<RuleDbRow>();
  if (!rule) {
    return c.json({ error: '未找到该规则或无权操作' }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const preview = Boolean(body?.preview);
  const overwrite = Boolean(body?.overwrite);
  const month = typeof body?.month === 'string' ? body.month : undefined;

  const stats = await applyRulesToUserTransactions(c.env.DB, user.id, [rule], {
    preview,
    overwrite,
    month,
    ignoreEnabledFlag: true,
  });

  return c.json({
    ...stats,
    message: preview
      ? `匹配 ${stats.matched_count} 笔，预计更新 ${stats.updated_count} 笔流水`
      : `规则「${rule.name}」已更新 ${stats.updated_count} 笔流水（分类 ${stats.category_updates} 笔，场景 ${stats.scene_updates} 笔）`,
  });
});
