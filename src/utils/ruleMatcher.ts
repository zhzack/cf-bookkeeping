export interface AutoRuleLike {
  id: string;
  name: string;
  tx_type: 'all' | 'expense' | 'income';
  keywords: string;
  match_mode: 'contains' | 'exact';
  account_id?: string | null;
  category_id?: string | null;
  scene?: string | null;
  priority: number;
  enabled: number | boolean;
}

export interface RuleMatchResult {
  categoryId: string | null;
  scene: string | null;
  matchedCategoryRule?: AutoRuleLike;
  matchedSceneRule?: AutoRuleLike;
}

/**
 * 将用户输入的多分隔符关键词（逗号、顿号、分号、竖线、换行）拆分为去重后的标准关键词数组
 */
export function parseRuleKeywords(raw: string): string[] {
  if (!raw || typeof raw !== 'string') return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(/[,，、;|；\r\n]+/)) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function normalizeRuleKeywordsString(raw: string): string {
  return parseRuleKeywords(raw).join(', ');
}

export function isRuleEnabled(rule: AutoRuleLike): boolean {
  return rule.enabled === true || rule.enabled === 1;
}

export function ruleMatchesTransaction(
  rule: AutoRuleLike,
  input: { type: 'expense' | 'income'; text: string; accountId?: string | null },
  ignoreEnabledFlag = false
): boolean {
  if (!ignoreEnabledFlag && !isRuleEnabled(rule)) return false;
  if (rule.tx_type !== 'all' && rule.tx_type !== input.type) return false;
  if (rule.account_id && (!input.accountId || rule.account_id !== input.accountId)) return false;

  const normalizedText = (input.text || '').trim().toLowerCase();
  if (!normalizedText) return false;

  const kws = parseRuleKeywords(rule.keywords);
  if (kws.length === 0) return false;

  if (rule.match_mode === 'exact') {
    return kws.some((kw) => normalizedText === kw.toLowerCase());
  }
  return kws.some((kw) => normalizedText.includes(kw.toLowerCase()));
}

/**
 * 按规则优先级从高到低匹配，分别解析命中的最佳分类规则与场景规则
 */
export function matchAutoRules(
  rules: AutoRuleLike[],
  input: { type: 'expense' | 'income'; text: string; accountId?: string | null },
  ignoreEnabledFlag = false
): RuleMatchResult {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { categoryId: null, scene: null };
  }

  const ordered = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));
  let categoryId: string | null = null;
  let scene: string | null = null;
  let matchedCategoryRule: AutoRuleLike | undefined;
  let matchedSceneRule: AutoRuleLike | undefined;

  for (const rule of ordered) {
    if (!ruleMatchesTransaction(rule, input, ignoreEnabledFlag)) continue;

    if (!categoryId && rule.category_id) {
      categoryId = rule.category_id;
      matchedCategoryRule = rule;
    }
    if (!scene && rule.scene && rule.scene.trim()) {
      scene = rule.scene.trim();
      matchedSceneRule = rule;
    }
    if (categoryId && scene) break;
  }

  return {
    categoryId,
    scene,
    matchedCategoryRule,
    matchedSceneRule,
  };
}
