import React, { useState } from 'react';
import { X, Check, Wrench, Shield, DollarSign } from 'lucide-react';
import { fetchApi } from '../api';
import { ItemWithStats, Account } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: ItemWithStats | null;
  accounts: Account[];
}

export const AddItemExpenseModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  item,
  accounts,
}) => {
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [syncLedger, setSyncLedger] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const val = parseFloat(amountStr);
    if (isNaN(val) || val <= 0) {
      setError('请输入有效的金额');
      return;
    }
    if (!description.trim()) {
      setError('请输入支出说明');
      return;
    }

    setLoading(true);
    try {
      await fetchApi(`/api/items/${item.id}/expenses`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Math.round(val * 100),
          description: description.trim(),
          date,
          sync_ledger: syncLedger,
          account_id: syncLedger ? accountId : undefined,
        }),
      });

      onSuccess();
      onClose();
      setAmountStr('');
      setDescription('');
    } catch (err: any) {
      setError(err.message || '追加支出失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">追加配件/维护支出</h2>
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

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">支出说明</label>
            <input
              type="text"
              required
              placeholder="例如: 购买保护壳、官方换电池、加装内存"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">金额 (元)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">支出日期</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {/* 是否同步记入账本流水 */}
          <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={syncLedger}
                onChange={(e) => setSyncLedger(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <span className="text-xs font-semibold text-slate-700">同步记入日常记账流水</span>
            </label>

            {syncLedger && (
              <div>
                <span className="block text-[11px] text-slate-400 mb-1">扣款账户</span>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '正在保存...' : '确认追加并重算成本'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

