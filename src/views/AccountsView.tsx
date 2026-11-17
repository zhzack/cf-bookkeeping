import React, { useState, useMemo } from 'react';
import {
  Plus,
  ChevronRight,
  SlidersHorizontal,
  X,
  Check,
  Scale,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Account, Category } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { CurrencyRatesModal } from '../components/CurrencyRatesModal';

interface Props {
  accounts: Account[];
  categories?: Category[];
  onOpenAddAccount: () => void;
  onEditAccount: (account: Account) => void;
  onRefreshAccounts?: () => void;
}

export const AccountsView: React.FC<Props> = ({
  accounts,
  categories = [],
  onOpenAddAccount,
  onEditAccount,
  onRefreshAccounts,
}) => {
  const [isRatesModalOpen, setIsRatesModalOpen] = useState(false);

  // 单账户快速校准弹窗状态
  const [calibratingAccount, setCalibratingAccount] = useState<Account | null>(null);
  const [calibrateMode, setCalibrateMode] = useState<'transaction' | 'initial'>('transaction');
  const [targetBalanceStr, setTargetBalanceStr] = useState('');
  const [calibrateCategoryId, setCalibrateCategoryId] = useState('');
  const [calibrateRemark, setCalibrateRemark] = useState('');
  const [calibrating, setCalibrating] = useState(false);
  const [calibrateError, setCalibrateError] = useState('');

  // 多账户总账联动对账弹窗状态
  const [isReconcileOpen, setIsReconcileOpen] = useState(false);
  const [reconcileSelectedIds, setReconcileSelectedIds] = useState<string[]>([]);
  const [reconcileMainId, setReconcileMainId] = useState('');
  const [reconcileInputs, setReconcileInputs] = useState<Record<string, string>>({});
  const [reconcileRecordTx, setReconcileRecordTx] = useState(true);
  const [reconcileExpCatId, setReconcileExpCatId] = useState('');
  const [reconcileIncCatId, setReconcileIncCatId] = useState('');
  const [reconcileRemark, setReconcileRemark] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileError, setReconcileError] = useState('');

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories]
  );

  const defaultExpenseCatId = useMemo(
    () => (expenseCategories.find((c) => c.name.includes('其他')) || expenseCategories[0])?.id || '',
    [expenseCategories]
  );
  const defaultIncomeCatId = useMemo(
    () => (incomeCategories.find((c) => c.name.includes('其他')) || incomeCategories[0])?.id || '',
    [incomeCategories]
  );

  const cnyAccounts = useMemo(
    () => accounts.filter((a) => !a.currency || a.currency.toUpperCase() === 'CNY'),
    [accounts]
  );

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

  // 打开单账户校准弹窗
  const openCalibrateModal = (acc: Account, e: React.MouseEvent) => {
    e.stopPropagation();
    setCalibratingAccount(acc);
    setCalibrateMode('transaction');
    setTargetBalanceStr((acc.current_balance / 100).toFixed(2));
    setCalibrateCategoryId('');
    setCalibrateRemark('');
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

    const targetCents = Math.round(val * 100);
    const diff = targetCents - calibratingAccount.current_balance;
    const resolvedCat =
      calibrateCategoryId || (diff < 0 ? defaultExpenseCatId : defaultIncomeCatId) || undefined;

    setCalibrating(true);
    setCalibrateError('');
    try {
      await fetchApi(`/api/accounts/${calibratingAccount.id}/calibrate`, {
        method: 'POST',
        body: JSON.stringify({
          current_balance: targetCents,
          mode: calibrateMode,
          category_id: calibrateMode === 'transaction' ? resolvedCat : undefined,
          remark: calibrateMode === 'transaction' ? calibrateRemark.trim() || undefined : undefined,
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

  // 打开多账户总账对账弹窗（默认勾选 储蓄卡 + 微信 + 支付宝）
  const openReconcileModal = () => {
    const poolCandidates = cnyAccounts.filter((a) =>
      ['bank', 'wechat', 'alipay'].includes(a.type)
    );
    const initialList = poolCandidates.length > 0 ? poolCandidates : cnyAccounts;
    const mainAcc =
      initialList.find((a) => a.type === 'bank') ||
      initialList[0] ||
      accounts[0];

    const initInputs: Record<string, string> = {};
    for (const acc of cnyAccounts) {
      if (acc.id === mainAcc?.id) {
        initInputs[acc.id] = (acc.current_balance / 100).toFixed(2);
      } else if (acc.type === 'wechat' || acc.type === 'alipay') {
        initInputs[acc.id] = '0.00';
      } else {
        initInputs[acc.id] = (acc.current_balance / 100).toFixed(2);
      }
    }

    setReconcileSelectedIds(initialList.map((a) => a.id));
    setReconcileMainId(mainAcc?.id || '');
    setReconcileInputs(initInputs);
    setReconcileRecordTx(true);
    setReconcileExpCatId(defaultExpenseCatId);
    setReconcileIncCatId(defaultIncomeCatId);
    setReconcileRemark('');
    setReconcileError('');
    setIsReconcileOpen(true);
  };

  const toggleReconcileAccount = (accId: string) => {
    setReconcileSelectedIds((prev) => {
      if (prev.includes(accId)) {
        if (prev.length <= 1) return prev;
        const next = prev.filter((id) => id !== accId);
        if (reconcileMainId === accId) {
          setReconcileMainId(next[0] || '');
        }
        return next;
      }
      return [...prev, accId];
    });
  };

  const reconcileStats = useMemo(() => {
    const selected = cnyAccounts.filter((a) => reconcileSelectedIds.includes(a.id));
    let totalBook = 0;
    let totalActual = 0;
    let valid = selected.length > 0;
    for (const acc of selected) {
      totalBook += acc.current_balance;
      const raw = parseFloat(reconcileInputs[acc.id] ?? '');
      if (isNaN(raw)) {
        valid = false;
      } else {
        totalActual += Math.round(raw * 100);
      }
    }
    return {
      selected,
      totalBook,
      totalActual,
      diff: totalActual - totalBook,
      valid,
    };
  }, [cnyAccounts, reconcileSelectedIds, reconcileInputs]);

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcileStats.valid || !reconcileMainId) {
      setReconcileError('请确认已勾选账户并填入有效的实际余额');
      return;
    }

    setReconciling(true);
    setReconcileError('');
    try {
      const entries = reconcileStats.selected.map((acc) => ({
        account_id: acc.id,
        actual_balance: Math.round(parseFloat(reconcileInputs[acc.id] || '0') * 100),
      }));

      await fetchApi('/api/accounts/reconcile', {
        method: 'POST',
        body: JSON.stringify({
          main_account_id: reconcileMainId,
          entries,
          record_diff_as_tx: reconcileRecordTx,
          expense_category_id: reconcileExpCatId || defaultExpenseCatId || null,
          income_category_id: reconcileIncCatId || defaultIncomeCatId || null,
          remark: reconcileRemark.trim() || null,
        }),
      });

      setIsReconcileOpen(false);
      if (onRefreshAccounts) onRefreshAccounts();
    } catch (err: any) {
      setReconcileError(err?.message || '总账对账失败');
    } finally {
      setReconciling(false);
    }
  };

  const calTxDelta = calibratingAccount
    ? calibratingAccount.current_balance - calibratingAccount.initial_balance
    : 0;
  const calParsed = parseFloat(targetBalanceStr);
  const calTargetCents = !isNaN(calParsed) ? Math.round(calParsed * 100) : null;
  const calDiffCents =
    calibratingAccount && calTargetCents !== null
      ? calTargetCents - calibratingAccount.current_balance
      : 0;
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
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-800">我的账户 ({accounts.length})</h2>
            {foreignAccountsCount > 0 && (
              <span className="text-[10px] bg-amber-50 text-amber-700 font-medium px-2 py-0.5 rounded-full border border-amber-200/60">
                {foreignAccountsCount} 个外币钱包
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {cnyAccounts.length > 0 && (
              <button
                type="button"
                onClick={openReconcileModal}
                className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
                title="合并核对储蓄卡与微信/支付宝总账，自动找出漏记消费"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>总账对账</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsRatesModalOpen(true)}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold flex items-center gap-1 transition"
              title="查看与管理外汇汇率"
            >
              <span>💱</span>
              <span className="hidden sm:inline">汇率中心</span>
            </button>
            <button
              type="button"
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
                    title="输入当前实际余额进行校准或平账"
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

      {/* 多账户总账联动对账弹窗 */}
      {isReconcileOpen && (
        <div
          onClick={() => !reconciling && setIsReconcileOpen(false)}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh]"
          >
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Scale className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800">总账联动对账 · 核对漏记消费</h3>
                  <p className="text-[11px] text-slate-400">
                    合并储蓄卡与微信/支付宝渠道余额，精准算出未记录的消费或入账差额
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !reconciling && setIsReconcileOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReconcileSubmit} className="p-5 overflow-y-auto space-y-4">
              {reconcileError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{reconcileError}</span>
                </div>
              )}

              {/* 参与对账的账户列表 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700">1. 勾选联动资金池账户并填入当前实际余额</span>
                  <span className="text-[11px] text-slate-400">同币种 CNY</span>
                </div>

                <div className="space-y-2">
                  {cnyAccounts.map((acc) => {
                    const checked = reconcileSelectedIds.includes(acc.id);
                    const isMain = reconcileMainId === acc.id;
                    return (
                      <div
                        key={acc.id}
                        className={`p-3 rounded-2xl border transition ${
                          checked
                            ? 'bg-slate-50/90 border-indigo-200'
                            : 'bg-white border-slate-100 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleReconcileAccount(acc.id)}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <div
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                              style={{ backgroundColor: acc.color || '#3b82f6' }}
                            >
                              <DynamicIcon name={acc.icon || acc.type} className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-800 truncate">{acc.name}</span>
                                {checked && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      setReconcileMainId(acc.id);
                                    }}
                                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition ${
                                      isMain
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-200/80 text-slate-500 hover:bg-indigo-100 hover:text-indigo-700'
                                    }`}
                                  >
                                    {isMain ? '主结算卡' : '设为主卡'}
                                  </button>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                账面：{formatCurrency(acc.current_balance)}
                              </div>
                            </div>
                          </label>

                          {checked && (
                            <div className="w-32 shrink-0">
                              <div className="relative">
                                <span className="absolute left-2.5 top-2 text-xs text-slate-400 font-bold">¥</span>
                                <input
                                  type="number"
                                  step="0.01"
                                  autoFocus={isMain}
                                  onFocus={(e) => e.target.select()}
                                  value={reconcileInputs[acc.id] ?? ''}
                                  onChange={(e) =>
                                    setReconcileInputs((prev) => ({
                                      ...prev,
                                      [acc.id]: e.target.value,
                                    }))
                                  }
                                  placeholder="0.00"
                                  className={`w-full pl-6 pr-2.5 py-1.5 rounded-xl border text-xs font-bold text-right focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                    isMain
                                      ? 'bg-white border-indigo-300 text-slate-900'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 差额汇总卡片 */}
              {reconcileStats.valid && (
                <div
                  className={`p-3.5 rounded-2xl border space-y-2 ${
                    reconcileStats.diff < 0
                      ? 'bg-rose-50/70 border-rose-200'
                      : reconcileStats.diff > 0
                      ? 'bg-emerald-50/70 border-emerald-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div>
                      <div className="text-[11px] text-slate-500">账面合计</div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {formatCurrency(reconcileStats.totalBook)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">实际合计</div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {formatCurrency(reconcileStats.totalActual)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">未记录差额</div>
                      <div
                        className={`font-black mt-0.5 ${
                          reconcileStats.diff < 0
                            ? 'text-rose-600'
                            : reconcileStats.diff > 0
                            ? 'text-emerald-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {reconcileStats.diff > 0 ? '+' : ''}
                        {formatCurrency(reconcileStats.diff)}
                      </div>
                    </div>
                  </div>

                  <div className="text-[11px] leading-relaxed pt-1.5 border-t border-black/5">
                    {reconcileStats.diff < 0 ? (
                      <span className="text-rose-800">
                        实际余额比账面少了{' '}
                        <strong>{formatCurrency(Math.abs(reconcileStats.diff))}</strong>
                        （可能来自银行卡绑定的其他平台未导账单）。
                        {reconcileRecordTx
                          ? '确认后将自动补录 1 笔漏记支出计入统计，并把微信/支付宝等渠道余额归集平账。'
                          : '当前选择了仅调整初始基线，不产生支出流水。'}
                      </span>
                    ) : reconcileStats.diff > 0 ? (
                      <span className="text-emerald-800">
                        实际余额比账面多了 <strong>{formatCurrency(reconcileStats.diff)}</strong>
                        （可能是未记录的工资、退款或银行利息）。
                        {reconcileRecordTx
                          ? '确认后将自动补录 1 笔收入流水计入统计，并对齐各账户余额。'
                          : '当前选择了仅调整初始基线，不产生收入流水。'}
                      </span>
                    ) : (
                      <span className="text-slate-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        账面总余额与实际总余额完全一致！确认后将自动归集渠道余额（无需补录差额流水）。
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 处理方式与差额分类 */}
              <div className="space-y-3">
                <label className="flex items-start gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={reconcileRecordTx}
                    onChange={(e) => setReconcileRecordTx(e.target.checked)}
                    className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="font-bold text-slate-700">将差额自动补录为收支流水（推荐用于定期核对漏记消费）</div>
                    <div className="text-[11px] text-slate-400">
                      若仅为首次使用对齐初始余额，可取消勾选以直接反推初始值
                    </div>
                  </div>
                </label>

                {reconcileRecordTx && reconcileStats.valid && reconcileStats.diff !== 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                        {reconcileStats.diff < 0 ? '漏记支出归类' : '漏记收入归类'}
                      </label>
                      <select
                        value={reconcileStats.diff < 0 ? reconcileExpCatId : reconcileIncCatId}
                        onChange={(e) =>
                          reconcileStats.diff < 0
                            ? setReconcileExpCatId(e.target.value)
                            : setReconcileIncCatId(e.target.value)
                        }
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        {(reconcileStats.diff < 0 ? expenseCategories : incomeCategories).map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 mb-1">对账备注（可选）</label>
                      <input
                        type="text"
                        value={reconcileRemark}
                        onChange={(e) => setReconcileRemark(e.target.value)}
                        placeholder="如：11月银行卡对账漏记消费"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => !reconciling && setIsReconcileOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium text-xs rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={reconciling || !reconcileStats.valid}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
                >
                  <Check className="w-4 h-4" />
                  <span>{reconciling ? '正在对账平账...' : '确认总账对账并平账'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 单账户快速校准/平账弹窗 */}
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
              {/* 处理模式切换 */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setCalibrateMode('transaction')}
                  className={`py-1.5 rounded-lg transition ${
                    calibrateMode === 'transaction'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  补录差额流水
                </button>
                <button
                  type="button"
                  onClick={() => setCalibrateMode('initial')}
                  className={`py-1.5 rounded-lg transition ${
                    calibrateMode === 'initial'
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  反推初始基线
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-400">当前账面余额</div>
                  <div className="font-bold text-slate-700 mt-0.5">
                    {formatCurrency(calibratingAccount.current_balance, false, calCurrency)}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="text-[11px] text-slate-400">历史流水净额</div>
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

              {calibrateMode === 'transaction' && calTargetCents !== null && calDiffCents !== 0 && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                      {calDiffCents < 0 ? '支出分类' : '收入分类'}
                    </label>
                    <select
                      value={
                        calibrateCategoryId ||
                        (calDiffCents < 0 ? defaultExpenseCatId : defaultIncomeCatId)
                      }
                      onChange={(e) => setCalibrateCategoryId(e.target.value)}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {(calDiffCents < 0 ? expenseCategories : incomeCategories).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 mb-1">备注</label>
                    <input
                      type="text"
                      value={calibrateRemark}
                      onChange={(e) => setCalibrateRemark(e.target.value)}
                      placeholder="漏记消费补录"
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              {calTargetCents !== null && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-100 text-[11px] text-indigo-900/80 leading-relaxed space-y-1">
                  <div>
                    差额：
                    <strong className={calDiffCents < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                      {calDiffCents > 0 ? '+' : ''}
                      {formatCurrency(calDiffCents, false, calCurrency)}
                    </strong>
                  </div>
                  {calibrateMode === 'transaction' ? (
                    <div>
                      {calDiffCents < 0
                        ? `将自动记入 1 笔 ${formatCurrency(Math.abs(calDiffCents), false, calCurrency)} 的漏记支出流水，计入消费统计。`
                        : calDiffCents > 0
                        ? `将自动记入 1 笔 ${formatCurrency(calDiffCents, false, calCurrency)} 的收入流水，计入收入统计。`
                        : '当前账面余额与实际余额一致，无需补录。'}
                    </div>
                  ) : (
                    <div>
                      将直接反推「初始余额」为{' '}
                      <strong className="text-indigo-700">
                        {formatCurrency(calTargetCents - calTxDelta, false, calCurrency)}
                      </strong>
                      ，不产生收支流水（适合首次导入对齐）。
                    </div>
                  )}
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
                  <span>
                    {calibrating
                      ? '正在处理...'
                      : calibrateMode === 'transaction'
                      ? '确认平账并补录'
                      : '确认设定为当前余额'}
                  </span>
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
