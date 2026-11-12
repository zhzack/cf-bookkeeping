import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { verify } from 'hono/jwt';
import { Env, UserSession } from '../types';
import { requireAuth } from '../auth';

export const shortcutsRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

interface ShortcutRow {
  id: string;
  user_id?: string | null;
  name: string;
  description: string;
  version: string;
  file_path: string | null;
  file_hash: string | null;
  signing_status: string;
  generation_status: string;
  sharing_type: string;
  icloud_share_url: string | null;
  download_count: number;
  created_at: string;
  updated_at: string;
}

const DEFAULT_JWT_SECRET = 'cf-bookkeeping-production-jwt-secret-key-2026';

// 1. 查询当前用户的快捷指令配置（优先返回该用户的个人专属 iCloud 链接，若无则自动回退到系统官方共享链接）
shortcutsRouter.get('/current', async (c) => {
  let userId: string | null = null;
  try {
    const token = getCookie(c, 'auth_token');
    if (token) {
      const payload = await verify(token, c.env.JWT_SECRET || DEFAULT_JWT_SECRET, 'HS256');
      if (payload && payload.sub) {
        userId = String(payload.sub);
      }
    }
  } catch {
    // ignore unauthenticated
  }

  let row: ShortcutRow | null = null;
  let isPersonal = false;

  // 1. 优先查用户的个人专属覆盖
  if (userId) {
    row = await c.env.DB.prepare(
      'SELECT * FROM shortcuts WHERE user_id = ? LIMIT 1'
    )
      .bind(userId)
      .first<ShortcutRow>();
    if (row && row.icloud_share_url) {
      isPersonal = true;
    }
  }

  // 2. 无个人覆盖时，回退至全局官方记录
  if (!row || !row.icloud_share_url) {
    const globalRow = await c.env.DB.prepare(
      'SELECT * FROM shortcuts WHERE id = ? LIMIT 1'
    )
      .bind('sc_cf_bookkeeping')
      .first<ShortcutRow>();
    if (globalRow) {
      row = globalRow;
      isPersonal = false;
    }
  }

  if (!row) {
    return c.json({ error: '未找到快捷指令配置' }, 404);
  }

  const reqUrl = new URL(c.req.url);
  const host = `${reqUrl.protocol}//${reqUrl.host}`;

  return c.json({
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    signing_status: row.signing_status,
    generation_status: row.generation_status,
    sharing_type: row.icloud_share_url ? 'icloud' : 'guide',
    icloud_share_url: row.icloud_share_url,
    is_personal: isPersonal,
    download_count: row.download_count,
    download_url: `${host}/api/v1/shortcuts/${row.id}/download`,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
});

shortcutsRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM shortcuts WHERE id = ?')
    .bind(id)
    .first<ShortcutRow>();

  if (!row) {
    return c.json({ error: '未找到快捷指令' }, 404);
  }

  return c.json(row);
});

// 2. 获取可用的分享链接
shortcutsRouter.get('/:id/share', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT * FROM shortcuts WHERE id = ?')
    .bind(id)
    .first<ShortcutRow>();

  if (!row) {
    return c.json({ error: '快捷指令不存在' }, 404);
  }

  const hasValidICloud =
    typeof row.icloud_share_url === 'string' &&
    row.icloud_share_url.startsWith('https://www.icloud.com/shortcuts/');

  return c.json({
    id: row.id,
    name: row.name,
    sharing_type: hasValidICloud ? 'icloud' : 'guide',
    icloud_share_url: hasValidICloud ? row.icloud_share_url : null,
    verified_icloud: hasValidICloud,
    message: hasValidICloud
      ? '已绑定官方认证的 Apple iCloud 分享链接'
      : '尚未绑定官方 iCloud 分享链接，可使用两步快捷引导或下载文件导入',
  });
});

// 3. 设置/更新个人专属 iCloud 分享链接 (用户级别覆盖)
shortcutsRouter.post('/my/icloud-url', requireAuth, async (c) => {
  const user = c.get('user');
  const { url } = await c.req.json();
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (trimmed) {
    if (!/^https:\/\/www\.icloud\.com\/shortcuts\/[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      return c.json({
        error: '无效的 iCloud 快捷指令链接格式，格式须为 https://www.icloud.com/shortcuts/xxxxxxxx',
      }, 400);
    }

    const personalId = `sc_usr_${user.id}`;
    await c.env.DB.prepare(
      `INSERT INTO shortcuts (id, user_id, name, description, version, signing_status, generation_status, sharing_type, icloud_share_url)
       VALUES (?, ?, ?, '个人专属随手记账', '1.0.0', 'unsigned', 'ready', 'icloud', ?)
       ON CONFLICT(id) DO UPDATE SET icloud_share_url = ?, sharing_type = 'icloud', updated_at = CURRENT_TIMESTAMP`
    )
      .bind(personalId, user.id, `${user.nickname || user.username}的随手记账`, trimmed, trimmed)
      .run();

    return c.json({ success: true, icloud_share_url: trimmed, is_personal: true });
  } else {
    // 清空个人专属链接，回退到全局官方链接
    await c.env.DB.prepare('DELETE FROM shortcuts WHERE user_id = ?')
      .bind(user.id)
      .run();
    return c.json({ success: true, icloud_share_url: null, is_personal: false });
  }
});

// 4. 绑定/更新系统官方共享 iCloud 链接 (系统全局级别)
shortcutsRouter.post('/:id/icloud-url', requireAuth, async (c) => {
  const id = c.req.param('id');
  const { url } = await c.req.json();

  if (url && typeof url === 'string') {
    const trimmed = url.trim();
    if (!/^https:\/\/www\.icloud\.com\/shortcuts\/[a-zA-Z0-9_\-]+$/.test(trimmed)) {
      return c.json({
        error: '无效的 iCloud 快捷指令链接格式，格式须为 https://www.icloud.com/shortcuts/xxxxxxxx',
      }, 400);
    }

    await c.env.DB.prepare(
      `UPDATE shortcuts
       SET icloud_share_url = ?, sharing_type = 'icloud', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(trimmed, id)
      .run();

    return c.json({ success: true, icloud_share_url: trimmed });
  } else {
    // 清空链接
    await c.env.DB.prepare(
      `UPDATE shortcuts
       SET icloud_share_url = NULL, sharing_type = 'guide', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    )
      .bind(id)
      .run();

    return c.json({ success: true, icloud_share_url: null });
  }
});

// 5. 下载 .shortcut 文件 (模式 A：直接下载已封装好配置的文件)
shortcutsRouter.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const token = c.req.query('token') || '';
  const reqUrl = new URL(c.req.url);
  const host = `${reqUrl.protocol}//${reqUrl.host}`;
  const endpoint = `${host}/api/transactions/quick`;

  try {
    const updatePromise = c.env.DB.prepare(
      'UPDATE shortcuts SET download_count = download_count + 1 WHERE id = ?'
    )
      .bind(id)
      .run();
    c.executionCtx.waitUntil(updatePromise);
  } catch {
    // ignore
  }

  const plistXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>WFWorkflowActions</key>
    <array>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.ask</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFAskActionPrompt</key>
                <string>请输入消费内容（如：午饭 25、咖啡 18.5、打车 32）</string>
                <key>WFInputType</key>
                <string>Text</string>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.downloadurl</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFURL</key>
                <string>${endpoint}</string>
                <key>WFHTTPMethod</key>
                <string>POST</string>
                <key>WFHTTPBodyType</key>
                <string>JSON</string>
                <key>WFHTTPHeaders</key>
                <dict>
                    <key>Value</key>
                    <dict>
                        <key>WFDictionaryFieldValueItems</key>
                        <array>
                            <dict>
                                <key>WFKey</key>
                                <dict><key>Value</key><dict><key>string</key><string>Authorization</string></dict></dict>
                                <key>WFValue</key>
                                <dict><key>Value</key><dict><key>string</key><string>Bearer ${token || 'YOUR_TOKEN'}</string></dict></dict>
                            </dict>
                            <dict>
                                <key>WFKey</key>
                                <dict><key>Value</key><dict><key>string</key><string>Content-Type</string></dict></dict>
                                <key>WFValue</key>
                                <dict><key>Value</key><dict><key>string</key><string>application/json</string></dict></dict>
                            </dict>
                        </array>
                    </dict>
                    <key>WFSerializationType</key>
                    <string>WFDictionaryFieldValue</string>
                </dict>
            </dict>
        </dict>
        <dict>
            <key>WFWorkflowActionIdentifier</key>
            <string>is.workflow.actions.notification</string>
            <key>WFWorkflowActionParameters</key>
            <dict>
                <key>WFNotificationActionTitle</key>
                <string>记账成功</string>
                <key>WFNotificationActionBody</key>
                <string>云端轻记账已入账并自动分类</string>
            </dict>
        </dict>
    </array>
    <key>WFWorkflowClientVersion</key>
    <string>2600.0</string>
    <key>WFWorkflowMinimumClientVersion</key>
    <integer>900</integer>
</dict>
</plist>`;

  c.header('Content-Type', 'application/x-apple-aspen-config');
  c.header('Content-Disposition', 'attachment; filename="随手记账.shortcut"');
  return c.body(plistXml);
});

// 6. 生成接口 POST /api/v1/shortcuts/generate
shortcutsRouter.post('/generate', requireAuth, async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : '随手记账';
  const description = typeof body?.description === 'string' ? body.description.trim() : '';

  const shortcutId = 'sc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  await c.env.DB.prepare(
    `INSERT INTO shortcuts (id, user_id, name, description, version, signing_status, generation_status, sharing_type)
     VALUES (?, ?, ?, ?, '1.0.0', 'unsigned', 'ready', 'guide')`
  )
    .bind(shortcutId, user.id, name, description)
    .run();

  const reqUrl = new URL(c.req.url);
  const host = `${reqUrl.protocol}//${reqUrl.host}`;

  return c.json({
    id: shortcutId,
    name,
    version: '1.0.0',
    generation_status: 'ready',
    signing_status: 'unsigned',
    download_url: `${host}/api/v1/shortcuts/${shortcutId}/download`,
    created_at: new Date().toISOString(),
  });
});
