import React, { useState, useEffect } from 'react';
import { X, Calendar, Sparkles, CreditCard, Layers, Tag, AlertCircle } from 'lucide-react';
import { fetchApi } from '../api';
import { SubscriptionWithStats, Account, Category } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subscriptionToEdit?: SubscriptionWithStats | null;
  accounts: Account[];
  categories: Category[];
}

const COLOR_PRESETS = [
  { name: '天空蔚蓝', value: '#3b82f6' },
  { name: '经典紫蓝', value: '#6366f1' },
  { name: '翡翠墨绿', value: '#10b981' },
  { name: '活力曜金', value: '#f59e0b' },
  { name: '热烈玫红', value: '#f43f5e' },
  { name: '高贵流紫', value: '#a855f7' },
  { name: '黑金曜石', value: '#334155' },
];

const ICON_PRESETS = [
  'Calendar',
  'CreditCard',
  'Smartphone',
  'Laptop',
  'Tv',
  'Film',
  'Coffee',
  'ShoppingBag',
  'HeartPulse',
  'Home',
  'Car',
  'Zap',
];

export const SubscriptionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  subscriptionToEdit,
  accounts,
  categories,
}) => {
  const isEdit = Boolean(subscriptionToEdit);

  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<'monthly' | 'yearly' | 'weekly' | 'quarterly'>('monthly');
  const [periodInterval, setPeriodInterval] = useState('1');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [firstBillingDate, setFirstBillingDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [autoRecord, setAutoRecord] = useState(true);
  const [recordFirstBillNow, setRecordFirstBillNow] = useState(false);
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('Calendar');
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'cancelled'>('active');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (subscriptionToEdit) {
      setName(subscriptionToEdit.name);
      setPeriodType(subscriptionToEdit.period_type);
      setPeriodInterval(String(subscriptionToEdit.period_interval || 1));
      setAmountYuan((subscriptionToEdit.amount / 100).toFixed(2));
      setCurrency(subscriptionToEdit.currency || 'CNY');
      setFirstBillingDate(subscriptionToEdit.next_billing_date);
      setAccountId(subscriptionToEdit.account_id || accounts[0]?.id || '');
      setCategoryId(subscriptionToEdit.category_id || '');
      setAutoRecord(subscriptionToEdit.auto_record === 1);
      setRecordFirstBillNow(false);
      setColor(subscriptionToEdit.color || '#3b82f6');
      setIcon(subscriptionToEdit.icon || 'Calendar');
      setRemark(subscriptionToEdit.remark || '');
      setStatus(subscriptionToEdit.status);
    } else {
      setName('');
      setPeriodType('monthly');
      setPeriodInterval('1');
      setAmountYuan('');
      setCurrency('CNY');
      setFirstBillingDate(new Date().toISOString().slice(0, 10));
      setAccountId(accounts[0]?.id || '');
      const defaultExpCat = categories.find((c) => c.type === 'expense');
      setCategoryId(defaultExpCat?.id || '');
      setAutoRecord(true);
      setRecordFirstBillNow(false);
      setColor('#3b82f6');
      setIcon('Calendar');
      setRemark('');
      setStatus('active');
    }
    setError('');
  }, [isOpen, subscriptionToEdit, accounts, categories]);

  if (!isOpen) return null;

  // 折合月度支出预览
  const numAmt = parseFloat(amountYuan) || 0;
  const numInterval = parseInt(periodInterval) || 1;
  let monthlyEstimate = 0;
  if (numAmt > 0 && numInterval > 0) {
    if (periodType === 'monthly') monthlyEstimate = numAmt / numInterval;
    else if (periodType === 'yearly') monthlyEstimate = numAmt / (12 * numInterval);
    else if (periodType === 'weekly') monthlyEstimate = (numAmt * 52) / (12 * numInterval);
    else if (periodType === 'quarterly') monthlyEstimate = numAmt / (3 * numInterval);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入订阅项目名称');
      return;
    }

    const numAmount = parseFloat(amountYuan);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('请输入正确的每期扣款金额');
      return;
    }

    setLoading(true);
    try {
      const amountCents = Math.round(numAmount * 100);

      if (isEdit && subscriptionToEdit) {
        await fetchApi(`/api/subscriptions/${subscriptionToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            category_id: categoryId || null,
            account_id: accountId || null,
            amount: amountCents,
            currency,
            period_type: periodType,
            period_interval: Math.max(1, parseInt(periodInterval) || 1),
            next_billing_date: firstBillingDate,
            auto_record: autoRecord ? 1 : 0,
            status,
            icon,
            color,
            remark: remark.trim() || null,
          }),
        });
      } else {
        await fetchApi('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            category_id: categoryId || null,
            account_id: accountId || null,
            amount: amountCents,
            currency,
            period_type: periodType,
            period_interval: Math.max(1, parseInt(periodInterval) || 1),
            first_billing_date: firstBillingDate,
            auto_record: autoRecord ? 1 : 0,
            icon,
            color,
            remark: remark.trim() || null,
            record_first_bill_now: recordFirstBillNow,
          }),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: color }}
            >
              <DynamicIcon name={icon} className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              {isEdit ? '编辑周期订阅' : '添加固定订阅 / 周期账单'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 订阅项目名称与分类 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                订阅名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如: iCloud 200G、房屋租金、Netflix"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">支出分类</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">未分类</option>
                {categories
                  .filter((c) => c.type === 'expense')
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* 周期与金额设定 */}
          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100 space-y-3">
            <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>周期与每期金额</span>
              {monthlyEstimate > 0 && (
                <span className="text-indigo-600 font-semibold">
                  折合每月：¥{monthlyEstimate.toFixed(2)}/月
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">每期金额 (元)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amountYuan}
                    onChange={(e) => setAmountYuan(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">扣费周期</label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  <option value="monthly">按月扣费 (Monthly)</option>
                  <option value="yearly">按年扣费 (Yearly)</option>
                  <option value="quarterly">按季扣费 (Quarterly)</option>
                  <option value="weekly">按周扣费 (Weekly)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                  {isEdit ? '下次扣款日' : '首次扣款日'}
                </label>
                <input
                  type="date"
                  required
                  value={firstBillingDate}
                  onChange={(e) => setFirstBillingDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">扣款付款账户</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 自动记账与首期入账选项 */}
          <div className="border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRecord}
                onChange={(e) => setAutoRecord(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-bold text-slate-800">到期自动生成支出流水 (推荐开启)</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  开启后系统由 Cloudflare 定时任务在扣款日自动生成账单；取消则在看板中提供「待确认」按钮供您手动打勾入账
                </div>
              </div>
            </label>

            {!isEdit && (
              <label className="flex items-start gap-2 cursor-pointer select-none pt-1 border-t border-slate-100">
                <input
                  type="checkbox"
                  checked={recordFirstBillNow}
                  onChange={(e) => setRecordFirstBillNow(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">立即记入首期账单流水</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    勾选后立即在流水中扣减并记录首次支出，下次扣款日自动顺延至下一周期
                  </div>
                </div>
              </label>
            )}
          </div>

          {/* 图标与主题色 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">卡面主题色与图标</label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition ${
                    color === c.value ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ICON_PRESETS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`p-2 rounded-xl border transition ${
                    icon === ic
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <DynamicIcon name={ic} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* 状态 (仅编辑) */}
          {isEdit && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">订阅状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="active">🟢 正常进行中 (扣费中)</option>
                <option value="paused">⏸️ 已暂停 (不触发自动入账)</option>
                <option value="cancelled">🔴 已终止 / 退订</option>
              </select>
            </div>
          )}

          {/* 备注 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">备注信息</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如: 绑定 Visa 信用卡扣款、家庭版共享成员等"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {loading ? '正在保存...' : isEdit ? '保存修改' : '确认添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
