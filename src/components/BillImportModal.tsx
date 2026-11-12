import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Filter,
  Wand2,
  Tag,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Account, AutoRule, Category } from '../types';
import {
  BillProvider,
  ParsedBillRow,
  applyRulesToParsedRow,
  parseBillFile,
} from '../utils/billParser';
import { RuleManageModal } from './RuleManageModal';

interface Props {
  isOpen: boolean;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSuccess: () => void;
}

export const BillImportModal: React.FC<Props> = ({
  isOpen,
  accounts,
  categories,
  onClose,
  onSuccess,
}) => {
  const [provider, setProvider] = useState<BillProvider | null>(null);
  const [rows, setRows] = useState<ParsedBillRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterTab, setFilterTab] = useState<'all' | 'ready' | 'duplicate' | 'skipped'>('all');
  const [renderLimit, setRenderLimit] = useState(100);
  const [isDragging, setIsDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const [rules, setRules] = useState<AutoRule[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);

  const loadRules = async (): Promise<AutoRule[]> => {
    try {
      const res = await fetchApi<{ rules: AutoRule[] }>('/api/rules');
      const next = res.rules || [];
      setRules(next);
      return next;
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRules();
    }
  }, [isOpen]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories]
  );

  const counts = useMemo(() => {
    let dup = 0;
    let skipped = 0;
    let ready = 0;
    for (const r of rows) {
      if (r.isDuplicate) dup++;
      else if (r.skipReason) skipped++;
      else ready++;
    }
    return { total: rows.length, dup, skipped, ready };
  }, [rows]);

  const visibleRows = useMemo(() => {
    if (filterTab === 'ready') return rows.filter((r) => !r.isDuplicate && !r.skipReason);
    if (filterTab === 'duplicate') return rows.filter((r) => r.isDuplicate);
    if (filterTab === 'skipped') return rows.filter((r) => !r.isDuplicate && Boolean(r.skipReason));
    return rows;
  }, [rows, filterTab]);

  if (!isOpen) return null;

  const resetState = () => {
    setProvider(null);
    setRows([]);
    setSelectedIds(new Set());
    setFilterTab('all');
    setRenderLimit(100);
    setIsDragging(false);
    setError('');
    setResultMsg('');
  };

  const handleClose = () => {
    if (importing) return;
    resetState();
    onClose();
  };

  const processFile = async (file: File) => {
    if (parsing || importing) return;
    setError('');
    setResultMsg('');
    setParsing(true);
    try {
      const defaultAcc = accounts[0]?.id || '';
      const defaultExpCat =
        (expenseCategories.find((c) => c.name.includes('其他')) || expenseCategories[0])?.id || '';
      const defaultIncCat =
        (incomeCategories.find((c) => c.name.includes('其他')) || incomeCategories[0])?.id || '';

      const latestRules = rules.length > 0 ? rules : await loadRules();
      const parsed = await parseBillFile(
        file,
        accounts,
        categories,
        defaultAcc,
        defaultExpCat,
        defaultIncCat,
        latestRules
      );

      // 查询后端哪些交易单号已导入过（分批查询，支持 2000+ 条大账单）
      const allExtIds = parsed.rows.map((r) => r.external_id);
      const dupSet = new Set<string>();
      for (let i = 0; i < allExtIds.length; i += 1500) {
        const dupRes = await fetchApi<{ existing_ids: string[] }>(
          '/api/transactions/import/check-duplicates',
          {
            method: 'POST',
            body: JSON.stringify({
              external_ids: allExtIds.slice(i, i + 1500),
            }),
          }
        );
        for (const id of dupRes.existing_ids || []) dupSet.add(id);
      }

      const nextRows = parsed.rows.map((r) => ({
        ...r,
        isDuplicate: dupSet.has(r.external_id),
      }));

      const initialSelected = new Set(
        nextRows
          .filter((r) => !r.isDuplicate && r.defaultSelected)
          .map((r) => r.tempId)
      );

      setProvider(parsed.provider);
      setRows(nextRows);
      setSelectedIds(initialSelected);
      setFilterTab('all');
      setRenderLimit(100);
    } catch (err: any) {
      setError(err?.message || '账单文件解析失败');
    } finally {
      setParsing(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) await processFile(file);
  };

  const toggleSelect = (tempId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tempId)) next.delete(tempId);
      else next.add(tempId);
      return next;
    });
  };

  const updateRowField = (
    tempId: string,
    patch: Partial<Pick<ParsedBillRow, 'account_id' | 'category_id' | 'type' | 'remark'>>
  ) => {
    setRows((prev) => prev.map((r) => (r.tempId === tempId ? { ...r, ...patch } : r)));
  };

  const handleSelectAllReady = () => {
    setSelectedIds(
      new Set(rows.filter((r) => !r.isDuplicate && !r.skipReason).map((r) => r.tempId))
    );
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  const handleConfirmImport = async () => {
    const selectedRows = rows.filter((r) => selectedIds.has(r.tempId));
    if (selectedRows.length === 0) {
      setError('请至少勾选 1 条待导入流水');
      return;
    }

    setImporting(true);
    setError('');
    try {
      let totalImported = 0;
      let totalDup = 0;
      const CHUNK = 400;

      for (let i = 0; i < selectedRows.length; i += CHUNK) {
        const chunk = selectedRows.slice(i, i + CHUNK).map((r) => ({
          external_id: r.external_id,
          source: r.source,
          type: r.type,
          amount: r.amount,
          account_id: r.account_id,
          category_id: r.category_id || null,
          scene: r.scene || null,
          transaction_time: r.transaction_time,
          remark: r.remark,
        }));

        const res = await fetchApi<{
          imported: number;
          skipped_duplicates: number;
        }>('/api/transactions/import', {
          method: 'POST',
          body: JSON.stringify({ rows: chunk }),
        });

        totalImported += res.imported || 0;
        totalDup += res.skipped_duplicates || 0;
      }

      setResultMsg(`导入完成：新增 ${totalImported} 笔流水，自动跳过重复 ${totalDup} 笔！`);
      onSuccess();
      setTimeout(() => {
        resetState();
        onClose();
      }, 1100);
    } catch (err: any) {
      setError(err?.message || '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
    >
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">
                微信 / 支付宝账单批量导入
              </h3>
              <p className="text-[11px] text-slate-400">
                支持微信 .xlsx/.csv 与支付宝 .csv（GBK/UTF-8 自动解码），按交易单号自动去重
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {resultMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{resultMsg}</span>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-indigo-50/70 border border-indigo-100 text-xs">
                <span className="text-indigo-800">
                  解析账单时将优先按你的自定义规则（当前已启用{' '}
                  <strong>{rules.filter((r) => r.enabled === 1).length}</strong> 条）自动归类与标场景
                </span>
                <button
                  type="button"
                  onClick={() => setRuleModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-white border border-indigo-200 text-indigo-700 font-semibold hover:bg-indigo-100/60 inline-flex items-center gap-1 flex-shrink-0 transition"
                >
                  <Wand2 className="w-3 h-3" />
                  <span>配置规则</span>
                </button>
              </div>
              <label
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`block border-2 border-dashed rounded-3xl p-8 text-center cursor-pointer transition ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50 scale-[1.01] shadow-inner'
                    : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30'
                }`}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.txt"
                  onChange={handleFileChange}
                  disabled={parsing}
                  className="hidden"
                />
                {parsing ? (
                  <div className="flex flex-col items-center gap-2 text-indigo-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-semibold">正在解析账单并比对去重...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {isDragging
                        ? '松开鼠标即可立即解析账单文件'
                        : '拖拽账单文件到此处，或点击选择微信 (.xlsx/.csv) / 支付宝 (.csv)'}
                    </div>
                    <p className="text-xs text-slate-400 max-w-md">
                      全程在浏览器本地解析，仅提交你确认勾选的交易流水；相同交易单号重复导入会自动跳过。
                    </p>
                  </div>
                )}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                  <div className="font-bold text-emerald-800">💬 微信账单导出路径</div>
                  <p className="text-emerald-900/80 leading-relaxed">
                    微信 → 我 → 服务 → 钱包 → 账单 → 右上角「常见问题」→「下载账单」→「用于个人对账」，下载后用解压密码解压得到的 `.xlsx` 或 `.csv` 直接上传。
                  </p>
                </div>
                <div className="p-3.5 rounded-2xl bg-sky-50/60 border border-sky-100 space-y-1">
                  <div className="font-bold text-sky-800">💙 支付宝账单导出路径</div>
                  <p className="text-sky-900/80 leading-relaxed">
                    支付宝 → 我的 → 账单 → 右上角「...」→「开具交易流水证明」→「用于个人对账」，在邮箱解压后上传里面的 `alipay_record_xxxx.csv`。
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Summary & Actions */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`px-2 py-0.5 rounded-md font-bold ${
                      provider === 'wechat'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-sky-100 text-sky-700'
                    }`}
                  >
                    {provider === 'wechat' ? '微信账单' : '支付宝账单'}
                  </span>
                  <span className="text-slate-600">
                    共解析 <strong>{counts.total}</strong> 笔 · 新增待导{' '}
                    <strong className="text-indigo-600">{counts.ready}</strong> · 重复已跳过{' '}
                    <strong className="text-amber-600">{counts.dup}</strong> · 不计收支/关闭{' '}
                    <strong>{counts.skipped}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={handleSelectAllReady}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
                  >
                    全选有效项
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleModalOpen(true)}
                    className="px-2.5 py-1 bg-indigo-50 border border-indigo-200 rounded-lg font-medium text-indigo-700 hover:bg-indigo-100 inline-flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>匹配规则 ({rules.filter((r) => r.enabled === 1).length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-500 hover:text-slate-700"
                  >
                    全不选
                  </button>
                  <button
                    type="button"
                    onClick={resetState}
                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-medium text-slate-500 hover:text-rose-600"
                  >
                    重选文件
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1">
                <Filter className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                {(
                  [
                    { key: 'all', label: `全部 (${counts.total})` },
                    { key: 'ready', label: `建议导入 (${counts.ready})` },
                    { key: 'duplicate', label: `已导入重复 (${counts.dup})` },
                    { key: 'skipped', label: `默认忽略 (${counts.skipped})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => {
                      setFilterTab(tab.key);
                      setRenderLimit(100);
                    }}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition ${
                      filterTab === tab.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Preview List */}
              <div className="space-y-2 max-h-[42vh] overflow-y-auto pr-1">
                {visibleRows.slice(0, renderLimit).map((row) => {
                  const checked = selectedIds.has(row.tempId);
                  const catOptions = row.type === 'expense' ? expenseCategories : incomeCategories;
                  return (
                    <div
                      key={row.tempId}
                      className={`p-3 rounded-2xl border text-xs transition space-y-2 ${
                        row.isDuplicate
                          ? 'bg-amber-50/40 border-amber-200/70 opacity-75'
                          : checked
                          ? 'bg-white border-indigo-200 shadow-sm'
                          : 'bg-slate-50/70 border-slate-200/70 opacity-80'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <label className="flex items-start gap-2.5 cursor-pointer min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={row.isDuplicate}
                            onChange={() => toggleSelect(row.tempId)}
                            className="mt-1 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-slate-800 truncate">{row.remark}</div>
                            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5">
                              <span>{row.transaction_time}</span>
                              <span>· 方式: {row.payMethod}</span>
                              {row.scene && (
                                <span className="px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200/70 font-medium inline-flex items-center gap-0.5">
                                  <Tag className="w-2.5 h-2.5" />
                                  <span>{row.scene}</span>
                                </span>
                              )}
                              {row.matchedRuleName && (
                                <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-medium">
                                  规则: {row.matchedRuleName}
                                </span>
                              )}
                              {row.isDuplicate && (
                                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                                  已导入(自动去重)
                                </span>
                              )}
                              {!row.isDuplicate && row.skipReason && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-medium">
                                  {row.skipReason}
                                </span>
                              )}
                            </div>
                          </div>
                        </label>

                        <span
                          className={`font-black text-sm flex-shrink-0 ${
                            row.type === 'expense' ? 'text-rose-500' : 'text-emerald-600'
                          }`}
                        >
                          {row.type === 'expense' ? '-' : '+'}
                          {formatCurrency(row.amount)}
                        </span>
                      </div>

                      {!row.isDuplicate && (
                        <div className="grid grid-cols-3 gap-2 pl-6">
                          <select
                            value={row.type}
                            onChange={(e) => {
                              const nextType = e.target.value as 'expense' | 'income';
                              const nextCats =
                                nextType === 'expense' ? expenseCategories : incomeCategories;
                              updateRowField(row.tempId, {
                                type: nextType,
                                category_id: nextCats[0]?.id || '',
                              });
                            }}
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px]"
                          >
                            <option value="expense">支出</option>
                            <option value="income">收入</option>
                          </select>

                          <select
                            value={row.account_id}
                            onChange={(e) =>
                              updateRowField(row.tempId, { account_id: e.target.value })
                            }
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] truncate"
                          >
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                          </select>

                          <select
                            value={row.category_id}
                            onChange={(e) =>
                              updateRowField(row.tempId, { category_id: e.target.value })
                            }
                            className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[11px] truncate"
                          >
                            {catOptions.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
                {visibleRows.length > renderLimit && (
                  <div className="pt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRenderLimit((prev) => prev + 200)}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                    >
                      再加载 200 条（当前显示 {renderLimit} / {visibleRows.length} 条）
                    </button>
                    <button
                      type="button"
                      onClick={() => setRenderLimit(visibleRows.length)}
                      className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition"
                    >
                      展开全部
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200/70 rounded-xl transition"
          >
            取消
          </button>

          {rows.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={importing || selectedIds.size === 0}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-200 flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {importing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>
                {importing
                  ? '正在批量写入...'
                  : `确认导入已勾选 (${selectedIds.size} 笔)`}
              </span>
            </button>
          )}
        </div>
      </div>

      <RuleManageModal
        isOpen={ruleModalOpen}
        accounts={accounts}
        categories={categories}
        onClose={() => setRuleModalOpen(false)}
        onChanged={async () => {
          const latest = await loadRules();
          if (rows.length > 0) {
            const defaultExpCat =
              (expenseCategories.find((c) => c.name.includes('其他')) || expenseCategories[0])?.id || '';
            const defaultIncCat =
              (incomeCategories.find((c) => c.name.includes('其他')) || incomeCategories[0])?.id || '';
            setRows((prev) =>
              prev.map((r) => {
                if (r.isDuplicate) return r;
                const applied = applyRulesToParsedRow(
                  categories,
                  latest,
                  {
                    type: r.type,
                    account_id: r.account_id,
                    categoryLabel: r.categoryLabel,
                    counterparty: r.counterparty,
                    product: r.product,
                    remark: r.remark,
                  },
                  defaultExpCat,
                  defaultIncCat
                );
                return {
                  ...r,
                  category_id: applied.category_id,
                  scene: applied.scene,
                  matchedRuleName: applied.matchedRuleName,
                };
              })
            );
          }
        }}
      />
    </div>
  );
};
