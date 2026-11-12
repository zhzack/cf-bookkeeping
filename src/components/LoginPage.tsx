import React, { useState } from 'react';
import { Lock, User as UserIcon, LogIn, Sparkles, BookOpen } from 'lucide-react';
import { fetchApi } from '../api';
import { User } from '../types';

interface Props {
  onSuccess: (user: User) => void;
  onOpenGuide?: () => void;
}

export const LoginPage: React.FC<Props> = ({ onSuccess, onOpenGuide }) => {
  const [username, setUsername] = useState(() => localStorage.getItem('last_username') || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setLoading(true);
    try {
      const data = await fetchApi<{ user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });
      localStorage.setItem('last_username', username.trim());
      onSuccess(data.user);
    } catch (err: any) {
      setError(err.message || '用户名或密码错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white/80 backdrop-blur-md border border-indigo-100 shadow-xl rounded-3xl p-6 sm:p-8">
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-indigo-200 text-white mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-800">小记 · 云端轻记账</h1>
          <p className="text-xs text-slate-400 mt-1">请输入您的账号与密码登录</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">账号</label>
            <div className="relative">
              <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">密码</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition"
              />
            </div>
          </div>

          <div className="pt-2 space-y-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white font-medium text-sm rounded-xl shadow-md shadow-indigo-200 flex items-center justify-center gap-2 transition disabled:opacity-60"
            >
              <LogIn className="w-4 h-4" />
              <span>{loading ? '正在登录...' : '登 录'}</span>
            </button>

            {onOpenGuide && (
              <button
                type="button"
                onClick={onOpenGuide}
                className="w-full py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded-xl flex items-center justify-center gap-1.5 transition"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>查看详细使用说明</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

