import type { QuestionType, TopicId, XpIneligibleReason, XpSourceType } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { kstWeekStart, toKstDay } from './time/kst.js';
import type { EpochMs, KstDay } from './types.js';

/** One answered question that may earn XP. */
export interface XpItemInput {
  questionId: string;
  difficulty: number;
  questionType: QuestionType;
  correct: boolean;
  /**
   * chosung only (D6-2): solo = hint button not pressed; battle = solved before the chosung reveal
   * (always true with '힌트 없음'). Ignored for mcq/ox.
   */
  noHint: boolean;
  /** The question's topic is one of the owner's weak topics (30-day top 2) at grant time. */
  weakTopic: boolean;
  /** This correct answer completes a wrong-note review (D6-8: only that one answer). */
  reviewCompleted: boolean;
  /**
   * Earlier SolveLogs of the same question by the same owner (any mode, any outcome) with
   * answeredAt in (answeredAt − 7 days, answeredAt). 0 → ×1, 1 → ×0.5, ≥ 2 → ×0.
   */
  priorSolvesInWindow: number;
}

/** Set-level facts that decide whether, and how, a grant happens. */
export type XpGrantContext =
  /** XP only on the first clear; failed, replayed or placement-skipped stages give 0 (AC-G2). */
  | { kind: 'stage'; cleared: boolean; alreadyCleared: boolean }
  /** XP only with ≥ 7/10 (AC-G3). No frequency limit. */
  | { kind: 'composite'; correctCount: number; totalCount: number }
  /** 오늘의 3분 지식: ≥ 7/10 and at most once per KST day. */
  | { kind: 'daily'; correctCount: number; totalCount: number; alreadyGrantedToday: boolean }
  /** 약점 퀘스트: flat +50 XP with ≥ 7/10, at most once per KST week (AC-D5). */
  | { kind: 'quest'; correctCount: number; totalCount: number; alreadyGrantedThisWeek: boolean }
  /** Level test / basic test / diagnostic: never XP. */
  | { kind: 'placement' }
  | { kind: 'basic_test' }
  | { kind: 'diagnostic' }
  /** Battle: correct-answer XP + rank bonus (1st +15, 2nd +10, 3rd +5), then ×0.5 if rematch (D6-4). */
  | { kind: 'battle'; rank: number; rematch: boolean };

export interface XpGrantInput {
  context: XpGrantContext;
  items: readonly XpItemInput[];
  /** XP already granted to this owner on the grant's KST day, before this grant. */
  grantedTodayBefore: number;
}

export interface XpItemBreakdown {
  questionId: string;
  /** difficulty × 10, 0 when wrong. */
  base: number;
  /** 1 + 0.2 (noHint, chosung) + max(0.5 weak, 0.5 review) — additive, no stacking of the last two. */
  multiplier: number;
  decayFactor: number;
  /** floor(base × multiplier × decayFactor). */
  xp: number;
}

export interface XpGrantResult {
  eligible: boolean;
  ineligibleReason?: XpIneligibleReason;
  items: XpItemBreakdown[];
  /** Σ item XP (0 for quest, which is flat). */
  itemsTotal: number;
  /** Quest flat XP; 0 otherwise. */
  flatXp: number;
  rankBonus: number;
  /** 0.5 for a rematch battle, else 1. */
  rematchFactor: number;
  /** floor((itemsTotal + flatXp + rankBonus) × rematchFactor). */
  preCapTotal: number;
  /** min(preCapTotal, max(0, dailyCap − grantedTodayBefore)). */
  granted: number;
  /** preCapTotal − granted. */
  cappedAmount: number;
  /** True when the daily cap cut this grant or was already reached ('오늘 XP 상한 도달'). */
  capReached: boolean;
  configVersion: string;
}

/**
 * Account XP for one finished set or battle (spec 성장 시스템, AC-G1~G4, D6-2, D6-4).
 * Order: per item (difficulty × 10) × additive bonus × same-question decay → floor → sum
 * → (+ quest flat XP | + battle rank bonus) → × rematch factor → clip to the remaining daily cap (3000).
 * Ineligible contexts return granted = 0 with a reason; clears/level-ups are decided elsewhere and
 * are never blocked by the cap.
 */
export function computeXpGrant(input: XpGrantInput, cfg: GrowthConfig = DEFAULT_CONFIG): XpGrantResult {
  const x = cfg.xp;
  const ctx = input.context;
  const ineligible = ineligibleReason(ctx, cfg);
  const empty = { items: [] as XpItemBreakdown[], itemsTotal: 0, flatXp: 0, rankBonus: 0, rematchFactor: 1 };
  if (ineligible) {
    return { eligible: false, ineligibleReason: ineligible, ...empty, preCapTotal: 0, granted: 0, cappedAmount: 0, capReached: false, configVersion: cfg.configVersion };
  }
  const items = ctx.kind === 'quest' ? [] : input.items.map((it) => itemXp(it, cfg));
  const itemsTotal = items.reduce((a, it) => a + it.xp, 0);
  const flatXp = ctx.kind === 'quest' ? cfg.quest.xp : 0;
  const rankBonus = ctx.kind === 'battle' ? (x.rankBonus[ctx.rank - 1] ?? 0) : 0;
  const rematchFactor = ctx.kind === 'battle' && ctx.rematch ? x.rematch.factor : 1;
  const preCapTotal = floor((itemsTotal + flatXp + rankBonus) * rematchFactor);
  const remaining = Math.max(0, x.dailyCap - input.grantedTodayBefore);
  const granted = Math.min(preCapTotal, remaining);
  return {
    eligible: true,
    items,
    itemsTotal,
    flatXp,
    rankBonus,
    rematchFactor,
    preCapTotal,
    granted,
    cappedAmount: preCapTotal - granted,
    capReached: granted < preCapTotal || remaining === 0,
    configVersion: cfg.configVersion,
  };
}

/** Floor that tolerates binary float error (e.g. 1.7 × 30 = 50.99999…). */
function floor(v: number): number {
  return Math.floor(v + 1e-9);
}

function passed(correctCount: number, passCorrect: number): boolean {
  return correctCount >= passCorrect;
}

function ineligibleReason(ctx: XpGrantContext, cfg: GrowthConfig): XpIneligibleReason | undefined {
  switch (ctx.kind) {
    case 'stage':
      if (!ctx.cleared) return 'STAGE_FAILED';
      return ctx.alreadyCleared ? 'NOT_FIRST_CLEAR' : undefined;
    case 'composite':
      return passed(ctx.correctCount, cfg.setPass.passCorrect) ? undefined : 'BELOW_PASS';
    case 'daily':
      if (!passed(ctx.correctCount, cfg.setPass.passCorrect)) return 'BELOW_PASS';
      return ctx.alreadyGrantedToday ? 'DAILY_ALREADY_GRANTED' : undefined;
    case 'quest':
      if (!passed(ctx.correctCount, cfg.quest.passCorrect)) return 'BELOW_PASS';
      return ctx.alreadyGrantedThisWeek ? 'QUEST_ALREADY_GRANTED' : undefined;
    case 'battle':
      return undefined;
    default:
      return 'NO_XP_MODE';
  }
}

function itemXp(it: XpItemInput, cfg: GrowthConfig): XpItemBreakdown {
  const x = cfg.xp;
  const base = it.correct ? it.difficulty * x.perDifficulty : 0;
  const noHint = it.questionType === 'chosung' && it.noHint ? x.noHintBonus : 0;
  const weak = it.weakTopic ? x.weakTopicBonus : 0;
  const review = it.reviewCompleted ? x.reviewBonus : 0;
  const multiplier = 1 + noHint + (x.stackWeakTopicAndReview ? weak + review : Math.max(weak, review));
  const factors = x.sameQuestionDecay.factors;
  const decayFactor = factors[Math.min(Math.max(0, it.priorSolvesInWindow), factors.length - 1)] ?? 0;
  return { questionId: it.questionId, base, multiplier, decayFactor, xp: floor(base * multiplier * decayFactor) };
}

/** Guest-owned set or battle to be re-judged against the combined history at merge time. */
export interface MergeSource {
  source: { type: XpSourceType; id: string };
  /** Completion time (decides KST day and chronological order). */
  completedAt: EpochMs;
  set:
    | { kind: 'stage'; topicId: TopicId; level: number; cleared: boolean }
    | { kind: 'composite'; correctCount: number; totalCount: number }
    | { kind: 'daily'; correctCount: number; totalCount: number }
    | { kind: 'quest'; correctCount: number; totalCount: number }
    | { kind: 'battle'; rank: number; rematch: boolean };
  /** Items without decay counts; decay is recomputed from the combined solve history. */
  items: ReadonlyArray<Omit<XpItemInput, 'priorSolvesInWindow'> & { answeredAt: EpochMs }>;
}

export interface MergeGrantInput {
  account: {
    /** The account's own SolveLogs (questionId + time) for the decay window. */
    solves: ReadonlyArray<{ questionId: string; answeredAt: EpochMs }>;
    /** Stages already cleared by the account, including placement-skipped ones. */
    clearedStages: ReadonlyArray<{ topicId: TopicId; level: number }>;
    /** KST days on which the account already got daily-set XP. */
    dailyGrantedDays: readonly KstDay[];
    /** KST week starts (Mondays) on which the account already got quest XP. */
    questGrantedWeeks: readonly KstDay[];
    /** XP already granted to the account per KST day (frozen; never reduced). */
    grantedXpByDay: Readonly<Record<KstDay, number>>;
  };
  /** Guest sources in any order; processed chronologically together with account history. */
  guestSources: readonly MergeSource[];
}

export interface MergeGrantLine {
  source: { type: XpSourceType; id: string };
  kstDay: KstDay;
  result: XpGrantResult;
}

export interface MergeGrantResult {
  lines: MergeGrantLine[];
  totalGranted: number;
}

/**
 * XP for the guest portion when a guest is merged into an account (D6-3, AC-A2).
 * Account XP already granted is frozen. Each guest source is re-judged in time order against the
 * combined history: same-question decay over combined solves, set limits (first clear per stage,
 * daily once per KST day, quest once per KST week) counting the account's grants and earlier guest
 * lines, and the per-day remaining cap (dailyCap − account XP that day − earlier guest lines that day).
 * Only guest lines are reduced; nothing is revoked.
 */
export function computeMergeGrant(input: MergeGrantInput, cfg: GrowthConfig = DEFAULT_CONFIG): MergeGrantResult {
  const { account } = input;
  const windowMs = cfg.xp.sameQuestionDecay.windowMs;
  const solveTimes = new Map<string, number[]>();
  const addSolve = (questionId: string, at: EpochMs) => {
    const list = solveTimes.get(questionId);
    if (list) list.push(at);
    else solveTimes.set(questionId, [at]);
  };
  for (const s of account.solves) addSolve(s.questionId, s.answeredAt);
  for (const src of input.guestSources) for (const it of src.items) addSolve(it.questionId, it.answeredAt);

  const highestCleared = new Map<TopicId, number>();
  for (const c of account.clearedStages) highestCleared.set(c.topicId, Math.max(highestCleared.get(c.topicId) ?? 0, c.level));
  const dailyDays = new Set(account.dailyGrantedDays);
  const questWeeks = new Set(account.questGrantedWeeks);
  const grantedByDay = new Map<KstDay, number>(Object.entries(account.grantedXpByDay));

  const ordered = [...input.guestSources].sort(
    (a, b) => a.completedAt - b.completedAt || cmp(a.source.type, b.source.type) || cmp(a.source.id, b.source.id),
  );
  const lines: MergeGrantLine[] = [];
  for (const src of ordered) {
    const kstDay = toKstDay(src.completedAt);
    const week = kstWeekStart(kstDay);
    const set = src.set;
    let context: XpGrantContext;
    switch (set.kind) {
      case 'stage':
        context = { kind: 'stage', cleared: set.cleared, alreadyCleared: set.level <= (highestCleared.get(set.topicId) ?? 0) };
        break;
      case 'daily':
        context = { ...set, alreadyGrantedToday: dailyDays.has(kstDay) };
        break;
      case 'quest':
        context = { ...set, alreadyGrantedThisWeek: questWeeks.has(week) };
        break;
      default:
        context = set;
    }
    const items = src.items.map(({ answeredAt, ...it }) => ({
      ...it,
      priorSolvesInWindow: (solveTimes.get(it.questionId) ?? []).filter((t) => t < answeredAt && t > answeredAt - windowMs).length,
    }));
    const result = computeXpGrant({ context, items, grantedTodayBefore: grantedByDay.get(kstDay) ?? 0 }, cfg);
    if (result.eligible) {
      if (set.kind === 'stage') highestCleared.set(set.topicId, Math.max(highestCleared.get(set.topicId) ?? 0, set.level));
      if (set.kind === 'daily') dailyDays.add(kstDay);
      if (set.kind === 'quest') questWeeks.add(week);
    }
    grantedByDay.set(kstDay, (grantedByDay.get(kstDay) ?? 0) + result.granted);
    lines.push({ source: src.source, kstDay, result });
  }
  return { lines, totalGranted: lines.reduce((a, l) => a + l.result.granted, 0) };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
