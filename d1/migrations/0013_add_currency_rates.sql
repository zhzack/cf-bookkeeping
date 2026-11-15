-- 0013_add_currency_rates.sql
-- 汇率支持与跨币种外汇钱包

CREATE TABLE IF NOT EXISTS currency_rates (
    code TEXT PRIMARY KEY,                   -- 货币代码: 'CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY', 'SGD', 'AUD', 'CAD', 'THB', 'KRW'
    name TEXT NOT NULL,                      -- 货币名称: '人民币', '美元', '港币' 等
    symbol TEXT NOT NULL,                    -- 货币符号: '¥', '$', 'HK$', '€', '£', 'JP¥', 'S$' 等
    rate_to_cny REAL NOT NULL DEFAULT 1.0,  -- 1 单位该外币兑换人民币 (如 USD 为 7.24, HKD 为 0.93)
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化主流全球外汇汇率基准数据
INSERT OR REPLACE INTO currency_rates (code, name, symbol, rate_to_cny) VALUES
    ('CNY', '人民币', '¥', 1.0),
    ('USD', '美元', '$', 7.24),
    ('HKD', '港币', 'HK$', 0.93),
    ('EUR', '欧元', '€', 7.85),
    ('GBP', '英镑', '£', 9.42),
    ('JPY', '日元', 'JP¥', 0.047),
    ('SGD', '新加坡元', 'S$', 5.48),
    ('AUD', '澳元', 'A$', 4.75),
    ('CAD', '加元', 'C$', 5.21),
    ('THB', '泰铢', '฿', 0.21),
    ('KRW', '韩元', '₩', 0.0052);

-- 为 transactions 表支持跨币种转账汇率与实收金额
ALTER TABLE transactions ADD COLUMN target_amount INTEGER DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN exchange_rate REAL DEFAULT NULL;
