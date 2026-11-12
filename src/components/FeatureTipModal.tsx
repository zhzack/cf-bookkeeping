import React from 'react';
import { X, Sparkles, BookOpen, BellOff, Check } from 'lucide-react';
import { FeatureTip, GuideSectionId } from '../data/userGuide';

interface Props {
  tip: FeatureTip | null;
  onDismissOnce: () => void;
  onDisableForever: () => void;
  onOpenFullGuide: (sectionId: GuideSectionId) => void;
}

export const FeatureTipModal: React.FC<Props> = ({
  tip,
  onDismissOnce,
  onDisableForever,
  onOpenFullGuide,
}) => {
  if (!tip) return null;

  return (
    <div className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold mb-1">
                首次使用介绍 · {tip.badge}
              </span>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">{tip.title}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{tip.subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDismissOnce}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition flex-shrink-0"
            title="暂不查看"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3">
          {tip.points.map((pt, idx) => (
            <div
              key={idx}
              className="p-3 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1"
            >
              <div className="text-xs font-bold text-slate-800">{pt.heading}</div>
              <p className="text-xs text-slate-600 leading-relaxed">{pt.description}</p>
            </div>
          ))}

          {tip.proTip && (
            <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/70 text-xs text-amber-900 leading-relaxed">
              💡 <span className="font-semibold">贴士：</span>
              {tip.proTip}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50/70 rounded-b-3xl space-y-2.5">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenFullGuide(tip.sectionId)}
              className="flex-1 py-2.5 px-3 bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>查看完整使用说明</span>
            </button>

            <button
              type="button"
              onClick={onDismissOnce}
              className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 transition"
            >
              <Check className="w-3.5 h-3.5" />
              <span>知道了</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onDisableForever}
            className="w-full py-2 text-[11px] font-medium text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5 transition"
          >
            <BellOff className="w-3.5 h-3.5" />
            <span>以后再也不打开使用介绍提醒（后续仍可在“设置”或右上角查看）</span>
          </button>
        </div>
      </div>
    </div>
  );
};
