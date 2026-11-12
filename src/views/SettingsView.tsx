import React, { useState, useEffect } from 'react';
import { Lock, Download, LogOut, Cloud, BookOpen, Bell, BellOff, RotateCcw, Tags, Wand2 } from 'lucide-react';
import { fetchApi } from '../api';
import { User, Transaction, Account, Category, AutoRule } from '../types';
import { GuideSectionId } from '../data/userGuide';
import { ShortcutTokensCard } from '../components/ShortcutTokensCard';
import { CategoryManageModal } from '../components/CategoryManageModal';
import { RuleManageModal } from '../components/RuleManageModal';
import { DynamicIcon } from '../components/DynamicIcon';

interface Props {
  user: User;
  accounts: Account[];
  categories: Category[];
  onCategoriesChanged: () => void;
  onLogout: () => void;
  onOpenGuide: (sectionId?: GuideSectionId) => void;
  onOpenImport?: () => void;
  disableAllTips: boolean;
  onToggleDisableAllTips: (disabled: boolean) => void;
  onResetFeatureTips: () => void;
}

export const SettingsView: React.FC<Props> = ({
  user,
  accounts,
  categories,
  onCategoriesChanged,
  onLogout,
  onOpenGuide,
  onOpenImport,
  disableAllTips,
  onToggleDisableAllTips,
  onResetFeatureTips,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', isError: false });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [catModalType, setCatModalType] = useState<'expense' | 'income'>('expense');
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [rules, setRules] = useState<AutoRule[]>([]);

  const loadRules = () => {
    fetchApi<{ rules: AutoRule[] }>('/api/rules')
      .then((res) => setRules(res.rules || []))
      .catch(() => {});
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ text: '', isError: false });

    if (newPassword.length < 6) {
      setMsg({ text: '新密码不能少于 6 位', isError: true });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMsg({ text: '两次输入的新密码不一致', isError: true });
      return;
    }

    setLoading(true);
    try {
      await fetchApi('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      setMsg({ text: '密码修改成功！', isError: false });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setMsg({ text: err.message || '密码修改失败', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    try {
      // 获取全部流水与账户
      const [transData, accountsData, catsData] = await Promise.all([
        fetchApi<{ transactions: Transaction[] }>('/api/transactions?limit=2000'),
        fetchApi<{ accounts: Account[] }>('/api/accounts'),
        fetchApi<{ categories: Category[] }>('/api/categories'),
      ]);

      const backupObj = {
        export_time: new Date().toISOString(),
        user: { username: user.username, nickname: user.nickname },
        accounts: accountsData.accounts,
        categories: catsData.categories,
        transactions: transData.transactions,
      };

      const blob = new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cf_bookkeeping_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('导出失败: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 用户信息卡片 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex items-center gap-4">
        <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-xl">
          {user.nickname?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase() || 'U'}
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">{user.nickname || user.username}</h2>
          <p className="text-xs text-slate-400 mt-0.5">账号: @{user.username}</p>
        </div>
      </div>

      {/* 使用说明与首次功能介绍提醒 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-4 h-4 text-indigo-500" />
            <span>使用说明与功能引导</span>
          </h3>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          包含定期支付账单记法（房租/宽带/订阅分摊）、每日生活成本计算口径、记账拍照与持物大件管理详细教程。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onOpenGuide('periodic-bills')}
            className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition shadow-sm"
          >
            <BookOpen className="w-4 h-4" />
            <span>打开完整使用说明</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenGuide('items-wishlist')}
            className="py-2.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 transition"
          >
            <span>查看大件 & 心愿单指南</span>
          </button>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            {disableAllTips ? (
              <BellOff className="w-4 h-4 text-slate-400" />
            ) : (
              <Bell className="w-4 h-4 text-emerald-500" />
            )}
            <span>
              首次进入功能自动弹窗介绍：
              <strong className={disableAllTips ? 'text-slate-500' : 'text-emerald-600'}>
                {disableAllTips ? ' 已关闭' : ' 已开启'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onToggleDisableAllTips(!disableAllTips)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium transition"
            >
              {disableAllTips ? '重新开启提醒' : '以后不再自动提醒'}
            </button>
            <button
              type="button"
              onClick={() => {
                onResetFeatureTips();
                alert('已重置所有页面的首次引导提示，下次进入对应页面将重新为您展示。');
              }}
              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 text-[11px] font-medium flex items-center gap-1 transition"
            >
              <RotateCcw className="w-3 h-3" />
              <span>重置提示记录</span>
            </button>
          </div>
        </div>
      </div>

      {/* 账单导入与 iOS 快捷指令记账 */}
      <ShortcutTokensCard onOpenImport={onOpenImport} onOpenGuide={onOpenGuide} />

      {/* 收支分类管理 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Tags className="w-4 h-4 text-indigo-500" />
            <span>收支分类管理</span>
          </h3>
          <button
            type="button"
            onClick={() => {
              setCatModalType('expense');
              setCatModalOpen(true);
            }}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
          >
            添加 / 编辑分类
          </button>
        </div>

        <p className="text-xs text-slate-400">
          支持自定义新增、重命名、更换图标颜色及删除分类（已有流水在删除对应分类后会安全保留为「未分类」）。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(['expense', 'income'] as const).map((t) => {
            const sub = categories.filter((c) => c.type === t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setCatModalType(t);
                  setCatModalOpen(true);
                }}
                className="text-left p-3 rounded-2xl bg-slate-50 hover:bg-indigo-50/50 border border-slate-100 hover:border-indigo-200 transition space-y-2"
              >
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>{t === 'expense' ? '支出分类' : '收入分类'}</span>
                  <span className="text-[11px] text-slate-400">{sub.length} 项 →</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sub.slice(0, 6).map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[11px] text-slate-600"
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: cat.color || '#64748B' }}
                      >
                        <DynamicIcon name={cat.icon} className="w-2.5 h-2.5" />
                      </span>
                      <span>{cat.name}</span>
                    </span>
                  ))}
                  {sub.length > 6 && (
                    <span className="text-[11px] text-slate-400 self-center">
                      +{sub.length - 6}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 自动分类与消费场景规则 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-indigo-500" />
            <span>自动分类与场景规则</span>
          </h3>
          <button
            type="button"
            onClick={() => setRuleModalOpen(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-sm"
          >
            添加 / 编辑规则
          </button>
        </div>

        <p className="text-xs text-slate-400">
          设置商户/备注关键词规则后，导入微信支付宝账单、快捷指令记账、手写备注及一键整理历史流水都会自动归类并打标消费场景。
        </p>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-semibold">
            共 {rules.length} 条规则（启用 {rules.filter((r) => r.enabled === 1).length} 条）
          </span>
          {rules.slice(0, 4).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRuleModalOpen(true)}
              className="px-2.5 py-1 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium transition"
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      {/* 修改密码 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <Lock className="w-4 h-4 text-slate-400" />
          <span>修改密码</span>
        </h3>

        {msg.text && (
          <div
            className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
              msg.isError ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'
            }`}
          >
            {msg.isError ? '⚠️' : '✓'} {msg.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">原密码</label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">新密码</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">确认新密码</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold transition disabled:opacity-60"
          >
            {loading ? '正在更新密码...' : '确认更新密码'}
          </button>
        </form>
      </div>

      {/* 数据安全与备份 */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Download className="w-4 h-4 text-slate-400" />
          <span>数据备份与导出</span>
        </h3>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          定期导出完整的 JSON 数据备份文件，随时随地掌握自己的财务资产数据。
        </p>

        <button
          onClick={handleExportData}
          disabled={exporting}
          className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-xs rounded-xl flex items-center justify-center gap-2 transition"
        >
          <Download className="w-4 h-4" />
          <span>{exporting ? '正在打包数据...' : '全量导出记账数据 (JSON)'}</span>
        </button>
      </div>

      {/* 云平台信息 */}
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-500 flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
          <Cloud className="w-5 h-5" />
        </div>
        <div>
          <div className="font-semibold text-slate-700">Cloudflare Serverless 驱动</div>
          <div className="text-[11px] text-slate-400 mt-0.5">运行于 Cloudflare Workers 与 D1 边缘数据库，100% 零成本</div>
        </div>
      </div>

      {/* 退出登录 */}
      <button
        onClick={onLogout}
        className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-2xl flex items-center justify-center gap-2 transition"
      >
        <LogOut className="w-4 h-4" />
        <span>退出当前账号</span>
      </button>

      <CategoryManageModal
        isOpen={catModalOpen}
        categories={categories}
        defaultType={catModalType}
        onClose={() => setCatModalOpen(false)}
        onChanged={() => onCategoriesChanged()}
      />

      <RuleManageModal
        isOpen={ruleModalOpen}
        accounts={accounts}
        categories={categories}
        onClose={() => setRuleModalOpen(false)}
        onChanged={() => {
          loadRules();
          onCategoriesChanged();
        }}
      />
    </div>
  );
};

