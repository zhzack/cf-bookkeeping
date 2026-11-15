-- 0014_add_budgets.sql
-- 预算管理与超支预警 (月度总预算与各分类子限额)

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
