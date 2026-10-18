import * as rules from '@zuirock/game-rules';

/**
 * Battle timer math (D-R2-1). The timer counts DOWN from the limit to 1 on the server clock.
 * The chosung reveal setting N means "when N seconds REMAIN"; the server's `room:chosungReveal`
 * is authoritative, the client only positions the marker and the countdown to it.
 */
export const URGENT_SEC = 10;

/** Whole seconds remaining (limit → 1, then 0 at the deadline). */
export function remainingSeconds(deadlineAt: number, now: number, limitSec: number): number {
  return Math.min(limitSec, Math.max(0, Math.ceil((deadlineAt - now) / 1000)));
}

/** Remaining-time N at which the chosung is revealed, derived from absolute server times. */
export function revealRemainingSec(q: { deadlineAt: number; chosungRevealAt: number | null }): number | null {
  return q.chosungRevealAt == null ? null : Math.round((q.deadlineAt - q.chosungRevealAt) / 1000);
}

/** Seconds left until the reveal ("초성 힌트까지 N초"), or null without a hint. */
export function secondsUntilReveal(remaining: number, revealN: number | null): number | null {
  return revealN == null ? null : Math.max(0, remaining - revealN);
}

export function isUrgent(remaining: number): boolean {
  return remaining > 0 && remaining <= URGENT_SEC;
}

const LOCAL_REVEAL_OPTIONS = [45, 30, 15];

/**
 * Host's reveal choices for a time limit: remaining-second options below the limit, then null
 * (힌트 없음). Uses @zuirock/game-rules when its build has the helper, else the same rule locally.
 */
export function revealOptions(timeLimitSec: number): (number | null)[] {
  const fromRules = (rules as { allowedChosungRevealOptions?: (limit: number) => (number | null)[] }).allowedChosungRevealOptions;
  if (typeof fromRules === 'function') return fromRules(timeLimitSec);
  return [...LOCAL_REVEAL_OPTIONS.filter((n) => n < timeLimitSec), null];
}

/** Keep a reveal setting valid for a new limit: unchanged if allowed, else the largest option. */
export function fitReveal(current: number | null, timeLimitSec: number): number | null {
  const options = revealOptions(timeLimitSec);
  return options.includes(current) ? current : (options[0] ?? null);
}

/** Minimum difficulty choices: ★1–★5 in 0.5 steps (item 6). */
export const MIN_DIFFICULTY_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Slider value for a 0..1 position, snapped to `step` inside [min, max]. */
export function snapToStep(ratio: number, min: number, max: number, step: number): number {
  const r = Math.min(1, Math.max(0, ratio));
  const v = min + Math.round((r * (max - min)) / step) * step;
  return Math.min(max, Math.max(min, Number(v.toFixed(4))));
}
