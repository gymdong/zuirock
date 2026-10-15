
export interface RankInput {
  participantId: string;
  score: number;
  correctCount: number;
  /** Sum of response times of submitted answers (ms). Unanswered questions add nothing. */
  totalResponseMs: number;
}

export interface RankedPlayer extends RankInput {
  /** 1-based. Players equal on all three keys share a rank (competition ranking 1, 1, 3). */
  rank: number;
}

/**
 * Battle ranking (AC-M9): score desc → correct count desc → total response time asc.
 * Players who left mid-battle are still ranked. Output is sorted by rank, then participantId.
 */
export function rankPlayers(players: readonly RankInput[]): RankedPlayer[] {
  const sorted = [...players].sort(
    (a, b) =>
      compareKeys(a, b) || (a.participantId < b.participantId ? -1 : a.participantId > b.participantId ? 1 : 0),
  );
  const out: RankedPlayer[] = [];
  sorted.forEach((p, i) => {
    const prev = out[i - 1];
    const rank = prev && compareKeys(prev, p) === 0 ? prev.rank : i + 1;
    out.push({ ...p, rank });
  });
  return out;
}

function compareKeys(a: RankInput, b: RankInput): number {
  return b.score - a.score || b.correctCount - a.correctCount || a.totalResponseMs - b.totalResponseMs;
}
