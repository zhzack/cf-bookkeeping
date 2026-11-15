import React, { useState } from 'react';
import {
  Target,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Calendar,
  ChevronDown,
  ChevronUp,
  Settings,
  Plus,
  Flame,
} from 'lucide-react';
import { formatCurrency } from '../api';
import { BudgetStatusResponse, CategoryBudgetDetail } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  budgetData: BudgetStatusResponse | null;
  loading?: boolean;
  onOpenModal: () => void;
  compact?: boolean;
}

export const BudgetCard: React.FC<Props> = ({
  budgetData,
  loading = false,
  onOpenModal,
  compact = false,
}) => {
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);

  if (loading && !budgetData) {
    return (
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-3"></div>
        <div className="h-2 bg-slate-100 rounded-full w-full"></div>
      </div>
    );
  }

  const overall = budgetData?.overall;
  const categories = budgetData?.categories || [];
  const unbudgeted = budgetData?.unbudgeted_categories || [];

  // ================= 紧凑视图 (常驻于日常记账列表顶部) =================
  if (compact) {
    if (!overall) {
      return (
        <div
          onClick={onOpenModal}
          className="bg-gradient-to-r from-indigo-50/80 via-white to-indigo-50/40 rounded-2xl p-3 border border-indigo-100/70 shadow-sm flex items-center justify-between gap-3 cursor-pointer hover:border-indigo-200 transition group"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">
                本月未设定支出预算
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                设定月度支出总限额与每日可用额度，消费心里有数
              </div>
            </div>
          </div>
          <button
            type="button"
            className="px-2.5 py-1 bg-white group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition shadow-sm flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>设预算</span>
          </button>
        </div>
      );
    }

    const isExceeded = overall.status === 'exceeded';
    const isWarning = overall.status === 'warning';

    const barColor = isExceeded
      ? 'bg-rose-500'
      : isWarning
      ? 'bg-amber-500'
      : 'bg-indigo-600';

    return (
      <div
        onClick={onOpenModal}
        className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-sm cursor-pointer hover:border-indigo-100 transition space-y-2 group"
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <Target className="w-3.5 h-3.5 text-indigo-600" />
            <span>本月预算进度</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-md font-semibold ${
                isExceeded
                  ? 'bg-rose-100 text-rose-700'
                  : isWarning
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-indigo-50 text-indigo-700'
              }`}
            >
              {isExceeded ? '已超支' : isWarning ? '接近限额' : '正常'} {overall.usage_percent}%
            </span>
          </div>

          <div className="text-right text-[11px]">
            <span className="text-slate-400">已花 </span>
            <span className="font-bold text-slate-700">{formatCurrency(overall.spent_amount)}</span>
            <span className="text-slate-400"> / </span>
            <span className="font-semibold text-slate-500">{formatCurrency(overall.budget_amount)}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, overall.usage_percent)}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <div>
            {isExceeded ? (
              <span className="text-rose-500 font-semibold">
                ⚠️ 已超支 {formatCurrency(Math.abs(overall.remaining_amount))}
              </span>
            ) : (
              <span>
                剩余可用 <strong className="text-slate-700">{formatCurrency(overall.remaining_amount)}</strong>
              </span>
            )}
          </div>
          <div>
            {!isExceeded && overall.days_remaining > 0 && (
              <span>
                建议日均 ≤ <strong className="text-indigo-600">{formatCurrency(overall.daily_allowance)}</strong> (还剩{overall.days_remaining}天)
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= 完整报表面板 (StatsView 中呈现) =================
  if (!overall) {
    return (
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm text-center space-y-3">
        <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
          <Target className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-800">尚未设置月度支出预算</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto leading-relaxed">
            设置月度整体开销上限与分类子预算，实时掌控消费进度并获得每日推荐可用额度。
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenModal}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 shadow-md shadow-indigo-200 transition"
        >
          <Plus className="w-4 h-4" />
          <span>立即设定本月预算</span>
        </button>
      </div>
    );
  }

  const isExceeded = overall.status === 'exceeded';
  const isWarning = overall.status === 'warning';

  const barColor = isExceeded
    ? 'bg-rose-500'
    : isWarning
    ? 'bg-amber-500'
    : 'bg-gradient-to-r from-indigo-500 to-indigo-600';

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-indigo-50 text-indigo-600 rounded-xl">
            <Target className="w-4 h-4" />
          </span>
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            月度预算与消耗进度
          </h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
              isExceeded
                ? 'bg-rose-100 text-rose-700'
                : isWarning
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {isExceeded ? (
              <>
                <Flame className="w-3 h-3 text-rose-600" />
                <span>超支 {overall.usage_percent}%</span>
              </>
            ) : isWarning ? (
              <>
                <AlertTriangle className="w-3 h-3 text-amber-600" />
                <span>预警 {overall.usage_percent}%</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                <span>健康 {overall.usage_percent}%</span>
              </>
            )}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenModal}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
        >
          <Settings className="w-3.5 h-3.5" />
          <span>调整预算</span>
        </button>
      </div>

      {/* Overview Numbers Card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
        <div>
          <div className="text-[11px] text-slate-400 font-medium">月度总预算</div>
          <div className="text-base font-bold text-slate-800 mt-0.5">
            {formatCurrency(overall.budget_amount)}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-medium">当月已支出</div>
          <div className="text-base font-bold text-rose-600 mt-0.5">
            {formatCurrency(overall.spent_amount)}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-medium">
            {isExceeded ? '已超额支出' : '当月剩余额度'}
          </div>
          <div
            className={`text-base font-bold mt-0.5 ${
              isExceeded ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {formatCurrency(Math.abs(overall.remaining_amount))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-slate-400 font-medium">
            今日建议可用 (还剩{overall.days_remaining}天)
          </div>
          <div className="text-base font-bold text-indigo-600 mt-0.5">
            {isExceeded ? '建议刹车克制' : `${formatCurrency(overall.daily_allowance)} / 天`}
          </div>
        </div>
      </div>

      {/* Main Progress Bar */}
      <div className="space-y-1.5">
        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden p-0.5">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, overall.usage_percent)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-slate-400 px-0.5">
          <span>0%</span>
          <span>预警线 {categories[0]?.alert_threshold || 80}%</span>
          <span>100% ({formatCurrency(overall.budget_amount)})</span>
        </div>
      </div>

      {/* Category Sub-Budgets */}
      {categories.length > 0 && (
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-700">分类专项子预算</h4>
            <span className="text-[11px] text-slate-400">已监控 {categories.length} 个分类</span>
          </div>

          <div className="space-y-2">
            {(categoriesExpanded ? categories : categories.slice(0, 3)).map((cat) => {
              const catExceeded = cat.status === 'exceeded';
              const catWarning = cat.status === 'warning';
              const catBar = catExceeded
                ? 'bg-rose-500'
                : catWarning
                ? 'bg-amber-500'
                : 'bg-indigo-500';

              return (
                <div
                  key={cat.category_id}
                  className="p-3 bg-slate-50/70 rounded-2xl border border-slate-100/80 space-y-1.5"
                >
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white shadow-sm flex-shrink-0"
                        style={{ backgroundColor: cat.category_color || '#6366f1' }}
                      >
                        <DynamicIcon name={cat.category_icon} className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="font-semibold text-slate-700">{cat.category_name}</span>
                      {catExceeded ? (
                        <span className="text-[10px] bg-rose-100 text-rose-700 font-bold px-1.5 py-0.2 rounded">
                          超支
                        </span>
                      ) : catWarning ? (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">
                          预警
                        </span>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="font-bold text-slate-800">{formatCurrency(cat.spent_amount)}</span>
                      <span className="text-slate-400">/</span>
                      <span className="text-slate-500">{formatCurrency(cat.budget_amount)}</span>
                      <span className="text-slate-400">({cat.usage_percent}%)</span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${catBar}`}
                      style={{ width: `${Math.min(100, cat.usage_percent)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {categories.length > 3 && (
            <button
              type="button"
              onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              className="w-full py-1.5 text-center text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center justify-center gap-1 transition"
            >
              <span>{categoriesExpanded ? '收起分类预算' : `展开其余 ${categories.length - 3} 个分类预算`}</span>
              {categoriesExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      )}

      {/* Unbudgeted categories hint */}
      {unbudgeted.length > 0 && (
        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
          <span>还有 {unbudgeted.length} 个产生开销的分类尚未设专项预算</span>
          <button
            type="button"
            onClick={onOpenModal}
            className="text-indigo-600 hover:underline font-medium"
          >
            去配置
          </button>
        </div>
      )}
    </div>
  );
};
