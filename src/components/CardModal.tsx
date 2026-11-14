import React, { useState, useEffect } from 'react';
import { X, CreditCard, Sparkles, Scissors, Dumbbell, Car, Coffee, ShoppingBag, Ticket, HeartPulse, Fuel, Layers } from 'lucide-react';
import { fetchApi } from '../api';
import { PrepaidCardWithStats, Account, Category } from '../types';
import { DynamicIcon } from './DynamicIcon';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  cardToEdit?: PrepaidCardWithStats | null;
  accounts: Account[];
  categories: Category[];
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
  'Fuel',
  'Layers',
];

export const CardModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  cardToEdit,
  accounts,
  categories,
}) => {
  const isEdit = Boolean(cardToEdit);

  const [name, setName] = useState('');
  const [merchant, setMerchant] = useState('');
  const [type, setType] = useState<'balance' | 'times'>('balance');
  const [color, setColor] = useState('#6366f1');
  const [icon, setIcon] = useState('CreditCard');

  // 充值实付与面值 (元 或 次数)
  const [amountYuan, setAmountYuan] = useState('');
  const [initialValue, setInitialValue] = useState('');
  const [giftAmountYuan, setGiftAmountYuan] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [isNeverExpires, setIsNeverExpires] = useState(true);
  const [remark, setRemark] = useState('');
  const [status, setStatus] = useState<'active' | 'exhausted' | 'expired' | 'refunded'>('active');

  // 同步流水
  const [syncLedger, setSyncLedger] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (cardToEdit) {
      setName(cardToEdit.name);
      setMerchant(cardToEdit.merchant || '');
      setType(cardToEdit.type);
      setColor(cardToEdit.color || '#6366f1');
      setIcon(cardToEdit.icon || 'CreditCard');
      setAmountYuan((cardToEdit.total_spent_amount / 100).toFixed(2));
      setInitialValue(
        cardToEdit.type === 'times'
          ? String(cardToEdit.total_value)
          : (cardToEdit.total_value / 100).toFixed(2)
      );
      setGiftAmountYuan(
        cardToEdit.gift_amount ? (cardToEdit.gift_amount / 100).toFixed(2) : ''
      );
      if (cardToEdit.valid_until) {
        setValidUntil(cardToEdit.valid_until);
        setIsNeverExpires(false);
      } else {
        setValidUntil('');
        setIsNeverExpires(true);
      }
      setRemark(cardToEdit.remark || '');
      setStatus(cardToEdit.status);
      setSyncLedger(false);
    } else {
      setName('');
      setMerchant('');
      setType('balance');
      setColor('#6366f1');
      setIcon('CreditCard');
      setAmountYuan('');
      setInitialValue('');
      setGiftAmountYuan('');
      setValidUntil('');
      setIsNeverExpires(true);
      setRemark('');
      setStatus('active');
      setSyncLedger(false);
      setAccountId(accounts[0]?.id || '');
      const defaultExpCat = categories.find((c) => c.type === 'expense');
      setCategoryId(defaultExpCat?.id || '');
    }
    setError('');
  }, [isOpen, cardToEdit, accounts, categories]);

  if (!isOpen) return null;

  // 快捷联动：如果录入了实付金额且尚未修改面值，自动填充
  const handleAmountChange = (val: string) => {
    setAmountYuan(val);
    if (type === 'balance' && !initialValue) {
      setInitialValue(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入卡片名称');
      return;
    }

    if (!isEdit) {
      const numAmount = parseFloat(amountYuan);
      if (isNaN(numAmount) || numAmount < 0) {
        setError('请输入正确的实付充值金额');
        return;
      }

      const numVal = parseFloat(initialValue);
      if (isNaN(numVal) || numVal <= 0) {
        setError(type === 'times' ? '总次数必须大于 0' : '卡内初始面值必须大于 0');
        return;
      }
    }

    setLoading(true);
    try {
      if (isEdit && cardToEdit) {
        await fetchApi(`/api/cards/${cardToEdit.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: name.trim(),
            merchant: merchant.trim() || null,
            icon,
            color,
            valid_until: isNeverExpires ? null : validUntil || null,
            remark: remark.trim() || null,
            status,
          }),
        });
      } else {
        const amountCents = Math.round((parseFloat(amountYuan) || 0) * 100);
        const giftCents = Math.round((parseFloat(giftAmountYuan) || 0) * 100);
        const parsedInitialValue =
          type === 'times'
            ? Math.round(parseFloat(initialValue) || 0)
            : Math.round((parseFloat(initialValue) || 0) * 100);

        await fetchApi('/api/cards', {
          method: 'POST',
          body: JSON.stringify({
            name: name.trim(),
            type,
            merchant: merchant.trim() || null,
            icon,
            color,
            amount: amountCents,
            initial_value: parsedInitialValue,
            gift_amount: giftCents,
            valid_until: isNeverExpires ? null : validUntil || null,
            remark: remark.trim() || null,
            account_id: syncLedger ? accountId : null,
            sync_ledger: syncLedger,
            category_id: syncLedger ? categoryId : null,
          }),
        });
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  // 单次成本或折扣预览
  const numAmt = parseFloat(amountYuan) || 0;
  const numVal = parseFloat(initialValue) || 0;
  let calculationTip = '';
  if (type === 'times' && numAmt > 0 && numVal > 0) {
    const perCost = (numAmt / numVal).toFixed(2);
    calculationTip = `折算单次实际成本：¥${perCost} / 次`;
  } else if (type === 'balance' && numAmt > 0 && numVal > 0) {
    if (numVal > numAmt) {
      const discount = ((numAmt / numVal) * 10).toFixed(1);
      calculationTip = `实付 ¥${numAmt} 得面值 ¥${numVal}（相当于 ${discount} 折优惠）`;
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white"
              style={{ backgroundColor: color }}
            >
              <DynamicIcon name={icon} className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-slate-800">
              {isEdit ? '编辑会员充值卡' : '添加会员充值卡 / 次卡'}
            </h2>
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
            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl text-xs font-medium border border-rose-100">
              {error}
            </div>
          )}

          {/* 卡片类型 (仅新增时可选) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">卡片形式</label>
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
          )}

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
                placeholder={type === 'times' ? '如: 健身私教20节卡' : '如: 美容美发储值卡'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">商家 / 门店名称</label>
              <input
                type="text"
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                placeholder="如: 威尔仕健身、永琪造型"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* 图标与卡片色调 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">卡面主题色与图标</label>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {COLOR_PRESETS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition flex items-center justify-center ${
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

          {/* 充值开卡金额设定 (仅新增时) */}
          {!isEdit && (
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-3">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>充值与面值设定</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-medium">实付充值金额 (元)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={amountYuan}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  />
                </div>

                {type === 'times' ? (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1 font-medium">购买总次数 (次)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      required
                      value={initialValue}
                      onChange={(e) => setInitialValue(e.target.value)}
                      placeholder="如: 10, 20"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-slate-500 mb-1 font-medium">卡内总面值 (元)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={initialValue}
                      onChange={(e) => setInitialValue(e.target.value)}
                      placeholder="如充1000得1100填1100"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                    />
                  </div>
                )}
              </div>

              {type === 'balance' && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-medium">其中商家赠送金额 (元，可选)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={giftAmountYuan}
                    onChange={(e) => setGiftAmountYuan(e.target.value)}
                    placeholder="如: 100.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  />
                </div>
              )}

              {calculationTip && (
                <div className="text-xs font-semibold text-indigo-600 bg-indigo-50/70 px-3 py-1.5 rounded-xl">
                  💡 {calculationTip}
                </div>
              )}
            </div>
          )}

          {/* 有效期设定 */}
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

          {/* 编辑状态下的卡片状态 */}
          {isEdit && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">卡片状态</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="active">🟢 正常在服役</option>
                <option value="exhausted">⚪ 已用尽 / 次数归零</option>
                <option value="expired">🔴 已过期</option>
                <option value="refunded">🟡 已退卡 / 作废</option>
              </select>
            </div>
          )}

          {/* 同步记账流水选项 (仅新增时) */}
          {!isEdit && (
            <div className="border border-slate-200/80 rounded-2xl p-3.5 space-y-2.5">
              <label className="flex items-start gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={syncLedger}
                  onChange={(e) => setSyncLedger(e.target.checked)}
                  className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">同步从账户扣款并生成充值支出账单</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    系统会自动标记此流水「不计入日常生活成本」，杜绝大额充值瞬间扭曲当月生活日均
                  </div>
                </div>
              </label>

              {syncLedger && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">扣款付款账户</label>
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">记账分类</label>
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
                </div>
              )}
            </div>
          )}

          {/* 备注 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">备注信息</label>
            <textarea
              rows={2}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="如: 卡号 6228...、仅限虹桥天地店使用、需提前1天预约"
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
            />
          </div>

          {/* Buttons */}
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
              {loading ? '正在保存...' : isEdit ? '保存修改' : '确认添加'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
