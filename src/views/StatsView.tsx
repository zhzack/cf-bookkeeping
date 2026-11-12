import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { OverviewData } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { DailyCostCard } from '../components/DailyCostCard';
import { getLocalTodayStr } from '../utils/image';

interface Props {
  refreshTrigger: number;
}

export const StatsView: React.FC<Props> = ({ refreshTrigger }) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const localToday = getLocalTodayStr();
      const res = await fetchApi<OverviewData>(
        `/api/stats/overview?month=${currentMonth}&today=${localToday}`
      );
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [currentMonth, refreshTrigger]);

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  if (!data) {
    return <div className="text-center py-12 text-slate-400 text-xs">加载统计中...</div>;
  }

  const maxDailyExpense = Math.max(...(data.daily_trend.map((d) => d.expense) || [1]), 100);

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 净资产概览卡片 */}
      <div className="bg-gradient-to-tr from-indigo-700 via-indigo-600 to-indigo-500 rounded-3xl p-6 text-white shadow-lg shadow-indigo-200">
        <div className="text-xs text-indigo-100 font-medium">净资产 (总资产 - 负债)</div>
        <div className="text-3xl font-extrabold mt-1 tracking-tight">
          {formatCurrency(data.assets.net_worth)}
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-indigo-400/40">
          <div>
            <div className="text-[11px] text-indigo-200">总资产</div>
            <div className="text-sm font-semibold mt-0.5">{formatCurrency(data.assets.total_assets)}</div>
          </div>
          <div>
            <div className="text-[11px] text-indigo-200">总负债 (如信用卡欠款)</div>
            <div className="text-sm font-semibold mt-0.5">{formatCurrency(data.assets.total_liabilities)}</div>
          </div>
        </div>
      </div>

      {/* 月份切换 */}
      <div className="bg-white rounded-2xl p-3 flex items-center justify-between border border-slate-100 shadow-sm">
        <button
          onClick={() => changeMonth(-1)}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm font-bold text-slate-800">
          {currentMonth.split('-')[0]} 年 {currentMonth.split('-')[1]} 月 财务报表
        </span>
        <button
          onClick={() => changeMonth(1)}
          className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* 每日生活成本核心看板 */}
      <DailyCostCard dailyCost={data.daily_cost} />

      {/* 当月收支柱状对比 */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">本月收支概括</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 bg-rose-50/70 rounded-2xl border border-rose-100">
            <div className="flex items-center gap-1.5 text-xs text-rose-500 font-semibold mb-1">
              <TrendingDown className="w-4 h-4" />
              <span>总支出</span>
            </div>
            <div className="text-lg font-bold text-rose-600">
              {formatCurrency(data.month_summary.expense)}
            </div>
          </div>

          <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-100">
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold mb-1">
              <TrendingUp className="w-4 h-4" />
              <span>总收入</span>
            </div>
            <div className="text-lg font-bold text-emerald-600">
              {formatCurrency(data.month_summary.income)}
            </div>
          </div>
        </div>
      </div>

      {/* 支出分类排行 */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">支出分类排行榜</h3>
          <span className="text-xs text-slate-400">共 {data.category_breakdown.length} 项</span>
        </div>

        {data.category_breakdown.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">本月暂无支出分类数据</div>
        ) : (
          <div className="space-y-4">
            {data.category_breakdown.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: item.color || '#6366f1' }}
                    >
                      <DynamicIcon name={item.icon} className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-slate-700">{item.name}</span>
                    <span className="text-slate-400 text-[11px]">({item.count}笔)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{formatCurrency(item.total_amount)}</span>
                    <span className="text-slate-400 font-mono text-[11px] w-10 text-right">{item.percentage}%</span>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color || '#6366f1',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 每日支出走势图 */}
      {data.daily_trend.length > 0 && (
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">每日支出趋势</h3>
          <div className="h-32 flex items-end gap-1.5 overflow-x-auto pb-2 pt-4 no-scrollbar">
            {data.daily_trend.map((d) => {
              const heightPercent = Math.max(Math.round((d.expense / maxDailyExpense) * 100), 4);
              return (
                <div key={d.day} className="flex-1 min-w-[20px] flex flex-col items-center gap-1 group relative">
                  {/* Tooltip on hover */}
                  <div className="opacity-0 group-hover:opacity-100 pointer-events-none absolute -top-7 bg-slate-800 text-white text-[10px] py-0.5 px-1.5 rounded whitespace-nowrap z-10 transition">
                    {formatCurrency(d.expense)}
                  </div>
                  <div
                    className="w-full bg-indigo-500 hover:bg-indigo-600 rounded-t-md transition-all duration-300"
                    style={{ height: `${heightPercent}%` }}
                  />
                  <span className="text-[10px] text-slate-400">{d.day.slice(8, 10)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

