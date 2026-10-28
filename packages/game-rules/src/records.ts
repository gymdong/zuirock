import type { MultiRecordDto, TopicId } from '@zuirock/shared';

/** Battle answers a member needs before appearing in the multi ranking (a single lucky game must not top it). */
export const MIN_RANKED_ANSWERS = 10;
/** Battle answers in one topic before it can be the 'best topic'. */
export const MIN_TOPIC_ANSWERS = 5;

export interface MultiAggregate {
  /** Finished battles with 2+ participants. */
  played: number;
  /** Of those, finished in 1st place (shared 1st counts as a win for each). */
  wins: number;
  /** Per topic: battle answers and how many were correct. */
  topics: ReadonlyArray<{ topicId: TopicId; answered: number; correct: number }>;
}

export const EMPTY_MULTI_AGGREGATE: MultiAggregate = { played: 0, wins: 0, topics: [] };

/** Turns raw battle counts into the displayed record (rates, losses, best topic). */
export function multiRecord(agg: MultiAggregate): MultiRecordDto {
  const answered = agg.topics.reduce((s, t) => s + t.answered, 0);
  const correct = agg.topics.reduce((s, t) => s + t.correct, 0);
  let best: MultiRecordDto['bestTopic'] = null;
  for (const t of agg.topics) {
    if (t.answered < MIN_TOPIC_ANSWERS) continue;
    const rate = t.correct / t.answered;
    // Highest rate first; on a tie the topic with more answers (more evidence), then topic id for a stable pick.
    if (!best || rate > best.correctRate || (rate === best.correctRate && (t.answered > best.answered || (t.answered === best.answered && t.topicId < best.topicId)))) {
      best = { topicId: t.topicId, correctRate: rate, answered: t.answered };
    }
  }
  return {
    played: agg.played,
    wins: agg.wins,
    losses: agg.played - agg.wins,
    winRate: agg.played > 0 ? agg.wins / agg.played : null,
    answered,
    correct,
    correctRate: answered > 0 ? correct / answered : null,
    bestTopic: best,
  };
}

/**
 * Competition ranking of `values` (higher is better): ties share a place and the next place skips
 * (1, 2, 2, 4). `null` values are unranked (null place).
 */
export function placeByValue(values: ReadonlyArray<number | null>): Array<number | null> {
  const order = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null).sort((a, b) => b.v - a.v);
  const out: Array<number | null> = values.map(() => null);
  order.forEach((x, idx) => {
    out[x.i] = idx > 0 && order[idx - 1]!.v === x.v ? out[order[idx - 1]!.i]! : idx + 1;
  });
  return out;
}
