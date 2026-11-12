import React, { useState, useEffect, useMemo } from 'react';
import { Tag, X, Check, Layers } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Transaction } from '../types';

export const PRESET_SCENES = [
  '日常三餐',
  '通勤出行',
  '外卖夜宵',
  '居家日用',
  '社交聚会',
  '约会请客',
  '旅行出差',
  '情绪消费',
  '自我提升',
  '人情往来',
  '医疗健康',
  '固定订阅',
];

export type SceneBatchScope = 'single' | 'ids' | 'category' | 'account' | 'account_category' | 'filter';

export interface SceneFilterPayload {
  month?: string;
  start_date?: string;
  end_date?: string;
  account_id?: string;
  category_id?: string;
  type?: string;
  scene?: string;
  search?: string;
}

interface Props {
  transaction: Transaction | null;
  selectedIds?: string[];
  batchFilter?: SceneFilterPayload | null;
  availableScenes?: string[];
  onClose: () => void;
  onSaved: (info: { txId?: string; scene: string | null; scope: SceneBatchScope; updatedCount: number }) => void;
}

export const ScenePickerModal: React.FC<Props> = ({
  transaction,
  selectedIds = [],
  batchFilter = null,
  availableScenes = [],
  onClose,
  onSaved,
}) => {
  const isIdsMode = !transaction && selectedIds.length > 0;
  const isFilterMode = Boolean(!transaction && !isIdsMode && batchFilter);
  const isOpen = Boolean(transaction || isIdsMode || batchFilter);

  const [scope, setScope] = useState<SceneBatchScope>('single');
  const [onlyUntagged, setOnlyUntagged] = useState(true);
  const [selectedScene, setSelectedScene] = useState('');
  const [previewCounts, setPreviewCounts] = useState<{ total_count: number; untagged_count: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setOnlyUntagged(true);
    setPreviewCounts(null);
    if (isIdsMode) {
      setScope('ids');
      setSelectedScene('');
    } else if (isFilterMode) {
      setScope('filter');
      setSelectedScene('');
    } else if (transaction) {
      setScope('single');
      setSelectedScene(transaction.scene || '');
    }
  }, [isOpen, isIdsMode, isFilterMode, transaction?.id]);

  const batchPayloadBase = useMemo(() => {
    if (scope === 'single') return null;
    if (scope === 'ids' && selectedIds.length > 0) {
      return {
        scope: 'ids' as const,
        ids: selectedIds,
      };
    }
    if (scope === 'filter' && batchFilter) {
      return {
        scope: 'filter' as const,
        filter: batchFilter,
      };
    }
    if (transaction) {
      return {
        scope,
        type: transaction.type === 'income' ? 'income' : 'expense',
        category_id: transaction.category_id || undefined,
        account_id: transaction.account_id || undefined,
      };
    }
    return null;
  }, [scope, selectedIds, batchFilter, transaction]);

  useEffect(() => {
    if (!isOpen || !batchPayloadBase) {
      setPreviewCounts(null);
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    fetchApi<{ total_count: number; untagged_count: number }>('/api/transactions/batch-scene', {
      method: 'PATCH',
      body: JSON.stringify({ ...batchPayloadBase, preview: true }),
    })
      .then((res) => {
        if (!cancelled) setPreviewCounts(res);
      })
      .catch(() => {
        if (!cancelled) setPreviewCounts(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, batchPayloadBase]);

  if (!isOpen) return null;

  const sceneChoices = Array.from(
    new Set([...availableScenes, ...PRESET_SCENES].filter((s) => s && s.trim().length > 0))
  );

  const txTypeLabel = transaction?.type === 'income' ? '收入' : '支出';

  const scopeOptions: Array<{ key: SceneBatchScope; label: string; hint?: string }> = isIdsMode
    ? [{ key: 'ids', label: `所选的 ${selectedIds.length} 笔流水` }]
    : isFilterMode
    ? [{ key: 'filter', label: '当前筛选结果全部记录' }]
    : [
        { key: 'single', label: '仅当前这一笔' },
        ...(transaction?.category_id
          ? [
              {
                key: 'category' as const,
                label: `同分类全部${txTypeLabel}`,
                hint: transaction.category_name || undefined,
              },
            ]
          : []),
        ...(transaction?.account_id
          ? [
              {
                key: 'account' as const,
                label: `同账户全部${txTypeLabel}`,
                hint: transaction.account_name || undefined,
              },
            ]
          : []),
        ...(transaction?.category_id && transaction?.account_id
          ? [
              {
                key: 'account_category' as const,
                label: '同账户 + 同分类',
              },
            ]
          : []),
      ];

  const executeSave = async (nextScene: string | null) => {
    setSaving(true);
    setError('');
    try {
      if (scope === 'single' && transaction) {
        const res = await fetchApi<{ id: string; scene: string | null }>(
          `/api/transactions/${transaction.id}/scene`,
          {
            method: 'PATCH',
            body: JSON.stringify({ scene: nextScene }),
          }
        );
        onSaved({ txId: transaction.id, scene: res.scene, scope: 'single', updatedCount: 1 });
      } else if (batchPayloadBase) {
        const res = await fetchApi<{ updated: number; scene: string | null }>(
          '/api/transactions/batch-scene',
          {
            method: 'PATCH',
            body: JSON.stringify({
              ...batchPayloadBase,
              scene: nextScene,
              only_untagged: nextScene === null ? false : onlyUntagged,
            }),
          }
        );
        onSaved({
          txId: transaction?.id,
          scene: res.scene,
          scope,
          updatedCount: res.updated,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err.message || '保存消费场景失败');
    } finally {
      setSaving(false);
    }
  };

  const handleChipClick = (sc: string) => {
    const isSame = selectedScene.trim() === sc;
    if (scope === 'single' && transaction) {
      executeSave(isSame ? null : sc);
    } else {
      setSelectedScene(isSame ? '' : sc);
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = selectedScene.trim().slice(0, 24);
    if (scope !== 'single' && !cleaned) {
      setError('请选择或输入要批量应用的消费场景名称');
      return;
    }
    await executeSave(cleaned || null);
  };

  const plannedCount =
    previewCounts === null
      ? null
      : onlyUntagged
      ? previewCounts.untagged_count
      : previewCounts.total_count;

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
              <Tag className="w-4 h-4 text-teal-600" />
              <span>
                {isIdsMode
                  ? `批量标记所选场景 (${selectedIds.length} 笔)`
                  : isFilterMode
                  ? '批量标记筛选结果场景'
                  : '标记消费场景'}
              </span>
            </div>
            {transaction ? (
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                {transaction.category_name || '未分类'}
                {transaction.remark ? ` · ${transaction.remark}` : ''} ·{' '}
                <span className="font-semibold text-slate-700">{formatCurrency(transaction.amount)}</span>
              </p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">
                {isIdsMode
                  ? '将为勾选的多笔非转账流水统一设置消费场景'
                  : '将为当前搜索/筛选命中的所有非转账流水统一打标'}
              </p>
            )}
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

        {/* 应用范围选择 */}
        {scopeOptions.length > 1 && (
          <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <Layers className="w-3.5 h-3.5 text-indigo-500" />
              <span>应用范围（支持同步标记同类或同账户历史流水）</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {scopeOptions.map((opt) => {
                const active = scope === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setScope(opt.key)}
                    className={`px-2.5 py-1.5 rounded-xl text-left border transition ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    <div className="text-[11px] font-semibold">{opt.label}</div>
                    {opt.hint && (
                      <div
                        className={`text-[10px] truncate ${
                          active ? 'text-indigo-100' : 'text-slate-400'
                        }`}
                      >
                        {opt.hint}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 批量范围预览与安全开关 */}
        {scope !== 'single' && (
          <div className="p-3 rounded-2xl bg-teal-50/70 border border-teal-100 space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyUntagged}
                onChange={(e) => setOnlyUntagged(e.target.checked)}
                className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>仅补充未标记场景的记录（跳过已打标项，不覆盖）</span>
            </label>

            <div className="text-[11px] text-teal-700 font-medium">
              {loadingPreview
                ? '正在统计影响笔数...'
                : previewCounts
                ? `符合范围共 ${previewCounts.total_count} 笔 · 本次预计更新 ${plannedCount} 笔${
                    onlyUntagged && previewCounts.total_count > previewCounts.untagged_count
                      ? `（已保留 ${previewCounts.total_count - previewCounts.untagged_count} 笔原有场景）`
                      : ''
                  }`
                : '选择场景后点击下方按钮立即批量更新'}
            </div>
          </div>
        )}

        {/* 场景候选标签 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-500">
            {scope === 'single' ? '点击标签立即保存：' : '第 1 步：选择或输入要批量打标的场景：'}
          </div>
          <div className="flex flex-wrap gap-2">
            {sceneChoices.map((sc) => {
              const active = selectedScene.trim() === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  disabled={saving}
                  onClick={() => handleChipClick(sc)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                    active
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-teal-400 hover:bg-teal-50/60'
                  }`}
                >
                  {active ? `✓ ${sc}` : sc}
                </button>
              );
            })}
          </div>
        </div>

        {/* 自定义输入 & 保存按钮 */}
        <form onSubmit={handleSubmitForm} className="pt-2 border-t border-slate-100 space-y-2.5">
          <label className="block text-[11px] font-semibold text-slate-500">
            自定义场景（最多 24 字）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              maxLength={24}
              value={selectedScene}
              onChange={(e) => setSelectedScene(e.target.value)}
              placeholder="如：露营装备、加班餐、地铁通勤..."
              className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={saving || (scope !== 'single' && !selectedScene.trim())}
              className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold flex items-center gap-1 transition disabled:opacity-60 whitespace-nowrap"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {saving
                  ? '保存中...'
                  : scope === 'single'
                  ? '保存'
                  : plannedCount !== null
                  ? `批量标记 (${plannedCount}笔)`
                  : '确认批量标记'}
              </span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            {scope === 'single' && transaction?.scene ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => executeSave(null)}
                className="text-[11px] text-slate-400 hover:text-rose-500 transition"
              >
                清除当前场景「{transaction.scene}」
              </button>
            ) : scope !== 'single' ? (
              <button
                type="button"
                disabled={saving || !previewCounts || previewCounts.total_count === 0}
                onClick={() => {
                  if (confirm(`确定要清空该范围内全部 ${previewCounts?.total_count || 0} 笔流水的消费场景吗？`)) {
                    executeSave(null);
                  }
                }}
                className="text-[11px] text-slate-400 hover:text-rose-500 transition disabled:opacity-40"
              >
                清空范围内所有已有场景
              </button>
            ) : (
              <span />
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
