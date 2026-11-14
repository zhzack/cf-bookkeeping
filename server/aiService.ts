import { Env, Account, Category, UserAiConfig, AiParseResult, AiDiagnosisResult } from './types';
import { parseQuickText, matchAccount, getNowUTC8Str } from './quickParse';

/**
 * 辅助函数：从 LLM 的回复中提取 JSON 字符串
 */
function extractJsonFromResponse(raw: string): any {
  if (!raw) return null;
  let text = raw.trim();

  // 匹配被 ```json ... ``` 包裹的代码块
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    text = markdownMatch[1].trim();
  }

  // 尝试直接解析
  try {
    return JSON.parse(text);
  } catch (e) {
    // 寻找最外层的 { ... }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        return JSON.parse(text.slice(firstBrace, lastBrace + 1));
      } catch (err) {}
    }
    return null;
  }
}

/**
 * 获取当前用户的 AI 配置
 */
export async function getUserAiConfig(db: D1Database, userId: string): Promise<UserAiConfig | null> {
  const row = await db
    .prepare('SELECT * FROM user_ai_configs WHERE user_id = ?')
    .bind(userId)
    .first<any>();

  if (!row) return null;
  return {
    ...row,
    is_enabled: row.is_enabled === 1 ? 1 : 0,
  };
}

/**
 * 保存当前用户的 AI 配置
 */
export async function saveUserAiConfig(
  db: D1Database,
  userId: string,
  config: {
    provider: 'workers_ai' | 'custom';
    custom_endpoint?: string | null;
    custom_api_key?: string | null;
    custom_model?: string | null;
    is_enabled?: boolean | number;
  }
): Promise<void> {
  const isEnabledInt = config.is_enabled === false || config.is_enabled === 0 ? 0 : 1;
  const existing = await getUserAiConfig(db, userId);

  if (existing) {
    // 如果没有传入新的 API 密钥（例如传入空字符串或带掩码的字符串），保持原密钥
    let apiKeyToSave = config.custom_api_key;
    if (!apiKeyToSave || apiKeyToSave.includes('***')) {
      apiKeyToSave = existing.custom_api_key;
    }

    await db
      .prepare(
        `UPDATE user_ai_configs 
         SET provider = ?, custom_endpoint = ?, custom_api_key = ?, custom_model = ?, is_enabled = ?, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ?`
      )
      .bind(
        config.provider,
        config.custom_endpoint || null,
        apiKeyToSave || null,
        config.custom_model || null,
        isEnabledInt,
        userId
      )
      .run();
  } else {
    const id = `ai_cfg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    await db
      .prepare(
        `INSERT INTO user_ai_configs (id, user_id, provider, custom_endpoint, custom_api_key, custom_model, is_enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        userId,
        config.provider,
        config.custom_endpoint || null,
        config.custom_api_key || null,
        config.custom_model || null,
        isEnabledInt
      )
      .run();
  }
}

/**
 * 调用文本 LLM 模型（优先用户自定义，其次 Workers AI）
 */
async function callTextLlm(
  env: Env,
  userConfig: UserAiConfig | null,
  systemPrompt: string,
  userPrompt: string
): Promise<{ text: string; provider: 'custom_llm' | 'workers_ai' } | null> {
  // 1. 如果用户启用了自定义模型
  if (
    userConfig &&
    userConfig.is_enabled === 1 &&
    userConfig.provider === 'custom' &&
    userConfig.custom_endpoint &&
    userConfig.custom_api_key
  ) {
    try {
      const endpoint = userConfig.custom_endpoint.replace(/\/+$/, '');
      const url = `${endpoint}/chat/completions`;
      const model = userConfig.custom_model || 'deepseek-chat';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userConfig.custom_api_key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          return { text: content, provider: 'custom_llm' };
        }
      } else {
        console.warn('Custom LLM API returned status:', res.status, await res.text().catch(() => ''));
      }
    } catch (err) {
      console.warn('Custom LLM API call error:', err);
    }
  }

  // 2. 如果绑定了 Cloudflare Workers AI
  if (env.AI) {
    try {
      // 优先使用对中文与结构化 JSON 理解极强的 qwen2.5-7b-instruct 或 llama-3.1-8b-instruct
      const model = '@cf/qwen/qwen2.5-7b-instruct';
      const aiRes = await env.AI.run(model, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      });

      const responseText = aiRes?.response || aiRes?.choices?.[0]?.message?.content || (typeof aiRes === 'string' ? aiRes : null);
      if (responseText) {
        return { text: responseText, provider: 'workers_ai' };
      }
    } catch (aiErr) {
      console.warn('Workers AI call error:', aiErr);
    }
  }

  return null;
}

/**
 * 图像/小票 OCR Vision 分析
 */
async function callVisionLlm(
  env: Env,
  userConfig: UserAiConfig | null,
  systemPrompt: string,
  userPrompt: string,
  imageBase64: string
): Promise<{ text: string; provider: 'custom_llm' | 'workers_ai' } | null> {
  // 确保 base64 前缀格式正确
  let dataUrl = imageBase64;
  if (!dataUrl.startsWith('data:image/')) {
    dataUrl = `data:image/jpeg;base64,${imageBase64}`;
  }

  // 1. 自定义外部 Vision 模型 (例如 gpt-4o-mini, qwen-vl 等)
  if (
    userConfig &&
    userConfig.is_enabled === 1 &&
    userConfig.provider === 'custom' &&
    userConfig.custom_endpoint &&
    userConfig.custom_api_key
  ) {
    try {
      const endpoint = userConfig.custom_endpoint.replace(/\/+$/, '');
      const url = `${endpoint}/chat/completions`;
      const model = userConfig.custom_model || 'gpt-4o-mini';

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userConfig.custom_api_key}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: [
                { type: 'text', text: userPrompt },
                { type: 'image_url', image_url: { url: dataUrl } },
              ],
            },
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const content = data?.choices?.[0]?.message?.content;
        if (content) {
          return { text: content, provider: 'custom_llm' };
        }
      }
    } catch (err) {
      console.warn('Custom Vision LLM error:', err);
    }
  }

  // 2. Cloudflare Workers AI Vision 模型: @cf/meta/llama-3.2-11b-vision-instruct
  if (env.AI) {
    try {
      // 提取纯 base64 字符串转成 uint8array 或直接传 base64 格式
      const base64Pure = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
      const binaryString = atob(base64Pure);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const visionRes = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        image: [...bytes],
      });

      const responseText = visionRes?.response || (typeof visionRes === 'string' ? visionRes : null);
      if (responseText) {
        return { text: responseText, provider: 'workers_ai' };
      }
    } catch (aiErr) {
      console.warn('Workers AI Vision error:', aiErr);
    }
  }

  return null;
}

/**
 * 核心功能 1：自然语言/语音记账文本智能结构化解析
 */
export async function parseNaturalLanguageTransaction(
  env: Env,
  userConfig: UserAiConfig | null,
  rawText: string,
  accounts: Account[],
  categories: Category[]
): Promise<AiParseResult> {
  const nowStr = getNowUTC8Str();
  const trimmedText = (rawText || '').trim();

  const accountsContext = accounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));
  const categoriesContext = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));

  const systemPrompt = `你是一个专业、严谨的个人记账 AI 助手。你的任务是从用户的自然语言输入中，精准提取交易信息，并映射为用户账本中已有的资产账户与收支分类。
当前系统标准时间是：${nowStr} (东八区)。

用户现有的资产账户列表：
${JSON.stringify(accountsContext, null, 2)}

用户现有的收支分类列表：
${JSON.stringify(categoriesContext, null, 2)}

必须严格输出为如下格式的 JSON 对象，不要输出任何额外的问候或解释：
{
  "type": "expense" | "income" | "transfer", // 交易类型 (支出/收入/内部转账)
  "amount_yuan": 35.5,                      // 金额 (浮点数元，必须为正数)
  "account_id": "账户ID",                   // 最匹配的扣款账户 ID (转账时为转出账户)
  "destination_account_id": "账户ID",       // 仅当转账时填写转入账户 ID，否则为 null
  "category_id": "分类ID",                  // 最匹配的分类 ID (转账时为 null)
  "transaction_time": "YYYY-MM-DD HH:mm:ss",// 发生的真实时间 (相对时间如"昨天上午"需换算为具体时间)
  "remark": "简要备注",                     // 商户、具体商品或消费事项摘要
  "scene": "消费场景标签",                  // 如: 日常三餐, 商务出行, 娱乐聚会, 居家日常 等，未提及可根据常识推测
  "confidence": 0.95                        // 判定置信度 0~1
}`;

  const userPrompt = `用户记账输入文本："${trimmedText}"`;

  const llmResult = await callTextLlm(env, userConfig, systemPrompt, userPrompt);

  if (llmResult) {
    const parsed = extractJsonFromResponse(llmResult.text);
    if (parsed && typeof parsed.amount_yuan === 'number' && parsed.amount_yuan > 0) {
      const amtYuan = Math.abs(parsed.amount_yuan);
      const amtCents = Math.round(amtYuan * 100);

      const acc = accounts.find((a) => a.id === parsed.account_id) || accounts[0];
      const cat = categories.find((c) => c.id === parsed.category_id);
      const destAcc = parsed.destination_account_id
        ? accounts.find((a) => a.id === parsed.destination_account_id)
        : undefined;

      return {
        type: parsed.type === 'income' ? 'income' : parsed.type === 'transfer' ? 'transfer' : 'expense',
        amount: amtCents,
        amount_yuan: amtYuan,
        account_id: acc?.id,
        account_name: acc?.name,
        category_id: cat?.id,
        category_name: cat?.name,
        destination_account_id: destAcc?.id,
        transaction_time: parsed.transaction_time || nowStr,
        remark: parsed.remark || trimmedText.slice(0, 30),
        scene: parsed.scene,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
        parser_type: llmResult.provider,
      };
    }
  }

  // --- 回退引擎：规则启发式解析 (无网络/无模型/解析失败时 100% 托底自愈) ---
  const heuristic = parseQuickText(trimmedText);
  const matchedAcc = matchAccount(accounts, heuristic.accountHint) || accounts[0];

  // 简单根据关键词匹配分类
  let matchedCat: Category | undefined;
  if (heuristic.type !== 'income') {
    const textLower = trimmedText.toLowerCase();
    matchedCat = categories.find((c) => {
      const name = c.name.toLowerCase();
      return textLower.includes(name) || (name.includes('餐') && /吃|饭|喝|咖啡|麦当劳|肯德基|外卖|餐/.test(textLower));
    });
    if (!matchedCat) {
      matchedCat = categories.find((c) => c.type === 'expense');
    }
  } else {
    matchedCat = categories.find((c) => c.type === 'income');
  }

  const amountYuan = heuristic.amountYuan || 0;
  return {
    type: heuristic.type || 'expense',
    amount: Math.round(amountYuan * 100),
    amount_yuan: amountYuan,
    account_id: matchedAcc?.id,
    account_name: matchedAcc?.name,
    category_id: matchedCat?.id,
    category_name: matchedCat?.name,
    transaction_time: nowStr,
    remark: heuristic.remark || trimmedText.slice(0, 30),
    scene: '随手记账',
    confidence: heuristic.amountYuan ? 0.75 : 0.4,
    parser_type: 'heuristic_fallback',
  };
}

/**
 * 核心功能 2：消费小票 / 发票 / 支付截屏图片 OCR 智能解析
 */
export async function parseReceiptImageTransaction(
  env: Env,
  userConfig: UserAiConfig | null,
  imageBase64: string,
  accounts: Account[],
  categories: Category[]
): Promise<AiParseResult> {
  const nowStr = getNowUTC8Str();
  const accountsContext = accounts.map((a) => ({ id: a.id, name: a.name }));
  const categoriesContext = categories.map((c) => ({ id: c.id, name: c.name, type: c.type }));

  const systemPrompt = `你是一个专业的发票与消费小票 OCR 识别记账助手。请仔细观察小票或账单截图中的关键信息。
当前基准时间是：${nowStr}。

系统账户列表：${JSON.stringify(accountsContext)}
系统分类列表：${JSON.stringify(categoriesContext)}

请严格识别并输出以下格式的 JSON：
{
  "merchant": "商家或店铺全称",
  "amount_yuan": 45.0,                       // 最终实付金额 (元，数字)
  "transaction_time": "YYYY-MM-DD HH:mm:ss",// 小票打印的交易时间，看不清则用基准时间
  "type": "expense",
  "account_id": "最可能的付款账户ID",          // 比如看到微信支付、支付宝或银行卡尾号
  "category_id": "最匹配的分类ID",             // 餐饮、购物、交通等
  "remark": "简要商品明细摘要",                // 比如: 拿铁x1, 可颂x1
  "scene": "消费场景",                        // 如: 超市采购, 下午茶, 商务宴请
  "confidence": 0.92
}`;

  const userPrompt = '请解析这张消费凭证图片，提取金额、商户、时间及商品明细。输出标准 JSON。';

  const visionResult = await callVisionLlm(env, userConfig, systemPrompt, userPrompt, imageBase64);

  if (!visionResult) {
    throw new Error('当前未配置可用的大模型或视觉识别模型，无法进行图片识别。请在设置中配置自定义视觉模型（如 gpt-4o-mini）或启用 Workers AI。');
  }

  const parsed = extractJsonFromResponse(visionResult.text);
  if (!parsed || typeof parsed.amount_yuan !== 'number' || parsed.amount_yuan <= 0) {
    throw new Error('未能从小票中清晰识别出有效的消费金额，请尝试拍得更平整或直接使用自然语言输入。');
  }

  const amtYuan = Math.abs(parsed.amount_yuan);
  const acc = accounts.find((a) => a.id === parsed.account_id) || accounts[0];
  const cat = categories.find((c) => c.id === parsed.category_id) || categories.find((c) => c.type === 'expense');

  let finalRemark = parsed.remark || parsed.merchant || '小票扫码记账';
  if (parsed.merchant && !finalRemark.includes(parsed.merchant)) {
    finalRemark = `${parsed.merchant} ${finalRemark}`.trim();
  }

  return {
    type: 'expense',
    amount: Math.round(amtYuan * 100),
    amount_yuan: amtYuan,
    account_id: acc?.id,
    account_name: acc?.name,
    category_id: cat?.id,
    category_name: cat?.name,
    transaction_time: parsed.transaction_time || nowStr,
    remark: finalRemark.slice(0, 60),
    scene: parsed.scene || '日常消费',
    merchant: parsed.merchant,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.88,
    parser_type: visionResult.provider,
  };
}

/**
 * 核心功能 3：AI 月度财务消费体检与诊断报告
 */
export async function generateAiMonthlyDiagnosis(
  env: Env,
  userConfig: UserAiConfig | null,
  month: string,
  statsData: {
    total_income: number;
    total_expense: number;
    surplus: number;
    savings_rate: number;
    category_breakdown: Array<{ name: string; amount: number; percentage: number }>;
    subscriptions_monthly_total: number;
    active_items_daily_cost: number;
    active_items_count: number;
  }
): Promise<AiDiagnosisResult> {
  const nowStr = getNowUTC8Str();

  const systemPrompt = `你是一位专业且温暖、具备敏锐财务洞察力的个人财务规划专家。
你的任务是根据用户当月的财务全景数据（收支状况、各分类占比、固定订阅消耗、持物大件折旧成本），生成一份幽默而极具指导意义的《月度消费体检报告》。

请必须严格输出为以下格式的 JSON 对象：
{
  "health_score": 88,                       // 财务健康分 (0~100)
  "persona_tag": "理性克制的长期主义者",     // 一个生动有趣的财务性格标签 (6~12字)
  "summary": "整体评价段落...",             // 120~180字，综合点评本月的收支结余与现金流控制
  "highlights": [                           // 2~3条值得夸奖与肯定的消费习惯亮点
    "亮点1...",
    "亮点2..."
  ],
  "risks_and_leaks": [                      // 2~3条值得警惕的'跑冒滴漏'隐性支出或异常偏高项
    "预警1...",
    "预警2..."
  ],
  "actionable_tips": [                      // 3条下个月立竿见影的改善实操建议
    "建议1...",
    "建议2...",
    "建议3..."
  ]
}`;

  const userPrompt = `用户 ${month} 月度财务全景数据：
- 总收入: ${(statsData.total_income / 100).toFixed(2)} 元
- 总支出: ${(statsData.total_expense / 100).toFixed(2)} 元
- 当月结余: ${(statsData.surplus / 100).toFixed(2)} 元 (储蓄率: ${statsData.savings_rate.toFixed(1)}%)
- 每月固定订阅开销: ${(statsData.subscriptions_monthly_total / 100).toFixed(2)} 元/月
- 持物大件日均折算成本: ${(statsData.active_items_daily_cost / 100).toFixed(2)} 元/天 (共 ${statsData.active_items_count} 件在役装备)
- 主要消费分类占比:
${statsData.category_breakdown.map((c) => `  * ${c.name}: ${(c.amount / 100).toFixed(2)} 元 (${c.percentage.toFixed(1)}%)`).join('\n')}

请根据以上数据生成体检诊断 JSON。`;

  const llmResult = await callTextLlm(env, userConfig, systemPrompt, userPrompt);

  if (llmResult) {
    const parsed = extractJsonFromResponse(llmResult.text);
    if (parsed && typeof parsed.health_score === 'number') {
      return {
        month,
        health_score: Math.min(100, Math.max(0, Math.round(parsed.health_score))),
        persona_tag: parsed.persona_tag || '稳健前行探索者',
        summary: parsed.summary || '本月整体收支平稳，现金流健康。',
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : ['保持了良好的储蓄习惯'],
        risks_and_leaks: Array.isArray(parsed.risks_and_leaks) ? parsed.risks_and_leaks : ['部分日常小额消费相对分散'],
        actionable_tips: Array.isArray(parsed.actionable_tips)
          ? parsed.actionable_tips
          : ['设立下月餐饮总预算限额', '定期复盘长期未使用的订阅服务', '继续享受大件装备带来的生活品质'],
        generated_at: nowStr,
      };
    }
  }

  // 本地简易启发式托底生成报告（确保任何时候点击都能出报告）
  const savingsRate = statsData.savings_rate;
  let healthScore = 75;
  let persona = '平衡生活探索家';

  if (savingsRate >= 40) {
    healthScore = 92;
    persona = '高储蓄自律达人';
  } else if (savingsRate >= 20) {
    healthScore = 85;
    persona = '收支平衡精明生活家';
  } else if (savingsRate >= 0) {
    healthScore = 72;
    persona = '乐在当下的生活享受派';
  } else {
    healthScore = 58;
    persona = '现金流亮黄灯需警惕者';
  }

  const topCategory = statsData.category_breakdown[0]?.name || '日常开支';

  return {
    month,
    health_score: healthScore,
    persona_tag: persona,
    summary: `本月总支出 ¥${(statsData.total_expense / 100).toFixed(2)}，总收入 ¥${(statsData.total_income / 100).toFixed(2)}，储蓄率为 ${savingsRate.toFixed(1)}%。其中【${topCategory}】为当月第一大开销。整体财务处于可控区间。`,
    highlights: [
      `本月储蓄率达到 ${savingsRate.toFixed(1)}%，保持了正向结余。`,
      `持物大件日均成本得到平稳摊薄，物品物尽其用。`,
    ],
    risks_and_leaks: [
      `【${topCategory}】占总开销比重最高，可留意是否存在高频非刚需支出。`,
      `固定订阅月度总额持续产生现金流流出，建议定期检查是否有吃灰服务。`,
    ],
    actionable_tips: [
      `建议为下个月的【${topCategory}】设定合理的支出上限。`,
      `继续坚持每日随手记账，避免月终突击查账。`,
      `考虑将闲置不用的大件出二手回血，进一步优化资产结构。`,
    ],
    generated_at: nowStr,
  };
}
