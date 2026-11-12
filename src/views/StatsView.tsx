import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
  X,
  Tag,
  ArrowUpDown,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { OverviewData, Transaction, TransactionPhoto } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { DailyCostCard } from '../components/DailyCostCard';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { ScenePickerModal, PRESET_SCENES, SceneBatchScope } from '../components/ScenePickerModal';
import { getLocalTodayStr } from '../utils/image';

type StatsPeriod = 'week' | 'month' | 'year';

interface DetailTarget {
  kind: 'category' | 'scene';
  id: string;
  title: string;
  color: string;
  icon?: string;
  totalAmount: number;
  count: number;
}

interface Props {
  refreshTrigger: number;
  onEditTransaction?: (tx: Transaction) => void;
}

function shiftDateDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function shiftMonthStr(monthStr: string, delta: number): string {
  const [y, m] = monthStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getTrendKeyDateRange(key: string): { start: string; end: string } {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [yy, mm] = key.split('-').map(Number);
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    return {
      start: `${key}-01`,
      end: `${key}-${String(lastDay).padStart(2, '0')}`,
    };
  }
  return { start: key, end: key };
}

export const StatsView: React.FC<Props> = ({ refreshTrigger, onEditTransaction }) => {
  const todayStr = getLocalTodayStr();
  const [period, setPeriod] = useState<StatsPeriod>('month');
  const [weekAnchor, setWeekAnchor] = useState<string>(todayStr);
  const [monthAnchor, setMonthAnchor] = useState<string>(() => todayStr.slice(0, 7));
  const [yearAnchor, setYearAnchor] = useState<string>(() => todayStr.slice(0, 4));

  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoverTrendKey, setHoverTrendKey] = useState<string | null>(null);
  const [pinnedTrendKey, setPinnedTrendKey] = useState<string | null>(null);
  const [pinnedDayRows, setPinnedDayRows] = useState<Transaction[]>([]);
  const [pinnedDayLoading, setPinnedDayLoading] = useState(false);
  const [pinnedDaySort, setPinnedDaySort] = useState<'time_desc' | 'amount_desc'>('time_desc');

  // 分类/场景明细抽屉
  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [detailRows, setDetailRows] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSort, setDetailSort] = useState<'time_desc' | 'amount_desc'>('time_desc');
  const [sceneTargetTx, setSceneTargetTx] = useState<Transaction | null>(null);
  const [availableScenes, setAvailableScenes] = useState<string[]>(PRESET_SCENES);

  // 照片预览
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxLoading, setLightboxLoading] = useState(false);

  const currentAnchor =
    period === 'week' ? weekAnchor : period === 'year' ? yearAnchor : monthAnchor;

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const localToday = getLocalTodayStr();
      const qs = new URLSearchParams({
        period,
        date: currentAnchor,
        today: localToday,
      });
      const res = await fetchApi<OverviewData>(`/api/stats/overview?${qs.toString()}`);
      setData(res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [period, currentAnchor]);

  useEffect(() => {
    setHoverTrendKey(null);
    setPinnedTrendKey(null);
    setPinnedDayRows([]);
  }, [period, currentAnchor]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview, refreshTrigger]);

  useEffect(() => {
    fetchApi<{ scenes: string[] }>('/api/transactions/scenes')
      .then((res) => {
        if (Array.isArray(res.scenes) && res.scenes.length > 0) {
          setAvailableScenes(res.scenes);
        }
      })
      .catch(() => {});
  }, [refreshTrigger]);

  const loadDetailRows = useCallback(
    async (target: DetailTarget, sortMode: 'time_desc' | 'amount_desc') => {
      if (!data?.period_start || !data?.period_end) return;
      setDetailLoading(true);
      try {
        const qs = new URLSearchParams({
          start_date: data.period_start,
          end_date: data.period_end,
          type: 'expense',
          sort: sortMode,
          limit: '300',
        });
        if (target.kind === 'category') {
          qs.set('category_id', target.id);
        } else {
          qs.set('scene', target.id);
        }
        const res = await fetchApi<{ transactions: Transaction[] }>(
          `/api/transactions?${qs.toString()}`
        );
        setDetailRows(res.transactions || []);
      } catch (err) {
        console.error(err);
        setDetailRows([]);
      } finally {
        setDetailLoading(false);
      }
    },
    [data?.period_start, data?.period_end]
  );

  useEffect(() => {
    if (detailTarget) {
      loadDetailRows(detailTarget, detailSort);
    }
  }, [detailTarget, detailSort, loadDetailRows, refreshTrigger]);

  const loadPinnedDayRows = useCallback(
    async (trendKey: string, sortMode: 'time_desc' | 'amount_desc') => {
      const { start, end } = getTrendKeyDateRange(trendKey);
      setPinnedDayLoading(true);
      try {
        const qs = new URLSearchParams({
          start_date: start,
          end_date: end,
          type: 'expense',
          sort: sortMode,
          limit: '200',
        });
        const res = await fetchApi<{ transactions: Transaction[] }>(
          `/api/transactions?${qs.toString()}`
        );
        setPinnedDayRows(res.transactions || []);
      } catch (err) {
        console.error(err);
        setPinnedDayRows([]);
      } finally {
        setPinnedDayLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (pinnedTrendKey) {
      loadPinnedDayRows(pinnedTrendKey, pinnedDaySort);
    } else {
      setPinnedDayRows([]);
    }
  }, [pinnedTrendKey, pinnedDaySort, loadPinnedDayRows, refreshTrigger]);

  const changePeriodStep = (delta: number) => {
    if (period === 'week') {
      setWeekAnchor((prev) => shiftDateDays(prev, delta * 7));
    } else if (period === 'year') {
      setYearAnchor((prev) => String(Number(prev) + delta));
    } else {
      setMonthAnchor((prev) => shiftMonthStr(prev, delta));
    }
  };

  const handleOpenPhotos = async (tx: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    setLightboxOpen(true);
    setLightboxIndex(0);
    setLightboxImages([]);
    setLightboxLoading(true);
    try {
      const res = await fetchApi<{ photos: TransactionPhoto[] }>(`/api/transactions/${tx.id}/photos`);
      setLightboxImages((res.photos || []).map((p) => p.data_url));
    } catch (err: any) {
      alert(err.message || '加载照片失败');
      setLightboxOpen(false);
    } finally {
      setLightboxLoading(false);
    }
  };

  const handleSceneSaved = (info: {
    txId?: string;
    scene: string | null;
    scope: SceneBatchScope;
    updatedCount: number;
  }) => {
    if (info.scene && !availableScenes.includes(info.scene)) {
      setAvailableScenes((prev) => [info.scene!, ...prev]);
    }
    if (info.scope === 'single' && info.txId) {
      setDetailRows((prev) =>
        prev.map((item) => (item.id === info.txId ? { ...item, scene: info.scene } : item))
      );
      setPinnedDayRows((prev) =>
        prev.map((item) => (item.id === info.txId ? { ...item, scene: info.scene } : item))
      );
    } else {
      if (detailTarget) {
        loadDetailRows(detailTarget, detailSort);
      }
      if (pinnedTrendKey) {
        loadPinnedDayRows(pinnedTrendKey, pinnedDaySort);
      }
    }
    loadOverview();
  };

  const renderExpenseRow = (tx: Transaction, showCategoryChip: boolean) => (
    <div
      key={tx.id}
      onClick={() => {
        if (onEditTransaction) {
          onEditTransaction(tx);
        }
      }}
      className={`py-3 flex items-center justify-between gap-2 rounded-xl px-2 -mx-2 transition ${
        onEditTransaction ? 'cursor-pointer hover:bg-slate-50' : ''
      }`}
    >
      <div className="min-w-0 space-y-0.5">
        <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
          <span className="truncate max-w-[200px] sm:max-w-[260px]">
            {tx.remark || tx.category_name || '消费支出'}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSceneTargetTx(tx);
            }}
            className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md border inline-flex items-center gap-0.5 transition ${
              tx.scene
                ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:text-teal-600'
            }`}
          >
            <Tag className="w-2.5 h-2.5" />
            <span>{tx.scene || '标场景'}</span>
          </button>
        </div>
        <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
          <span>{tx.transaction_time.slice(0, 16)}</span>
          <span>· {tx.account_name}</span>
          {showCategoryChip && tx.category_name && <span>· {tx.category_name}</span>}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {(tx.photo_count || 0) > 0 && tx.first_photo_id && (
          <button
            type="button"
            onClick={(e) => handleOpenPhotos(tx, e)}
            className="relative w-8 h-8 rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-400"
            title="查看照片"
          >
            <img
              src={`/api/transactions/photos/${tx.first_photo_id}`}
              alt="账单照片"
              className="w-full h-full object-cover"
            />
          </button>
        )}
        <span className="text-sm font-bold text-rose-500">-{formatCurrency(tx.amount)}</span>
      </div>
    </div>
  );

  if (!data) {
    return <div className="text-center py-12 text-slate-400 text-xs">加载统计中...</div>;
  }

  const trendPoints =
    data.trend && data.trend.length > 0
      ? data.trend
      : data.daily_trend.map((d) => ({
          key: d.day,
          label: d.day.slice(8, 10),
          expense: d.expense,
          income: d.income,
        }));

  const maxTrendExpense = Math.max(...trendPoints.map((d) => d.expense), 100);
  const nonZeroPoints = trendPoints.filter((d) => d.expense > 0);
  const activePointKey = hoverTrendKey || pinnedTrendKey;
  const selectedPoint =
    trendPoints.find((d) => d.key === activePointKey) ||
    (nonZeroPoints.length > 0
      ? nonZeroPoints.reduce((max, cur) => (cur.expense > max.expense ? cur : max), nonZeroPoints[0])
      : null);
  const pinnedPoint = pinnedTrendKey ? trendPoints.find((d) => d.key === pinnedTrendKey) : null;
  const pinnedTotalExpense =
    pinnedPoint?.expense ?? pinnedDayRows.reduce((sum, item) => sum + item.amount, 0);

  const periodNoun = period === 'week' ? '本周' : period === 'year' ? '本年' : '本月';
  const trendTitle =
    period === 'year'
      ? `${yearAnchor} 年每月支出趋势`
      : period === 'week'
      ? '本周每日支出趋势'
      : '本月每日支出趋势';

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

      {/* 统计周期切换（周 / 月 / 年）与时间翻页 */}
      <div className="bg-white rounded-2xl p-3 space-y-2.5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-semibold">
            {(
              [
                { key: 'week', label: '按周' },
                { key: 'month', label: '按月' },
                { key: 'year', label: '按年' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setPeriod(tab.key)}
                className={`px-3 py-1 rounded-lg transition ${
                  period === tab.key
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              const now = getLocalTodayStr();
              setWeekAnchor(now);
              setMonthAnchor(now.slice(0, 7));
              setYearAnchor(now.slice(0, 4));
            }}
            className="text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50 px-2.5 py-1 rounded-lg transition"
          >
            回到当前
          </button>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-50">
          <button
            type="button"
            onClick={() => changePeriodStep(-1)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <div className="text-sm font-bold text-slate-800">
              {data.period_label || `${data.month} 财务报表`}
            </div>
            {data.period_start && data.period_end && (
              <div className="text-[11px] text-slate-400">
                {data.period_start} ~ {data.period_end}
                {loading ? ' · 更新中...' : ''}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => changePeriodStep(1)}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 每日生活成本核心看板 */}
      <DailyCostCard dailyCost={data.daily_cost} period={period} />

      {/* 周期收支概括 */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {periodNoun}收支概括
          </h3>
          <span
            className={`text-xs font-semibold ${
              data.month_summary.surplus >= 0 ? 'text-slate-600' : 'text-rose-500'
            }`}
          >
            结余 {formatCurrency(data.month_summary.surplus)}
          </span>
        </div>
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

      {/* 支出走势图（周/月每日趋势、年每月趋势；点击柱子或选日期展开当日支出详情） */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {trendTitle}
            </h3>
            <span className="text-[11px] text-slate-400">
              {period === 'year' ? '点击柱子看当月支出详情' : '点击柱子或选日期看当日详情'}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {period !== 'year' && (
              <input
                type="date"
                aria-label="选择日期查看支出详情"
                value={pinnedTrendKey && /^\d{4}-\d{2}-\d{2}$/.test(pinnedTrendKey) ? pinnedTrendKey : ''}
                min={data.period_start}
                max={data.period_end}
                onChange={(e) => {
                  const val = e.target.value;
                  setPinnedTrendKey(val || null);
                }}
                className="px-2 py-1 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-medium text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            )}
            {selectedPoint ? (
              <div className="px-2.5 py-1 rounded-xl bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                {selectedPoint.key}：支出 {formatCurrency(selectedPoint.expense)}
                {selectedPoint.income > 0 ? ` · 收入 ${formatCurrency(selectedPoint.income)}` : ''}
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">暂无支出记录</span>
            )}
          </div>
        </div>

        {nonZeroPoints.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            {periodNoun}暂无支出趋势数据
          </div>
        ) : (
          <div
            className="overflow-x-auto pb-1 no-scrollbar"
            onMouseLeave={() => setHoverTrendKey(null)}
          >
            <div
              className="flex items-end gap-1.5 pt-2"
              style={{
                minWidth: trendPoints.length > 15 ? `${trendPoints.length * 24}px` : undefined,
              }}
            >
              {trendPoints.map((d) => {
                const hasExpense = d.expense > 0;
                const heightPercent = hasExpense
                  ? Math.max(Math.round((d.expense / maxTrendExpense) * 100), 6)
                  : 0;
                const isPinned = pinnedTrendKey === d.key;
                const isSelected = selectedPoint?.key === d.key;

                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => {
                      setPinnedDaySort('time_desc');
                      setPinnedTrendKey((prev) => (prev === d.key ? null : d.key));
                    }}
                    onMouseEnter={() => setHoverTrendKey(d.key)}
                    className="flex-1 min-w-[18px] flex flex-col items-center gap-1.5 focus:outline-none group"
                    title={`${d.key} 支出 ${formatCurrency(d.expense)}（点击查看详情）`}
                  >
                    <div className="w-full h-28 flex items-end justify-center px-0.5">
                      {hasExpense ? (
                        <div
                          className={`w-full max-w-[26px] rounded-t-md transition-all duration-300 ${
                            isPinned
                              ? 'bg-indigo-700 ring-2 ring-indigo-300 shadow-sm shadow-indigo-200'
                              : isSelected
                              ? 'bg-indigo-600 shadow-sm shadow-indigo-200'
                              : 'bg-indigo-400/90 group-hover:bg-indigo-500'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />
                      ) : (
                        <div
                          className={`w-full max-w-[26px] rounded-full transition ${
                            isPinned ? 'h-[4px] bg-indigo-500' : 'h-[2px] bg-slate-100'
                          }`}
                        />
                      )}
                    </div>
                    <span
                      className={`text-[10px] leading-none ${
                        isPinned
                          ? 'text-indigo-700 font-extrabold underline underline-offset-2'
                          : isSelected
                          ? 'text-indigo-600 font-bold'
                          : 'text-slate-400'
                      }`}
                    >
                      {d.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {pinnedTrendKey && (
          <div className="mt-2 pt-3.5 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800">
                  {pinnedTrendKey} 支出详情
                </span>
                <span className="text-[11px] font-semibold text-rose-600">
                  共 {formatCurrency(pinnedTotalExpense)}
                </span>
                <span className="text-[11px] text-slate-400">
                  · {pinnedDayRows.length} 笔
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    setPinnedDaySort((prev) =>
                      prev === 'time_desc' ? 'amount_desc' : 'time_desc'
                    )
                  }
                  className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 flex items-center gap-1 transition"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span>{pinnedDaySort === 'time_desc' ? '按时间' : '按金额'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPinnedTrendKey(null)}
                  className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition"
                >
                  收起
                </button>
              </div>
            </div>

            {pinnedDayLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs">加载当日支出明细中...</div>
            ) : pinnedDayRows.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs bg-slate-50/70 rounded-2xl">
                {pinnedTrendKey} 暂无支出记录
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
                {pinnedDayRows.map((tx) => renderExpenseRow(tx, true))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 支出分类排行（可点击查看详情） */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            支出分类排行榜
          </h3>
          <span className="text-[11px] text-slate-400">
            点击分类可查看明细 · 共 {data.category_breakdown.length} 项
          </span>
        </div>

        {data.category_breakdown.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-xs">{periodNoun}暂无支出分类数据</div>
        ) : (
          <div className="space-y-2.5">
            {data.category_breakdown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDetailSort('time_desc');
                  setDetailTarget({
                    kind: 'category',
                    id: item.id,
                    title: item.name,
                    color: item.color || '#6366f1',
                    icon: item.icon,
                    totalAmount: item.total_amount,
                    count: item.count,
                  });
                }}
                className="w-full text-left p-2.5 -mx-1 rounded-2xl hover:bg-slate-50/90 active:bg-slate-100/70 transition space-y-1.5 group"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-lg flex items-center justify-center text-white"
                      style={{ backgroundColor: item.color || '#6366f1' }}
                    >
                      <DynamicIcon name={item.icon} className="w-3.5 h-3.5 text-white" />
                    </div>
                    <span className="font-semibold text-slate-700 group-hover:text-indigo-700 transition">
                      {item.name}
                    </span>
                    <span className="text-slate-400 text-[11px]">({item.count}笔)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800">{formatCurrency(item.total_amount)}</span>
                    <span className="text-slate-400 font-mono text-[11px] w-10 text-right">
                      {item.percentage}%
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition" />
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
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 消费场景分布 */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5 text-teal-600" />
            <span>消费场景统计</span>
          </h3>
          <span className="text-[11px] text-slate-400">
            {data.scene_breakdown && data.scene_breakdown.length > 0
              ? `点击场景查看明细 · 已标记 ${data.scene_breakdown.length} 个场景`
              : '可在明细中为消费标记场景'}
          </span>
        </div>

        {!data.scene_breakdown || data.scene_breakdown.length === 0 ? (
          <div className="text-center py-5 text-slate-400 text-xs">
            {periodNoun}暂无已标记消费场景的支出，可在「明细」页搜索并点击「场景」快速打标
          </div>
        ) : (
          <div className="space-y-2.5">
            {data.scene_breakdown.map((item) => (
              <button
                key={item.scene}
                type="button"
                onClick={() => {
                  setDetailSort('time_desc');
                  setDetailTarget({
                    kind: 'scene',
                    id: item.scene,
                    title: item.scene,
                    color: '#0d9488',
                    totalAmount: item.total_amount,
                    count: item.count,
                  });
                }}
                className="w-full text-left p-2.5 -mx-1 rounded-2xl hover:bg-teal-50/50 transition space-y-1.5 group"
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 font-semibold text-[11px]">
                      {item.scene}
                    </span>
                    <span className="text-slate-400 text-[11px]">({item.count}笔)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-800">{formatCurrency(item.total_amount)}</span>
                    <span className="text-slate-400 font-mono text-[11px] w-10 text-right">
                      {item.percentage}%
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-teal-600 transition" />
                  </div>
                </div>
                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 分类 / 场景支出详情弹窗 */}
      {detailTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setDetailTarget(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[88vh] animate-in fade-in slide-in-from-bottom-4 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                  style={{ backgroundColor: detailTarget.color }}
                >
                  {detailTarget.kind === 'scene' ? (
                    <Tag className="w-5 h-5 text-white" />
                  ) : (
                    <DynamicIcon name={detailTarget.icon} className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">
                    {detailTarget.title} · 支出详情
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {data.period_start} ~ {data.period_end}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDetailTarget(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-4 text-xs">
                <div>
                  <span className="text-slate-400">合计 </span>
                  <span className="font-bold text-rose-600">{formatCurrency(detailTarget.totalAmount)}</span>
                </div>
                <div>
                  <span className="text-slate-400">笔数 </span>
                  <span className="font-semibold text-slate-700">{detailTarget.count} 笔</span>
                </div>
                {detailTarget.count > 0 && (
                  <div>
                    <span className="text-slate-400">均单 </span>
                    <span className="font-semibold text-slate-700">
                      {formatCurrency(Math.round(detailTarget.totalAmount / detailTarget.count))}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setDetailSort((prev) => (prev === 'time_desc' ? 'amount_desc' : 'time_desc'))
                }
                className="px-2.5 py-1 rounded-xl bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 flex items-center gap-1 transition"
              >
                <ArrowUpDown className="w-3 h-3" />
                <span>{detailSort === 'time_desc' ? '按时间排序' : '按金额从大到小'}</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 divide-y divide-slate-100">
              {detailLoading ? (
                <div className="text-center py-10 text-slate-400 text-xs">加载明细中...</div>
              ) : detailRows.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-xs">暂无支出明细</div>
              ) : (
                detailRows.map((tx) => renderExpenseRow(tx, detailTarget.kind === 'scene'))
              )}
            </div>
          </div>
        </div>
      )}

      <ScenePickerModal
        transaction={sceneTargetTx}
        availableScenes={availableScenes}
        onClose={() => setSceneTargetTx(null)}
        onSaved={handleSceneSaved}
      />

      {lightboxOpen && (
        <PhotoLightbox
          images={lightboxImages}
          activeIndex={lightboxIndex}
          onChangeIndex={setLightboxIndex}
          onClose={() => setLightboxOpen(false)}
          loading={lightboxLoading}
        />
      )}
    </div>
  );
};
