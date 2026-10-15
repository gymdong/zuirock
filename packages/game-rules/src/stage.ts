import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

const DIFFICULTY_STEP = 0.5;
/** How strongly the band ends are favoured (0 = flat, < 1 keeps every weight positive). */
const BAND_TILT = 0.8;

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
  const cleared = input.correctCount >= cfg.stage.clearCorrect;
  const firstClear = cleared && input.level > input.highestClearedBefore;
  const highestClearedAfter = firstClear ? input.level : input.highestClearedBefore;
  const { level: levelAfter, completed } = topicLevel(highestClearedAfter, cfg);
  return { cleared, firstClear, highestClearedAfter, levelAfter, completed };
}

/** Topic level = highest cleared stage + 1 (1–99); clearing 99 marks the topic completed. */
export function topicLevel(
  highestClearedStage: number,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): { level: number; completed: boolean } {
  const max = cfg.stage.maxLevel;
  const highest = Math.max(0, Math.min(highestClearedStage, max));
  return { level: Math.min(highest + 1, max), completed: highest >= max };
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
  const bands = cfg.stage.bands;
  const lv = Math.max(bands[0]!.fromLevel, Math.min(level, bands[bands.length - 1]!.toLevel));
  const band = bands.find((b) => lv >= b.fromLevel && lv <= b.toLevel) ?? bands[bands.length - 1]!;
  const steps = Math.round((band.maxDifficulty - band.minDifficulty) / DIFFICULTY_STEP);
  const span = band.toLevel - band.fromLevel;
  // Position in the band: −1 at the first level, +1 at the last. The tilt moves weight linearly
  // from the easiest difficulty to the hardest as the level rises.
  const tilt = span > 0 ? ((lv - band.fromLevel) / span) * 2 - 1 : 0;
  const raw = Array.from({ length: steps + 1 }, (_, i) => {
    const centered = steps > 0 ? (i - steps / 2) / (steps / 2) : 0;
    return { difficulty: band.minDifficulty + i * DIFFICULTY_STEP, weight: 1 + BAND_TILT * tilt * centered };
  });
  const sum = raw.reduce((a, r) => a + r.weight, 0);
  return {
    minDifficulty: band.minDifficulty,
    maxDifficulty: band.maxDifficulty,
    weights: raw.map((r) => ({ difficulty: r.difficulty, weight: r.weight / sum })),
  };
}
