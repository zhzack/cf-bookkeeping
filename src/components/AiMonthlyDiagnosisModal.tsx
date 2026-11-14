import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RotateCw,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  CheckCircle2,
  Calendar,
  Award,
} from 'lucide-react';
import { fetchApi } from '../api';
import { AiDiagnosisResult } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialMonth?: string;
}

export const AiMonthlyDiagnosisModal: React.FC<Props> = ({
  isOpen,
  onClose,
  initialMonth,
}) => {
  const currentMonth = initialMonth || new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [diagnosis, setDiagnosis] = useState<AiDiagnosisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadDiagnosis = async (month: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ diagnosis: AiDiagnosisResult }>('/api/ai/monthly-diagnosis', {
        method: 'POST',
        body: JSON.stringify({ month }),
      });
      setDiagnosis(res.diagnosis);
    } catch (err: any) {
      setError(err.message || '生成体检报告失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSelectedMonth(currentMonth);
      loadDiagnosis(currentMonth);
    } else {
      setDiagnosis(null);
      setError('');
    }
  }, [isOpen, initialMonth]);

  if (!isOpen) return null;

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'from-emerald-500 to-teal-600 text-emerald-400';
    if (score >= 70) return 'from-indigo-500 to-blue-600 text-indigo-400';
    if (score >= 60) return 'from-amber-500 to-orange-600 text-amber-400';
    return 'from-rose-500 to-red-600 text-rose-400';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部彩色横幅 */}
        <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 px-6 py-5 text-white relative overflow-hidden shrink-0">
          <div className="absolute right-[-20px] top-[-20px] opacity-10 pointer-events-none">
            <Sparkles className="w-40 h-40 text-white" />
          </div>

          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center backdrop-blur-md">
                <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
              </div>
              <div>
                <h2 className="text-base font-black flex items-center gap-2">
                  <span>AI 财务健康体检报告</span>
                </h2>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-indigo-200/80">
                  <span>月份：{selectedMonth}</span>
                  <span>•</span>
                  <span>多维度消费洞察</span>
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
              <RotateCw className="w-8 h-8 text-indigo-600 animate-spin" />
              <div className="text-sm font-bold text-slate-800">AI 正在深度体检您的财务数据...</div>
              <p className="text-xs text-slate-400 max-w-xs">
                正在分析收支结余、分类占比、固定订阅与持物折旧
              </p>
            </div>
          ) : diagnosis ? (
            <div className="space-y-4">
              {/* 健康得分与画像卡片 */}
              <div className="bg-gradient-to-br from-slate-900 to-indigo-950 rounded-2xl p-4 text-white flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-indigo-200/70 font-medium">财务健康综合得分</div>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-4xl font-black text-white">{diagnosis.health_score}</span>
                    <span className="text-xs text-indigo-200/60">/ 100 分</span>
                  </div>
                  <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-bold">
                    <Award className="w-3.5 h-3.5 text-amber-400" />
                    <span>{diagnosis.persona_tag}</span>
                  </div>
                </div>

                <div className="w-16 h-16 rounded-full border-4 border-indigo-500/30 flex items-center justify-center relative">
                  <div className="text-xs font-black text-indigo-300">
                    {diagnosis.health_score >= 85
                      ? '极佳'
                      : diagnosis.health_score >= 70
                      ? '良好'
                      : diagnosis.health_score >= 60
                      ? '平衡'
                      : '需注意'}
                  </div>
                </div>
              </div>

              {/* 整体评价 */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                <div className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-indigo-600" />
                  <span>综合评述</span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">{diagnosis.summary}</p>
              </div>

              {/* 值得夸奖的亮点 */}
              {diagnosis.highlights && diagnosis.highlights.length > 0 && (
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-4">
                  <div className="text-xs font-bold text-emerald-900 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>本月财务亮点</span>
                  </div>
                  <ul className="space-y-1.5">
                    {diagnosis.highlights.map((h, i) => (
                      <li key={i} className="text-xs text-emerald-800 flex items-start gap-2">
                        <span className="text-emerald-500 font-bold">•</span>
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 预警与隐性支出 */}
              {diagnosis.risks_and_leaks && diagnosis.risks_and_leaks.length > 0 && (
                <div className="bg-amber-50/60 border border-amber-100 rounded-2xl p-4">
                  <div className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>隐性支出与跑冒滴漏预警</span>
                  </div>
                  <ul className="space-y-1.5">
                    {diagnosis.risks_and_leaks.map((r, i) => (
                      <li key={i} className="text-xs text-amber-800 flex items-start gap-2">
                        <span className="text-amber-500 font-bold">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 下月行动建议 */}
              {diagnosis.actionable_tips && diagnosis.actionable_tips.length > 0 && (
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4">
                  <div className="text-xs font-bold text-indigo-900 mb-2 flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-indigo-600" />
                    <span>下月行动锦囊</span>
                  </div>
                  <ul className="space-y-1.5">
                    {diagnosis.actionable_tips.map((t, i) => (
                      <li key={i} className="text-xs text-indigo-800 flex items-start gap-2">
                        <span className="text-indigo-500 font-bold">•</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* 底部按钮 */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={() => loadDiagnosis(selectedMonth)}
            disabled={loading}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>重新诊断</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm"
          >
            知晓
          </button>
        </div>
      </div>
    </div>
  );
};
