import { Hono } from 'hono';
import { Env, UserSession, Account, Category } from '../types';
import { requireAuth } from '../auth';
import {
  getUserAiConfig,
  saveUserAiConfig,
  parseNaturalLanguageTransaction,
  parseReceiptImageTransaction,
  generateAiMonthlyDiagnosis,
} from '../aiService';

export const aiRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

// 统一需要登录鉴权
aiRouter.use('*', requireAuth);

// 1. 获取用户的 AI 配置 (脱敏展示)
aiRouter.get('/config', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const config = await getUserAiConfig(db, user.id);
  if (!config) {
    return c.json({
      config: {
        provider: 'workers_ai',
        custom_endpoint: '',
        custom_api_key: '',
        custom_model: 'deepseek-chat',
        is_enabled: true,
        has_workers_ai: Boolean(c.env.AI),
      },
    });
  }

  // 对 API Key 脱敏
  let maskedKey = '';
  if (config.custom_api_key) {
    const len = config.custom_api_key.length;
    if (len <= 8) {
      maskedKey = 'sk-********';
    } else {
      maskedKey = `${config.custom_api_key.slice(0, 4)}****${config.custom_api_key.slice(-4)}`;
    }
  }

  return c.json({
    config: {
      provider: config.provider,
      custom_endpoint: config.custom_endpoint || '',
      custom_api_key: maskedKey,
      custom_model: config.custom_model || 'deepseek-chat',
      is_enabled: config.is_enabled === 1,
      has_workers_ai: Boolean(c.env.AI),
    },
  });
});

// 2. 保存用户的 AI 配置 (可选择连通性测试)
aiRouter.post('/config', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json<any>();

  const provider = body.provider === 'custom' ? 'custom' : 'workers_ai';
  const isEnabled = body.is_enabled !== false;
  const customEndpoint = (body.custom_endpoint || '').trim();
  const customApiKey = (body.custom_api_key || '').trim();
  const customModel = (body.custom_model || '').trim();

  // 如果请求测试连通性
  if (body.test_connection && provider === 'custom') {
    if (!customEndpoint || !customApiKey) {
      return c.json({ error: '测试自定义模型时，接口地址和 API 密钥不能为空' }, 400);
    }
    try {
      const url = `${customEndpoint.replace(/\/+$/, '')}/chat/completions`;
      const testRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customApiKey}`,
        },
        body: JSON.stringify({
          model: customModel || 'deepseek-chat',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });

      if (!testRes.ok) {
        const errorText = await testRes.text().catch(() => '');
        return c.json({ error: `模型接口测试失败 (HTTP ${testRes.status}): ${errorText.slice(0, 100)}` }, 400);
      }
    } catch (testErr: any) {
      return c.json({ error: `连接自定义大模型端点失败: ${testErr.message}` }, 400);
    }
  }

  await saveUserAiConfig(db, user.id, {
    provider,
    custom_endpoint: customEndpoint,
    custom_api_key: customApiKey,
    custom_model: customModel,
    is_enabled: isEnabled,
  });

  return c.json({ success: true, message: 'AI 配置保存成功' });
});

// 3. 自然语言 / 语音记账文本智能解析
aiRouter.post('/parse-text', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const body = await c.req.json<{ text: string }>();

    if (!body.text || !body.text.trim()) {
      return c.json({ error: '请输入记账文本' }, 400);
    }

    // 查询用户的所有账户和分类
    const [accountsRes, categoriesRes, aiConfig] = await Promise.all([
      db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all<Account>(),
      db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all<Category>(),
      getUserAiConfig(db, user.id),
    ]);

    const accounts = accountsRes.results || [];
    const categories = categoriesRes.results || [];

    const result = await parseNaturalLanguageTransaction(
      c.env,
      aiConfig,
      body.text,
      accounts,
      categories
    );
    return c.json({ result });
  } catch (err: any) {
    console.error('parse-text error:', err);
    return c.json({ error: err.message || 'AI 解析文本失败' }, 500);
  }
});

// 4. 小票 / 发票 / 支付截图 OCR 智能解析
aiRouter.post('/parse-receipt', async (c) => {
  try {
    const user = c.get('user');
    const db = c.env.DB;
    const body = await c.req.json<{ image: string }>();

    if (!body.image) {
      return c.json({ error: '请上传小票或发票图片' }, 400);
    }

    const [accountsRes, categoriesRes, aiConfig] = await Promise.all([
      db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all<Account>(),
      db.prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY sort_order ASC').bind(user.id).all<Category>(),
      getUserAiConfig(db, user.id),
    ]);

    const accounts = accountsRes.results || [];
    const categories = categoriesRes.results || [];

    const result = await parseReceiptImageTransaction(
      c.env,
      aiConfig,
      body.image,
      accounts,
      categories
    );
    return c.json({ result });
  } catch (err: any) {
    console.error('parse-receipt error:', err);
    return c.json({ error: err.message || 'AI 小票识别失败' }, 500);
  }
});

// 5. AI 月度财务消费体检与诊断报告
aiRouter.post('/monthly-diagnosis', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;
  const body = await c.req.json<{ month?: string }>();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const targetMonth = body.month || currentMonthStr;

  // 1. 汇总该月份收支数据
  const txSummary = await db
    .prepare(
      `SELECT 
         SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense,
         SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income
       FROM transactions
       WHERE user_id = ? AND transaction_time LIKE ?`
    )
    .bind(user.id, `${targetMonth}%`)
    .first<any>();

  const totalExpense = txSummary?.total_expense || 0;
  const totalIncome = txSummary?.total_income || 0;
  const surplus = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? (surplus / totalIncome) * 100 : 0;

  // 2. 分类支出排行
  const catRows = await db
    .prepare(
      `SELECT c.name, SUM(t.amount) as total_amount
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = ? AND t.type = 'expense' AND t.transaction_time LIKE ?
       GROUP BY c.id
       ORDER BY total_amount DESC
       LIMIT 6`
    )
    .bind(user.id, `${targetMonth}%`)
    .all<any>();

  const categoryBreakdown = (catRows.results || []).map((r: any) => ({
    name: r.name,
    amount: r.total_amount,
    percentage: totalExpense > 0 ? Number(((r.total_amount / totalExpense) * 100).toFixed(1)) : 0,
  }));

  // 3. 统计在役订阅月开销
  const subRows = await db
    .prepare(
      `SELECT amount, period_type, period_interval 
       FROM subscriptions 
       WHERE user_id = ? AND status = 'active'`
    )
    .bind(user.id)
    .all<any>();

  let subMonthlyTotal = 0;
  for (const s of subRows.results || []) {
    const interval = Math.max(1, s.period_interval || 1);
    if (s.period_type === 'monthly') subMonthlyTotal += Math.round(s.amount / interval);
    else if (s.period_type === 'yearly') subMonthlyTotal += Math.round(s.amount / (12 * interval));
    else if (s.period_type === 'weekly') subMonthlyTotal += Math.round((s.amount * 52) / (12 * interval));
    else if (s.period_type === 'quarterly') subMonthlyTotal += Math.round(s.amount / (3 * interval));
  }

  // 4. 统计在役大件日均成本
  const itemsRows = await db
    .prepare(
      `SELECT i.id, i.price, i.salvage_value, i.purchase_date,
              COALESCE(SUM(ie.amount), 0) as additional_cost
       FROM items i
       LEFT JOIN item_expenses ie ON i.id = ie.item_id
       WHERE i.user_id = ? AND i.status = 'active'
       GROUP BY i.id`
    )
    .bind(user.id)
    .all<any>();

  let activeItemsDailyCost = 0;
  const activeItemsCount = itemsRows.results?.length || 0;
  const today = new Date();

  for (const item of itemsRows.results || []) {
    const buyDate = new Date(item.purchase_date);
    const diffTime = Math.max(1, Math.floor((today.getTime() - buyDate.getTime()) / (1000 * 3600 * 24)) + 1);
    const netCost = (item.price || 0) + (item.additional_cost || 0) - (item.salvage_value || 0);
    const daily = netCost / diffTime;
    activeItemsDailyCost += Math.round(daily);
  }

  const [aiConfig] = await Promise.all([getUserAiConfig(db, user.id)]);

  try {
    const diagnosis = await generateAiMonthlyDiagnosis(c.env, aiConfig, targetMonth, {
      total_income: totalIncome,
      total_expense: totalExpense,
      surplus,
      savings_rate: savingsRate,
      category_breakdown: categoryBreakdown,
      subscriptions_monthly_total: subMonthlyTotal,
      active_items_daily_cost: activeItemsDailyCost,
      active_items_count: activeItemsCount,
    });

    return c.json({ diagnosis });
  } catch (err: any) {
    return c.json({ error: err.message || '生成财务体检报告失败' }, 500);
  }
});
