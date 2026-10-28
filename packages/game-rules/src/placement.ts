import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import type { StagePlan } from './stage.js';

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
  const p = cfg.placement;
  if (history.length >= p.questionCount) return { done: true };
  const last = history[history.length - 1];
  if (!last) return { done: false, index: 0, nextDifficulty: p.startDifficulty };
  const next = last.difficulty + (last.correct ? p.step : -p.step);
  return { done: false, index: history.length, nextDifficulty: Math.max(p.minDifficulty, Math.min(p.maxDifficulty, next)) };
}

export interface PlacementOutcome {
  /** Mean difficulty of the last 5 questions, floored to 0.5 ("중간값은 내림"). */
  averageDifficulty: number;
  /** ≤ ★1.5 → stage 1, else the first stage whose questions reach that difficulty (10/28). */
  recommendedLevel: number;
  /** Options if the user declines: lower basic-test checkpoints and Lv.1, descending. */
  lowerOptions: number[];
}

/** Placement from a complete 15-answer history. Throws RangeError if the test is not finished. */
export function placementResult(
  history: readonly PlacementAnswer[],
  plan: Pick<StagePlan, 'stageCount' | 'ranges'>,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): PlacementOutcome {
  const p = cfg.placement;
  if (history.length < p.questionCount) {
    throw new RangeError(`placement needs ${p.questionCount} answers, got ${history.length}`);
  }
  const last = history.slice(-p.averageOfLast);
  const mean = last.reduce((a, h) => a + h.difficulty, 0) / last.length;
  const averageDifficulty = Math.floor(mean / p.step + 1e-9) * p.step;
  let recommendedLevel = 1;
  if (averageDifficulty > p.minDifficulty + p.step && plan.stageCount > 0) {
    const reach = plan.ranges.findIndex((r) => r.maxDifficulty >= averageDifficulty);
    recommendedLevel = reach === -1 ? plan.stageCount : reach + 1;
  }
  const lowerOptions = basicTestCheckpoints(plan.stageCount, cfg).filter((c) => c < recommendedLevel).sort((a, b) => b - a);
  if (recommendedLevel > 1) lowerOptions.push(1);
  return { averageDifficulty, recommendedLevel, lowerOptions };
}

/** Basic-test checkpoints of a topic: every `basicTest.every` stages up to the last stage (5, 10, …). */
export function basicTestCheckpoints(stageCount: number, cfg: GrowthConfig = DEFAULT_CONFIG): number[] {
  const out: number[] = [];
  for (let c = cfg.basicTest.every; c <= stageCount; c += cfg.basicTest.every) out.push(c);
  return out;
}

/** Stages a checkpoint's basic test draws from: the `every` stages right below it. */
export function basicTestStages(checkpointLevel: number, cfg: GrowthConfig = DEFAULT_CONFIG): number[] {
  const from = Math.max(1, checkpointLevel - cfg.basicTest.every);
  return Array.from({ length: checkpointLevel - from }, (_, i) => from + i);
}

export interface BasicTestInput {
  /** Checkpoint 5, 10, … (`basicTestCheckpoints`). */
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
  const passed = input.correctCount >= cfg.basicTest.passCorrect;
  return {
    passed,
    highestClearedAfter: passed
      ? Math.max(input.highestClearedBefore, input.checkpointLevel - 1)
      : input.highestClearedBefore,
  };
}
