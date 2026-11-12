import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Pencil,
  Trash2,
  Check,
  Wand2,
  Play,
  Sparkles,
  Power,
  Tag,
} from 'lucide-react';
import { fetchApi } from '../api';
import { Account, AutoRule, Category } from '../types';
import { PRESET_SCENES } from './ScenePickerModal';
import { parseRuleKeywords } from '../utils/ruleMatcher';

interface RulePresetTemplate {
  name: string;
  tx_type: 'expense' | 'income';
  keywords: string;
  catHints: string[];
  scene: string;
}

const PRESET_TEMPLATES: RulePresetTemplate[] = [
  {
    name: '咖啡奶茶外卖',
    tx_type: 'expense',
    keywords: '瑞幸, 星巴克, 库迪, 喜茶, 霸王茶姬, 奈雪, 饿了么, 美团',
    catHints: ['餐饮', '美食'],
    scene: '日常三餐',
  },
  {
    name: '打车地铁通勤',
    tx_type: 'expense',
    keywords: '滴滴, 高德, 地铁, 公交, 12306, 单车, 哈啰, 充电',
    catHints: ['交通', '出行'],
    scene: '通勤出行',
  },
  {
    name: '商超便利日百',
    tx_type: 'expense',
    keywords: '7-11, 全家, 罗森, 盒马, 山姆, 超市, 便利店, 京东, 淘宝, 拼多多',
    catHints: ['日常', '百货', '购物'],
    scene: '购物消费',
  },
  {
    name: '宽带水电房租',
    tx_type: 'expense',
    keywords: '房租, 物业, 水费, 电费, 燃气, 宽带, 话费, 移动, 联通, 电信',
    catHints: ['住房', '物业'],
    scene: '居家生活',
  },
];

interface Props {
  isOpen: boolean;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onChanged?: () => void;
}

export const RuleManageModal: React.FC<Props> = ({
  isOpen,
  accounts,
  categories,
  onClose,
  onChanged,
}) => {
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [loading, setLoading] = useState(false);

  // Add / Edit form state
  const [editingRule, setEditingRule] = useState<AutoRule | null>(null);
  const [name, setName] = useState('');
  const [txType, setTxType] = useState<'all' | 'expense' | 'income'>('expense');
  const [keywords, setKeywords] = useState('');
  const [matchMode, setMatchMode] = useState<'contains' | 'exact'>('contains');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scene, setScene] = useState('');
  const [priority, setPriority] = useState('100');
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [overwriteHistory, setOverwriteHistory] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ rules: AutoRule[] }>('/api/rules');
      setRules(res.rules || []);
    } catch (err: any) {
      setFeedback({ text: err.message || '加载规则失败', isError: true });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setFeedback(null);
    loadRules();
  }, [isOpen]);

  const availableCategories = useMemo(() => {
    if (txType === 'all') return categories;
    return categories.filter((c) => c.type === txType);
  }, [categories, txType]);

  // 当切换规则类型导致原选定分类不匹配时自动清零
  useEffect(() => {
    if (!categoryId || txType === 'all') return;
    const cat = categories.find((c) => c.id === categoryId);
    if (cat && cat.type !== txType) {
      setCategoryId('');
    }
  }, [txType, categoryId, categories]);

  if (!isOpen) return null;

  function resetForm() {
    setEditingRule(null);
    setName('');
    setTxType('expense');
    setKeywords('');
    setMatchMode('contains');
    setAccountId('');
    setCategoryId('');
    setScene('');
    setPriority('100');
    setEnabled(true);
  }

  const startEdit = (rule: AutoRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setTxType(rule.tx_type);
    setKeywords(rule.keywords);
    setMatchMode(rule.match_mode);
    setAccountId(rule.account_id || '');
    setCategoryId(rule.category_id || '');
    setScene(rule.scene || '');
    setPriority(String(rule.priority ?? 100));
    setEnabled(rule.enabled === 1);
    setFeedback(null);
  };

  const applyTemplate = (tpl: RulePresetTemplate) => {
    const matchedCat = categories.find(
      (c) => c.type === tpl.tx_type && tpl.catHints.some((h) => c.name.includes(h))
    );
    setEditingRule(null);
    setName(tpl.name);
    setTxType(tpl.tx_type);
    setKeywords(tpl.keywords);
    setMatchMode('contains');
    setAccountId('');
    setCategoryId(matchedCat?.id || '');
    setScene(tpl.scene);
    setPriority('100');
    setEnabled(true);
    setFeedback({
      text: `已填充模板「${tpl.name}」，可直接修改关键词或点击右侧保存`,
      isError: false,
    });
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedback({ text: '请填写规则名称', isError: true });
      return;
    }
    if (parseRuleKeywords(keywords).length === 0) {
      setFeedback({ text: '请至少填写一个关键词（多个可用逗号分隔）', isError: true });
      return;
    }
    if (!categoryId && !scene.trim()) {
      setFeedback({ text: '请至少设置一个目标分类或消费场景', isError: true });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const payload = {
        name: name.trim(),
        tx_type: txType,
        keywords,
        match_mode: matchMode,
        account_id: accountId || null,
        category_id: categoryId || null,
        scene: scene.trim() || null,
        priority: Number(priority) || 100,
        enabled: enabled ? 1 : 0,
      };

      if (editingRule) {
        const res = await fetchApi<{ message?: string }>(`/api/rules/${editingRule.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setFeedback({ text: res.message || '规则已更新', isError: false });
      } else {
        const res = await fetchApi<{ message?: string }>('/api/rules', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback({ text: res.message || '规则已添加', isError: false });
      }

      resetForm();
      await loadRules();
      onChanged?.();
    } catch (err: any) {
      setFeedback({ text: err.message || '保存规则失败', isError: true });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (rule: AutoRule) => {
    try {
      await fetchApi(`/api/rules/${rule.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: rule.name,
          tx_type: rule.tx_type,
          keywords: rule.keywords,
          match_mode: rule.match_mode,
          account_id: rule.account_id || null,
          category_id: rule.category_id || null,
          scene: rule.scene || null,
          priority: rule.priority,
          enabled: rule.enabled === 1 ? 0 : 1,
        }),
      });
      await loadRules();
      onChanged?.();
    } catch (err: any) {
      setFeedback({ text: err.message || '切换状态失败', isError: true });
    }
  };

  const handleDeleteRule = async (rule: AutoRule) => {
    if (!window.confirm(`确定删除自动规则「${rule.name}」吗？`)) return;
    try {
      await fetchApi(`/api/rules/${rule.id}`, { method: 'DELETE' });
      if (editingRule?.id === rule.id) resetForm();
      setFeedback({ text: `已删除规则「${rule.name}」`, isError: false });
      await loadRules();
      onChanged?.();
    } catch (err: any) {
      setFeedback({ text: err.message || '删除规则失败', isError: true });
    }
  };

  const handleApplySingleRule = async (rule: AutoRule) => {
    setApplyingId(rule.id);
    setFeedback(null);
    try {
      const preview = await fetchApi<{
        matched_count: number;
        updated_count: number;
        category_updates: number;
        scene_updates: number;
      }>(`/api/rules/${rule.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ preview: true, overwrite: overwriteHistory }),
      });

      if (preview.updated_count === 0) {
        setFeedback({
          text:
            preview.matched_count > 0
              ? `匹配 ${preview.matched_count} 笔流水，均已归类/标场景（若需覆盖请勾选「允许覆盖已有分类/场景」）`
              : `暂无匹配规则「${rule.name}」的流水`,
          isError: false,
        });
        return;
      }

      if (
        !window.confirm(
          `规则「${rule.name}」共匹配 ${preview.matched_count} 笔流水，将更新 ${preview.updated_count} 笔（分类 ${preview.category_updates} 笔、场景 ${preview.scene_updates} 笔）。确定立即执行吗？`
        )
      ) {
        return;
      }

      const applied = await fetchApi<{ message?: string }>(`/api/rules/${rule.id}/apply`, {
        method: 'POST',
        body: JSON.stringify({ preview: false, overwrite: overwriteHistory }),
      });
      setFeedback({ text: applied.message || '已应用规则到历史流水', isError: false });
      onChanged?.();
    } catch (err: any) {
      setFeedback({ text: err.message || '应用规则失败', isError: true });
    } finally {
      setApplyingId(null);
    }
  };

  const handleApplyAllRules = async () => {
    setApplyingAll(true);
    setFeedback(null);
    try {
      const preview = await fetchApi<{
        matched_count: number;
        updated_count: number;
        category_updates: number;
        scene_updates: number;
      }>('/api/rules/apply-all', {
        method: 'POST',
        body: JSON.stringify({ preview: true, overwrite: overwriteHistory }),
      });

      if (preview.updated_count === 0) {
        setFeedback({
          text:
            preview.matched_count > 0
              ? `共匹配 ${preview.matched_count} 笔流水，已有分类与场景均无需补充`
              : '当前没有匹配启用规则的历史流水',
          isError: false,
        });
        return;
      }

      if (
        !window.confirm(
          `全部启用规则共匹配 ${preview.matched_count} 笔流水，预计更新 ${preview.updated_count} 笔（分类 ${preview.category_updates} 笔、场景 ${preview.scene_updates} 笔）。确定执行吗？`
        )
      ) {
        return;
      }

      const applied = await fetchApi<{ message?: string }>('/api/rules/apply-all', {
        method: 'POST',
        body: JSON.stringify({ preview: false, overwrite: overwriteHistory }),
      });
      setFeedback({ text: applied.message || '已应用全部规则', isError: false });
      onChanged?.();
    } catch (err: any) {
      setFeedback({ text: err.message || '批量应用失败', isError: true });
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Wand2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">自动分类与场景规则</h3>
              <p className="text-[11px] text-slate-400">
                在账单导入、快捷指令、手写备注与历史整理时自动按关键词匹配分类和消费场景
              </p>
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

          {/* Quick Templates */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>常用模板一键填入：</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => applyTemplate(tpl)}
                  className="px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 text-[11px] font-medium transition"
                >
                  + {tpl.name}
                </button>
              ))}
            </div>
          </div>

          {/* Add / Edit Rule Form */}
          <form
            onSubmit={handleSaveRule}
            className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                {editingRule ? `编辑规则「${editingRule.name}」` : '新建匹配规则'}
              </span>
              {editingRule && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-700"
                >
                  取消编辑
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  规则名称
                </label>
                <input
                  type="text"
                  maxLength={30}
                  placeholder="例如：瑞幸星巴克咖啡、滴滴通勤"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  适用交易类型
                </label>
                <select
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="expense">仅支出</option>
                  <option value="income">仅收入</option>
                  <option value="all">支出与收入通用</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  匹配关键词（多个用逗号分隔，命中任意一个即生效）
                </label>
                <input
                  type="text"
                  placeholder="例如：瑞幸, 星巴克, 喜茶, luckin"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  匹配方式
                </label>
                <select
                  value={matchMode}
                  onChange={(e) => setMatchMode(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="contains">包含关键词</option>
                  <option value="exact">备注完全相等</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  自动设为分类（可选）
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">不自动修改分类</option>
                  {availableCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      [{c.type === 'expense' ? '支' : '收'}] {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  自动打标消费场景（可选）
                </label>
                <input
                  type="text"
                  maxLength={24}
                  placeholder="留空则不改场景，可点下方快选"
                  value={scene}
                  onChange={(e) => setScene(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {PRESET_SCENES.slice(0, 6).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setScene(scene === s ? '' : s)}
                      className={`px-1.5 py-0.5 rounded-md text-[10px] border transition ${
                        scene === s
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  限定支付账户（可选）
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                >
                  <option value="">全部账户生效</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  优先级（越大越优先）
                </label>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-60 transition"
              >
                {editingRule ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{saving ? '保存中...' : editingRule ? '保存规则修改' : '添加规则'}</span>
              </button>
            </div>
          </form>

          {/* Historical Apply Toolbar */}
          <div className="p-3 rounded-2xl bg-indigo-50/70 border border-indigo-100 flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={overwriteHistory}
                onChange={(e) => setOverwriteHistory(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>应用到历史流水时覆盖已有分类/场景（不勾选则仅补充空白）</span>
            </label>

            <button
              type="button"
              disabled={applyingAll || rules.filter((r) => r.enabled === 1).length === 0}
              onClick={handleApplyAllRules}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold flex items-center gap-1 disabled:opacity-50 transition"
            >
              <Play className="w-3 h-3" />
              <span>{applyingAll ? '执行中...' : '一键应用全部启用规则'}</span>
            </button>
          </div>

          {/* Rules List */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500 px-1">
              我的匹配规则（{rules.length} 条，按优先级从高到低匹配）
            </div>

            {loading ? (
              <div className="text-center py-8 text-xs text-slate-400">加载规则中...</div>
            ) : rules.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 bg-slate-50 rounded-2xl">
                暂无自定义规则，点击上方常用模板或填写关键词即可添加
              </div>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => {
                  const isActive = rule.enabled === 1;
                  const kwList = parseRuleKeywords(rule.keywords);
                  return (
                    <div
                      key={rule.id}
                      className={`p-3.5 rounded-2xl border transition space-y-2 ${
                        isActive
                          ? 'bg-white border-slate-200 shadow-sm'
                          : 'bg-slate-50/70 border-slate-200/70 opacity-70'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-800">{rule.name}</span>
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-semibold">
                            优先级 {rule.priority}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px]">
                            {rule.tx_type === 'expense'
                              ? '支出'
                              : rule.tx_type === 'income'
                              ? '收入'
                              : '通用'}
                            · {rule.match_mode === 'exact' ? '精确匹配' : '包含关键词'}
                          </span>
                          {rule.account_name && (
                            <span className="px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 text-[10px]">
                              仅 {rule.account_name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleEnabled(rule)}
                            className={`px-2 py-1 rounded-lg text-[11px] font-medium flex items-center gap-1 transition ${
                              isActive
                                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                            }`}
                          >
                            <Power className="w-3 h-3" />
                            <span>{isActive ? '已启用' : '已停用'}</span>
                          </button>

                          <button
                            type="button"
                            disabled={applyingId === rule.id}
                            onClick={() => handleApplySingleRule(rule)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium text-indigo-600 hover:bg-indigo-50 flex items-center gap-1 disabled:opacity-50 transition"
                            title="用本规则匹配历史账单"
                          >
                            <Play className="w-3 h-3" />
                            <span>{applyingId === rule.id ? '处理中' : '应用历史'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startEdit(rule)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-slate-100 flex items-center gap-1 transition"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>编辑</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteRule(rule)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium text-rose-500 hover:bg-rose-50 flex items-center gap-1 transition"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>删除</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400">关键词:</span>
                        {kwList.map((kw) => (
                          <span
                            key={kw}
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium"
                          >
                            {kw}
                          </span>
                        ))}
                        <span className="text-slate-400 ml-1">➔</span>
                        {rule.category_name && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200/70 font-semibold">
                            分类: {rule.category_name}
                          </span>
                        )}
                        {rule.scene && (
                          <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-200/70 font-semibold inline-flex items-center gap-0.5">
                            <Tag className="w-2.5 h-2.5" />
                            <span>场景: {rule.scene}</span>
                          </span>
                        )}
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
