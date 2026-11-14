import React, { useState, useEffect } from 'react';
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
import { SetupWizard } from './components/SetupWizard';
import { LoginPage } from './components/LoginPage';
import { TransactionModal } from './components/TransactionModal';
import { ConvertToItemModal } from './components/ConvertToItemModal';
import { ConvertToCardModal } from './components/ConvertToCardModal';
import { CardModal } from './components/CardModal';
import { CardConsumeModal } from './components/CardConsumeModal';
import { CardRechargeModal } from './components/CardRechargeModal';
import { CardAdjustModal } from './components/CardAdjustModal';
import { CardDetailModal } from './components/CardDetailModal';
import { SubscriptionModal } from './components/SubscriptionModal';
import { SubscriptionDetailModal } from './components/SubscriptionDetailModal';
import { BillImportModal } from './components/BillImportModal';
import { AccountModal } from './components/AccountModal';
import { ItemModal } from './components/ItemModal';
import { UserGuideModal } from './components/UserGuideModal';
import { FeatureTipModal } from './components/FeatureTipModal';
import { MobileShortcutPairModal } from './components/MobileShortcutPairModal';
import { TransactionsView } from './views/TransactionsView';
import { ItemsView } from './views/ItemsView';
import { CardsView } from './views/CardsView';
import { SubscriptionsView } from './views/SubscriptionsView';
import { StatsView } from './views/StatsView';
import { AccountsView } from './views/AccountsView';
import { SettingsView } from './views/SettingsView';

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

  // 周期订阅相关弹窗状态
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubscriptionWithStats | null>(null);
  const [detailSubId, setDetailSubId] = useState<string | null>(null);

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
      if (params.get('shortcut_pair') === '1' && params.get('token')) {
        setMobilePairToken(params.get('token'));
      }
    }
  }, []);

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
      <>
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
      </>
    );
  }

  // 未登录状态：展示账号密码登录表单
  if (!user) {
    return (
      <>
        <LoginPage
          onSuccess={(u) => {
            setUser(u);
            triggerRefresh();
          }}
          onOpenGuide={() => openGuideModal('periodic-bills')}
        />
        {userGuideModalNode}
      </>
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
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-slate-400">
            {activeTab === 'transactions' ? '流水明细' : activeTab === 'items' ? '大件日均' : activeTab === 'cards' ? '会员卡包' : activeTab === 'subscriptions' ? '周期订阅' : activeTab === 'stats' ? '财务统计' : activeTab === 'accounts' ? '账户管理' : '个人设置'}
          </span>
          <button
            type="button"
            onClick={() => openGuideModal('periodic-bills')}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-600 text-[11px] font-semibold flex items-center gap-1"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>使用说明</span>
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
            onOpenAddSub={() => {
              setEditingSub(null);
              setIsSubModalOpen(true);
            }}
            onOpenDetail={(subId) => {
              setDetailSubId(subId);
            }}
            onEditSub={(sub) => {
              setEditingSub(sub);
              setIsSubModalOpen(true);
            }}
            refreshTrigger={refreshTrigger}
            onRefreshParent={triggerRefresh}
          />
        )}

        {activeTab === 'stats' && (
          <StatsView
            refreshTrigger={refreshTrigger}
            onEditTransaction={(tx) => {
              setEditingTx(tx);
              setIsTxModalOpen(true);
            }}
          />
        )}

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
              setGuidePrefs(setDisableAllFeatureTips(user.id, disabled));
            }}
            onResetFeatureTips={() => {
              setGuidePrefs(resetAllFeatureTips(user.id));
            }}
          />
        )}
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

      {/* 将已有开销转为会员充值卡 / 计次卡弹窗 */}
      <ConvertToCardModal
        isOpen={Boolean(convertingCardTx)}
        transaction={convertingCardTx}
        onClose={() => setConvertingCardTx(null)}
        onSuccess={triggerRefresh}
      />

      {/* 会员充值卡弹窗 (新增 / 编辑) */}
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

      {/* 核销打卡消费弹窗 */}
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

      {/* 续费追加充值弹窗 */}
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

      {/* 手动校准卡内剩余弹窗 */}
      <CardAdjustModal
        isOpen={isCardAdjustOpen}
        onClose={() => {
          setIsCardAdjustOpen(false);
          setAdjustingCard(null);
        }}
        onSuccess={triggerRefresh}
        card={adjustingCard}
      />

      {/* 卡片详情与使用轨迹弹窗 */}
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

      {/* 周期订阅弹窗 (新增 / 编辑) */}
      <SubscriptionModal
        isOpen={isSubModalOpen}
        onClose={() => {
          setIsSubModalOpen(false);
          setEditingSub(null);
        }}
        onSuccess={triggerRefresh}
        subscriptionToEdit={editingSub}
        accounts={accounts}
        categories={categories}
      />

      {/* 订阅详情与历史扣款弹窗 */}
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

      {/* 将已有开销转为持物大件弹窗 */}
      <ConvertToItemModal
        isOpen={Boolean(convertingTx)}
        transaction={convertingTx}
        onClose={() => setConvertingTx(null)}
        onSuccess={triggerRefresh}
      />

      {/* 微信 / 支付宝账单批量导入弹窗 */}
      <BillImportModal
        isOpen={isImportModalOpen}
        accounts={accounts}
        categories={categories}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={triggerRefresh}
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

      {/* 首次进入功能的详细提示弹窗 */}
      <FeatureTipModal
        tip={activeFeatureTipKey ? FEATURE_TIPS[activeFeatureTipKey] : null}
        onDismissOnce={() => {
          if (!activeFeatureTipKey) return;
          setGuidePrefs(markFeatureTipDismissed(user.id, activeFeatureTipKey));
          setActiveFeatureTipKey(null);
        }}
        onDisableForever={() => {
          setGuidePrefs(setDisableAllFeatureTips(user.id, true));
          setActiveFeatureTipKey(null);
        }}
        onOpenFullGuide={(sectionId) => {
          if (activeFeatureTipKey) {
            setGuidePrefs(markFeatureTipDismissed(user.id, activeFeatureTipKey));
          }
          setActiveFeatureTipKey(null);
          openGuideModal(sectionId);
        }}
      />

      {/* 完整使用说明书 */}
      {userGuideModalNode}

      {/* 手机扫码或一键跳转快捷指令极速配对弹窗 */}
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
    </div>
  );
}
export default App;
