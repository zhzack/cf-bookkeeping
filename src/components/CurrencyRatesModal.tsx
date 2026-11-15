import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Check, Edit2, Info } from 'lucide-react';
import { fetchApi } from '../api';
import { CurrencyRate } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onRatesUpdated?: () => void;
}

export const CurrencyRatesModal: React.FC<Props> = ({ isOpen, onClose, onRatesUpdated }) => {
  const [rates, setRates] = useState<CurrencyRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editRateStr, setEditRateStr] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadRates = async () => {
    setLoading(true);
    try {
      const data = await fetchApi<{ rates: CurrencyRate[] }>('/api/currency/rates');
      setRates(data.rates || []);
    } catch (err: any) {
      setError(err.message || '加载汇率失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccessMsg('');
      setEditingCode(null);
      loadRates();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRefreshLive = async () => {
    setRefreshing(true);
    setError('');
    setSuccessMsg('');
    try {
      const data = await fetchApi<{ message: string; rates: CurrencyRate[] }>('/api/currency/refresh', {
        method: 'POST',
      });
      setRates(data.rates || []);
      setSuccessMsg('实时牌价已成功拉取并更新');
      if (onRatesUpdated) onRatesUpdated();
    } catch (err: any) {
      setError(err.message || '拉取实时牌价失败');
    } finally {
      setRefreshing(false);
    }
  };

  const handleStartEdit = (rate: CurrencyRate) => {
    setEditingCode(rate.code);
    setEditRateStr(String(rate.rate_to_cny));
    setError('');
    setSuccessMsg('');
  };

  const handleSaveRate = async (code: string) => {
    const val = parseFloat(editRateStr);
    if (isNaN(val) || val <= 0) {
      setError('请输入有效的正数汇率');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await fetchApi(`/api/currency/rate/${code}`, {
        method: 'PUT',
        body: JSON.stringify({ rate_to_cny: val }),
      });
      setRates((prev) =>
        prev.map((r) => (r.code === code ? { ...r, rate_to_cny: val, updated_at: '刚刚' } : r))
      );
      setEditingCode(null);
      setSuccessMsg(`已更新 ${code} 汇率`);
      if (onRatesUpdated) onRatesUpdated();
    } catch (err: any) {
      setError(err.message || '保存汇率失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <span>💱</span>
              <span>外汇汇率中心</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">支持全球主流货币折算 CNY 汇率与实时牌价</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefreshLive}
              disabled={refreshing || loading}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
              title="拉取最新外汇牌价"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? '更新中...' : '同步最新牌价'}</span>
            </button>
            <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status / Alert Messages */}
        <div className="px-5 pt-3 flex-shrink-0">
          {error && (
            <div className="mb-2 p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-2 p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}
          <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-2 text-slate-500 text-[11px] leading-relaxed">
            <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
            <span>
              基准货币为 <strong>人民币 (CNY)</strong>。汇率表示 1 单位该外币折合多少人民币。汇率用于多币种外汇钱包资产统一核算及换汇转账换算。
            </span>
          </div>
        </div>

        {/* Currency Rates List */}
        <div className="flex-1 overflow-y-auto p-5 divide-y divide-slate-100">
          {rates.map((rate) => {
            const isBase = rate.code === 'CNY';
            const isEditing = editingCode === rate.code;

            return (
              <div key={rate.code} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center flex-shrink-0 shadow-sm">
                    {rate.symbol}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-slate-800">{rate.name}</span>
                      <span className="text-xs font-semibold text-slate-400">({rate.code})</span>
                      {isBase && (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-md font-medium">
                          本位币
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      更新时间: {rate.updated_at ? rate.updated_at.slice(0, 16) : '系统内置'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-right">
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.0001"
                        value={editRateStr}
                        onChange={(e) => setEditRateStr(e.target.value)}
                        className="w-24 px-2 py-1 text-xs border border-indigo-400 rounded-lg text-right font-mono focus:outline-none"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveRate(rate.code)}
                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                        title="保存"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingCode(null)}
                        className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"
                        title="取消"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="text-sm font-bold font-mono text-slate-800">
                          {isBase ? '1.0000' : rate.rate_to_cny.toFixed(4)}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {isBase ? '1 CNY = 1 CNY' : `1 ${rate.code} ≈ ¥${rate.rate_to_cny.toFixed(4)}`}
                        </div>
                      </div>
                      {!isBase && (
                        <button
                          onClick={() => handleStartEdit(rate)}
                          className="p-1.5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition"
                          title="自定义汇率"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
