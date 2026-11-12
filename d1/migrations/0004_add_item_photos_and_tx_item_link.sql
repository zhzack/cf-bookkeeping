-- 为交易流水增加关联大件 ID 字段，并新增持物大件照片表
ALTER TABLE transactions ADD COLUMN item_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_trans_item ON transactions(item_id);

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
