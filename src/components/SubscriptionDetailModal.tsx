import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Pause, Play, Edit3, Trash2, Calendar, Clock, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { fetchApi, formatCurrency, formatDateTime } from '../api';
import { SubscriptionWithStats, Transaction } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subscriptionId: string | null;
  onEdit: (sub: SubscriptionWithStats) => void;
  onDelete: (subId: string) => void;
  onRefreshParent: () => void;
}

export const SubscriptionDetailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  subscriptionId,
  onEdit,
  onDelete,
  onRefreshParent,
}) => {
  const [sub, setSub] = useState<SubscriptionWithStats | null>(null);
  const [history, setHistory] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDetail = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ subscription: SubscriptionWithStats; history: Transaction[] }>(
        `/api/subscriptions/${id}`
      );
      setSub(res.subscription);
      setHistory(res.history || []);
    } catch (err: any) {
      setError(err.message || '获取订阅详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && subscriptionId) {
      loadDetail(subscriptionId);
    } else {
      setSub(null);
      setHistory([]);
    }
  }, [isOpen, subscriptionId]);

  if (!isOpen) return null;

  const handleBillNow = async () => {
    if (!sub) return;
    setBillingLoading(true);
    try {
      await fetchApi(`/api/subscriptions/${sub.id}/bill-now`, { method: 'POST' });
      await loadDetail(sub.id);
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || '扣款入账失败');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleTogglePause = async () => {
    if (!sub) return;
    setPauseLoading(true);
    try {
      await fetchApi(`/api/subscriptions/${sub.id}/toggle-pause`, { method: 'POST' });
      await loadDetail(sub.id);
      onRefreshParent();
    } catch (err: any) {
      alert(err.message || '切换状态失败');
    } finally {
      setPauseLoading(false);
    }
  };

  const getPeriodLabel = (type: string) => {
    switch (type) {
      case 'monthly':
        return '按月';
      case 'yearly':
        return '按年';
      case 'quarterly':
        return '按季';
      case 'weekly':
        return '按周';
      default:
        return '周期';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">订阅项目与扣费历史</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading || !sub ? (
            <div className="py-16 text-center text-slate-400 text-xs">加载中...</div>
          ) : (
            <>
              {/* Header card preview */}
              <div
                className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between"
                style={{
                  background: `linear-gradient(135deg, ${sub.color || '#3b82f6'} 0%, #0f172a 100%)`,
                }}
              >
                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                      <DynamicIcon name={sub.icon || 'calendar'} className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-base font-black tracking-wide">{sub.name}</div>
                      <div className="text-xs text-white/75 mt-0.5 flex items-center gap-2">
                        {sub.category_name && <span>{sub.category_name}</span>}
                        {sub.account_name && <span>• {sub.account_name}</span>}
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur-md border border-white/20">
                    {getPeriodLabel(sub.period_type)}扣费
                  </span>
                </div>

                <div className="relative z-10 mt-6 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-white/70 font-medium">每期扣费</div>
                    <div className="text-2xl font-black mt-0.5 tracking-tight">
                      {formatCurrency(sub.amount)}
                      <span className="text-xs font-normal text-white/70 ml-1">
                        / {getPeriodLabel(sub.period_type)}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-white/70">折合月度固定支出</div>
                    <div className="text-sm font-bold text-white/95 mt-0.5">
                      {formatCurrency(sub.monthly_equivalent_amount)} / 月
                    </div>
                  </div>
                </div>
              </div>

              {/* Status and Next Billing details */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">下次预计扣款：</span>
                  <div className="font-bold text-slate-800 mt-1 flex items-center gap-1.5">
                    <span>{sub.next_billing_date}</span>
                    {sub.days_until_billing === 0 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-rose-50 text-rose-600 font-bold">
                        今天
                      </span>
                    ) : sub.days_until_billing > 0 && sub.days_until_billing <= 7 ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-600 font-bold">
                        剩 {sub.days_until_billing} 天
                      </span>
                    ) : null}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">入账方式：</span>
                  <div className="font-bold text-slate-800 mt-1">
                    {sub.auto_record ? '⚡ 到期自动记账 (Cloudflare Cron)' : '✋ 需手动点击确认'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">年度固定总额：</span>
                  <div className="font-bold text-indigo-600 mt-1">
                    {formatCurrency(sub.yearly_equivalent_amount)} / 年
                  </div>
                </div>

                <div>
                  <span className="text-slate-400">当前状态：</span>
                  <div className="font-bold mt-1">
                    {sub.status === 'active' ? (
                      <span className="text-emerald-600">🟢 扣款进行中</span>
                    ) : sub.status === 'paused' ? (
                      <span className="text-amber-600">⏸️ 已暂停扣款</span>
                    ) : (
                      <span className="text-rose-500">🔴 已退订</span>
                    )}
                  </div>
                </div>
              </div>

              {sub.remark && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 text-xs text-amber-800">
                  <span className="font-bold">备注细节：</span>
                  {sub.remark}
                </div>
              )}

              {/* Action Toolbar */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  disabled={billingLoading}
                  onClick={handleBillNow}
                  className="py-2.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm shadow-indigo-600/20 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{billingLoading ? '入账中...' : '立即记入一期'}</span>
                </button>

                <button
                  disabled={pauseLoading}
                  onClick={handleTogglePause}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {sub.status === 'paused' ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                  <span>{sub.status === 'paused' ? '恢复扣款' : '暂停扣款'}</span>
                </button>

                <button
                  onClick={() => {
                    onClose();
                    onEdit(sub);
                  }}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>编辑订阅</span>
                </button>
              </div>

              {/* History transactions */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                  <span>历史周期扣费流水 ({history.length})</span>
                </h3>

                {history.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl">
                    暂无历史扣费记录，可在上方点击「立即记入一期」或等待扣款日自动生成
                  </div>
                ) : (
                  <div className="space-y-2">
                    {history.map((tx) => (
                      <div
                        key={tx.id}
                        className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-bold text-slate-800">
                            {tx.remark || `[周期扣费] ${sub.name}`}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2">
                            <span>{tx.transaction_time.slice(0, 10)}</span>
                            {tx.account_name && <span>• 账户: {tx.account_name}</span>}
                          </div>
                        </div>

                        <div className="font-bold text-sm text-slate-800">
                          -{formatCurrency(tx.amount)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Danger Zone */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`确定要删除订阅「${sub.name}」吗？已生成的历史流水不会被删除。`)) {
                      onClose();
                      onDelete(sub.id);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl text-rose-500 hover:bg-rose-50 text-xs font-semibold transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除此订阅</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
