import { describe, expect, it } from 'vitest';
import * as rules from '../src/index.js';

/** The L0 contract (plan §4.3 LA): every rule function is exported. */
const RULES = [
  'scoreAnswer',
  'rankPlayers',
  'validateRoomSettings',
  'isQuestionComplete',
  'computeXpGrant',
  'computeMergeGrant',
  'judgeStage',
  'topicLevel',
  'difficultyBand',
  'placementNext',
  'placementResult',
  'basicTestPass',
  'selectQuestions',
  'allocateComposite',
  'applyStreakDay',
  'canBuyProtection',
  'restoreStreak',
  'toChosung',
  'normalize',
  'judgeChosung',
  'validateGuestNickname',
  'dedupeNickname',
  'rankWeakness',
  'topicWrongRates',
  'weeklyReport',
  'historySummary',
  'recommendDifficulty',
  'validateImport',
  'accountLevel',
] as const;

describe('game-rules exports', () => {
  it.each(RULES)('%s is a function', (name) => {
    expect(typeof (rules as Record<string, unknown>)[name]).toBe('function');
  });
});
