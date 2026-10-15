import { describe, expect, it } from 'vitest';
import {
  addKstDays,
  diffKstDays,
  isSameKstDay,
  kstDayEnd,
  kstDayStart,
  kstWeekStart,
  kstWeekday,
  toKstDay,
  toKstMonth,
} from '../src/time/kst.js';

const utc = (iso: string) => Date.parse(iso);

describe('time/kst', () => {
  it.each([
    ['2026-10-15T14:59:59.999Z', '2026-10-15'],
    ['2026-10-15T15:00:00.000Z', '2026-10-16'], // 00:00 KST
    ['2026-12-31T15:00:00.000Z', '2027-01-01'],
    ['2024-02-28T15:30:00.000Z', '2024-02-29'],
  ])('toKstDay(%s) = %s', (iso, day) => {
    expect(toKstDay(utc(iso))).toBe(day);
  });

  it('kstDayStart / kstDayEnd bracket the KST day', () => {
    expect(kstDayStart('2026-10-16')).toBe(utc('2026-10-15T15:00:00.000Z'));
    expect(kstDayEnd('2026-10-16')).toBe(utc('2026-10-16T15:00:00.000Z'));
    expect(toKstDay(kstDayStart('2026-10-16'))).toBe('2026-10-16');
    expect(toKstDay(kstDayEnd('2026-10-16') - 1)).toBe('2026-10-16');
  });

  it('adds and diffs days across month and year ends', () => {
    expect(addKstDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addKstDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(diffKstDays('2026-10-15', '2026-10-29')).toBe(14);
    expect(diffKstDays('2026-10-29', '2026-10-15')).toBe(-14);
  });

  it('weeks run Monday–Sunday', () => {
    expect(kstWeekday('2026-10-12')).toBe(0); // Monday
    expect(kstWeekday('2026-10-18')).toBe(6); // Sunday
    expect(kstWeekStart('2026-10-18')).toBe('2026-10-12');
    expect(kstWeekStart('2026-10-19')).toBe('2026-10-19');
    expect(kstWeekStart('2026-11-01')).toBe('2026-10-26');
  });

  it('month and same-day helpers use the KST boundary', () => {
    expect(toKstMonth(utc('2026-10-31T15:00:00.000Z'))).toBe('2026-11');
    expect(isSameKstDay(utc('2026-10-15T15:00:00.000Z'), utc('2026-10-16T14:59:59.999Z'))).toBe(true);
    expect(isSameKstDay(utc('2026-10-15T14:59:59.999Z'), utc('2026-10-15T15:00:00.000Z'))).toBe(false);
  });

  it.each(['2026-13-01', '2026-02-30', '20261015', ''])('rejects malformed day %s', (day) => {
    expect(() => kstDayStart(day)).toThrow(RangeError);
  });
});
