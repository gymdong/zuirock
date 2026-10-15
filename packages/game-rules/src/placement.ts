import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';

export interface PlacementAnswer {
  difficulty: number;
  correct: boolean;
}

export type PlacementStep = { done: false; index: number; nextDifficulty: number } | { done: true };

/**
 * Adaptive level test (AC-S3): 15 questions, the first at ★2.5; after a correct answer +0.5★,
 * after a wrong one −0.5★, clamped to ★1–★5. `index` is 0-based for the next question.
 */
export function placementNext(history: readonly PlacementAnswer[], cfg: GrowthConfig = DEFAULT_CONFIG): PlacementStep {
  throw new NotImplementedError('placementNext');
}

export interface PlacementOutcome {
  /** Mean difficulty of the last 5 questions, floored to 0.5 ("중간값은 내림"). */
  averageDifficulty: number;
  /** ≤★1.5→1, ★2→10, ★2.5→20, ★3→40, ★3.5→50, ★4→60, ★4.5→80, ★5→90. */
  recommendedLevel: number;
  /** Options if the user declines: lower basic-test checkpoints and Lv.1, descending. */
  lowerOptions: number[];
}

/** Placement from a complete 15-answer history. Throws RangeError if the test is not finished. */
export function placementResult(history: readonly PlacementAnswer[], cfg: GrowthConfig = DEFAULT_CONFIG): PlacementOutcome {
  throw new NotImplementedError('placementResult');
}

export interface BasicTestInput {
  /** Checkpoint 10, 20, … 90. */
  checkpointLevel: number;
  correctCount: number;
  totalCount: number;
  highestClearedBefore: number;
}

export interface BasicTestOutcome {
  /** ≥ 8 of 10 (AC-S4). */
  passed: boolean;
  /**
   * When passed: stages below the checkpoint count as cleared (no XP on replay) →
   * max(highestClearedBefore, checkpointLevel − 1). When failed: unchanged.
   */
  highestClearedAfter: number;
}

/** Basic test at a checkpoint (AC-S4). Failing keeps progress as is. */
export function basicTestPass(input: BasicTestInput, cfg: GrowthConfig = DEFAULT_CONFIG): BasicTestOutcome {
  throw new NotImplementedError('basicTestPass');
}
