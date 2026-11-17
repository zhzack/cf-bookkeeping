import React, { useState, useEffect, Suspense, lazy } from 'react';
import { 
  ReceiptText, 
  Package,
  CreditCard,
  Calendar,
  PieChart, 
  Wallet, 
  Settings as SettingsIcon, 
  Plus, 
  Sparkles,
  BookOpen
} from 'lucide-react';
import { fetchApi } from './api';
import { User, Account, Category, Transaction, ItemWithStats, PrepaidCardWithStats, SubscriptionWithStats } from './types';
import {
  FEATURE_TIPS,
  FeatureTipKey,
  GuidePreferences,
  GuideSectionId,
  loadGuidePrefs,
  markFeatureTipDismissed,
  resetAllFeatureTips,
  setDisableAllFeatureTips,
} from './data/userGuide';
import { TransactionsView } from './views/TransactionsView';
import { ErrorBoundary } from './components/ErrorBoundary';

// 懒加载各功能视图与弹窗（路由级按需代码拆分，大幅缩减首屏加载时间）
const ItemsView = lazy(() => import('./views/ItemsView').then((m) => ({ default: m.ItemsView })));
const CardsView = lazy(() => import('./views/CardsView').then((m) => ({ default: m.CardsView })));
const SubscriptionsView = lazy(() =>
  import('./views/SubscriptionsView').then((m) => ({ default: m.SubscriptionsView }))
);
const StatsView = lazy(() => import('./views/StatsView').then((m) => ({ default: m.StatsView })));
const AccountsView = lazy(() => import('./views/AccountsView').then((m) => ({ default: m.AccountsView })));
const SettingsView = lazy(() => import('./views/SettingsView').then((m) => ({ default: m.SettingsView })));

const SetupWizard = lazy(() => import('./components/SetupWizard').then((m) => ({ default: m.SetupWizard })));
const LoginPage = lazy(() => import('./components/LoginPage').then((m) => ({ default: m.LoginPage })));
const TransactionModal = lazy(() =>
  import('./components/TransactionModal').then((m) => ({ default: m.TransactionModal }))
);
const ConvertToItemModal = lazy(() =>
  import('./components/ConvertToItemModal').then((m) => ({ default: m.ConvertToItemModal }))
);
const ConvertToCardModal = lazy(() =>
  import('./components/ConvertToCardModal').then((m) => ({ default: m.ConvertToCardModal }))
);
const CardModal = lazy(() => import('./components/CardModal').then((m) => ({ default: m.CardModal })));
const CardConsumeModal = lazy(() =>
  import('./components/CardConsumeModal').then((m) => ({ default: m.CardConsumeModal }))
);
const CardRechargeModal = lazy(() =>
  import('./components/CardRechargeModal').then((m) => ({ default: m.CardRechargeModal }))
);
const CardAdjustModal = lazy(() =>
  import('./components/CardAdjustModal').then((m) => ({ default: m.CardAdjustModal }))
);
const CardDetailModal = lazy(() =>
  import('./components/CardDetailModal').then((m) => ({ default: m.CardDetailModal }))
);
const SubscriptionModal = lazy(() =>
  import('./components/SubscriptionModal').then((m) => ({ default: m.SubscriptionModal }))
);
const SubscriptionDetailModal = lazy(() =>
  import('./components/SubscriptionDetailModal').then((m) => ({ default: m.SubscriptionDetailModal }))
);
const AiRecordModal = lazy(() =>
  import('./components/AiRecordModal').then((m) => ({ default: m.AiRecordModal }))
);
const BillImportModal = lazy(() =>
  import('./components/BillImportModal').then((m) => ({ default: m.BillImportModal }))
);
const AccountModal = lazy(() =>
  import('./components/AccountModal').then((m) => ({ default: m.AccountModal }))
);
const ItemModal = lazy(() => import('./components/ItemModal').then((m) => ({ default: m.ItemModal })));
const UserGuideModal = lazy(() =>
  import('./components/UserGuideModal').then((m) => ({ default: m.UserGuideModal }))
);
const FeatureTipModal = lazy(() =>
  import('./components/FeatureTipModal').then((m) => ({ default: m.FeatureTipModal }))
);
const MobileShortcutPairModal = lazy(() =>
  import('./components/MobileShortcutPairModal').then((m) => ({ default: m.MobileShortcutPairModal }))
);

const ViewSkeleton = () => (
  <div className="space-y-4 animate-pulse py-4">
    <div className="h-24 bg-white rounded-3xl w-full border border-slate-100"></div>
    <div className="h-64 bg-white rounded-3xl w-full border border-slate-100"></div>
  </div>
);

export function App() {
  const [initLoading, setInitLoading] = useState(true);
  const [needSetup, setNeedSetup] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const [activeTab, setActiveTab] = useState<'transactions' | 'items' | 'cards' | 'subscriptions' | 'stats' | 'accounts' | 'settings'>('transactions');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Modals
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [convertingTx, setConvertingTx] = useState<Transaction | null>(null);
  const [convertingCardTx, setConvertingCardTx] = useState<Transaction | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemWithStats | null>(null);
  const [isWishlistDefault, setIsWishlistDefault] = useState(false);

  // 充值卡相关弹窗状态
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<PrepaidCardWithStats | null>(null);
  const [isCardConsumeOpen, setIsCardConsumeOpen] = useState(false);
  const [consumingCard, setConsumingCard] = useState<PrepaidCardWithStats | null>(null);
  const [isCardRechargeOpen, setIsCardRechargeOpen] = useState(false);
  const [rechargingCard, setRechargingCard] = useState<PrepaidCardWithStats | null>(null);
  const [isCardAdjustOpen, setIsCardAdjustOpen] = useState(false);
  const [adjustingCard, setAdjustingCard] = useState<PrepaidCardWithStats | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);

  // 周期订阅 / 周期收入相关弹窗状态
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subModalDefaultType, setSubModalDefaultType] = useState<'expense' | 'income'>('expense');
  const [editingSub, setEditingSub] = useState<SubscriptionWithStats | null>(null);
  const [detailSubId, setDetailSubId] = useState<string | null>(null);

  // AI 智能记账弹窗状态
  const [isAiRecordOpen, setIsAiRecordOpen] = useState(false);

  // 使用说明 & 首次功能引导状态
  const [guidePrefs, setGuidePrefs] = useState<GuidePreferences>(() => loadGuidePrefs(null));
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [guideSection, setGuideSection] = useState<GuideSectionId>('periodic-bills');
  const [activeFeatureTipKey, setActiveFeatureTipKey] = useState<FeatureTipKey | null>(null);

  // 手机扫码快捷指令自动配对状态
  const [mobilePairToken, setMobilePairToken] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlSsoToken = params.get('sso_token');
      if (urlSsoToken) {
        sessionStorage.setItem('sso_token', urlSsoToken);
        params.delete('sso_token');
        const newSearch = params.toString() ? `?${params.toString()}` : '';
        window.history.replaceState(null, '', window.location.pathname + newSearch + window.location.hash);
      }
      if (params.get('shortcut_pair') === '1' && params.get('token')) {
        setMobilePairToken(params.get('token'));
      }
    }
  }, []);

  // 1. 检查系统状态 (是否需要首次配置) 与用户登录状态
  const checkStatus = async () => {
    try {
      const statusRes = await fetchApi<{ needSetup: boolean; ssoAuthUrl?: string }>('/api/auth/status');

      // 尝试获取当前登录用户
      try {
        const meRes = await fetchApi<{ user: User }>('/api/auth/me');
        sessionStorage.removeItem('sso_redirect_count');
        sessionStorage.removeItem('sso_redirect_time');
        setUser(meRes.user);
        setInitLoading(false);
        return;
      } catch (authErr) {
        // 未登录状态
        const host = window.location.hostname;
        const isB1uegreyDomain = host === 'b1uegrey.xyz' || host.endsWith('.b1uegrey.xyz');
        const ssoAuthUrl = statusRes.ssoAuthUrl || 'https://auth.b1uegrey.xyz';

        // 若处于主域/子域环境且未登录，自动跳转至统一 SSO 身份认证中心
        if (isB1uegreyDomain) {
          const redirectCount = parseInt(sessionStorage.getItem('sso_redirect_count') || '0', 10);
          const lastRedirectTime = parseInt(sessionStorage.getItem('sso_redirect_time') || '0', 10);
          const isRapidLoop = Date.now() - lastRedirectTime < 6000 && redirectCount >= 2;

          if (isRapidLoop) {
            console.warn('检测到 SSO 快速重定向循环，已自动阻断并清除可能冲突的残留 Cookie。');
            sessionStorage.removeItem('sso_redirect_count');
            sessionStorage.removeItem('sso_token');
            document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            setUser(null);
            setInitLoading(false);
            return;
          }

          sessionStorage.setItem('sso_redirect_count', String(redirectCount + 1));
          sessionStorage.setItem('sso_redirect_time', String(Date.now()));

          const redirectTarget = encodeURIComponent(window.location.href);
          window.location.href = `${ssoAuthUrl}/?redirect=${redirectTarget}`;
          return;
        }

        // 本地环境：若未初始化展示向导，否则展示本地登录页
        if (statusRes.needSetup) {
          setNeedSetup(true);
        }
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setInitLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const handleUnauthorized = () => {
      setUser(null);
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
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

  useEffect(() => {
    setGuidePrefs(loadGuidePrefs(user?.id));
  }, [user?.id]);

  // 首次打开对应功能模块时，展示操作介绍（支持“以后再也不提示”）
  useEffect(() => {
    if (!user || isGuideOpen || guidePrefs.disableAllTips) {
      setActiveFeatureTipKey(null);
      return;
    }

    let candidate: FeatureTipKey | null = null;
    if (isTxModalOpen) {
      candidate = 'tx_modal';
    } else if (!isItemModalOpen && !isAccountModalOpen && !convertingTx && !isImportModalOpen) {
      if (activeTab === 'transactions' || activeTab === 'items' || activeTab === 'stats' || activeTab === 'accounts') {
        candidate = activeTab;
      }
    }

    if (candidate && !guidePrefs.dismissedFeatures[candidate]) {
      setActiveFeatureTipKey(candidate);
    } else {
      setActiveFeatureTipKey(null);
    }
  }, [
    user,
    isGuideOpen,
    guidePrefs,
    activeTab,
    isTxModalOpen,
    isItemModalOpen,
    isAccountModalOpen,
    convertingTx,
    isImportModalOpen,
  ]);

  const openGuideModal = (section: GuideSectionId = 'periodic-bills') => {
    setGuideSection(section);
    setIsGuideOpen(true);
  };

  const triggerRefresh = () => setRefreshTrigger((prev) => prev + 1);

  const handleLogout = async () => {
    try {
      await fetchApi('/api/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      const host = window.location.hostname;
      if (host === 'b1uegrey.xyz' || host.endsWith('.b1uegrey.xyz')) {
        window.location.href = `https://auth.b1uegrey.xyz/?redirect=${encodeURIComponent(window.location.href)}`;
      }
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    try {
      await fetchApi(`/api/cards/${cardId}`, { method: 'DELETE' });
      triggerRefresh();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const handleDeleteSub = async (subId: string) => {
    try {
      await fetchApi(`/api/subscriptions/${subId}`, { method: 'DELETE' });
      triggerRefresh();
    } catch (err: any) {
      alert(err.message || '删除失败');
    }
  };

  const userGuideModalNode = (
    <UserGuideModal
      isOpen={isGuideOpen}
      initialSection={guideSection}
      disableAllTips={guidePrefs.disableAllTips}
      onToggleDisableAllTips={(disabled) => {
        setGuidePrefs(setDisableAllFeatureTips(user?.id, disabled));
      }}
      onResetFeatureTips={
        user
          ? () => {
              setGuidePrefs(resetAllFeatureTips(user.id));
            }
          : undefined
      }
      onClose={() => setIsGuideOpen(false)}
    />
  );

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
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <SetupWizard
          onSuccess={(u, openGuideAfterSetup) => {
            setUser(u);
            setNeedSetup(false);
            setGuidePrefs(loadGuidePrefs(u.id));
            if (openGuideAfterSetup) {
              openGuideModal('periodic-bills');
            }
            triggerRefresh();
          }}
          onOpenGuide={() => openGuideModal('periodic-bills')}
        />
        {userGuideModalNode}
      </Suspense>
    );
  }

  // 未登录状态：展示账号密码登录表单
  if (!user) {
    return (
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <LoginPage
          onSuccess={(u) => {
            setUser(u);
            triggerRefresh();
          }}
          onOpenGuide={() => openGuideModal('periodic-bills')}
        />
        {userGuideModalNode}
      </Suspense>
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
              onClick={() => setActiveTab('cards')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'cards' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              卡包
            </button>
            <button
              onClick={() => setActiveTab('subscriptions')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                activeTab === 'subscriptions' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              订阅
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
              type="button"
              onClick={() => openGuideModal('periodic-bills')}
              className="px-3 py-2 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
              title="查看使用说明"
            >
              <BookOpen className="w-4 h-4" />
              <span>使用说明</span>
            </button>
            <button
              type="button"
              onClick={() => setIsAiRecordOpen(true)}
              className="px-3.5 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 flex items-center gap-1.5 transition"
              title="一句话输入或拍照小票记账"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>AI 记账</span>
            </button>
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAiRecordOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm"
          >
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>AI 记账</span>
          </button>
          <button
            type="button"
            onClick={() => openGuideModal('periodic-bills')}
            className="px-2 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-semibold flex items-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>指南</span>
          </button>
        </div>
      </div>

      {/* 主视图内容区域 */}
      <main className="max-w-2xl mx-auto px-4 py-4 sm:py-6">
        {activeTab === 'transactions' && (
          <TransactionsView
            onOpenAddModal={() => {
              setEditingTx(null);
              setIsTxModalOpen(true);
            }}
            onOpenAiRecord={() => setIsAiRecordOpen(true)}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setIsTxModalOpen(true);
            }}
            onConvertToItem={(tx) => {
              setConvertingTx(tx);
            }}
            onConvertToCard={(tx) => {
              setConvertingCardTx(tx);
            }}
            onOpenImport={() => setIsImportModalOpen(true)}
            accounts={accounts}
            categories={categories}
            refreshTrigger={refreshTrigger}
            onCategoriesChanged={triggerRefresh}
          />
        )}

        <ErrorBoundary fallbackTitle="页面视图加载异常">
          <Suspense fallback={<ViewSkeleton />}>
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

          {activeTab === 'cards' && (
            <CardsView
              accounts={accounts}
              categories={categories}
              onOpenAddCard={() => {
                setEditingCard(null);
                setIsCardModalOpen(true);
              }}
              onOpenDetail={(cardId) => {
                setDetailCardId(cardId);
              }}
              onOpenConsume={(card) => {
                setConsumingCard(card);
                setIsCardConsumeOpen(true);
              }}
              onOpenRecharge={(card) => {
                setRechargingCard(card);
                setIsCardRechargeOpen(true);
              }}
              refreshTrigger={refreshTrigger}
            />
          )}

          {activeTab === 'subscriptions' && (
            <SubscriptionsView
              accounts={accounts}
              categories={categories}
              onOpenAddSub={(defaultType = 'expense') => {
                setEditingSub(null);
                setSubModalDefaultType(defaultType);
                setIsSubModalOpen(true);
              }}
              onOpenDetail={(subId) => {
                setDetailSubId(subId);
              }}
              onEditSub={(sub) => {
                setEditingSub(sub);
                setSubModalDefaultType(sub.type === 'income' ? 'income' : 'expense');
                setIsSubModalOpen(true);
              }}
              refreshTrigger={refreshTrigger}
              onRefreshParent={triggerRefresh}
            />
          )}

          {activeTab === 'stats' && (
            <StatsView
              refreshTrigger={refreshTrigger}
              categories={categories}
              onEditTransaction={(tx) => {
                setEditingTx(tx);
                setIsTxModalOpen(true);
              }}
            />
          )}

          {activeTab === 'accounts' && (
            <AccountsView
              accounts={accounts}
              categories={categories}
              onOpenAddAccount={() => {
                setEditingAccount(null);
                setIsAccountModalOpen(true);
              }}
              onEditAccount={(acc) => {
                setEditingAccount(acc);
                setIsAccountModalOpen(true);
              }}
              onRefreshAccounts={triggerRefresh}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              user={user}
              accounts={accounts}
              categories={categories}
              onCategoriesChanged={triggerRefresh}
              onLogout={handleLogout}
              onOpenGuide={(sec) => openGuideModal(sec || 'periodic-bills')}
              onOpenImport={() => setIsImportModalOpen(true)}
              disableAllTips={guidePrefs.disableAllTips}
              onToggleDisableAllTips={(disabled) => {
                setGuidePrefs(setDisableAllFeatureTips(user?.id, disabled));
              }}
              onResetFeatureTips={() => {
                setGuidePrefs(resetAllFeatureTips(user?.id));
              }}
            />
          )}
        </Suspense>
      </ErrorBoundary>
      </main>

      {/* 移动端底部 Tab 导航栏 */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-lg border-t border-slate-100 px-1 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'transactions' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <ReceiptText className="w-4 h-4" />
          <span className="text-[9px]">明细</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'items' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <Package className="w-4 h-4" />
          <span className="text-[9px]">大件</span>
        </button>

        <button
          onClick={() => setActiveTab('cards')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'cards' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span className="text-[9px]">卡包</span>
        </button>

        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'subscriptions' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-[9px]">订阅</span>
        </button>

        {/* 居中记账按钮 */}
        <div className="relative -top-3">
          <button
            onClick={() => {
              if (activeTab === 'items') {
                setEditingItem(null);
                setIsItemModalOpen(true);
              } else if (activeTab === 'cards') {
                setEditingCard(null);
                setIsCardModalOpen(true);
              } else if (activeTab === 'subscriptions') {
                setEditingSub(null);
                setIsSubModalOpen(true);
              } else {
                setEditingTx(null);
                setIsTxModalOpen(true);
              }
            }}
            className="w-11 h-11 p-2.5 bg-gradient-to-tr from-indigo-600 to-indigo-500 active:scale-90 text-white rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center transition"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>

        <button
          onClick={() => setActiveTab('stats')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'stats' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span className="text-[9px]">统计</span>
        </button>

        <button
          onClick={() => setActiveTab('accounts')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'accounts' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span className="text-[9px]">账户</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex flex-col items-center gap-0.5 p-1 transition ${
            activeTab === 'settings' ? 'text-indigo-600 font-bold' : 'text-slate-400'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          <span className="text-[9px]">设置</span>
        </button>
      </div>

      <ErrorBoundary fallbackTitle="功能弹窗加载异常">
        <Suspense fallback={null}>
        {/* 交易弹窗 (新增 / 编辑) */}
        {isTxModalOpen && (
          <TransactionModal
            isOpen={isTxModalOpen}
            onClose={() => {
              setIsTxModalOpen(false);
              setEditingTx(null);
            }}
            onSuccess={triggerRefresh}
            accounts={accounts}
            categories={categories}
            onCategoriesChanged={triggerRefresh}
            initialData={editingTx}
            onConvertToItem={(tx) => {
              setIsTxModalOpen(false);
              setEditingTx(null);
              setConvertingTx(tx);
            }}
            onConvertToCard={(tx) => {
              setIsTxModalOpen(false);
              setEditingTx(null);
              setConvertingCardTx(tx);
            }}
          />
        )}

        {/* 将已有开销转为会员充值卡 / 计次卡弹窗 */}
        {Boolean(convertingCardTx) && (
          <ConvertToCardModal
            isOpen={Boolean(convertingCardTx)}
            transaction={convertingCardTx}
            onClose={() => setConvertingCardTx(null)}
            onSuccess={triggerRefresh}
          />
        )}

        {/* 会员充值卡弹窗 (新增 / 编辑) */}
        {isCardModalOpen && (
          <CardModal
            isOpen={isCardModalOpen}
            onClose={() => {
              setIsCardModalOpen(false);
              setEditingCard(null);
            }}
            onSuccess={triggerRefresh}
            cardToEdit={editingCard}
            accounts={accounts}
            categories={categories}
          />
        )}

        {/* 核销打卡消费弹窗 */}
        {isCardConsumeOpen && (
          <CardConsumeModal
            isOpen={isCardConsumeOpen}
            onClose={() => {
              setIsCardConsumeOpen(false);
              setConsumingCard(null);
            }}
            onSuccess={triggerRefresh}
            card={consumingCard}
            categories={categories}
            accounts={accounts}
          />
        )}

        {/* 续费追加充值弹窗 */}
        {isCardRechargeOpen && (
          <CardRechargeModal
            isOpen={isCardRechargeOpen}
            onClose={() => {
              setIsCardRechargeOpen(false);
              setRechargingCard(null);
            }}
            onSuccess={triggerRefresh}
            card={rechargingCard}
            accounts={accounts}
            categories={categories}
          />
        )}

        {/* 手动校准卡内剩余弹窗 */}
        {isCardAdjustOpen && (
          <CardAdjustModal
            isOpen={isCardAdjustOpen}
            onClose={() => {
              setIsCardAdjustOpen(false);
              setAdjustingCard(null);
            }}
            onSuccess={triggerRefresh}
            card={adjustingCard}
          />
        )}

        {/* 卡片详情与使用轨迹弹窗 */}
        {Boolean(detailCardId) && (
          <CardDetailModal
            isOpen={Boolean(detailCardId)}
            cardId={detailCardId}
            onClose={() => setDetailCardId(null)}
            onConsume={(card) => {
              setConsumingCard(card);
              setIsCardConsumeOpen(true);
            }}
            onRecharge={(card) => {
              setRechargingCard(card);
              setIsCardRechargeOpen(true);
            }}
            onAdjust={(card) => {
              setAdjustingCard(card);
              setIsCardAdjustOpen(true);
            }}
            onEdit={(card) => {
              setEditingCard(card);
              setIsCardModalOpen(true);
            }}
            onDelete={handleDeleteCard}
          />
        )}

        {/* 周期订阅 / 固定收入弹窗 (新增 / 编辑) */}
        {isSubModalOpen && (
          <SubscriptionModal
            isOpen={isSubModalOpen}
            onClose={() => {
              setIsSubModalOpen(false);
              setEditingSub(null);
            }}
            onSuccess={triggerRefresh}
            subscriptionToEdit={editingSub}
            defaultType={subModalDefaultType}
            accounts={accounts}
            categories={categories}
          />
        )}

        {/* 订阅详情与历史扣款弹窗 */}
        {Boolean(detailSubId) && (
          <SubscriptionDetailModal
            isOpen={Boolean(detailSubId)}
            subscriptionId={detailSubId}
            onClose={() => setDetailSubId(null)}
            onEdit={(sub) => {
              setEditingSub(sub);
              setIsSubModalOpen(true);
            }}
            onDelete={handleDeleteSub}
            onRefreshParent={triggerRefresh}
          />
        )}

        {/* AI 智能快速记账弹窗 (语音/自然语言/小票OCR) */}
        {isAiRecordOpen && (
          <AiRecordModal
            isOpen={isAiRecordOpen}
            onClose={() => setIsAiRecordOpen(false)}
            onSuccess={triggerRefresh}
            accounts={accounts}
            categories={categories}
          />
        )}

        {/* 将已有开销转为持物大件弹窗 */}
        {Boolean(convertingTx) && (
          <ConvertToItemModal
            isOpen={Boolean(convertingTx)}
            transaction={convertingTx}
            onClose={() => setConvertingTx(null)}
            onSuccess={triggerRefresh}
          />
        )}

        {/* 微信 / 支付宝账单批量导入弹窗 */}
        {isImportModalOpen && (
          <BillImportModal
            isOpen={isImportModalOpen}
            accounts={accounts}
            categories={categories}
            onClose={() => setIsImportModalOpen(false)}
            onSuccess={triggerRefresh}
          />
        )}

        {/* 账户弹窗 (新增 / 编辑) */}
        {isAccountModalOpen && (
          <AccountModal
            isOpen={isAccountModalOpen}
            onClose={() => {
              setIsAccountModalOpen(false);
              setEditingAccount(null);
            }}
            onSuccess={triggerRefresh}
            account={editingAccount}
          />
        )}

        {/* 大件物品弹窗 (新增 / 编辑) */}
        {isItemModalOpen && (
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
        )}

        {/* 首次进入功能的详细提示弹窗 */}
        {Boolean(activeFeatureTipKey) && (
          <FeatureTipModal
            tip={activeFeatureTipKey ? FEATURE_TIPS[activeFeatureTipKey] : null}
            onDismissOnce={() => {
              if (!activeFeatureTipKey) return;
              setGuidePrefs(markFeatureTipDismissed(user?.id, activeFeatureTipKey));
              setActiveFeatureTipKey(null);
            }}
            onDisableForever={() => {
              setGuidePrefs(setDisableAllFeatureTips(user?.id, true));
              setActiveFeatureTipKey(null);
            }}
            onOpenFullGuide={(sectionId) => {
              if (activeFeatureTipKey) {
                setGuidePrefs(markFeatureTipDismissed(user?.id, activeFeatureTipKey));
              }
              setActiveFeatureTipKey(null);
              openGuideModal(sectionId);
            }}
          />
        )}

        {/* 完整使用说明书 */}
        {isGuideOpen && userGuideModalNode}

        {/* 手机扫码或一键跳转快捷指令极速配对弹窗 */}
        {Boolean(mobilePairToken) && (
          <MobileShortcutPairModal
            isOpen={Boolean(mobilePairToken)}
            token={mobilePairToken || ''}
            onClose={() => {
              setMobilePairToken(null);
              if (typeof window !== 'undefined' && window.history?.replaceState) {
                const cleanUrl = window.location.pathname;
                window.history.replaceState({}, '', cleanUrl);
              }
            }}
          />
        )}
      </Suspense>
      </ErrorBoundary>
    </div>
  );
}
export default App;
