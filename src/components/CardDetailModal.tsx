import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, PlusCircle, Sliders, Edit3, Trash2, Calendar, Clock, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { fetchApi, formatCurrency, formatDateTime } from '../api';
import { PrepaidCardWithStats, PrepaidCardLog } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  cardId: string | null;
  onConsume: (card: PrepaidCardWithStats) => void;
  onRecharge: (card: PrepaidCardWithStats) => void;
  onAdjust: (card: PrepaidCardWithStats) => void;
  onEdit: (card: PrepaidCardWithStats) => void;
  onDelete: (cardId: string) => void;
}

export const CardDetailModal: React.FC<Props> = ({
  isOpen,
  onClose,
  cardId,
  onConsume,
  onRecharge,
  onAdjust,
  onEdit,
  onDelete,
}) => {
  const [card, setCard] = useState<PrepaidCardWithStats | null>(null);
  const [logs, setLogs] = useState<PrepaidCardLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDetail = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ card: PrepaidCardWithStats; logs: PrepaidCardLog[] }>(`/api/cards/${id}`);
      setCard(res.card);
      setLogs(res.logs || []);
    } catch (err: any) {
      setError(err.message || '获取卡片明细失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && cardId) {
      loadDetail(cardId);
    } else {
      setCard(null);
      setLogs([]);
    }
  }, [isOpen, cardId]);

  if (!isOpen) return null;

  const isTimes = card?.type === 'times';

  const getLogTypeBadge = (type: PrepaidCardLog['type']) => {
    switch (type) {
      case 'recharge':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">充值</span>;
      case 'consume':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-100">核销</span>;
      case 'adjust':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-600 border border-purple-100">校准</span>;
      case 'refund':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100">退卡</span>;
      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-800">卡包明细与使用轨迹</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading || !card ? (
            <div className="py-16 text-center text-slate-400 text-xs">加载中...</div>
          ) : (
            <>
              {/* Card Realistic Preview Banner */}
              <div
                className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden flex flex-col justify-between min-h-[170px]"
                style={{
                  background: `linear-gradient(135deg, ${card.color || '#6366f1'} 0%, #1e1b4b 100%)`,
                }}
              >
                {/* Background watermarks */}
                <div className="absolute right-[-20px] bottom-[-20px] opacity-10 pointer-events-none">
                  <DynamicIcon name={card.icon || 'credit-card'} className="w-44 h-44 text-white" />
                </div>

                {/* Top of Card */}
                <div className="flex items-start justify-between relative z-10">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/20">
                      <DynamicIcon name={card.icon || 'credit-card'} className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-sm font-bold tracking-wide">{card.name}</div>
                      {card.merchant && (
                        <div className="text-[11px] text-white/75">{card.merchant}</div>
                      )}
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-white/20 backdrop-blur-md border border-white/20">
                    {isTimes ? '计次卡' : '储值卡'}
                  </span>
                </div>

                {/* Bottom of Card */}
                <div className="relative z-10 mt-6 flex items-end justify-between">
                  <div>
                    <div className="text-[11px] text-white/70 font-medium">当前卡内剩余</div>
                    <div className="text-2xl font-black mt-0.5 tracking-tight">
                      {isTimes ? `${card.current_value} 次` : formatCurrency(card.current_value)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-white/70">
                      {card.valid_until ? `有效期至 ${card.valid_until}` : '长期有效'}
                    </div>
                    {isTimes && card.per_unit_cost > 0 && (
                      <div className="text-xs font-semibold text-white/90 mt-0.5">
                        折算 ¥{(card.per_unit_cost / 100).toFixed(0)}/次
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress Bar & Value stats */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">使用进度</span>
                  <span className="font-bold text-slate-700">
                    {isTimes
                      ? `已消费 ${card.consumed_value} 次 / 累计总 ${card.total_value} 次 (${card.usage_percent}%)`
                      : `已消费 ${formatCurrency(card.consumed_value)} / 总额度 ${formatCurrency(card.total_value)} (${card.usage_percent}%)`}
                  </span>
                </div>
                <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${card.usage_percent}%`,
                      backgroundColor: card.color || '#6366f1',
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs">
                  <div>
                    <span className="text-slate-400">累计实付总投入：</span>
                    <span className="font-bold text-slate-800 ml-1">{formatCurrency(card.total_spent_amount)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-400">剩余折算残值：</span>
                    <span className="font-bold text-emerald-600 ml-1">{formatCurrency(card.remaining_worth)}</span>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  onClick={() => {
                    onClose();
                    onConsume(card);
                  }}
                  className="py-2.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold transition flex flex-col items-center gap-1 shadow-sm shadow-indigo-600/20"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>核销打卡</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onRecharge(card);
                  }}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex flex-col items-center gap-1"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>续充追加</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onAdjust(card);
                  }}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex flex-col items-center gap-1"
                >
                  <Sliders className="w-4 h-4" />
                  <span>校准数值</span>
                </button>
                <button
                  onClick={() => {
                    onClose();
                    onEdit(card);
                  }}
                  className="py-2.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl text-xs font-bold transition flex flex-col items-center gap-1"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>编辑卡片</span>
                </button>
              </div>

              {card.remark && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-3 text-xs text-amber-800">
                  <span className="font-bold">备注信息：</span>
                  {card.remark}
                </div>
              )}

              {/* Timeline Logs */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 mb-3 flex items-center justify-between">
                  <span>打卡与充值变动历史 ({logs.length})</span>
                </h3>

                {logs.length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl">
                    暂无充值或核销变动记录
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {logs.map((log) => {
                      const isNegative = log.delta_value < 0;
                      return (
                        <div
                          key={log.id}
                          className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 flex items-center justify-between text-xs"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {getLogTypeBadge(log.type)}
                              <span className="font-semibold text-slate-800">
                                {log.remark || (log.type === 'consume' ? '打卡核销' : '账户充值')}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2">
                              <span>{formatDateTime(log.log_time)}</span>
                              {log.account_name && (
                                <span>• 账户: {log.account_name}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`font-black text-sm ${
                                isNegative ? 'text-indigo-600' : 'text-emerald-600'
                              }`}
                            >
                              {isNegative ? '' : '+'}
                              {isTimes
                                ? `${log.delta_value} 次`
                                : formatCurrency(log.delta_value)}
                            </div>
                            {log.actual_amount > 0 && (
                              <div className="text-[10px] text-slate-400">
                                折合 {formatCurrency(log.actual_amount)}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Danger Zone */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`确定要删除充值卡「${card.name}」吗？相关打卡记录也会一并删除，但已生成的日常流水不会丢失。`)) {
                      onClose();
                      onDelete(card.id);
                    }
                  }}
                  className="px-3 py-1.5 rounded-xl text-rose-500 hover:bg-rose-50 text-xs font-semibold transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除此卡</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
