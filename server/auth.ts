import { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
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

const DEFAULT_JWT_SECRET = 'cf-bookkeeping-production-jwt-secret-key-2026';

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

// 鉴权中间件（支持登录 Cookie/JWT 及快捷指令长期 API Token）
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: UserSession } }>, next: Next) {
  let token = getCookie(c, 'auth_token');

  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    }
  }

  // 同时也支持 URL query 中的 token（用于直接下载 .shortcut 文件或链接触发）
  if (!token) {
    const queryToken = c.req.query('token');
    if (queryToken) {
      token = queryToken.trim();
    }
  }

  if (!token) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }

  // 个人长期 API Token 认证（供 iOS 快捷指令 / 自动化调用）
  if (token.startsWith('cbk_live_')) {
    try {
      const tokenHash = await hashToken(token);
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

  try {
    const jwtSecret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const payload = await verify(token, jwtSecret, 'HS256');
    if (!payload || !payload.sub) {
      return c.json({ error: '登录凭证无效或已过期' }, 401);
    }

    // 检查账号状态 (防封禁账号渗透)
    if (payload.status === 'disabled') {
      return c.json({ error: '该账号已被管理员封禁，无法访问记账系统' }, 403);
    }

    // 检查子系统授权矩阵
    if (Array.isArray(payload.apps)) {
      const isAllowed = payload.apps.includes('*') || payload.apps.includes('book');
      if (!isAllowed) {
        return c.json({ error: '您尚未获得访问记账与持物系统的权限，请联系管理员分配' }, 403);
      }
    }

    c.set('user', {
      id: payload.sub as string,
      username: (payload.username as string) || '',
      nickname: (payload.nickname as string) || '',
    });

    await next();
  } catch (err: any) {
    return c.json({ error: '登录凭证已过期，请重新登录' }, 401);
  }
}

