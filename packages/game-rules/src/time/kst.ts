import type { EpochMs, KstDay } from '../types.js';

/**
 * KST day helpers — the single source of the 00:00 KST boundary (streak, daily set, daily XP cap,
 * weekly report Mon–Sun). All functions are pure: they take epoch ms or a KstDay, never the clock.
 * KST is UTC+9 with no DST.
 */

const DAY_MS = 86_400_000;
export const KST_OFFSET_MS = 9 * 3_600_000;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Days since 1970-01-01 (KST) for a KstDay. Throws on malformed input. */
function dayNumber(day: KstDay): number {
  const m = DAY_RE.exec(day);
  if (!m) throw new RangeError(`Invalid KstDay: ${day}`);
  const n = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / DAY_MS;
  if (fromDayNumber(n) !== day) throw new RangeError(`Invalid KstDay: ${day}`);
  return n;
}

function fromDayNumber(n: number): KstDay {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** KST calendar day containing the instant. */
export function toKstDay(at: EpochMs): KstDay {
  return fromDayNumber(Math.floor((at + KST_OFFSET_MS) / DAY_MS));
}

/** Epoch ms of 00:00 KST on `day`. */
export function kstDayStart(day: KstDay): EpochMs {
  return dayNumber(day) * DAY_MS - KST_OFFSET_MS;
}

/** Epoch ms of 00:00 KST on the day after `day` (exclusive end). */
export function kstDayEnd(day: KstDay): EpochMs {
  return kstDayStart(day) + DAY_MS;
}

export function addKstDays(day: KstDay, days: number): KstDay {
  return fromDayNumber(dayNumber(day) + days);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function diffKstDays(from: KstDay, to: KstDay): number {
  return dayNumber(to) - dayNumber(from);
}

/** 0 = Monday … 6 = Sunday. */
export function kstWeekday(day: KstDay): number {
  // 1970-01-01 was a Thursday (index 3 with Monday = 0).
  return (((dayNumber(day) + 3) % 7) + 7) % 7;
}

/** Monday of the Mon–Sun week containing `day`. */
export function kstWeekStart(day: KstDay): KstDay {
  return addKstDays(day, -kstWeekday(day));
}

/** `YYYY-MM` of the KST day containing the instant. */
export function toKstMonth(at: EpochMs): string {
  return toKstDay(at).slice(0, 7);
}

export function isSameKstDay(a: EpochMs, b: EpochMs): boolean {
  return toKstDay(a) === toKstDay(b);
}
