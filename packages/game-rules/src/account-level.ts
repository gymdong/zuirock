import type { AccountLevelDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

/**
 * Account level from total XP (AC-G5). Starts at Lv.1; going from level L to L+1 needs
 * 100 × L XP (cumulative: Lv.2 at 100, Lv.3 at 300, Lv.4 at 600 …). No maximum level.
 */
export function accountLevel(totalXp: number, cfg: GrowthConfig = DEFAULT_CONFIG): AccountLevelDto {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let into = xp;
  while (into >= cfg.accountLevel.perLevel * level) {
    into -= cfg.accountLevel.perLevel * level;
    level++;
  }
  return { level, totalXp: xp, xpIntoLevel: into, xpForNextLevel: cfg.accountLevel.perLevel * level };
}
