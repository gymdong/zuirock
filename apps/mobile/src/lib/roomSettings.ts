import type { TopicDto, TopicId } from '@zuirock/shared';

/** Topics that have published questions (TopicDto.available), in server order. */
export function availableTopicIds(topics: readonly Pick<TopicDto, 'id' | 'available'>[]): TopicId[] {
  return topics.filter((t) => t.available).map((t) => t.id);
}

/**
 * Keep only available topics (deduplicated, original order). An empty result falls back to every
 * available topic so a stale default never leaves the user with an invisible, unsendable choice.
 */
export function sanitizeTopicIds(selected: readonly TopicId[], available: readonly TopicId[]): TopicId[] {
  const ok = new Set(available);
  const kept = [...new Set(selected)].filter((id) => ok.has(id));
  return kept.length > 0 ? kept : [...available];
}
