/**
 * Every tunable number in the spec, as defaults (spec: "모든 수치는 설정 파일 기본값").
 * The server may override any subset with `apps/server/config/growth.json` via `resolveConfig`.
 * Any change to an effective value must bump `configVersion`; XpLedger rows store it.
 */

export interface StreakMilestone {
  days: number;
  cheese: number;
}

export interface CalibrationRow {
  /** Lowest correct rate (inclusive) that maps to `difficulty`. Rows sorted by minCorrectRate desc. */
  minCorrectRate: number;
  difficulty: number;
}

export interface GrowthConfig {
  configVersion: string;
  time: {
    /** KST = UTC+9, no DST. Day boundary 00:00 KST. */
    kstOffsetMs: number;
  };
  xp: {
    /** Per-question base XP = difficulty × perDifficulty. */
    perDifficulty: number;
    /** Bonuses are additive on 1.0 (D6-2): 1 + noHint + max(weakTopic, review). */
    noHintBonus: number;
    weakTopicBonus: number;
    reviewBonus: number;
    /** false: weak-topic and review bonuses do not stack (the larger one applies). */
    stackWeakTopicAndReview: boolean;
    /** Same question by the same owner within the window: factor by prior count [1st, 2nd, 3rd+]. */
    sameQuestionDecay: { windowMs: number; factors: readonly number[] };
    /** Final clip per KST day, applied after everything else. */
    dailyCap: number;
    /** Battle rank bonus by rank 1, 2, 3 (added to the battle sum before the rematch factor). */
    rankBonus: readonly number[];
    /** Same member set again within the window → whole battle XP × factor. */
    rematch: { windowMs: number; factor: number };
    /** Per-item XP is floored to an integer after multipliers and decay. */
    rounding: 'floor';
  };
  accountLevel: {
    /** XP needed to go from level L to L+1 = perLevel × L. No max level. */
    perLevel: number;
  };
  weakTopic: {
    /** "취약 주제" = top N topics by wrong rate over the last windowDays (D6-5). */
    windowDays: number;
    count: number;
  };
  stage: {
    size: number;
    clearCorrect: number;
    /** Questions per stage pool: stages = published ÷ poolSize; 10 of the pool are served (10/28). */
    poolSize: number;
    /** Wrong-note review questions mixed into every solo set, at most. */
    reviewMaxPerSet: number;
  };
  placement: {
    startDifficulty: number;
    step: number;
    minDifficulty: number;
    maxDifficulty: number;
    questionCount: number;
    averageOfLast: number;
  };
  basicTest: {
    /** A checkpoint every N stages (5, 10, …); its test draws from the N stages below it. */
    every: number;
    size: number;
    passCorrect: number;
  };
  composite: {
    size: number;
    /** Weak topics' combined share of the set (D6-10 (c)). */
    weakShare: number;
    weakTopicCount: number;
    /** With this many topics or fewer, the whole set is split by wrong rate. */
    proportionalWhenTopicsAtMost: number;
  };
  /** Composite, daily and quest sets grant XP only at passCorrect/size or better. */
  setPass: { size: number; passCorrect: number };
  daily: { size: number; xpGrantsPerDay: number };
  quest: { size: number; passCorrect: number; xp: number; xpGrantsPerWeek: number };
  diagnostic: { perTopic: number };
  streak: {
    milestones: readonly StreakMilestone[];
    protection: { price: number; maxHeld: number };
    restore: { cost: number; windowDays: number };
  };
  score: {
    correct: number;
    /** + floor(remainingRatio × speedBonusMax). */
    speedBonusMax: number;
    /** chosung only, correct before the reveal (also when reveal = none) (D6-1). */
    chosungBeforeReveal: number;
  };
  room: {
    minPlayers: number;
    maxPlayers: number;
    codeDigits: number;
    questionCount: { min: number; max: number };
    timeLimitsSec: readonly number[];
    /**
     * Chosung reveal choices shown to the host, as REMAINING seconds on the countdown (D-R2-1);
     * null = 힌트 없음. Only values < the time limit are offered (`allowedChosungRevealOptions`).
     */
    chosungRevealSec: readonly (number | null)[];
    revealMs: number;
    /** 최근 푼 문제 덜 나오게: per participant, the latest N solves count as "recent"; each participant who
     * solved a question multiplies its draw weight by `weight` (0.25 → about 4× less likely). */
    recentSolved: { limit: number; weight: number };
    lobbyTtlMs: number;
    finishedRetentionMs: number;
    leaseMs: number;
    leaseRenewMs: number;
    recoveryScanMs: number;
  };
  nickname: {
    guestMin: number;
    guestMax: number;
    memberMax: number;
  };
  report: {
    minWeeklySolves: number;
    weaknessMinSolves: number;
    weaknessCount: number;
    mostImprovedMinSolves: number;
  };
  calibration: {
    minSolves: number;
    table: readonly CalibrationRow[];
  };
  issueReport: {
    /** Distinct reporters that suspend a question until an admin checks it. */
    suspendThreshold: number;
  };
  guest: { retentionDays: number };
  items: {
    perSlot: number;
    cheesePrices: readonly number[];
    unlockLevel: number;
  };
  assets: { maxBytes: number; avatarMaxPx: number };
  /** Solo-only consumables sold in the shop (D-R2-2). The streak protection uses `streak.protection`. */
  consumables: {
    chosungFirst: { price: number; maxHeld: number };
    removeWrongChoice: { price: number; maxHeld: number };
  };
  /** Stage reward chests, granted on first clears only (feedback round 2, #3). */
  chest: {
    /** Stage levels divisible by this give a good chest instead of a normal one. */
    goodEveryLevels: number;
    normal: {
      /** Exclusive outcomes; chances sum to 1. Cheese is uniform in [min, max]. */
      cheeseChance: number;
      cheese: { min: number; max: number };
      chosungFirstChance: number;
      removeWrongChoiceChance: number;
    };
    good: {
      /** Always paid. */
      cheese: { min: number; max: number };
      /** One consumable, chosungFirst or removeWrongChoice with equal odds. */
      itemChance: number;
      protectionChance: number;
      /** Paid instead of the protection when the owner already holds `streak.protection.maxHeld`. */
      protectionFallbackCheese: number;
    };
  };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const CONFIG_VERSION = '2026-10-28.1';

export const DEFAULT_CONFIG: GrowthConfig = {
  configVersion: CONFIG_VERSION,
  time: { kstOffsetMs: 9 * HOUR },
  xp: {
    perDifficulty: 10,
    noHintBonus: 0.2,
    weakTopicBonus: 0.5,
    reviewBonus: 0.5,
    stackWeakTopicAndReview: false,
    sameQuestionDecay: { windowMs: 7 * DAY, factors: [1, 0.5, 0] },
    dailyCap: 3000,
    rankBonus: [15, 10, 5],
    rematch: { windowMs: HOUR, factor: 0.5 },
    rounding: 'floor',
  },
  accountLevel: { perLevel: 100 },
  weakTopic: { windowDays: 30, count: 2 },
  stage: {
    size: 10,
    clearCorrect: 7,
    poolSize: 15,
    reviewMaxPerSet: 2,
  },
  placement: {
    startDifficulty: 2.5,
    step: 0.5,
    minDifficulty: 1,
    maxDifficulty: 5,
    questionCount: 15,
    averageOfLast: 5,
  },
  basicTest: { every: 5, size: 10, passCorrect: 8 },
  composite: { size: 10, weakShare: 0.5, weakTopicCount: 2, proportionalWhenTopicsAtMost: 3 },
  setPass: { size: 10, passCorrect: 7 },
  daily: { size: 10, xpGrantsPerDay: 1 },
  quest: { size: 10, passCorrect: 7, xp: 50, xpGrantsPerWeek: 1 },
  diagnostic: { perTopic: 5 },
  streak: {
    milestones: [
      { days: 3, cheese: 10 },
      { days: 7, cheese: 30 },
      { days: 14, cheese: 50 },
      { days: 30, cheese: 100 },
    ],
    protection: { price: 50, maxHeld: 2 },
    restore: { cost: 100, windowDays: 1 },
  },
  score: { correct: 100, speedBonusMax: 50, chosungBeforeReveal: 30 },
  room: {
    minPlayers: 2,
    maxPlayers: 8,
    codeDigits: 4,
    questionCount: { min: 5, max: 100 },
    timeLimitsSec: [30, 45, 60],
    chosungRevealSec: [45, 30, 15, null],
    revealMs: 3000,
    recentSolved: { limit: 100, weight: 0.25 },
    lobbyTtlMs: 30 * MINUTE,
    finishedRetentionMs: HOUR,
    leaseMs: 10_000,
    leaseRenewMs: 3000,
    recoveryScanMs: 2000,
  },
  nickname: { guestMin: 2, guestMax: 10, memberMax: 10 },
  report: { minWeeklySolves: 30, weaknessMinSolves: 5, weaknessCount: 3, mostImprovedMinSolves: 10 },
  calibration: {
    minSolves: 30,
    // Tunable mapping from observed correct rate to a recommended ★ (admin approves, AC-C7).
    table: [
      { minCorrectRate: 0.9, difficulty: 1 },
      { minCorrectRate: 0.8, difficulty: 1.5 },
      { minCorrectRate: 0.7, difficulty: 2 },
      { minCorrectRate: 0.6, difficulty: 2.5 },
      { minCorrectRate: 0.5, difficulty: 3 },
      { minCorrectRate: 0.4, difficulty: 3.5 },
      { minCorrectRate: 0.3, difficulty: 4 },
      { minCorrectRate: 0.2, difficulty: 4.5 },
      { minCorrectRate: 0, difficulty: 5 },
    ],
  },
  issueReport: { suspendThreshold: 3 },
  guest: { retentionDays: 30 },
  items: { perSlot: 4, cheesePrices: [80, 150], unlockLevel: 20 },
  assets: { maxBytes: 1024 * 1024, avatarMaxPx: 512 },
  consumables: {
    chosungFirst: { price: 15, maxHeld: 99 },
    removeWrongChoice: { price: 15, maxHeld: 99 },
  },
  chest: {
    goodEveryLevels: 5,
    normal: { cheeseChance: 0.7, cheese: { min: 5, max: 15 }, chosungFirstChance: 0.2, removeWrongChoiceChance: 0.1 },
    good: { cheese: { min: 20, max: 50 }, itemChance: 0.5, protectionChance: 0.1, protectionFallbackCheese: 30 },
  },
};

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

/** Applies overrides (e.g. growth.json) onto the defaults. Arrays are replaced, objects merged. */
export function resolveConfig(overrides: DeepPartial<GrowthConfig> = {}, base: GrowthConfig = DEFAULT_CONFIG): GrowthConfig {
  return merge(base, overrides) as GrowthConfig;
}

function merge(base: unknown, patch: unknown): unknown {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) out[key] = merge(base[key], value);
  return out;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
