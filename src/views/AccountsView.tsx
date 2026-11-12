import React from 'react';
import { Plus, Wallet, CreditCard, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../api';
import { Account } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';

interface Props {
  accounts: Account[];
  onOpenAddAccount: () => void;
  onEditAccount: (account: Account) => void;
}

export const AccountsView: React.FC<Props> = ({ accounts, onOpenAddAccount, onEditAccount }) => {
  const totalAssets = accounts
    .filter((a) => a.current_balance >= 0)
    .reduce((sum, a) => sum + a.current_balance, 0);

  const totalLiabilities = accounts
    .filter((a) => a.current_balance < 0)
    .reduce((sum, a) => sum + Math.abs(a.current_balance), 0);

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 资产与负债卡片 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-400 font-medium">储蓄与可用资产</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(totalAssets)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 font-medium">信用卡负债</div>
          <div className="text-xl font-bold text-rose-500 mt-1">{formatCurrency(totalLiabilities)}</div>
        </div>
      </div>

      {/* 账户列表 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-800">我的账户 ({accounts.length})</h2>
          <button
            onClick={onOpenAddAccount}
            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>添加账户</span>
          </button>
        </div>

        <div className="divide-y divide-slate-50">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              onClick={() => onEditAccount(acc)}
              className="py-3.5 flex items-center justify-between group cursor-pointer hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                  style={{ backgroundColor: acc.color || '#3b82f6' }}
                >
                  <DynamicIcon name={acc.icon || acc.type} className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{acc.name}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {acc.type === 'credit' ? '信用卡' : acc.type === 'wechat' ? '微信支付' : acc.type === 'alipay' ? '支付宝' : acc.type === 'bank' ? '银行储蓄卡' : '现金账户'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-sm sm:text-base font-bold ${
                    acc.current_balance < 0 ? 'text-rose-500' : 'text-slate-800'
                  }`}
                >
                  {formatCurrency(acc.current_balance)}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

