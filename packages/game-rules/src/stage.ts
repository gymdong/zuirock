import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

export interface StageJudgeInput {
  /** The stage (= topic level) that was played. */
  level: number;
  correctCount: number;
  totalCount: number;
  /** Highest stage cleared before this attempt (0 = none), including placement skips. */
  highestClearedBefore: number;
  /** Stages the topic has now (`planStages`). */
  stageCount: number;
}

export interface StageJudgement {
  /** ≥ 7 of 10 correct (AC-S1). */
  cleared: boolean;
  /** Cleared and `level` > highestClearedBefore — the only case that earns XP (AC-G2). */
  firstClear: boolean;
  highestClearedAfter: number;
  /** Topic level after the attempt = highestClearedAfter + 1, at most the last stage. */
  levelAfter: number;
  /** Last stage cleared → '완료' (reopens when new questions add stages). */
  completed: boolean;
}

/** Stage result (spec 솔로: 10-question set, clear at ≥ 7; failure keeps the level). */
export function judgeStage(input: StageJudgeInput, cfg: GrowthConfig = DEFAULT_CONFIG): StageJudgement {
  const cleared = input.correctCount >= cfg.stage.clearCorrect;
  const firstClear = cleared && input.level > input.highestClearedBefore;
  const highestClearedAfter = firstClear ? input.level : input.highestClearedBefore;
  const { level: levelAfter, completed } = topicLevel(highestClearedAfter, input.stageCount);
  return { cleared, firstClear, highestClearedAfter, levelAfter, completed };
}

/**
 * Topic level = highest cleared stage + 1, at most the last stage; clearing the last one marks the
 * topic completed. The stage count follows the published questions, so a completed topic reopens
 * when more questions are published (10/28 스테이지 묶음).
 */
export function topicLevel(highestClearedStage: number, stageCount: number): { level: number; completed: boolean } {
  const last = Math.max(1, stageCount);
  const highest = Math.max(0, highestClearedStage);
  return { level: Math.min(highest + 1, last), completed: stageCount > 0 && highest >= stageCount };
}

export interface DifficultyBand {
  minDifficulty: number;
  maxDifficulty: number;
  /** Weight per 0.5-step difficulty in [min, max]; sums to 1. */
  weights: Array<{ difficulty: number; weight: number }>;
}

export interface StageQuestion {
  id: string;
  difficulty: number;
  subfieldId: string;
}

export interface StagePlan {
  stageCount: number;
  /** Question ids of each stage (index 0 = stage 1): the 10 served are drawn from these. */
  pools: string[][];
  /** Difficulty range of each stage's pool. */
  ranges: Array<{ minDifficulty: number; maxDifficulty: number }>;
}

/** Stages a topic with `published` questions has: one per `poolSize` questions (0 below one set). */
export function stageCountFor(published: number, cfg: GrowthConfig = DEFAULT_CONFIG): number {
  if (published < cfg.stage.size) return 0;
  return Math.max(1, Math.floor(published / cfg.stage.poolSize));
}

/**
 * Stage pools (10/28): a topic's published questions sorted easiest first — within one difficulty
 * the subfields take turns — and cut into `stageCountFor(n)` consecutive pools of ~15 (the
 * remainder is spread, so 15–29 each). Same input → same pools; publishing more questions adds
 * stages at the hard end and shifts nearby boundaries a little.
 */
export function planStages(questions: readonly StageQuestion[], cfg: GrowthConfig = DEFAULT_CONFIG): StagePlan {
  const byDifficulty = new Map<number, Map<string, StageQuestion[]>>();
  for (const q of questions) {
    const subs = byDifficulty.get(q.difficulty) ?? new Map<string, StageQuestion[]>();
    byDifficulty.set(q.difficulty, subs);
    subs.set(q.subfieldId, [...(subs.get(q.subfieldId) ?? []), q]);
  }
  const ordered: StageQuestion[] = [];
  for (const d of [...byDifficulty.keys()].sort((a, b) => a - b)) {
    const lists = [...byDifficulty.get(d)!.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, qs]) => [...qs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) ordered.push(l[i]!);
  }
  const n = ordered.length;
  const stageCount = stageCountFor(n, cfg);
  const pools: StageQuestion[][] = Array.from({ length: stageCount }, (_, k) =>
    ordered.slice(Math.floor((k * n) / stageCount), Math.floor(((k + 1) * n) / stageCount)),
  );
  return {
    stageCount,
    pools: pools.map((p) => p.map((q) => q.id)),
    ranges: pools.map((p) => ({ minDifficulty: p[0]!.difficulty, maxDifficulty: p[p.length - 1]!.difficulty })),
  };
}

const DIFFICULTY_STEP = 0.5;

/**
 * Difficulty band around a topic level for sets that are not stages (composite, 3분 지식, quest,
 * diagnostic): the difficulties of the stages just below to just above the level, all weighted the
 * same. A topic without stages yet uses ★1–5.
 */
export function stageBand(plan: StagePlan, level: number): DifficultyBand {
  const near = plan.ranges.slice(Math.max(0, level - 2), Math.max(0, level + 1));
  const minDifficulty = near.length ? Math.min(...near.map((r) => r.minDifficulty)) : 1;
  const maxDifficulty = near.length ? Math.max(...near.map((r) => r.maxDifficulty)) : 5;
  const steps = Math.round((maxDifficulty - minDifficulty) / DIFFICULTY_STEP) + 1;
  return {
    minDifficulty,
    maxDifficulty,
    weights: Array.from({ length: steps }, (_, i) => ({ difficulty: minDifficulty + i * DIFFICULTY_STEP, weight: 1 / steps })),
  };
}
