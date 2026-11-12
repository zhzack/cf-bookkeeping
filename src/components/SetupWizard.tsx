import React, { useState } from 'react';
import { ShieldCheck, Sparkles, Lock, User as UserIcon, BookOpen } from 'lucide-react';
import { fetchApi } from '../api';
import { User } from '../types';

interface Props {
  onSuccess: (user: User, openGuideAfterSetup?: boolean) => void;
  onOpenGuide?: () => void;
}

export const SetupWizard: React.FC<Props> = ({ onSuccess, onOpenGuide }) => {
  const [username, setUsername] = useState('admin');
  const [nickname, setNickname] = useState('生活家');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [openGuideAfterSetup, setOpenGuideAfterSetup] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (password.length < 6) {
      setError('密码长度至少需要 6 位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchApi<{ user: User }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          nickname: nickname.trim(),
          password,
        }),
      });
      onSuccess(data.user, openGuideAfterSetup);
    } catch (err: any) {
      setError(err.message || '初始化失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/80 backdrop-blur-md border border-indigo-100 shadow-xl rounded-3xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-tr from-indigo-600 to-indigo-400 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-200 text-white mb-4">
            <Sparkles className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">欢迎使用云端轻记账</h1>
          <p className="text-sm text-slate-500 mt-1">首次部署，请设置您的管理员账号与密码</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">管理账号 (用户名)</label>
            <div className="relative">
              <UserIcon className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如: admin"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">您的昵称</label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="例如: 生活家"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">登录密码 (至少6位)</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">确认密码</label>
            <div className="relative">
              <Lock className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={openGuideAfterSetup}
              onChange={(e) => setOpenGuideAfterSetup(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>注册完成后立即打开详细使用说明（推荐新手阅读）</span>
          </label>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-medium rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{loading ? '正在初始化并创建预置数据...' : '完成设置并开启记账'}</span>
            </button>

            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                className="w-full py-2.5 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <BookOpen className="w-4 h-4" />
                <span>先阅读详细使用说明（定期账单 / 生活成本 / 大件管理）</span>
              </button>
            )}
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          数据保存在您独占的 Cloudflare D1 边缘数据库中，安全可控
        </p>
      </div>
    </div>
  );
};

