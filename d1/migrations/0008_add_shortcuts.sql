-- 创建快捷指令版本管理与分发表
CREATE TABLE IF NOT EXISTS shortcuts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    version TEXT NOT NULL DEFAULT '1.0.0',
    file_path TEXT DEFAULT NULL,
    file_hash TEXT DEFAULT NULL,
    signing_status TEXT DEFAULT 'unsigned', -- 'unsigned' | 'signed' | 'official_signed'
    generation_status TEXT DEFAULT 'ready',  -- 'pending' | 'ready' | 'failed'
    sharing_type TEXT DEFAULT 'icloud',      -- 'icloud' | 'direct_download' | 'guide'
    icloud_share_url TEXT DEFAULT NULL,
    download_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化官方「随手记账」快捷指令基础记录
INSERT OR IGNORE INTO shortcuts (id, name, description, version, signing_status, generation_status, sharing_type, icloud_share_url)
VALUES (
    'sc_cf_bookkeeping',
    '随手记账',
    '支持对 Siri 语音记账、轻点手机背面两下记账与付款截屏 OCR 自动识别，一秒同步入账。',
    '1.0.0',
    'unsigned',
    'ready',
    'icloud',
    NULL
);
