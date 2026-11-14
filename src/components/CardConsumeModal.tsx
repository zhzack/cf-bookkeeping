import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, Ticket, CreditCard, Sparkles, AlertCircle } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { PrepaidCardWithStats, Category, Account } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  card: PrepaidCardWithStats | null;
  categories: Category[];
  accounts: Account[];
}

export const CardConsumeModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  card,
  categories,
  accounts,
}) => {
  if (!isOpen || !card) return null;

  const isTimes = card.type === 'times';

  // 计次卡消费次数 / 储值卡消费金额 (元)
  const [timesToConsume, setTimesToConsume] = useState('1');
  const [amountYuan, setAmountYuan] = useState('');
  const [remark, setRemark] = useState('');
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 16).replace('T', ' '));

  // 同步流水
  const [syncLedger, setSyncLedger] = useState(true);
  const [categoryId, setCategoryId] = useState('');
  const [scene, setScene] = useState('');
  const [accountId, setAccountId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setTimesToConsume('1');
    setAmountYuan('');
    setRemark('');
    setDateStr(new Date().toISOString().slice(0, 16).replace('T', ' '));
    setError('');

    // 智能推断常用分类 (例如美发、健身、洗车)
    const expCats = categories.filter((c) => c.type === 'expense');
    const matchedCat = expCats.find((c) =>
      card.name.includes(c.name) ||
      (card.merchant && card.merchant.includes(c.name)) ||
      (card.name.includes('美发') && c.name.includes('美发')) ||
      (card.name.includes('健身') && c.name.includes('运动')) ||
      (card.name.includes('洗车') && c.name.includes('交通'))
    );
    setCategoryId(matchedCat?.id || expCats[0]?.id || '');
    setAccountId(accounts[0]?.id || '');
  }, [card, isOpen, categories, accounts]);

  // 计算本次消费折合的人民币
  let computedRmbCents = 0;
  if (isTimes) {
    const numTimes = parseInt(timesToConsume) || 0;
    computedRmbCents = numTimes * card.per_unit_cost;
  } else {
    computedRmbCents = Math.round((parseFloat(amountYuan) || 0) * 100);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    let valueToDeduct = 0;
    if (isTimes) {
      valueToDeduct = parseInt(timesToConsume);
      if (isNaN(valueToDeduct) || valueToDeduct <= 0) {
        setError('扣减次数必须大于 0');
        return;
      }
      if (valueToDeduct > card.current_value) {
        setError(`卡内仅剩 ${card.current_value} 次，不足本次扣减`);
        return;
      }
    } else {
      const numAmt = parseFloat(amountYuan);
      if (isNaN(numAmt) || numAmt <= 0) {
        setError('扣减金额必须大于 0');
        return;
      }
      valueToDeduct = Math.round(numAmt * 100);
      if (valueToDeduct > card.current_value) {
        setError(`卡内仅剩 ${(card.current_value / 100).toFixed(2)} 元，不足本次扣减`);
        return;
      }
    }

    setLoading(true);
    try {
      await fetchApi(`/api/cards/${card.id}/consume`, {
        method: 'POST',
        body: JSON.stringify({
          value: valueToDeduct,
          remark: remark.trim() || null,
          date: dateStr,
          sync_ledger: syncLedger,
          category_id: syncLedger ? categoryId : null,
          scene: syncLedger ? scene.trim() || null : null,
          account_id: syncLedger ? accountId : null,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '核销打卡失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
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
              <h2 className="text-sm font-bold text-slate-800">核销打卡消费</h2>
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

        {/* Current status banner */}
        <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex items-center justify-between text-xs">
          <div>
            <span className="text-slate-400">卡内当前剩余：</span>
            <span className="font-bold text-slate-800 ml-1">
              {isTimes ? `${card.current_value} 次` : formatCurrency(card.current_value)}
            </span>
          </div>
          {isTimes && card.per_unit_cost > 0 && (
            <div className="text-slate-500">
              单次成本折算：<span className="font-semibold text-indigo-600">{formatCurrency(card.per_unit_cost)}/次</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 核销数值设定 */}
          {isTimes ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">本次核销次数</label>
              <div className="flex items-center gap-2 mb-2">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setTimesToConsume(String(num))}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold border transition ${
                      timesToConsume === String(num)
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-600 shadow-sm'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    扣 {num} 次
                  </button>
                ))}
              </div>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  max={card.current_value}
                  required
                  value={timesToConsume}
                  onChange={(e) => setTimesToConsume(e.target.value)}
                  placeholder="自定义输入扣减次数"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 pr-10"
                />
                <span className="absolute right-3.5 top-2.5 text-xs text-slate-400 font-bold">次</span>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">本次消费扣除卡内金额 (元)</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-sm font-bold text-slate-400">¥</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amountYuan}
                  onChange={(e) => setAmountYuan(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-base font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {/* 金额核算提示 */}
          {computedRmbCents > 0 && (
            <div className="bg-indigo-50/70 p-3 rounded-2xl text-xs text-indigo-700 font-medium flex items-center justify-between">
              <span>折合实际生活消费：</span>
              <span className="text-sm font-bold text-indigo-600">{formatCurrency(computedRmbCents)}</span>
            </div>
          )}

          {/* 说明与消费时间 */}
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">消费说明 / 项目备注</label>
              <input
                type="text"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder={isTimes ? '如: 洗剪吹一次、背部训练私教课' : '如: 午后双人咖啡套餐'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">打卡时间</label>
              <input
                type="text"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                placeholder="YYYY-MM-DD HH:mm"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-mono"
              />
            </div>
          </div>

          {/* 同步生成记账流水选项 */}
          <div className="border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={syncLedger}
                onChange={(e) => setSyncLedger(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-xs font-bold text-slate-800">同步记入生活消费账单</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  将本次核销作为真实生活支出，准确反映当月餐饮、美容、运动等生活开销
                </div>
              </div>
            </label>

            {syncLedger && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">支出分类</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="">未分类</option>
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">消费场景标签 (选填)</label>
                  <input
                    type="text"
                    value={scene}
                    onChange={(e) => setScene(e.target.value)}
                    placeholder="如: 自我提升/社交"
                    className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
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
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? '正在核销...' : '确认核销打卡'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
