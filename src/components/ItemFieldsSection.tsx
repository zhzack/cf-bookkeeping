import React from 'react';
import { Clock, ShieldCheck, MapPin } from 'lucide-react';

export const ITEM_CATEGORIES = ['数码科技', '家电厨卫', '居家家具', '穿搭首饰', '运动出行', '其他大件'];

export const ITEM_LIFESPAN_PRESETS = [
  { label: '1 年', days: 365 },
  { label: '2 年', days: 730 },
  { label: '3 年', days: 1095 },
  { label: '5 年', days: 1825 },
];

export interface ItemExtraValues {
  name: string;
  category: string;
  expectedDays: number | '';
  warrantyDate: string;
  location: string;
  remark: string;
}

interface Props {
  values: ItemExtraValues;
  onChange: (next: ItemExtraValues) => void;
  showRemark?: boolean;
  namePlaceholder?: string;
}

export const ItemFieldsSection: React.FC<Props> = ({
  values,
  onChange,
  showRemark = true,
  namePlaceholder = '例如: MacBook Pro 14、降噪耳机',
}) => {
  const update = (patch: Partial<ItemExtraValues>) => onChange({ ...values, ...patch });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">物品名称</label>
        <input
          type="text"
          placeholder={namePlaceholder}
          value={values.name}
          onChange={(e) => update({ name: e.target.value })}
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">物品分类</label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
          {ITEM_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => update({ category: cat })}
              className={`py-1.5 px-1 text-center rounded-xl border text-[11px] font-medium transition ${
                values.category === cat
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>预期服役寿命</span>
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {ITEM_LIFESPAN_PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => update({ expectedDays: p.days })}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-medium transition ${
                values.expectedDays === p.days
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold'
                  : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {p.label}
            </button>
          ))}
          <input
            type="number"
            min="1"
            placeholder="自定义天数"
            value={values.expectedDays}
            onChange={(e) => update({ expectedDays: e.target.value ? Number(e.target.value) : '' })}
            className="w-24 px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>质保截止日 (可选)</span>
          </label>
          <input
            type="date"
            value={values.warrantyDate}
            onChange={(e) => update({ warrantyDate: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            <span>存放位置 (可选)</span>
          </label>
          <input
            type="text"
            placeholder="例如: 书房、随身、客厅"
            value={values.location}
            onChange={(e) => update({ location: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {showRemark && (
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">大件备注 (可选)</label>
          <input
            type="text"
            placeholder="例如: 购买渠道、配置参数、延保说明"
            value={values.remark}
            onChange={(e) => update({ remark: e.target.value })}
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      )}
    </div>
  );
};
