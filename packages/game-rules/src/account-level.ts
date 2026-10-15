import type { AccountLevelDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';

/**
 * Account level from total XP (AC-G5). Starts at Lv.1; going from level L to L+1 needs
 * 100 × L XP (cumulative: Lv.2 at 100, Lv.3 at 300, Lv.4 at 600 …). No maximum level.
 */
export function accountLevel(totalXp: number, cfg: GrowthConfig = DEFAULT_CONFIG): AccountLevelDto {
  throw new NotImplementedError('accountLevel');
}
