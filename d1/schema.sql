-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    nickname TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 账户表
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'cash' | 'bank' | 'alipay' | 'wechat' | 'credit' | 'other'
    currency TEXT DEFAULT 'CNY',
    initial_balance INTEGER DEFAULT 0, -- 单位：分
    current_balance INTEGER DEFAULT 0, -- 单位：分
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 分类表
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL, -- 'expense' | 'income'
    icon TEXT,
    color TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 交易流水表
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL, -- 'expense' | 'income' | 'transfer'
    amount INTEGER NOT NULL, -- 单位：分，必为正整数
    account_id TEXT NOT NULL,
    destination_account_id TEXT, -- 仅转账时使用
    category_id TEXT, -- 支出/收入分类
    transaction_time TEXT NOT NULL, -- ISO字符串或 YYYY-MM-DD HH:mm:ss
    remark TEXT,
    scene TEXT DEFAULT NULL, -- 消费场景标签（如：日常三餐、通勤出行、社交聚会、旅行出差等）
    amortize_days INTEGER DEFAULT NULL, -- 固定开销摊销天数（>1 时按天分摊到每日生活成本）
    amortize_start_date TEXT DEFAULT NULL, -- 摊销起始日期 (YYYY-MM-DD)
    exclude_daily_cost INTEGER DEFAULT 0, -- 是否排除出每日生活成本计算（如大件同步流水避免重复）
    item_id TEXT DEFAULT NULL, -- 关联的大件物品 ID（记账转大件/大件同步流水）
    card_id TEXT DEFAULT NULL, -- 关联的充值卡 ID（充值/核销流水）
    subscription_id TEXT DEFAULT NULL, -- 关联的订阅/周期性记账 ID
    source TEXT DEFAULT 'manual', -- 来源: 'manual' | 'wechat' | 'alipay' | 'shortcut' | 'item' | 'prepaid_card' | 'subscription'
    external_id TEXT DEFAULT NULL, -- 外部账单单号/幂等去重键（如 wx:xxx / ali:xxx）
    target_amount INTEGER DEFAULT NULL, -- 跨币种转账时转入账户实收金额 (单位: 目标货币分)
    exchange_rate REAL DEFAULT NULL, -- 跨币种转账或结算汇率 (目标币种 / 源币种)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (destination_account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- 索引以加速查询
CREATE INDEX IF NOT EXISTS idx_trans_user_time ON transactions(user_id, transaction_time DESC);
CREATE INDEX IF NOT EXISTS idx_trans_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_trans_category ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_trans_item ON transactions(item_id);
CREATE INDEX IF NOT EXISTS idx_trans_card ON transactions(card_id);
CREATE INDEX IF NOT EXISTS idx_trans_sub ON transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_trans_external ON transactions(user_id, external_id);
CREATE INDEX IF NOT EXISTS idx_trans_user_scene ON transactions(user_id, scene);

-- 个人长期 API Token 表（供 iOS 快捷指令等自动化工具使用）
CREATE TABLE IF NOT EXISTS api_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT 'iOS 快捷指令',
    token_hash TEXT UNIQUE NOT NULL,
    token_prefix TEXT NOT NULL,
    last_used_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

-- 交易流水照片表（压缩后的图片 Data URL，零额外对象存储依赖）
CREATE TABLE IF NOT EXISTS transaction_photos (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    data_url TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tx_photos_tx ON transaction_photos(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tx_photos_user ON transaction_photos(user_id);

-- 大件物品与使用寿命/日均成本表
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,                  -- 物品名称 (如: MacBook Pro 14、戴森吸尘器)
    category TEXT,                       -- 分类 (数码科技、家电厨卫、居家家具、穿搭首饰、运动出行、其他大件)
    price INTEGER NOT NULL,              -- 购买价格 (单位: 分)
    resale_price INTEGER DEFAULT 0,      -- 二手转卖/报废残值 (单位: 分)
    purchase_date TEXT NOT NULL,         -- 购买日期或加入心愿单日期 (YYYY-MM-DD)
    status TEXT DEFAULT 'using',         -- 'using'(服役中) | 'wishlist'(冷静期心愿单) | 'retired'(已损坏/淘汰) | 'sold'(已转二手) | 'idle'(闲置)
    retired_date TEXT,                   -- 损坏/转卖日期 (YYYY-MM-DD)
    expected_days INTEGER,               -- 预期寿命天数 (例如: 1095天 = 3年)
    warranty_date TEXT,                  -- 质保期截止日 (YYYY-MM-DD)
    location TEXT,                       -- 存放位置 (如: 书房、随身、客厅)
    cooling_days INTEGER DEFAULT 7,      -- 心愿单冷静期天数 (默认7天)
    remark TEXT,                         -- 备注 (损坏原因、质保期、购买渠道等)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id, status);

-- 物品追加支出表 (配件、维护保养、维修、换电池等隐性成本)
CREATE TABLE IF NOT EXISTS item_expenses (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    amount INTEGER NOT NULL,             -- 金额 (单位: 分)
    description TEXT NOT NULL,          -- 费用说明 (如: 购买保护套、更换电池、加装内存条)
    date TEXT NOT NULL,                  -- 支出日期 (YYYY-MM-DD)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_exp_item ON item_expenses(item_id);

-- 持物大件照片表
CREATE TABLE IF NOT EXISTS item_photos (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    data_url TEXT NOT NULL,
    size_bytes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_item_photos_item ON item_photos(item_id);
CREATE INDEX IF NOT EXISTS idx_item_photos_user ON item_photos(user_id);

-- 自动分类与消费场景匹配规则表
CREATE TABLE IF NOT EXISTS auto_rules (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    tx_type TEXT DEFAULT 'all', -- 'all' | 'expense' | 'income'
    keywords TEXT NOT NULL, -- 逗号/顿号分隔关键词
    match_mode TEXT DEFAULT 'contains', -- 'contains' | 'exact'
    account_id TEXT DEFAULT NULL,
    category_id TEXT DEFAULT NULL,
    scene TEXT DEFAULT NULL,
    priority INTEGER DEFAULT 100,
    enabled INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_auto_rules_user ON auto_rules(user_id, enabled, priority DESC);

-- 快捷指令版本管理与分发表
CREATE TABLE IF NOT EXISTS shortcuts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    file_path TEXT DEFAULT NULL,
    file_hash TEXT DEFAULT NULL,
    signing_status TEXT DEFAULT 'unsigned', -- 'unsigned' | 'signed' | 'official_signed'
    generation_status TEXT DEFAULT 'ready',  -- 'pending' | 'ready' | 'failed'
    sharing_type TEXT DEFAULT 'icloud',      -- 'icloud' | 'direct_download' | 'guide'
    icloud_share_url TEXT DEFAULT NULL,
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 充值卡与会员储值/计次卡表
CREATE TABLE IF NOT EXISTS prepaid_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,                          -- 卡片名称 (如: 威尔仕健身私教卡, 永琪美发储值卡, 车之友洗车次卡)
    type TEXT NOT NULL,                          -- 'balance'(储值余额卡) | 'times'(计次卡)
    merchant TEXT,                               -- 商家/门店名称 (如: 威尔仕健身, 永琪造型)
    icon TEXT DEFAULT 'credit-card',             -- 图标名
    color TEXT DEFAULT '#6366f1',                -- 主题色
    initial_amount INTEGER NOT NULL DEFAULT 0,   -- 首次充值实付金额 (单位: 分)
    initial_value INTEGER NOT NULL DEFAULT 0,    -- 首次获得面值/次数 (余额卡为面值分，计次卡为初始次数)
    gift_amount INTEGER DEFAULT 0,               -- 赠送金额 (单位: 分，仅储值卡)
    current_value INTEGER NOT NULL DEFAULT 0,    -- 当前剩余价值 (余额卡为剩余分，计次卡为剩余次数)
    total_spent_amount INTEGER NOT NULL DEFAULT 0, -- 累计实付充值总额 (单位: 分)
    total_value INTEGER NOT NULL DEFAULT 0,      -- 累计获得总价值 (余额卡为总额度分，计次卡为累计总次数)
    status TEXT DEFAULT 'active',                -- 'active'(正常) | 'exhausted'(已用尽) | 'expired'(已过期) | 'refunded'(已退款/作废)
    valid_until TEXT DEFAULT NULL,               -- 有效期截止日 (YYYY-MM-DD, NULL 为长期有效)
    linked_transaction_id TEXT DEFAULT NULL,     -- 关联的首次开卡/充值流水 ID (可选)
    remark TEXT,                                 -- 备注 (卡号、适用门店、限制条件等)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_prepaid_cards_user ON prepaid_cards(user_id, status);

-- 充值卡操作与核销日志表 (充值、消费核销、手工校准、退款)
CREATE TABLE IF NOT EXISTS prepaid_card_logs (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,                          -- 'recharge'(充值/续充) | 'consume'(核销消费) | 'adjust'(校准) | 'refund'(退款)
    delta_value INTEGER NOT NULL,                -- 变动面值 (余额卡为增减分，计次卡为增减次数，正为充，负为扣)
    actual_amount INTEGER DEFAULT 0,             -- 对应人民币实际发生金额 (单位: 分)
    transaction_id TEXT DEFAULT NULL,            -- 联动生成的日常流水交易 ID
    account_id TEXT DEFAULT NULL,                -- 充值扣款账户 / 退款存入账户
    log_time TEXT NOT NULL,                      -- 发生时间 (YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss)
    remark TEXT,                                 -- 消费/充值说明 (如: "理发+洗吹", "续充20次")
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (card_id) REFERENCES prepaid_cards(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_card_logs_card ON prepaid_card_logs(card_id, log_time DESC);
CREATE INDEX IF NOT EXISTS idx_card_logs_user ON prepaid_card_logs(user_id);

-- 订阅与周期性固定账单表
CREATE TABLE IF NOT EXISTS subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,                          -- 订阅名称 (如: iCloud 200GB, ChatGPT Plus, 房屋租金, 宽带费)
    category_id TEXT DEFAULT NULL,               -- 关联支出分类
    account_id TEXT DEFAULT NULL,                -- 默认扣款账户
    amount INTEGER NOT NULL DEFAULT 0,           -- 每期扣款金额 (单位: 分)
    currency TEXT DEFAULT 'CNY',                 -- 币种 (CNY, USD等)
    period_type TEXT NOT NULL DEFAULT 'monthly', -- 周期类型: 'monthly'(按月) | 'yearly'(按年) | 'weekly'(按周) | 'quarterly'(按季)
    period_interval INTEGER NOT NULL DEFAULT 1,  -- 周期跨度 (如每 1 个月、每 3 个月、每 1 年)
    billing_day INTEGER NOT NULL DEFAULT 1,      -- 每期固定扣费日 (月/季传几号 1~31，周传周几 0~6)
    first_billing_date TEXT NOT NULL,            -- 首次扣费日 (YYYY-MM-DD)
    next_billing_date TEXT NOT NULL,             -- 下次预计扣费日 (YYYY-MM-DD)
    auto_record INTEGER NOT NULL DEFAULT 1,      -- 是否自动入账 (1: 到期自动生成流水，0: 待用户手动确认)
    status TEXT NOT NULL DEFAULT 'active',       -- 状态: 'active'(进行中) | 'paused'(已暂停) | 'cancelled'(已终止)
    icon TEXT DEFAULT 'calendar',                -- 图标名称
    color TEXT DEFAULT '#3b82f6',                -- 主题色
    remark TEXT,                                 -- 备注 (如账号、套餐细节、到期提醒等)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sub_user ON subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sub_next_billing ON subscriptions(status, auto_record, next_billing_date);

-- 用户 AI 大模型与小票识别配置表 (支持 Workers AI 与自定义 DeepSeek / OpenAI 等)
CREATE TABLE IF NOT EXISTS user_ai_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    provider TEXT NOT NULL DEFAULT 'workers_ai', -- 'workers_ai' | 'custom'
    custom_endpoint TEXT,                        -- 如 https://api.deepseek.com/v1 或 https://api.openai.com/v1
    custom_api_key TEXT,
    custom_model TEXT,                           -- 如 deepseek-chat, gpt-4o-mini
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ai_config ON user_ai_configs(user_id);

-- 全球主流外汇与实时汇率表
CREATE TABLE IF NOT EXISTS currency_rates (
    code TEXT PRIMARY KEY,                   -- 货币代码: 'CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'THB', 'KRW'
    name TEXT NOT NULL,                      -- 货币名称: '人民币', '美元', '港币' 等
    symbol TEXT NOT NULL,                    -- 货币符号: '¥', '$', 'HK$', '€', '£', 'JP¥', 'S$' 等
    rate_to_cny REAL NOT NULL DEFAULT 1.0,  -- 1 单位外币兑换人民币汇率 (基准货币为 CNY)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 预算管理与超支预警表 (月度总预算与各分类子限额)
CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    month TEXT NOT NULL DEFAULT 'default', -- 'default' 为通用默认基准，或指定月份如 '2026-11'
    category_id TEXT DEFAULT NULL,        -- NULL 为月度总预算；指定分类 ID 为分类专项预算
    amount INTEGER NOT NULL,              -- 预算额度（单位：分，必为正整数）
    alert_threshold INTEGER DEFAULT 80,   -- 预警阈值百分比（如 80 表示达到 80% 即触发预警）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_budgets_user_month ON budgets (user_id, month);
CREATE UNIQUE INDEX IF NOT EXISTS idx_budgets_unique ON budgets (user_id, month, COALESCE(category_id, '__total__'));







