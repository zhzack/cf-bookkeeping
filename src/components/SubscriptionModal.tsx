import React, { useState, useEffect, useMemo } from 'react';
import { X, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { fetchApi } from '../api';
import { SubscriptionWithStats, Account, Category } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  subscriptionToEdit?: SubscriptionWithStats | null;
  defaultType?: 'expense' | 'income';
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
  'Briefcase',
  'Coins',
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

function nextDatePreview(dateStr: string, periodType: string, interval: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const step = Math.max(1, interval || 1);
  if (periodType === 'weekly') {
    dt.setUTCDate(dt.getUTCDate() + 7 * step);
  } else if (periodType === 'monthly') {
    const targetMonth = dt.getUTCMonth() + step;
    dt.setUTCMonth(targetMonth);
    const expectedMonth = (m - 1 + step) % 12;
    if (dt.getUTCMonth() !== expectedMonth) dt.setUTCDate(0);
  } else if (periodType === 'quarterly') {
    dt.setUTCMonth(dt.getUTCMonth() + 3 * step);
  } else if (periodType === 'yearly') {
    dt.setUTCFullYear(dt.getUTCFullYear() + step);
  }
  return dt.toISOString().slice(0, 10);
}

export const SubscriptionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  subscriptionToEdit,
  defaultType = 'expense',
  accounts,
  categories,
}) => {
  const isEdit = Boolean(subscriptionToEdit);
  const todayStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  const [subType, setSubType] = useState<'expense' | 'income'>(defaultType);
  const [name, setName] = useState('');
  const [periodType, setPeriodType] = useState<'monthly' | 'yearly' | 'weekly' | 'quarterly'>('monthly');
  const [periodInterval, setPeriodInterval] = useState('1');
  const [amountYuan, setAmountYuan] = useState('');
  const [currency, setCurrency] = useState('CNY');
  const [firstBillingDate, setFirstBillingDate] = useState(() => todayStr);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [autoRecord, setAutoRecord] = useState(true);
  const [recordFirstBillNow, setRecordFirstBillNow] = useState(false);
  const [backfillPastPeriods, setBackfillPastPeriods] = useState(false);
  const [customPeriodAmounts, setCustomPeriodAmounts] = useState<Record<string, string>>({});
  const [color, setColor] = useState('#3b82f6');
  const [icon, setIcon] = useState('Calendar');
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState<'active' | 'paused' | 'cancelled'>('active');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickDefaultCategory = (t: 'expense' | 'income') => {
    const list = categories.filter((c) => c.type === t);
    if (t === 'income') {
      return (list.find((c) => /工资|薪/.test(c.name)) || list[0])?.id || '';
    }
    return list[0]?.id || '';
  };

  const pickDefaultAccount = (t: 'expense' | 'income') => {
    if (t === 'income') {
      return (accounts.find((a) => a.type === 'bank') || accounts[0])?.id || '';
    }
    return accounts[0]?.id || '';
  };

  useEffect(() => {
    if (!isOpen) return;

    if (subscriptionToEdit) {
      const t = subscriptionToEdit.type === 'income' ? 'income' : 'expense';
      setSubType(t);
      setName(subscriptionToEdit.name);
      setPeriodType(subscriptionToEdit.period_type);
      setPeriodInterval(String(subscriptionToEdit.period_interval || 1));
      setAmountYuan((subscriptionToEdit.amount / 100).toFixed(2));
      setCurrency(subscriptionToEdit.currency || 'CNY');
      setFirstBillingDate(subscriptionToEdit.next_billing_date);
      setAccountId(subscriptionToEdit.account_id || pickDefaultAccount(t));
      setCategoryId(subscriptionToEdit.category_id || '');
      setAutoRecord(subscriptionToEdit.auto_record === 1);
      setRecordFirstBillNow(false);
      setBackfillPastPeriods(false);
      setCustomPeriodAmounts({});
      setColor(subscriptionToEdit.color || (t === 'income' ? '#10b981' : '#3b82f6'));
      setIcon(subscriptionToEdit.icon || (t === 'income' ? 'Briefcase' : 'Calendar'));
      setRemark(subscriptionToEdit.remark || '');
      setStatus(subscriptionToEdit.status);
    } else {
      const t = defaultType;
      setSubType(t);
      setName(t === 'income' ? '月度薪资' : '');
      setPeriodType('monthly');
      setPeriodInterval('1');
      setAmountYuan('');
      setCurrency('CNY');
      setFirstBillingDate(todayStr);
      setAccountId(pickDefaultAccount(t));
      setCategoryId(pickDefaultCategory(t));
      setAutoRecord(true);
      setRecordFirstBillNow(false);
      setBackfillPastPeriods(false);
      setCustomPeriodAmounts({});
      setColor(t === 'income' ? '#10b981' : '#3b82f6');
      setIcon(t === 'income' ? 'Briefcase' : 'Calendar');
      setRemark('');
      setStatus('active');
    }
    setError('');
  }, [isOpen, subscriptionToEdit, defaultType, accounts, categories]);

  const handleSwitchType = (nextType: 'expense' | 'income') => {
    if (nextType === subType) return;
    setSubType(nextType);
    setCategoryId(pickDefaultCategory(nextType));
    if (!isEdit) {
      setAccountId(pickDefaultAccount(nextType));
      setColor(nextType === 'income' ? '#10b981' : '#3b82f6');
      setIcon(nextType === 'income' ? 'Briefcase' : 'Calendar');
      if (nextType === 'income' && !name.trim()) setName('月度薪资');
      if (nextType === 'expense' && name === '月度薪资') setName('');
    }
  };

  // 计算如果选择“历史补录至今”，会补录哪些日期
  const backfillDates = useMemo(() => {
    if (isEdit || !firstBillingDate || firstBillingDate > todayStr) return [] as string[];
    const dates: string[] = [];
    let cursor = firstBillingDate;
    const step = Math.max(1, parseInt(periodInterval) || 1);
    while (cursor <= todayStr && dates.length < 60) {
      dates.push(cursor);
      cursor = nextDatePreview(cursor, periodType, step);
    }
    return dates;
  }, [isEdit, firstBillingDate, todayStr, periodType, periodInterval]);

  const backfillPreviewCount = backfillDates.length;

  const backfillTotalYuan = useMemo(() => {
    const baseAmt = parseFloat(amountYuan) || 0;
    return backfillDates.reduce((sum, dt) => {
      const raw = customPeriodAmounts[dt];
      const v = raw !== undefined && raw !== '' ? parseFloat(raw) : baseAmt;
      return sum + (isNaN(v) ? 0 : Math.max(0, v));
    }, 0);
  }, [backfillDates, customPeriodAmounts, amountYuan]);

  if (!isOpen) return null;

  const isIncome = subType === 'income';
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
      setError(isIncome ? '请输入收入项目名称' : '请输入订阅项目名称');
      return;
    }

    const numAmount = parseFloat(amountYuan);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('请输入正确的每期金额');
      return;
    }

    setLoading(true);
    try {
      const amountCents = Math.round(numAmount * 100);

      if (isEdit && subscriptionToEdit) {
        await fetchApi(`/api/subscriptions/${subscriptionToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            type: subType,
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
        let customBackfillEntries: Array<{ date: string; amount: number }> | undefined;
        if (backfillPastPeriods && backfillDates.length > 0) {
          const hasCustomOverride = backfillDates.some((dt) => {
            const raw = customPeriodAmounts[dt];
            return raw !== undefined && raw !== '';
          });
          if (hasCustomOverride || !autoRecord) {
            customBackfillEntries = backfillDates
              .map((dt) => {
                const raw = customPeriodAmounts[dt];
                const yuan = raw !== undefined && raw !== '' ? parseFloat(raw) : numAmount;
                return { date: dt, amount: Math.round((isNaN(yuan) ? 0 : yuan) * 100) };
              })
              .filter((e) => e.amount > 0);
          }
        }

        await fetchApi('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            type: subType,
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
            record_first_bill_now: backfillPastPeriods ? false : recordFirstBillNow,
            backfill_past_periods: backfillPastPeriods,
            custom_backfill_entries: customBackfillEntries,
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
              {isEdit
                ? isIncome
                  ? '编辑周期收入'
                  : '编辑周期订阅'
                : isIncome
                ? '设置固定发薪 / 周期收入'
                : '添加固定订阅 / 周期支出'}
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

          {/* 收支类型切换 */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => handleSwitchType('expense')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                !isIncome
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>周期支出（订阅/房租）</span>
            </button>
            <button
              type="button"
              onClick={() => handleSwitchType('income')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition ${
                isIncome
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>周期收入（发薪/补贴）</span>
            </button>
          </div>

          {/* 名称与分类 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isIncome ? '收入名称' : '订阅名称'} <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isIncome ? '如: 月度薪资、公积金、房租收入' : '如: iCloud 200G、房屋租金、Netflix'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isIncome ? '收入分类' : '支出分类'}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="">未分类</option>
                {categories
                  .filter((c) => c.type === subType)
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
              <span>{isIncome ? '周期与每期入账金额' : '周期与每期金额'}</span>
              {monthlyEstimate > 0 && (
                <span className={isIncome ? 'text-emerald-600 font-semibold' : 'text-indigo-600 font-semibold'}>
                  折合每月：{isIncome ? '+' : ''}¥{monthlyEstimate.toFixed(2)}/月
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                  {!autoRecord
                    ? isIncome
                      ? '参考/预估月薪 (元)'
                      : '参考/预估金额 (元)'
                    : isIncome
                    ? '每期固定入账金额 (元)'
                    : '每期金额 (元)'}
                </label>
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
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                  {isIncome ? '发薪/入账周期' : '扣费周期'}
                </label>
                <select
                  value={periodType}
                  onChange={(e) => setPeriodType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  <option value="monthly">{isIncome ? '按月入账 (Monthly)' : '按月扣费 (Monthly)'}</option>
                  <option value="yearly">{isIncome ? '按年入账 (Yearly)' : '按年扣费 (Yearly)'}</option>
                  <option value="quarterly">{isIncome ? '按季入账 (Quarterly)' : '按季扣费 (Quarterly)'}</option>
                  <option value="weekly">{isIncome ? '按周入账 (Weekly)' : '按周扣费 (Weekly)'}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                  {isEdit
                    ? isIncome
                      ? '下次入账日'
                      : '下次扣款日'
                    : isIncome
                    ? '首次发薪/起始日'
                    : '首次扣款日'}
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
                <label className="block text-[11px] text-slate-500 mb-1 font-medium">
                  {isIncome ? '入账收款账户' : '扣款付款账户'}
                </label>
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

          {/* 金额模式（固定自动 vs 浮动实填）与历史补录选项 */}
          <div className="border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2">金额模式与入账方式</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setAutoRecord(true)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    autoRecord
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-800 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">固定金额 · 自动入账</div>
                  <div className="text-[10px] opacity-75 mt-0.5 leading-snug">
                    每期金额一致，到期由系统定时自动记账
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setAutoRecord(false)}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    !autoRecord
                      ? 'border-amber-500 bg-amber-50/70 text-amber-900 shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold">浮动金额 · 实发手填</div>
                  <div className="text-[10px] opacity-75 mt-0.5 leading-snug">
                    {isIncome
                      ? '每月含绩效/加班/个税实发不同，到账时填真实金额'
                      : '每期费用浮动（如水电费），扣款时填真实金额'}
                  </div>
                </button>
              </div>
            </div>

            {!isEdit && backfillPreviewCount >= 1 && (
              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <label className="flex items-start gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={backfillPastPeriods}
                    onChange={(e) => {
                      setBackfillPastPeriods(e.target.checked);
                      if (e.target.checked) setRecordFirstBillNow(false);
                    }}
                    className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold text-emerald-700">
                      一键补录从 {firstBillingDate} 至今的 {backfillPreviewCount} 期历史流水
                      {backfillTotalYuan > 0 && `（合计 ¥${backfillTotalYuan.toFixed(2)}）`}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {!autoRecord
                        ? '勾选后可在下方逐月填入每期实际到账金额，未修改的期数默认按参考金额入账'
                        : '适合补充过去几个月的固定发薪或房租记录，补录后自动从下个未来日期开始执行'}
                    </div>
                  </div>
                </label>

                {backfillPastPeriods && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold px-1">
                      <span>逐期实际金额明细（可直接逐月修改）</span>
                      <span className="text-emerald-700 font-bold">共 ¥{backfillTotalYuan.toFixed(2)}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {backfillDates.map((dt) => (
                        <div
                          key={dt}
                          className="flex items-center justify-between gap-2 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100"
                        >
                          <span className="text-xs font-medium text-slate-600 tabular-nums">{dt}</span>
                          <div className="relative w-32">
                            <span className="absolute left-2 top-1.5 text-[11px] text-slate-400 font-bold">¥</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder={amountYuan || '0.00'}
                              value={customPeriodAmounts[dt] ?? ''}
                              onChange={(e) =>
                                setCustomPeriodAmounts((prev) => ({
                                  ...prev,
                                  [dt]: e.target.value,
                                }))
                              }
                              className="w-full pl-5 pr-2 py-1 text-xs font-bold text-right rounded-md border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!isEdit && !backfillPastPeriods && backfillPreviewCount === 0 && (
              <label className="flex items-start gap-2 cursor-pointer select-none pt-2 border-t border-slate-100">
                <input
                  type="checkbox"
                  checked={recordFirstBillNow}
                  onChange={(e) => setRecordFirstBillNow(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {isIncome ? '立即记入首期收入流水' : '立即记入首期账单流水'}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    勾选后立即在流水中记入首期，下次日期自动顺延至下一周期
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
              <label className="block text-xs font-bold text-slate-700 mb-1.5">状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="active">🟢 正常进行中</option>
                <option value="paused">⏸️ 已暂停 (不触发自动入账)</option>
                <option value="cancelled">🔴 已终止</option>
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
              placeholder={isIncome ? '如: 税后实发工资、每月15日发放到招商储蓄卡' : '如: 绑定 Visa 信用卡扣款、家庭版共享成员等'}
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
              className={`px-5 py-2.5 rounded-xl text-white text-xs font-semibold shadow-md transition disabled:opacity-50 ${
                isIncome
                  ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20'
              }`}
            >
              {loading
                ? '正在保存...'
                : isEdit
                ? '保存修改'
                : backfillPastPeriods && backfillPreviewCount > 1
                ? `确认添加并补录 ${backfillPreviewCount} 期`
                : '确认添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
