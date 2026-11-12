import React, { useState } from 'react';
import { User as UserIcon, Lock, Download, LogOut, Check, Shield, Cloud } from 'lucide-react';
import { fetchApi } from '../api';
import { User, Transaction, Account, Category } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
}

export const SettingsView: React.FC<Props> = ({ user, onLogout }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [msg, setMsg] = useState({ text: '', isError: false });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

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
    </div>
  );
};

