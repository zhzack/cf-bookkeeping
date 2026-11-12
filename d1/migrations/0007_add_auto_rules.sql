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
