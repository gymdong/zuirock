import { NotImplementedError } from './errors.js';

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
  throw new NotImplementedError('rankPlayers');
}
