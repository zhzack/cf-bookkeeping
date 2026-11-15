import React, { useState, useEffect } from 'react';
import { X, Check, Target, AlertTriangle, Sparkles, Trash2, Calendar, ShieldAlert } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Category, BudgetStatusResponse } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  categories: Category[];
  initialMonth?: string;
}

export const BudgetModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  categories,
  initialMonth,
}) => {
  const currentMonthStr = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth || currentMonthStr);
  const [isDefaultMode, setIsDefaultMode] = useState<boolean>(false);
  const [copyToDefault, setCopyToDefault] = useState<boolean>(true);

  const [overallAmountStr, setOverallAmountStr] = useState<string>('');
  const [alertThreshold, setAlertThreshold] = useState<number>(80);
  const [categoryBudgets, setCategoryBudgets] = useState<Record<string, string>>({});

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // 筛选出所有支出分类
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const loadBudgetForMonth = async (m: string, isDefault: boolean) => {
    setFetching(true);
    setError('');
    try {
      const monthParam = isDefault ? 'default' : m;
      const data = await fetchApi<BudgetStatusResponse>(`/api/budgets?month=${monthParam}`);

      if (data.overall) {
        setOverallAmountStr((data.overall.budget_amount / 100).toString());
      } else {
        setOverallAmountStr('');
      }

      const catMap: Record<string, string> = {};
      for (const cb of data.categories) {
        catMap[cb.category_id] = (cb.budget_amount / 100).toString();
      }
      setCategoryBudgets(catMap);

      if (data.categories.length > 0) {
        setAlertThreshold(data.categories[0].alert_threshold || 80);
      }
    } catch (err: any) {
      console.error('加载预算数据失败', err);
      setError(err.message || '加载预算失败');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccessMsg('');
      loadBudgetForMonth(selectedMonth, isDefaultMode);
    }
  }, [isOpen, selectedMonth, isDefaultMode]);

  if (!isOpen) return null;

  const handleCategoryAmountChange = (catId: string, val: string) => {
    setCategoryBudgets((prev) => ({
      ...prev,
      [catId]: val,
    }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const overallCents = overallAmountStr.trim()
        ? Math.round(parseFloat(overallAmountStr) * 100)
        : null;

      const catBudgetsPayload = Object.entries(categoryBudgets)
        .map(([catId, amountStr]) => {
          const val = parseFloat(amountStr);
          return {
            category_id: catId,
            amount: isNaN(val) || val <= 0 ? 0 : Math.round(val * 100),
            alert_threshold: alertThreshold,
          };
        })
        .filter((item) => item.amount >= 0);

      const targetMonth = isDefaultMode ? 'default' : selectedMonth;

      await fetchApi('/api/budgets/batch', {
        method: 'POST',
        body: JSON.stringify({
          month: targetMonth,
          overall_amount: overallCents,
          alert_threshold: alertThreshold,
          copy_to_default: !isDefaultMode && copyToDefault,
          category_budgets: catBudgetsPayload,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '保存预算失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-xl">
                <Target className="w-4 h-4" />
              </span>
              <span>预算管理与超支限额</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">设定全月支出总限额与各分类专项子预算</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Month Selector & Mode Switch */}
        <div className="px-5 pt-4 pb-2 bg-slate-50/60 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsDefaultMode(false)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  !isDefaultMode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                指定月份预算
              </button>
              <button
                type="button"
                onClick={() => setIsDefaultMode(true)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  isDefaultMode
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                每月通用默认基准
              </button>
            </div>

            {!isDefaultMode && (
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="text-[11px] text-slate-400 mt-2">
            {isDefaultMode
              ? '💡 通用基准预算：当具体月份未单独设定预算时，系统会自动继承此配置。'
              : `💡 当前正在编辑【${selectedMonth}】的专属预算。`}
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 1: 全月总支出预算 */}
          <div className="bg-gradient-to-tr from-indigo-50/70 to-slate-50 p-4 rounded-2xl border border-indigo-100/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <span>全月总支出预算 (元)</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">控制全月整体日常开销上限</div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-lg font-bold text-indigo-600">¥</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={overallAmountStr}
                  onChange={(e) => setOverallAmountStr(e.target.value)}
                  className="w-32 px-3 py-1.5 text-right font-bold text-slate-800 bg-white border border-indigo-200 rounded-xl text-base focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-indigo-100/60 text-xs">
              <span className="text-slate-500 font-medium">预警阈值 (触达时提示注意)</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="50"
                  max="100"
                  value={alertThreshold}
                  onChange={(e) => setAlertThreshold(Number(e.target.value))}
                  className="w-14 px-2 py-0.5 text-center font-bold text-xs bg-white border border-slate-200 rounded-lg focus:outline-none"
                />
                <span className="text-slate-500 font-bold">%</span>
              </div>
            </div>

            {!isDefaultMode && (
              <label className="flex items-center gap-2 pt-1 text-[11px] text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={copyToDefault}
                  onChange={(e) => setCopyToDefault(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>同时同步设为「每月默认基准」，未来新月份自动生效</span>
              </label>
            )}
          </div>

          {/* Section 2: 各分类子预算 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800">分类专项子预算 (可选)</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">为特定消费大头（如餐饮、娱乐、网购）单独设限</p>
              </div>
              <span className="text-[11px] text-slate-400 font-medium">
                已设 {Object.values(categoryBudgets).filter((v) => parseFloat(v) > 0).length} 项
              </span>
            </div>

            <div className="space-y-2">
              {expenseCategories.map((cat) => {
                const currentVal = categoryBudgets[cat.id] || '';

                return (
                  <div
                    key={cat.id}
                    className="p-3 bg-slate-50/70 hover:bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between gap-3 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                        style={{ backgroundColor: cat.color || '#6366f1' }}
                      >
                        <DynamicIcon name={cat.icon} className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-700 truncate">{cat.name}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs font-semibold text-slate-400">¥</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="不设限"
                        value={currentVal}
                        onChange={(e) => handleCategoryAmountChange(cat.id, e.target.value)}
                        className="w-24 px-2.5 py-1 text-right text-xs font-bold bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || fetching}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-200 transition disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span>{loading ? '正在保存...' : '保存预算配置'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
