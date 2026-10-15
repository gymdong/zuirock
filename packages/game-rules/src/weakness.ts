import type { TopicId, WeaknessItemDto } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

const DAY_MS = 86_400_000;
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
  const from = now - cfg.weakTopic.windowDays * DAY_MS;
  const stats = new Map<TopicId, { solved: number; wrong: number }>(topicIds.map((t) => [t, { solved: 0, wrong: 0 }]));
  for (const s of solves) {
    const st = stats.get(s.topicId);
    if (!st || s.answeredAt <= from || s.answeredAt > now) continue;
    st.solved++;
    if (!s.correct) st.wrong++;
  }
  return topicIds
    .map((topicId, order) => {
      const st = stats.get(topicId)!;
      return { topicId, solved: st.solved, wrongRate: st.solved > 0 ? st.wrong / st.solved : 0, order };
    })
    .sort((a, b) => b.wrongRate - a.wrongRate || a.order - b.order)
    .map(({ topicId, solved, wrongRate }) => ({ topicId, solved, wrongRate }));
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
  const groups = new Map<string, SolveFact[]>();
  for (const s of solves) {
    const list = groups.get(s.subfieldId);
    if (list) list.push(s);
    else groups.set(s.subfieldId, [s]);
  }
  const items: WeaknessItemDto[] = [];
  for (const [subfieldId, list] of groups) {
    if (list.length < cfg.report.weaknessMinSolves) continue;
    const first = list[0]!;
    const wrong = list.filter((s) => !s.correct).length;
    const wrongRate = wrong / list.length;
    const avgResponseMs = Math.round(list.reduce((a, s) => a + s.responseMs, 0) / list.length);
    const wrongNoteCount = wrongNoteCountBySubfield[subfieldId] ?? 0;
    items.push({
      subfieldId,
      subfield: first.subfield,
      topicId: first.topicId,
      solved: list.length,
      wrongRate,
      avgResponseMs,
      wrongNoteCount,
      reason: `오답률 ${Math.round(wrongRate * 100)}% · 평균 ${(avgResponseMs / 1000).toFixed(1)}초 · 오답노트 ${wrongNoteCount}문제`,
    });
  }
  return items
    .sort(
      (a, b) =>
        b.wrongRate - a.wrongRate ||
        b.solved - a.solved ||
        b.avgResponseMs - a.avgResponseMs ||
        (a.subfieldId < b.subfieldId ? -1 : a.subfieldId > b.subfieldId ? 1 : 0),
    )
    .slice(0, cfg.report.weaknessCount);
}
