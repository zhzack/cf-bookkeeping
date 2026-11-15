import React, { useState } from 'react';
import {
  X,
  FileSpreadsheet,
  Download,
  Calendar,
  Layers,
  CreditCard,
  Package,
  ReceiptText,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportReportModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [scope, setScope] = useState<'transactions' | 'items' | 'cards' | 'subscriptions'>('transactions');
  const [timePreset, setTimePreset] = useState<'all' | 'this_month' | 'last_month' | 'this_year' | 'custom'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleExport = async () => {
    setDownloading(true);
    setError('');

    try {
      let finalStart = '';
      let finalEnd = '';
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;

      if (scope === 'transactions') {
        if (timePreset === 'this_month') {
          const monthStr = `${y}-${String(m).padStart(2, '0')}`;
          const lastDay = new Date(y, m, 0).getDate();
          finalStart = `${monthStr}-01`;
          finalEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
        } else if (timePreset === 'last_month') {
          const lmYear = m === 1 ? y - 1 : y;
          const lmMonth = m === 1 ? 12 : m - 1;
          const monthStr = `${lmYear}-${String(lmMonth).padStart(2, '0')}`;
          const lastDay = new Date(lmYear, lmMonth, 0).getDate();
          finalStart = `${monthStr}-01`;
          finalEnd = `${monthStr}-${String(lastDay).padStart(2, '0')}`;
        } else if (timePreset === 'this_year') {
          finalStart = `${y}-01-01`;
          finalEnd = `${y}-12-31`;
        } else if (timePreset === 'custom') {
          finalStart = startDate;
          finalEnd = endDate;
        }
      }

      const params = new URLSearchParams();
      params.set('scope', scope);
      if (finalStart) params.set('startDate', finalStart);
      if (finalEnd) params.set('endDate', finalEnd);

      const res = await fetch(`/api/backup/export-csv?${params.toString()}`);
      if (!res.ok) {
        throw new Error('导出报表失败');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cf_bookkeeping_${scope}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      setError(err.message || '导出下载失败');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部标题 */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            </div>
            <div>
              <h2 className="text-base font-bold">导出 Excel / CSV 报表</h2>
              <p className="text-[11px] text-teal-100/80">格式化数据导出，Excel / Numbers 打开 100% 不乱码</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* 报表类型选择 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">选择导出报表类型</label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setScope('transactions')}
                className={`p-3 rounded-2xl border-2 text-left transition flex items-start gap-2.5 ${
                  scope === 'transactions'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <ReceiptText className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs">记账流水明细表</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">收支、账户、分类与备注</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScope('items')}
                className={`p-3 rounded-2xl border-2 text-left transition flex items-start gap-2.5 ${
                  scope === 'items'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <Package className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs">持物大件资产清单</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">服役天数、日均成本与残值</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScope('cards')}
                className={`p-3 rounded-2xl border-2 text-left transition flex items-start gap-2.5 ${
                  scope === 'cards'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <CreditCard className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs">会员充值卡与次卡包</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">实付、剩余额度与折算成本</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setScope('subscriptions')}
                className={`p-3 rounded-2xl border-2 text-left transition flex items-start gap-2.5 ${
                  scope === 'subscriptions'
                    ? 'border-emerald-600 bg-emerald-50/50 text-emerald-950 font-bold'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-600'
                }`}
              >
                <Calendar className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs">周期订阅与固定支出</div>
                  <div className="text-[10px] text-slate-400 font-normal mt-0.5">月费年费折算与到期日</div>
                </div>
              </button>
            </div>
          </div>

          {/* 筛选时间区间 (仅流水明细有效) */}
          {scope === 'transactions' && (
            <div className="space-y-2.5 p-3.5 bg-slate-50 rounded-2xl border border-slate-100 animate-fade-in">
              <label className="block text-xs font-bold text-slate-700">筛选导出时段</label>
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(
                  [
                    { key: 'this_month', label: '本月' },
                    { key: 'last_month', label: '上月' },
                    { key: 'this_year', label: '本年度' },
                    { key: 'all', label: '全部历史' },
                    { key: 'custom', label: '自定义时间' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTimePreset(t.key)}
                    className={`px-3 py-1.5 rounded-xl font-semibold transition ${
                      timePreset === t.key
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {timePreset === 'custom' && (
                <div className="grid grid-cols-2 gap-2 pt-1 animate-fade-in">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">起始日期</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">截止日期</label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 友好说明 */}
          <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-2xl flex items-start gap-2 text-[11px] text-teal-800">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <span>
              已注入 <strong>UTF-8 BOM</strong> 签名，支持直接在 Windows / macOS 版 Microsoft Excel、WPS Office
              与 Apple Numbers 中直接打开，绝无中文乱码。
            </span>
          </div>

          {/* 导出按钮 */}
          <button
            type="button"
            onClick={handleExport}
            disabled={downloading}
            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-emerald-200"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? '正在生成报表并下载...' : '立即生成并下载 CSV 报表'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
