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

// 签发 JWT (指定 HS256 算法)
export async function createSessionToken(user: UserSession, secret: string): Promise<string> {
  const payload = {
    sub: user.id,
    username: user.username,
    nickname: user.nickname,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30天有效
  };
  return await sign(payload, secret, 'HS256');
}

// 鉴权中间件
export async function requireAuth(c: Context<{ Bindings: Env; Variables: { user: UserSession } }>, next: Next) {
  let token = getCookie(c, 'auth_token');

  if (!token) {
    const authHeader = c.req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return c.json({ error: '未登录，请先登录' }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    if (!payload || !payload.sub) {
      return c.json({ error: '登录凭证无效或已过期' }, 401);
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

