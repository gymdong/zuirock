import { describe, expect, it } from 'vitest';
import { CONFIG_VERSION, DEFAULT_CONFIG, resolveConfig } from '../src/config/defaults.js';

describe('config/defaults', () => {
  it('carries the spec numbers', () => {
    const c = DEFAULT_CONFIG;
    expect(c.configVersion).toBe(CONFIG_VERSION);
    expect(c.xp).toMatchObject({ perDifficulty: 10, noHintBonus: 0.2, weakTopicBonus: 0.5, reviewBonus: 0.5, dailyCap: 3000 });
    expect(c.xp.stackWeakTopicAndReview).toBe(false);
    expect(c.xp.sameQuestionDecay.factors).toEqual([1, 0.5, 0]);
    expect(c.xp.rankBonus).toEqual([15, 10, 5]);
    expect(c.xp.rematch).toEqual({ windowMs: 3_600_000, factor: 0.5 });
    expect(c.accountLevel.perLevel).toBe(100);
    expect(c.stage).toMatchObject({ size: 10, clearCorrect: 7, poolSize: 15, reviewMaxPerSet: 2 });
    expect(c.basicTest).toEqual({ every: 5, size: 10, passCorrect: 8 });
    expect(c.basicTest).toMatchObject({ size: 10, passCorrect: 8 });
    expect(c.streak.milestones).toEqual([
      { days: 3, cheese: 10 },
      { days: 7, cheese: 30 },
      { days: 14, cheese: 50 },
      { days: 30, cheese: 100 },
    ]);
    expect(c.streak.protection).toEqual({ price: 50, maxHeld: 2 });
    expect(c.streak.restore.cost).toBe(100);
    expect(c.score).toEqual({ correct: 100, speedBonusMax: 50, chosungBeforeReveal: 30 });
    expect(c.room).toMatchObject({ minPlayers: 2, maxPlayers: 8, codeDigits: 4, revealMs: 3000, lobbyTtlMs: 1_800_000 });
    expect(c.room.questionCount).toEqual({ min: 5, max: 100 });
    expect(c.report).toEqual({ minWeeklySolves: 30, weaknessMinSolves: 5, weaknessCount: 3, mostImprovedMinSolves: 10 });
    expect(c.quest).toMatchObject({ size: 10, passCorrect: 7, xp: 50, xpGrantsPerWeek: 1 });
    expect(c.calibration.minSolves).toBe(30);
    expect(c.issueReport.suspendThreshold).toBe(3);
    expect(c.items).toMatchObject({ cheesePrices: [80, 150], unlockLevel: 20 });
  });

  it('resolveConfig merges objects and replaces arrays without mutating defaults', () => {
    const c = resolveConfig({ configVersion: 'x', xp: { dailyCap: 1000, rankBonus: [30] } });
    expect(c.configVersion).toBe('x');
    expect(c.xp.dailyCap).toBe(1000);
    expect(c.xp.rankBonus).toEqual([30]);
    expect(c.xp.perDifficulty).toBe(10);
    expect(DEFAULT_CONFIG.xp.dailyCap).toBe(3000);
    expect(resolveConfig()).toEqual(DEFAULT_CONFIG);
  });
});
