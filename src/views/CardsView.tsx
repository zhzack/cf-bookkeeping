import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  Plus,
  Ticket,
  Search,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  PlusCircle,
  Sliders,
  Calendar,
  Layers,
  ChevronRight,
  TrendingDown,
  ArrowUpRight,
} from 'lucide-react';
import { fetchApi, formatCurrency } from '../api';
import { PrepaidCardWithStats, CardsSummary, Account, Category } from '../types';
import { DynamicIcon } from '../components/DynamicIcon';

interface Props {
  accounts: Account[];
  categories: Category[];
  onOpenAddCard: () => void;
  onOpenDetail: (cardId: string) => void;
  onOpenConsume: (card: PrepaidCardWithStats) => void;
  onOpenRecharge: (card: PrepaidCardWithStats) => void;
  refreshTrigger: number;
}

export const CardsView: React.FC<Props> = ({
  accounts,
  categories,
  onOpenAddCard,
  onOpenDetail,
  onOpenConsume,
  onOpenRecharge,
  refreshTrigger,
}) => {
  const [cards, setCards] = useState<PrepaidCardWithStats[]>([]);
  const [summary, setSummary] = useState<CardsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'balance' | 'times' | 'archived'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');

  const loadCards = async () => {
    setLoading(true);
    try {
      const res = await fetchApi<{ cards: PrepaidCardWithStats[]; summary: CardsSummary }>('/api/cards');
      setCards(res.cards || []);
      setSummary(res.summary || null);
    } catch (err) {
      console.error('Failed to load cards:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCards();
  }, [refreshTrigger]);

  // 过滤卡片
  const filteredCards = cards.filter((card) => {
    // 状态与分类过滤
    if (filterType === 'balance') {
      if (card.type !== 'balance' || card.status !== 'active') return false;
    } else if (filterType === 'times') {
      if (card.type !== 'times' || card.status !== 'active') return false;
    } else if (filterType === 'archived') {
      if (card.status === 'active') return false;
    } else {
      // all 默认只看 active
      if (card.status !== 'active') return false;
    }

    // 关键词过滤
    if (searchKeyword.trim()) {
      const kw = searchKeyword.trim().toLowerCase();
      const matchName = card.name.toLowerCase().includes(kw);
      const matchMerchant = card.merchant?.toLowerCase().includes(kw);
      const matchRemark = card.remark?.toLowerCase().includes(kw);
      return matchName || matchMerchant || matchRemark;
    }

    return true;
  });

  // 计算计次卡剩余总次数
  const totalRemainingTimes = cards
    .filter((c) => c.status === 'active' && c.type === 'times')
    .reduce((sum, c) => sum + c.current_value, 0);

  return (
    <div className="space-y-4 pb-24 sm:pb-8">
      {/* 顶部资产概览卡片 */}
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-slate-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute right-[-30px] top-[-30px] opacity-10 pointer-events-none">
          <CreditCard className="w-56 h-56 text-white" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-indigo-200 font-semibold tracking-wide uppercase">
                预付费会员卡包资产
              </span>
            </div>
            <button
              onClick={onOpenAddCard}
              className="px-3.5 py-1.5 bg-indigo-500/80 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-indigo-500/30 backdrop-blur-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>办卡 / 充值</span>
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div>
              <div className="text-xs text-indigo-200/70 font-medium">卡内折算剩余总值</div>
              <div className="text-2xl sm:text-3xl font-black tracking-tight text-white mt-0.5">
                {summary ? formatCurrency(summary.total_remaining_worth) : '¥0.00'}
              </div>
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">累计充值实付总额</div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-100 mt-1">
                {summary ? formatCurrency(summary.total_spent_amount) : '¥0.00'}
              </div>
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">计次卡剩余总次数</div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-indigo-100 mt-1">
                {totalRemainingTimes} 次
              </div>
            </div>

            <div>
              <div className="text-xs text-indigo-200/70 font-medium">在役正常卡片</div>
              <div className="text-xl sm:text-2xl font-bold tracking-tight text-emerald-400 mt-1 flex items-center gap-1.5">
                <span>{summary?.active_cards || 0} 张</span>
                {summary && summary.expiring_count > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-300 font-semibold border border-amber-400/30">
                    {summary.expiring_count} 张将到期
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 搜索与分类 Tab 栏 */}
      <div className="bg-white rounded-3xl p-4 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Tab 过滤 */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'all'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>全部在服役</span>
            <span className="text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.2 rounded-full">
              {summary?.active_cards || 0}
            </span>
          </button>

          <button
            onClick={() => setFilterType('times')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'times'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <Ticket className="w-3.5 h-3.5" />
            <span>计次卡</span>
            <span className="text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.2 rounded-full">
              {summary?.times_cards_count || 0}
            </span>
          </button>

          <button
            onClick={() => setFilterType('balance')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'balance'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>储值卡</span>
            <span className="text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.2 rounded-full">
              {summary?.balance_cards_count || 0}
            </span>
          </button>

          <button
            onClick={() => setFilterType('archived')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
              filterType === 'archived'
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span>已用尽/归档</span>
            <span className="text-[10px] bg-slate-200/60 text-slate-600 px-1.5 py-0.2 rounded-full">
              {(summary?.total_cards || 0) - (summary?.active_cards || 0)}
            </span>
          </button>
        </div>

        {/* 搜索框 */}
        <div className="relative min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            placeholder="搜索卡片、商家、备注..."
            className="w-full pl-9 pr-3.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
          />
        </div>
      </div>

      {/* 卡片列表 */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 text-xs">正在加载卡包...</div>
      ) : filteredCards.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-3">
          <div className="w-14 h-14 rounded-3xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
            <CreditCard className="w-7 h-7" />
          </div>
          <div className="text-sm font-bold text-slate-800">
            {searchKeyword ? '未找到符合条件的会员卡' : '暂无充值卡记录'}
          </div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            生活中的理发储值、健身房私教次卡、洗车卡或咖啡星礼卡，都可以在这里统筹管理并快捷核销打卡。
          </p>
          <div className="pt-2">
            <button
              onClick={onOpenAddCard}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/20 inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>立即录入第一张会员卡</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCards.map((card) => {
            const isTimes = card.type === 'times';
            const isExpired = card.expiration_status === 'expired';
            const isExpiring = card.expiration_status === 'expiring';
            const isExhausted = card.status === 'exhausted';

            return (
              <div
                key={card.id}
                className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition group flex flex-col justify-between relative overflow-hidden"
              >
                {/* 顶部彩色装饰条 */}
                <div
                  className="absolute top-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: card.color || '#6366f1' }}
                />

                <div>
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shadow-sm flex-shrink-0"
                        style={{ backgroundColor: card.color || '#6366f1' }}
                      >
                        <DynamicIcon name={card.icon || 'credit-card'} className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                          <span>{card.name}</span>
                          {isExhausted && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                              已用尽
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                          {card.merchant && <span>{card.merchant}</span>}
                          <span>• {isTimes ? '计次卡' : '储值卡'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Expiration badge */}
                    {isExpired ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-100 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        已过期
                      </span>
                    ) : isExpiring ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1 animate-pulse">
                        <AlertTriangle className="w-3 h-3" />
                        剩 {card.days_left} 天过期
                      </span>
                    ) : card.valid_until ? (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-100">
                        至 {card.valid_until}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-100">
                        长期有效
                      </span>
                    )}
                  </div>

                  {/* Card Metric Spotlight */}
                  <div className="bg-slate-50/80 rounded-2xl p-3.5 my-3 flex items-center justify-between border border-slate-100/80">
                    <div>
                      <div className="text-[11px] text-slate-400 font-medium">卡内当前剩余</div>
                      <div className="text-xl font-black text-slate-800 mt-0.5 tracking-tight flex items-baseline gap-1">
                        <span>
                          {isTimes ? card.current_value : formatCurrency(card.current_value)}
                        </span>
                        {isTimes && <span className="text-xs font-bold text-slate-500">次</span>}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[11px] text-slate-400 font-medium">
                        {isTimes ? '单次折算成本' : '剩余折算残值'}
                      </div>
                      <div className="text-sm font-bold text-indigo-600 mt-0.5">
                        {isTimes
                          ? `${formatCurrency(card.per_unit_cost)}/次`
                          : formatCurrency(card.remaining_worth)}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>使用进度</span>
                      <span className="font-semibold text-slate-600">
                        {isTimes
                          ? `已用 ${card.consumed_value} / 总 ${card.total_value} 次 (${card.usage_percent}%)`
                          : `已用 ${formatCurrency(card.consumed_value)} / 总额度 ${formatCurrency(card.total_value)} (${card.usage_percent}%)`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${card.usage_percent}%`,
                          backgroundColor: card.color || '#6366f1',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onOpenDetail(card.id)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition flex items-center gap-1"
                    >
                      <span>明细轨迹</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                    <button
                      onClick={() => onOpenRecharge(card)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>续充</span>
                    </button>
                  </div>

                  <button
                    disabled={card.current_value <= 0}
                    onClick={() => onOpenConsume(card)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-sm shadow-indigo-600/20 disabled:opacity-40 disabled:pointer-events-none flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isTimes ? '打卡 -1 次' : '核销消费'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
