import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { SubscriptionWithStats } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  subscription: SubscriptionWithStats | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const SubscriptionBillModal: React.FC<Props> = ({
  isOpen,
  subscription,
  onClose,
  onSuccess,
}) => {
  const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  const [amountYuan, setAmountYuan] = useState('');
  const [billingDate, setBillingDate] = useState(todayStr);
  const [remark, setRemark] = useState('');
  const [updateDefaultAmount, setUpdateDefaultAmount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !subscription) return;
    setAmountYuan((subscription.amount / 100).toFixed(2));
    setBillingDate(
      subscription.next_billing_date <= todayStr ? subscription.next_billing_date : todayStr
    );
    setRemark('');
    setUpdateDefaultAmount(false);
    setError('');
  }, [isOpen, subscription, todayStr]);

  if (!isOpen || !subscription) return null;

  const isIncome = subscription.type === 'income';
  const isVariable = subscription.auto_record === 0;
  const parsedAmount = parseFloat(amountYuan);
  const amountChanged =
    !isNaN(parsedAmount) && Math.round(parsedAmount * 100) !== subscription.amount;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('请输入大于 0 的实际金额');
      return;
    }

    setLoading(true);
    try {
      await fetchApi(`/api/subscriptions/${subscription.id}/bill-now`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(parsedAmount * 100),
          billing_date: billingDate,
          remark: remark.trim() || undefined,
          update_default_amount: updateDefaultAmount,
        }),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message || '入账失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      onClick={() => !loading && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: subscription.color || (isIncome ? '#10b981' : '#3b82f6') }}
            >
              <DynamicIcon name={subscription.icon || 'Calendar'} className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 truncate">
                {isIncome ? '记录本期实发入账' : '记录本期实付扣款'}
              </h3>
              <p className="text-[11px] text-slate-400 truncate">
                {subscription.name} · 参考 {formatCurrency(subscription.amount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !loading && onClose()}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-600 text-xs rounded-xl flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">
              {isIncome ? '本期实际到账金额 (元)' : '本期实际扣款金额 (元)'}
              {isVariable && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-bold">
                  浮动金额
                </span>
              )}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-base text-slate-400 font-bold">¥</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                onFocus={(e) => e.target.select()}
                value={amountYuan}
                onChange={(e) => setAmountYuan(e.target.value)}
                className={`w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border rounded-xl text-xl font-black focus:outline-none focus:ring-2 ${
                  isIncome
                    ? 'border-emerald-200 text-emerald-700 focus:ring-emerald-500/30 focus:border-emerald-500'
                    : 'border-indigo-200 text-slate-800 focus:ring-indigo-500/30 focus:border-indigo-500'
                }`}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                {isIncome ? '实际到账日期' : '实际扣款日期'}
              </label>
              <input
                type="date"
                required
                value={billingDate}
                onChange={(e) => setBillingDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                本期备注（可选）
              </label>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={isIncome ? '如：含加班/绩效' : '如：本月水电费'}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {amountChanged && (
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
              <input
                type="checkbox"
                checked={updateDefaultAmount}
                onChange={(e) => setUpdateDefaultAmount(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>同步将此金额设为后续默认参考金额</span>
            </label>
          )}

          <div className="text-[11px] text-slate-400 leading-relaxed">
            确认后将生成 1 笔{isIncome ? '收入' : '支出'}流水计入「{subscription.account_name || '默认账户'}」，并将下次计划日期自动滚动至下一周期。
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => !loading && onClose()}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-xs rounded-xl transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 py-2.5 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition disabled:opacity-60 ${
                isIncome
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? '入账中...' : isIncome ? '确认实发入账' : '确认实付记账'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
