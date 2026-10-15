import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';
import type { KstDay } from './types.js';

export interface StreakState {
  current: number;
  longest: number;
  /** Last KST day that counted (activity). */
  lastCountedDay: KstDay | null;
  /** First day of the current run; part of the cheese idempotency key (userId, milestone, runStartDay). */
  runStartDay: KstDay | null;
  /** Last day already judged; applying the same or an earlier day is a no-op (idempotent). */
  judgedThrough: KstDay | null;
  /** Set when the streak broke; enables restore during the following day. */
  broken: { missedDay: KstDay; lostLength: number; runStartDay: KstDay } | null;
}

export interface StreakDayInput {
  day: KstDay;
  /** A full 10-question solo set or a finished battle happened that KST day (AC-G6). */
  active: boolean;
  /** Protections held at 00:00 KST after `day` (purchases after that instant do not count). */
  protectionsAtBoundary: number;
}

export type StreakEvent =
  | { type: 'counted'; day: KstDay; current: number }
  | { type: 'milestone'; day: KstDay; days: number; cheese: number; runStartDay: KstDay }
  | { type: 'protection_used'; day: KstDay }
  | { type: 'broken'; day: KstDay; lostLength: number };

/**
 * Judge one KST day, in order (AC-G6, AC-G7). Active → current + 1 (milestones 3/7/14/30 days pay
 * 10/30/50/100 cheese once per run; none after 30). Inactive with a protection held at the boundary →
 * one protection used automatically, streak kept (not incremented). Inactive without → broken
 * (current = 0, `broken` recorded). Days ≤ judgedThrough are ignored.
 */
export function applyStreakDay(
  state: StreakState,
  input: StreakDayInput,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): { state: StreakState; events: StreakEvent[] } {
  throw new NotImplementedError('applyStreakDay');
}

export type ProtectionPurchaseCheck =
  | { ok: true; price: number }
  | { ok: false; reason: 'MAX_HELD' | 'INSUFFICIENT_CHEESE' };

/** Protection: 50 cheese each, at most 2 held. */
export function canBuyProtection(
  input: { held: number; cheese: number },
  cfg: GrowthConfig = DEFAULT_CONFIG,
): ProtectionPurchaseCheck {
  throw new NotImplementedError('canBuyProtection');
}

export type StreakRestoreResult =
  | { ok: true; state: StreakState; cost: number }
  | { ok: false; reason: 'NOT_BROKEN' | 'WINDOW_EXPIRED' | 'INSUFFICIENT_CHEESE' };

/**
 * Restore a broken streak for 100 cheese, only on the day after the missed day
 * (today = missedDay + 1). Restores `lostLength` and keeps the original runStartDay.
 */
export function restoreStreak(
  state: StreakState,
  input: { today: KstDay; cheese: number },
  cfg: GrowthConfig = DEFAULT_CONFIG,
): StreakRestoreResult {
  throw new NotImplementedError('restoreStreak');
}
