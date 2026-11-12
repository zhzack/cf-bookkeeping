-- 0005: 微信/支付宝账单导入去重字段 + iOS 快捷指令长期 API Token 表

ALTER TABLE transactions ADD COLUMN source TEXT DEFAULT 'manual';
ALTER TABLE transactions ADD COLUMN external_id TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_trans_external ON transactions(user_id, external_id);

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
