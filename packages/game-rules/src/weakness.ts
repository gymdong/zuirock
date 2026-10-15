import type { TopicId, WeaknessItemDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';
import type { TopicWrongRate } from './selection.js';
import type { EpochMs, SolveFact } from './types.js';

/**
 * Topic wrong rates over the last 30 days (D6-5): solves with answeredAt in (now − 30 d, now].
 * One row per topic in `topicIds` (0 solves → wrongRate 0), sorted by wrongRate desc, then topic order.
 * The first `weakTopic.count` (2) rows with solves > 0 are the "취약 주제" (composite weighting, XP +50%).
 */
export function topicWrongRates(
  solves: readonly Pick<SolveFact, 'topicId' | 'correct' | 'answeredAt'>[],
  topicIds: readonly TopicId[],
  now: EpochMs,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): TopicWrongRate[] {
  throw new NotImplementedError('topicWrongRates');
}

/**
 * "약점 3가지" (AC-D3): subfields with ≥ 5 solves in `solves` (the caller passes the current KST
 * week), ranked by wrong rate desc, then solves desc, then average response time desc; top 3.
 * `reason` is one line built from wrong rate, average response time and wrong-note count.
 */
export function rankWeakness(
  solves: readonly SolveFact[],
  wrongNoteCountBySubfield: Readonly<Record<string, number>>,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): WeaknessItemDto[] {
  throw new NotImplementedError('rankWeakness');
}
