import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Check, Calendar, MessageSquare, Wallet } from 'lucide-react';
import { fetchApi } from '../api';
import { Account, Category, Transaction } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
  categories: Category[];
  initialData?: Transaction | null;
}

export const TransactionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  accounts,
  categories,
  initialData,
}) => {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [time, setTime] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 初始化表单数据
  useEffect(() => {
    if (initialData) {
      setType(initialData.type);
      setAmountStr((initialData.amount / 100).toString());
      setAccountId(initialData.account_id);
      setDestinationAccountId(initialData.destination_account_id || '');
      setCategoryId(initialData.category_id || '');
      setTime(initialData.transaction_time.slice(0, 16));
      setRemark(initialData.remark || '');
    } else {
      setType('expense');
      setAmountStr('');
      setAccountId(accounts[0]?.id || '');
      setDestinationAccountId(accounts[1]?.id || '');
      setTime(new Date().toISOString().slice(0, 16));
      setRemark('');
      // 预选第一个匹配分类
      const firstExp = categories.find((c) => c.type === 'expense');
      setCategoryId(firstExp?.id || '');
    }
    setError('');
  }, [isOpen, initialData, accounts, categories]);

  // 当切换类型时，自动适配分类
  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer') => {
    setType(newType);
    if (newType !== 'transfer') {
      const matchCat = categories.find((c) => c.type === newType);
      setCategoryId(matchCat?.id || '');
    }
  };

  if (!isOpen) return null;

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const val = parseFloat(amountStr);
    if (isNaN(val) || val <= 0) {
      setError('请输入有效的金额');
      return;
    }
    const cents = Math.round(val * 100);

    if (!accountId) {
      setError('请选择账户');
      return;
    }
    if (type === 'transfer' && !destinationAccountId) {
      setError('请选择转入账户');
      return;
    }
    if (type === 'transfer' && accountId === destinationAccountId) {
      setError('转出账户与转入账户不能相同');
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      setError('请选择分类');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        type,
        amount: cents,
        account_id: accountId,
        destination_account_id: type === 'transfer' ? destinationAccountId : null,
        category_id: type !== 'transfer' ? categoryId : null,
        transaction_time: time.replace('T', ' ') + ':00',
        remark: remark.trim(),
      };

      if (initialData) {
        await fetchApi(`/api/transactions/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/transactions', {
          method: 'POST',
          body: JSON.stringify(payload),
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div 
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'income' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              收入
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('transfer')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'transfer' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              转账
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Amount Display & Input */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">金额</span>
            <div className="flex items-center gap-1">
              <span className={`text-2xl font-bold ${type === 'expense' ? 'text-rose-500' : type === 'income' ? 'text-emerald-500' : 'text-indigo-600'}`}>
                ¥
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-44 text-right text-3xl font-bold bg-transparent text-slate-800 focus:outline-none placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Categories Grid (Expense & Income) */}
          {type !== 'transfer' && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-2">选择分类</label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                {filteredCategories.map((cat) => {
                  const isSelected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                          : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white mb-1 shadow-sm"
                        style={{ backgroundColor: cat.color || '#6366f1' }}
                      >
                        <DynamicIcon name={cat.icon} className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs truncate max-w-[64px]">{cat.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Account Selection */}
          {type === 'transfer' ? (
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">转出账户</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">转入账户</label>
                <select
                  value={destinationAccountId}
                  onChange={(e) => setDestinationAccountId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {type === 'expense' ? '扣款账户' : '收款账户'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {accounts.map((acc) => {
                  const isSelected = accountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setAccountId(acc.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                          : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200'
                      }`}
                    >
                      <DynamicIcon name={acc.icon || acc.type} className="w-5 h-5 flex-shrink-0" />
                      <span className="text-xs truncate">{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time & Remark */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">记录时间</label>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">备注说明</label>
              <input
                type="text"
                placeholder="例如: 和同事聚餐、超市买水果"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-medium rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <Check className="w-5 h-5" />
              <span>{loading ? '正在保存...' : initialData ? '保存修改' : '确认记账'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

