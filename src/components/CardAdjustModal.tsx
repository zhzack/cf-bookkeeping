import React, { useState, useEffect } from 'react';
import { X, Sliders, AlertCircle } from 'lucide-react';
import { fetchApi } from '../api';
import { PrepaidCardWithStats } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  card: PrepaidCardWithStats | null;
}

export const CardAdjustModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  card,
}) => {
  if (!isOpen || !card) return null;

  const isTimes = card.type === 'times';
  const [targetValue, setTargetValue] = useState('');
  const [remark, setRemark] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTargetValue(isTimes ? String(card.current_value) : (card.current_value / 100).toFixed(2));
    setRemark('');
    setError('');
  }, [card, isOpen, isTimes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const numVal = parseFloat(targetValue);
    if (isNaN(numVal) || numVal < 0) {
      setError('目标剩余值不能为负数');
      return;
    }

    setLoading(true);
    try {
      const parsedTarget = isTimes ? Math.round(numVal) : Math.round(numVal * 100);

      await fetchApi(`/api/cards/${card.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          target_value: parsedTarget,
          remark: remark.trim() || null,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '校准失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: card.color || '#6366f1' }}
            >
              <DynamicIcon name={card.icon || 'credit-card'} className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">校准卡内剩余</h2>
              <div className="text-[11px] text-slate-400">{card.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-2xl text-xs text-slate-500">
            当商家系统次数/余额与记账不一致、或商家额外赠送了次数时，可在此直接强制修正卡内剩余。
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              修正后的实际剩余 {isTimes ? '(次)' : '(元)'}
            </label>
            <input
              type="number"
              step={isTimes ? '1' : '0.01'}
              min="0"
              required
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">校准原因 / 备注</label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如: 商家周年庆额外赠送1次"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50 flex items-center gap-1.5"
            >
              <Sliders className="w-4 h-4" />
              <span>{loading ? '正在校准...' : '确认校准'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
