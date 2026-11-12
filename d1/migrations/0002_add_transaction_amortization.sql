-- 为流水表增加固定开销摊销与每日生活成本排除字段
ALTER TABLE transactions ADD COLUMN amortize_days INTEGER DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN amortize_start_date TEXT DEFAULT NULL;
ALTER TABLE transactions ADD COLUMN exclude_daily_cost INTEGER DEFAULT 0;

-- 将历史由大件/心愿单同步生成的流水标记为排除，避免与持物大件日均摊薄重复计算
UPDATE transactions
SET exclude_daily_cost = 1
WHERE category_id IS NULL
  AND (
    remark LIKE '购买大件: %'
    OR remark LIKE '心愿单拔草购买: %'
    OR remark LIKE '大件追加支出: %'
  );
