import React, { useState } from 'react';
import { Plus, Wallet, CreditCard, ChevronRight, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../api';
import { Account } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { CurrencyRatesModal } from '../components/CurrencyRatesModal';

interface Props {
  accounts: Account[];
  onOpenAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onRefreshAccounts?: () => void;
}

export const AccountsView: React.FC<Props> = ({
  accounts,
  onOpenAddAccount,
  onEditAccount,
  onRefreshAccounts,
}) => {
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);

  // 计算折合基准币种 (CNY) 的总资产与总负债
  const totalAssets = accounts
    .map((a) =>
      a.cny_current_balance !== undefined
        ? a.cny_current_balance
        : Math.round(a.current_balance * (a.rate_to_cny || 1))
    )
    .filter((b) => b >= 0)
    .reduce((sum, b) => sum + b, 0);

  const totalLiabilities = accounts
    .map((a) =>
      a.cny_current_balance !== undefined
        ? a.cny_current_balance
        : Math.round(a.current_balance * (a.rate_to_cny || 1))
    )
    .filter((b) => b < 0)
    .reduce((sum, b) => sum + Math.abs(b), 0);

  const foreignAccountsCount = accounts.filter(
    (a) => a.currency && a.currency.toUpperCase() !== 'CNY'
  ).length;

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 资产与负债卡片 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400 font-medium flex items-center gap-1.5">
              <span>储蓄与可用资产</span>
              {foreignAccountsCount > 0 && (
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded font-medium">
                  含外币折算 CNY
                </span>
              )}
            </div>
            <div className="text-xl font-bold text-slate-800 mt-1">{formatCurrency(totalAssets)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium">信用卡负债</div>
            <div className="text-xl font-bold text-rose-500 mt-1">{formatCurrency(totalLiabilities)}</div>
          </div>
        </div>
      </div>

      {/* 账户列表 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">我的账户 ({accounts.length})</h2>
            {foreignAccountsCount > 0 && (
              <span className="text-[10px] bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full border border-amber-200/60">
                {foreignAccountsCount} 个外币钱包
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsRatesModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
              title="查看与管理外汇汇率"
            >
              <span>💱</span>
              <span>汇率中心</span>
            </button>
            <button
              onClick={onOpenAddAccount}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>添加账户</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-50">
          {accounts.map((acc) => {
            const isForeign = acc.currency && acc.currency.toUpperCase() !== 'CNY';

            return (
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800">{acc.name}</span>
                      {isForeign && (
                        <span className="text-[10px] bg-amber-100/70 text-amber-800 font-bold px-1.5 py-0.2 rounded border border-amber-200">
                          {acc.currency}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {acc.type === 'credit'
                        ? '信用卡'
                        : acc.type === 'wechat'
                        ? '微信支付'
                        : acc.type === 'alipay'
                        ? '支付宝'
                        : acc.type === 'bank'
                        ? '银行卡'
                        : '现金账户'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div
                      className={`text-sm sm:text-base font-bold ${
                        acc.current_balance < 0 ? 'text-rose-500' : 'text-slate-800'
                      }`}
                    >
                      {formatCurrency(acc.current_balance, false, acc.currency || 'CNY')}
                    </div>
                    {isForeign && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        ≈ {formatCurrency(
                          acc.cny_current_balance ??
                            Math.round(acc.current_balance * (acc.rate_to_cny || 1))
                        )}{' '}
                        CNY
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <CurrencyRatesModal
        isOpen={isRatesModalOpen}
        onClose={() => setIsRatesModalOpen(false)}
        onRatesUpdated={() => {
          if (onRefreshAccounts) onRefreshAccounts();
        }}
      />
    </div>
  );
};
