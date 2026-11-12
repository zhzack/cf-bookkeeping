import React, { useState, useEffect } from 'react';
import {
  X,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  BellOff,
  Bell,
  RotateCcw,
} from 'lucide-react';
import {
  GUIDE_SECTIONS,
  GUIDE_VERSION,
  GuideSectionId,
} from '../data/userGuide';

interface Props {
  isOpen: boolean;
  initialSection?: GuideSectionId;
  disableAllTips: boolean;
  onToggleDisableAllTips: (disabled: boolean) => void;
  onResetFeatureTips?: () => void;
  onClose: () => void;
}

export const UserGuideModal: React.FC<Props> = ({
  isOpen,
  initialSection = 'periodic-bills',
  disableAllTips,
  onToggleDisableAllTips,
  onResetFeatureTips,
  onClose,
}) => {
  const [activeId, setActiveId] = useState<GuideSectionId>(initialSection);

  useEffect(() => {
    if (isOpen) {
      setActiveId(initialSection);
    }
  }, [isOpen, initialSection]);

  if (!isOpen) return null;

  const currentSection = GUIDE_SECTIONS.find((s) => s.id === activeId) || GUIDE_SECTIONS[0];

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full max-w-2xl bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in fade-in slide-in-from-bottom-6 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-800 truncate">
                小记 · 详细使用说明书
              </h3>
              <p className="text-[11px] text-slate-400">
                功能指引随版本同步更新 · 文档版本 {GUIDE_VERSION}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition"
            title="关闭使用说明"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Nav Tabs */}
        <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50/70 flex gap-1.5 overflow-x-auto no-scrollbar">
          {GUIDE_SECTIONS.map((sec) => {
            const active = sec.id === currentSection.id;
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveId(sec.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-white text-slate-600 border border-slate-200/80 hover:border-indigo-200 hover:text-indigo-600'
                }`}
              >
                <span>{sec.title}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Section Hero */}
          <div className="bg-gradient-to-br from-indigo-50 via-white to-slate-50 border border-indigo-100 rounded-2xl p-4 space-y-2">
            <span className="inline-block px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {currentSection.badge}
            </span>
            <h4 className="text-base sm:text-lg font-extrabold text-slate-800">
              {currentSection.title}
            </h4>
            <p className="text-xs font-medium text-indigo-700/90">
              {currentSection.subtitle}
            </p>
            <p className="text-xs text-slate-600 leading-relaxed pt-1">
              {currentSection.summary}
            </p>
          </div>

          {/* Core Highlights */}
          <div className="space-y-2">
            <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              核心要点
            </h5>
            <div className="space-y-2">
              {currentSection.highlights.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/60 border border-emerald-100 text-xs text-slate-700 leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Step by step */}
          {currentSection.steps && currentSection.steps.length > 0 && (
            <div className="space-y-2.5">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                详细操作步骤
              </h5>
              <div className="space-y-2.5">
                {currentSection.steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 space-y-1"
                  >
                    <div className="text-xs font-bold text-slate-800">{step.title}</div>
                    <p className="text-xs text-slate-600 leading-relaxed">{step.detail}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Concrete Examples */}
          {currentSection.examples && currentSection.examples.length > 0 && (
            <div className="space-y-2.5">
              <h5 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                常见场景举例
              </h5>
              <div className="space-y-2.5">
                {currentSection.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-1.5"
                  >
                    <div className="text-xs font-bold text-indigo-700">📌 {ex.scene}</div>
                    <div className="text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">记账方式：</span>
                      {ex.action}
                    </div>
                    <div className="text-xs text-emerald-700 bg-emerald-50/70 px-2.5 py-1.5 rounded-lg">
                      <span className="font-semibold">最终效果：</span>
                      {ex.result}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {currentSection.notes && currentSection.notes.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/70 rounded-2xl p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-800">
                <Lightbulb className="w-4 h-4 text-amber-600" />
                <span>实用小贴士</span>
              </div>
              <ul className="space-y-1 text-xs text-amber-900/90 leading-relaxed list-disc pl-4">
                {currentSection.notes.map((n, idx) => (
                  <li key={idx}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 rounded-b-3xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onToggleDisableAllTips(!disableAllTips)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition ${
                disableAllTips
                  ? 'bg-slate-200/80 text-slate-700 border-slate-300 hover:bg-slate-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              {disableAllTips ? (
                <>
                  <Bell className="w-3.5 h-3.5 text-indigo-600" />
                  <span>已关闭首次提醒（点击重新开启）</span>
                </>
              ) : (
                <>
                  <BellOff className="w-3.5 h-3.5 text-slate-500" />
                  <span>以后不再自动弹出介绍提醒</span>
                </>
              )}
            </button>

            {onResetFeatureTips && (
              <button
                type="button"
                onClick={onResetFeatureTips}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium text-slate-500 hover:text-indigo-600 hover:bg-white border border-transparent hover:border-slate-200 flex items-center gap-1 transition"
                title="重新体验所有页面首次引导提示"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重置引导</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition ml-auto"
          >
            开始记账
          </button>
        </div>
      </div>
    </div>
  );
};
