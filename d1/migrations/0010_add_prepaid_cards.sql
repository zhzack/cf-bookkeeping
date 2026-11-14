-- 为交易流水增加关联充值卡 ID 字段
ALTER TABLE transactions ADD COLUMN card_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_trans_card ON transactions(card_id);

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
