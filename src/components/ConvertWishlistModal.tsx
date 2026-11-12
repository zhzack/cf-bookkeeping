import React, { useState } from 'react';
import { X, Check, ShoppingBag, Sparkles } from 'lucide-react';
import { fetchApi } from '../api';
import { ItemWithStats, Account } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: ItemWithStats | null;
  accounts: Account[];
}

export const ConvertWishlistModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  item,
  accounts,
}) => {
  const [priceStr, setPriceStr] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  React.useEffect(() => {
    if (item) {
      setPriceStr((item.price / 100).toString());
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setAccountId(accounts[0]?.id || '');
      setError('');
    }
  }, [item, accounts]);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const val = parseFloat(priceStr);
    if (isNaN(val) || val <= 0) {
      setError('请输入正确的购买金额');
      return;
    }

    setLoading(true);
    try {
      await fetchApi(`/api/items/${item.id}/convert-wishlist`, {
        method: 'POST',
        body: JSON.stringify({
          price: val,
          purchase_date: purchaseDate,
          account_id: accountId || undefined,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '拔草失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">心愿拔草 · 转为已购</h2>
              <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{item.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-3 p-2.5 bg-red-50 text-red-600 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800">
            <Sparkles className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>冷静期已过！已深思熟虑，即将转入服役并开启日均成本计算。</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">实际成交价格 (元)</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">购买日期</label>
              <input
                type="date"
                required
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">付款账户</label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-medium text-xs rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '正在处理...' : '确认拔草并生成记账流水'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

