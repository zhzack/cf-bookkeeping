-- 0012_add_ai_config.sql
-- 支持用户配置 Workers AI 与自定义外部 LLM (DeepSeek / OpenAI / 通义千问等)

CREATE TABLE IF NOT EXISTS user_ai_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    provider TEXT NOT NULL DEFAULT 'workers_ai', -- 'workers_ai' | 'custom'
    custom_endpoint TEXT,                        -- 如 https://api.deepseek.com/v1 或 https://api.openai.com/v1
    custom_api_key TEXT,
    custom_model TEXT,                           -- 如 deepseek-chat, gpt-4o-mini
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ai_config ON user_ai_configs(user_id);
