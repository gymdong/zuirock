// Demo member A state (plan §4.3 LF "시드(회원 A, 주제 4개)"), derived from `now`. Plain typed data only;
// inserting it through server services is pass 2 (depends on lane LB).
import {
  buildSolves,
  buildStreakDays,
  cheeseSeedAdjust,
  streakMilestoneCheese,
  windows,
  type SeedSolve,
  type SeedTopic,
} from './generators.ts';

export const TOPIC_LEVELS: Record<SeedTopic, number> = { 과학: 25, 상식: 22, 어휘력: 21, 역사: 24 };

export const CHEESE_TARGET = 320;
export const STREAK_LENGTH = 28;
/** One protection purchase (price 50) keeps the ledger realistic. */
export const PROTECTION_PURCHASES_CHEESE = 50;

/** Older (before this week, inside 30 days) solves; wrongs = 30-day wrongs − this-week wrongs. */
const OLDER = [
  { topic: '과학', count: 5, wrong: 1 },
  { topic: '상식', count: 36, wrong: 11 },
  { topic: '어휘력', count: 36, wrong: 13 },
  { topic: '역사', count: 36, wrong: 9 },
] as const;

/** This week's solves: 과학 15 (물리·화학·생물 각 5, 각 정답 4), 상식·어휘력·역사 각 4 (1 오답). */
const THIS_WEEK = [
  { topic: '과학', count: 15, wrong: 3 },
  { topic: '상식', count: 4, wrong: 1 },
  { topic: '어휘력', count: 4, wrong: 1 },
  { topic: '역사', count: 4, wrong: 1 },
] as const;

export interface DemoProfile {
  now: number;
  thisWeekSolves: SeedSolve[];
  olderSolves: SeedSolve[];
  topicLevels: Record<SeedTopic, number>;
  streak: { days: string[]; length: number };
  cheese: { target: number; recomputed: number; purchases: number; seedAdjust: number };
  /** Counts for pass-2 friends/battle records (nicknames are display data, not accounts). */
  friends: { nickname: string }[];
  battleRecords: { opponent: string; won: boolean; daysAgo: number }[];
}

export function buildDemoProfile(now: number): DemoProfile {
  const { weekStart, thirtyDayStart } = windows(now);
  const olderTo = weekStart - 1;
  const thisWeekSolves = THIS_WEEK.flatMap((b) =>
    buildSolves(b, weekStart, now - 1, b.topic === '과학' ? { 물리: 1, 화학: 1, 생물: 1 } : undefined),
  ).sort((a, b) => a.at - b.at);
  const olderSolves = OLDER.flatMap((b) => buildSolves(b, thirtyDayStart, olderTo)).sort((a, b) => a.at - b.at);
  const recomputed = streakMilestoneCheese(STREAK_LENGTH);
  return {
    now,
    thisWeekSolves,
    olderSolves,
    topicLevels: { ...TOPIC_LEVELS },
    streak: { days: buildStreakDays(now, STREAK_LENGTH), length: STREAK_LENGTH },
    cheese: {
      target: CHEESE_TARGET,
      recomputed,
      purchases: PROTECTION_PURCHASES_CHEESE,
      seedAdjust: cheeseSeedAdjust(CHEESE_TARGET, recomputed, PROTECTION_PURCHASES_CHEESE),
    },
    friends: [{ nickname: '치즈쥐1' }, { nickname: '치즈쥐2' }, { nickname: '치즈쥐3' }],
    battleRecords: [
      { opponent: '치즈쥐1', won: true, daysAgo: 3 },
      { opponent: '치즈쥐2', won: false, daysAgo: 8 },
    ],
  };
}

/** Wrong rate over the 30-day window (this week + older) for a topic. */
export function thirtyDayStats(profile: DemoProfile, topic: SeedTopic): { total: number; wrong: number } {
  const all = [...profile.thisWeekSolves, ...profile.olderSolves].filter(
    (s) => s.topic === topic && s.at >= profile.now - 29 * 86_400_000,
  );
  return { total: all.length, wrong: all.filter((s) => !s.correct).length };
}
