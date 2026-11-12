import React, { useState, useEffect } from 'react';
import { X, Package, Check } from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { AttachmentPhoto, Transaction } from '../types';
import { ItemFieldsSection, ItemExtraValues } from './ItemFieldsSection';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  isOpen: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const ConvertToItemModal: React.FC<Props> = ({ isOpen, transaction, onClose, onSuccess }) => {
  const [fields, setFields] = useState<ItemExtraValues>({
    name: '',
    category: '数码科技',
    expectedDays: 1095,
    warrantyDate: '',
    location: '',
    remark: '',
  });
  const [existingPhotos, setExistingPhotos] = useState<AttachmentPhoto[]>([]);
  const [newPhotos, setNewPhotos] = useState<string[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [compressingPhotos, setCompressingPhotos] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !transaction) return;
    setFields({
      name: transaction.remark || transaction.category_name || '',
      category: '数码科技',
      expectedDays: 1095,
      warrantyDate: '',
      location: '',
      remark: transaction.remark || '',
    });
    setExistingPhotos([]);
    setNewPhotos([]);
    setError('');

    if ((transaction.photo_count || 0) > 0) {
      setPhotosLoading(true);
      fetchApi<{ photos: AttachmentPhoto[] }>(`/api/transactions/${transaction.id}/photos`)
        .then((res) => setExistingPhotos(res.photos || []))
        .catch((err) => console.error(err))
        .finally(() => setPhotosLoading(false));
    }
  }, [isOpen, transaction]);

  if (!isOpen || !transaction) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fields.name.trim()) {
      setError('请输入大件物品名称');
      return;
    }
    if (existingPhotos.length + newPhotos.length > 3) {
      setError('大件最多保存 3 张照片');
      return;
    }

    setLoading(true);
    try {
      await fetchApi(`/api/transactions/${transaction.id}/convert-to-item`, {
        method: 'POST',
        body: JSON.stringify({
          name: fields.name.trim(),
          category: fields.category,
          expected_days: fields.expectedDays ? Number(fields.expectedDays) : null,
          warranty_date: fields.warrantyDate || null,
          location: fields.location.trim() || null,
          remark: fields.remark.trim() || null,
          copy_photo_ids: existingPhotos.map((p) => p.id),
          new_photos: newPhotos,
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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh]">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-800">将开销设为持物大件</h2>
              <p className="text-[11px] text-slate-400">补充信息后将加入「大件」按日摊薄，并自动排除出日常日均避免重复统计</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-100 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl">
              ⚠️ {error}
            </div>
          )}

          <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-3 flex items-center justify-between text-xs">
            <div>
              <div className="text-slate-500">原支出流水</div>
              <div className="font-semibold text-slate-800 mt-0.5">
                {transaction.transaction_time.slice(0, 10)} · {transaction.category_name || '支出'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-slate-500">购入价格</div>
              <div className="text-base font-extrabold text-indigo-600">
                {formatCurrency(transaction.amount)}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5">
            <ItemFieldsSection values={fields} onChange={setFields} />
          </div>

          <PhotoPicker
            label="大件照片（可沿用原账单照片或新增）"
            existingPhotos={existingPhotos}
            onRemoveExisting={(id) => setExistingPhotos((prev) => prev.filter((p) => p.id !== id))}
            newPhotos={newPhotos}
            onAddNewPhotos={(urls) => setNewPhotos((prev) => [...prev, ...urls])}
            onRemoveNewPhoto={(idx) => setNewPhotos((prev) => prev.filter((_, i) => i !== idx))}
            photosLoading={photosLoading}
            onError={setError}
            onCompressingChange={setCompressingPhotos}
          />

          <div className="pt-1">
            <button
              type="submit"
              disabled={loading || compressingPhotos}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <Check className="w-4 h-4" />
              <span>{loading ? '正在转换...' : '确认设为持物大件'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
