import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Plus,
  Search,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  CreditCard,
  ChevronRight,
  TrendingDown,
  Layers,
  Zap,
  HandMetal,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { SubscriptionWithStats, SubscriptionsSummary, Account, Category } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { SubscriptionBillModal } from '../components/SubscriptionBillModal';

interface Props {
  accounts: Account[];
  categories: Category[];
  onOpenAddSub: (defaultType?: 'expense' | 'income') => void;
  onOpenDetail: (subId: string) => void;
  onEditSub: (sub: SubscriptionWithStats) => void;
  refreshTrigger: number;
  onRefreshParent: () => void;
}

export const SubscriptionsView: React.FC<Props> = ({
  accounts,
  categories,
  onOpenAddSub,
  onOpenDetail,
  onEditSub,
  refreshTrigger,
  onRefreshParent,
}) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionWithStats[]>([]);
  const [summary, setSummary] = useState<SubscriptionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'income' | 'monthly' | 'yearly' | 'other' | 'paused'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [billingSub, setBillingSub] = useState<SubscriptionWithStats | null>(null);

  const loadSubscriptions = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ subscriptions: SubscriptionWithStats[]; summary: SubscriptionsSummary }>(
        '/api/subscriptions'
      );
      setSubscriptions(res.subscriptions || []);
      setSummary(res.summary || null);
    } catch (err) {
      console.error('Failed to load subscriptions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubscriptions();
  }, [refreshTrigger]);

  const handleBillNow = (e: React.MouseEvent, sub: SubscriptionWithStats) => {
    e.stopPropagation();
    setBillingSub(sub);
  };

  const handleTogglePause = async (e: React.MouseEvent, sub: SubscriptionWithStats) => {
    e.stopPropagation();
    setActionLoadingId(sub.id);
    try {
      await fetchApi(`/api/subscriptions/${sub.id}/toggle-pause`, {
        method: 'POST',
      });
      await loadSubscriptions();
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || '操作失败');
    } finally {
      setActionLoadingId(null);
    }
  };

  const getAccountName = (accId?: string | null) => {
    if (!accId) return '未指定账户';
    const acc = accounts.find((a) => a.id === accId);
    return acc ? acc.name : '未知账户';
  };

  const getCategoryName = (catId?: string | null) => {
    if (!catId) return '未分类';
    const cat = categories.find((c) => c.id === catId);
    return cat ? cat.name : '未知分类';
  };

  const getPeriodLabel = (sub: SubscriptionWithStats) => {
    const interval = sub.period_interval || 1;
    if (interval === 1) {
      switch (sub.period_type) {
        case 'monthly':
          return '按月';
        case 'yearly':
          return '按年';
        case 'weekly':
          return '按周';
        case 'quarterly':
          return '按季';
      }
    }
    switch (sub.period_type) {
      case 'monthly':
        return `每 ${interval} 个月`;
      case 'yearly':
        return `每 ${interval} 年`;
      case 'weekly':
        return `每 ${interval} 周`;
      case 'quarterly':
        return `每 ${interval} 个季度`;
    }
  };

  // 过滤订阅与周期收入
  const filteredSubs = subscriptions.filter((sub) => {
    if (filterType === 'income') {
      if (sub.status === 'paused' || sub.type !== 'income') return false;
    } else if (filterType === 'monthly') {
      if (sub.status === 'paused' || sub.period_type !== 'monthly') return false;
    } else if (filterType === 'yearly') {
      if (sub.status === 'paused' || sub.period_type !== 'yearly') return false;
    } else if (filterType === 'other') {
      if (sub.status === 'paused' || (sub.period_type === 'monthly' || sub.period_type === 'yearly')) return false;
    } else if (filterType === 'paused') {
      if (sub.status !== 'paused') return false;
    } else {
      // all 默认只看 active
      if (sub.status !== 'active') return false;
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      const matchName = sub.name.toLowerCase().includes(kw);
      const matchRemark = sub.remark?.toLowerCase().includes(kw);
      const matchAccount = (sub.account_name || getAccountName(sub.account_id)).toLowerCase().includes(kw);
      return matchName || matchRemark || matchAccount;
    }

    return true;
  });

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 顶部总览卡片 */}
      <div className="bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-[-20px] top-[-20px] opacity-10 pointer-events-none">
          <Calendar className="w-56 h-56 text-white" />
        </div>

        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-xs text-indigo-200 font-semibold tracking-wide uppercase">
                周期记账 · 固定发薪与订阅大盘
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenAddSub('income')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md shadow-emerald-600/30 backdrop-blur-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>设置发薪/收入</span>
              </button>
              <button
                onClick={() => onOpenAddSub('expense')}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-md shadow-indigo-600/30 backdrop-blur-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建订阅</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div>
              <div className="text-xs text-emerald-300/80 font-medium">月均固定收入（薪资等）</div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-emerald-300 mt-0.5">
                {summary ? formatCurrency(summary.monthly_total_income || 0) : '¥0.00'}
              </div>
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">月均固定支出</div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
                {summary ? formatCurrency(summary.monthly_total_cost) : '¥0.00'}
              </div>
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">年化固定支出 / 收入</div>
              <div className="text-sm sm:text-base font-bold tracking-tight text-indigo-100 mt-1.5">
                支 {summary ? formatCurrency(summary.yearly_total_cost) : '¥0.00'}
              </div>
              {(summary?.yearly_total_income || 0) > 0 && (
                <div className="text-xs font-semibold text-emerald-300 mt-0.5">
                  收 {formatCurrency(summary?.yearly_total_income || 0)}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">7 天内到期</div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-amber-400 mt-1 flex items-center gap-1.5">
                <span>{summary?.upcoming_7_days_count || 0} 笔</span>
                {summary && summary.pending_confirmation_count > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-300 font-semibold border border-rose-400/30">
                    {summary.pending_confirmation_count} 笔待入账
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 待确认提醒条 */}
      {summary && summary.pending_confirmation_count > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-amber-900">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">有 {summary.pending_confirmation_count} 笔手动确认订阅已到期：</span>
              <span className="text-amber-800 ml-1">请核对银行扣款通知后点击“立即入账”</span>
            </div>
          </div>
        </div>
      )}

      {/* 过滤条与搜索 */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-2xl overflow-x-auto text-xs font-semibold text-slate-500 shrink-0">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'all' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            全部在役 ({subscriptions.filter((s) => s.status === 'active').length})
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'income' ? 'bg-white text-emerald-600 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            固定收入 ({subscriptions.filter((s) => s.status === 'active' && s.type === 'income').length})
          </button>
          <button
            onClick={() => setFilterType('monthly')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'monthly' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            按月
          </button>
          <button
            onClick={() => setFilterType('yearly')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'yearly' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            按年
          </button>
          <button
            onClick={() => setFilterType('other')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'other' ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            其它周期
          </button>
          <button
            onClick={() => setFilterType('paused')}
            className={`px-3 py-1.5 rounded-xl transition shrink-0 ${
              filterType === 'paused' ? 'bg-white text-slate-800 shadow-sm font-bold' : 'hover:text-slate-900'
            }`}
          >
            已暂停 ({subscriptions.filter((s) => s.status === 'paused').length})
          </button>
        </div>

        <div className="relative flex-1 sm:max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索订阅、服务、扣款账户..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-100 hover:bg-slate-200/70 focus:bg-white border border-transparent focus:border-indigo-400 rounded-xl text-xs transition outline-none"
          />
        </div>
      </div>

      {/* 订阅列表卡片 */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-xs">加载中...</div>
      ) : filteredSubs.length === 0 ? (
        <div className="py-16 text-center bg-white rounded-3xl border border-slate-100 p-8 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">暂无周期项目</div>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {searchKeyword || filterType !== 'all'
              ? '换个筛选条件或关键词试试'
              : '可添加每月固定发薪收入（支持一键补录历史月份），以及 iCloud、房租等周期性支出，到期自动入账！'}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => onOpenAddSub('income')}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-md shadow-emerald-200"
            >
              <Plus className="w-4 h-4" />
              <span>设置固定发薪 / 收入</span>
            </button>
            <button
              onClick={() => onOpenAddSub('expense')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-md shadow-indigo-200"
            >
              <Plus className="w-4 h-4" />
              <span>新建周期支出</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {filteredSubs.map((sub) => {
            const isIncome = sub.type === 'income';
            const verb = isIncome ? '入账' : '扣款';
            const isPaused = sub.status === 'paused';
            const isDueOrPending =
              sub.status === 'active' &&
              (sub.billing_status === 'overdue' || sub.billing_status === 'today' || sub.is_pending_confirmation);

            // 徽标样式
            let badgeStyle = 'bg-slate-100 text-slate-600';
            let badgeText = `${sub.days_until_billing} 天后${verb}`;

            if (isPaused) {
              badgeStyle = 'bg-slate-100 text-slate-500';
              badgeText = '已暂停';
            } else if (sub.billing_status === 'today') {
              badgeStyle = isIncome
                ? 'bg-emerald-100 text-emerald-700 font-bold animate-pulse'
                : 'bg-rose-100 text-rose-700 font-bold animate-pulse';
              badgeText = `今日${verb}`;
            } else if (sub.billing_status === 'overdue' || sub.is_pending_confirmation) {
              badgeStyle = 'bg-amber-100 text-amber-800 font-bold';
              badgeText = sub.auto_record ? `${verb}处理中` : '已到期待入账';
            } else if (sub.days_until_billing <= 3) {
              badgeStyle = 'bg-amber-100 text-amber-700 font-bold';
              badgeText = `${sub.days_until_billing} 天后${verb}`;
            } else if (sub.days_until_billing <= 7) {
              badgeStyle = 'bg-indigo-50 text-indigo-700 font-semibold';
              badgeText = `${sub.days_until_billing} 天后${verb}`;
            }

            return (
              <div
                key={sub.id}
                onClick={() => onOpenDetail(sub.id)}
                className={`group bg-white rounded-2xl p-4 border transition-all duration-200 hover:shadow-lg cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                  isDueOrPending ? 'border-amber-300/80 shadow-amber-50' : 'border-slate-100 shadow-sm'
                }`}
              >
                {/* 顶部彩色装饰条 */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 transition-opacity opacity-70 group-hover:opacity-100"
                  style={{ backgroundColor: sub.color || '#3b82f6' }}
                />

                <div>
                  {/* 首行：图标 + 名称 + 状态徽标 */}
                  <div className="flex items-start justify-between gap-3 mb-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: `${sub.color || '#3b82f6'}18`,
                          color: sub.color || '#3b82f6',
                        }}
                      >
                        <DynamicIcon name={sub.icon || 'Calendar'} className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-bold text-slate-800 text-sm truncate group-hover:text-indigo-600 transition">
                            {sub.name}
                          </h3>
                          {isIncome && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200/70 shrink-0">
                              收入
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                          <span className="font-medium text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                            {getPeriodLabel(sub)}
                          </span>
                          <span>•</span>
                          <span>{sub.category_name || getCategoryName(sub.category_id)}</span>
                          <span>•</span>
                          <span className="truncate">{sub.account_name || getAccountName(sub.account_id)}</span>
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${badgeStyle}`}>
                      {badgeText}
                    </span>
                  </div>

                  {/* 周期金额与月均折合 */}
                  <div className="mt-3 pt-3 border-t border-slate-50 flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-slate-400 font-medium">
                        {sub.auto_record === 0
                          ? isIncome
                            ? '参考入账（浮动）'
                            : '参考扣款（浮动）'
                          : isIncome
                          ? '每期入账'
                          : '每期扣款'}
                      </div>
                      <div
                        className={`text-lg font-black mt-0.5 ${
                          isIncome ? 'text-emerald-600' : 'text-slate-900'
                        }`}
                      >
                        {isIncome ? '+' : ''}
                        {formatCurrency(sub.amount)}
                        <span className="text-xs font-normal text-slate-400 ml-1">
                          / {getPeriodLabel(sub)}
                        </span>
                      </div>
                    </div>

                    {sub.period_type !== 'monthly' && (
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400 font-medium">
                          {isIncome ? '折合月收' : '折合月费'}
                        </div>
                        <div
                          className={`text-xs font-bold mt-0.5 ${
                            isIncome ? 'text-emerald-600' : 'text-indigo-600'
                          }`}
                        >
                          {isIncome ? '+' : ''}
                          {formatCurrency(sub.monthly_equivalent_amount)} / 月
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 底部信息与动作栏 */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <div className="flex items-center gap-1.5 text-[11px]">
                    {sub.auto_record ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold bg-emerald-50 px-1.5 py-0.5 rounded">
                        <Zap className="w-3 h-3" />
                        <span>{isIncome ? '自动入账' : '自动扣款'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 px-1.5 py-0.5 rounded">
                        <HandMetal className="w-3 h-3" />
                        <span>浮动实填</span>
                      </span>
                    )}
                    <span className="text-slate-300">|</span>
                    <span>下次: {sub.next_billing_date}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* 快捷入账按钮：到期必显，浮动金额（auto_record=0）随时可点填实发 */}
                    {(isDueOrPending || sub.auto_record === 0) && !isPaused && (
                      <button
                        type="button"
                        onClick={(e) => handleBillNow(e, sub)}
                        disabled={actionLoadingId === sub.id}
                        className={`px-2.5 py-1 active:scale-95 font-bold rounded-lg text-[11px] shadow-sm transition flex items-center gap-1 ${
                          isDueOrPending
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : isIncome
                            ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80'
                            : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>
                          {sub.auto_record === 0
                            ? isIncome
                              ? '填实发入账'
                              : '填实付记账'
                            : '立即入账'}
                        </span>
                      </button>
                    )}

                    {/* 暂停/恢复按钮 */}
                    <button
                      type="button"
                      onClick={(e) => handleTogglePause(e, sub)}
                      disabled={actionLoadingId === sub.id}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                      title={isPaused ? '恢复自动记账' : '暂停该订阅'}
                    >
                      {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                    </button>

                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SubscriptionBillModal
        isOpen={Boolean(billingSub)}
        subscription={billingSub}
        onClose={() => setBillingSub(null)}
        onSuccess={() => {
          loadSubscriptions();
          onRefreshParent();
        }}
      />
    </div>
  );
};
