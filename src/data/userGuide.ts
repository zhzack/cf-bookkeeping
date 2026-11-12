/**
 * 应用内使用说明与首次功能介绍提醒（单一数据源）
 *
 * 【维护约定】
 * 每次新增功能或调整现有交互、计算口径、表单选项时，请同步更新本文件中的
 * `GUIDE_SECTIONS` 与 `FEATURE_TIPS`，并按需更新 `GUIDE_VERSION`。
 */

export const GUIDE_VERSION = '2026.11.2';

export type GuideSectionId =
  | 'periodic-bills'
  | 'daily-cost'
  | 'quick-record'
  | 'items-wishlist'
  | 'accounts-stats-backup';

export type FeatureTipKey =
  | 'transactions'
  | 'tx_modal'
  | 'items'
  | 'stats'
  | 'accounts';

export interface GuideStep {
  title: string;
  detail: string;
}

export interface GuideExample {
  scene: string;
  action: string;
  result: string;
}

export interface GuideSection {
  id: GuideSectionId;
  badge: string;
  title: string;
  subtitle: string;
  summary: string;
  highlights: string[];
  steps?: GuideStep[];
  examples?: GuideExample[];
  notes?: string[];
}

export interface FeatureTip {
  key: FeatureTipKey;
  sectionId: GuideSectionId;
  badge: string;
  title: string;
  subtitle: string;
  points: Array<{
    heading: string;
    description: string;
  }>;
  proTip?: string;
}

export interface GuidePreferences {
  disableAllTips: boolean;
  dismissedFeatures: Partial<Record<FeatureTipKey, boolean>>;
}

const PREFS_STORAGE_PREFIX = 'cf_bk_guide_prefs_';

function getStorageKey(userId?: string | null): string {
  return `${PREFS_STORAGE_PREFIX}${userId || 'default'}`;
}

export function loadGuidePrefs(userId?: string | null): GuidePreferences {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return { disableAllTips: false, dismissedFeatures: {} };
    }
    const parsed = JSON.parse(raw);
    return {
      disableAllTips: Boolean(parsed?.disableAllTips),
      dismissedFeatures:
        parsed?.dismissedFeatures && typeof parsed.dismissedFeatures === 'object'
          ? parsed.dismissedFeatures
          : {},
    };
  } catch {
    return { disableAllTips: false, dismissedFeatures: {} };
  }
}

export function saveGuidePrefs(userId: string | null | undefined, prefs: GuidePreferences): GuidePreferences {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(prefs));
  } catch {
    // 忽略无痕模式或存储配额异常
  }
  return prefs;
}

export function markFeatureTipDismissed(userId: string | null | undefined, key: FeatureTipKey): GuidePreferences {
  const current = loadGuidePrefs(userId);
  return saveGuidePrefs(userId, {
    ...current,
    dismissedFeatures: {
      ...current.dismissedFeatures,
      [key]: true,
    },
  });
}

export function setDisableAllFeatureTips(userId: string | null | undefined, disableAll: boolean): GuidePreferences {
  const current = loadGuidePrefs(userId);
  return saveGuidePrefs(userId, {
    ...current,
    disableAllTips: disableAll,
  });
}

export function resetAllFeatureTips(userId: string | null | undefined): GuidePreferences {
  return saveGuidePrefs(userId, {
    disableAllTips: false,
    dismissedFeatures: {},
  });
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'periodic-bills',
    badge: '高频疑问',
    title: '定期支付 / 周期账单怎么记？',
    subtitle: '房租、宽带、水电、会员订阅、保险等按月/季/年支付的开销指南',
    summary:
      '系统采用「实付记账 + 按天摊销」双轨机制：付款日一次性如实扣减账户余额，同时在「每日生活成本」里将这笔钱按覆盖天数平摊到每一天，避免交房租/续年费当天把日均生活成本拉爆。',
    highlights: [
      '扣款当天的账户余额、当月总支出保持 100% 真实，不会漏掉资金流出。',
      '每日生活成本会把周期账单拆分为「金额 ÷ 覆盖天数」，跨月时自动按重叠天数分配到各月。',
      '目前暂未开启服务端定时自动扣款：请在每次实际扣款后记一笔（或通过 iOS 快捷指令调用 API 自动入账）。',
    ],
    steps: [
      {
        title: '第 1 步：打开「记一笔」并选择「支出」',
        detail: '输入你本次实际支付的总金额（例如交一季度房租 9000 元，或续费一年宽带 1200 元），选好付款账户与分类。',
      },
      {
        title: '第 2 步：选择对应的分摊周期',
        detail:
          '在「每日生活成本口径 / 大件归类」中，按账单实际覆盖的时长选择：「按月(30天)」、「按季(90天)」、「按年(365天)」或「自定义天数」（如 60 天电费、366 天闰年、7 天周卡）。系统会实时帮你算出每天约多少钱。',
      },
      {
        title: '第 3 步：确认或调整「分摊起始日」',
        detail:
          '默认从记账当天开始分摊。如果你在 11 月 28 日提前支付 12 月房租，把「分摊起始日」改为 12-01，这样这笔房租就不会错误算进 11 月的生活成本。',
      },
      {
        title: '第 4 步：在首页查看正在生效的周期账单',
        detail:
          '保存后，回到明细首页的「每日生活成本」卡片，展开「本期正在摊销的固定开销」，就能看到每笔周期账单的每日成本、起止区间、本月计入金额和剩余天数。',
      },
    ],
    examples: [
      {
        scene: '每月固定支付房租 ¥3000（当月生效）',
        action: '记一笔支出 ¥3000 -> 选「按月(30天)」-> 分摊起始日设为当月 1 日。',
        result: '账户立即扣减 ¥3000；每日生活成本中「固定摊销」每日计入 ¥100/天，月底结束。',
      },
      {
        scene: '年底续费宽带 / 会员年卡 ¥365（跨越整年）',
        action: '记一笔支出 ¥365 -> 选「按年(365天)」-> 分摊起始日选生效首日。',
        result: '从生效日起连续 365 天，每天仅计入 ¥1.00/天 到对应月份的生活成本。',
      },
      {
        scene: '还房贷本金、转给家人、基金买入等非日常消耗支出',
        action: '记一笔支出 -> 在口径区选择「不计入日均」。',
        result: '账户余额正常减少，但完全不计入「每日生活成本」，避免统计失真。',
      },
    ],
    notes: [
      '如果是实体耐用消费品（如手机、电脑、家具家电），建议不要用天数分摊，而是直接选「📦 标记为大件」，由系统按实际服役天数动态摊薄。',
      '如果你习惯全自动扣款记账，可结合手机端「iOS 快捷指令 / 自动化」在固定扣款日调用 POST /api/transactions，并传入 amortize_days 和 amortize_start_date 字段。',
    ],
  },
  {
    id: 'daily-cost',
    badge: '核心指标',
    title: '每日生活成本怎么算？',
    subtitle: '把日常吃喝、周期固定账单、耐用品折旧融合成「每天真实花销」',
    summary:
      '每日生活成本展示在「明细」首页顶部及「统计」页，让你一眼看清自己维持当前生活水平平均每天需要多少钱，并与上个月环比对比。',
    highlights: [
      '总每日生活成本 = 固定开销日均摊销 + 日常流水日均 + 持物大件日耗总和。',
      '当前月份按「本月 1 号 ~ 今天」已过天数计算；历史月份按「整月天数」计算。',
      '已标记为「不计入日均」或「已关联持物大件」的流水会自动跳过日常计算，绝不重复算两遍。',
    ],
    steps: [
      {
        title: '① 固定开销摊销（琥珀色）',
        detail: '汇总所有「分摊周期与本月有重合天数」的固定账单：按各账单在统计区间内的重叠天数计算出本月合计分摊额，再除以本月统计天数（已过天数）。',
      },
      {
        title: '② 日常流水消费（玫瑰红）',
        detail: '统计本月统计区间内所有未设分摊、未勾选「不计入日均」、未关联大件的普通支出总额 ÷ 本月统计天数。',
      },
      {
        title: '③ 在役大件日耗（靛蓝色）',
        detail: '汇总截至统计月末处于「在用」状态的大件每日成本：单件日耗 = (购入原价 + 配件维修费 - 二手回血) ÷ 已服役天数。',
      },
    ],
    notes: [
      '心愿单中的物品与「已闲置」状态的大件不计入每日生活成本；已卖出或损坏停用的大件仅在停用前的月份参与统计。',
      '点击「每日生活成本」卡片上的环比标签旁展开按钮，可查看当前正在摊销中的固定账单明细清单。',
    ],
  },
  {
    id: 'quick-record',
    badge: '日常记账',
    title: '记一笔、转账与账单照片',
    subtitle: '3 秒记录支出/收入/账户互转，并支持上传最多 3 张小票照片',
    summary:
      '支持随时记录日常收支与内部转账，自动维护各账户动态余额，所有收支记录均可附加压缩后的实拍小票或订单截图。',
    highlights: [
      '支出会减少付款账户余额；收入会增加收款账户余额；「转账」仅在两个账户间划拨资金，不影响总支出与每日生活成本。',
      '支持最多 3 张账单照片，浏览器自动压缩图片后再加密存入 Cloudflare D1，兼容免费额度无需额外图床。',
      '点击任意一条历史流水可打开编辑弹窗，随时修改金额、分摊周期、补充或删除照片。',
    ],
    steps: [
      {
        title: '添加账单照片',
        detail: '在记一笔或编辑流水弹窗底部点击「添加照片」，可选拍发票、外卖订单、超市小票。压缩完成后会在下方显示预览缩略图。',
      },
      {
        title: '查看照片大图',
        detail: '在流水列表中，带照片的记录右侧会显示缩略图与数量角标（如 +2），点击缩略图即可全屏滑动预览原图。',
      },
    ],
  },
  {
    id: 'items-wishlist',
    badge: '资产与防剁手',
    title: '持物大件、流水转大件与心愿单',
    subtitle: '追踪大件回本进度、质保到期与 7 天防冲动消费冷静期',
    summary:
      '把手机、电脑、相机、家电、人体工学椅等高价耐用物品纳入大件档案，自动计算「每日持有成本」与预期回本进度；买前还可先放进心愿单冷静几天。',
    highlights: [
      '方式一（大件页录入）：在「大件」页点「记大件」，可顺便勾选「同步记一笔消费账单」自动扣除账户余额。',
      '方式二（记一笔直转）：记录一笔新支出时，直接选中「📦 标记为大件」，展开补充寿命、质保、存放位置等信息，照片也会自动同步给大件！',
      '方式三（已有支出转大件）：在「明细」列表点某笔支出右侧的「设为大件」，或在编辑弹窗里点「将该笔消费设为持物大件」，可复制原有账单照片并补充新照片。',
    ],
    steps: [
      {
        title: '追加配件与维修费',
        detail: '大件卡片底部可随时点「追加配件/维修」（如给手机换电池、买保护壳），配件费用会自动并入该大件总持有成本并重新算日耗。',
      },
      {
        title: '状态流转与回血',
        detail: '支持在用、标闲置（暂停计入首页日耗）、标损坏淘汰、标卖出（录入二手回血价后自动扣减总持有成本）。',
      },
      {
        title: '心愿冷静期',
        detail: '种草昂贵物品时先点「加心愿单」设定 7 天冷静期；冷静期倒计时结束仍想要，点「已深思熟虑 · 确认买入」即可一键转为在用大件并记账。',
      },
    ],
    notes: [
      '通过记账转换或标记的大件，关联流水会自动标记「不计入日均」且展示「📦 大件·名称」徽章，避免和首页的大件日耗重复计算。',
      '每件大件（含心愿单）也支持最多上传 3 张实物照片或种草图，在卡片右上角即可点开大图预览。',
    ],
  },
  {
    id: 'accounts-stats-backup',
    badge: '管理与安全',
    title: '账户资产、财务统计与数据备份',
    subtitle: '多账户余额实时核算、月度收支分析与 JSON 一键导出',
    summary:
      '在「账户」页维护微信、支付宝、银行卡及信用卡等负债账户；在「统计」页按月查看资产结构、分类排行和消费趋势；在「设置」页可随时修改密码与全量导出备份。',
    highlights: [
      '每个账户的「当前余额 = 初始余额 + 收入 - 支出 + 转入 - 转出」，无需人工手动平账。',
      '支持在「设置 -> 数据备份与导出」一键下载全部账户、分类和流水的 JSON 备份文件。',
      '所有核心数据均保存在你自己的 Cloudflare D1 数据库中，可随时在本使用说明或设置页调整引导提示开关。',
    ],
  },
];

export const FEATURE_TIPS: Record<FeatureTipKey, FeatureTip> = {
  transactions: {
    key: 'transactions',
    sectionId: 'periodic-bills',
    badge: '明细首页提示',
    title: '欢迎来到「流水明细 & 每日生活成本」',
    subtitle: '这里集中展示你的日常账单与每日真实生活成本',
    points: [
      {
        heading: '🔄 定期账单 / 房租会员怎么记？',
        description:
          '点「记一笔 -> 支出」时，在下方口径区选择「按月(30天) / 按季(90天) / 按年(365天) / 自定义天数」并设置起始日即可平滑分摊到每一天。',
      },
      {
        heading: '🔥 顶部「每日生活成本」卡片',
        description:
          '自动汇总「固定分摊 + 日常吃喝 + 在用大件日耗」并与上月环比。可点击展开查看正在摊销中的定期账单详情。',
      },
      {
        heading: '📦 已有消费补设为大件 & 查看照片',
        description:
          '支出条目右侧可一键点「设为大件」转为耐用资产；带照片的账单点右侧缩略图即可放大看小票原图。',
      },
    ],
    proTip: '你随时可以点击页面右上角（手机端顶部）的「使用说明」按钮或前往「设置」查看完整教程。',
  },
  tx_modal: {
    key: 'tx_modal',
    sectionId: 'periodic-bills',
    badge: '记一笔功能向导',
    title: '「记一笔」中支持周期摊销、大件建档与拍照存证',
    subtitle: '根据支出性质选择下方对应的「每日生活成本口径 / 大件归类」',
    points: [
      {
        heading: '按周期分摊（定期账单必用）',
        description:
          '交房租、宽带年费、话费、会员订阅时，选择「按月(30天) / 按季(90天) / 按年(365天) / 自定义天数」，账户按付款日全额扣款，日均成本自动按天拆开。',
      },
      {
        heading: '📦 标记为大件（买手机/家电必用）',
        description:
          '购买高价耐用品时直接点「📦 标记为大件」，可立即补充预期寿命、质保日期、存放位置，系统会同时入账、建大件档案并同步照片。',
      },
      {
        heading: '📷 上传小票 / 订单截图',
        description:
          '底部最多支持上传 3 张照片，自动压缩后保存到云端，方便日后对账或查保修凭证。',
      },
    ],
    proTip: '如果月底提前交下个月房租，记得把展开项里的「分摊起始日」改成下月 1 号哦！',
  },
  items: {
    key: 'items',
    sectionId: 'items-wishlist',
    badge: '大件与心愿单向导',
    title: '大件资产日均与 7 天防冲动心愿单',
    subtitle: '算清每一件心爱之物每天真实只花了多少钱',
    points: [
      {
        heading: '📷 为大件添加照片',
        description:
          '新增或点击编辑任意大件/心愿单卡片时，可上传最多 3 张实物图或种草图，卡片右上角点缩略图即可看大图。',
      },
      {
        heading: '🔧 配件维修 & 二手回血',
        description:
          '可在卡片底部追加贴膜/维修费，或标为「闲置 / 损坏 / 卖出」，系统会精确重算最终单日持有成本。',
      },
      {
        heading: '❄️ 冷静期心愿单',
        description:
          '拿不准要不要买的东西先记入「冷静期心愿单」，倒计时结束后仍心动再点「确认买入」并同步记账。',
      },
    ],
  },
  stats: {
    key: 'stats',
    sectionId: 'daily-cost',
    badge: '财务统计向导',
    title: '月度财务概览、生活成本拆解与分类趋势',
    subtitle: '从现金流与日均消耗两个维度看懂你的收支结构',
    points: [
      {
        heading: '📅 支持按月切换回溯',
        description: '可切换到任意历史月份查看当月净资产快照、结余率、每日趋势图和分类消费排行。',
      },
      {
        heading: '⚖️ 固定摊销与日常消费对比',
        description: '在这里可以直观看到每个月房租订阅等固定摊销、日常零花与持物大件各自占每日花销的比例。',
      },
    ],
  },
  accounts: {
    key: 'accounts',
    sectionId: 'accounts-stats-backup',
    badge: '账户管理向导',
    title: '多账户余额自动核算与资产负债管理',
    subtitle: '设置初始余额后，每笔收入、支出与转账都会实时更新各账户余额',
    points: [
      {
        heading: '💳 支持现金/储蓄/电子钱包/信用卡/投资账户',
        description: '点击左上/右上新建账户即可添加常用钱包，支持自定义图标与主题色。',
      },
      {
        heading: '🔄 账户间互相还款或提现请记「转账」',
        description: '例如从微信提现到银行卡、用储蓄卡还信用卡，在「记一笔」顶部切换为「转账」，双方余额同步变更但不计为个人消费。',
      },
    ],
  },
};
