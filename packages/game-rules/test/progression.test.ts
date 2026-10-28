import { describe, expect, it } from 'vitest';
import { accountLevel } from '../src/account-level.js';
import { recommendDifficulty } from '../src/calibration.js';
import { basicTestCheckpoints, basicTestPass, basicTestStages, placementNext, placementResult, type PlacementAnswer } from '../src/placement.js';
import { judgeStage, planStages, stageBand, stageCountFor, topicLevel, type StageQuestion } from '../src/stage.js';
import { applyStreakDay, canBuyProtection, restoreStreak, type StreakState } from '../src/streak.js';
import { addKstDays } from '../src/time/kst.js';

describe('accountLevel (100 × level)', () => {
  it.each([
    [0, 1, 0, 100],
    [99, 1, 99, 100],
    [100, 2, 0, 200],
    [299, 2, 199, 200],
    [300, 3, 0, 300],
    [600, 4, 0, 400],
    [4950, 10, 450, 1000], // Lv.10 starts at 4500
    [-5, 1, 0, 100],
  ])('%i XP → Lv.%i (+%i / %i)', (xp, level, xpIntoLevel, xpForNextLevel) => {
    expect(accountLevel(xp)).toMatchObject({ level, xpIntoLevel, xpForNextLevel });
  });
});

describe('judgeStage (7/10)', () => {
  it.each([
    // level, correct, highestBefore, stages → cleared, firstClear, highestAfter, levelAfter, completed
    [1, 7, 0, 10, true, true, 1, 2, false],
    [1, 6, 0, 10, false, false, 0, 1, false],
    [5, 10, 7, 10, true, false, 7, 8, false], // replay of a cleared/skipped stage
    [10, 7, 9, 10, true, true, 10, 10, true],
    [10, 3, 9, 10, false, false, 9, 10, false],
  ])('Lv.%i %i/10 (best %i of %i)', (level, correctCount, highestClearedBefore, stageCount, cleared, firstClear, highestClearedAfter, levelAfter, completed) => {
    expect(judgeStage({ level, correctCount, totalCount: 10, highestClearedBefore, stageCount })).toEqual({
      cleared,
      firstClear,
      highestClearedAfter,
      levelAfter,
      completed,
    });
  });

  it.each([
    [0, 10, 1, false],
    [4, 10, 5, false],
    [9, 10, 10, false],
    [10, 10, 10, true],
    [24, 10, 10, true], // old Lv.1–99 progress on a smaller topic
    [10, 30, 11, false], // more questions published → the topic reopens
    [0, 0, 1, false], // no stages yet
  ])('topicLevel(%i of %i) = Lv.%i completed=%s', (h, stages, level, completed) => {
    expect(topicLevel(h, stages)).toEqual({ level, completed });
  });
});

describe('stage pools (10/28)', () => {
  const make = (n: number): StageQuestion[] =>
    Array.from({ length: n }, (_, i) => ({ id: `q${String(i).padStart(3, '0')}`, difficulty: 1 + (i % 9) * 0.5, subfieldId: ['a', 'b', 'c'][Math.floor(i / 9) % 3]! }));

  it.each([
    [0, 0],
    [9, 0],
    [10, 1],
    [29, 1],
    [30, 2],
    [150, 10],
    [450, 30],
  ])('%i published → %i stages', (n, stages) => {
    expect(stageCountFor(n)).toBe(stages);
    expect(planStages(make(n)).stageCount).toBe(stages);
  });

  it('uses every question once, 15–29 per stage, easiest first', () => {
    for (const n of [10, 31, 150, 163, 452]) {
      const plan = planStages(make(n));
      const ids = plan.pools.flat();
      expect(new Set(ids).size).toBe(n);
      for (const pool of plan.pools) expect(pool.length).toBeGreaterThanOrEqual(Math.min(n, 15));
      for (const pool of plan.pools) expect(pool.length).toBeLessThan(n >= 15 ? 30 : n + 1);
      for (let k = 1; k < plan.stageCount; k++) expect(plan.ranges[k]!.minDifficulty).toBeGreaterThanOrEqual(plan.ranges[k - 1]!.maxDifficulty);
    }
  });

  it('is deterministic and independent of input order; subfields take turns within a difficulty', () => {
    const qs = make(150);
    const a = planStages(qs);
    expect(planStages([...qs].reverse())).toEqual(a);
    const subs = a.pools[0]!.slice(0, 6).map((id) => qs.find((q) => q.id === id)!.subfieldId);
    expect(new Set(subs.slice(0, 3)).size).toBe(3);
  });

  it('stageBand spans the stages just below to just above the level, flat weights', () => {
    const plan = { stageCount: 4, pools: [[], [], [], []], ranges: [
      { minDifficulty: 1, maxDifficulty: 1.5 },
      { minDifficulty: 1.5, maxDifficulty: 2 },
      { minDifficulty: 2.5, maxDifficulty: 3 },
      { minDifficulty: 4, maxDifficulty: 5 },
    ] };
    expect(stageBand(plan, 1)).toMatchObject({ minDifficulty: 1, maxDifficulty: 2 });
    const b = stageBand(plan, 3);
    expect([b.minDifficulty, b.maxDifficulty]).toEqual([1.5, 5]);
    expect(b.weights.map((w) => w.difficulty)).toEqual([1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
    expect(b.weights.reduce((a, w) => a + w.weight, 0)).toBeCloseTo(1, 12);
    expect(stageBand({ stageCount: 0, pools: [], ranges: [] }, 1)).toMatchObject({ minDifficulty: 1, maxDifficulty: 5 });
  });
});

describe('placement', () => {
  const run = (answers: boolean[]): PlacementAnswer[] => {
    const h: PlacementAnswer[] = [];
    for (const correct of answers) {
      const step = placementNext(h);
      if (step.done) throw new Error('done early');
      h.push({ difficulty: step.nextDifficulty, correct });
    }
    return h;
  };

  it('starts at ★2.5 and moves ±0.5, clamped to ★1–★5', () => {
    expect(placementNext([])).toEqual({ done: false, index: 0, nextDifficulty: 2.5 });
    expect(run(Array(15).fill(true)).map((a) => a.difficulty)).toEqual([2.5, 3, 3.5, 4, 4.5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
    expect(run(Array(15).fill(false)).map((a) => a.difficulty).slice(0, 5)).toEqual([2.5, 2, 1.5, 1, 1]);
    expect(placementNext(run(Array(15).fill(true)))).toEqual({ done: true });
  });

  const last5 = (ds: number[]): PlacementAnswer[] => [
    ...Array.from({ length: 10 }, () => ({ difficulty: 2.5, correct: true })),
    ...ds.map((difficulty) => ({ difficulty, correct: true })),
  ];

  // 12 stages: ★1–1.5, ★1.5–2, ★2, ★2–2.5, ★2.5–3, ★3, ★3–3.5, ★3.5–4, ★4, ★4–4.5, ★4.5, ★4.5–5
  const plan = {
    stageCount: 12,
    ranges: [[1, 1.5], [1.5, 2], [2, 2], [2, 2.5], [2.5, 3], [3, 3], [3, 3.5], [3.5, 4], [4, 4], [4, 4.5], [4.5, 4.5], [4.5, 5]].map(
      ([minDifficulty, maxDifficulty]) => ({ minDifficulty: minDifficulty!, maxDifficulty: maxDifficulty! }),
    ),
  };

  it.each([
    [[1, 1, 1, 1, 1], 1, 1, []],
    [[1.5, 1.5, 1.5, 1.5, 1.5], 1.5, 1, []],
    [[2, 2, 2, 2, 2], 2, 2, [1]],
    [[2, 2.5, 2, 2.5, 2], 2, 2, [1]], // mean 2.2 → floored to 2
    [[2.5, 2.5, 2.5, 2.5, 2.5], 2.5, 4, [1]],
    [[3, 3.5, 3, 3.5, 3], 3, 5, [1]], // 3.2 → 3
    [[3.5, 3.5, 3.5, 3.5, 3.5], 3.5, 7, [5, 1]],
    [[4.5, 4.5, 4.5, 4.5, 4.5], 4.5, 10, [5, 1]],
    [[5, 5, 5, 5, 5], 5, 12, [10, 5, 1]],
  ])('last 5 %j → avg ★%s → Lv.%i', (ds, averageDifficulty, recommendedLevel, lowerOptions) => {
    expect(placementResult(last5(ds), plan)).toEqual({ averageDifficulty, recommendedLevel, lowerOptions });
  });

  it('a topic without stages recommends Lv.1', () => {
    expect(placementResult(last5([5, 5, 5, 5, 5]), { stageCount: 0, ranges: [] }).recommendedLevel).toBe(1);
  });

  it('basic-test checkpoints every 5 stages; a test draws from the 5 stages below', () => {
    expect(basicTestCheckpoints(4)).toEqual([]);
    expect(basicTestCheckpoints(10)).toEqual([5, 10]);
    expect(basicTestCheckpoints(31)).toEqual([5, 10, 15, 20, 25, 30]);
    expect(basicTestStages(5)).toEqual([1, 2, 3, 4]);
    expect(basicTestStages(10)).toEqual([5, 6, 7, 8, 9]);
  });

  it('rejects an unfinished test', () => {
    expect(() => placementResult(last5([1, 1]).slice(0, 14), plan)).toThrow(RangeError);
  });

  it.each([
    [10, 8, 0, true, 9],
    [10, 7, 0, false, 0],
    [30, 10, 12, true, 29],
    [30, 8, 40, true, 40],
    [50, 2, 12, false, 12],
  ])('basic test Lv.%i %i/10 (best %i) → passed=%s best=%i', (checkpointLevel, correctCount, highestClearedBefore, passed, highestClearedAfter) => {
    expect(basicTestPass({ checkpointLevel, correctCount, totalCount: 10, highestClearedBefore })).toEqual({ passed, highestClearedAfter });
  });
});

describe('streak', () => {
  const fresh: StreakState = { current: 0, longest: 0, lastCountedDay: null, runStartDay: null, judgedThrough: null, broken: null };
  const D0 = '2026-10-01';

  const play = (pattern: string, protections: number[] = []) => {
    let state = fresh;
    const events = [];
    for (let i = 0; i < pattern.length; i++) {
      const r = applyStreakDay(state, { day: addKstDays(D0, i), active: pattern[i] === 'x', protectionsAtBoundary: protections[i] ?? 0 });
      state = r.state;
      events.push(...r.events);
    }
    return { state, events };
  };

  it.each([
    [3, 10],
    [7, 30],
    [14, 50],
    [30, 100],
  ])('milestone at %i days pays %i cheese once', (days, cheese) => {
    const { events } = play('x'.repeat(40));
    const ms = events.filter((e) => e.type === 'milestone');
    expect(ms).toContainEqual({ type: 'milestone', day: addKstDays(D0, days - 1), days, cheese, runStartDay: D0 });
    expect(ms.map((e) => (e.type === 'milestone' ? e.days : 0))).toEqual([3, 7, 14, 30]);
  });

  it('breaks without a protection and records the break', () => {
    const { state, events } = play('xxx.x');
    expect(events).toContainEqual({ type: 'broken', day: addKstDays(D0, 3), lostLength: 3 });
    expect(state).toMatchObject({ current: 1, longest: 3, runStartDay: addKstDays(D0, 4) });
    expect(state.broken).toEqual({ missedDay: addKstDays(D0, 3), lostLength: 3, runStartDay: D0 });
  });

  it('uses a protection held at the 00:00 boundary (streak kept, not incremented)', () => {
    const { state, events } = play('xx.x', [0, 0, 1, 0]);
    expect(events).toContainEqual({ type: 'protection_used', day: addKstDays(D0, 2) });
    expect(state).toMatchObject({ current: 3, runStartDay: D0, broken: null });
  });

  it('a protection bought after the boundary is not retroactive', () => {
    // Held 0 at 00:00 after day 2 (purchase happened later on day 3) → broken.
    const { events } = play('xx.x', [0, 0, 0, 1]);
    expect(events.some((e) => e.type === 'broken')).toBe(true);
  });

  it('inactive days with no streak are no-ops; re-judging a day is idempotent', () => {
    const r1 = applyStreakDay(fresh, { day: D0, active: false, protectionsAtBoundary: 1 });
    expect(r1.events).toEqual([]);
    const r2 = applyStreakDay(r1.state, { day: D0, active: true, protectionsAtBoundary: 0 });
    expect(r2).toEqual({ state: r1.state, events: [] });
  });

  it.each([
    [{ held: 0, cheese: 50 }, { ok: true, price: 50 }],
    [{ held: 1, cheese: 500 }, { ok: true, price: 50 }],
    [{ held: 2, cheese: 500 }, { ok: false, reason: 'MAX_HELD' }],
    [{ held: 0, cheese: 49 }, { ok: false, reason: 'INSUFFICIENT_CHEESE' }],
  ])('canBuyProtection(%j)', (input, expected) => {
    expect(canBuyProtection(input)).toEqual(expected);
  });

  it.each([
    ['restore day after the miss', 1, 100, true, undefined],
    ['same day as the miss', 0, 100, false, 'WINDOW_EXPIRED'],
    ['two days later', 2, 500, false, 'WINDOW_EXPIRED'],
    ['not enough cheese', 1, 99, false, 'INSUFFICIENT_CHEESE'],
  ])('restoreStreak: %s', (_n, offset, cheese, ok, reason) => {
    const { state } = play('xxxxx.');
    const missed = addKstDays(D0, 5);
    const r = restoreStreak(state, { today: addKstDays(missed, offset), cheese });
    expect(r.ok).toBe(ok);
    if (r.ok) {
      expect(r.cost).toBe(100);
      expect(r.state).toMatchObject({ current: 5, runStartDay: D0, broken: null });
    } else {
      expect(r.reason).toBe(reason);
    }
  });

  it('restore keeps a day already counted on the restore day and the original run', () => {
    const { state } = play('xxxxx.x');
    const r = restoreStreak(state, { today: addKstDays(D0, 6), cheese: 100 });
    expect(r.ok && r.state).toMatchObject({ current: 6, longest: 6, runStartDay: D0 });
    expect(restoreStreak(fresh, { today: D0, cheese: 1000 })).toEqual({ ok: false, reason: 'NOT_BROKEN' });
  });
});

describe('recommendDifficulty (calibration, ≥ 30 solves)', () => {
  it.each([
    [29, 29, null],
    [0, 0, null],
    [30, 30, 1],
    [30, 27, 1], // 0.9
    [30, 26, 1.5],
    [30, 21, 2], // 0.7
    [30, 15, 3], // 0.5
    [30, 9, 4], // 0.3
    [30, 6, 4.5], // 0.2
    [30, 0, 5],
  ])('%i solves, %i correct → %s', (solveCount, correctCount, expected) => {
    expect(recommendDifficulty({ solveCount, correctCount })).toBe(expected);
  });
});
