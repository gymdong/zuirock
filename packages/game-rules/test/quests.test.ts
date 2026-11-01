import { describe, expect, it } from 'vitest';
import { rollChest } from '../src/chest.js';
import { ALL_CLEAR_QUEST_ID, dailyQuestDefs, questKey, questStatus } from '../src/quests.js';

const fixed = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

describe('daily quests', () => {
  it('defaults: stage set, battle, 20 correct answers', () => {
    expect(dailyQuestDefs().map((d) => [d.id, d.metric, d.target])).toEqual([
      ['stage', 'stage_sets', 1],
      ['battle', 'battles', 1],
      ['correct', 'correct_answers', 20],
    ]);
  });

  it('questStatus clamps progress to the target and marks done at the target', () => {
    const def = dailyQuestDefs()[2]!;
    expect(questStatus(def, 7)).toEqual({ id: 'correct', progress: 7, target: 20, done: false });
    expect(questStatus(def, 20).done).toBe(true);
    expect(questStatus(def, 55)).toMatchObject({ progress: 20, done: true });
    expect(questStatus(def, -3).progress).toBe(0);
  });

  it('claim key is one per user/day/quest', () => {
    expect(questKey('2026-11-01', 'stage')).toBe('2026-11-01:stage');
    expect(questKey('2026-11-01', ALL_CLEAR_QUEST_ID)).toBe('2026-11-01:all');
  });

  it('quest chest: cheese 10–25 always, plus 40% an item and 8% a protection (cheese instead at the cap)', () => {
    // rng order: cheese amount, item chance, [item kind], protection chance
    expect(rollChest('quest', fixed(0, 0.99, 0.99), { protection: 0 })).toEqual([{ type: 'cheese', amount: 10 }]);
    expect(rollChest('quest', fixed(0.999, 0.99, 0.99), { protection: 0 })).toEqual([{ type: 'cheese', amount: 25 }]);
    expect(rollChest('quest', fixed(0, 0.1, 0.1, 0.99), { protection: 0 })).toEqual([
      { type: 'cheese', amount: 10 },
      { type: 'item', kind: 'chosung_first', quantity: 1 },
    ]);
    expect(rollChest('quest', fixed(0, 0.99, 0.01), { protection: 0 }).at(-1)).toEqual({ type: 'protection' });
    expect(rollChest('quest', fixed(0, 0.99, 0.01), { protection: 2 }).at(-1)).toEqual({ type: 'cheese', amount: 20 });
  });

  it('quest chest item kinds: chosung_first 25% / remove_wrong_choice 25% / xp_boost 50% (weights 1:1:2)', () => {
    const item = (kindRoll: number) => rollChest('quest', fixed(0, 0.1, kindRoll, 0.99), { protection: 0 })[1];
    expect(item(0.24)).toEqual({ type: 'item', kind: 'chosung_first', quantity: 1 });
    expect(item(0.25)).toEqual({ type: 'item', kind: 'remove_wrong_choice', quantity: 1 });
    expect(item(0.49)).toEqual({ type: 'item', kind: 'remove_wrong_choice', quantity: 1 });
    expect(item(0.5)).toEqual({ type: 'item', kind: 'xp_boost', quantity: 1 });
    expect(item(0.999)).toEqual({ type: 'item', kind: 'xp_boost', quantity: 1 });
  });

  it('normal chests never give an xp_boost', () => {
    for (let r = 0; r < 1; r += 0.01) {
      expect(rollChest('normal', fixed(r, 0.5), { protection: 0 }).some((x) => x.type === 'item' && x.kind === 'xp_boost')).toBe(false);
    }
  });
});
