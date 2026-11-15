import React, { useState, useEffect, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Calendar,
  Package,
  CreditCard,
  Upload,
  Search,
  SlidersHorizontal,
  Tag,
  X,
  CheckSquare,
  FolderKanban,
  Wand2,
  Sparkles,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Account, Category, OverviewData, Transaction, TransactionPhoto } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';
import { DailyCostCard } from '../components/DailyCostCard';
import { PhotoLightbox } from '../components/PhotoLightbox';
import { BatchCategoryModal } from '../components/BatchCategoryModal';
import { RuleManageModal } from '../components/RuleManageModal';
import {
  ScenePickerModal,
  PRESET_SCENES,
  SceneBatchScope,
  SceneFilterPayload,
} from '../components/ScenePickerModal';
import { getLocalTodayStr } from '../utils/image';

interface Props {
  onOpenAddModal: () => void;
  onOpenAiRecord?: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onConvertToItem?: (tx: Transaction) => void;
  onConvertToCard?: (tx: Transaction) => void;
  onOpenImport?: () => void;
  accounts?: Account[];
  categories?: Category[];
  refreshTrigger: number;
  onCategoriesChanged?: () => void;
}

export const TransactionsView: React.FC<Props> = ({
  onOpenAddModal,
  onOpenAiRecord,
  onEditTransaction,
  onConvertToItem,
  onConvertToCard,
  onOpenImport,
  accounts: propAccounts,
  categories: propCategories,
  refreshTrigger,
  onCategoriesChanged,
}) => {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [filterType, setFilterType] = useState<string>(''); // '' | 'expense' | 'income' | 'transfer'
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchAllMonths, setSearchAllMonths] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [filterScene, setFilterScene] = useState('');

  const [accounts, setAccounts] = useState<Account[]>(propAccounts || []);
  const [categories, setCategories] = useState<Category[]>(propCategories || []);
  const [availableScenes, setAvailableScenes] = useState<string[]>(PRESET_SCENES);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ total_expense: 0, total_income: 0, balance: 0, total_count: 0 });
  const [dailyCost, setDailyCost] = useState<OverviewData['daily_cost'] | null>(null);
  const [sceneTargetTx, setSceneTargetTx] = useState<Transaction | null>(null);
  const [sceneBatchFilter, setSceneBatchFilter] = useState<SceneFilterPayload | null>(null);
  const [sceneSelectedIds, setSceneSelectedIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalIds, setCatModalIds] = useState<string[]>([]);
  const [catBatchFilter, setCatBatchFilter] = useState<SceneFilterPayload | null>(null);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [batchNotice, setBatchNotice] = useState('');

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [lightboxLoading, setLightboxLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (propAccounts) setAccounts(propAccounts);
  }, [propAccounts]);

  useEffect(() => {
    if (propCategories) setCategories(propCategories);
  }, [propCategories]);

  useEffect(() => {
    fetchApi<{ scenes: string[] }>('/api/transactions/scenes')
      .then((res) => {
        if (Array.isArray(res.scenes) && res.scenes.length > 0) {
          setAvailableScenes(res.scenes);
        }
      })
      .catch(() => {});

    if (!propAccounts) {
      fetchApi<{ accounts: Account[] }>('/api/accounts')
        .then((res) => setAccounts(res.accounts || []))
        .catch(() => {});
    }
    if (!propCategories) {
      fetchApi<{ categories: Category[] }>('/api/categories')
        .then((res) => setCategories(res.categories || []))
        .catch(() => {});
    }
  }, [refreshTrigger]);

  const hasActiveFilter = Boolean(
    debouncedSearch ||
      searchAllMonths ||
      filterType ||
      filterCategoryId ||
      filterAccountId ||
      filterScene
  );

  const activeAdvancedCount =
    (filterCategoryId ? 1 : 0) + (filterAccountId ? 1 : 0) + (filterScene ? 1 : 0);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set('month', searchAllMonths ? 'all' : currentMonth);
      qs.set('limit', hasActiveFilter ? '250' : '150');
      if (filterType) qs.set('type', filterType);
      if (filterCategoryId) qs.set('category_id', filterCategoryId);
      if (filterAccountId) qs.set('account_id', filterAccountId);
      if (filterScene) qs.set('scene', filterScene);
      if (debouncedSearch) qs.set('search', debouncedSearch);

      const url = `/api/transactions?${qs.toString()}`;
      const localToday = getLocalTodayStr();
      const [data, overview] = await Promise.all([
        fetchApi<{ transactions: Transaction[]; summary: any }>(url),
        searchAllMonths
          ? Promise.resolve(null)
          : fetchApi<OverviewData>(`/api/stats/overview?month=${currentMonth}&today=${localToday}`),
      ]);
      setTransactions(data.transactions);
      setSummary(data.summary);
      if (overview) {
        setDailyCost(overview.daily_cost);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [
    currentMonth,
    searchAllMonths,
    filterType,
    filterCategoryId,
    filterAccountId,
    filterScene,
    debouncedSearch,
    hasActiveFilter,
  ]);

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
  }, [loadData, refreshTrigger]);

  const resetAllFilters = () => {
    setSearchInput('');
    setDebouncedSearch('');
    setSearchAllMonths(false);
    setFilterType('');
    setFilterCategoryId('');
    setFilterAccountId('');
    setFilterScene('');
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
      setTransactions((prev) =>
        prev.map((item) => (item.id === info.txId ? { ...item, scene: info.scene } : item))
      );
    } else {
      setBatchNotice(
        info.scene
          ? `已批量为 ${info.updatedCount} 笔流水标记消费场景「${info.scene}」`
          : `已清除 ${info.updatedCount} 笔流水的消费场景`
      );
      loadData();
    }
  };

  const buildCurrentFilterPayload = (): SceneFilterPayload => ({
    month: searchAllMonths ? 'all' : currentMonth,
    type: filterType || undefined,
    category_id: filterCategoryId || undefined,
    account_id: filterAccountId || undefined,
    scene: filterScene || undefined,
    search: debouncedSearch || undefined,
  });

  const openFilterBatchScene = () => {
    setSceneTargetTx(null);
    setSceneSelectedIds([]);
    setSceneBatchFilter(buildCurrentFilterPayload());
  };

  const openFilterBatchCategory = () => {
    setCatModalIds([]);
    setCatBatchFilter(buildCurrentFilterPayload());
    setCatModalOpen(true);
  };

  const toggleSelectTx = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const selectableTxIds = transactions.filter((t) => t.type !== 'transfer').map((t) => t.id);
  const allSelected =
    selectableTxIds.length > 0 && selectableTxIds.every((id) => selectedIds.includes(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectableTxIds);
    }
  };

  const changeMonth = (delta: number) => {
    if (searchAllMonths) setSearchAllMonths(false);
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
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => changeMonth(-1)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-base font-bold text-slate-800">
              {searchAllMonths
                ? '全部历史账单'
                : `${currentMonth.split('-')[0]} 年 ${currentMonth.split('-')[1]} 月`}
            </span>
            <button
              onClick={() => changeMonth(1)}
              className="p-1.5 rounded-full hover:bg-slate-100 text-slate-500 transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {onOpenImport && (
              <button
                type="button"
                onClick={onOpenImport}
                className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center gap-1 transition"
                title="导入微信或支付宝账单"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>导入账单</span>
              </button>
            )}

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
        </div>

        {/* 关键数字 */}
        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100">
          <div>
            <div className="text-[11px] font-medium text-slate-400">
              {hasActiveFilter ? '筛选支出' : '总支出'}
            </div>
            <div className="text-sm sm:text-base font-bold text-rose-500 mt-0.5">
              {formatCurrency(summary.total_expense)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">
              {hasActiveFilter ? '筛选收入' : '总收入'}
            </div>
            <div className="text-sm sm:text-base font-bold text-emerald-500 mt-0.5">
              {formatCurrency(summary.total_income)}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-400">
              {hasActiveFilter ? `匹配 (${summary.total_count}笔)` : '月结余'}
            </div>
            <div className={`text-sm sm:text-base font-bold mt-0.5 ${summary.balance >= 0 ? 'text-slate-800' : 'text-rose-500'}`}>
              {formatCurrency(summary.balance)}
            </div>
          </div>
        </div>

        {/* 快速搜索与多维筛选 */}
        <div className="pt-2 border-t border-slate-100 space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索备注、商户、分类、账户、金额或消费场景..."
                className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:outline-none transition"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setDebouncedSearch('');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  title="清空搜索"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSearchAllMonths((v) => !v)}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap transition ${
                searchAllMonths
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              title="切换搜索仅看当前月还是全部历史月份"
            >
              {searchAllMonths ? '全月份' : '仅本月'}
            </button>

            <button
              type="button"
              onClick={() => setShowFilterPanel((v) => !v)}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1 whitespace-nowrap transition ${
                showFilterPanel || activeAdvancedCount > 0
                  ? 'bg-teal-50 text-teal-700 border-teal-200'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">筛选</span>
              {activeAdvancedCount > 0 && (
                <span className="px-1.5 py-0.2 bg-teal-600 text-white text-[10px] rounded-full">
                  {activeAdvancedCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectionMode((prev) => !prev);
                setSelectedIds([]);
              }}
              className={`px-2.5 py-2 rounded-xl text-xs font-semibold border flex items-center gap-1 whitespace-nowrap transition ${
                selectionMode
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
              }`}
              title="勾选多笔流水批量改分类或标场景"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">多选</span>
            </button>

            <button
              type="button"
              onClick={() => setRuleModalOpen(true)}
              className="px-2.5 py-2 rounded-xl text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600 flex items-center gap-1 whitespace-nowrap transition"
              title="编辑或添加自动分类与场景匹配规则"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">规则</span>
            </button>

            {onOpenAiRecord && (
              <button
                type="button"
                onClick={onOpenAiRecord}
                className="px-2.5 py-2 rounded-xl text-xs font-bold border bg-gradient-to-r from-violet-50 to-indigo-50 text-indigo-700 border-indigo-200 hover:border-indigo-300 flex items-center gap-1 whitespace-nowrap transition shadow-sm"
                title="一句话输入或拍照小票记账"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">AI 记账</span>
              </button>
            )}
          </div>

          {selectionMode && (
            <div className="p-2.5 bg-indigo-50/90 border border-indigo-200 rounded-2xl flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-50 transition"
                >
                  {allSelected ? '取消全选' : `全选当前 (${selectableTxIds.length})`}
                </button>
                <span className="text-indigo-800 font-medium">
                  已选 <span className="font-bold">{selectedIds.length}</span> 笔
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setCatBatchFilter(null);
                    setCatModalIds(selectedIds);
                    setCatModalOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 transition disabled:opacity-40"
                >
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span>批量改分类</span>
                </button>
                <button
                  type="button"
                  disabled={selectedIds.length === 0}
                  onClick={() => {
                    setSceneTargetTx(null);
                    setSceneBatchFilter(null);
                    setSceneSelectedIds(selectedIds);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1 transition disabled:opacity-40"
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>批量标场景</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectionMode(false);
                    setSelectedIds([]);
                  }}
                  className="text-xs text-slate-500 hover:text-slate-800 px-1.5"
                >
                  完成
                </button>
              </div>
            </div>
          )}

          {showFilterPanel && (
            <div className="p-3 bg-slate-50/90 rounded-2xl border border-slate-200/80 space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">分类</label>
                  <select
                    value={filterCategoryId}
                    onChange={(e) => setFilterCategoryId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">全部分类</option>
                    <option value="__uncategorized__">未分类</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.type === 'income' ? '[收] ' : '[支] '}
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">账户</label>
                  <select
                    value={filterAccountId}
                    onChange={(e) => setFilterAccountId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="">全部账户</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">消费场景</label>
                  <select
                    value={filterScene}
                    onChange={(e) => setFilterScene(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="">全部场景</option>
                    <option value="__none__">仅看未标记场景</option>
                    {availableScenes.map((sc) => (
                      <option key={sc} value={sc}>
                        {sc}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] text-slate-500">
                <span>提示：点每笔流水旁的「场景」或开启顶部「多选」可批量处理</span>
                <div className="flex items-center gap-3 flex-wrap">
                  {hasActiveFilter && summary.total_count > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={openFilterBatchCategory}
                        className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <FolderKanban className="w-3 h-3" />
                        <span>批量改分类</span>
                      </button>
                      <button
                        type="button"
                        onClick={openFilterBatchScene}
                        className="text-teal-700 font-semibold hover:underline inline-flex items-center gap-1"
                      >
                        <Tag className="w-3 h-3" />
                        <span>批量标场景 ({summary.total_count}笔)</span>
                      </button>
                    </>
                  )}
                  {hasActiveFilter && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-rose-600 font-semibold hover:underline"
                    >
                      清空全部筛选
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {hasActiveFilter && summary.total_count > 0 && !showFilterPanel && (
            <div className="flex items-center justify-between flex-wrap gap-2 text-[11px] px-1">
              <span className="text-slate-500">
                当前共筛选出 <span className="font-semibold text-slate-700">{summary.total_count}</span> 笔记录
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={openFilterBatchCategory}
                  className="text-indigo-600 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <FolderKanban className="w-3 h-3" />
                  <span>批量改分类</span>
                </button>
                <button
                  type="button"
                  onClick={openFilterBatchScene}
                  className="text-teal-700 font-semibold hover:underline inline-flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  <span>批量标场景</span>
                </button>
              </div>
            </div>
          )}

          {batchNotice && (
            <div className="px-3 py-2 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-700 flex items-center justify-between gap-2">
              <span>{batchNotice}</span>
              <button
                type="button"
                onClick={() => setBatchNotice('')}
                className="text-teal-500 hover:text-teal-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 每日生活成本统计看板（未激活搜索筛选时在首页展示） */}
      {!hasActiveFilter && dailyCost && <DailyCostCard dailyCost={dailyCost} />}

      {/* 流水明细列表 */}
      {loading ? (
        <div className="text-center py-12 text-slate-400 text-xs">加载中...</div>
      ) : Object.keys(groupedTransactions).length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
          <Calendar className="w-12 h-12 text-slate-200 mx-auto" />
          <p className="text-slate-400 text-sm">
            {hasActiveFilter
              ? searchAllMonths
                ? '未找到符合当前搜索或筛选条件的账单'
                : '本月未找到匹配记录，可试试切换到「全月份」搜索'
              : '本月暂无记账明细'}
          </p>
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {hasActiveFilter && !searchAllMonths && (
              <button
                type="button"
                onClick={() => setSearchAllMonths(true)}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold rounded-xl transition"
              >
                在全部月份中搜索
              </button>
            )}
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={resetAllFilters}
                className="px-4 py-2 bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-semibold rounded-xl transition"
              >
                重置筛选条件
              </button>
            ) : (
              <button
                onClick={onOpenAddModal}
                className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>记一笔</span>
              </button>
            )}
          </div>
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

                    const isSelected = selectedIds.includes(tx.id);

                    return (
                      <div
                        key={tx.id}
                        onClick={() => {
                          if (selectionMode) {
                            if (!isTransfer) toggleSelectTx(tx.id);
                          } else {
                            onEditTransaction(tx);
                          }
                        }}
                        className={`py-2.5 flex items-center justify-between gap-2 group cursor-pointer hover:bg-slate-50/70 -mx-2 px-2 rounded-xl transition ${
                          selectionMode && isSelected ? 'bg-indigo-50/60' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {selectionMode && (
                            <input
                              type="checkbox"
                              disabled={isTransfer}
                              checked={isSelected}
                              onChange={() => toggleSelectTx(tx.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 flex-shrink-0 disabled:opacity-30"
                            />
                          )}
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

                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                              <span>
                                {isTransfer
                                  ? `${tx.account_name} ➔ ${tx.destination_account_name}`
                                  : tx.category_name || '未分类'}
                              </span>
                              {!isTransfer && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSceneTargetTx(tx);
                                  }}
                                  className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md border inline-flex items-center gap-0.5 transition ${
                                    tx.scene
                                      ? 'bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100'
                                      : 'bg-slate-50 text-slate-400 border-slate-200/80 hover:text-teal-600 hover:border-teal-300'
                                  }`}
                                  title="点击标记或修改消费场景"
                                >
                                  <Tag className="w-2.5 h-2.5" />
                                  <span>{tx.scene || '场景'}</span>
                                </button>
                              )}
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
                              {tx.card_name && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-purple-50 text-purple-600 border border-purple-200/70">
                                  💳 {tx.card_name}
                                </span>
                              )}
                              {isExpense && Boolean(tx.exclude_daily_cost) && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-slate-100 text-slate-500">
                                  不计入日均
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                              {!isTransfer && <span>{tx.account_name}</span>}
                              {tx.remark && (
                                <span className="text-slate-500 font-normal truncate max-w-[200px] sm:max-w-[280px]">
                                  · {tx.remark}
                                </span>
                              )}
                              <span>· {tx.transaction_time.slice(11, 16)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
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

                          {isExpense && !tx.card_id && !tx.item_id && onConvertToCard && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onConvertToCard(tx);
                              }}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-600 flex items-center gap-1 transition sm:opacity-0 sm:group-hover:opacity-100"
                              title="转为会员充值卡或计次卡"
                            >
                              <CreditCard className="w-3 h-3" />
                              <span className="hidden sm:inline">设为充值卡</span>
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
                            className={`text-sm sm:text-base font-bold flex items-center gap-1 ${
                              isExpense
                                ? 'text-rose-500'
                                : isIncome
                                ? 'text-emerald-500'
                                : 'text-indigo-600'
                            }`}
                          >
                            <span>
                              {isExpense ? '-' : isIncome ? '+' : ''}
                              {formatCurrency(tx.amount, false, tx.currency || 'CNY')}
                            </span>
                            {tx.type === 'transfer' && tx.target_amount && (
                              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md">
                                → {formatCurrency(tx.target_amount, false, tx.destination_currency || 'CNY')}
                              </span>
                            )}
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

      <ScenePickerModal
        transaction={sceneTargetTx}
        selectedIds={sceneSelectedIds}
        batchFilter={sceneBatchFilter}
        availableScenes={availableScenes}
        onClose={() => {
          setSceneTargetTx(null);
          setSceneSelectedIds([]);
          setSceneBatchFilter(null);
        }}
        onSaved={(info) => {
          handleSceneSaved(info);
          if (info.scope === 'ids') {
            setSelectionMode(false);
            setSelectedIds([]);
          }
        }}
      />

      <BatchCategoryModal
        isOpen={catModalOpen}
        categories={categories}
        selectedIds={catModalIds}
        batchFilter={catBatchFilter}
        onClose={() => {
          setCatModalOpen(false);
          setCatModalIds([]);
          setCatBatchFilter(null);
        }}
        onSuccess={(msg) => {
          setBatchNotice(msg);
          setSelectionMode(false);
          setSelectedIds([]);
          loadData();
        }}
        onCategoriesChanged={() => {
          onCategoriesChanged?.();
          loadData();
        }}
      />

      <RuleManageModal
        isOpen={ruleModalOpen}
        accounts={accounts}
        categories={categories}
        onClose={() => setRuleModalOpen(false)}
        onChanged={() => {
          onCategoriesChanged?.();
          loadData();
        }}
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

