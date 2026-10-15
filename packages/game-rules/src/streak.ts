import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { diffKstDays } from './time/kst.js';
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
  if (state.judgedThrough !== null && input.day <= state.judgedThrough) return { state, events: [] };
  const events: StreakEvent[] = [];
  const next: StreakState = { ...state, judgedThrough: input.day };
  if (input.active) {
    next.current = state.current + 1;
    next.runStartDay = state.current === 0 || state.runStartDay === null ? input.day : state.runStartDay;
    next.lastCountedDay = input.day;
    next.longest = Math.max(state.longest, next.current);
    events.push({ type: 'counted', day: input.day, current: next.current });
    const milestone = cfg.streak.milestones.find((m) => m.days === next.current);
    if (milestone) {
      events.push({ type: 'milestone', day: input.day, days: milestone.days, cheese: milestone.cheese, runStartDay: next.runStartDay });
    }
  } else if (state.current > 0) {
    if (input.protectionsAtBoundary > 0) {
      events.push({ type: 'protection_used', day: input.day });
    } else {
      next.broken = { missedDay: input.day, lostLength: state.current, runStartDay: state.runStartDay ?? input.day };
      next.current = 0;
      next.runStartDay = null;
      events.push({ type: 'broken', day: input.day, lostLength: state.current });
    }
  }
  return { state: next, events };
}

export type ProtectionPurchaseCheck =
  | { ok: true; price: number }
  | { ok: false; reason: 'MAX_HELD' | 'INSUFFICIENT_CHEESE' };

/** Protection: 50 cheese each, at most 2 held. */
export function canBuyProtection(
  input: { held: number; cheese: number },
  cfg: GrowthConfig = DEFAULT_CONFIG,
): ProtectionPurchaseCheck {
  const { price, maxHeld } = cfg.streak.protection;
  if (input.held >= maxHeld) return { ok: false, reason: 'MAX_HELD' };
  if (input.cheese < price) return { ok: false, reason: 'INSUFFICIENT_CHEESE' };
  return { ok: true, price };
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
  const { broken } = state;
  if (!broken) return { ok: false, reason: 'NOT_BROKEN' };
  const daysSince = diffKstDays(broken.missedDay, input.today);
  if (daysSince < 1 || daysSince > cfg.streak.restore.windowDays) return { ok: false, reason: 'WINDOW_EXPIRED' };
  const cost = cfg.streak.restore.cost;
  if (input.cheese < cost) return { ok: false, reason: 'INSUFFICIENT_CHEESE' };
  // Days already counted since the break (only the restore day itself can be) join the restored run.
  const current = broken.lostLength + state.current;
  return {
    ok: true,
    cost,
    state: { ...state, current, longest: Math.max(state.longest, current), runStartDay: broken.runStartDay, broken: null },
  };
}
