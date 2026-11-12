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
} from 'lucide-react';
import { fetchApi } from '../api';
import { ApiTokenInfo } from '../types';
import { GuideSectionId } from '../data/userGuide';

interface Props {
  onOpenImport?: () => void;
  onOpenGuide: (sectionId?: GuideSectionId) => void;
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

  useEffect(() => {
    loadTokens();
  }, []);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(''), 1800);
    } catch {
      alert('复制失败，请手动长按或选中复制');
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

      {/* 长期 API Token 管理 */}
      <div className="space-y-3 pt-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <KeyRound className="w-3.5 h-3.5 text-amber-500" />
          <span>个人长期 API Token（永不过期，随时可撤销）</span>
        </div>

        {tokenError && (
          <div className="p-2.5 rounded-xl bg-red-50 text-red-600 text-xs">{tokenError}</div>
        )}

        {newPlainToken && (
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
            <div className="text-xs font-bold text-amber-900">
              🔑 请立即复制保存新令牌（关闭或刷新页面后将不再完整显示）：
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
            placeholder="设备备注，如: iPhone 快捷指令"
            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 transition disabled:opacity-60"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{creating ? '生成中...' : '生成令牌'}</span>
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
            Authorization: Bearer {newPlainToken || '<你生成的 cbk_live_ 令牌>'}
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
  );
};
