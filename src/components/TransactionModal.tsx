import React, { useState, useEffect, useMemo } from 'react';
import { X, Check, Package, CreditCard, Layers, Tags, Wand2 } from 'lucide-react';
import { fetchApi, getCurrencySymbol } from '../api';
import { Account, AutoRule, Category, Transaction, TransactionPhoto } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { PhotoPicker } from './PhotoPicker';
import { ItemFieldsSection, ItemExtraValues } from './ItemFieldsSection';
import { PRESET_SCENES } from './ScenePickerModal';
import { CategoryManageModal } from './CategoryManageModal';
import { RuleManageModal } from './RuleManageModal';
import { matchAutoRules } from '../utils/ruleMatcher';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
  categories: Category[];
  onCategoriesChanged?: () => void;
  initialData?: Transaction | null;
  onConvertToItem?: (tx: Transaction) => void;
  onConvertToCard?: (tx: Transaction) => void;
}

export const TransactionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  accounts,
  categories,
  onCategoriesChanged,
  initialData,
  onConvertToItem,
  onConvertToCard,
}) => {
  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [accountId, setAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [exchangeRateStr, setExchangeRateStr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [time, setTime] = useState('');
  const [remark, setRemark] = useState('');
  const [scene, setScene] = useState('');
  const [costMode, setCostMode] = useState<'daily' | 'amortize' | 'exclude' | 'item'>('daily');
  const [amortizeDays, setAmortizeDays] = useState('30');
  const [amortizeStartDate, setAmortizeStartDate] = useState('');
  const [itemFields, setItemFields] = useState<ItemExtraValues>({
    name: '',
    category: '数码科技',
    expectedDays: 1095,
    warrantyDate: '',
    location: '',
    remark: '',
  });
  const [existingPhotos, setExistingPhotos] = useState<TransactionPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [categorySyncScope, setCategorySyncScope] = useState<
    'single' | 'remark' | 'category' | 'account_category'
  >('single');
  const [syncOnlyUncategorized, setSyncOnlyUncategorized] = useState(false);
  const [syncPreview, setSyncPreview] = useState<{
    total_count: number;
    eligible_count: number;
  } | null>(null);
  const [syncPreviewLoading, setSyncPreviewLoading] = useState(false);
  const [manageCatOpen, setManageCatOpen] = useState(false);
  const [manageRuleOpen, setManageRuleOpen] = useState(false);
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  const loadRules = () => {
    fetchApi<{ rules: AutoRule[] }>('/api/rules')
      .then((res) => setRules(res.rules || []))
      .catch(() => {});
  };

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  // 初始化表单数据
  useEffect(() => {
    if (!isOpen) return;
    const localNow = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setNewPhotos([]);
    setExistingPhotos([]);
    setItemFields({
      name: '',
      category: '数码科技',
      expectedDays: 1095,
      warrantyDate: '',
      location: '',
      remark: '',
    });

    if (initialData) {
      setType(initialData.type);
      setAmountStr((initialData.amount / 100).toString());
      setAccountId(initialData.account_id);
      setDestinationAccountId(initialData.destination_account_id || '');
      setTargetAmountStr(
        initialData.target_amount ? (initialData.target_amount / 100).toString() : ''
      );
      setExchangeRateStr(
        initialData.exchange_rate ? String(initialData.exchange_rate) : ''
      );
      setCategoryId(initialData.category_id || '');
      setTime(initialData.transaction_time.slice(0, 16));
      setRemark(initialData.remark || '');
      setScene(initialData.scene || '');
      if (initialData.exclude_daily_cost) {
        setCostMode('exclude');
        setAmortizeDays('30');
        setAmortizeStartDate(initialData.transaction_time.slice(0, 10));
      } else if (initialData.amortize_days && initialData.amortize_days > 1) {
        setCostMode('amortize');
        setAmortizeDays(String(initialData.amortize_days));
        setAmortizeStartDate(initialData.amortize_start_date || initialData.transaction_time.slice(0, 10));
      } else {
        setCostMode('daily');
        setAmortizeDays('30');
        setAmortizeStartDate(initialData.transaction_time.slice(0, 10));
      }

      if ((initialData.photo_count || 0) > 0) {
        setPhotosLoading(true);
        fetchApi<{ photos: TransactionPhoto[] }>(`/api/transactions/${initialData.id}/photos`)
          .then((res) => setExistingPhotos(res.photos || []))
          .catch((err) => console.error(err))
          .finally(() => setPhotosLoading(false));
      }
    } else {
      setType('expense');
      setAmountStr('');
      setAccountId(accounts[0]?.id || '');
      setDestinationAccountId(accounts[1]?.id || '');
      setTargetAmountStr('');
      setExchangeRateStr('');
      setTime(localNow);
      setRemark('');
      setScene('');
      setCostMode('daily');
      setAmortizeDays('30');
      setAmortizeStartDate(localNow.slice(0, 10));
      // 预选第一个匹配分类
      const firstExp = categories.find((c) => c.type === 'expense');
      setCategoryId(firstExp?.id || '');
    }
    setCategorySyncScope('single');
    setSyncOnlyUncategorized(false);
    setSyncPreview(null);
    setSyncPreviewLoading(false);
    setError('');
  }, [isOpen, initialData, accounts, categories]);

  const buildSyncCategoryPayload = (preview: boolean) => {
    if (
      !initialData ||
      type === 'transfer' ||
      type !== initialData.type ||
      categorySyncScope === 'single'
    ) {
      return null;
    }
    const payload: Record<string, any> = {
      scope: categorySyncScope,
      type,
      target_category_id: categoryId,
      only_uncategorized: syncOnlyUncategorized,
      preview,
    };
    if (categorySyncScope === 'remark') {
      const exactRemark = initialData.remark?.trim() || '';
      if (!exactRemark) return null;
      payload.remark = exactRemark;
    } else if (categorySyncScope === 'category') {
      payload.category_id = initialData.category_id || '__uncategorized__';
    } else if (categorySyncScope === 'account_category') {
      payload.account_id = initialData.account_id;
      payload.category_id = initialData.category_id || '__uncategorized__';
    }
    return payload;
  };

  useEffect(() => {
    if (
      !isOpen ||
      !initialData ||
      type === 'transfer' ||
      type !== initialData.type ||
      categorySyncScope === 'single' ||
      !categoryId
    ) {
      setSyncPreview(null);
      setSyncPreviewLoading(false);
      return;
    }

    const payload = buildSyncCategoryPayload(true);
    if (!payload) {
      setSyncPreview(null);
      return;
    }

    let cancelled = false;
    setSyncPreviewLoading(true);
    fetchApi<{ total_count: number; eligible_count: number }>('/api/transactions/batch-category', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!cancelled) {
          setSyncPreview({
            total_count: res.total_count || 0,
            eligible_count: res.eligible_count || 0,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSyncPreview(null);
      })
      .finally(() => {
        if (!cancelled) setSyncPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, initialData, type, categoryId, categorySyncScope, syncOnlyUncategorized]);

  // 当切换类型时，自动适配分类
  const handleTypeChange = (newType: 'expense' | 'income' | 'transfer') => {
    setType(newType);
    if (newType !== initialData?.type) {
      setCategorySyncScope('single');
      setSyncPreview(null);
    }
    if (newType !== 'transfer') {
      const matchCat = categories.find((c) => c.type === newType);
      setCategoryId(matchCat?.id || '');
    }
  };

  const sourceAccount = accounts.find((a) => a.id === accountId);
  const destAccount = accounts.find((a) => a.id === destinationAccountId);
  const sourceCurrency = sourceAccount?.currency || 'CNY';
  const destCurrency = destAccount?.currency || 'CNY';
  const isCrossCurrencyTransfer =
    type === 'transfer' && sourceCurrency.toUpperCase() !== destCurrency.toUpperCase();

  // 当跨币种转账账户变化时，根据系统汇率推导默认汇率与目标金额
  useEffect(() => {
    if (isCrossCurrencyTransfer && !initialData) {
      const srcRate = sourceAccount?.rate_to_cny || 1.0;
      const dstRate = destAccount?.rate_to_cny || 1.0;
      const defaultRate = Math.round((srcRate / dstRate) * 10000) / 10000;
      setExchangeRateStr(defaultRate.toString());
      const numAmount = parseFloat(amountStr);
      if (!isNaN(numAmount) && numAmount > 0) {
        setTargetAmountStr((numAmount * defaultRate).toFixed(2));
      }
    }
  }, [isCrossCurrencyTransfer, accountId, destinationAccountId]);

  const ruleSuggestion = useMemo(() => {
    if (type === 'transfer' || !remark.trim() || rules.length === 0) return null;
    const match = matchAutoRules(rules, {
      type,
      text: remark,
      accountId,
    });
    const matchedCat = match.categoryId
      ? localCategories.find((c) => c.id === match.categoryId && c.type === type)
      : undefined;
    const matchedScene = match.scene?.trim() || null;
    if (!matchedCat && !matchedScene) return null;

    const needsApply =
      (matchedCat && matchedCat.id !== categoryId) ||
      (matchedScene && matchedScene !== scene.trim());
    const ruleName =
      (matchedCat ? match.matchedCategoryRule?.name : undefined) ||
      (matchedScene ? match.matchedSceneRule?.name : undefined) ||
      '自定义规则';

    return {
      ruleName,
      category: matchedCat || null,
      scene: matchedScene,
      needsApply,
    };
  }, [type, remark, rules, accountId, localCategories, categoryId, scene]);

  if (!isOpen) return null;

  const filteredCategories = localCategories.filter((c) => c.type === type);

  const handleCategoriesManaged = async (created?: Category) => {
    if (created) {
      setLocalCategories((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created]
      );
      if (created.type === type) {
        setCategoryId(created.id);
      }
    }
    try {
      const res = await fetchApi<{ categories: Category[] }>('/api/categories');
      if (Array.isArray(res.categories)) {
        setLocalCategories(res.categories);
      }
    } catch {
      // ignore fallback refresh error
    }
    onCategoriesChanged?.();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const val = parseFloat(amountStr);
    if (isNaN(val) || val <= 0) {
      setError('请输入有效的金额');
      return;
    }
    const cents = Math.round(val * 100);

    if (!accountId) {
      setError('请选择账户');
      return;
    }
    if (type === 'transfer' && !destinationAccountId) {
      setError('请选择转入账户');
      return;
    }
    if (type === 'transfer' && accountId === destinationAccountId) {
      setError('转出账户与转入账户不能相同');
      return;
    }
    if (type !== 'transfer' && !categoryId) {
      setError('请选择分类');
      return;
    }

    const parsedAmortizeDays = Math.round(Number(amortizeDays));
    if (type === 'expense' && costMode === 'amortize') {
      if (isNaN(parsedAmortizeDays) || parsedAmortizeDays < 2 || parsedAmortizeDays > 36500) {
        setError('分摊天数需为 2 ~ 36500 之间的整数');
        return;
      }
    }

    const isNewAsItem = !initialData && type === 'expense' && costMode === 'item';
    if (isNewAsItem && !(itemFields.name || remark).trim()) {
      setError('标记为大件时请填写物品名称');
      return;
    }

    const totalPhotoCount = existingPhotos.length + newPhotos.length;
    if (totalPhotoCount > 3) {
      setError('每笔流水最多上传 3 张照片');
      return;
    }

    let targetCents: number | null = null;
    let exchangeRateNum: number | null = null;
    if (isCrossCurrencyTransfer) {
      const tgt = parseFloat(targetAmountStr);
      if (isNaN(tgt) || tgt <= 0) {
        setError(`请输入转入账户实收金额 (${destCurrency})`);
        return;
      }
      targetCents = Math.round(tgt * 100);
      const exRate = parseFloat(exchangeRateStr);
      if (!isNaN(exRate) && exRate > 0) {
        exchangeRateNum = exRate;
      } else {
        exchangeRateNum = tgt / (cents / 100);
      }
    }

    setLoading(true);
    try {
      const basePayload = {
        type,
        amount: cents,
        account_id: accountId,
        destination_account_id: type === 'transfer' ? destinationAccountId : null,
        target_amount: targetCents,
        exchange_rate: exchangeRateNum,
        category_id: type !== 'transfer' ? categoryId : null,
        transaction_time: time.replace('T', ' ') + ':00',
        remark: remark.trim(),
        scene: scene.trim().slice(0, 24) || null,
        amortize_days: type === 'expense' && costMode === 'amortize' ? parsedAmortizeDays : null,
        amortize_start_date: type === 'expense' && costMode === 'amortize' ? (amortizeStartDate || time.slice(0, 10)) : null,
        exclude_daily_cost: type === 'expense' && (costMode === 'exclude' || costMode === 'item') ? 1 : 0,
      };

      if (initialData) {
        await fetchApi(`/api/transactions/${initialData.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...basePayload,
            ...(photosLoading
              ? {}
              : {
                  keep_photo_ids: existingPhotos.map((p) => p.id),
                  new_photos: newPhotos,
                }),
          }),
        });

        const syncPayload = buildSyncCategoryPayload(false);
        if (syncPayload && categoryId) {
          await fetchApi('/api/transactions/batch-category', {
            method: 'PATCH',
            body: JSON.stringify(syncPayload),
          });
        }
      } else {
        await fetchApi('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            ...basePayload,
            photos: newPhotos,
            ...(isNewAsItem
              ? {
                  convert_to_item: true,
                  item_details: {
                    name: (itemFields.name || remark).trim(),
                    category: itemFields.category,
                    expected_days: itemFields.expectedDays ? Number(itemFields.expectedDays) : null,
                    warranty_date: itemFields.warrantyDate || null,
                    location: itemFields.location.trim() || null,
                    remark: itemFields.remark.trim() || remark.trim() || null,
                  },
                }
              : {}),
          }),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div 
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => handleTypeChange('expense')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'expense' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('income')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'income' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              收入
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('transfer')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                type === 'transfer' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              转账
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Amount Display & Input */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-500">金额</span>
            <div className="flex items-center gap-1">
              <span className={`text-2xl font-bold ${type === 'expense' ? 'text-rose-500' : type === 'income' ? 'text-emerald-500' : 'text-indigo-600'}`}>
                {getCurrencySymbol(sourceAccount?.currency)}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => {
                  const val = e.target.value;
                  setAmountStr(val);
                  if (isCrossCurrencyTransfer) {
                    const rate = parseFloat(exchangeRateStr);
                    const src = parseFloat(val);
                    if (!isNaN(rate) && rate > 0 && !isNaN(src) && src > 0) {
                      setTargetAmountStr((src * rate).toFixed(2));
                    }
                  }
                }}
                className="w-44 text-right text-3xl font-bold bg-transparent text-slate-800 focus:outline-none placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Categories Grid (Expense & Income) */}
          {type !== 'transfer' && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-500">选择分类</label>
                <button
                  type="button"
                  onClick={() => setManageCatOpen(true)}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
                >
                  <Tags className="w-3 h-3" />
                  <span>管理 / 添加分类</span>
                </button>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto p-1">
                {filteredCategories.map((cat) => {
                  const isSelected = categoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryId(cat.id)}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                          : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                      }`}
                    >
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white mb-1 shadow-sm"
                        style={{ backgroundColor: cat.color || '#6366f1' }}
                      >
                        <DynamicIcon name={cat.icon} className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-xs truncate max-w-[64px]">{cat.name}</span>
                    </button>
                  );
                })}
              </div>

              {initialData && type === initialData.type && (
                <div className="mt-3 p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      <span>同时将同类消费改为此分类</span>
                    </div>
                    {categorySyncScope !== 'single' && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-600 text-white">
                        保存时同步同类
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCategorySyncScope('single')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition ${
                        categorySyncScope === 'single'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      仅修改当前这一笔
                    </button>

                    {initialData.remark?.trim() && (
                      <button
                        type="button"
                        onClick={() => setCategorySyncScope('remark')}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition ${
                          categorySyncScope === 'remark'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                        }`}
                        title={initialData.remark.trim()}
                      >
                        同备注「
                        {initialData.remark.trim().length > 10
                          ? `${initialData.remark.trim().slice(0, 10)}…`
                          : initialData.remark.trim()}
                        」
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setCategorySyncScope('category')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition ${
                        categorySyncScope === 'category'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      同原分类（{initialData.category_name || '未分类'}）
                    </button>

                    <button
                      type="button"
                      onClick={() => setCategorySyncScope('account_category')}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-medium border transition ${
                        categorySyncScope === 'account_category'
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      同账户 + 同原分类
                    </button>
                  </div>

                  {categorySyncScope !== 'single' && (
                    <div className="pt-1 space-y-1.5">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={syncOnlyUncategorized}
                          onChange={(e) => setSyncOnlyUncategorized(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>仅应用到目前为「未分类」的记录</span>
                      </label>

                      <div className="text-[11px] text-indigo-700 font-medium">
                        {syncPreviewLoading
                          ? '正在统计匹配的同类消费笔数...'
                          : syncPreview
                          ? `共匹配 ${syncPreview.total_count} 笔同类${type === 'expense' ? '支出' : '收入'}，保存后将有 ${syncPreview.eligible_count} 笔统一归入「${filteredCategories.find((c) => c.id === categoryId)?.name || '目标分类'}」`
                          : '保存时将同步修改匹配的同类记录分类'}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Account Selection */}
          {type === 'transfer' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">转出账户</label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.currency && acc.currency !== 'CNY' ? `(${acc.currency})` : '(CNY)'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">转入账户</label>
                  <select
                    value={destinationAccountId}
                    onChange={(e) => setDestinationAccountId(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} {acc.currency && acc.currency !== 'CNY' ? `(${acc.currency})` : '(CNY)'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {isCrossCurrencyTransfer && (
                <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                    <span className="flex items-center gap-1.5">
                      <span>💱</span>
                      <span>跨币种换汇转账</span>
                    </span>
                    <span className="text-[11px] font-mono text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-md font-semibold">
                      {sourceCurrency} → {destCurrency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                        实收转入金额 ({getCurrencySymbol(destCurrency)})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={targetAmountStr}
                        onChange={(e) => {
                          const tgtStr = e.target.value;
                          setTargetAmountStr(tgtStr);
                          const tgt = parseFloat(tgtStr);
                          const src = parseFloat(amountStr);
                          if (!isNaN(tgt) && tgt > 0 && !isNaN(src) && src > 0) {
                            setExchangeRateStr((tgt / src).toFixed(4));
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                        折算汇率 (1 {sourceCurrency} =)
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        placeholder="汇率"
                        value={exchangeRateStr}
                        onChange={(e) => {
                          const rateStr = e.target.value;
                          setExchangeRateStr(rateStr);
                          const rate = parseFloat(rateStr);
                          const src = parseFloat(amountStr);
                          if (!isNaN(rate) && rate > 0 && !isNaN(src) && src > 0) {
                            setTargetAmountStr((src * rate).toFixed(2));
                          }
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-amber-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {type === 'expense' ? '扣款账户' : '收款账户'}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {accounts.map((acc) => {
                  const isSelected = accountId === acc.id;
                  return (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => setAccountId(acc.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                          : 'border-slate-100 bg-slate-50 text-slate-700 hover:border-slate-200'
                      }`}
                    >
                      <DynamicIcon name={acc.icon || acc.type} className="w-5 h-5 flex-shrink-0" />
                      <span className="text-xs truncate">{acc.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Time & Remark */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">记录时间</label>
              <div className="relative">
                <input
                  type="datetime-local"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">备注说明</label>
              <input
                type="text"
                placeholder="例如: 和同事聚餐、房租/宽带年费"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          {ruleSuggestion && (
            <div className="px-3 py-2 rounded-2xl bg-indigo-50/75 border border-indigo-100 flex items-center justify-between flex-wrap gap-2 text-[11px]">
              <div className="flex items-center gap-1.5 text-indigo-800 flex-wrap">
                <Wand2 className="w-3.5 h-3.5 text-indigo-600 flex-shrink-0" />
                <span>
                  命中规则「<strong>{ruleSuggestion.ruleName}</strong>」：
                  {ruleSuggestion.category ? `分类「${ruleSuggestion.category.name}」` : ''}
                  {ruleSuggestion.category && ruleSuggestion.scene ? ' · ' : ''}
                  {ruleSuggestion.scene ? `场景「${ruleSuggestion.scene}」` : ''}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {ruleSuggestion.needsApply ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (ruleSuggestion.category) setCategoryId(ruleSuggestion.category.id);
                      if (ruleSuggestion.scene) setScene(ruleSuggestion.scene);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition"
                  >
                    一键应用
                  </button>
                ) : (
                  <span className="text-emerald-600 font-semibold">已应用</span>
                )}
                <button
                  type="button"
                  onClick={() => setManageRuleOpen(true)}
                  className="px-2 py-0.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium transition"
                >
                  管理规则
                </button>
              </div>
            </div>
          )}

          {/* 消费场景标签 */}
          {type !== 'transfer' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-500">消费场景（可选，方便按场景复盘）</label>
                {scene && (
                  <button
                    type="button"
                    onClick={() => setScene('')}
                    className="text-[11px] text-slate-400 hover:text-rose-500 transition"
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PRESET_SCENES.slice(0, 8).map((preset) => {
                  const active = scene.trim() === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setScene(active ? '' : preset)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                        active
                          ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-400'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
              <input
                type="text"
                maxLength={24}
                placeholder="也可自定义输入，例如：露营、加班打车、出差..."
                value={scene}
                onChange={(e) => setScene(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
              />
            </div>
          )}

          {/* 每日生活成本分摊与大件标记 (仅支出) */}
          {type === 'expense' && (
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">每日生活成本口径 / 大件归类</span>
                {costMode === 'amortize' && parseFloat(amountStr) > 0 && Number(amortizeDays) > 1 && (
                  <span className="text-[11px] font-semibold text-amber-600">
                    约 ¥{(parseFloat(amountStr) / Number(amortizeDays)).toFixed(2)} / 天
                  </span>
                )}
              </div>

              {initialData?.item_id ? (
                <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-xs text-indigo-700 flex items-center gap-2">
                  <Package className="w-4 h-4 flex-shrink-0" />
                  <span>
                    已关联持物大件「{initialData.item_name || '查看大件'}」，已自动排除出日常日均避免重复统计。
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: '当日消费', mode: 'daily' as const },
                      { label: '按月(30天)', mode: 'amortize' as const, days: '30' },
                      { label: '按季(90天)', mode: 'amortize' as const, days: '90' },
                      { label: '按年(365天)', mode: 'amortize' as const, days: '365' },
                      { label: '自定义天数', mode: 'amortize' as const },
                      { label: '不计入日均', mode: 'exclude' as const },
                      ...(!initialData ? [{ label: '📦 标记为大件', mode: 'item' as const }] : []),
                    ].map((opt) => {
                      const isActive =
                        opt.mode === 'daily'
                          ? costMode === 'daily'
                          : opt.mode === 'exclude'
                          ? costMode === 'exclude'
                          : opt.mode === 'item'
                          ? costMode === 'item'
                          : opt.days
                          ? costMode === 'amortize' && amortizeDays === opt.days
                          : costMode === 'amortize' && !['30', '90', '365'].includes(amortizeDays);
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setCostMode(opt.mode);
                            if (opt.mode === 'item' && !itemFields.name && remark.trim()) {
                              setItemFields((prev) => ({ ...prev, name: remark.trim() }));
                            }
                            if (opt.days) setAmortizeDays(opt.days);
                            else if (opt.mode === 'amortize' && ['30', '90', '365'].includes(amortizeDays)) {
                              setAmortizeDays('180');
                            }
                            if (!amortizeStartDate) {
                              setAmortizeStartDate(time.slice(0, 10));
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition ${
                            isActive
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  {initialData && onConvertToItem && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onConvertToItem(initialData);
                      }}
                      className="w-full py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <Package className="w-3.5 h-3.5" />
                      <span>将这笔开销设为持物大件并补充信息</span>
                    </button>
                  )}

                  {initialData && onConvertToCard && !initialData.card_id && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onConvertToCard(initialData);
                      }}
                      className="w-full py-2 px-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>将这笔开销转为会员充值卡 / 计次卡</span>
                    </button>
                  )}
                </>
              )}

              {costMode === 'amortize' && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">分摊天数</label>
                    <input
                      type="number"
                      min="2"
                      max="36500"
                      value={amortizeDays}
                      onChange={(e) => setAmortizeDays(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">分摊起始日</label>
                    <input
                      type="date"
                      value={amortizeStartDate || time.slice(0, 10)}
                      onChange={(e) => setAmortizeStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {costMode === 'exclude' && !initialData?.item_id && (
                <p className="text-[11px] text-slate-400">
                  仍正常扣减账户余额与月度支出，但不会计入「每日生活成本」（适用于大件购置或非消费类垫付）。
                </p>
              )}

              {costMode === 'item' && !initialData && (
                <div className="pt-2 border-t border-slate-200/80 space-y-2.5">
                  <div className="text-[11px] text-indigo-600 font-medium">
                    将同时生成一笔支出流水与「持物大件」记录，且大件照片会同步保存下方上传的图片。
                  </div>
                  <ItemFieldsSection values={itemFields} onChange={setItemFields} />
                </div>
              )}
            </div>
          )}

          <PhotoPicker
            label={costMode === 'item' && !initialData ? '账单 / 大件照片' : '账单照片'}
            existingPhotos={existingPhotos}
            onRemoveExisting={(id) => setExistingPhotos((prev) => prev.filter((p) => p.id !== id))}
            newPhotos={newPhotos}
            onAddNewPhotos={(urls) => setNewPhotos((prev) => [...prev, ...urls])}
            onRemoveNewPhoto={(idx) => setNewPhotos((prev) => prev.filter((_, i) => i !== idx))}
            photosLoading={photosLoading}
            onError={setError}
            onCompressingChange={setCompressingPhotos}
          />

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || compressingPhotos}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-medium rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <Check className="w-5 h-5" />
              <span>
                {loading
                  ? '正在保存...'
                  : initialData
                  ? categorySyncScope !== 'single'
                    ? '保存并同步同类分类'
                    : '保存修改'
                  : costMode === 'item'
                  ? '确认记账并录入大件'
                  : '确认记账'}
              </span>
            </button>
          </div>
        </form>
      </div>

      <CategoryManageModal
        isOpen={manageCatOpen}
        categories={localCategories}
        defaultType={type === 'income' ? 'income' : 'expense'}
        onClose={() => setManageCatOpen(false)}
        onChanged={handleCategoriesManaged}
      />

      <RuleManageModal
        isOpen={manageRuleOpen}
        accounts={accounts}
        categories={localCategories}
        onClose={() => setManageRuleOpen(false)}
        onChanged={() => {
          loadRules();
          onCategoriesChanged?.();
        }}
      />
    </div>
  );
};

