-- 为快捷指令表支持多租户/个人专属快捷指令覆盖
ALTER TABLE shortcuts ADD COLUMN user_id TEXT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_shortcuts_user ON shortcuts(user_id);
