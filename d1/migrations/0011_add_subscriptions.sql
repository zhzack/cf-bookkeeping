-- 为交易流水增加关联订阅/周期性记账 ID 字段
ALTER TABLE transactions ADD COLUMN subscription_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_trans_sub ON transactions(subscription_id);

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
