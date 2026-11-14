import React, { useState, useEffect } from 'react';
import { X, CreditCard, Ticket, Sparkles, AlertCircle } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Transaction } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  transaction: Transaction | null;
}

const COLOR_PRESETS = [
  { name: '经典紫蓝', value: '#6366f1' },
  { name: '翡翠墨绿', value: '#10b981' },
  { name: '活力曜金', value: '#f59e0b' },
  { name: '热烈玫红', value: '#f43f5e' },
  { name: '深邃群青', value: '#0ea5e9' },
  { name: '高贵流紫', value: '#a855f7' },
  { name: '黑金曜石', value: '#334155' },
];

const ICON_PRESETS = [
  'CreditCard',
  'Scissors',
  'Dumbbell',
  'Car',
  'Coffee',
  'ShoppingBag',
  'Sparkles',
  'Ticket',
  'HeartPulse',
];

export const ConvertToCardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  transaction,
}) => {
  if (!isOpen || !transaction) return null;

  const [name, setName] = useState('');
  const [merchant, setMerchant] = useState('');
  const [type, setType] = useState<'balance' | 'times'>('balance');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('CreditCard');

  const [initialTimes, setInitialTimes] = useState('10');
  const [initialBalanceYuan, setInitialBalanceYuan] = useState('');
  const [giftAmountYuan, setGiftAmountYuan] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [isNeverExpires, setIsNeverExpires] = useState(true);
  const [remark, setRemark] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (transaction) {
      const defaultName = transaction.remark?.trim() || transaction.category_name || '会员充值卡';
      setName(defaultName);
      setMerchant('');
      setType('balance');
      setColor('#6366f1');
      setIcon('CreditCard');

      const rmb = (transaction.amount / 100).toFixed(2);
      setInitialBalanceYuan(rmb);
      setInitialTimes('10');
      setGiftAmountYuan('');
      setValidUntil('');
      setIsNeverExpires(true);
      setRemark(transaction.remark || '');
    }
    setError('');
  }, [transaction]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入卡片名称');
      return;
    }

    let parsedInitialValue = 0;
    if (type === 'times') {
      parsedInitialValue = parseInt(initialTimes);
      if (isNaN(parsedInitialValue) || parsedInitialValue <= 0) {
        setError('购买总次数必须大于 0');
        return;
      }
    } else {
      const numBal = parseFloat(initialBalanceYuan);
      if (isNaN(numBal) || numBal <= 0) {
        setError('卡内初始面值必须大于 0');
        return;
      }
      parsedInitialValue = Math.round(numBal * 100);
    }

    setLoading(true);
    try {
      const giftCents = Math.round((parseFloat(giftAmountYuan) || 0) * 100);

      await fetchApi(`/api/transactions/${transaction.id}/convert-to-card`, {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          type,
          merchant: merchant.trim() || null,
          icon,
          color,
          initial_value: parsedInitialValue,
          gift_amount: giftCents,
          valid_until: isNeverExpires ? null : validUntil || null,
          remark: remark.trim() || null,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '转换失败');
    } finally {
      setLoading(false);
    }
  };

  // 提示信息
  const txAmountYuan = transaction.amount / 100;
  let tipText = '';
  if (type === 'times') {
    const times = parseInt(initialTimes) || 0;
    if (times > 0) {
      const perCost = (txAmountYuan / times).toFixed(2);
      tipText = `折算单次实际成本：¥${perCost} / 次`;
    }
  } else {
    const bal = parseFloat(initialBalanceYuan) || 0;
    if (bal > txAmountYuan) {
      const discount = ((txAmountYuan / bal) * 10).toFixed(1);
      tipText = `实付 ¥${txAmountYuan} 得面值 ¥${bal}（相当于 ${discount} 折优惠）`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">将已有支出转为会员充值卡</h2>
              <div className="text-[11px] text-slate-400">
                实付金额：{formatCurrency(transaction.amount)} • {transaction.transaction_time.slice(0, 10)}
              </div>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-amber-50/70 border border-amber-100 p-3 rounded-2xl text-xs text-amber-800">
            💡 转换后，此笔支出将绑定充值卡并自动标记为「不计入日常生活成本」，后续可在此卡包中按次打卡或扣款核销。
          </div>

          {/* 卡片类型 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">充值卡形式</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                type="button"
                onClick={() => setType('balance')}
                className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  type === 'balance'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>储值余额卡 (按金额扣款)</span>
              </button>
              <button
                type="button"
                onClick={() => setType('times')}
                className={`py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                  type === 'times'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Ticket className="w-3.5 h-3.5" />
                <span>计次卡 / 次卡 (按次数核销)</span>
              </button>
            </div>
          </div>

          {/* 卡片名称与商家 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                卡片名称 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="如: 威尔仕私教20节卡"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">商家 / 门店名称</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="如: 威尔仕健身"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 次数或面值 */}
          {type === 'times' ? (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">初始总次数 (次)</label>
              <input
                type="number"
                min="1"
                required
                value={initialTimes}
                onChange={(e) => setInitialTimes(e.target.value)}
                placeholder="如: 10, 20"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">卡内总面值 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={initialBalanceYuan}
                  onChange={(e) => setInitialBalanceYuan(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">其中商家赠送金额 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={giftAmountYuan}
                  onChange={(e) => setGiftAmountYuan(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
            </div>
          )}

          {tipText && (
            <div className="text-xs font-semibold text-indigo-600 bg-indigo-50/70 px-3 py-1.5 rounded-xl">
              💡 {tipText}
            </div>
          )}

          {/* 主题色与图标 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">卡面主题色与图标</label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition ${
                    color === c.value ? 'border-slate-800 scale-110 shadow-sm' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ICON_PRESETS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setIcon(ic)}
                  className={`p-2 rounded-xl border transition ${
                    icon === ic
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-600'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  <DynamicIcon name={ic} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* 有效期 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">有效期截止日</label>
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isNeverExpires}
                  onChange={(e) => setIsNeverExpires(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>长期有效 / 无固定期限</span>
              </label>
            </div>
            {!isNeverExpires && (
              <input
                type="date"
                required={!isNeverExpires}
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            )}
          </div>

          {/* 备注 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">备注信息</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如: 卡号、适用门店、限制条件等"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Submit */}
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
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
            >
              {loading ? '正在转换...' : '确认转换为充值卡'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
