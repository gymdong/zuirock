import type { QuestionType } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

export interface ScoreInput {
  questionType: QuestionType;
  correct: boolean;
  /** Question time limit in ms (30/45/60 s). */
  timeLimitMs: number;
  /** deadline − server receive time, in ms (server clock only). Clamped to [0, timeLimitMs]. */
  remainingMs: number;
  /**
   * chosung only: the correct answer arrived before the chosung reveal. With reveal = '힌트 없음'
   * this is always true (D6-1). Ignored for mcq/ox.
   */
  beforeReveal: boolean;
}

export interface ScoreBreakdown {
  base: number;
  speedBonus: number;
  chosungBonus: number;
  total: number;
}

/**
 * Battle score for one answer (spec 점수, AC-M5).
 * Correct: 100 + floor(remainingMs / timeLimitMs × 50), plus +30 if a chosung question was solved
 * before its reveal (chosung only, D6-1). Wrong or unanswered: 0 (no penalty).
 */
export function scoreAnswer(input: ScoreInput, cfg: GrowthConfig = DEFAULT_CONFIG): ScoreBreakdown {
  if (!input.correct) return { base: 0, speedBonus: 0, chosungBonus: 0, total: 0 };
  const remaining = Math.min(Math.max(input.remainingMs, 0), input.timeLimitMs);
  const ratio = input.timeLimitMs > 0 ? remaining / input.timeLimitMs : 0;
  const base = cfg.score.correct;
  const speedBonus = Math.floor(ratio * cfg.score.speedBonusMax);
  const chosungBonus = input.questionType === 'chosung' && input.beforeReveal ? cfg.score.chosungBeforeReveal : 0;
  return { base, speedBonus, chosungBonus, total: base + speedBonus + chosungBonus };
}
