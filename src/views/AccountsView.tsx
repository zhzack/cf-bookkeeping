import React, { useState } from 'react';
import { Plus, ChevronRight, SlidersHorizontal, X, Check } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
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
  const [calibratingAccount, setCalibratingAccount] = useState<Account | null>(null);
  const [targetBalanceStr, setTargetBalanceStr] = useState('');
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateError, setCalibrateError] = useState('');

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

  const openCalibrateModal = (acc: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    setCalibratingAccount(acc);
    setTargetBalanceStr((acc.current_balance / 100).toFixed(2));
    setCalibrateError('');
  };

  const closeCalibrateModal = () => {
    if (calibrating) return;
    setCalibratingAccount(null);
    setCalibrateError('');
  };

  const handleCalibrateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingAccount) return;

    const val = parseFloat(targetBalanceStr);
    if (isNaN(val)) {
      setCalibrateError('请输入有效的当前实际余额');
      return;
    }

    setCalibrating(true);
    setCalibrateError('');
    try {
      await fetchApi(`/api/accounts/${calibratingAccount.id}/calibrate`, {
        method: 'POST',
        body: JSON.stringify({
          current_balance: Math.round(val * 100),
        }),
      });
      setCalibratingAccount(null);
      if (onRefreshAccounts) onRefreshAccounts();
    } catch (err: any) {
      setCalibrateError(err?.message || '余额校准失败');
    } finally {
      setCalibrating(false);
    }
  };

  const calTxDelta = calibratingAccount
    ? calibratingAccount.current_balance - calibratingAccount.initial_balance
    : 0;
  const calParsed = parseFloat(targetBalanceStr);
  const calTargetCents = !isNaN(calParsed) ? Math.round(calParsed * 100) : null;
  const calCurrency = calibratingAccount?.currency || 'CNY';

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
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                    style={{ backgroundColor: acc.color || '#3b82f6' }}
                  >
                    <DynamicIcon name={acc.icon || acc.type} className="w-5 h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800 truncate">{acc.name}</span>
                      {isForeign && (
                        <span className="text-[10px] bg-amber-100/70 text-amber-800 font-bold px-1.5 py-0.2 rounded border border-amber-200 flex-shrink-0">
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
                        : acc.type === 'other'
                        ? '其他账户'
                        : '现金账户'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => openCalibrateModal(acc, e)}
                    className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 text-[11px] font-medium flex items-center gap-1 transition"
                    title="直接设定当前实际余额"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>校准</span>
                  </button>
                  <div className="text-right min-w-[78px]">
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

      {/* 快速校准余额弹窗 */}
      {calibratingAccount && (
        <div
          onClick={closeCalibrateModal}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl shadow-xl p-6"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm"
                  style={{ backgroundColor: calibratingAccount.color || '#3b82f6' }}
                >
                  <DynamicIcon
                    name={calibratingAccount.icon || calibratingAccount.type}
                    className="w-4 h-4 text-white"
                  />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">校准账户余额</h3>
                  <p className="text-[11px] text-slate-400">{calibratingAccount.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCalibrateModal}
                className="p-1 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {calibrateError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">
                {calibrateError}
              </div>
            )}

            <form onSubmit={handleCalibrateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-400">当前账面余额</div>
                  <div className="font-bold text-slate-700 mt-0.5">
                    {formatCurrency(calibratingAccount.current_balance, false, calCurrency)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-400">已导入/记录流水净额</div>
                  <div className="font-bold text-slate-700 mt-0.5">
                    {calTxDelta >= 0 ? '+' : ''}
                    {formatCurrency(calTxDelta, false, calCurrency)}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  输入现在账户里的实际余额 ({calibratingAccount.currency_symbol || '¥'})
                </label>
                <input
                  type="number"
                  step="0.01"
                  autoFocus
                  onFocus={(e) => e.target.select()}
                  placeholder="例如: 1280.50（信用卡欠款填负数）"
                  value={targetBalanceStr}
                  onChange={(e) => setTargetBalanceStr(e.target.value)}
                  className="w-full px-3.5 py-3 bg-slate-50 border border-indigo-200 rounded-xl text-lg font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {calTargetCents !== null && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900/80 leading-relaxed space-y-1">
                  <div>
                    校准差额：
                    <strong className="text-indigo-700">
                      {calTargetCents - calibratingAccount.current_balance >= 0 ? '+' : ''}
                      {formatCurrency(
                        calTargetCents - calibratingAccount.current_balance,
                        false,
                        calCurrency
                      )}
                    </strong>
                  </div>
                  <div>
                    系统将自动把「初始余额」反推设定为{' '}
                    <strong className="text-indigo-700">
                      {formatCurrency(calTargetCents - calTxDelta, false, calCurrency)}
                    </strong>
                    ，不会新增任何虚假收支流水，不影响收支统计。
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeCalibrateModal}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={calibrating}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>{calibrating ? '正在校准...' : '确认设定为当前余额'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
