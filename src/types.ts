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
  created_at: string;
  // Joined properties
  account_name?: string;
  destination_account_name?: string;
  category_name?: string;
  category_icon?: string;
  category_color?: string;
}

export interface OverviewData {
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
  daily_trend: Array<{
    day: string;
    expense: number;
    income: number;
  }>;
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



