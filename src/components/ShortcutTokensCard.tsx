import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  KeyRound,
  Copy,
  Check,
  Trash2,
  Plus,
  BookOpen,
  FileSpreadsheet,
  QrCode,
  Download,
  ExternalLink,
  Zap,
  CheckCircle2,
  Send,
  Sparkles,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  PlusCircle,
  HelpCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { fetchApi } from '../api';
import { ApiTokenInfo } from '../types';
import { GuideSectionId } from '../data/userGuide';

interface Props {
  onOpenImport?: () => void;
  onOpenGuide: (sectionId?: GuideSectionId) => void;
}

interface ShortcutPairInfo {
  id: string;
  token: string;
  token_prefix: string;
  host: string;
  endpoint: string;
  shortcut_name: string;
  pair_command: string;
  pair_json: string;
  pair_url: string;
  icloud_url: string;
}

const SHORTCUT_TEMPLATES = [
  {
    key: 'manual',
    label: '1. 弹窗快速记账',
    desc: '配合快捷指令「请求输入(数字)」+「从菜单选择分类」，无需记住内部 ID，按名称自动匹配。',
    json: `{
  "amount": 18.5,
  "type": "expense",
  "account": "微信",
  "category": "餐饮美食",
  "remark": "瑞幸咖啡"
}`,
  },
  {
    key: 'ocr',
    label: '2. 截图识别支付文案',
    desc: '配合「截取屏幕」→「提取图像中的文本」，把整段识别文本直接发给 text，自动提取金额/账户/商户！',
    json: `{
  "text": "微信支付 向 瑞幸咖啡 付款 ¥18.50"
}`,
  },
  {
    key: 'periodic',
    label: '3. 定期订阅自动记账',
    desc: '配合快捷指令「个人自动化（每月1日）」，自动入账并按 30 天平摊到每日生活成本。',
    json: `{
  "amount": 3000,
  "account": "储蓄卡",
  "category": "住房物业",
  "remark": "本月房租",
  "amortize_days": 30
}`,
  },
] as const;

export const ShortcutTokensCard: React.FC<Props> = ({ onOpenImport, onOpenGuide }) => {
  const [tokens, setTokens] = useState<ApiTokenInfo[]>([]);
  const [tokenName, setTokenName] = useState('iOS 快捷指令');
  const [newPlainToken, setNewPlainToken] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedKey, setCopiedKey] = useState('');
  const [activeTpl, setActiveTpl] = useState<'manual' | 'ocr' | 'periodic'>('manual');
  const [tokenError, setTokenError] = useState('');

  // 极速免配置配对状态
  const [pairInfo, setPairInfo] = useState<ShortcutPairInfo | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [showQrCode, setShowQrCode] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [customICloudUrl, setCustomICloudUrl] = useState(() => {
    return (typeof window !== 'undefined' && localStorage.getItem('cf_saved_icloud_shortcut_url')) || '';
  });

  const quickEndpoint =
    typeof window !== 'undefined' ? `${window.location.origin}/api/transactions/quick` : '/api/transactions/quick';

  const loadTokens = async () => {
    try {
      const res = await fetchApi<{ tokens: ApiTokenInfo[] }>('/api/auth/tokens');
      setTokens(res.tokens || []);
    } catch (err) {
      console.error(err);
    }
  };

  // 自动获取/准备快捷指令专属长期令牌（用户无需手动点击生成令牌）
  const initShortcutPair = async () => {
    setPairLoading(true);
    try {
      const res = await fetchApi<ShortcutPairInfo>('/api/auth/tokens/shortcut-pair', {
        method: 'POST',
      });
      setPairInfo(res);
      setNewPlainToken(res.token);

      // 生成手机扫码链接（手机相机扫码即可直接在手机端一键安装并绑定）
      const mobilePairUrl = `${res.host}/?shortcut_pair=1&token=${res.token}`;
      try {
        const qr = await QRCode.toDataURL(mobilePairUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#1e1b4b',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(qr);
      } catch (qrErr) {
        console.error('QR code generation failed', qrErr);
      }
      loadTokens();
    } catch (err) {
      console.error('Failed to auto-init shortcut pair', err);
    } finally {
      setPairLoading(false);
    }
  };

  useEffect(() => {
    loadTokens();
    initShortcutPair();
  }, []);

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
    // 自动将接口 URL 复制到剪贴板，随后调起快捷指令新建
    copyText('autoUrl', quickEndpoint);
    window.location.href = 'shortcuts://create-shortcut';
  };

  const handleSaveICloudUrl = (url: string) => {
    setCustomICloudUrl(url);
    if (typeof window !== 'undefined') {
      localStorage.setItem('cf_saved_icloud_shortcut_url', url.trim());
    }
  };

  const handleTestCall = async () => {
    const activeToken = pairInfo?.token || newPlainToken;
    if (!activeToken) {
      alert('请等待专属令牌准备完成');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetchApi<{ message?: string }>('/api/transactions/quick', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          amount: 0.01,
          account: '微信',
          category: '餐饮美食',
          remark: '快捷指令连通性测试',
          type: 'expense',
        }),
      });
      setTestResult(res?.message || '连通测试成功！已自动记账 ¥0.01');
    } catch (err: any) {
      setTestResult(`测试失败: ${err?.message || '请求未响应'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenError('');
    setCreating(true);
    try {
      const res = await fetchApi<{ token: string }>('/api/auth/tokens', {
        method: 'POST',
        body: JSON.stringify({ name: tokenName.trim() || 'iOS 快捷指令' }),
      });
      setNewPlainToken(res.token);
      loadTokens();
    } catch (err: any) {
      setTokenError(err?.message || '生成令牌失败');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('确定撤销该长期令牌吗？撤销后对应设备上的快捷指令将无法继续记账。')) return;
    try {
      await fetchApi(`/api/auth/tokens/${id}`, { method: 'DELETE' });
      loadTokens();
    } catch (err: any) {
      alert(err?.message || '撤销失败');
    }
  };

  const currentTpl = SHORTCUT_TEMPLATES.find((t) => t.key === activeTpl) || SHORTCUT_TEMPLATES[0];
  const activeToken = pairInfo?.token || newPlainToken;
  const authHeaderValue = `Bearer ${activeToken}`;

  return (
    <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-4 h-4 text-indigo-500" />
          <span>账单导入 & iOS 快捷指令记账</span>
        </h3>

        <button
          type="button"
          onClick={() => onOpenGuide('import-and-shortcuts')}
          className="text-[11px] font-semibold text-indigo-600 hover:underline flex items-center gap-1"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>配置图文教程</span>
        </button>
      </div>

      {/* 微信/支付宝定期导入 */}
      {onOpenImport && (
        <div className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-emerald-900 space-y-0.5">
            <div className="font-bold">📥 微信 / 支付宝官方账单定期批量导入</div>
            <p className="text-[11px] text-emerald-800/80">
              支持微信 `.xlsx/.csv` 与支付宝 `.csv`，按交易单号自动去重，不重复入账。
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenImport}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-sm flex items-center gap-1.5 transition"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>导入账单</span>
          </button>
        </div>
      )}

      {/* 🚀 极简免配置：iPhone / iPad 快捷记账指南 */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-br from-indigo-50 via-purple-50/50 to-pink-50/30 border border-indigo-100/90 shadow-sm space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-indigo-600 text-white shadow-sm">
                <Zap className="w-4 h-4" />
              </span>
              <h4 className="text-sm font-bold text-slate-900">
                iPhone / iPad 随手记账（已自动准备好令牌）
              </h4>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                免手动创建令牌
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              因苹果系统安全签名限制，快捷指令无法由外部静默推送。只需添加 2 个积木动作，30 秒即可在手机上搭好！
            </p>
          </div>

          <div className="flex items-center gap-2">
            {qrCodeUrl && (
              <button
                type="button"
                onClick={() => setShowQrCode(!showQrCode)}
                className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 text-xs font-semibold flex items-center gap-1 shadow-sm transition"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>{showQrCode ? '隐藏二维码' : '手机扫码向导'}</span>
              </button>
            )}

            {pairInfo && (
              <a
                href={`/api/transactions/shortcut-file?token=${encodeURIComponent(pairInfo.token)}`}
                download="随手记账.shortcut"
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1 shadow-sm transition"
                title="在 Mac 上双击可直接导入已配置好的快捷指令"
              >
                <Download className="w-3.5 h-3.5" />
                <span>下载 .shortcut (Mac)</span>
              </a>
            )}
          </div>
        </div>

        {/* 扫码二维码展示区 (PC 屏幕专用) */}
        {showQrCode && qrCodeUrl && (
          <div className="p-4 rounded-2xl bg-white border border-indigo-100 flex flex-col sm:flex-row items-center gap-4 animate-fadeIn">
            <img
              src={qrCodeUrl}
              alt="手机扫码一键配置"
              className="w-36 h-36 rounded-xl border border-slate-200 p-1 bg-white shadow-sm"
            />
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                <span>拿起 iPhone 相机对准左侧二维码</span>
              </div>
              <p>1. 手机相机将直接识别并弹出「随手记账闪电配置」向导页面。</p>
              <p>2. 在手机上一键唤起快捷指令新建，两步拼接即可完成配置。</p>
              <p className="text-[11px] text-indigo-600 font-medium pt-1">
                支持 Siri 语音记账、轻点手机背面两下记账与付款截屏 OCR 自动识别！
              </p>
            </div>
          </div>
        )}

        {/* 步骤 1：直接打开手机快捷指令 App 新建 */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-indigo-100/80 shadow-xs space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-950 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] flex items-center justify-center font-bold">
                1
              </span>
              <span>在手机上调起快捷指令新建</span>
            </span>
            <span className="text-[10px] text-indigo-600 font-semibold px-2 py-0.5 rounded-full bg-indigo-50">
              一步唤起
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={handleOpenShortcutsApp}
              className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-2 transition"
            >
              <PlusCircle className="w-4 h-4" />
              <span>📱 点击在 iPhone 上打开新建快捷指令</span>
            </button>
            <button
              type="button"
              onClick={() => copyText('fullUrl', quickEndpoint)}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold rounded-xl text-xs flex items-center justify-center gap-1 transition"
            >
              {copiedKey === 'fullUrl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedKey === 'fullUrl' ? '已复制接口' : '复制接口 URL'}</span>
            </button>
          </div>
        </div>

        {/* 步骤 2：添加 2 个核心动作拆解 */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-white border border-purple-100/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-950 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-purple-600 text-white text-[11px] flex items-center justify-center font-bold">
                2
              </span>
              <span>在快捷指令编辑页添加 2 个动作（照着填即可）</span>
            </span>
          </div>

          {/* 动作 1 */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1 text-xs">
            <div className="font-bold text-slate-800 flex items-center justify-between">
              <span>动作 A：搜索并添加「请求输入」</span>
              <span className="text-[10px] text-slate-400 font-mono">1/2</span>
            </div>
            <p className="text-slate-600 text-[11px]">
              输入类型选「文本」，提示信息填：<code>输入消费（如：咖啡 18.5、午饭 25、打车 30）</code>
            </p>
          </div>

          {/* 动作 2 */}
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-2 text-xs">
            <div className="font-bold text-slate-800 flex items-center justify-between">
              <span>动作 B：搜索并添加「获取 URL 的内容」</span>
              <span className="text-[10px] text-slate-400 font-mono">2/2</span>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500 font-medium">① URL（点击一键复制后粘贴）：</div>
              <div className="flex items-center gap-1.5">
                <code className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-mono text-slate-800 truncate">
                  {quickEndpoint}
                </code>
                <button
                  type="button"
                  onClick={() => copyText('cardUrl', quickEndpoint)}
                  className="px-2.5 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-lg text-xs font-semibold flex items-center gap-1 transition flex-shrink-0"
                >
                  {copiedKey === 'cardUrl' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'cardUrl' ? '已复制' : '复制'}</span>
                </button>
              </div>
            </div>

            <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-1.5 text-[11px] text-slate-700">
              <div className="font-semibold text-slate-800">② 点击动作右下角展开箭头设置：</div>
              <div>• <strong>方法：</strong>选择 <code>POST</code></div>
              <div className="flex items-center justify-between gap-1 flex-wrap">
                <span>• <strong>标头：</strong>添加 <code>Authorization</code></span>
                <button
                  type="button"
                  onClick={() => copyText('authHeaderVal', authHeaderValue)}
                  className="text-indigo-600 font-bold hover:underline flex items-center gap-1"
                >
                  {copiedKey === 'authHeaderVal' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'authHeaderVal' ? '已复制 Header 值' : '复制 Header 值 (含令牌)'}</span>
                </button>
              </div>
              <div>• <strong>请求正文：</strong>选择 <code>JSON</code>，添加键 <code>text</code>，值选择上面的「提供的输入」！</div>
            </div>
          </div>
        </div>

        {/* 连通性测试 & 触发方式卡片 */}
        <div className="p-3 rounded-2xl bg-white/80 border border-slate-200/60 flex items-center justify-between gap-3 flex-wrap text-xs">
          <div className="flex items-center gap-2 text-slate-700">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              专属 API 令牌已就绪：
              <code className="ml-1 px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-emerald-800 font-semibold">
                {pairInfo?.token_prefix || (newPlainToken ? `${newPlainToken.slice(0, 14)}...` : '加载中...')}
              </code>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={testing || (!pairInfo && !newPlainToken)}
              onClick={handleTestCall}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs flex items-center gap-1 transition disabled:opacity-60"
            >
              <Send className="w-3 h-3 text-indigo-600" />
              <span>{testing ? '测试中...' : '发送一条 ¥0.01 测试'}</span>
            </button>
          </div>
        </div>

        {testResult && (
          <div
            className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
              testResult.includes('失败')
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{testResult}</span>
          </div>
        )}

        {/* 自定义保存个人 iCloud 分享链接 */}
        <div className="p-3 rounded-2xl bg-white/60 border border-slate-200/50 space-y-1.5 text-xs">
          <div className="font-bold text-slate-700 flex items-center gap-1">
            <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
            <span>保存您的专属 iCloud 分享链接（可选）</span>
          </div>
          <p className="text-[11px] text-slate-500">
            如果您在手机上配置好后点击了右上角的「分享」→「拷贝 iCloud 链接」，可以保存在这里，换手机或分享给家人时可直接一键添加：
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customICloudUrl}
              onChange={(e) => handleSaveICloudUrl(e.target.value)}
              placeholder="https://www.icloud.com/shortcuts/..."
              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {customICloudUrl && (
              <a
                href={customICloudUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[11px] font-bold flex items-center gap-1 hover:bg-indigo-700 transition"
              >
                <span>打开</span>
              </a>
            )}
          </div>
        </div>

        {/* 触发技巧速览 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
          <div className="p-2.5 rounded-xl bg-white/60 border border-slate-200/50 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <span>🗣️ Siri 语音记账</span>
            </div>
            <p className="text-slate-500 leading-tight">
              对手机说「嘿 Siri，随手记账」，语音说「咖啡 18」直接自动入账。
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/60 border border-slate-200/50 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <span>📱 轻点背面记账</span>
            </div>
            <p className="text-slate-500 leading-tight">
              在「设置-辅助功能-触控-轻点背面」设为「随手记账」，敲两下背面即弹窗。
            </p>
          </div>
          <div className="p-2.5 rounded-xl bg-white/60 border border-slate-200/50 space-y-1">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <span>📸 支付截图 OCR</span>
            </div>
            <p className="text-slate-500 leading-tight">
              微信/支付宝付款后截图，在系统分享中选择「随手记账」自动提取金额商户。
            </p>
          </div>
        </div>
      </div>

      {/* 展开/折叠 高级开发者参数 & 手动长期 API Token 管理 */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 text-xs font-semibold flex items-center justify-between transition"
        >
          <span className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <span>开发者高级配置与手动 Token 管理（自定义 Webhook / 自动化脚本）</span>
          </span>
          {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-4 animate-fadeIn">
            {/* 长期 API Token 管理 */}
            <div className="space-y-3">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                <span>个人长期 API Token 列表（永不过期，随时可撤销）</span>
              </div>

              {tokenError && (
                <div className="p-2.5 rounded-xl bg-red-50 text-red-600 text-xs">{tokenError}</div>
              )}

              {newPlainToken && (
                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <div className="text-xs font-bold text-amber-900">
                    🔑 刚刚生成的长期令牌明文（关闭或刷新页面后将仅展示前缀）：
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-[11px] font-mono text-slate-800 break-all">
                      {newPlainToken}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyText('newToken', newPlainToken)}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1 flex-shrink-0"
                    >
                      {copiedKey === 'newToken' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedKey === 'newToken' ? '已复制' : '复制'}</span>
                    </button>
                  </div>
                </div>
              )}

              <form onSubmit={handleCreateToken} className="flex gap-2">
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="设备备注，如: Mac 自动化记账"
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 transition disabled:opacity-60"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{creating ? '生成中...' : '生成新令牌'}</span>
                </button>
              </form>

              {tokens.length > 0 && (
                <div className="space-y-1.5">
                  {tokens.map((t) => (
                    <div
                      key={t.id}
                      className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-700 truncate">{t.name}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {t.token_prefix}
                          {t.last_used_at ? ` · 最近调用: ${t.last_used_at.slice(0, 16)}` : ' · 暂未使用'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevoke(t.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition"
                        title="撤销此令牌"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 快捷指令配置参数 */}
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-700">⚡ 极速记账接口配置（POST 请求）</span>
                <button
                  type="button"
                  onClick={() => copyText('url', quickEndpoint)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-[11px] font-medium text-indigo-600 hover:border-indigo-300 flex items-center gap-1"
                >
                  {copiedKey === 'url' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedKey === 'url' ? 'URL 已复制' : '复制接口 URL'}</span>
                </button>
              </div>

              <div className="text-[11px] bg-white border border-slate-200 rounded-xl p-2.5 font-mono text-slate-600 space-y-1 break-all">
                <div>
                  <span className="text-slate-400">URL: </span>
                  {quickEndpoint}
                </div>
                <div>
                  <span className="text-slate-400">Header: </span>
                  Authorization: Bearer {pairInfo?.token || newPlainToken || '<你生成的 cbk_live_ 令牌>'}
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {SHORTCUT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setActiveTpl(tpl.key)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition ${
                      activeTpl === tpl.key
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                    }`}
                  >
                    {tpl.label}
                  </button>
                ))}
              </div>

              <div className="space-y-1.5">
                <div className="text-[11px] text-slate-500">{currentTpl.desc}</div>
                <div className="relative">
                  <pre className="p-2.5 bg-slate-900 text-emerald-300 rounded-xl text-[11px] font-mono overflow-x-auto">
                    {currentTpl.json}
                  </pre>
                  <button
                    type="button"
                    onClick={() => copyText('json', currentTpl.json)}
                    className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] flex items-center gap-1"
                  >
                    {copiedKey === 'json' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === 'json' ? '已复制' : '复制 JSON'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
