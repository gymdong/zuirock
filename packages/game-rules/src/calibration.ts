import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

const EPS = 1e-9;

/**
 * Recommended difficulty from observed correctness (AC-C7): null below 30 solves; otherwise the
 * first `calibration.table` row whose minCorrectRate ≤ correctCount / solveCount. Shown to admins
 * only; applied after admin approval (no automatic change).
 */
export function recommendDifficulty(
  input: { solveCount: number; correctCount: number },
  cfg: GrowthConfig = DEFAULT_CONFIG,
): number | null {
  const { solveCount, correctCount } = input;
  if (solveCount < cfg.calibration.minSolves || solveCount <= 0) return null;
  const rate = correctCount / solveCount;
  const row = cfg.calibration.table.find((r) => r.minCorrectRate <= rate + EPS);
  return (row ?? cfg.calibration.table[cfg.calibration.table.length - 1])?.difficulty ?? null;
}
