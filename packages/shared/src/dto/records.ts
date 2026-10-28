import type { TopicId } from '../enums.js';
import type { AvatarDto } from './users.js';

/** Multiplayer record of one member: 1위 = 승, 그 외(도중 퇴장 포함) = 패, 혼자 남은 방은 제외 (10/28). */
export interface MultiRecordDto {
  played: number;
  wins: number;
  losses: number;
  /** wins / played; null before the first game. */
  winRate: number | null;
  /** Questions answered in battles and how many were right. */
  answered: number;
  correct: number;
  /** correct / answered; null before the first answer. */
  correctRate: number | null;
  /** Topic with the highest battle correct rate (≥ 5 answers in it); null until one qualifies. */
  bestTopic: { topicId: TopicId; correctRate: number; answered: number } | null;
}

/** GET /api/rooms/:code/records — lobby/result: member participants' records by participantId. */
export interface RoomRecordsDto {
  records: Record<string, MultiRecordDto>;
}

/** One row of the friend ranking (me + accepted friends). */
export interface RankingEntryDto {
  userId: string;
  nickname: string;
  avatar: AvatarDto;
  level: number;
  isMe: boolean;
  /** Stages cleared, summed over topics (solo ranking). */
  clearedStages: number;
  record: MultiRecordDto;
  /** Place in each ranking; ties share a place. multiRank is null until `minAnswered` battle answers. */
  soloRank: number;
  multiRank: number | null;
}

/** GET /api/rankings/friends — both rankings; the client sorts by `soloRank` / `multiRank`. */
export interface FriendRankingDto {
  entries: RankingEntryDto[];
  /** Battle answers needed to appear in the multi ranking. */
  minAnswered: number;
}
