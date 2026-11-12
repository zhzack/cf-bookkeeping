# 小记 (cf-bookkeeping) REST API 接口文档

本文档详细列出了「小记」平台的所有开放 RESTful API，方便用于自定义脚本、**iOS 快捷指令 (Shortcuts)**、**Telegram Bot**、**企业微信应用** 等外部自动化记账场景的快速接入。

---

## 鉴权机制 (Authentication)

系统支持两种鉴权方式：
1. **Cookie 自动凭证**：浏览器访问登录后，自动携带 `auth_token` HttpOnly Cookie。
2. **Bearer Token 标头**：适用于快捷指令、Bot 或第三方客户端：
   ```http
   Authorization: Bearer <your_jwt_token>
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
    "remark": "肯德基午餐"
  }
  ```

#### 2.3 修改流水
- **接口**：`PUT /api/transactions/:id`
- **需鉴权**

#### 2.4 删除流水
- **接口**：`DELETE /api/transactions/:id`
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
    "cooling_days": 7 // 若为心愿单，设定冷静期天数
  }
  ```

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

#### 6.1 获取当月财务概览与报表
- **接口**：`GET /api/stats/overview`
- **需鉴权**
- **Query 参数**：`month` (可选，默认当月，如 `2026-11`)
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
    ]
  }
  ```
