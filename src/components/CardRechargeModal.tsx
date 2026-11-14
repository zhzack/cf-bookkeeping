import React, { useState, useEffect } from 'react';
import { X, PlusCircle, AlertCircle } from 'lucide-react';
import { fetchApi } from '../api';
import { PrepaidCardWithStats, Account, Category } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  card: PrepaidCardWithStats | null;
  accounts: Account[];
  categories: Category[];
}

export const CardRechargeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  card,
  accounts,
  categories,
}) => {
  if (!isOpen || !card) return null;

  const isTimes = card.type === 'times';

  const [amountYuan, setAmountYuan] = useState('');
  const [valueToAdd, setValueToAdd] = useState('');
  const [giftAmountYuan, setGiftAmountYuan] = useState('');
  const [remark, setRemark] = useState('');
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 16).replace('T', ' '));

  const [syncLedger, setSyncLedger] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAmountYuan('');
    setValueToAdd('');
    setGiftAmountYuan('');
    setRemark('');
    setDateStr(new Date().toISOString().slice(0, 16).replace('T', ' '));
    setError('');
    setAccountId(accounts[0]?.id || '');
    const defaultExpCat = categories.find((c) => c.type === 'expense');
    setCategoryId(defaultExpCat?.id || '');
  }, [card, isOpen, accounts, categories]);

  const handleAmountChange = (val: string) => {
    setAmountYuan(val);
    if (!isTimes && !valueToAdd) {
      setValueToAdd(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const numAmt = parseFloat(amountYuan);
    if (isNaN(numAmt) || numAmt < 0) {
      setError('请输入正确的本次实付金额');
      return;
    }

    const numVal = parseFloat(valueToAdd);
    if (isNaN(numVal) || numVal <= 0) {
      setError(isTimes ? '追加次数必须大于 0' : '追加充值面值必须大于 0');
      return;
    }

    setLoading(true);
    try {
      const amountCents = Math.round(numAmt * 100);
      const giftCents = Math.round((parseFloat(giftAmountYuan) || 0) * 100);
      const parsedValue = isTimes ? Math.round(numVal) : Math.round(numVal * 100);

      await fetchApi(`/api/cards/${card.id}/recharge`, {
        method: 'POST',
        body: JSON.stringify({
          amount: amountCents,
          value: parsedValue,
          gift_amount: giftCents,
          remark: remark.trim() || null,
          date: dateStr,
          account_id: syncLedger ? accountId : null,
          sync_ledger: syncLedger,
          category_id: syncLedger ? categoryId : null,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '续充失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: card.color || '#6366f1' }}
            >
              <DynamicIcon name={card.icon || 'credit-card'} className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">卡片续充 / 追加充值</h2>
              <div className="text-[11px] text-slate-400">{card.name}</div>
            </div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">本次实付金额 (元)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                required
                value={amountYuan}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isTimes ? '追加次数 (次)' : '追加卡内面值 (元)'}
              </label>
              <input
                type="number"
                step={isTimes ? '1' : '0.01'}
                min={isTimes ? '1' : '0.01'}
                required
                value={valueToAdd}
                onChange={(e) => setValueToAdd(e.target.value)}
                placeholder={isTimes ? '如: 10, 20' : '如: 1000'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {!isTimes && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">其中商家赠送金额 (元，选填)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={giftAmountYuan}
                onChange={(e) => setGiftAmountYuan(e.target.value)}
                placeholder="如: 100.00"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">充值说明 / 备注</label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如: 店庆活动续费20节"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* 同步记账流水选项 */}
          <div className="border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncLedger}
                onChange={(e) => setSyncLedger(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-bold text-slate-800">同步从账户扣款并生成充值支出账单</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  系统会自动标记此流水「不计入日常生活成本」，避免大额充值扭曲生活日均
                </div>
              </div>
            </label>

            {syncLedger && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">扣款付款账户</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">记账分类</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
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
            )}
          </div>

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
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              <span>{loading ? '正在续充...' : '确认续充'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
