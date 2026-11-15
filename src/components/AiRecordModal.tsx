import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Camera,
  Upload,
  Mic,
  MicOff,
  ArrowRight,
  CheckCircle2,
  Calendar,
  CreditCard,
  Tag,
  AlertCircle,
  HelpCircle,
  RotateCw,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { Account, Category, AiParseResult } from '../types';
import { DynamicIcon } from './DynamicIcon';
import { compressImageToDataUrl } from '../utils/image';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accounts: Account[];
  categories: Category[];
}

const SAMPLE_CHIPS = [
  '☕ 瑞幸生椰拿铁 18 微信',
  '🍱 麦当劳双人汉堡套餐 58 支付宝',
  '🚕 滴滴打车回家 32.5 招商银行',
  '🛒 盒马鲜生买菜日用品 128 微信',
  '💰 本月薪资到账 16000 工商银行',
  '🍜 楼下沙县小吃 18 现金',
];

export const AiRecordModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSuccess,
  accounts,
  categories,
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'image'>('text');
  const [inputText, setInputText] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);

  // 语音识别状态 (Web Speech API)
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // 解析中与结果状态
  const [parsing, setParsing] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [parsedResult, setParsedResult] = useState<AiParseResult | null>(null);

  // 解析结果的可编辑状态
  const [editType, setEditType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [editAmountYuan, setEditAmountYuan] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editScene, setEditScene] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 初始化语音识别
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'zh-CN';

        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText((prev) => (prev ? `${prev} ${transcript}` : transcript));
          setIsListening(false);
        };

        recognition.onerror = () => {
          setIsListening(false);
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognitionRef.current = recognition;
      }
    }
  }, []);

  // 当弹窗打开时重置状态
  useEffect(() => {
    if (!isOpen) {
      setInputText('');
      setImagePreview(null);
      setImageBase64(null);
      setParsedResult(null);
      setError('');
      setIsListening(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSpeechRecognition = () => {
    if (!recognitionRef.current) {
      alert('您的浏览器暂不支持原生语音识别，请直接键盘打字输入。');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (err) {
        setIsListening(false);
      }
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setError('图片大小不能超过 15MB');
      return;
    }

    setCompressing(true);
    setError('');
    try {
      // 客户端压缩小票照片至长边 1280px，控制体积在几百 KB 内，保留文字高清晰度
      const compressedDataUrl = await compressImageToDataUrl(file, 1280);
      setImagePreview(compressedDataUrl);
      setImageBase64(compressedDataUrl);
      setParsedResult(null);
    } catch (err: any) {
      setError(err.message || '图片压缩处理失败');
    } finally {
      setCompressing(false);
    }
  };

  // 触发 AI 解析
  const handleParse = async () => {
    setError('');
    setParsing(true);
    setParsedResult(null);

    try {
      if (activeTab === 'text') {
        if (!inputText.trim()) {
          throw new Error('请输入记账描述内容');
        }
        const res = await fetchApi<{ result: AiParseResult }>('/api/ai/parse-text', {
          method: 'POST',
          body: JSON.stringify({ text: inputText }),
        });
        applyParsedData(res.result);
      } else {
        if (!imageBase64) {
          throw new Error('请先选择或拍摄小票/发票图片');
        }
        const res = await fetchApi<{ result: AiParseResult }>('/api/ai/parse-receipt', {
          method: 'POST',
          body: JSON.stringify({ image: imageBase64 }),
        });
        applyParsedData(res.result);
      }
    } catch (err: any) {
      setError(err.message || 'AI 解析失败，请重试');
    } finally {
      setParsing(false);
    }
  };

  const applyParsedData = (data: AiParseResult) => {
    setParsedResult(data);
    setEditType(data.type);
    setEditAmountYuan(data.amount_yuan > 0 ? String(data.amount_yuan) : '');
    setEditAccountId(data.account_id || accounts[0]?.id || '');
    setEditCategoryId(data.category_id || categories.find((c) => c.type === data.type)?.id || '');
    setEditTime(data.transaction_time ? data.transaction_time.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setEditRemark(data.remark || '');
    setEditScene(data.scene || '');
  };

  // 最终确认入账
  const handleConfirmRecord = async () => {
    const amtNum = parseFloat(editAmountYuan);
    if (isNaN(amtNum) || amtNum <= 0) {
      setError('请输入有效的金额');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const amtCents = Math.round(amtNum * 100);
      const timeStr = editTime ? `${editTime}:00`.slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');

      await fetchApi('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: editType,
          amount: amtCents,
          account_id: editAccountId,
          category_id: editType !== 'transfer' ? editCategoryId : null,
          transaction_time: timeStr,
          remark: editRemark.trim(),
          scene: editScene.trim() || null,
        }),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || '记账入账失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部标题栏 */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>AI 智能快速记账</span>
                <span className="text-[10px] bg-amber-400 text-indigo-950 font-black px-1.5 py-0.5 rounded-full uppercase">
                  Beta
                </span>
              </h2>
              <p className="text-[11px] text-indigo-100/80">一句话输入或小票拍图，秒级结构化入账</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 切换 Tab (文本/语音 vs 小票识图) */}
        <div className="flex border-b border-slate-100 px-6 pt-3 bg-slate-50/50">
          <button
            onClick={() => {
              setActiveTab('text');
              setParsedResult(null);
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition relative ${
              activeTab === 'text' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            自然语言 / 语音记账
            {activeTab === 'text' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
          <button
            onClick={() => {
              setActiveTab('image');
              setParsedResult(null);
            }}
            className={`pb-2.5 px-3 text-xs font-bold transition relative ${
              activeTab === 'image' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'
            }`}
          >
            小票 / 发票图片识别
            {activeTab === 'image' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />
            )}
          </button>
        </div>

        {/* 内容主体 */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {activeTab === 'text' ? (
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="说出或输入你的花销，例如：&#10;“昨晚跟朋友吃火锅花了260用微信付的”&#10;“打车去机场85块 支付宝”&#10;“买咖啡 18”"
                  rows={3}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-2xl text-xs outline-none transition resize-none leading-relaxed text-slate-800"
                />
                <button
                  type="button"
                  onClick={toggleSpeechRecognition}
                  className={`absolute right-3 bottom-3 p-2 rounded-xl transition shadow-sm ${
                    isListening
                      ? 'bg-rose-500 text-white animate-pulse'
                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-600'
                  }`}
                  title={isListening ? '点击停止录音' : '按住/点击语音记账'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
              </div>

              {isListening && (
                <div className="flex items-center gap-2 text-xs text-rose-600 font-semibold bg-rose-50 px-3 py-1.5 rounded-xl animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>正在聆听中，请说话...</span>
                </div>
              )}

              {/* 快捷示例标签 */}
              <div>
                <div className="text-[11px] font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3" />
                  <span>快捷示范，点击试一试：</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_CHIPS.map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setInputText(chip.slice(2))}
                      className="text-[11px] px-2.5 py-1 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-slate-600 transition"
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />

              {!imagePreview ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-indigo-400 rounded-2xl p-8 text-center cursor-pointer bg-slate-50 hover:bg-indigo-50/30 transition group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <Camera className="w-6 h-6" />
                  </div>
                  <div className="text-xs font-bold text-slate-700">点击上传或手机拍照小票</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    支持超市收据、餐厅小票、出租车发票或微信/支付宝账单截图
                  </p>
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 max-h-48 flex items-center justify-center">
                  <img
                    src={imagePreview}
                    alt="Receipt Preview"
                    className="max-h-48 object-contain w-full"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setImageBase64(null);
                      setParsedResult(null);
                    }}
                    className="absolute top-2 right-2 p-1 bg-black/60 hover:bg-black text-white rounded-lg transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 解析按钮 */}
          {!parsedResult && (
            <button
              type="button"
              onClick={handleParse}
              disabled={parsing || compressing || (activeTab === 'text' ? !inputText.trim() : !imageBase64)}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
            >
              {compressing ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>正在优化压缩图片...</span>
                </>
              ) : parsing ? (
                <>
                  <RotateCw className="w-4 h-4 animate-spin" />
                  <span>AI 正在思考分析中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>开始 AI 智能识别</span>
                </>
              )}
            </button>
          )}

          {/* 解析完成的预览卡片与快捷微调 */}
          {parsedResult && (
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-800">AI 结构化识别成功</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                  {parsedResult.parser_type === 'workers_ai'
                    ? '✨ Workers AI'
                    : parsedResult.parser_type === 'custom_llm'
                    ? '⚡ 自定义 LLM'
                    : '🔍 规则解析'}
                </span>
              </div>

              {/* 金额与类型 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">交易类型</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                    <option value="transfer">内部转账</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">金额 (元)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmountYuan}
                    onChange={(e) => setEditAmountYuan(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-indigo-600 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 账户与分类 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">结算账户</label>
                  <select
                    value={editAccountId}
                    onChange={(e) => setEditAccountId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">分类归属</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  >
                    {categories
                      .filter((c) => c.type === (editType === 'income' ? 'income' : 'expense'))
                      .map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 交易时间与场景 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">交易时间</label>
                  <input
                    type="datetime-local"
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">消费场景 (可选)</label>
                  <input
                    type="text"
                    value={editScene}
                    onChange={(e) => setEditScene(e.target.value)}
                    placeholder="如：工作日三餐、周末聚餐"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 备注明细 */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">备注说明</label>
                <input
                  type="text"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  placeholder="商户名称或消费摘要"
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                />
              </div>

              {/* 确认提交动作按钮 */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setParsedResult(null)}
                  className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl transition"
                >
                  重试
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRecord}
                  disabled={submitting}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{submitting ? '入账中...' : '核对无误，确认记账'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
