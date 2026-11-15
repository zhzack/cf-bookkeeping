import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env, UserSession } from './types';
import { authRouter } from './routes/auth';
import { accountsRouter } from './routes/accounts';
import { categoriesRouter } from './routes/categories';
import { transactionsRouter } from './routes/transactions';
import { statsRouter } from './routes/stats';
import { itemsRouter } from './routes/items';
import { rulesRouter } from './routes/rules';
import { shortcutsRouter } from './routes/shortcuts';
import { cardsRouter } from './routes/cards';
import { subscriptionsRouter, processDueSubscriptions } from './routes/subscriptions';
import { aiRouter } from './routes/ai';
import { backupRouter } from './routes/backup';
import { currencyRouter } from './routes/currency';
import { budgetsRouter } from './routes/budgets';
import { fetchLiveExchangeRates } from './exchangeRate';

const app = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

// 安全收紧跨域策略（仅放行线上生产域名与本地开发环境）
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (origin === 'https://book.b1uegrey.xyz') return origin;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
    return '';
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// API 子路由
const api = new Hono<{ Bindings: Env; Variables: { user: UserSession } }>();

api.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

api.route('/auth', authRouter);
api.route('/accounts', accountsRouter);
api.route('/categories', categoriesRouter);
api.route('/transactions', transactionsRouter);
api.route('/stats', statsRouter);
api.route('/items', itemsRouter);
api.route('/rules', rulesRouter);
api.route('/shortcuts', shortcutsRouter);
api.route('/v1/shortcuts', shortcutsRouter);
api.route('/cards', cardsRouter);
api.route('/subscriptions', subscriptionsRouter);
api.route('/ai', aiRouter);
api.route('/backup', backupRouter);
api.route('/currency', currencyRouter);
api.route('/budgets', budgetsRouter);

// 挂载所有 /api 路由
app.route('/api', api);

// 托管前端静态资源 (Cloudflare Workers Assets)
app.get('*', async (c) => {
  if (c.env.ASSETS) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const url = new URL(c.req.url);
    const contentType = res.headers.get('content-type') || '';

    // HTML 页面绝不缓存，确保每次部署用户第一时间拿到最新的 index.html
    if (contentType.includes('text/html')) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      headers.set('Pragma', 'no-cache');
      headers.set('Expires', '0');
      return new Response(res.body, {
        status: res.status,
        headers,
      });
    }

    // Vite 构建的打包产物带有内容指纹 hash (/assets/*)，开启 1 年强缓存 (immutable)
    if (url.pathname.startsWith('/assets/')) {
      const headers = new Headers(res.headers);
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      return new Response(res.body, {
        status: res.status,
        headers,
      });
    }

    return res;
  }
  return c.text('Cloudflare Bookkeeping Backend is running. Frontend static assets binding not found.', 404);
});

export default {
  fetch: app.fetch,
  async scheduled(controller: any, env: Env, ctx: any) {
    const runCronTasks = async () => {
      // 1. 自动处理到期周期性订阅账单
      try {
        await processDueSubscriptions(env.DB);
      } catch (err) {
        console.error('自动处理到期订阅账单失败:', err);
      }
      // 2. 每日自动更新全球主流外汇牌价
      try {
        await fetchLiveExchangeRates(env.DB);
      } catch (err) {
        console.error('定时同步外汇牌价失败:', err);
      }
    };

    const task = runCronTasks();
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(task);
    } else {
      await task;
    }
  },
};

