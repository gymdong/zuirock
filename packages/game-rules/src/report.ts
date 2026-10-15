import { TOPIC_IDS, type HistorySummaryDto, type TopicId, type WeeklyReportDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { addKstDays, toKstMonth } from './time/kst.js';
import type { KstDay, SolveFact } from './types.js';

export interface WeeklyReportInput {
  /** Monday (KST) of the reported week. */
  weekStart: KstDay;
  /** Solves with answeredAt in [weekStart 00:00 KST, next Monday 00:00 KST). */
  thisWeek: readonly SolveFact[];
  /** Solves of the previous Mon–Sun week, for the comparison column. */
  prevWeek: readonly SolveFact[];
  /** Streak-counted days within the week. */
  streakDays: number;
  /** Topics to list (the user's selected topics plus any topic solved this week). */
  topicIds: readonly TopicId[];
}

/**
 * Weekly report body (p12, AC-D2): solved count, correct rate, streak days, per-topic correct rate
 * with previous-week delta (percentage points), and '가장 많이 늘었어요' = among topics with ≥ 10
 * solves this week, the largest positive delta (null if none). Rates are null with 0 solves.
 * Identical for the live current week and a finalized snapshot (D6-9); `finalized` is set by the caller.
 */
export function weeklyReport(input: WeeklyReportInput, cfg: GrowthConfig = DEFAULT_CONFIG): Omit<WeeklyReportDto, 'finalized'> {
  const rate = (list: readonly SolveFact[]) =>
    list.length > 0 ? list.filter((s) => s.correct).length / list.length : null;
  const byTopic = input.topicIds.map((topicId) => {
    const cur = input.thisWeek.filter((s) => s.topicId === topicId);
    const prev = input.prevWeek.filter((s) => s.topicId === topicId);
    const correctRate = rate(cur);
    const prevCorrectRate = rate(prev);
    const deltaPp =
      correctRate !== null && prevCorrectRate !== null ? Math.round((correctRate - prevCorrectRate) * 1000) / 10 : null;
    return { topicId, solved: cur.length, correctRate, prevCorrectRate, deltaPp };
  });
  let mostImproved: { topicId: TopicId; deltaPp: number } | null = null;
  for (const t of byTopic) {
    if (t.solved < cfg.report.mostImprovedMinSolves || t.deltaPp === null || t.deltaPp <= 0) continue;
    if (!mostImproved || t.deltaPp > mostImproved.deltaPp) mostImproved = { topicId: t.topicId, deltaPp: t.deltaPp };
  }
  return {
    weekStart: input.weekStart,
    weekEnd: addKstDays(input.weekStart, 6),
    solved: input.thisWeek.length,
    correctRate: rate(input.thisWeek),
    streakDays: input.streakDays,
    byTopic,
    mostImproved,
  };
}

export interface HistoryInput {
  solves: readonly SolveFact[];
  longestStreak: number;
  /** The owner's battle results. */
  battles: ReadonlyArray<{ rank: number; participantCount: number }>;
}

/**
 * 전체 기록 tab: totals, correct rate, longest streak, battle record (played, wins = rank 1,
 * podiums = rank ≤ 3), monthly solve counts by KST month ascending, and per-topic totals.
 */
export function historySummary(input: HistoryInput, cfg: GrowthConfig = DEFAULT_CONFIG): HistorySummaryDto {
  const { solves } = input;
  const correct = solves.filter((s) => s.correct).length;
  const months = new Map<string, number>();
  for (const s of solves) {
    const m = toKstMonth(s.answeredAt);
    months.set(m, (months.get(m) ?? 0) + 1);
  }
  const byTopic = TOPIC_IDS.flatMap((topicId) => {
    const list = solves.filter((s) => s.topicId === topicId);
    if (list.length === 0) return [];
    return [{ topicId, solved: list.length, correctRate: list.filter((s) => s.correct).length / list.length }];
  });
  return {
    totalSolved: solves.length,
    correctRate: solves.length > 0 ? correct / solves.length : null,
    longestStreak: input.longestStreak,
    battles: {
      played: input.battles.length,
      wins: input.battles.filter((b) => b.rank === 1).length,
      podiums: input.battles.filter((b) => b.rank <= 3).length,
    },
    monthly: [...months].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, solved]) => ({ month, solved })),
    byTopic,
  };
}
