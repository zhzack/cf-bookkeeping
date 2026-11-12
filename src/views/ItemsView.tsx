import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Package, 
  Clock, 
  Sparkles, 
  TrendingDown, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Wrench, 
  ShieldCheck, 
  ShieldAlert,
  Snowflake, 
  Heart, 
  ShoppingBag, 
  Flame, 
  MapPin, 
  Layers,
  ChevronDown,
  ChevronUp,
  X
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { ItemWithStats, ItemSummary, Account, ItemExpense } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { AddItemExpenseModal } from '../components/AddItemExpenseModal';
import { ConvertWishlistModal } from '../components/ConvertWishlistModal';

interface Props {
  onOpenAddItem: (isWishlist?: boolean) => void;
  onEditItem: (item: ItemWithStats) => void;
  refreshTrigger: number;
  accounts: Account[];
}

export const ItemsView: React.FC<Props> = ({ 
  onOpenAddItem, 
  onEditItem, 
  refreshTrigger,
  accounts,
}) => {
  // 主Tab：持物资产 vs 心愿冷静单
  const [activeMainTab, setActiveMainTab] = useState<'assets' | 'wishlist'>('assets');
  
  const [items, setItems] = useState<ItemWithStats[]>([]);
  const [summary, setSummary] = useState<ItemSummary>({
    total_spent: 0,
    active_daily_cost: 0,
    using_count: 0,
    wishlist_count: 0,
    retired_count: 0,
    sold_count: 0,
    total_count: 0,
  });
  const [filterStatus, setFilterStatus] = useState<string>(''); // '' | 'using' | 'idle' | 'retired' | 'sold'
  const [sortBy, setSortBy] = useState<'cost_desc' | 'days_desc' | 'date_desc'>('cost_desc');
  const [loading, setLoading] = useState(false);

  // 展开查看配件明细的物品 ID
  const [expandedExpensesItemId, setExpandedExpensesItemId] = useState<string | null>(null);

  // 弹窗状态
  const [expenseModalItem, setExpenseModalItem] = useState<ItemWithStats | null>(null);
  const [convertModalItem, setConvertModalItem] = useState<ItemWithStats | null>(null);

  const loadItems = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ items: ItemWithStats[]; summary: ItemSummary }>('/api/items');
      setItems(res.items);
      setSummary(res.summary);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [refreshTrigger]);

  // 快捷状态切换（标记闲置、标记损坏、恢复在用）
  const handleQuickStatus = async (item: ItemWithStats, newStatus: 'using' | 'idle' | 'retired' | 'sold', e: React.MouseEvent) => {
    e.stopPropagation();
    if (newStatus === 'retired') {
      const reason = prompt('请输入损坏或淘汰原因（例如: 电池老化、屏幕损坏）：') || '';
      const date = prompt('请输入损坏或停用日期 (YYYY-MM-DD)：', new Date().toISOString().slice(0, 10));
      if (!date) return;
      await fetchApi(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'retired', retired_date: date, remark: reason || item.remark }),
      });
    } else if (newStatus === 'sold') {
      const priceStr = prompt('请输入二手转卖收回的金额 (元)：', '500');
      if (!priceStr) return;
      const date = prompt('请输入卖出日期 (YYYY-MM-DD)：', new Date().toISOString().slice(0, 10));
      if (!date) return;
      await fetchApi(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'sold',
          retired_date: date,
          resale_price: Math.round(parseFloat(priceStr) * 100),
        }),
      });
    } else if (newStatus === 'idle') {
      if (!confirm(`将“${item.name}”标记为闲置吃灰吗？`)) return;
      await fetchApi(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'idle' }),
      });
    } else if (newStatus === 'using') {
      await fetchApi(`/api/items/${item.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'using' }),
      });
    }
    loadItems();
  };

  // 放弃心愿单（解毒拔草）
  const handleAbandonWishlist = async (item: ItemWithStats, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`恭喜理智战胜冲动！确定放弃拔草“${item.name}”并省下 ${formatCurrency(item.price)} 吗？`)) return;
    await fetchApi(`/api/items/${item.id}`, { method: 'DELETE' });
    loadItems();
  };

  // 删除某条配件支出
  const handleDeleteExpense = async (itemId: string, expId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除该笔配件/维护支出吗？')) return;
    await fetchApi(`/api/items/${itemId}/expenses/${expId}`, { method: 'DELETE' });
    loadItems();
  };

  // 资产列表（排除心愿单）
  const assetItems = items.filter((i) => i.status !== 'wishlist');
  const wishlistItems = items.filter((i) => i.status === 'wishlist');

  // 根据筛选和排序过滤资产
  const filteredAssets = assetItems.filter((i) => {
    if (!filterStatus) return true;
    return i.status === filterStatus;
  }).sort((a, b) => {
    if (sortBy === 'cost_desc') return b.cost_per_day - a.cost_per_day;
    if (sortBy === 'days_desc') return b.days_used - a.days_used;
    return new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime();
  });

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 顶部主选项卡切换：持物资产 vs 冷静期心愿单 */}
      <div className="flex bg-slate-200/70 p-1 rounded-2xl shadow-inner">
        <button
          onClick={() => setActiveMainTab('assets')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
            activeMainTab === 'assets'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>持物资产 ({assetItems.length})</span>
        </button>

        <button
          onClick={() => setActiveMainTab('wishlist')}
          className={`flex-1 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition ${
            activeMainTab === 'wishlist'
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Snowflake className="w-4 h-4" />
          <span>冷静期心愿单 ({wishlistItems.length})</span>
        </button>
      </div>

      {/* ======================= TAB 1: 持物资产专区 ======================= */}
      {activeMainTab === 'assets' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* 资产日均黑卡总览 */}
          <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 rounded-3xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-indigo-300 font-semibold tracking-wider uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>在役大件每日总消耗</span>
              </div>
              <button
                onClick={() => onOpenAddItem(false)}
                className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-md shadow-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>录入大件</span>
              </button>
            </div>

            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-3xl sm:text-4xl font-black tracking-tight">
                {formatCurrency(summary.active_daily_cost)}
              </span>
              <span className="text-xs text-indigo-200 font-medium">/ 每天</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-indigo-800/60 text-center">
              <div>
                <div className="text-[11px] text-indigo-300">总投入 (含配件维护)</div>
                <div className="text-xs sm:text-sm font-bold text-white mt-0.5">
                  {formatCurrency(summary.total_spent)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-indigo-300">服役在用</div>
                <div className="text-xs sm:text-sm font-bold text-emerald-400 mt-0.5">
                  {summary.using_count} 件
                </div>
              </div>
              <div>
                <div className="text-[11px] text-indigo-300">闲置/已淘汰/已售</div>
                <div className="text-xs sm:text-sm font-bold text-amber-300 mt-0.5">
                  {assetItems.length - summary.using_count} 件
                </div>
              </div>
            </div>
          </div>

          {/* 筛选与排序 */}
          <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium w-full sm:w-auto overflow-x-auto no-scrollbar">
              <button
                onClick={() => setFilterStatus('')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  !filterStatus ? 'bg-white text-indigo-600 font-bold shadow-sm' : 'text-slate-500'
                }`}
              >
                全部 ({assetItems.length})
              </button>
              <button
                onClick={() => setFilterStatus('using')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  filterStatus === 'using' ? 'bg-white text-emerald-600 font-bold shadow-sm' : 'text-slate-500'
                }`}
              >
                服役中 ({summary.using_count})
              </button>
              <button
                onClick={() => setFilterStatus('idle')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  filterStatus === 'idle' ? 'bg-white text-purple-600 font-bold shadow-sm' : 'text-slate-500'
                }`}
              >
                闲置吃灰
              </button>
              <button
                onClick={() => setFilterStatus('retired')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  filterStatus === 'retired' ? 'bg-white text-rose-600 font-bold shadow-sm' : 'text-slate-500'
                }`}
              >
                已损坏 ({summary.retired_count})
              </button>
              <button
                onClick={() => setFilterStatus('sold')}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap transition ${
                  filterStatus === 'sold' ? 'bg-white text-amber-600 font-bold shadow-sm' : 'text-slate-500'
                }`}
              >
                已转售 ({summary.sold_count})
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-500 self-end sm:self-auto">
              <span className="text-[11px] text-slate-400">排序:</span>
              <select
                value={sortBy}
                onChange={(e: any) => setSortBy(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none"
              >
                <option value="cost_desc">日均成本 从高到低</option>
                <option value="days_desc">服役天数 从多到少</option>
                <option value="date_desc">购买时间 最近在前</option>
              </select>
            </div>
          </div>

          {/* 物品卡片列表 */}
          {loading ? (
            <div className="text-center py-12 text-slate-400 text-xs">加载持物数据中...</div>
          ) : filteredAssets.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
              <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">暂无符合条件的物品</p>
              <button
                onClick={() => onOpenAddItem(false)}
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>录入第一件大件</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {filteredAssets.map((item) => {
                const isUsing = item.status === 'using';
                const isIdle = item.status === 'idle';
                const isRetired = item.status === 'retired';
                const isSold = item.status === 'sold';
                const hasExpenses = (item.expenses && item.expenses.length > 0);
                const isExpensesOpen = expandedExpensesItemId === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => onEditItem(item)}
                    className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:border-indigo-100 transition group cursor-pointer space-y-3.5"
                  >
                    {/* 头部信息与多重徽章 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 font-bold shadow-sm">
                          <DynamicIcon
                            name={
                              item.category === '数码科技'
                                ? 'Laptop'
                                : item.category === '家电厨卫'
                                ? 'Tv'
                                : item.category === '居家家具'
                                ? 'Armchair'
                                : item.category === '穿搭首饰'
                                ? 'Watch'
                                : item.category === '运动出行'
                                ? 'Car'
                                : 'Package'
                            }
                            className="w-5 h-5"
                          />
                        </div>

                        <div>
                          <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                            <span>{item.name}</span>

                            {/* 价值等级勋章 (持物特色) */}
                            {item.value_level === 'ultra' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                                🚀 已赚翻
                              </span>
                            )}
                            {item.value_level === 'high' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                                💎 超值利器
                              </span>
                            )}
                            {item.value_level === 'low' && isUsing && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                                ⏳ 回本中
                              </span>
                            )}

                            {/* 质保状态徽章 */}
                            {item.warranty_status === 'valid' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-0.5">
                                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                <span>在保 (剩{item.warranty_days_left}天)</span>
                              </span>
                            )}
                            {item.warranty_status === 'expired' && (
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">
                                已过保
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                            <span>{item.purchase_date} 购入</span>
                            {item.location && (
                              <span className="flex items-center gap-0.5 text-slate-500">
                                <MapPin className="w-3 h-3" />
                                <span>{item.location}</span>
                              </span>
                            )}
                            <span>· {item.category}</span>
                          </div>
                        </div>
                      </div>

                      {/* 状态大标签 */}
                      <div className="flex-shrink-0">
                        {isUsing && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            服役 {item.days_used} 天
                          </span>
                        )}
                        {isIdle && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            💤 闲置吃灰
                          </span>
                        )}
                        {isRetired && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            损坏淘汰 · 服役 {item.days_used} 天
                          </span>
                        )}
                        {isSold && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            已出二手 · 服役 {item.days_used} 天
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 核心日均计算展示 */}
                    <div className="bg-slate-50/80 rounded-2xl p-4 flex items-center justify-between border border-slate-100">
                      <div>
                        <span className="text-[11px] font-medium text-slate-400">每日使用成本</span>
                        <div className="flex items-baseline gap-1 mt-0.5">
                          <span className="text-2xl sm:text-3xl font-black text-indigo-600">
                            ¥{(item.cost_per_day / 100).toFixed(2)}
                          </span>
                          <span className="text-xs font-medium text-slate-400">/ 天</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[11px] font-medium text-slate-400">持有真实总成本</span>
                        <div className="text-sm font-bold text-slate-800 mt-0.5">
                          {formatCurrency(item.net_cost)}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          原价 {formatCurrency(item.price)}
                          {item.additional_cost > 0 && ` + 配件/维护 ${formatCurrency(item.additional_cost)}`}
                          {isSold && ` - 回血 ${formatCurrency(item.resale_price)}`}
                        </div>
                      </div>
                    </div>

                    {/* 回本进度条 */}
                    {item.progress_percent != null && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            预期服役 {item.expected_days} 天 (已完成 {item.progress_percent}%)
                          </span>
                          <span className="font-medium">
                            {item.days_used >= (item.expected_days || 0)
                              ? '🎉 超预期服役，超值赚翻！'
                              : `还差 ${(item.expected_days || 0) - item.days_used} 天达成目标`}
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              item.progress_percent >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${Math.min(item.progress_percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* 配件与维护支出明细展折叠区域 */}
                    {hasExpenses && (
                      <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 text-xs space-y-2">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedExpensesItemId(isExpensesOpen ? null : item.id);
                          }}
                          className="flex items-center justify-between font-semibold text-slate-600 cursor-pointer"
                        >
                          <span className="flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-indigo-500" />
                            <span>配件与维护记录 ({item.expenses?.length}笔 · 共 {formatCurrency(item.additional_cost)})</span>
                          </span>
                          {isExpensesOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </div>

                        {isExpensesOpen && (
                          <div className="divide-y divide-slate-100 pt-1 space-y-1.5">
                            {item.expenses?.map((exp) => (
                              <div key={exp.id} className="pt-1.5 flex items-center justify-between">
                                <div>
                                  <span className="font-medium text-slate-700">{exp.description}</span>
                                  <span className="text-[10px] text-slate-400 ml-2">{exp.date}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800">+{formatCurrency(exp.amount)}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDeleteExpense(item.id, exp.id, e)}
                                    className="text-slate-300 hover:text-red-500 p-0.5 rounded transition"
                                    title="删除该笔支出"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 备注 */}
                    {item.remark && (
                      <div className="text-xs text-slate-500 bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/60 flex items-start gap-1.5">
                        <span className="flex-shrink-0">📝</span>
                        <span>{item.remark}</span>
                      </div>
                    )}

                    {/* 底部快捷操作工具栏 */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-50 flex-wrap gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* 一键追加维护/配件费 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpenseModalItem(item);
                          }}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                        >
                          <Plus className="w-3 h-3" />
                          <span>追加配件/维修</span>
                        </button>

                        {isUsing && (
                          <>
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatus(item, 'idle', e)}
                              className="px-2 py-1 bg-slate-100 hover:bg-purple-50 text-slate-600 hover:text-purple-700 rounded-lg text-xs font-medium transition"
                            >
                              标闲置
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatus(item, 'retired', e)}
                              className="px-2 py-1 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-lg text-xs font-medium transition"
                            >
                              标损坏
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleQuickStatus(item, 'sold', e)}
                              className="px-2 py-1 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-600 rounded-lg text-xs font-medium transition"
                            >
                              标卖出
                            </button>
                          </>
                        )}

                        {(isRetired || isSold || isIdle) && (
                          <button
                            type="button"
                            onClick={(e) => handleQuickStatus(item, 'using', e)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-semibold transition"
                          >
                            恢复在用
                          </button>
                        )}
                      </div>

                      <span className="text-[11px] text-indigo-500 font-semibold group-hover:underline flex items-center gap-0.5">
                        <span>编辑档案</span>
                        <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================= TAB 2: 冷静期心愿单专区 ======================= */}
      {activeMainTab === 'wishlist' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* 心愿单顶部治愈卡片 */}
          <div className="bg-gradient-to-tr from-cyan-900 via-indigo-950 to-blue-900 rounded-3xl p-6 text-white shadow-xl">
            <div className="flex items-center justify-between">
              <div className="text-xs text-cyan-200 font-semibold tracking-wider uppercase flex items-center gap-1.5">
                <Snowflake className="w-3.5 h-3.5 text-cyan-300" />
                <span>抗冲动消费 · 心愿冷静期</span>
              </div>
              <button
                onClick={() => onOpenAddItem(true)}
                className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1 transition shadow-md shadow-cyan-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>加入心愿</span>
              </button>
            </div>

            <div className="mt-3">
              <div className="text-xs text-cyan-200">心愿单预估总预算</div>
              <div className="text-3xl font-black mt-0.5">
                {formatCurrency(wishlistItems.reduce((sum, cur) => sum + cur.price, 0))}
              </div>
            </div>

            <p className="text-xs text-cyan-100/80 mt-4 pt-3 border-t border-cyan-800/60 leading-relaxed">
              💡 心理学研究表明：7 天冷静期能阻断 70% 的非必要冲动消费。冷静倒计时结束后，如果仍然心动，再自信拔草！
            </p>
          </div>

          {/* 心愿单列表 */}
          {wishlistItems.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
              <Heart className="w-12 h-12 text-indigo-200 mx-auto mb-3" />
              <p className="text-slate-600 font-bold text-sm">心愿单空空如也</p>
              <p className="text-slate-400 text-xs mt-1">下次看中昂贵大件时，先别急着付款，先加进心愿单冷静几天</p>
              <button
                onClick={() => onOpenAddItem(true)}
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>添加第一个心愿</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {wishlistItems.map((item) => {
                const isCooledDown = (item.cooling_left_days || 0) === 0;

                return (
                  <div
                    key={item.id}
                    onClick={() => onEditItem(item)}
                    className={`bg-white rounded-3xl p-5 border shadow-sm transition group cursor-pointer space-y-3.5 ${
                      isCooledDown ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-100 hover:border-indigo-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 font-bold ${
                          isCooledDown ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-50 text-indigo-600'
                        }`}>
                          <DynamicIcon name={item.category === '数码科技' ? 'Laptop' : item.category === '家电厨卫' ? 'Tv' : 'Package'} className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-800">{item.name}</div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            {item.purchase_date} 种草 · {item.category}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-base font-black text-slate-800">
                          {formatCurrency(item.price)}
                        </div>
                        <div className="text-[10px] text-slate-400">预估售价</div>
                      </div>
                    </div>

                    {/* 冷静期进度与状态展示 */}
                    <div className={`rounded-2xl p-3.5 border ${
                      isCooledDown ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'
                    }`}>
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                        <span className="flex items-center gap-1.5">
                          {isCooledDown ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                              <span className="text-emerald-800">🎉 冷静期已满！依然心动吗？</span>
                            </>
                          ) : (
                            <>
                              <Snowflake className="w-4 h-4 text-indigo-500 animate-spin" />
                              <span className="text-indigo-800">正在冷静中：还剩 {item.cooling_left_days} 天</span>
                            </>
                          )}
                        </span>
                        <span className="text-slate-400 text-[11px]">
                          设定 {item.cooling_days || 7} 天
                        </span>
                      </div>

                      {/* 冷静进度条 */}
                      <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isCooledDown ? 'bg-emerald-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${item.cooling_percent || 0}%` }}
                        />
                      </div>
                    </div>

                    {item.remark && (
                      <div className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        💭 种草理由: {item.remark}
                      </div>
                    )}

                    {/* 拔草与解毒操作 */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-50">
                      <button
                        type="button"
                        onClick={(e) => handleAbandonWishlist(item, e)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition"
                      >
                        🌿 解毒拔草 (放弃购买)
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConvertModalItem(item);
                        }}
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition ${
                          isCooledDown
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
                        }`}
                      >
                        <ShoppingBag className="w-3.5 h-3.5" />
                        <span>已深思熟虑 · 确认买入</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 弹窗：追加配件/维修支出 */}
      <AddItemExpenseModal
        isOpen={Boolean(expenseModalItem)}
        onClose={() => setExpenseModalItem(null)}
        onSuccess={loadItems}
        item={expenseModalItem}
        accounts={accounts}
      />

      {/* 弹窗：心愿单拔草转为已购 */}
      <ConvertWishlistModal
        isOpen={Boolean(convertModalItem)}
        onClose={() => setConvertModalItem(null)}
        onSuccess={loadItems}
        item={convertModalItem}
        accounts={accounts}
      />
    </div>
  );
};
