import { topicWrongRates, type GrowthConfig, type TopicWrongRate } from '@zuirock/game-rules';
import type { TopicId } from '@zuirock/shared';
import type { Tx } from '../../ports/tx.js';

const DAY_MS = 86_400_000;

/**
 * 30-day topic wrong rates (D6-5) for `topicIds` (default: the user's selected topics plus any topic
 * solved in the window), using solves with answeredAt in (before − 30 d, before].
 */
export async function loadTopicWrongRates(
  db: Tx,
  userId: string,
  before: number,
  cfg: GrowthConfig,
  topicIds?: readonly TopicId[],
): Promise<{ rates: TopicWrongRate[]; weak: TopicId[] }> {
  const solves = await db.solveLog.findMany({
    where: { userId, answeredAt: { gt: new Date(before - cfg.weakTopic.windowDays * DAY_MS), lte: new Date(before) } },
    select: { correct: true, answeredAt: true, question: { select: { topicId: true } } },
  });
  let ids = topicIds;
  if (!ids) {
    const selected = await db.userTopic.findMany({ where: { userId }, select: { topicId: true } });
    ids = [...new Set([...selected.map((s) => s.topicId), ...solves.map((s) => s.question.topicId)])] as TopicId[];
  }
  const rates = topicWrongRates(
    solves.map((s) => ({ topicId: s.question.topicId as TopicId, correct: s.correct, answeredAt: s.answeredAt.getTime() })),
    ids,
    before,
    cfg,
  );
  const weak = rates.filter((r) => r.solved > 0).slice(0, cfg.weakTopic.count).map((r) => r.topicId);
  return { rates, weak };
}
