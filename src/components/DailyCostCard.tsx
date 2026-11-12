import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  TrendingDown,
  TrendingUp,
  Flame,
  CalendarClock,
  Receipt,
  Package,
} from 'lucide-react';
import { formatCurrency } from '../api';
import { OverviewData } from '../types';

interface Props {
  dailyCost: OverviewData['daily_cost'];
}

export const DailyCostCard: React.FC<Props> = ({ dailyCost: dc }) => {
  const [showAmortizedDetails, setShowAmortizedDetails] = useState(false);

  const totalDc = dc.total_daily_cost || 0;
  const pct = (part: number) => (totalDc > 0 ? Math.round((part / totalDc) * 1000) / 10 : 0);
  const amortizedPct = pct(dc.amortized_daily_cost);
  const variablePct = pct(dc.variable_daily_cost);
  const itemPct = totalDc > 0 ? Math.max(0, Math.round((100 - amortizedPct - variablePct) * 10) / 10) : 0;

  return (
    <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <Flame className="w-4 h-4 text-amber-500" />
            <span>每日生活成本</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            统计区间 {dc.month_start.slice(5)} ~ {dc.month_end.slice(5)} · 共 {dc.elapsed_days} 天
          </div>
        </div>

        {dc.mom_percent !== null ? (
          <div
            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 ${
              dc.mom_diff <= 0
                ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                : 'bg-rose-50 text-rose-600 border border-rose-100'
            }`}
          >
            {dc.mom_diff <= 0 ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <TrendingUp className="w-3.5 h-3.5" />
            )}
            <span>
              较上月 {formatCurrency(dc.mom_diff, true)} ({dc.mom_percent > 0 ? `+${dc.mom_percent}` : dc.mom_percent}%)
            </span>
          </div>
        ) : (
          <span className="px-2.5 py-1 rounded-xl text-[11px] bg-slate-50 text-slate-400 border border-slate-100">
            上月暂无对比数据
          </span>
        )}
      </div>

      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-black text-slate-900 tracking-tight">
            {formatCurrency(dc.total_daily_cost)}
          </span>
          <span className="text-xs font-medium text-slate-400">/ 天</span>
        </div>
        {dc.prev_total_daily_cost > 0 && (
          <span className="text-[11px] text-slate-400">
            上月日均 {formatCurrency(dc.prev_total_daily_cost)} / 天
          </span>
        )}
      </div>

      {/* 三项构成比例条 */}
      {totalDc > 0 && (
        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
          {dc.amortized_daily_cost > 0 && (
            <div
              className="h-full bg-amber-500 transition-all duration-500"
              style={{ width: `${amortizedPct}%` }}
              title={`固定开销摊销 ${amortizedPct}%`}
            />
          )}
          {dc.variable_daily_cost > 0 && (
            <div
              className="h-full bg-rose-500 transition-all duration-500"
              style={{ width: `${variablePct}%` }}
              title={`日常流水 ${variablePct}%`}
            />
          )}
          {dc.item_daily_cost > 0 && (
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${itemPct}%` }}
              title={`大件摊薄 ${itemPct}%`}
            />
          )}
        </div>
      )}

      {/* 三项拆分明细 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-100/80">
          <div className="flex items-center justify-between text-[11px] font-semibold text-amber-700">
            <span className="flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              固定开销摊销
            </span>
            <span className="font-mono">{amortizedPct}%</span>
          </div>
          <div className="text-base font-bold text-slate-800 mt-1">
            {formatCurrency(dc.amortized_daily_cost)}
            <span className="text-[10px] font-normal text-slate-400"> /天</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            本月分摊 {formatCurrency(dc.amortized_month_total)} · {dc.amortized_items.length} 笔生效
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-rose-50/70 border border-rose-100/80">
          <div className="flex items-center justify-between text-[11px] font-semibold text-rose-600">
            <span className="flex items-center gap-1">
              <Receipt className="w-3.5 h-3.5" />
              日常流水消费
            </span>
            <span className="font-mono">{variablePct}%</span>
          </div>
          <div className="text-base font-bold text-slate-800 mt-1">
            {formatCurrency(dc.variable_daily_cost)}
            <span className="text-[10px] font-normal text-slate-400"> /天</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {formatCurrency(dc.variable_expense_total)} ÷ {dc.elapsed_days} 天
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100/80">
          <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-600">
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5" />
              持物大件摊薄
            </span>
            <span className="font-mono">{itemPct}%</span>
          </div>
          <div className="text-base font-bold text-slate-800 mt-1">
            {formatCurrency(dc.item_daily_cost)}
            <span className="text-[10px] font-normal text-slate-400"> /天</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            在役 {dc.active_item_count} 件大件日耗总和
          </div>
        </div>
      </div>

      {/* 生效中的固定开销摊销明细 */}
      {dc.amortized_items.length > 0 ? (
        <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
          <button
            type="button"
            onClick={() => setShowAmortizedDetails((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs font-semibold text-slate-600"
          >
            <span>本月生效的固定摊销明细 ({dc.amortized_items.length})</span>
            {showAmortizedDetails ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showAmortizedDetails && (
            <div className="divide-y divide-slate-200/60 pt-1">
              {dc.amortized_items.map((item) => (
                <div key={item.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-700 truncate">
                      {item.remark || item.category_name || '分摊支出'}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      总额 {formatCurrency(item.total_amount)} · {item.amortize_days}天 ({item.start_date} ~ {item.end_date}) · 本月计 {item.overlap_days}天
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-amber-600">{formatCurrency(item.daily_amount)}/天</div>
                    <div className="text-[10px] text-slate-400">本月 {formatCurrency(item.month_amount)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="text-[11px] text-slate-400 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
          💡 记账房租、宽带、年费会员等固定开销时，可选择「按月/季/年分摊」，自动平滑计入每日生活成本。
        </div>
      )}

      {dc.excluded_expense_total > 0 && (
        <div className="text-[11px] text-slate-400">
          已自动排除本月 {formatCurrency(dc.excluded_expense_total)} 的大件/不计入流水，避免与大件摊薄重复计算。
        </div>
      )}
    </div>
  );
};
