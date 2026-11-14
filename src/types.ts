export interface User {
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
  source?: string | null;
  external_id?: string | null;
  created_at: string;
  // Joined properties
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

export interface ApiTokenInfo {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export interface AttachmentPhoto {
  id: string;
  transaction_id?: string;
  item_id?: string;
  mime_type: string;
  data_url: string;
  size_bytes?: number;
  created_at?: string;
}

export type TransactionPhoto = AttachmentPhoto;

export interface OverviewData {
  period?: 'week' | 'month' | 'year';
  anchor?: string;
  period_label?: string;
  period_start?: string;
  period_end?: string;
  month: string;
  assets: {
    total_assets: number;
    total_liabilities: number;
    net_worth: number;
  };
  month_summary: {
    expense: number;
    income: number;
    surplus: number;
  };
  category_breakdown: Array<{
    id: string;
    name: string;
    icon: string;
    color: string;
    total_amount: number;
    count: number;
    percentage: number;
  }>;
  scene_breakdown?: Array<{
    scene: string;
    total_amount: number;
    count: number;
    percentage: number;
  }>;
  trend_unit?: 'day' | 'month';
  trend?: Array<{
    key: string;
    label: string;
    expense: number;
    income: number;
  }>;
  daily_trend: Array<{
    day: string;
    expense: number;
    income: number;
  }>;
  daily_cost: {
    total_daily_cost: number;
    amortized_daily_cost: number;
    variable_daily_cost: number;
    item_daily_cost: number;
    elapsed_days: number;
    days_in_month: number;
    month_start: string;
    month_end: string;
    variable_expense_total: number;
    amortized_month_total: number;
    excluded_expense_total: number;
    active_item_count: number;
    prev_total_daily_cost: number;
    mom_diff: number;
    mom_percent: number | null;
    amortized_items: Array<{
      id: string;
      remark: string | null;
      category_name?: string | null;
      category_icon?: string | null;
      category_color?: string | null;
      total_amount: number;
      amortize_days: number;
      start_date: string;
      end_date: string;
      daily_amount: number;
      overlap_days: number;
      month_amount: number;
      remaining_days: number;
    }>;
  };
}

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
  retired_date?: string | null;
  expected_days?: number | null;
  warranty_date?: string | null;
  location?: string | null;
  cooling_days?: number | null;
  remark?: string | null;
  created_at: string;
}

export interface ItemWithStats extends Item {
  days_used: number;
  additional_cost: number;
  net_cost: number;
  cost_per_day: number;
  progress_percent?: number | null;
  warranty_status: 'valid' | 'expired' | 'none';
  warranty_days_left?: number;
  value_level: 'ultra' | 'high' | 'normal' | 'low';
  cooling_left_days?: number;
  cooling_percent?: number;
  expenses?: ItemExpense[];
  photo_count?: number;
  first_photo_id?: string | null;
}

export interface ItemSummary {
  total_spent: number;
  active_daily_cost: number;
  using_count: number;
  wishlist_count: number;
  retired_count: number;
  sold_count: number;
  total_count: number;
}

export interface AutoRule {
  id: string;
  user_id: string;
  name: string;
  tx_type: 'all' | 'expense' | 'income';
  keywords: string;
  match_mode: 'contains' | 'exact';
  account_id?: string | null;
  category_id?: string | null;
  scene?: string | null;
  priority: number;
  enabled: number;
  created_at: string;
  account_name?: string | null;
  category_name?: string | null;
  category_icon?: string | null;
  category_color?: string | null;
  category_type?: 'expense' | 'income' | null;
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
  account_name?: string | null;
}

export interface CardsSummary {
  total_cards: number;
  active_cards: number;
  total_remaining_worth: number;
  total_spent_amount: number;
  expiring_count: number;
  times_cards_count: number;
  balance_cards_count: number;
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






