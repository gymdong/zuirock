import type { HistorySummaryDto, TopicId, WeeklyReportDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';
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
  throw new NotImplementedError('weeklyReport');
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
  throw new NotImplementedError('historySummary');
}
