import { Context, Next } from 'hono';
import { getCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { Env, UserSession } from './types';

// PBKDF2 密码哈希 (利用 WebCrypto API)
export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const enc = new TextEncoder();
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(derivedBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const finalSalt = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return { hash, salt: finalSalt };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const result = await hashPassword(password, salt);
  return result.hash === hash;
}

const DEFAULT_JWT_SECRET = 'b1uegrey_shared_sso_secret_2026_xyz';

// 签发 JWT (指定 HS256 算法)
export async function createSessionToken(user: UserSession, secret?: string): Promise<string> {
  const payload = {
    sub: user.id,
    username: user.username,
    nickname: user.nickname,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30天有效
  };
  return await sign(payload, secret || DEFAULT_JWT_SECRET, 'HS256');
}

export async function hashToken(rawToken: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rawToken));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 提取请求中所有可能的鉴权 Token（按优先级依次尝试：Authorization 标头、URL 参数、Cookie）
export function extractCandidateTokens(c: Context): string[] {
  const candidates: string[] = [];

  // 1. Authorization: Bearer <token>
  const authHeader = c.req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const val = authHeader.substring(7).trim();
    if (val && !candidates.includes(val)) candidates.push(val);
  }

  // 2. URL query 中的 token 或 sso_token
  const qToken = c.req.query('sso_token') || c.req.query('token');
  if (qToken) {
    const val = qToken.trim();
    if (val && !candidates.includes(val)) candidates.push(val);
  }

  // 3. 解析 Cookie Header 中所有的 auth_token（处理跨子域同名 Cookie 冲突）
  const cookieHeader = c.req.header('Cookie') || '';
  if (cookieHeader) {
    const parts = cookieHeader.split(';');
    for (const part of parts) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        const key = part.slice(0, eqIdx).trim();
        const value = part.slice(eqIdx + 1).trim();
        if (key === 'auth_token' && value && !candidates.includes(value)) {
          candidates.push(value);
        }
      }
    }
  }

  // 4. Hono getCookie 保底
  const honoCookie = getCookie(c, 'auth_token');
  if (honoCookie && !candidates.includes(honoCookie)) {
    candidates.push(honoCookie);
  }

  return candidates;
}

// 鉴权中间件（支持多 Cookie 容错重试、URL SSO Token 及快捷指令长期 API Token）
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: UserSession } }>, next: Next) {
  const candidates = extractCandidateTokens(c);

  if (candidates.length === 0) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }

  // 个人长期 API Token 认证（供 iOS 快捷指令 / 自动化调用）
  const cbkToken = candidates.find((t) => t.startsWith('cbk_live_'));
  if (cbkToken) {
    try {
      const tokenHash = await hashToken(cbkToken);
      const row = await c.env.DB.prepare(
        `SELECT t.id AS token_id, u.id, u.username, u.nickname
         FROM api_tokens t
         JOIN users u ON t.user_id = u.id
         WHERE t.token_hash = ?`
      )
        .bind(tokenHash)
        .first<{ token_id: string; id: string; username: string; nickname: string }>();

      if (!row) {
        return c.json({ error: 'API Token 无效或已被撤销' }, 401);
      }

      const touchPromise = c.env.DB.prepare(
        'UPDATE api_tokens SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?'
      )
        .bind(row.token_id)
        .run();
      try {
        c.executionCtx.waitUntil(touchPromise);
      } catch {
        await touchPromise;
      }

      c.set('user', {
        id: row.id,
        username: row.username,
        nickname: row.nickname,
      });
      await next();
      return;
    } catch {
      return c.json({ error: 'API Token 验证失败' }, 401);
    }
  }

  const jwtSecret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
  let validPayload: any = null;

  for (const token of candidates) {
    if (token.startsWith('cbk_live_')) continue;
    try {
      const payload = await verify(token, jwtSecret, 'HS256');
      if (payload && payload.sub) {
        validPayload = payload;
        break;
      }
    } catch {}
  }

  if (!validPayload) {
    return c.json({ error: '登录凭证已过期，请重新登录' }, 401);
  }

  // 检查账号状态 (防封禁账号渗透)
  if (validPayload.status === 'disabled') {
    return c.json({ error: '该账号已被管理员封禁，无法访问记账系统' }, 403);
  }

  // 检查子系统授权矩阵
  if (Array.isArray(validPayload.apps)) {
    const isAllowed = validPayload.apps.includes('*') || validPayload.apps.includes('book');
    if (!isAllowed) {
      return c.json({ error: '您尚未获得访问记账与持物系统的权限，请联系管理员分配' }, 403);
    }
  }

  // 若当前请求中存在多个 auth_token Cookie（通常是历史残留的 host-only Cookie 与新的根域 SSO Cookie 冲突），
  // 下发响应头清理残留的子域 Cookie，确保后续请求干净高效。
  const cookieHeader = c.req.header('Cookie') || '';
  if (cookieHeader.split('auth_token=').length > 2) {
    deleteCookie(c, 'auth_token', { path: '/' });
  }

  c.set('user', {
    id: validPayload.sub as string,
    username: (validPayload.username as string) || '',
    nickname: (validPayload.nickname as string) || '',
  });

  await next();
}

