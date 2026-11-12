-- 为流水记账新增照片附件表
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
