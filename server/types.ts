export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ASSETS?: Fetcher;
}

export interface User {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  nickname: string;
  created_at: string;
}

export interface UserSession {
  id: string;
  username: string;
  nickname: string;
}

export interface Account {
  id: string;
  user_id: string;
  name: string;
  type: 'cash' | 'bank' | 'alipay' | 'wechat' | 'credit' | 'other';
  currency: string;
  initial_balance: number;
  current_balance: number;
  icon?: string;
  color?: string;
  sort_order: number;
  created_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  type: 'expense' | 'income';
  icon?: string;
  color?: string;
  sort_order: number;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number; // 分
  account_id: string;
  destination_account_id?: string | null;
  category_id?: string | null;
  transaction_time: string;
  remark?: string | null;
  scene?: string | null;
  amortize_days?: number | null;
  amortize_start_date?: string | null;
  exclude_daily_cost?: number;
  item_id?: string | null;
  card_id?: string | null;
  subscription_id?: string | null;
  source?: string | null;
  external_id?: string | null;
  created_at: string;
  // Joined fields
  account_name?: string;
  destination_account_name?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  item_name?: string | null;
  card_name?: string | null;
  subscription_name?: string | null;
  photo_count?: number;
  first_photo_id?: string | null;
}

export interface PhotoRecord {
  id: string;
  transaction_id?: string;
  item_id?: string;
  user_id: string;
  mime_type: string;
  data_url: string;
  size_bytes: number;
  created_at: string;
}

export type TransactionPhoto = PhotoRecord;

export interface ItemExpense {
  id: string;
  item_id: string;
  user_id: string;
  amount: number; // 分
  description: string;
  date: string;
  created_at: string;
}

export interface Item {
  id: string;
  user_id: string;
  name: string;
  category: string;
  price: number; // 分
  resale_price: number; // 分
  purchase_date: string; // YYYY-MM-DD
  status: 'using' | 'wishlist' | 'retired' | 'sold' | 'idle';
  retired_date?: string | null; // YYYY-MM-DD
  expected_days?: number | null;
  warranty_date?: string | null; // YYYY-MM-DD
  location?: string | null;
  cooling_days?: number | null;
  remark?: string | null;
  created_at: string;
}

export interface ItemWithStats extends Item {
  days_used: number;
  additional_cost: number; // 配件/维护总支出 (分)
  net_cost: number; // price + additional_cost - resale_price
  cost_per_day: number; // 分 / 天
  progress_percent?: number | null; // 预期回本进度
  warranty_status: 'valid' | 'expired' | 'none';
  warranty_days_left?: number;
  value_level: 'ultra' | 'high' | 'normal' | 'low'; // 🚀已赚翻, 💎超值利器, 👍日常好物, ⏳回本中
  cooling_left_days?: number; // 心愿单冷静期剩余天数
  cooling_percent?: number; // 心愿单冷静进度
  expenses?: ItemExpense[];
  photo_count?: number;
  first_photo_id?: string | null;
}

export interface PrepaidCard {
  id: string;
  user_id: string;
  name: string;
  type: 'balance' | 'times';
  merchant?: string | null;
  icon?: string | null;
  color?: string | null;
  initial_amount: number;       // 分，首次充值实付
  initial_value: number;        // 首次面值 (余额卡为分，计次卡为次数)
  gift_amount: number;          // 分，赠送金额 (仅储值卡)
  current_value: number;        // 当前剩余价值 (余额卡为分，计次卡为次数)
  total_spent_amount: number;   // 累计实付充值总额 (分)
  total_value: number;          // 累计获得总价值 (余额卡为分，计次卡为累计次数)
  status: 'active' | 'exhausted' | 'expired' | 'refunded';
  valid_until?: string | null;  // YYYY-MM-DD
  linked_transaction_id?: string | null;
  remark?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrepaidCardWithStats extends PrepaidCard {
  per_unit_cost: number;        // 计次卡单次折算成本(分/次)；余额卡为每1元实付成本比例(分/元)
  remaining_worth: number;      // 剩余价值折算的人民币残值(分)
  consumed_value: number;       // 已消费价值 (已扣分 或 已用次数)
  usage_percent: number;        // 已使用进度 0~100
  expiration_status: 'none' | 'valid' | 'expiring' | 'expired';
  days_left?: number;           // 距有效期剩余天数
  logs?: PrepaidCardLog[];
}

export interface PrepaidCardLog {
  id: string;
  card_id: string;
  user_id: string;
  type: 'recharge' | 'consume' | 'adjust' | 'refund';
  delta_value: number;          // 变动价值 (+充值 / -消费)
  actual_amount: number;        // 发生的人民币金额(分)
  transaction_id?: string | null;
  account_id?: string | null;
  log_time: string;
  remark?: string | null;
  created_at: string;
  // Optional joined fields
  account_name?: string | null;
}

export interface Subscription {
  id: string;
  user_id: string;
  name: string;
  category_id?: string | null;
  account_id?: string | null;
  amount: number;               // 分，每期扣费金额
  currency: string;
  period_type: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
  period_interval: number;
  billing_day: number;
  first_billing_date: string;
  next_billing_date: string;
  auto_record: number;          // 1: 自动入账, 0: 手动确认
  status: 'active' | 'paused' | 'cancelled';
  icon?: string | null;
  color?: string | null;
  remark?: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
}

export interface SubscriptionWithStats extends Subscription {
  monthly_equivalent_amount: number; // 分/月，折合月度固定支出
  yearly_equivalent_amount: number;  // 分/年，折合年度固定支出
  days_until_billing: number;        // 距下次预计扣款天数 (0 为今天, <0 为逾期未确认)
  billing_status: 'today' | 'upcoming' | 'overdue' | 'future';
  is_pending_confirmation: boolean;
}

export interface SubscriptionsSummary {
  total_active_count: number;
  monthly_total_cost: number;       // 全部在役订阅折合每月总支出 (分)
  yearly_total_cost: number;        // 全部在役订阅折合每年总支出 (分)
  upcoming_7_days_count: number;
  pending_confirmation_count: number;
}



