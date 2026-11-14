import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Globe,
  Key,
  ShieldCheck,
  Check,
  RotateCw,
} from 'lucide-react';
import { fetchApi } from '../api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AiSettingsModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
  const [provider, setProvider] = useState<'workers_ai' | 'custom'>('workers_ai');
  const [customEndpoint, setCustomEndpoint] = useState('');
  const [customApiKey, setCustomApiKey] = useState('');
  const [customModel, setCustomModel] = useState('deepseek-chat');
  const [isEnabled, setIsEnabled] = useState(true);
  const [hasWorkersAi, setHasWorkersAi] = useState(true);

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const loadConfig = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApi<{ config: any }>('/api/ai/config');
      if (res.config) {
        setProvider(res.config.provider || 'workers_ai');
        setCustomEndpoint(res.config.custom_endpoint || '');
        setCustomApiKey(res.config.custom_api_key || '');
        setCustomModel(res.config.custom_model || 'deepseek-chat');
        setIsEnabled(res.config.is_enabled !== false);
        setHasWorkersAi(res.config.has_workers_ai !== false);
      }
    } catch (err: any) {
      setError(err.message || '获取配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConfig();
      setTestSuccess(null);
      setSuccessMsg('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setError('');
    setTestSuccess(null);

    try {
      await fetchApi('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'custom',
          custom_endpoint: customEndpoint,
          custom_api_key: customApiKey,
          custom_model: customModel,
          is_enabled: isEnabled,
          test_connection: true,
        }),
      });
      setTestSuccess('自定义大模型接口连接测试成功！');
    } catch (err: any) {
      setError(err.message || '模型连接失败');
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      await fetchApi('/api/ai/config', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          custom_endpoint: customEndpoint,
          custom_api_key: customApiKey,
          custom_model: customModel,
          is_enabled: isEnabled,
        }),
      });
      setSuccessMsg('AI 大模型配置保存成功！');
      if (onSuccess) onSuccess();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        {/* 顶部标题 */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-base font-bold">AI 大模型服务配置</h2>
              <p className="text-[11px] text-indigo-100/80">
                支持 Cloudflare Workers AI 内置免配置与第三方 LLM 自由接入
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-white/80 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单主体 */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2 text-xs text-emerald-700">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span>{successMsg}</span>
            </div>
          )}

          {testSuccess && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-2xl flex items-center gap-2 text-xs text-teal-700">
              <ShieldCheck className="w-4 h-4 shrink-0 text-teal-500" />
              <span>{testSuccess}</span>
            </div>
          )}

          {/* 模式选择 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">模型提供方模式</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setProvider('workers_ai')}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  provider === 'workers_ai'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Cpu className="w-4 h-4 text-indigo-600" />
                      <span>Workers AI (内置)</span>
                    </span>
                    {provider === 'workers_ai' && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Cloudflare 原生托管，每日享 10,000 免费 Neurons 额度，零外部依赖秒开。
                  </p>
                </div>
                <div className="mt-2.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">
                    官方推荐 / 零持有成本
                  </span>
                </div>
              </div>

              <div
                onClick={() => setProvider('custom')}
                className={`p-3.5 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                  provider === 'custom'
                    ? 'border-indigo-600 bg-indigo-50/50 text-indigo-900'
                    : 'border-slate-100 bg-slate-50 hover:bg-slate-100/70 text-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-indigo-600" />
                      <span>自定义外部大模型</span>
                    </span>
                    {provider === 'custom' && <Check className="w-4 h-4 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    支持接入 DeepSeek、OpenAI、阿里云通义千问或兼容 OpenAI 格式的各类 API。
                  </p>
                </div>
                <div className="mt-2.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-semibold">
                    自由配置 / 高阶拓展
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 自定义配置表单项 */}
          {provider === 'custom' && (
            <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-fade-in">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  API 端点地址 (Base URL)
                </label>
                <input
                  type="url"
                  value={customEndpoint}
                  onChange={(e) => setCustomEndpoint(e.target.value)}
                  placeholder="如: https://api.deepseek.com/v1"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">API 密钥 (API Key)</label>
                <input
                  type="text"
                  value={customApiKey}
                  onChange={(e) => setCustomApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">模型名称 (Model)</label>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  placeholder="如: deepseek-chat 或 gpt-4o-mini"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing || !customEndpoint || !customApiKey}
                className="w-full py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5"
              >
                <RotateCw className={`w-3.5 h-3.5 ${testing ? 'animate-spin' : ''}`} />
                <span>{testing ? '正在测试端点连通性...' : '测试接口连通性'}</span>
              </button>
            </div>
          )}

          {/* 底部保存按钮 */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-md shadow-indigo-200"
            >
              <span>{loading ? '保存中...' : '保存 AI 配置'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
