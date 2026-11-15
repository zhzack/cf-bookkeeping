import React, { useState, useEffect } from 'react';
import { X, Check, Trash2 } from 'lucide-react';
import { fetchApi } from '../api';
import { Account } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  account?: Account | null;
}

const ACCOUNT_TYPES = [
  { type: 'wechat', name: '微信', color: '#07C160' },
  { type: 'alipay', name: '支付宝', color: '#1677FF' },
  { type: 'bank', name: '银行卡', color: '#FA541C' },
  { type: 'credit', name: '信用卡', color: '#722ED1' },
  { type: 'cash', name: '现金', color: '#52C41A' },
  { type: 'other', name: '其他', color: '#8C8C8C' },
];

const CURRENCY_OPTIONS = [
  { code: 'CNY', name: '人民币 (CNY)', symbol: '¥' },
  { code: 'USD', name: '美元 (USD)', symbol: '$' },
  { code: 'HKD', name: '港币 (HKD)', symbol: 'HK$' },
  { code: 'EUR', name: '欧元 (EUR)', symbol: '€' },
  { code: 'GBP', name: '英镑 (GBP)', symbol: '£' },
  { code: 'JPY', name: '日元 (JPY)', symbol: 'JP¥' },
  { code: 'SGD', name: '新加坡元 (SGD)', symbol: 'S$' },
  { code: 'AUD', name: '澳元 (AUD)', symbol: 'A$' },
  { code: 'CAD', name: '加元 (CAD)', symbol: 'C$' },
  { code: 'THB', name: '泰铢 (THB)', symbol: '฿' },
  { code: 'KRW', name: '韩元 (KRW)', symbol: '₩' },
  { code: 'MOP', name: '澳门元 (MOP)', symbol: 'MOP$' },
  { code: 'TWD', name: '新台币 (TWD)', symbol: 'NT$' },
];

export const AccountModal: React.FC<Props> = ({ isOpen, onClose, onSuccess, account }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [currency, setCurrency] = useState('CNY');
  const [initialBalanceStr, setInitialBalanceStr] = useState('0');
  const [color, setColor] = useState('#1677FF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setCurrency(account.currency || 'CNY');
      setInitialBalanceStr((account.initial_balance / 100).toString());
      setColor(account.color || '#1677FF');
    } else {
      setName('');
      setType('bank');
      setCurrency('CNY');
      setInitialBalanceStr('0');
      setColor('#1677FF');
    }
    setError('');
  }, [isOpen, account]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入账户名称');
      return;
    }

    const initBal = parseFloat(initialBalanceStr);
    if (isNaN(initBal)) {
      setError('请输入有效的初始余额');
      return;
    }

    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        type,
        currency,
        initial_balance: Math.round(initBal * 100),
        color,
        icon: type,
      };

      if (account) {
        await fetchApi(`/api/accounts/${account.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/accounts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!account) return;
    if (!confirm(`确定要删除账户“${account.name}”吗？若该账户下已有流水将无法删除。`)) return;

    setLoading(true);
    try {
      await fetchApi(`/api/accounts/${account.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <h2 className="text-base font-bold text-slate-800">{account ? '编辑账户' : '新增账户'}</h2>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">账户类型</label>
            <div className="grid grid-cols-3 gap-2">
              {ACCOUNT_TYPES.map((t) => (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    setType(t.type);
                    setColor(t.color);
                  }}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition ${
                    type === t.type
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                      : 'border-slate-100 bg-slate-50 text-slate-600'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">账户名称</label>
            <input
              type="text"
              required
              placeholder="例如: 招商工资卡、微信零钱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">账户币种</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                初始金额 ({CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol || '¥'})
              </label>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={initialBalanceStr}
                onChange={(e) => setInitialBalanceStr(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            {account && (
              <button
                type="button"
                onClick={handleDelete}
                className="p-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition"
                title="删除账户"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '正在保存...' : '保存'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

