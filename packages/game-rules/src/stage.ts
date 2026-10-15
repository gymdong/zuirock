import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';

export interface StageJudgeInput {
  /** The stage (= topic level) that was played. */
  level: number;
  correctCount: number;
  totalCount: number;
  /** Highest stage cleared before this attempt (0 = none), including placement skips. */
  highestClearedBefore: number;
}

export interface StageJudgement {
  /** ≥ 7 of 10 correct (AC-S1). */
  cleared: boolean;
  /** Cleared and `level` > highestClearedBefore — the only case that earns XP (AC-G2). */
  firstClear: boolean;
  highestClearedAfter: number;
  /** Topic level after the attempt = highestClearedAfter + 1, max 99. */
  levelAfter: number;
  /** Lv.99 cleared → '완료'. */
  completed: boolean;
}

/** Stage result (spec 솔로: 10-question set, clear at ≥ 7; failure keeps the level). */
export function judgeStage(input: StageJudgeInput, cfg: GrowthConfig = DEFAULT_CONFIG): StageJudgement {
  throw new NotImplementedError('judgeStage');
}

/** Topic level = highest cleared stage + 1 (1–99); clearing 99 marks the topic completed. */
export function topicLevel(
  highestClearedStage: number,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): { level: number; completed: boolean } {
  throw new NotImplementedError('topicLevel');
}

export interface DifficultyBand {
  minDifficulty: number;
  maxDifficulty: number;
  /** Weight per 0.5-step difficulty in [min, max]; sums to 1. */
  weights: Array<{ difficulty: number; weight: number }>;
}

/**
 * Difficulty band for a topic level (AC-S2): Lv.1–19 ★1–2, 20–39 ★2–3, 40–59 ★2.5–3.5,
 * 60–79 ★3.5–4.5, 80–99 ★4–5. Within a band, weight shifts toward the higher difficulties as the
 * level rises (first level of the band favours min, last favours max; monotone in level).
 */
export function difficultyBand(level: number, cfg: GrowthConfig = DEFAULT_CONFIG): DifficultyBand {
  throw new NotImplementedError('difficultyBand');
}
