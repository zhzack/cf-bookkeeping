import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  FileJson,
  Database,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { fetchApi } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BackupRestoreModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [backupContent, setBackupContent] = useState<any | null>(null);
  const [mode, setMode] = useState<'merge' | 'overwrite'>('merge');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.endsWith('.json')) {
      setError('请上传 .json 格式的备份文件');
      return;
    }

    setFile(selected);
    setError('');
    setResultMsg('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const data = parsed.data || parsed;

        if (!data.accounts && !data.categories && !data.transactions) {
          throw new Error('未在 JSON 文件中找到有效的记账数据结构');
        }

        setBackupContent(parsed);
      } catch (err: any) {
        setError(err.message || '解析备份 JSON 失败，请确认文件完整性');
        setBackupContent(null);
      }
    };
    reader.readAsText(selected);
  };

  const handleRestore = async () => {
    if (!backupContent) return;

    if (mode === 'overwrite') {
      const confirmText = window.prompt(
        '【警告】完全覆盖模式将先清空当前账本中的所有流水、大件和卡包，然后再执行还原！\n\n如果确认清空并覆盖，请输入 "确认清空并还原"：'
      );
      if (confirmText !== '确认清空并还原') {
        return;
      }
    }

    setLoading(true);
    setError('');
    setResultMsg('');

    try {
      const res = await fetchApi<{ success: boolean; message: string; restored: any }>(
        '/api/backup/restore-full',
        {
          method: 'POST',
          body: JSON.stringify({
            backup_data: backupContent,
            mode,
          }),
        }
      );

      const r = res.restored || {};
      setResultMsg(
        `还原成功！共恢复：${r.accounts || 0} 个账户、${r.categories || 0} 个分类、${
          r.transactions || 0
        } 笔流水、${r.items || 0} 件大件装备、${r.prepaid_cards || 0} 张卡包、${
          r.subscriptions || 0
        } 个订阅。`
      );
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      setError(err.message || '还原执行失败');
    } finally {
      setLoading(false);
    }
  };

  const counts = backupContent?.counts || {
    accounts: backupContent?.data?.accounts?.length || backupContent?.accounts?.length || 0,
    categories: backupContent?.data?.categories?.length || backupContent?.categories?.length || 0,
    transactions: backupContent?.data?.transactions?.length || backupContent?.transactions?.length || 0,
    items: backupContent?.data?.items?.length || backupContent?.items?.length || 0,
    prepaid_cards: backupContent?.data?.prepaid_cards?.length || backupContent?.prepaid_cards?.length || 0,
    subscriptions: backupContent?.data?.subscriptions?.length || backupContent?.subscriptions?.length || 0,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 标题 */}
        <div className="bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <RotateCcw className="w-4 h-4 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-base font-bold">灾备还原与数据恢复</h2>
              <p className="text-[11px] text-indigo-100/80">从 JSON 备份文件无损恢复全部账目资产</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单主体 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {resultMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-800 font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <span>{resultMsg}</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleFileChange}
            className="hidden"
          />

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-slate-700">点击选择或拖拽备份 JSON 文件</div>
              <p className="text-[11px] text-slate-400 mt-1">
                支持系统此前导出的 cf_bookkeeping_backup_*.json 全量备份文件
              </p>
            </div>
          ) : (
            <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileJson className="w-8 h-8 text-indigo-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">{file.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    文件大小: {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setBackupContent(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                更换文件
              </button>
            </div>
          )}

          {/* 备份内容预检卡片 */}
          {backupContent && (
            <div className="space-y-3.5 animate-fade-in">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-indigo-600" />
                    <span>备份元数据预检</span>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    导出时间: {backupContent.export_time ? backupContent.export_time.slice(0, 10) : '未知'}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">流水明细</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.transactions} 笔</div>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">资产账户</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.accounts} 个</div>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">收支分类</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.categories} 个</div>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">大件装备</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.items} 件</div>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">会员卡包</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.prepaid_cards} 张</div>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-100">
                    <div className="text-[10px] text-slate-400">周期订阅</div>
                    <div className="text-sm font-black text-indigo-600 mt-0.5">{counts.subscriptions} 个</div>
                  </div>
                </div>
              </div>

              {/* 还原模式选择 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">选择还原策略</label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setMode('merge')}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition ${
                      mode === 'merge'
                        ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>智能增量合并</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700 font-semibold">推荐</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      保留当前账本数据，仅补充导入不存在的账户、分类、流水和大件。
                    </p>
                  </div>

                  <div
                    onClick={() => setMode('overwrite')}
                    className={`p-3 rounded-2xl border-2 cursor-pointer transition ${
                      mode === 'overwrite'
                        ? 'border-rose-500 bg-rose-50/40 text-rose-900'
                        : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span className="text-rose-700">完全清空覆盖</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-semibold">慎用</span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      先彻底清空当前所有账本数据，然后 100% 还原备份（用于换库或灾难恢复）。
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 确认还原按钮 */}
          <button
            type="button"
            onClick={handleRestore}
            disabled={!backupContent || loading}
            className={`w-full py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md ${
              mode === 'overwrite'
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
            } disabled:opacity-50`}
          >
            {loading ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>正在执行还原中，请稍候...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>{mode === 'overwrite' ? '确认清空并执行覆盖还原' : '确认执行智能合并还原'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
