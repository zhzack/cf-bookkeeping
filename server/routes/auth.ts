import { Hono } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';
import { Env, UserSession } from '../types';
import { hashPassword, hashToken, verifyPassword, createSessionToken, requireAuth } from '../auth';

export const authRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

// 检查是否需要初次设置管理员
authRouter.get('/status', async (c) => {
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
    const count = row?.count || 0;
    return c.json({ needSetup: count === 0 });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// 首次安装设置管理员账号
authRouter.post('/setup', async (c) => {
  const row = await c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
  if ((row?.count || 0) > 0) {
    return c.json({ error: '系统已初始化，禁止重复设置' }, 400);
  }

  const { username, password, nickname } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: '用户名和密码不能为空' }, 400);
  }
  if (password.length < 6) {
    return c.json({ error: '密码长度至少为 6 位' }, 400);
  }

  const userId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const { hash, salt } = await hashPassword(password);
  const finalNickname = nickname?.trim() || username;

  // 插入用户
  await c.env.DB.prepare(
    'INSERT INTO users (id, username, password_hash, salt, nickname) VALUES (?, ?, ?, ?, ?)'
  ).bind(userId, username.trim(), hash, salt, finalNickname).run();

  // 为新用户初始化预置常用账户
  const defaultAccounts = [
    { name: '微信钱包', type: 'wechat', icon: 'wechat', color: '#07C160', sort: 1 },
    { name: '支付宝', type: 'alipay', icon: 'alipay', color: '#1677FF', sort: 2 },
    { name: '储蓄卡', type: 'bank', icon: 'bank', color: '#FA541C', sort: 3 },
    { name: '现金', type: 'cash', icon: 'cash', color: '#52C41A', sort: 4 },
  ];

  for (const acc of defaultAccounts) {
    const accId = 'acc_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      'INSERT INTO accounts (id, user_id, name, type, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(accId, userId, acc.name, acc.type, acc.icon, acc.color, acc.sort).run();
  }

  // 为新用户初始化预置分类
  const defaultExpenseCategories = [
    { name: '餐饮美食', icon: 'Utensils', color: '#F59E0B' },
    { name: '交通出行', icon: 'Car', color: '#3B82F6' },
    { name: '日常百货', icon: 'ShoppingBag', color: '#EC4899' },
    { name: '休闲娱乐', icon: 'Gamepad2', color: '#8B5CF6' },
    { name: '住房物业', icon: 'Home', color: '#10B981' },
    { name: '医疗健康', icon: 'HeartPulse', color: '#EF4444' },
    { name: '数码电器', icon: 'Smartphone', color: '#6366F1' },
    { name: '服饰装扮', icon: 'Shirt', color: '#F43F5E' },
    { name: '人情往来', icon: 'Gift', color: '#14B8A6' },
    { name: '其他支出', icon: 'MoreHorizontal', color: '#64748B' },
  ];

  const defaultIncomeCategories = [
    { name: '工资薪酬', icon: 'Briefcase', color: '#10B981' },
    { name: '兼职副业', icon: 'Zap', color: '#6366F1' },
    { name: '投资理财', icon: 'TrendingUp', color: '#F59E0B' },
    { name: '奖金补贴', icon: 'Award', color: '#EC4899' },
    { name: '其他收入', icon: 'Coins', color: '#3B82F6' },
  ];

  let catSort = 1;
  for (const cat of defaultExpenseCategories) {
    const catId = 'cat_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      'INSERT INTO categories (id, user_id, name, type, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(catId, userId, cat.name, 'expense', cat.icon, cat.color, catSort++).run();
  }

  for (const cat of defaultIncomeCategories) {
    const catId = 'cat_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await c.env.DB.prepare(
      'INSERT INTO categories (id, user_id, name, type, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(catId, userId, cat.name, 'income', cat.icon, cat.color, catSort++).run();
  }

  const sessionUser: UserSession = { id: userId, username: username.trim(), nickname: finalNickname };
  const token = await createSessionToken(sessionUser, c.env.JWT_SECRET);

  const isHttps = c.req.url.startsWith('https');
  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return c.json({ user: sessionUser, token });
});

// 账号密码登录
authRouter.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) {
    return c.json({ error: '请输入用户名和密码' }, 400);
  }

  const user = await c.env.DB.prepare(
    'SELECT id, username, password_hash, salt, nickname FROM users WHERE username = ?'
  ).bind(username.trim()).first<{ id: string; username: string; password_hash: string; salt: string; nickname: string }>();

  if (!user || !(await verifyPassword(password, user.password_hash, user.salt))) {
    return c.json({ error: '用户名或密码错误' }, 401);
  }

  const sessionUser: UserSession = { id: user.id, username: user.username, nickname: user.nickname };
  const token = await createSessionToken(sessionUser, c.env.JWT_SECRET);

  const isHttps = c.req.url.startsWith('https');
  setCookie(c, 'auth_token', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: 'Lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });

  return c.json({ user: sessionUser, token });
});

// 退出登录
authRouter.post('/logout', (c) => {
  deleteCookie(c, 'auth_token', { path: '/' });
  return c.json({ success: true });
});

// 获取当前用户信息
authRouter.get('/me', requireAuth, (c) => {
  const user = c.get('user');
  return c.json({ user });
});

// 修改密码
authRouter.post('/password', requireAuth, async (c) => {
  const user = c.get('user');
  const { oldPassword, newPassword } = await c.req.json();

  if (!oldPassword || !newPassword || newPassword.length < 6) {
    return c.json({ error: '新密码不能少于 6 位' }, 400);
  }

  const dbUser = await c.env.DB.prepare(
    'SELECT password_hash, salt FROM users WHERE id = ?'
  ).bind(user.id).first<{ password_hash: string; salt: string }>();

  if (!dbUser || !(await verifyPassword(oldPassword, dbUser.password_hash, dbUser.salt))) {
    return c.json({ error: '原密码错误' }, 400);
  }

  const { hash, salt } = await hashPassword(newPassword);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, salt = ? WHERE id = ?'
  ).bind(hash, salt, user.id).run();

  return c.json({ message: '密码修改成功' });
});

// 获取当前用户的长期 API Token 列表（用于快捷指令）
authRouter.get('/tokens', requireAuth, async (c) => {
  const user = c.get('user');
  const { results } = await c.env.DB.prepare(
    'SELECT id, name, token_prefix, last_used_at, created_at FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC'
  )
    .bind(user.id)
    .all();

  return c.json({ tokens: results });
});

// 创建新的长期 API Token（仅在创建时返回一次完整明文 Token）
authRouter.post('/tokens', requireAuth, async (c) => {
  const user = c.get('user');
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }

  const countRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM api_tokens WHERE user_id = ?'
  )
    .bind(user.id)
    .first<{ count: number }>();

  if ((countRow?.count || 0) >= 10) {
    return c.json({ error: '最多创建 10 个快捷指令令牌，请先删除不用的旧令牌' }, 400);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const rawHex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const plainToken = `cbk_live_${rawHex}`;
  const tokenHash = await hashToken(plainToken);
  const tokenPrefix = `${plainToken.slice(0, 15)}...${plainToken.slice(-4)}`;
  const id = 'tok_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 40) : 'iOS 快捷指令';

  await c.env.DB.prepare(
    'INSERT INTO api_tokens (id, user_id, name, token_hash, token_prefix) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(id, user.id, name, tokenHash, tokenPrefix)
    .run();

  return c.json({
    id,
    name,
    token: plainToken,
    token_prefix: tokenPrefix,
    created_at: new Date().toISOString(),
  });
});

// 撤销/删除 API Token
authRouter.delete('/tokens/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare(
    'SELECT id FROM api_tokens WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first();

  if (!existing) {
    return c.json({ error: '令牌不存在' }, 404);
  }

  await c.env.DB.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  return c.json({ success: true });
});
