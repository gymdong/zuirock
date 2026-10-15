import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { kstDayStart } from '../src/time/kst.js';
import {
  computeMergeGrant,
  computeXpGrant,
  type MergeGrantInput,
  type MergeSource,
  type XpGrantContext,
  type XpItemInput,
} from '../src/xp.js';

const item = (o: Partial<XpItemInput> = {}): XpItemInput => ({
  questionId: 'q',
  difficulty: 2,
  questionType: 'mcq',
  correct: true,
  noHint: false,
  weakTopic: false,
  reviewCompleted: false,
  priorSolvesInWindow: 0,
  ...o,
});
const battle: XpGrantContext = { kind: 'battle', rank: 4, rematch: false };

describe('computeXpGrant — per item', () => {
  it.each([
    // patch, multiplier, decay, xp
    [{}, 1, 1, 20],
    [{ correct: false }, 1, 1, 0],
    [{ difficulty: 2.5 }, 1, 1, 25],
    [{ questionType: 'chosung', noHint: true }, 1.2, 1, 24],
    [{ questionType: 'mcq', noHint: true }, 1, 1, 20], // noHint is chosung only (D6-2)
    [{ weakTopic: true }, 1.5, 1, 30],
    [{ reviewCompleted: true }, 1.5, 1, 30],
    [{ weakTopic: true, reviewCompleted: true }, 1.5, 1, 30], // no stacking
    [{ questionType: 'chosung', noHint: true, weakTopic: true, difficulty: 3 }, 1.7, 1, 51], // additive 1+0.2+0.5
    [{ questionType: 'chosung', noHint: true, weakTopic: true, difficulty: 2.5 }, 1.7, 1, 42], // 42.5 floored
    [{ priorSolvesInWindow: 1 }, 1, 0.5, 10],
    [{ priorSolvesInWindow: 1, difficulty: 1.5 }, 1, 0.5, 7], // 7.5 floored per item
    [{ priorSolvesInWindow: 2 }, 1, 0, 0],
    [{ priorSolvesInWindow: 9 }, 1, 0, 0],
  ] as const)('%j → ×%s decay %s = %i', (patch, multiplier, decayFactor, xp) => {
    const r = computeXpGrant({ context: battle, items: [item(patch as Partial<XpItemInput>)], grantedTodayBefore: 0 });
    expect(r.items[0]).toMatchObject({ multiplier: expect.closeTo(multiplier, 9), decayFactor, xp });
    expect(r.granted).toBe(xp);
  });
});

describe('computeXpGrant — set level', () => {
  const ten = Array.from({ length: 10 }, (_, i) => item({ questionId: `q${i}` })); // 10 × 20 = 200

  it.each([
    ['stage first clear', { kind: 'stage', cleared: true, alreadyCleared: false }, true, undefined, 200],
    ['stage failed', { kind: 'stage', cleared: false, alreadyCleared: false }, false, 'STAGE_FAILED', 0],
    ['stage replay', { kind: 'stage', cleared: true, alreadyCleared: true }, false, 'NOT_FIRST_CLEAR', 0],
    ['composite 7/10', { kind: 'composite', correctCount: 7, totalCount: 10 }, true, undefined, 200],
    ['composite 6/10', { kind: 'composite', correctCount: 6, totalCount: 10 }, false, 'BELOW_PASS', 0],
    ['daily 7/10', { kind: 'daily', correctCount: 7, totalCount: 10, alreadyGrantedToday: false }, true, undefined, 200],
    ['daily twice', { kind: 'daily', correctCount: 9, totalCount: 10, alreadyGrantedToday: true }, false, 'DAILY_ALREADY_GRANTED', 0],
    ['daily 6/10', { kind: 'daily', correctCount: 6, totalCount: 10, alreadyGrantedToday: false }, false, 'BELOW_PASS', 0],
    ['quest flat 50', { kind: 'quest', correctCount: 7, totalCount: 10, alreadyGrantedThisWeek: false }, true, undefined, 50],
    ['quest twice', { kind: 'quest', correctCount: 10, totalCount: 10, alreadyGrantedThisWeek: true }, false, 'QUEST_ALREADY_GRANTED', 0],
    ['quest 6/10', { kind: 'quest', correctCount: 6, totalCount: 10, alreadyGrantedThisWeek: false }, false, 'BELOW_PASS', 0],
    ['placement', { kind: 'placement' }, false, 'NO_XP_MODE', 0],
    ['basic test', { kind: 'basic_test' }, false, 'NO_XP_MODE', 0],
    ['diagnostic', { kind: 'diagnostic' }, false, 'NO_XP_MODE', 0],
    ['battle 1st', { kind: 'battle', rank: 1, rematch: false }, true, undefined, 215],
    ['battle 2nd', { kind: 'battle', rank: 2, rematch: false }, true, undefined, 210],
    ['battle 3rd', { kind: 'battle', rank: 3, rematch: false }, true, undefined, 205],
    ['battle 4th', { kind: 'battle', rank: 4, rematch: false }, true, undefined, 200],
    ['battle 1st rematch', { kind: 'battle', rank: 1, rematch: true }, true, undefined, 107], // floor(215 × 0.5)
  ] as const)('%s', (_n, context, eligible, reason, granted) => {
    const r = computeXpGrant({ context: context as XpGrantContext, items: ten, grantedTodayBefore: 0 });
    expect(r.eligible).toBe(eligible);
    expect(r.ineligibleReason).toBe(reason);
    expect(r.granted).toBe(granted);
    expect(r.configVersion).toBeTruthy();
  });

  it.each([
    // before, granted, capped, capReached
    [0, 215, 0, false],
    [2785, 215, 0, false],
    [2900, 100, 115, true],
    [3000, 0, 215, true],
    [3500, 0, 215, true],
  ])('daily cap 3000 applied last (before=%i)', (grantedTodayBefore, granted, cappedAmount, capReached) => {
    const r = computeXpGrant({ context: { kind: 'battle', rank: 1, rematch: false }, items: ten, grantedTodayBefore });
    expect(r).toMatchObject({ preCapTotal: 215, granted, cappedAmount, capReached });
  });

  it('ineligible grants report zeros', () => {
    const r = computeXpGrant({ context: { kind: 'placement' }, items: ten, grantedTodayBefore: 3000 });
    expect(r).toMatchObject({ items: [], itemsTotal: 0, preCapTotal: 0, granted: 0, capReached: false });
  });
});

const T0 = kstDayStart('2026-10-15') + 10 * 3_600_000; // 10:00 KST
const H = 3_600_000;
const D = 24 * H;
const emptyAccount: MergeGrantInput['account'] = {
  solves: [],
  clearedStages: [],
  dailyGrantedDays: [],
  questGrantedWeeks: [],
  grantedXpByDay: {},
};
const src = (id: string, completedAt: number, set: MergeSource['set'], qids: string[], difficulty = 2): MergeSource => ({
  source: { type: set.kind, id },
  completedAt,
  set,
  items: qids.map((questionId, i) => ({
    questionId,
    difficulty,
    questionType: 'mcq',
    correct: true,
    noHint: false,
    weakTopic: false,
    reviewCompleted: false,
    answeredAt: completedAt - (qids.length - i) * 1000,
  })),
});

describe('computeMergeGrant', () => {
  it('re-judges decay over account + guest solves', () => {
    const r = computeMergeGrant({
      account: { ...emptyAccount, solves: [{ questionId: 'a', answeredAt: T0 - D }, { questionId: 'b', answeredAt: T0 - 8 * D }] },
      guestSources: [src('g1', T0, { kind: 'battle', rank: 4, rematch: false }, ['a', 'b', 'c'])],
    });
    // a: 1 prior in 7 d → 10; b: prior is outside 7 d → 20; c → 20
    expect(r.lines[0]!.result.items.map((i) => i.xp)).toEqual([10, 20, 20]);
    expect(r.totalGranted).toBe(50);
  });

  it('counts earlier guest solves for decay too', () => {
    const r = computeMergeGrant({
      account: emptyAccount,
      guestSources: [
        src('g2', T0 + H, { kind: 'battle', rank: 4, rematch: false }, ['a']),
        src('g1', T0, { kind: 'battle', rank: 4, rematch: false }, ['a']),
      ],
    });
    expect(r.lines.map((l) => [l.source.id, l.result.granted])).toEqual([
      ['g1', 20],
      ['g2', 10],
    ]);
  });

  it('applies the per-day remaining cap; account XP is frozen', () => {
    const r = computeMergeGrant({
      account: { ...emptyAccount, grantedXpByDay: { '2026-10-15': 2990 } },
      guestSources: [
        src('g1', T0, { kind: 'battle', rank: 1, rematch: false }, ['a']),
        src('g2', T0 + D, { kind: 'battle', rank: 4, rematch: false }, ['b']),
      ],
    });
    expect(r.lines.map((l) => [l.kstDay, l.result.granted, l.result.capReached])).toEqual([
      ['2026-10-15', 10, true],
      ['2026-10-16', 20, false],
    ]);
  });

  it.each([
    [
      'stage already cleared by the account (incl. placement skip)',
      { clearedStages: [{ topicId: 'science' as const, level: 25 }] },
      [src('s', T0, { kind: 'stage', topicId: 'science', level: 20, cleared: true }, ['a'])],
      [['NOT_FIRST_CLEAR', 0]],
    ],
    [
      'stage first clear only once across guest sets',
      {},
      [
        src('s1', T0, { kind: 'stage', topicId: 'science', level: 3, cleared: true }, ['a']),
        src('s2', T0 + H, { kind: 'stage', topicId: 'science', level: 3, cleared: true }, ['b']),
      ],
      [
        [undefined, 20],
        ['NOT_FIRST_CLEAR', 0],
      ],
    ],
    [
      'daily once per KST day (account already got it)',
      { dailyGrantedDays: ['2026-10-15'] },
      [src('d', T0, { kind: 'daily', correctCount: 8, totalCount: 10 }, ['a'])],
      [['DAILY_ALREADY_GRANTED', 0]],
    ],
    [
      'daily once per KST day among guest sets, next day ok',
      {},
      [
        src('d1', T0, { kind: 'daily', correctCount: 8, totalCount: 10 }, ['a']),
        src('d2', T0 + H, { kind: 'daily', correctCount: 8, totalCount: 10 }, ['b']),
        src('d3', T0 + D, { kind: 'daily', correctCount: 8, totalCount: 10 }, ['c']),
      ],
      [
        [undefined, 20],
        ['DAILY_ALREADY_GRANTED', 0],
        [undefined, 20],
      ],
    ],
    [
      'quest once per KST week',
      { questGrantedWeeks: ['2026-10-12'] },
      [
        src('q1', T0, { kind: 'quest', correctCount: 7, totalCount: 10 }, ['a']),
        src('q2', T0 + 5 * D, { kind: 'quest', correctCount: 7, totalCount: 10 }, ['b']), // Tue next week
        src('q3', T0 + 6 * D, { kind: 'quest', correctCount: 7, totalCount: 10 }, ['c']),
      ],
      [
        ['QUEST_ALREADY_GRANTED', 0],
        [undefined, 50],
        ['QUEST_ALREADY_GRANTED', 0],
      ],
    ],
    [
      'composite below pass',
      {},
      [src('c', T0, { kind: 'composite', correctCount: 6, totalCount: 10 }, ['a'])],
      [['BELOW_PASS', 0]],
    ],
  ] as const)('%s', (_n, account, sources, expected) => {
    const r = computeMergeGrant({ account: { ...emptyAccount, ...account }, guestSources: sources as unknown as MergeSource[] });
    expect(r.lines.map((l) => [l.result.ineligibleReason, l.result.granted])).toEqual(expected);
  });

  // Property tests (seeded by fast-check).
  const day = fc.integer({ min: 0, max: 6 });
  const arbSource = fc
    .record({
      id: fc.uuid(),
      dayOffset: day,
      hour: fc.integer({ min: 0, max: 23 }),
      kind: fc.constantFrom('battle', 'composite', 'daily', 'quest', 'stage'),
      level: fc.integer({ min: 1, max: 5 }),
      rank: fc.integer({ min: 1, max: 8 }),
      qids: fc.array(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f'), { minLength: 1, maxLength: 10 }),
      difficulty: fc.constantFrom(1, 2.5, 5),
    })
    .map((s): MergeSource => {
      const at = kstDayStart('2026-10-12') + s.dayOffset * D + s.hour * H + 30 * 60_000;
      const set: MergeSource['set'] =
        s.kind === 'battle'
          ? { kind: 'battle', rank: s.rank, rematch: s.rank % 2 === 0 }
          : s.kind === 'stage'
            ? { kind: 'stage', topicId: 'science', level: s.level, cleared: true }
            : { kind: s.kind, correctCount: 7, totalCount: 10 };
      return src(s.id, at, set, s.qids, s.difficulty);
    });
  const arbInput = fc.record({
    grantedXpByDay: fc.dictionary(
      fc.constantFrom('2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'),
      fc.integer({ min: 0, max: 3200 }),
    ),
    sources: fc.array(arbSource, { maxLength: 40 }),
  });

  it('property: never exceeds the per-day remaining cap and never touches account XP', () => {
    fc.assert(
      fc.property(arbInput, ({ grantedXpByDay, sources }) => {
        const frozen = { ...grantedXpByDay };
        const r = computeMergeGrant({ account: { ...emptyAccount, grantedXpByDay }, guestSources: sources });
        expect(grantedXpByDay).toEqual(frozen);
        const byDay = new Map<string, number>();
        for (const l of r.lines) {
          expect(l.result.granted).toBeGreaterThanOrEqual(0);
          byDay.set(l.kstDay, (byDay.get(l.kstDay) ?? 0) + l.result.granted);
        }
        for (const [d, g] of byDay) expect(g).toBeLessThanOrEqual(Math.max(0, 3000 - (grantedXpByDay[d] ?? 0)));
        expect(r.totalGranted).toBe([...byDay.values()].reduce((a, b) => a + b, 0));
      }),
      { seed: 20261016, numRuns: 300 },
    );
  });

  it('property: deterministic and independent of input order (idempotent re-run)', () => {
    fc.assert(
      fc.property(arbInput, ({ grantedXpByDay, sources }) => {
        const input = { account: { ...emptyAccount, grantedXpByDay }, guestSources: sources };
        const a = computeMergeGrant(input);
        expect(computeMergeGrant(input)).toEqual(a);
        expect(computeMergeGrant({ ...input, guestSources: [...sources].reverse() })).toEqual(a);
      }),
      { seed: 20261016, numRuns: 200 },
    );
  });

  it('property: merged grant ≤ the sum of standalone grants (re-judging only reduces)', () => {
    fc.assert(
      fc.property(arbInput, ({ sources }) => {
        const r = computeMergeGrant({ account: emptyAccount, guestSources: sources });
        for (const l of r.lines) expect(l.result.granted).toBeLessThanOrEqual(l.result.preCapTotal);
      }),
      { seed: 20261016, numRuns: 200 },
    );
  });
});
