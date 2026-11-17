-- 支持周期性收入（如每月发薪、房租收入等）与周期性支出（订阅、房租水电等）
ALTER TABLE subscriptions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense';
