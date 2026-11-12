-- 0006: 为交易流水增加消费场景标签字段 (scene)

ALTER TABLE transactions ADD COLUMN scene TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_trans_user_scene ON transactions(user_id, scene);
