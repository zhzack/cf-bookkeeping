import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, Calendar, Package } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { OverviewData, Transaction, TransactionPhoto } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { DailyCostCard } from '../components/DailyCostCard';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { getLocalTodayStr } from '../utils/image';

interface Props {
  onOpenAddModal: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onConvertToItem?: (tx: Transaction) => void;
  refreshTrigger: number;
}

export const TransactionsView: React.FC<Props> = ({
  onOpenAddModal,
  onEditTransaction,
  onConvertToItem,
  refreshTrigger,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState<string>(''); // '' | 'expense' | 'income' | 'transfer'
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ total_expense: 0, total_income: 0, balance: 0, total_count: 0 });
  const [dailyCost, setDailyCost] = useState<OverviewData['daily_cost'] | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      let url = `/api/transactions?month=${currentMonth}`;
      if (filterType) url += `&type=${filterType}`;
      const localToday = getLocalTodayStr();
      const [data, overview] = await Promise.all([
        fetchApi<{ transactions: Transaction[]; summary: any }>(url),
        fetchApi<OverviewData>(`/api/stats/overview?month=${currentMonth}&today=${localToday}`),
      ]);
      setTransactions(data.transactions);
      setSummary(data.summary);
      setDailyCost(overview.daily_cost);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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

  useEffect(() => {
    loadData();
  }, [currentMonth, filterType, refreshTrigger]);

  const changeMonth = (delta: number) => {
    const [year, month] = currentMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleDelete = async (tx: Transaction, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定要删除这条账目记录吗？')) return;
    try {
      await fetchApi(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      loadData();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  // 按日期归类
  const groupedTransactions: { [dateStr: string]: Transaction[] } = {};
  for (const tx of transactions) {
    const day = tx.transaction_time.slice(0, 10);
    if (!groupedTransactions[day]) groupedTransactions[day] = [];
    groupedTransactions[day].push(tx);
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 顶部月份切换与月度总览 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-slate-800">
              {currentMonth.split('-')[0]} 年 {currentMonth.split('-')[1]} 月
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex bg-slate-100 p-0.5 rounded-xl text-xs font-medium">
            <button
              onClick={() => setFilterType('')}
              className={`px-2.5 py-1 rounded-lg transition ${!filterType ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              全部
            </button>
            <button
              onClick={() => setFilterType('expense')}
              className={`px-2.5 py-1 rounded-lg transition ${filterType === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'}`}
            >
              支出
            </button>
            <button
              onClick={() => setFilterType('income')}
              className={`px-2.5 py-1 rounded-lg transition ${filterType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
            >
              收入
            </button>
          </div>
        </div>

        {/* 关键数字 */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
          <div>
            <div className="text-[11px] font-medium text-slate-400">总支出</div>
            <div className="text-sm sm:text-base font-bold text-rose-500 mt-0.5">
              {formatCurrency(summary.total_expense)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">总收入</div>
            <div className="text-sm sm:text-base font-bold text-emerald-500 mt-0.5">
              {formatCurrency(summary.total_income)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">月结余</div>
            <div className={`text-sm sm:text-base font-bold mt-0.5 ${summary.balance >= 0 ? 'text-slate-800' : 'text-rose-500'}`}>
              {formatCurrency(summary.balance)}
            </div>
          </div>
        </div>
      </div>

      {/* 每日生活成本统计看板（首页展示） */}
      {dailyCost && <DailyCostCard dailyCost={dailyCost} />}

      {/* 流水明细列表 */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">加载中...</div>
      ) : Object.keys(groupedTransactions).length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">本月暂无记账明细</p>
          <button
            onClick={onOpenAddModal}
            className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>记一笔</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(groupedTransactions).map(([dateStr, items]) => {
            const dayExpense = items
              .filter((i) => i.type === 'expense')
              .reduce((sum, cur) => sum + cur.amount, 0);

            return (
              <div key={dateStr} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                {/* 每日分组小标题 */}
                <div className="flex items-center justify-between text-xs text-slate-400 font-medium pb-2.5 mb-2.5 border-b border-slate-50">
                  <span>{dateStr}</span>
                  {dayExpense > 0 && <span>支出: {formatCurrency(dayExpense)}</span>}
                </div>

                {/* 流水项目 */}
                <div className="divide-y divide-slate-50">
                  {items.map((tx) => {
                    const isExpense = tx.type === 'expense';
                    const isIncome = tx.type === 'income';
                    const isTransfer = tx.type === 'transfer';

                    return (
                      <div
                        key={tx.id}
                        onClick={() => onEditTransaction(tx)}
                        className="py-2.5 flex items-center justify-between group cursor-pointer hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                            style={{
                              backgroundColor: isTransfer
                                ? '#6366F1'
                                : tx.category_color || (isIncome ? '#10B981' : '#F59E0B'),
                            }}
                          >
                            <DynamicIcon
                              name={isTransfer ? 'ArrowRightLeft' : tx.category_icon}
                              className="w-5 h-5 text-white"
                            />
                          </div>

                          <div>
                            <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                              <span>
                                {isTransfer
                                  ? `${tx.account_name} ➔ ${tx.destination_account_name}`
                                  : tx.category_name || '未分类'}
                              </span>
                              {isExpense && tx.amortize_days && tx.amortize_days > 1 && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-amber-50 text-amber-600 border border-amber-200/70">
                                  分摊{tx.amortize_days}天
                                </span>
                              )}
                              {isExpense && tx.item_id && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-indigo-50 text-indigo-600 border border-indigo-200/70">
                                  📦 {tx.item_name ? `大件·${tx.item_name}` : '已关联大件'}
                                </span>
                              )}
                              {isExpense && Boolean(tx.exclude_daily_cost) && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-500">
                                  不计入日均
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                              {!isTransfer && <span>{tx.account_name}</span>}
                              {tx.remark && <span className="text-slate-500 font-normal">· {tx.remark}</span>}
                              <span>· {tx.transaction_time.slice(11, 16)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5">
                          {isExpense && !tx.item_id && onConvertToItem && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onConvertToItem(tx);
                              }}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center gap-1 transition sm:opacity-0 sm:group-hover:opacity-100"
                              title="转为持物大件并补充信息"
                            >
                              <Package className="w-3 h-3" />
                              <span className="hidden sm:inline">设为大件</span>
                            </button>
                          )}

                          {(tx.photo_count || 0) > 0 && tx.first_photo_id && (
                            <button
                              type="button"
                              onClick={(e) => handleOpenPhotos(tx, e)}
                              className="relative w-9 h-9 rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400 flex-shrink-0 transition"
                              title="查看账单照片"
                            >
                              <img
                                src={`/api/transactions/photos/${tx.first_photo_id}`}
                                alt="账单缩略图"
                                className="w-full h-full object-cover"
                              />
                              {(tx.photo_count || 0) > 1 && (
                                <span className="absolute bottom-0 right-0 px-1 bg-black/65 text-white text-[9px] font-semibold rounded-tl-md">
                                  +{tx.photo_count}
                                </span>
                              )}
                            </button>
                          )}

                          <span
                            className={`text-sm sm:text-base font-bold ${
                              isExpense
                                ? 'text-rose-500'
                                : isIncome
                                ? 'text-emerald-500'
                                : 'text-indigo-600'
                            }`}
                          >
                            {isExpense ? '-' : isIncome ? '+' : ''}
                            {formatCurrency(tx.amount)}
                          </span>

                          <button
                            onClick={(e) => handleDelete(tx, e)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 p-1 rounded transition text-xs"
                            title="删除"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

