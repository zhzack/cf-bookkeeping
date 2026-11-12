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

