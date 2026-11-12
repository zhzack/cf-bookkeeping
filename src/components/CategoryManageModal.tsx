import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Pencil, Trash2, Check, Tags } from 'lucide-react';
import { fetchApi } from '../api';
import { Category } from '../types';
import { DynamicIcon } from './DynamicIcon';

const CATEGORY_ICONS = [
  'Utensils',
  'Coffee',
  'Car',
  'Plane',
  'ShoppingBag',
  'Gamepad2',
  'Film',
  'Home',
  'HeartPulse',
  'Smartphone',
  'Laptop',
  'Shirt',
  'Gift',
  'BookOpen',
  'Watch',
  'Armchair',
  'Package',
  'Briefcase',
  'Zap',
  'TrendingUp',
  'Award',
  'Coins',
  'Wallet',
  'CreditCard',
  'Heart',
  'Tag',
  'MoreHorizontal',
];

const CATEGORY_COLORS = [
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#6366F1',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
  '#84CC16',
  '#F59E0B',
  '#14B8A6',
  '#64748B',
];

interface Props {
  isOpen: boolean;
  categories: Category[];
  defaultType?: 'expense' | 'income';
  onClose: () => void;
  onChanged: (createdCategory?: Category) => void;
}

export const CategoryManageModal: React.FC<Props> = ({
  isOpen,
  categories,
  defaultType = 'expense',
  onClose,
  onChanged,
}) => {
  const [activeType, setActiveType] = useState<'expense' | 'income'>(defaultType);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Tag');
  const [color, setColor] = useState('#F97316');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveType(defaultType);
    setEditingCat(null);
    setName('');
    setIcon(defaultType === 'income' ? 'Wallet' : 'Tag');
    setColor(defaultType === 'income' ? '#10B981' : '#F97316');
    setFeedback(null);
  }, [isOpen, defaultType]);

  const list = useMemo(
    () => categories.filter((c) => c.type === activeType),
    [categories, activeType]
  );

  if (!isOpen) return null;

  const startCreateMode = (nextType: 'expense' | 'income') => {
    setActiveType(nextType);
    setEditingCat(null);
    setName('');
    setIcon(nextType === 'income' ? 'Wallet' : 'Tag');
    setColor(nextType === 'income' ? '#10B981' : '#F97316');
    setFeedback(null);
  };

  const startEdit = (cat: Category) => {
    setActiveType(cat.type);
    setEditingCat(cat);
    setName(cat.name);
    setIcon(cat.icon || 'Tag');
    setColor(cat.color || '#6366F1');
    setFeedback(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) {
      setFeedback({ text: '请输入分类名称', isError: true });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      if (editingCat) {
        const res = await fetchApi<{ category?: Category; message?: string }>(
          `/api/categories/${editingCat.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              name: cleanName,
              icon,
              color,
            }),
          }
        );
        setFeedback({ text: res.message || `已更新分类「${cleanName}」`, isError: false });
        setEditingCat(null);
        setName('');
        onChanged();
      } else {
        const res = await fetchApi<{ id: string; category?: Category; message?: string }>(
          '/api/categories',
          {
            method: 'POST',
            body: JSON.stringify({
              name: cleanName,
              type: activeType,
              icon,
              color,
            }),
          }
        );
        const created: Category = res.category || {
          id: res.id,
          user_id: '',
          name: cleanName,
          type: activeType,
          icon,
          color,
          sort_order: list.length + 1,
          created_at: new Date().toISOString(),
        };
        setFeedback({ text: `已添加分类「${cleanName}」`, isError: false });
        setName('');
        onChanged(created);
      }
    } catch (err: any) {
      setFeedback({ text: err.message || '保存失败', isError: true });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (
      !window.confirm(
        `确定删除${cat.type === 'expense' ? '支出' : '收入'}分类「${cat.name}」吗？\n该分类下的历史流水不会被删除，会自动变为「未分类」。`
      )
    ) {
      return;
    }

    setDeletingId(cat.id);
    setFeedback(null);
    try {
      await fetchApi(`/api/categories/${cat.id}`, { method: 'DELETE' });
      if (editingCat?.id === cat.id) {
        startCreateMode(activeType);
      }
      setFeedback({ text: `已删除分类「${cat.name}」`, isError: false });
      onChanged();
    } catch (err: any) {
      setFeedback({ text: err.message || '删除失败', isError: true });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Tags className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">分类管理（添加 / 编辑）</h3>
              <p className="text-[11px] text-slate-400">自定义支出与收入分类名称、图标与配色</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Type Switch */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => startCreateMode('expense')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeType === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              支出分类 ({categories.filter((c) => c.type === 'expense').length})
            </button>
            <button
              type="button"
              onClick={() => startCreateMode('income')}
              className={`flex-1 py-1.5 rounded-lg transition ${
                activeType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              收入分类 ({categories.filter((c) => c.type === 'income').length})
            </button>
          </div>

          {feedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                feedback.isError
                  ? 'bg-red-50 text-red-600 border border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              <span>{feedback.isError ? '⚠️' : '✓'}</span>
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Add / Edit Form */}
          <form
            onSubmit={handleSubmit}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {editingCat
                  ? `编辑${editingCat.type === 'expense' ? '支出' : '收入'}分类「${editingCat.name}」`
                  : `新增${activeType === 'expense' ? '支出' : '收入'}分类`}
              </span>
              {editingCat && (
                <button
                  type="button"
                  onClick={() => startCreateMode(activeType)}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                >
                  取消编辑
                </button>
              )}
            </div>

            <div className="flex items-center gap-2.5">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-sm flex-shrink-0"
                style={{ backgroundColor: color }}
              >
                <DynamicIcon name={icon} className="w-5 h-5 text-white" />
              </div>
              <input
                type="text"
                maxLength={20}
                placeholder="输入分类名称，例如：宠物消费、奶茶饮品..."
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1 shadow-sm disabled:opacity-60 flex-shrink-0 transition"
              >
                {editingCat ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{saving ? '保存中' : editingCat ? '保存' : '添加'}</span>
              </button>
            </div>

            {/* Color Picker */}
            <div>
              <div className="text-[11px] text-slate-400 mb-1.5">选择颜色</div>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition ${
                      color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            </div>

            {/* Icon Picker */}
            <div>
              <div className="text-[11px] text-slate-400 mb-1.5">选择图标</div>
              <div className="grid grid-cols-9 gap-1.5">
                {CATEGORY_ICONS.map((ic) => {
                  const selected = icon === ic;
                  return (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`h-8 rounded-lg flex items-center justify-center border transition ${
                        selected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                      title={ic}
                    >
                      <DynamicIcon name={ic} className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>
          </form>

          {/* Existing Categories List */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-slate-500 px-1">
              已有{activeType === 'expense' ? '支出' : '收入'}分类（{list.length}）
            </div>
            {list.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl">
                暂无分类，上方输入名称即可添加
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden bg-white">
                {list.map((cat) => {
                  const isEditingThis = editingCat?.id === cat.id;
                  return (
                    <div
                      key={cat.id}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-2 ${
                        isEditingThis ? 'bg-indigo-50/60' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white flex-shrink-0"
                          style={{ backgroundColor: cat.color || '#64748B' }}
                        >
                          <DynamicIcon name={cat.icon} className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 truncate">
                          {cat.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(cat)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 transition"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>编辑</span>
                        </button>
                        <button
                          type="button"
                          disabled={deletingId === cat.id}
                          onClick={() => handleDelete(cat)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-500 hover:bg-rose-50 flex items-center gap-1 disabled:opacity-50 transition"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{deletingId === cat.id ? '删除中' : '删除'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/70 flex justify-end rounded-b-3xl">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
