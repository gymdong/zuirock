import { readFileSync } from 'node:fs';
import { DEFAULT_CONFIG, resolveConfig, type GrowthConfig } from '@zuirock/game-rules';

export const GROWTH_CONFIG = Symbol('GrowthConfig');

/** Defaults from @zuirock/game-rules overridden by apps/server/config/growth.json (plan §1 invariant 2). */
export function loadGrowthConfig(): GrowthConfig {
  try {
    const raw = readFileSync(new URL('../../config/growth.json', import.meta.url), 'utf8');
    return resolveConfig(JSON.parse(raw));
  } catch {
    return DEFAULT_CONFIG;
  }
}
