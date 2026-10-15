import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';

/**
 * Recommended difficulty from observed correctness (AC-C7): null below 30 solves; otherwise the
 * first `calibration.table` row whose minCorrectRate ≤ correctCount / solveCount. Shown to admins
 * only; applied after admin approval (no automatic change).
 */
export function recommendDifficulty(
  input: { solveCount: number; correctCount: number },
  cfg: GrowthConfig = DEFAULT_CONFIG,
): number | null {
  throw new NotImplementedError('recommendDifficulty');
}
