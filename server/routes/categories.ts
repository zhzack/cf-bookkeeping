import { Hono } from 'hono';
import { Env, UserSession, Category } from '../types';
import { requireAuth } from '../auth';

export const categoriesRouter = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

categoriesRouter.use('*', requireAuth);

// 获取分类列表（可根据 type 筛选）
categoriesRouter.get('/', async (c) => {
  const user = c.get('user');
  const type = c.req.query('type'); // 'expense' | 'income' | undefined

  let sql = 'SELECT * FROM categories WHERE user_id = ?';
  const params: any[] = [user.id];

  if (type === 'expense' || type === 'income') {
    sql += ' AND type = ?';
    params.push(type);
  }

  sql += ' ORDER BY sort_order ASC, created_at ASC';

  const { results } = await c.env.DB.prepare(sql).bind(...params).all<Category>();
  return c.json({ categories: results });
});

// 新增分类
categoriesRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
  const type = body?.type;
  const icon = typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim() : 'Tag';
  const color = typeof body?.color === 'string' && body.color.trim() ? body.color.trim() : '#6B7280';

  if (!rawName) {
    return c.json({ error: '分类名称不能为空' }, 400);
  }
  const cleanName = rawName.slice(0, 20);
  if (type !== 'expense' && type !== 'income') {
    return c.json({ error: '分类类型必须是支出 (expense) 或收入 (income)' }, 400);
  }

  const dup = await c.env.DB.prepare(
    'SELECT id FROM categories WHERE user_id = ? AND type = ? AND LOWER(TRIM(name)) = LOWER(?)'
  )
    .bind(user.id, type, cleanName)
    .first<{ id: string }>();
  if (dup) {
    return c.json({ error: `已存在同名${type === 'expense' ? '支出' : '收入'}分类「${cleanName}」` }, 400);
  }

  const id = 'cat_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const maxSortRow = await c.env.DB.prepare(
    'SELECT MAX(sort_order) as max_sort FROM categories WHERE user_id = ? AND type = ?'
  ).bind(user.id, type).first<{ max_sort: number }>();
  const sortOrder = (maxSortRow?.max_sort || 0) + 1;

  await c.env.DB.prepare(
    `INSERT INTO categories (id, user_id, name, type, icon, color, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, user.id, cleanName, type, icon, color, sortOrder).run();

  const created = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<Category>();

  return c.json({ id, category: created, message: '分类创建成功' });
});

// 更新分类
categoriesRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const rawName = typeof body?.name === 'string' ? body.name.trim() : '';

  if (!rawName) {
    return c.json({ error: '分类名称不能为空' }, 400);
  }
  const cleanName = rawName.slice(0, 20);

  const existing = await c.env.DB.prepare(
    'SELECT * FROM categories WHERE id = ? AND user_id = ?'
  )
    .bind(id, user.id)
    .first<Category>();

  if (!existing) {
    return c.json({ error: '未找到该分类或无权修改' }, 404);
  }

  const dup = await c.env.DB.prepare(
    'SELECT id FROM categories WHERE user_id = ? AND type = ? AND LOWER(TRIM(name)) = LOWER(?) AND id != ?'
  )
    .bind(user.id, existing.type, cleanName, id)
    .first<{ id: string }>();
  if (dup) {
    return c.json({ error: `已存在同名${existing.type === 'expense' ? '支出' : '收入'}分类「${cleanName}」` }, 400);
  }

  const nextIcon =
    typeof body?.icon === 'string' && body.icon.trim() ? body.icon.trim() : existing.icon || 'Tag';
  const nextColor =
    typeof body?.color === 'string' && body.color.trim() ? body.color.trim() : existing.color || '#6B7280';

  await c.env.DB.prepare(
    `UPDATE categories
     SET name = ?, icon = ?, color = ?
     WHERE id = ? AND user_id = ?`
  ).bind(cleanName, nextIcon, nextColor, id, user.id).run();

  const updated = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<Category>();

  return c.json({ category: updated, message: '分类更新成功' });
});

// 删除分类
categoriesRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');

  // 将已有流水的 category_id 置空
  await c.env.DB.prepare(
    'UPDATE transactions SET category_id = NULL WHERE category_id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  const res = await c.env.DB.prepare(
    'DELETE FROM categories WHERE id = ? AND user_id = ?'
  ).bind(id, user.id).run();

  if (res.meta.changes === 0) {
    return c.json({ error: '未找到该分类或无权删除' }, 404);
  }

  return c.json({ message: '分类已删除' });
});

