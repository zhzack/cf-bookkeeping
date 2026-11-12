import React, { useState, useEffect } from 'react';
import { X, Check, Trash2, Calendar, DollarSign, Clock, ShieldCheck, MapPin, Snowflake, Sparkles } from 'lucide-react';
import { fetchApi } from '../api';
import { Item, ItemWithStats, Account, AttachmentPhoto } from '../types';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialItem?: ItemWithStats | null;
  accounts?: Account[];
  defaultWishlist?: boolean;
}

const CATEGORIES = [
  { name: '数码科技', icon: 'Laptop' },
  { name: '家电厨卫', icon: 'Tv' },
  { name: '居家家具', icon: 'Armchair' },
  { name: '穿搭首饰', icon: 'Watch' },
  { name: '运动出行', icon: 'Car' },
  { name: '其他大件', icon: 'Package' },
];

const LIFESPAN_PRESETS = [
  { label: '1 年', days: 365 },
  { label: '2 年', days: 730 },
  { label: '3 年', days: 1095 },
  { label: '5 年', days: 1825 },
];

const COOLING_PRESETS = [
  { label: '3 天', days: 3 },
  { label: '7 天', days: 7 },
  { label: '14 天', days: 14 },
  { label: '30 天', days: 30 },
];

export const ItemModal: React.FC<Props> = ({ 
  isOpen, 
  onClose, 
  onSuccess, 
  initialItem,
  accounts = [],
  defaultWishlist = false,
}) => {
  const [isWishlistMode, setIsWishlistMode] = useState(defaultWishlist);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('数码科技');
  const [priceStr, setPriceStr] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<'using' | 'retired' | 'sold' | 'idle' | 'wishlist'>('using');
  const [retiredDate, setRetiredDate] = useState('');
  const [resalePriceStr, setResalePriceStr] = useState('');
  const [expectedDays, setExpectedDays] = useState<number | ''>(1095);
  const [warrantyDate, setWarrantyDate] = useState('');
  const [location, setLocation] = useState('');
  const [coolingDays, setCoolingDays] = useState(7);
  const [remark, setRemark] = useState('');
  const [syncLedger, setSyncLedger] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id || '');
  const [existingPhotos, setExistingPhotos] = useState<AttachmentPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setNewPhotos([]);
    setCompressingPhotos(false);
    setExistingPhotos([]);

    if (initialItem) {
      setIsWishlistMode(initialItem.status === 'wishlist');
      setName(initialItem.name);
      setCategory(initialItem.category || '数码科技');
      setPriceStr((initialItem.price / 100).toString());
      setPurchaseDate(initialItem.purchase_date);
      setStatus(initialItem.status);
      setRetiredDate(initialItem.retired_date || '');
      setResalePriceStr(initialItem.resale_price ? (initialItem.resale_price / 100).toString() : '');
      setExpectedDays(initialItem.expected_days || '');
      setWarrantyDate(initialItem.warranty_date || '');
      setLocation(initialItem.location || '');
      setCoolingDays(initialItem.cooling_days || 7);
      setRemark(initialItem.remark || '');
      setSyncLedger(false);

      if ((initialItem.photo_count || 0) > 0) {
        setPhotosLoading(true);
        fetchApi<{ photos: AttachmentPhoto[] }>(`/api/items/${initialItem.id}/photos`)
          .then((res) => {
            if (!cancelled) setExistingPhotos(res.photos || []);
          })
          .catch((err) => {
            if (!cancelled) setError(err?.message || '加载大件照片失败');
          })
          .finally(() => {
            if (!cancelled) setPhotosLoading(false);
          });
      } else {
        setPhotosLoading(false);
      }
    } else {
      setIsWishlistMode(defaultWishlist);
      setName('');
      setCategory('数码科技');
      setPriceStr('');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setStatus(defaultWishlist ? 'wishlist' : 'using');
      setRetiredDate('');
      setResalePriceStr('');
      setExpectedDays(1095);
      setWarrantyDate('');
      setLocation('');
      setCoolingDays(7);
      setRemark('');
      setSyncLedger(false);
      setAccountId(accounts[0]?.id || '');
      setPhotosLoading(false);
    }
    setError('');
    return () => {
      cancelled = true;
    };
  }, [isOpen, initialItem, defaultWishlist, accounts]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('请输入物品名称');
      return;
    }

    const price = parseFloat(priceStr);
    if (isNaN(price) || price <= 0) {
      setError('请输入正确的价格');
      return;
    }

    if (!purchaseDate) {
      setError('请选择日期');
      return;
    }

    let resaleCents = 0;
    if (status === 'sold') {
      const resaleVal = parseFloat(resalePriceStr);
      if (isNaN(resaleVal) || resaleVal < 0) {
        setError('请输入正确的转手卖出金额');
        return;
      }
      resaleCents = Math.round(resaleVal * 100);
    }

    if ((status === 'retired' || status === 'sold') && !retiredDate) {
      setError('请选择损坏淘汰或转售日期');
      return;
    }

    setLoading(true);
    try {
      const finalStatus = isWishlistMode ? 'wishlist' : status;
      const payload: Record<string, any> = {
        name: name.trim(),
        category,
        price: Math.round(price * 100),
        purchase_date: purchaseDate,
        status: finalStatus,
        retired_date: (finalStatus === 'retired' || finalStatus === 'sold') ? retiredDate : null,
        resale_price: resaleCents,
        expected_days: expectedDays ? Number(expectedDays) : null,
        warranty_date: warrantyDate || null,
        location: location.trim() || null,
        cooling_days: coolingDays || 7,
        remark: remark.trim() || null,
        sync_ledger: !initialItem && syncLedger,
        account_id: syncLedger ? accountId : undefined,
      };

      if (initialItem) {
        if (!photosLoading) {
          payload.keep_photo_ids = existingPhotos.map((p) => p.id);
          payload.new_photos = newPhotos;
        }
        await fetchApi(`/api/items/${initialItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      } else {
        if (newPhotos.length > 0) {
          payload.photos = newPhotos;
        }
        await fetchApi('/api/items', {
          method: 'POST',
          body: JSON.stringify(payload),
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

  const handleDelete = async () => {
    if (!initialItem) return;
    if (!confirm(`确定要删除“${initialItem.name}”吗？`)) return;

    setLoading(true);
    try {
      await fetchApi(`/api/items/${initialItem.id}`, { method: 'DELETE' });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header with Switcher */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          {!initialItem ? (
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsWishlistMode(false);
                  setStatus('using');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                  !isWishlistMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                录入已购大件
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsWishlistMode(true);
                  setStatus('wishlist');
                }}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition ${
                  isWishlistMode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                <span>冷静期心愿单</span>
              </button>
            </div>
          ) : (
            <h2 className="text-base font-bold text-slate-800">
              {isWishlistMode ? '编辑心愿单' : '编辑大件资产'}
            </h2>
          )}

          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* 心愿单专属提示 */}
          {isWishlistMode && (
            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center gap-2.5 text-xs text-indigo-800">
              <Snowflake className="w-4 h-4 text-indigo-500 flex-shrink-0" />
              <span>给欲望一点时间冷静。设定冷静天数，倒计时结束后如果仍然想要再确认购买。</span>
            </div>
          )}

          {/* 物品分类选择 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">物品分类</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setCategory(cat.name)}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-medium transition ${
                    category === cat.name
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                      : 'border-slate-100 bg-slate-50 text-slate-600 hover:border-slate-200'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 物品名称与价格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {isWishlistMode ? '心愿物品名称' : '物品名称'}
              </label>
              <input
                type="text"
                required
                placeholder="例如: MacBook Pro 14、降噪耳机"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {isWishlistMode ? '预估价格 (元)' : '购买金额 (元)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">¥</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 心愿单冷静期设置 */}
          {isWishlistMode ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">冷静期天数</label>
                <div className="flex gap-2">
                  {COOLING_PRESETS.map((p) => (
                    <button
                      key={p.days}
                      type="button"
                      onClick={() => setCoolingDays(p.days)}
                      className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition ${
                        coolingDays === p.days
                          ? 'border-indigo-500 bg-indigo-50 text-indigo-700 shadow-sm'
                          : 'border-slate-100 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">心动添加日期</label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <>
              {/* 购买日期与预期寿命 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">购买日期</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
                    <span>预期服役寿命</span>
                    <span className="text-[11px] text-indigo-600 font-normal">用于回本进度</span>
                  </label>
                  <div className="flex gap-1.5">
                    {LIFESPAN_PRESETS.map((p) => (
                      <button
                        key={p.days}
                        type="button"
                        onClick={() => setExpectedDays(p.days)}
                        className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition ${
                          expectedDays === p.days
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                            : 'border-slate-100 bg-slate-50 text-slate-600'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 质保到期日与存放位置 (持物亮点) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                    <span>保修截止日 (可选)</span>
                  </label>
                  <input
                    type="date"
                    value={warrantyDate}
                    onChange={(e) => setWarrantyDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-indigo-500" />
                    <span>存放位置 (可选)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="例如: 书房、背包、客厅"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* 生命周期状态 */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">生命周期状态</label>
                <div className="grid grid-cols-4 gap-1.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setStatus('using')}
                    className={`py-2 px-1 rounded-xl border font-semibold flex items-center justify-center gap-1 transition ${
                      status === 'using'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>服役中</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setStatus('idle')}
                    className={`py-2 px-1 rounded-xl border font-semibold flex items-center justify-center gap-1 transition ${
                      status === 'idle'
                        ? 'border-purple-500 bg-purple-50 text-purple-700 shadow-sm'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                    <span>闲置吃灰</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatus('retired');
                      if (!retiredDate) setRetiredDate(new Date().toISOString().slice(0, 10));
                    }}
                    className={`py-2 px-1 rounded-xl border font-semibold flex items-center justify-center gap-1 transition ${
                      status === 'retired'
                        ? 'border-rose-500 bg-rose-50 text-rose-700 shadow-sm'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                    <span>已损坏</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStatus('sold');
                      if (!retiredDate) setRetiredDate(new Date().toISOString().slice(0, 10));
                    }}
                    className={`py-2 px-1 rounded-xl border font-semibold flex items-center justify-center gap-1 transition ${
                      status === 'sold'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm'
                        : 'border-slate-100 bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    <span>已出二手</span>
                  </button>
                </div>
              </div>

              {/* 淘汰或转售专属附加字段 */}
              {status === 'retired' && (
                <div className="p-3 bg-rose-50/70 border border-rose-100 rounded-2xl space-y-2">
                  <label className="block text-xs font-semibold text-rose-800">
                    损坏/淘汰日期 (锁定终身日均成本)
                  </label>
                  <input
                    type="date"
                    required
                    value={retiredDate}
                    onChange={(e) => setRetiredDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-rose-200 rounded-xl text-xs focus:outline-none"
                  />
                </div>
              )}

              {status === 'sold' && (
                <div className="p-3 bg-amber-50/70 border border-amber-100 rounded-2xl space-y-2.5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-amber-800 mb-1">转售日期</label>
                      <input
                        type="date"
                        required
                        value={retiredDate}
                        onChange={(e) => setRetiredDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-amber-800 mb-1">二手卖出金额 (元)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="例如: 1200"
                        value={resalePriceStr}
                        onChange={(e) => setResalePriceStr(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-amber-900 focus:outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-700">
                    💡 自动扣除卖出回血，按净实际支出计算真实持有成本。
                  </p>
                </div>
              )}

              {/* 新增物品时，支持联动记账流水 */}
              {!initialItem && (
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={syncLedger}
                      onChange={(e) => setSyncLedger(e.target.checked)}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                    />
                    <span className="text-xs font-semibold text-slate-700">同时在日常记账中生成一笔支出流水</span>
                  </label>

                  {syncLedger && (
                    <div>
                      <span className="block text-[11px] text-slate-400 mb-1">付款账户</span>
                      <select
                        value={accountId}
                        onChange={(e) => setAccountId(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none"
                      >
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* 备注说明 */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">
              {isWishlistMode ? '想买的理由 / 种草渠道' : '备注说明 (购买渠道、配置规格等)'}
            </label>
            <input
              type="text"
              placeholder={isWishlistMode ? '例如: 屏幕大办公舒服，等年中大促' : '例如: 官网分期免息购买，深空灰 512G'}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          {/* 大件照片 */}
          <PhotoPicker
            label="大件照片"
            existingPhotos={existingPhotos}
            onRemoveExisting={(id) => setExistingPhotos((prev) => prev.filter((p) => p.id !== id))}
            newPhotos={newPhotos}
            onAddNewPhotos={(urls) => setNewPhotos((prev) => [...prev, ...urls])}
            onRemoveNewPhoto={(idx) => setNewPhotos((prev) => prev.filter((_, i) => i !== idx))}
            photosLoading={photosLoading}
            onError={setError}
            onCompressingChange={setCompressingPhotos}
          />

          {/* 底部按钮 */}
          <div className="flex gap-2 pt-2">
            {initialItem && (
              <button
                type="button"
                onClick={handleDelete}
                className="p-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl transition"
                title="删除"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || compressingPhotos}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-medium text-xs rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-1.5 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '正在保存...' : isWishlistMode ? '加入冷静期心愿单' : initialItem ? '保存修改' : '确认录入大件'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
