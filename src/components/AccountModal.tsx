import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, SlidersHorizontal } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
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
  const [balanceMode, setBalanceMode] = useState<'current' | 'initial'>('initial');
  const [balanceStr, setBalanceStr] = useState('0');
  const [color, setColor] = useState('#1677FF');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (account) {
      setName(account.name);
      setType(account.type);
      setCurrency(account.currency || 'CNY');
      setBalanceMode('current');
      setBalanceStr((account.current_balance / 100).toFixed(2));
      setColor(account.color || '#1677FF');
    } else {
      setName('');
      setType('bank');
      setCurrency('CNY');
      setBalanceMode('initial');
      setBalanceStr('0');
      setColor('#1677FF');
    }
    setError('');
  }, [isOpen, account]);

  if (!isOpen) return null;

  const txDeltaCents = account ? account.current_balance - account.initial_balance : 0;
  const parsedVal = parseFloat(balanceStr);
  const inputCents = !isNaN(parsedVal) ? Math.round(parsedVal * 100) : null;

  const handleSwitchMode = (nextMode: 'current' | 'initial') => {
    if (nextMode === balanceMode) return;
    setBalanceMode(nextMode);
    if (!account) return;
    if (nextMode === 'current') {
      const nextCurrent = inputCents !== null ? inputCents + txDeltaCents : account.current_balance;
      setBalanceStr((nextCurrent / 100).toFixed(2));
    } else {
      const nextInitial = inputCents !== null ? inputCents - txDeltaCents : account.initial_balance;
      setBalanceStr((nextInitial / 100).toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('请输入账户名称');
      return;
    }

    const balNum = parseFloat(balanceStr);
    if (isNaN(balNum)) {
      setError(balanceMode === 'current' ? '请输入有效的当前余额' : '请输入有效的初始余额');
      return;
    }

    setLoading(true);
    try {
      const cents = Math.round(balNum * 100);
      if (account) {
        const payload =
          balanceMode === 'current'
            ? {
                name: name.trim(),
                type,
                currency,
                target_current_balance: cents,
                color,
                icon: type,
              }
            : {
                name: name.trim(),
                type,
                currency,
                initial_balance: cents,
                color,
                icon: type,
              };
        await fetchApi(`/api/accounts/${account.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        await fetchApi('/api/accounts', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            type,
            currency,
            initial_balance: cents,
            color,
            icon: type,
          }),
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

  const currencySymbol = CURRENCY_OPTIONS.find((c) => c.code === currency)?.symbol || '¥';

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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                {account && <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />}
                <span>
                  {balanceMode === 'current'
                    ? `设定当前实际余额 (${currencySymbol})`
                    : `初始余额 (${currencySymbol})`}
                </span>
              </label>

              {account && (
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('current')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      balanceMode === 'current'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    设定当前值
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('initial')}
                    className={`px-2 py-0.5 rounded-md transition ${
                      balanceMode === 'initial'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    初始值
                  </button>
                </div>
              )}
            </div>

            <input
              type="number"
              step="0.01"
              placeholder="0.00（信用卡欠款可填负数）"
              value={balanceStr}
              onChange={(e) => setBalanceStr(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />

            {account && inputCents !== null && (
              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900/80 leading-relaxed">
                {balanceMode === 'current' ? (
                  <>
                    历史流水净变动：
                    <strong className="text-indigo-700">
                      {txDeltaCents >= 0 ? '+' : ''}
                      {formatCurrency(txDeltaCents, false, currency)}
                    </strong>
                    ；保存后将自动反推初始余额为{' '}
                    <strong className="text-indigo-700">
                      {formatCurrency(inputCents - txDeltaCents, false, currency)}
                    </strong>
                    ，不会产生多余的收支记录。
                  </>
                ) : (
                  <>
                    历史流水净变动：
                    <strong className="text-indigo-700">
                      {txDeltaCents >= 0 ? '+' : ''}
                      {formatCurrency(txDeltaCents, false, currency)}
                    </strong>
                    ；保存后当前余额将变为{' '}
                    <strong className="text-indigo-700">
                      {formatCurrency(inputCents + txDeltaCents, false, currency)}
                    </strong>
                    。
                  </>
                )}
              </div>
            )}
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
              <span>{loading ? '正在保存...' : balanceMode === 'current' && account ? '保存并校准余额' : '保存'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
