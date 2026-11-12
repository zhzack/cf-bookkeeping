# 小记 (Cloudflare 零成本轻记账平台)

基于 **Cloudflare Workers + D1 (SQLite) + React + Tailwind CSS + Hono** 打造的现代化轻量级记账系统。100% 运行在 Cloudflare 免费边缘生态上，真正做到 **零服务器成本、高安全性、毫秒级冷启动**。

---

## 🌟 核心特性

- 🔒 **纯净账号密码登录**：采用原生 WebCrypto PBKDF2 安全哈希，结合 `HttpOnly` JWT Cookie 边缘极速验签，无第三方复杂依赖。
- ⚡️ **边缘全栈一体化**：后端基于 [Hono](https://hono.dev/)，前端单页应用（SPA）由 Cloudflare Workers Assets 原生托管。
- 📊 **多维报表与统计**：
  - 净资产卡片（总储蓄资产 - 信用卡等负债）。
  - 月度收支走势与结余核算。
  - 支出分类排行榜（带百分比进度条）。
  - 当月每日支出动态走势图。
- 📦 **持物资产与日均成本全生命周期管理（参考「持物 / iThings」设计精髓）**：
  - **动态全成本核算**：支持随时为大件**追加「配件/维护保养/维修支出」**（如贴膜、换电池、升级内存），算出绝对真实的持有总成本。
  - **日均成本摊薄**：实时计算 `(购买价 + 配件维护费 - 二手转卖回血) / 服役天数`，越用越划算。
  - **冷静期心愿单（抗冲动消费）**：买大件前先放进心愿单，设定 7天/14天 冷静期倒计时；冷静期满后可一键**确认拔草**并自动在记账流水扣款。
  - **质保到期监控**：记录保修截止日，自动计算并标示「在保 (剩余X天)」或「已过保」。
  - **回本勋章与心理阶梯**：自动评定 `🚀已赚翻` (<¥1/天)、`💎超值利器` (¥1~5/天)、`👍日常好物` (¥5~20/天)、`⏳回本中`。
  - **全周期生命状态**：支持「服役中」、「闲置吃灰（防浪费预警）」、「已损坏/淘汰（锁定终身日均成本）」、「已出二手（扣除残值重算）」。
  - **回本目标进度条**：设定预期服役寿命，直观感知“是否回本/血赚”。
  - **大件日耗汇总**：顶部黑卡一览全家在役大件每天总共消耗多少钱。
- 💳 **多账户管理与动态余额**：
  - 支持微信钱包、支付宝、银行卡、信用卡、现金等账户。
  - 实时动态计算账户余额，彻底杜绝数据漂移。
- 📝 **全能记账**：支持支出、收入、内部转账，自带智能分类图标。
- 📱 **移动优先 PWA 体验**：底栏悬浮大记账按钮（FAB），支持直接添加到手机主屏幕。
- 💾 **数据备份**：支持一键全量导出 JSON 备份，财务数据 100% 归个人所有。

---

## 🚀 本地开发与体验

### 1. 安装依赖
```bash
npm install
```

### 2. 初始化本地 D1 数据库
```bash
npx wrangler d1 execute cf_bookkeeping_db --local --file=./d1/schema.sql
```

### 3. 构建前端并启动本地服务器
```bash
npm run build
npm run dev:worker
```
访问本地地址：**http://127.0.0.1:8787** 即可看到初始化页面！首次打开会自动引导你设置专属管理员账号与密码。

---

## ☁️ 一键部署到 Cloudflare (全球上线)

### 步骤 1：登录 Cloudflare CLI
```bash
npx wrangler login
```

### 步骤 2：在 Cloudflare 创建正式 D1 数据库
```bash
npx wrangler d1 create cf_bookkeeping_db
```
执行后终端会输出类似信息：
```json
{
  "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 步骤 3：绑定数据库 ID
将上面输出的 `database_id` 填入 `wrangler.jsonc` 文件的 `d1_databases[0].database_id` 字段中。

### 步骤 4：在远端生产数据库执行建表 SQL
```bash
npx wrangler d1 execute cf_bookkeeping_db --remote --file=./d1/schema.sql
```

### 步骤 5：打包并部署
```bash
npm run deploy
```
部署完成后，Wrangler 会自动为你提供一个全球可访问的免费域名（如 `https://cf-bookkeeping.xxx.workers.dev`），即可在手机浏览器或电脑上直接打开使用，也可以在 Cloudflare 仪表盘绑定你的自有域名！

