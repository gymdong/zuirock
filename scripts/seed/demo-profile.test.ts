import { kstDayStart, kstWeekStart, toKstDay } from '@zuirock/game-rules';
import { describe, expect, it } from 'vitest';
import { buildDemoProfile, thirtyDayStats } from './demo-profile.ts';

// A Monday just after midnight KST, a Wednesday noon, and a Sunday night: edge cases for the week/30-day windows.
const NOWS = [Date.parse('2026-10-19T00:30:00+09:00'), Date.parse('2026-10-21T12:00:00+09:00'), Date.parse('2026-10-25T23:50:00+09:00')];

describe.each(NOWS)('demo profile at %i', (now) => {
  const p = buildDemoProfile(now);
  const weekStart = kstDayStart(kstWeekStart(toKstDay(now)));

  it('this week has 27 solves: 과학 15 (각 소분야 5문제 중 4 정답), others 4', () => {
    expect(p.thisWeekSolves).toHaveLength(27);
    expect(p.thisWeekSolves.every((s) => s.at >= weekStart && s.at <= now)).toBe(true);
    const sci = p.thisWeekSolves.filter((s) => s.topic === '과학');
    expect(sci).toHaveLength(15);
    for (const sub of ['물리', '화학', '생물']) {
      const rows = sci.filter((s) => s.subfield === sub);
      expect(rows).toHaveLength(5);
      expect(rows.filter((s) => s.correct)).toHaveLength(4);
    }
    for (const t of ['상식', '어휘력', '역사'] as const) {
      expect(p.thisWeekSolves.filter((s) => s.topic === t)).toHaveLength(4);
    }
  });

  it('30-day wrong counts: 과학 4/20, 상식 12/40, 어휘력 14/40, 역사 10/40', () => {
    expect(thirtyDayStats(p, '과학')).toEqual({ total: 20, wrong: 4 });
    expect(thirtyDayStats(p, '상식')).toEqual({ total: 40, wrong: 12 });
    expect(thirtyDayStats(p, '어휘력')).toEqual({ total: 40, wrong: 14 });
    expect(thirtyDayStats(p, '역사')).toEqual({ total: 40, wrong: 10 });
  });

  it('older solves precede this week and stay inside 30 days', () => {
    expect(p.olderSolves.every((s) => s.at < weekStart && s.at >= now - 29 * 86_400_000)).toBe(true);
  });

  it('topic levels, 28-day streak and cheese target 320', () => {
    expect(p.topicLevels).toEqual({ 과학: 25, 상식: 22, 어휘력: 21, 역사: 24 });
    expect(p.streak.days).toHaveLength(28);
    expect(p.streak.days.at(-1)).toBe(toKstDay(now));
    expect(p.cheese.recomputed).toBe(90);
    expect(p.cheese.recomputed - p.cheese.purchases + p.cheese.seedAdjust).toBe(320);
  });
});
