import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  ArrowRight,
  Database,
  Layers,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const ThirdPartyImportModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [createAccounts, setCreateAccounts] = useState(true);
  const [createCategories, setCreateCategories] = useState(true);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('请上传 .csv 格式的账单文件');
      return;
    }

    setFile(selected);
    setError('');
    setResultMsg('');
    setParsing(true);
    setParsedData(null);

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const res = await fetchApi<any>('/api/backup/parse-third-party', {
          method: 'POST',
          body: JSON.stringify({ csv_text: text }),
        });
        setParsedData(res);
      } catch (err: any) {
        setError(err.message || '解析 CSV 账单失败');
        setParsedData(null);
      } finally {
        setParsing(false);
      }
    };
    reader.readAsText(selected);
  };

  const handleConfirmImport = async () => {
    if (!parsedData || !parsedData.all_rows || parsedData.all_rows.length === 0) return;

    setImporting(true);
    setError('');
    setResultMsg('');

    try {
      const res = await fetchApi<any>('/api/backup/import-third-party', {
        method: 'POST',
        body: JSON.stringify({
          rows: parsedData.all_rows,
          create_missing_accounts: createAccounts,
          create_missing_categories: createCategories,
        }),
      });

      setResultMsg(
        `导入完成！成功录入 ${res.imported_count || 0} 笔交易，新建 ${
          res.new_accounts_count || 0
        } 个账户与 ${res.new_categories_count || 0} 个分类。`
      );
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err: any) {
      setError(err.message || '批量导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部标题 */}
        <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <FileSpreadsheet className="w-4 h-4 text-blue-200" />
            </div>
            <div>
              <h2 className="text-base font-bold">第三方记账应用数据搬家</h2>
              <p className="text-[11px] text-blue-100/80">支持从钱迹、随手记、鲨鱼记账等 CSV 一键无损迁移</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
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
            accept=".csv,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-blue-50/30 transition group"
            >
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <div className="text-xs font-bold text-slate-700">点击选择或拖拽第三方导出的 CSV 文件</div>
              <p className="text-[11px] text-slate-400 mt-1">
                支持 钱迹 (Qianji)、随手记、鲨鱼记账 或 标准通用 CSV 表格
              </p>
            </div>
          ) : (
            <div className="p-3 bg-blue-50/50 border border-blue-100 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-7 h-7 text-blue-600 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-slate-800">{file.name}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    大小: {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  setParsedData(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 font-medium"
              >
                重选文件
              </button>
            </div>
          )}

          {parsing && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <RotateCw className="w-6 h-6 text-blue-600 animate-spin" />
              <div className="text-xs font-bold text-slate-700">正在智能解析账单数据...</div>
            </div>
          )}

          {/* 解析预检结果 */}
          {parsedData && !parsing && (
            <div className="space-y-3.5 animate-fade-in">
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-blue-600" />
                    <span>账单识别概况</span>
                  </span>
                  <span className="text-xs font-black text-blue-600">
                    共识别 {parsedData.total_parsed} 笔流水
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 space-y-1">
                  <div>
                    <span className="font-semibold text-slate-700">涉及账户：</span>
                    {parsedData.discovered_accounts?.join('、') || '默认通用账户'}
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">涉及分类：</span>
                    {parsedData.discovered_categories?.slice(0, 8).join('、')}
                    {parsedData.discovered_categories?.length > 8 && '...'}
                  </div>
                </div>
              </div>

              {/* 样本流水预览 */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">流水样本预览 (前 5 笔)</div>
                <div className="bg-slate-50 border border-slate-100 rounded-xl divide-y divide-slate-100 text-xs overflow-hidden max-h-40 overflow-y-auto">
                  {parsedData.sample_rows?.slice(0, 5).map((row: any, idx: number) => (
                    <div key={idx} className="p-2 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-slate-800 truncate">
                          {row.remark || row.category_name}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {row.transaction_time} · {row.account_name} · {row.category_name}
                        </div>
                      </div>
                      <div
                        className={`font-bold shrink-0 ${
                          row.type === 'income' ? 'text-emerald-600' : 'text-rose-500'
                        }`}
                      >
                        {row.type === 'income' ? '+' : '-'}¥{row.amount_yuan?.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 导入选项 */}
              <div className="space-y-2 pt-1 text-xs text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createAccounts}
                    onChange={(e) => setCreateAccounts(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <span>账单中出现新账户时，自动创建该账户</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={createCategories}
                    onChange={(e) => setCreateCategories(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                  />
                  <span>账单中出现新分类时，自动创建该分类</span>
                </label>
              </div>

              {/* 确认导入按钮 */}
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-blue-200"
              >
                {importing ? (
                  <>
                    <RotateCw className="w-4 h-4 animate-spin" />
                    <span>正在批量入库中...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>确认导入全部 {parsedData.total_parsed} 笔流水</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
