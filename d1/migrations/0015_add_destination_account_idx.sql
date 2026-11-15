-- 0015_add_destination_account_idx.sql
-- 为转账目标账户字段添加索引，加速账户实时余额聚合与转账统计

CREATE INDEX IF NOT EXISTS idx_trans_dest_account ON transactions(destination_account_id);
