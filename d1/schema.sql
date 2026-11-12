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
    source TEXT DEFAULT 'manual', -- 来源: 'manual' | 'wechat' | 'alipay' | 'shortcut' | 'item'
    external_id TEXT DEFAULT NULL, -- 外部账单单号/幂等去重键（如 wx:xxx / ali:xxx）
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


