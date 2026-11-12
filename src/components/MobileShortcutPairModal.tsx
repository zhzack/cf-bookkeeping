import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Copy,
  Check,
  Send,
  Sparkles,
  X,
  ShieldCheck,
  ExternalLink,
  PlusCircle,
  HelpCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import { fetchApi } from '../api';

interface Props {
  isOpen: boolean;
  token: string;
  host?: string;
  onClose: () => void;
}

interface ShortcutRelease {
  id: string;
  name: string;
  description: string;
  version: string;
  signing_status: string;
  generation_status: string;
  sharing_type: string;
  icloud_share_url: string | null;
  download_count: number;
}

export const MobileShortcutPairModal: React.FC<Props> = ({
  isOpen,
  token,
  host: propHost,
  onClose,
}) => {
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [release, setRelease] = useState<ShortcutRelease | null>(null);
  const [customICloudUrl, setCustomICloudUrl] = useState('');
  const [savingICloud, setSavingICloud] = useState(false);

  const currentHost =
    propHost || (typeof window !== 'undefined' ? window.location.origin : '');
  const endpoint = `${currentHost}/api/transactions/quick`;
  const authHeaderValue = `Bearer ${token}`;
  const pairCommand = `CONFIG|${currentHost}|${token}`;
  const pairUrl = `shortcuts://run-shortcut?name=随手记账&input=text&text=${encodeURIComponent(pairCommand)}`;

  const loadRelease = async () => {
    try {
      const res = await fetchApi<ShortcutRelease>('/api/v1/shortcuts/current');
      setRelease(res);
      if (res?.icloud_share_url) {
        setCustomICloudUrl(res.icloud_share_url);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRelease();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 2000);
    } catch {
      alert('已复制');
    }
  };

  const handleOpenShortcutsApp = () => {
    copyText('autoUrl', endpoint);
    window.location.href = 'shortcuts://create-shortcut';
  };

  const handleSaveICloudUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customICloudUrl.trim()) return;
    setSavingICloud(true);
    try {
      await fetchApi('/api/v1/shortcuts/sc_cf_bookkeeping/icloud-url', {
        method: 'POST',
        body: JSON.stringify({ url: customICloudUrl.trim() }),
      });
      await loadRelease();
      alert('🎉 官方 iCloud 链接已成功绑定并同步！');
    } catch (err: any) {
      alert(err?.message || '保存失败');
    } finally {
      setSavingICloud(false);
    }
  };

  const handleTestTransaction = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchApi<{ message?: string; amount_yuan?: string }>(
        '/api/transactions/quick',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            amount: 0.01,
            account: '微信',
            category: '餐饮美食',
            remark: '快捷指令连通性测试',
            type: 'expense',
          }),
        }
      );
      setTestResult(res?.message || '联调测试成功！已成功记录 ¥0.01');
    } catch (err: any) {
      setTestResult(`测试失败: ${err?.message || '请确认服务已启动'}`);
    } finally {
      setTesting(false);
    }
  };

  const hasOfficialICloud = Boolean(release?.icloud_share_url);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-600 text-white relative flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-white/20 backdrop-blur-md">
              <Smartphone className="w-5 h-5 text-amber-300" />
            </span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white/90">
              iPhone 闪电配置向导
            </span>
          </div>
          <h2 className="text-lg font-bold">配置 iOS「随手记账」快捷指令</h2>
          <p className="text-xs text-indigo-100/90 mt-1">
            长期安全令牌已自动就绪，两步简单拼接即可实现终身免维护记账！
          </p>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-slate-700 text-xs">
          {/* 安全说明 */}
          <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-start gap-2.5 text-indigo-950">
            <HelpCircle className="w-4 h-4 text-indigo-600 flex-shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">关于苹果官方导入机制：</span>
              <p className="text-indigo-800/90 mt-0.5 text-[11px]">
                根据 Apple 安全签名规范，外部分享链接必须由真实登录 Apple ID 的设备生成。伪造链接会被 iOS 拦截。我们为您提供了最便捷的无缝体验：
              </p>
            </div>
          </div>

          {/* 自动就绪的专属令牌 */}
          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-emerald-950">当前专属 API 令牌（已自动生成）：</div>
                <div className="font-mono text-[11px] text-emerald-700 truncate">
                  {token ? `${token.slice(0, 15)}...${token.slice(-4)}` : '已安全加载'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyText('tokenOnly', token)}
              className="px-2.5 py-1 bg-white border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl font-medium flex items-center gap-1 transition flex-shrink-0"
            >
              {copiedKey === 'tokenOnly' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'tokenOnly' ? '已复制' : '复制令牌'}</span>
            </button>
          </div>

          {/* 如果已绑定官方 iCloud 链接 (模式 B) */}
          {hasOfficialICloud ? (
            <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>已启用官方 Apple iCloud 一键安装</span>
                </span>
              </div>
              <p className="text-emerald-800 text-xs">
                点击下方按钮将直接呼起 iOS 原生快捷指令安装窗口：
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href={release?.icloud_share_url!}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>① 点击直接添加到 iPhone</span>
                </a>
                <a
                  href={pairUrl}
                  className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <Zap className="w-4 h-4" />
                  <span>② 一键自动绑定此账号</span>
                </a>
              </div>
            </div>
          ) : (
            /* 向导模式：两步极简配置 */
            <div className="space-y-3">
              {/* 步骤 1：打开快捷指令 */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-bold">
                      1
                    </span>
                    <span>唤起 iPhone 快捷指令 App</span>
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenShortcutsApp}
                  className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>📱 点击在 iPhone 上打开快捷指令新建窗口</span>
                </button>
                <p className="text-[11px] text-slate-500 text-center">
                  点击上方按钮将自动把接口 URL 复制到剪贴板，并在手机上弹出快捷指令新建编辑页。
                </p>
              </div>

              {/* 步骤 2：只需添加两个积木动作 */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
                <span className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] flex items-center justify-center font-bold">
                    2
                  </span>
                  <span>在新建窗口中添加 2 个核心动作</span>
                </span>

                {/* 动作 1 */}
                <div className="p-3 bg-white rounded-xl border border-slate-200/70 space-y-1.5 shadow-xs">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>动作 A：搜索并添加「请求输入」</span>
                    <span className="text-[10px] text-slate-400">第一项</span>
                  </div>
                  <p className="text-slate-600 text-[11px]">
                    提示填：<code>输入消费（如：咖啡 18.5、午饭 25、打车 30）</code>
                  </p>
                </div>

                {/* 动作 2 */}
                <div className="p-3 bg-white rounded-xl border border-slate-200/70 space-y-2 shadow-xs">
                  <div className="font-bold text-slate-800 flex items-center justify-between">
                    <span>动作 B：搜索并添加「获取 URL 的内容」</span>
                    <span className="text-[10px] text-slate-400">第二项</span>
                  </div>

                  {/* URL */}
                  <div className="space-y-1">
                    <div className="text-[11px] text-slate-500 font-medium">① URL（点击右侧一键复制并粘贴）：</div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        readOnly
                        value={endpoint}
                        className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => copyText('urlAction', endpoint)}
                        className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold flex items-center gap-1 transition flex-shrink-0"
                      >
                        {copiedKey === 'urlAction' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'urlAction' ? '已复制' : '复制'}</span>
                      </button>
                    </div>
                  </div>

                  {/* 展开配置 */}
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-1.5 text-[11px]">
                    <div className="text-slate-600">
                      点击动作右下角的展开箭头，做如下设置：
                    </div>
                    <div>• <strong>方法：</strong>选择 <code>POST</code></div>
                    <div className="flex items-center justify-between gap-1">
                      <span>• <strong>标头：</strong>添加 <code>Authorization</code></span>
                      <button
                        type="button"
                        onClick={() => copyText('authHeader', authHeaderValue)}
                        className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
                      >
                        {copiedKey === 'authHeader' ? '已复制' : '复制 Header 值'}
                      </button>
                    </div>
                    <div>
                      • <strong>请求正文：</strong>选择 <code>JSON</code>，添加字段 <code>text</code>，值选择上面的「提供的输入」！
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 联调测试 */}
          <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>连通性测试（验证接口与令牌）</span>
              </span>
              <button
                type="button"
                disabled={testing}
                onClick={handleTestTransaction}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 disabled:opacity-60"
              >
                <Send className="w-3 h-3" />
                <span>{testing ? '发送中...' : '发送 ¥0.01 测试'}</span>
              </button>
            </div>
            {testResult && (
              <div
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 ${
                  testResult.includes('失败')
                    ? 'bg-red-50 text-red-600'
                    : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{testResult}</span>
              </div>
            )}
          </div>

          {/* 保存自定义共享链接（如果在手机上做好了并生成了 iCloud 链接） */}
          <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-2">
            <div className="font-bold text-purple-950 flex items-center gap-1">
              <ExternalLink className="w-3.5 h-3.5 text-purple-600" />
              <span>绑定官方认证的 Apple iCloud 分享链接 (模式 B)</span>
            </div>
            <p className="text-[11px] text-purple-900/80 leading-normal">
              制作好后点击右上角的「分享」→「拷贝 iCloud 链接」，可以保存在这里。系统将全量同步，后续用户点击即可直接安装：
            </p>
            <form onSubmit={handleSaveICloudUrl} className="flex gap-2">
              <input
                type="text"
                value={customICloudUrl}
                onChange={(e) => setCustomICloudUrl(e.target.value)}
                placeholder="https://www.icloud.com/shortcuts/..."
                className="flex-1 px-3 py-1.5 bg-white border border-purple-200 rounded-xl text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="submit"
                disabled={savingICloud}
                className="px-3 py-1.5 bg-purple-600 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 hover:bg-purple-700 transition disabled:opacity-60"
              >
                <span>{savingICloud ? '保存中...' : '保存生效'}</span>
              </button>
            </form>
          </div>

          {/* 触发技巧 */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 space-y-1">
            <div className="font-bold">💡 终极使用姿势：</div>
            <p>
              • <strong>轻点背面记账：</strong>前往 iPhone「设置 -&gt; 辅助功能 -&gt; 触控 -&gt; 轻点背面」把「轻点两下」设为该快捷指令，付款后敲击两下手机背面即记账！
            </p>
            <p>
              • <strong>Siri 语音记账：</strong>直接对手机说「嘿 Siri，随手记账」，语音说出「午饭 25」即可全自动入账并归类。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 active:scale-[0.99] text-white text-xs font-bold rounded-xl transition"
          >
            完成配置，进入系统
          </button>
        </div>
      </div>
    </div>
  );
};
