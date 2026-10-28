import { describe, expect, it } from 'vitest';
import type { ChestReward, RoomSettings } from '@zuirock/shared';
import { chestTierForLevel, chosungFirstChar, pickRemovedChoice, rollChest, shopCatalog } from '../src/chest.js';
import { CONFIG_VERSION, DEFAULT_CONFIG } from '../src/config/defaults.js';
import { allowedChosungRevealOptions, chosungRevealElapsedSec, validateRoomSettings } from '../src/room-rules.js';
import { isBeforeChosungReveal, scoreAnswer } from '../src/scoring.js';

/** Seeded mulberry32 in [0, 1). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Replays fixed values, for exact branch checks. */
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

const settings: RoomSettings = {
  topicIds: ['science'],
  types: ['chosung'],
  questionCount: 10,
  minDifficulty: 1,
  timeLimitSec: 60,
  chosungRevealSec: null,
};

describe('min difficulty in 0.5 steps (#6)', () => {
  it.each([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5])('★%s is valid', (minDifficulty) => {
    expect(validateRoomSettings({ ...settings, minDifficulty }, ['science'])).toEqual({ ok: true });
  });
  it.each([0.5, 1.25, 2.3, 5.5, Number.NaN])('★%s is invalid', (minDifficulty) => {
    expect(validateRoomSettings({ ...settings, minDifficulty }, ['science'])).toEqual({ ok: false, errors: ['MIN_DIFFICULTY_INVALID'] });
  });
});

describe('chosung reveal = remaining seconds (D-R2-1)', () => {
  it.each([
    [60, 45, 15],
    [60, 30, 30],
    [60, 15, 45],
    [45, 30, 15],
    [30, 15, 15],
    [30, 1, 29],
    [60, null, null],
  ])('limit %i s, reveal at %s s remaining → %s s elapsed', (limit, n, elapsed) => {
    expect(chosungRevealElapsedSec(limit, n)).toBe(elapsed);
  });

  it.each([
    [60, [45, 30, 15, null]],
    [45, [30, 15, null]],
    [30, [15, null]],
    [15, [null]],
  ])('allowed options for %i s', (limit, options) => {
    expect(allowedChosungRevealOptions(limit)).toEqual(options);
  });

  it.each([
    // elapsedMs, limit, N, beforeReveal
    [14_999, 60, 45, true],
    [15_000, 60, 45, false], // revealed exactly at 15 s elapsed
    [44_999, 60, 15, true],
    [45_000, 60, 15, false],
    [28_999, 30, 1, true],
    [29_000, 30, 1, false],
    [59_999, 60, null, true], // 힌트 없음: always before (D6-1)
  ])('answer at %i ms (limit %i s, N=%s) → beforeReveal %s', (elapsedMs, timeLimitSec, chosungRevealSec, expected) => {
    expect(isBeforeChosungReveal({ elapsedMs, timeLimitSec, chosungRevealSec })).toBe(expected);
  });

  it('feeds the +30 bonus: 60 s limit, N=45, correct at 10 s vs 20 s', () => {
    const score = (elapsedMs: number) =>
      scoreAnswer({
        questionType: 'chosung',
        correct: true,
        timeLimitMs: 60_000,
        remainingMs: 60_000 - elapsedMs,
        beforeReveal: isBeforeChosungReveal({ elapsedMs, timeLimitSec: 60, chosungRevealSec: 45 }),
      });
    expect(score(10_000)).toMatchObject({ chosungBonus: 30, total: 100 + 41 + 30 });
    expect(score(20_000)).toMatchObject({ chosungBonus: 0, total: 100 + 33 });
  });
});

describe('chests (#3)', () => {
  it.each([
    [1, 'normal'],
    [4, 'normal'],
    [5, 'good'],
    [6, 'normal'],
    [10, 'good'],
    [99, 'normal'],
    [95, 'good'],
    [0, 'normal'],
  ] as const)('stage Lv.%i → %s', (level, tier) => {
    expect(chestTierForLevel(level)).toBe(tier);
  });

  it.each([
    // rng values, rewards
    [[0, 0], [{ type: 'cheese', amount: 5 }]],
    [[0.69, 0.999], [{ type: 'cheese', amount: 15 }]],
    [[0.7], [{ type: 'item', kind: 'chosung_first', quantity: 1 }]],
    [[0.89], [{ type: 'item', kind: 'chosung_first', quantity: 1 }]],
    [[0.9], [{ type: 'item', kind: 'remove_wrong_choice', quantity: 1 }]],
  ] as const)('normal chest with rng %j', (values, rewards) => {
    expect(rollChest('normal', fixed(...values), { protection: 0 })).toEqual(rewards);
  });

  it.each([
    // rng: cheese, item?, (item kind), protection?
    [[0, 0.5, 0.1], 0, [{ type: 'cheese', amount: 20 }]],
    [[0.999, 0.49, 0.2, 0.5], 0, [{ type: 'cheese', amount: 50 }, { type: 'item', kind: 'chosung_first', quantity: 1 }]],
    [[0.5, 0.1, 0.5, 0.09], 0, [{ type: 'cheese', amount: 35 }, { type: 'item', kind: 'remove_wrong_choice', quantity: 1 }, { type: 'protection' }]],
    [[0, 0.9, 0.05], 1, [{ type: 'cheese', amount: 20 }, { type: 'protection' }]],
    [[0, 0.9, 0.05], 2, [{ type: 'cheese', amount: 20 }, { type: 'cheese', amount: 30 }]], // protection cap → 30 cheese
  ] as const)('good chest with rng %j, holding %i protections', (values, protection, rewards) => {
    expect(rollChest('good', fixed(...values), { protection })).toEqual(rewards);
  });

  const N = 20_000;
  const tally = (tier: 'normal' | 'good', protection: number) => {
    const rng = seeded(20261018);
    const all: ChestReward[][] = Array.from({ length: N }, () => rollChest(tier, rng, { protection }));
    return all;
  };

  it('normal chest distribution ≈ 70 / 20 / 10 with cheese uniform in 5–15', () => {
    const rolls = tally('normal', 0);
    const flat = rolls.map((r) => {
      expect(r).toHaveLength(1);
      return r[0]!;
    });
    const cheese = flat.filter((r) => r.type === 'cheese');
    const first = flat.filter((r) => r.type === 'item' && r.kind === 'chosung_first');
    const remove = flat.filter((r) => r.type === 'item' && r.kind === 'remove_wrong_choice');
    expect(cheese.length / N).toBeCloseTo(0.7, 1);
    expect(Math.abs(cheese.length / N - 0.7)).toBeLessThan(0.015);
    expect(Math.abs(first.length / N - 0.2)).toBeLessThan(0.015);
    expect(Math.abs(remove.length / N - 0.1)).toBeLessThan(0.015);
    const amounts = cheese.map((c) => (c.type === 'cheese' ? c.amount : -1));
    expect(Math.min(...amounts)).toBe(5);
    expect(Math.max(...amounts)).toBe(15);
    for (let v = 5; v <= 15; v++) {
      expect(Math.abs(amounts.filter((a) => a === v).length / amounts.length - 1 / 11)).toBeLessThan(0.015);
    }
  });

  it('good chest distribution: cheese 20–50 always, item ≈ 50% (half each), protection ≈ 10%', () => {
    const rolls = tally('good', 0);
    let items = 0;
    let first = 0;
    let protections = 0;
    for (const r of rolls) {
      const c = r[0]!;
      expect(c.type).toBe('cheese');
      if (c.type === 'cheese') expect(c.amount >= 20 && c.amount <= 50 && Number.isInteger(c.amount)).toBe(true);
      for (const x of r.slice(1)) {
        if (x.type === 'item') {
          items++;
          if (x.kind === 'chosung_first') first++;
        }
        if (x.type === 'protection') protections++;
      }
    }
    expect(Math.abs(items / N - 0.5)).toBeLessThan(0.015);
    expect(Math.abs(first / items - 0.5)).toBeLessThan(0.02);
    expect(Math.abs(protections / N - 0.1)).toBeLessThan(0.01);
  });

  it('at the protection cap the good chest never gives a protection', () => {
    const rolls = tally('good', 2).flat();
    expect(rolls.some((r) => r.type === 'protection')).toBe(false);
    const fallback = rolls.filter((r) => r.type === 'cheese' && r.amount === 30).length;
    expect(fallback).toBeGreaterThan(N * 0.08); // ≈ 10% fallbacks plus the rare natural 30 in 20–50
  });
});

describe('item helpers (D-R2-2)', () => {
  const choices = ['서울', '부산', '대구', '인천'];

  it('pickRemovedChoice never removes the answer and covers every wrong choice', () => {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const removed = pickRemovedChoice(choices, '서울', rng);
      expect(removed).not.toBe('서울');
      expect(choices).toContain(removed);
      seen.add(removed);
    }
    expect([...seen].sort()).toEqual(['대구', '부산', '인천']);
  });

  it.each([
    [0, '부산'],
    [0.999999, '인천'],
  ])('pickRemovedChoice with rng %s → %s', (v, expected) => {
    expect(pickRemovedChoice(choices, '서울', () => v)).toBe(expected);
  });

  it('pickRemovedChoice throws when no wrong choice exists', () => {
    expect(() => pickRemovedChoice(['서울'], '서울', () => 0)).toThrow(RangeError);
  });

  it.each([
    ['세종대왕', '세'],
    ['  광합성', '광'],
    ['', ''],
  ])('chosungFirstChar(%j) = %j', (answer, expected) => {
    expect(chosungFirstChar(answer)).toBe(expected);
  });
});

describe('shop catalog and config (#2)', () => {
  it('lists the three items with config prices and caps', () => {
    expect(shopCatalog().map(({ kind, price, max }) => [kind, price, max])).toEqual([
      ['streak_protection', 50, 2],
      ['chosung_first', 15, 99],
      ['remove_wrong_choice', 15, 99],
    ]);
    for (const item of shopCatalog()) expect(item.name && item.desc).toBeTruthy();
  });

  it('carries the round-2 defaults under a bumped config version', () => {
    expect(CONFIG_VERSION).toBe('2026-10-28.1');
    expect(DEFAULT_CONFIG.room.chosungRevealSec).toEqual([45, 30, 15, null]);
    expect(DEFAULT_CONFIG.chest).toEqual({
      goodEveryLevels: 5,
      normal: { cheeseChance: 0.7, cheese: { min: 5, max: 15 }, chosungFirstChance: 0.2, removeWrongChoiceChance: 0.1 },
      good: { cheese: { min: 20, max: 50 }, itemChance: 0.5, protectionChance: 0.1, protectionFallbackCheese: 30 },
    });
  });
});
