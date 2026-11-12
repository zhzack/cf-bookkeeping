import React, { useState, useEffect, useMemo } from 'react';
import { FolderKanban, X, Check, Tags } from 'lucide-react';
import { fetchApi } from '../api';
import { Category } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { SceneFilterPayload } from './ScenePickerModal';
import { CategoryManageModal } from './CategoryManageModal';

interface Props {
  isOpen: boolean;
  categories: Category[];
  selectedIds?: string[];
  batchFilter?: SceneFilterPayload | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onCategoriesChanged?: () => void;
}

export const BatchCategoryModal: React.FC<Props> = ({
  isOpen,
  categories,
  selectedIds = [],
  batchFilter = null,
  onClose,
  onSuccess,
  onCategoriesChanged,
}) => {
  const isIdsMode = selectedIds.length > 0;
  const [targetType, setTargetType] = useState<'expense' | 'income'>('expense');
  const [targetCategoryId, setTargetCategoryId] = useState('');
  const [onlyUncategorized, setOnlyUncategorized] = useState(false);
  const [preview, setPreview] = useState<{
    total_count: number;
    expense_count: number;
    income_count: number;
    eligible_count: number;
  } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [manageCatOpen, setManageCatOpen] = useState(false);
  const [localCategories, setLocalCategories] = useState<Category[]>(categories);

  useEffect(() => {
    setLocalCategories(categories);
  }, [categories]);

  const typeCategories = useMemo(
    () => localCategories.filter((c) => c.type === targetType),
    [localCategories, targetType]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setOnlyUncategorized(false);
    const defaultType = batchFilter?.type === 'income' ? 'income' : 'expense';
    setTargetType(defaultType);
    const firstCat = localCategories.find((c) => c.type === defaultType);
    setTargetCategoryId(firstCat?.id || '');
  }, [isOpen, batchFilter?.type]);

  const handleCategoriesManaged = async (created?: Category) => {
    if (created) {
      setLocalCategories((prev) =>
        prev.some((c) => c.id === created.id) ? prev : [...prev, created]
      );
      setTargetType(created.type);
      setTargetCategoryId(created.id);
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

  useEffect(() => {
    if (!isOpen) return;
    if (!typeCategories.some((c) => c.id === targetCategoryId)) {
      setTargetCategoryId(typeCategories[0]?.id || '');
    }
  }, [isOpen, targetType, typeCategories, targetCategoryId]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isIdsMode && !batchFilter) return;

    let cancelled = false;
    setLoadingPreview(true);
    const payload = isIdsMode
      ? {
          scope: 'ids',
          ids: selectedIds,
          target_category_id: targetCategoryId || undefined,
          only_uncategorized: onlyUncategorized,
          preview: true,
        }
      : {
          scope: 'filter',
          filter: batchFilter,
          target_category_id: targetCategoryId || undefined,
          only_uncategorized: onlyUncategorized,
          preview: true,
        };

    fetchApi<{
      total_count: number;
      expense_count: number;
      income_count: number;
      eligible_count: number;
    }>('/api/transactions/batch-category', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!cancelled) setPreview(res);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, isIdsMode, selectedIds, batchFilter, targetCategoryId, onlyUncategorized]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCategoryId) {
      setError('请选择目标分类');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = isIdsMode
        ? {
            scope: 'ids',
            ids: selectedIds,
            target_category_id: targetCategoryId,
            only_uncategorized: onlyUncategorized,
          }
        : {
            scope: 'filter',
            filter: batchFilter,
            target_category_id: targetCategoryId,
            only_uncategorized: onlyUncategorized,
          };

      const res = await fetchApi<{ updated: number; message: string }>(
        '/api/transactions/batch-category',
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        }
      );
      onSuccess(res.message || `已批量调整 ${res.updated} 笔记录分类`);
      onClose();
    } catch (err: any) {
      setError(err.message || '批量修改分类失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
              <FolderKanban className="w-4 h-4 text-indigo-600" />
              <span>{isIdsMode ? `批量修改所选分类 (${selectedIds.length} 笔)` : '批量修改筛选结果分类'}</span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              系统会自动按收支类型匹配，仅修改对应类型的流水，转账记录不会受影响
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 支出 / 收入分类切换 */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTargetType('expense')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                targetType === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              转为支出分类 {preview ? `(${preview.expense_count}笔)` : ''}
            </button>
            <button
              type="button"
              onClick={() => setTargetType('income')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                targetType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              转为收入分类 {preview ? `(${preview.income_count}笔)` : ''}
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">选择目标分类</span>
            <button
              type="button"
              onClick={() => setManageCatOpen(true)}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
            >
              <Tags className="w-3 h-3" />
              <span>管理 / 添加分类</span>
            </button>
          </div>

          {/* 分类网格 */}
          <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto p-1">
            {typeCategories.map((cat) => {
              const isSelected = targetCategoryId === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setTargetCategoryId(cat.id)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                      : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white mb-1 shadow-sm"
                    style={{ backgroundColor: cat.color || '#6366f1' }}
                  >
                    <DynamicIcon name={cat.icon} className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-[11px] truncate max-w-[64px]">{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* 安全提示与预览 */}
          <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUncategorized}
                onChange={(e) => setOnlyUncategorized(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>仅补充原本为「未分类」的流水（保留已有分类）</span>
            </label>

            <div className="text-[11px] text-indigo-700 font-medium">
              {loadingPreview
                ? '正在统计影响笔数...'
                : preview
                ? `本次预计将更新 ${preview.eligible_count} 笔${
                    targetType === 'expense' ? '支出' : '收入'
                  }（范围共 ${preview.total_count} 笔收支）`
                : '请选择目标分类'}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving || !targetCategoryId || (preview !== null && preview.eligible_count === 0)}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-200 transition disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            <span>
              {saving
                ? '正在批量调整...'
                : preview
                ? `确认修改分类 (${preview.eligible_count} 笔)`
                : '确认批量修改分类'}
            </span>
          </button>
        </form>
      </div>

      <CategoryManageModal
        isOpen={manageCatOpen}
        categories={localCategories}
        defaultType={targetType}
        onClose={() => setManageCatOpen(false)}
        onChanged={handleCategoriesManaged}
      />
    </div>
  );
};
