# 小记 (cf-bookkeeping) REST API 接口文档

本文档详细列出了「小记」平台的所有开放 RESTful API，方便用于自定义脚本、**iOS 快捷指令 (Shortcuts)**、**Telegram Bot**、**企业微信应用** 等外部自动化记账场景的快速接入。

---

## 鉴权机制 (Authentication)

系统支持三种鉴权方式：
1. **Cookie 自动凭证**：浏览器访问登录后，自动携带 `auth_token` HttpOnly Cookie。
2. **JWT Bearer 标头**：登录后返回的短期 JWT（30 天有效）。
3. **长期 API Token（推荐用于 iOS 快捷指令/自动化）**：在「设置」中生成以 `cbk_live_` 开头的个人长期令牌，永不过期、随时可撤销：
   ```http
   Authorization: Bearer cbk_live_xxxxxxxxxxxxxxxx
   ```

---

## 接口列表

### 1. 认证相关 (Auth)

#### 1.1 检查系统状态
- **接口**：`GET /api/auth/status`
- **无需登录**
- **返回示例**：
  ```json
  {
    "needSetup": false // true 表示初次使用需引导初始化
  }
  ```

#### 1.2 账号密码登录
- **接口**：`POST /api/auth/login`
- **无需登录**
- **请求体**：
  ```json
  {
    "username": "admin",
    "password": "your_password"
  }
  ```
- **返回示例**：
  ```json
  {
    "user": {
      "id": "usr_xxxx",
      "username": "admin",
      "nickname": "生活家"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
  }
  ```

#### 1.3 退出登录
- **接口**：`POST /api/auth/logout`
- **无需登录**

#### 1.4 获取当前用户信息
- **接口**：`GET /api/auth/me`
- **需鉴权**

#### 1.5 长期 API Token 管理（iOS 快捷指令）
- **列表**：`GET /api/auth/tokens`
- **创建**：`POST /api/auth/tokens`（可选 `{ "name": "iPhone 快捷指令" }`，返回一次完整 `cbk_live_...` 令牌）
- **撤销**：`DELETE /api/auth/tokens/:id`
- **需鉴权**

---

### 2. 记账流水接口 (Transactions)

#### 2.1 查询流水列表
- **接口**：`GET /api/transactions`
- **需鉴权**
- **Query 参数**：
  - `month` (可选，如 `2026-11`，按月份筛选)
  - `type` (可选，`expense` | `income` | `transfer`)
  - `account_id` (可选，按账户筛选)
  - `category_id` (可选，按分类筛选)
  - `limit` (默认 50)
  - `offset` (默认 0)
- **返回示例**：
  ```json
  {
    "transactions": [
      {
        "id": "tx_xxxx",
        "type": "expense",
        "amount": 3500, // 单位：分 (35.00元)
        "account_id": "acc_xxxx",
        "account_name": "微信钱包",
        "category_id": "cat_xxxx",
        "category_name": "餐饮美食",
        "transaction_time": "2026-11-12 12:30:00",
        "remark": "午餐"
      }
    ],
    "summary": {
      "total_expense": 3500,
      "total_income": 0,
      "balance": -3500,
      "total_count": 1
    }
  }
  ```

#### 2.2 新增一笔流水 (适合 iOS 快捷指令记账)
- **接口**：`POST /api/transactions`
- **需鉴权**
- **请求体**：
  ```json
  {
    "type": "expense", // 'expense' | 'income' | 'transfer'
    "amount": 3500, // 单位：分 (正整数)
    "account_id": "acc_xxxx",
    "category_id": "cat_xxxx", // 支出或收入时传入
    "destination_account_id": null, // 仅转账时传入
    "transaction_time": "2026-11-12 12:30:00",
    "remark": "肯德基午餐",
    "amortize_days": null, // 可选，>1 表示固定开销按天分摊（如 30/90/365）
    "amortize_start_date": null, // 可选，摊销起始日 YYYY-MM-DD（默认记账日期）
    "exclude_daily_cost": 0, // 可选，1 表示不计入每日生活成本
    "photos": [], // 可选，最多 3 张压缩后的图片 Data URL (data:image/jpeg;base64,...)
    "convert_to_item": false, // 可选，true 时（仅支出）同时写入持物大件并自动设置 exclude_daily_cost=1、绑定 item_id
    "item_details": { // 可选，convert_to_item=true 时补充大件信息
      "name": "MacBook Pro 14",
      "category": "数码科技",
      "expected_days": 1460,
      "warranty_date": "2029-11-12",
      "location": "书房工位",
      "remark": "深空黑 512G"
    }
  }
  ```

#### 2.3 修改流水
- **接口**：`PUT /api/transactions/:id`
- **需鉴权**
- 支持可选 `keep_photo_ids`（保留的旧照片 ID 数组）与 `new_photos`（新增图片 Data URL 数组）

#### 2.4 删除流水
- **接口**：`DELETE /api/transactions/:id`
- **需鉴权**

#### 2.5 查询流水照片 / 获取照片原图
- **接口**：`GET /api/transactions/:id/photos`（返回 JSON 照片列表）
- **接口**：`GET /api/transactions/photos/:photoId`（返回图片二进制流）
- **需鉴权**

#### 2.6 将已有支出流水设为持物大件
- **接口**：`POST /api/transactions/:id/convert-to-item`
- **需鉴权**
- **请求体**：
  ```json
  {
    "name": "索尼降噪耳机", // 必填
    "category": "数码科技", // 必填
    "expected_days": 1095, // 可选
    "warranty_date": "2028-11-12", // 可选
    "location": "随身通勤包", // 可选
    "remark": "双十一满减购入", // 可选
    "copy_photo_ids": ["pho_xxxx"], // 可选，从原账单照片复制到该大件
    "new_photos": [] // 可选，补充上传的 Data URL 图片（合计最多 3 张）
  }
  ```
- **说明**：自动创建 `items` 记录、绑定 `transactions.item_id`，并将 `exclude_daily_cost` 设为 `1`，避免与持物大件日均成本重复统计。

#### 2.7 iOS 快捷指令极速记账
- **接口**：`POST /api/transactions/quick`
- **需鉴权**（强烈建议配合长期 `cbk_live_` Token）
- **请求体（所有字段均为友好名称或可自动解析，金额默认单位为元）**：
  ```json
  {
    "amount": 18.5, // 单位：元（也支持传入 text 自动提取，或 unit: "cents"）
    "type": "expense", // 可选：'expense' | 'income' | 'transfer'，默认 'expense' 或由 text 自动判断
    "account": "微信", // 可选：账户名称/关键词/ID，自动匹配用户账户
    "category": "餐饮美食", // 可选：分类名称/关键词/ID，不传则按 remark/text 关键词智能匹配
    "remark": "瑞幸咖啡",
    "text": "微信支付 向 瑞幸咖啡 付款 ¥18.50", // 可选：直接传支付截屏 OCR 提取文本
    "amortize_days": 30, // 可选：定期账单分摊天数
    "external_id": "shortcut_20261112_001" // 可选：幂等去重键
  }
  ```

#### 2.8 批量账单导入与去重检查（微信/支付宝）
- **去重查询**：`POST /api/transactions/import/check-duplicates`（传入 `{ "external_ids": ["wx:xxx", "ali:yyy"] }`，返回 `{ "existing_ids": [...] }`）
- **批量导入**：`POST /api/transactions/import`（传入 `{ "rows": [...] }`，单批最多 500 条，自动跳过重复 `external_id`，支持携带 `scene`）
- **需鉴权**

#### 2.9 搜索过滤、消费场景与批量改分类
- **搜索与多条件过滤**：`GET /api/transactions` 支持 `month`（支持 `all`）、`start_date` / `end_date`、`search`（匹配备注/分类/账户/大件/场景/金额）、`type`、`category_id`（支持 `__uncategorized__`）、`account_id`、`scene`（支持 `__none__`）、`sort`（`time_desc` / `amount_desc`）。
- **常用场景列表**：`GET /api/transactions/scenes`
- **单笔标场景**：`PATCH /api/transactions/:id/scene`（传入 `{ "scene": "日常三餐" }` 或 `null` 清空）
- **批量标场景**：`PATCH /api/transactions/batch-scene`（支持 `scope`: `'ids' | 'category' | 'account' | 'account_category' | 'remark' | 'filter'`，支持 `preview: true` 预览影响笔数）
- **批量改分类**：`PATCH /api/transactions/batch-category`（支持 `scope`: `'ids' | 'category' | 'account' | 'account_category' | 'remark' | 'filter'`、`target_category_id`、`only_uncategorized` 及 `preview: true`，自动按目标分类收支类型隔离防护）
- **需鉴权**

---

### 3. 账户管理接口 (Accounts)

#### 3.1 获取所有账户列表 (包含实时动态余额)
- **接口**：`GET /api/accounts`
- **需鉴权**
- **返回示例**：
  ```json
  {
    "accounts": [
      {
        "id": "acc_xxxx",
        "name": "微信钱包",
        "type": "wechat",
        "initial_balance": 0,
        "current_balance": 52800, // 实时计算余额：528.00元
        "color": "#07C160"
      }
    ]
  }
  ```

#### 3.2 创建账户
- **接口**：`POST /api/accounts`
- **需鉴权**

---

### 4. 分类接口 (Categories)

#### 4.1 获取分类列表
- **接口**：`GET /api/categories`
- **需鉴权**
- **Query 参数**：`type` (`expense` 或 `income`)

#### 4.2 新增 / 编辑 / 删除分类
- **新增**：`POST /api/categories`（`{ "name", "type": "expense" | "income", "icon", "color" }`）
- **编辑**：`PUT /api/categories/:id`（`{ "name", "icon", "color" }`，支持局部更新）
- **删除**：`DELETE /api/categories/:id`（删除前自动将关联流水 `category_id` 安全置空为未分类）
- **需鉴权**

---

### 5. 持物资产与日均成本接口 (Items)

#### 5.1 获取大件与心愿单列表
- **接口**：`GET /api/items`
- **需鉴权**
- **Query 参数**：`status` (`using` | `wishlist` | `idle` | `retired` | `sold`)
- **返回示例**：
  ```json
  {
    "items": [
      {
        "id": "itm_xxxx",
        "name": "MacBook Pro 14",
        "category": "数码科技",
        "price": 1299900,
        "purchase_date": "2024-01-01",
        "status": "using",
        "days_used": 1046,
        "additional_cost": 29900, // 配件维护费总和
        "net_cost": 1329800,
        "cost_per_day": 1271.32, // 12.71 元/天
        "value_level": "normal", // 'ultra' | 'high' | 'normal' | 'low'
        "warranty_status": "valid", // 'valid' | 'expired' | 'none'
        "warranty_days_left": 120,
        "expenses": []
      }
    ],
    "summary": {
      "total_spent": 1329800,
      "active_daily_cost": 1271, // 全家在役大件日耗总和
      "using_count": 1,
      "wishlist_count": 0,
      "retired_count": 0,
      "sold_count": 0,
      "total_count": 1
    }
  }
  ```

#### 5.2 录入大件物品或心愿单
- **接口**：`POST /api/items`
- **需鉴权**
- **请求体**：
  ```json
  {
    "name": "人体工学椅",
    "category": "居家家具",
    "price": 240000, // 2400元
    "purchase_date": "2026-11-12",
    "status": "using", // 或 'wishlist' 加入心愿单
    "expected_days": 1095, // 预期使用 3 年
    "warranty_date": "2029-11-12", // 质保期
    "location": "书房",
    "cooling_days": 7, // 若为心愿单，设定冷静期天数
    "photos": [] // 可选，最多 3 张压缩后的图片 Data URL
  }
  ```

#### 5.2.1 修改大件与大件照片接口
- **修改大件**：`PUT /api/items/:id`（支持可选 `keep_photo_ids` 与 `new_photos` 同步更新照片）
- **查询大件照片**：`GET /api/items/:id/photos`（返回 JSON 照片列表）
- **获取大件照片原图**：`GET /api/items/photos/:photoId`（返回图片二进制流）
- **需鉴权**

#### 5.3 为大件追加配件/维护支出
- **接口**：`POST /api/items/:id/expenses`
- **需鉴权**
- **请求体**：
  ```json
  {
    "amount": 29900,
    "description": "购买绿联拓展坞",
    "date": "2026-11-12",
    "sync_ledger": true, // 是否同步生成一笔记账流水
    "account_id": "acc_xxxx" // 若同步，指定扣款账户
  }
  ```

#### 5.4 心愿单拔草转为已购
- **接口**：`POST /api/items/:id/convert-wishlist`
- **需鉴权**
- **请求体**：
  ```json
  {
    "price": 2200, // 实际购买价格 (元)
    "purchase_date": "2026-11-12",
    "account_id": "acc_xxxx" // 付款账户
  }
  ```

---

### 6. 统计报表接口 (Stats)

#### 6.1 获取多周期财务概览与报表（周 / 月 / 年）
- **接口**：`GET /api/stats/overview`
- **需鉴权**
- **Query 参数**：
  - `period` (可选，`'week' | 'month' | 'year'`，默认 `'month'`)
  - `date` / `month` (可选，周传 `YYYY-MM-DD`，月传 `YYYY-MM`，年传 `YYYY`)
  - `today` (可选，本地当前日期 `YYYY-MM-DD`，用于计算当月已过天数)
- **返回补充**：除 `category_breakdown` 与 `daily_cost` 外，额外返回 `trend`（按周/月为逐日、按年为逐月）与 `scene_breakdown`（按消费场景聚合统计）。

---

### 7. 自动分类与场景规则接口 (Rules)

- **获取规则列表**：`GET /api/rules`（按 `priority DESC` 排序返回）
- **新增规则**：`POST /api/rules`（`{ "name", "tx_type": "all" | "expense" | "income", "keywords", "match_mode": "contains" | "exact", "account_id", "category_id", "scene", "priority", "enabled" }`）
- **编辑规则**：`PUT /api/rules/:id`
- **删除规则**：`DELETE /api/rules/:id`
- **应用单条规则到历史流水**：`POST /api/rules/:id/apply`（支持 `{ "preview": true, "overwrite": false, "month" }`)
- **一键应用全部启用规则**：`POST /api/rules/apply-all`（支持 `{ "preview": true, "overwrite": false, "month" }`)
- **需鉴权**
- **返回示例**：
  ```json
  {
    "month": "2026-11",
    "assets": {
      "total_assets": 1500000,
      "total_liabilities": 20000,
      "net_worth": 1480000
    },
    "month_summary": {
      "expense": 35000,
      "income": 120000,
      "surplus": 85000
    },
    "category_breakdown": [
      {
        "name": "餐饮美食",
        "total_amount": 18000,
        "count": 12,
        "percentage": 51.4
      }
    ],
    "daily_trend": [
      {
        "day": "2026-11-12",
        "expense": 3500,
        "income": 0
      }
    ],
    "daily_cost": {
      "total_daily_cost": 18500,
      "amortized_daily_cost": 10000,
      "variable_daily_cost": 5500,
      "item_daily_cost": 3000,
      "elapsed_days": 12,
      "days_in_month": 30,
      "month_start": "2026-11-01",
      "month_end": "2026-11-12",
      "variable_expense_total": 66000,
      "amortized_month_total": 120000,
      "excluded_expense_total": 0,
      "active_item_count": 3,
      "prev_total_daily_cost": 19200,
      "mom_diff": -700,
      "mom_percent": -3.6,
      "amortized_items": []
    }
  }
  ```
