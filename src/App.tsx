import React, { useState, useEffect } from 'react';
import { 
  ReceiptText, 
  Package,
  PieChart, 
  Wallet, 
  Settings as SettingsIcon, 
  Plus, 
  Sparkles 
} from 'lucide-react';
import { fetchApi } from './api';
import { User, Account, Category, Transaction, ItemWithStats } from './types';
import { SetupWizard } from './components/SetupWizard';
import { LoginPage } from './components/LoginPage';
import { TransactionModal } from './components/TransactionModal';
import { AccountModal } from './components/AccountModal';
import { ItemModal } from './components/ItemModal';
import { TransactionsView } from './views/TransactionsView';
import { ItemsView } from './views/ItemsView';
import { StatsView } from './views/StatsView';
import { AccountsView } from './views/AccountsView';
import { SettingsView } from './views/SettingsView';

export function App() {
  const [initLoading, setInitLoading] = useState(true);
  const [needSetup, setNeedSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState<'transactions' | 'items' | 'stats' | 'accounts' | 'settings'>('transactions');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithStats | null>(null);
  const [isWishlistDefault, setIsWishlistDefault] = useState(false);

  // 1. 检查系统状态 (是否需要首次配置) 与用户登录状态
  const checkStatus = async () => {
    try {
      const statusRes = await fetchApi<{ needSetup: boolean }>('/api/auth/status');
      if (statusRes.needSetup) {
        setNeedSetup(true);
        setInitLoading(false);
        return;
      }

      // 尝试获取当前登录用户
      const meRes = await fetchApi<{ user: User }>('/api/auth/me');
      setUser(meRes.user);
    } catch (err) {
      setUser(null);
    } finally {
      setInitLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  // 2. 加载基础账户和分类数据
  const loadBaseData = async () => {
    if (!user) return;
    try {
      const [accRes, catRes] = await Promise.all([
        fetchApi<{ accounts: Account[] }>('/api/accounts'),
        fetchApi<{ categories: Category[] }>('/api/categories'),
      ]);
      setAccounts(accRes.accounts);
      setCategories(catRes.categories);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadBaseData();
  }, [user, refreshTrigger]);

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  const handleLogout = async () => {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
    }
  };

  if (initLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-400">正在连接云端...</p>
        </div>
      </div>
    );
  }

  // 首次部署：引导设置管理员
  if (needSetup) {
    return (
      <SetupWizard
        onSuccess={(u) => {
          setUser(u);
          setNeedSetup(false);
          triggerRefresh();
        }}
      />
    );
  }

  // 未登录状态：展示账号密码登录表单
  if (!user) {
    return (
      <LoginPage
        onSuccess={(u) => {
          setUser(u);
          triggerRefresh();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-16 sm:pb-0">
      {/* 桌面端导航栏 */}
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-slate-100 hidden sm:block">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-200">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-800 text-base">小记</span>
          </div>

          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('transactions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'transactions' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              明细
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'items' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              大件
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'stats' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              统计
            </button>
            <button
              onClick={() => setActiveTab('accounts')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'accounts' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              账户
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              设置
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setEditingTx(null);
                setIsTxModalOpen(true);
              }}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md shadow-indigo-200 flex items-center gap-1.5 transition"
            >
              <Plus className="w-4 h-4" />
              <span>记一笔</span>
            </button>
          </div>
        </div>
      </header>

      {/* 移动端顶部标题栏 */}
      <div className="sm:hidden sticky top-0 z-30 bg-white/80 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="font-bold text-slate-800 text-sm">小记</span>
        </div>
        <span className="text-xs font-semibold text-slate-400">
          {activeTab === 'transactions' ? '流水明细' : activeTab === 'items' ? '大件日均' : activeTab === 'stats' ? '财务统计' : activeTab === 'accounts' ? '账户管理' : '个人设置'}
        </span>
      </div>

      {/* 主视图内容区域 */}
      <main className="max-w-2xl mx-auto px-4 py-4 sm:py-6">
        {activeTab === 'transactions' && (
          <TransactionsView
            onOpenAddModal={() => {
              setEditingTx(null);
              setIsTxModalOpen(true);
            }}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setIsTxModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
          />
        )}

        {activeTab === 'items' && (
          <ItemsView
            onOpenAddItem={(isWishlist = false) => {
              setIsWishlistDefault(isWishlist);
              setEditingItem(null);
              setIsItemModalOpen(true);
            }}
            onEditItem={(item) => {
              setIsWishlistDefault(item.status === 'wishlist');
              setEditingItem(item);
              setIsItemModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
            accounts={accounts}
          />
        )}

        {activeTab === 'stats' && <StatsView refreshTrigger={refreshTrigger} />}

        {activeTab === 'accounts' && (
          <AccountsView
            accounts={accounts}
            onOpenAddAccount={() => {
              setEditingAccount(null);
              setIsAccountModalOpen(true);
            }}
            onEditAccount={(acc) => {
              setEditingAccount(acc);
              setIsAccountModalOpen(true);
            }}
          />
        )}

        {activeTab === 'settings' && <SettingsView user={user} onLogout={handleLogout} />}
      </main>

      {/* 移动端底部 Tab 导航栏 */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'transactions' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <ReceiptText className="w-5 h-5" />
          <span className="text-[10px]">明细</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'items' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px]">大件</span>
        </button>

        {/* 居中记账按钮 */}
        <div className="relative -top-4">
          <button
            onClick={() => {
              if (activeTab === 'items') {
                setEditingItem(null);
                setIsItemModalOpen(true);
              } else {
                setEditingTx(null);
                setIsTxModalOpen(true);
              }
            }}
            className="w-12 h-12 p-3 bg-gradient-to-tr from-indigo-600 to-indigo-500 active:scale-90 text-white rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center transition"
          >
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </button>
        </div>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'stats' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <PieChart className="w-5 h-5" />
          <span className="text-[10px]">统计</span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'accounts' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <Wallet className="w-5 h-5" />
          <span className="text-[10px]">账户</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'settings' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <SettingsIcon className="w-5 h-5" />
          <span className="text-[10px]">设置</span>
        </button>
      </div>

      {/* 交易弹窗 (新增 / 编辑) */}
      <TransactionModal
        isOpen={isTxModalOpen}
        onClose={() => {
          setIsTxModalOpen(false);
          setEditingTx(null);
        }}
        onSuccess={triggerRefresh}
        accounts={accounts}
        categories={categories}
        initialData={editingTx}
      />

      {/* 账户弹窗 (新增 / 编辑) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          setIsAccountModalOpen(false);
          setEditingAccount(null);
        }}
        onSuccess={triggerRefresh}
        account={editingAccount}
      />

      {/* 大件物品弹窗 (新增 / 编辑) */}
      <ItemModal
        isOpen={isItemModalOpen}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingItem(null);
        }}
        onSuccess={triggerRefresh}
        initialItem={editingItem}
        accounts={accounts}
        defaultWishlist={isWishlistDefault}
      />
    </div>
  );
}
export default App;
