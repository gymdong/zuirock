import type { BattleResultRowDto, BattleResultYouDto, RoomPhase, RoomSettings } from '@zuirock/shared';

/** One seat. Survives reconnects; in a battle a leaver keeps the seat with `left = true` (ranked). */
export interface Seat {
  participantId: string;
  /** `u:<userId>` / `g:<guestId>` (identityKey). */
  ownerKey: string;
  kind: 'user' | 'guest';
  userId: string | null;
  guestId: string | null;
  nickname: string;
  avatarUrl: string | null;
  ready: boolean;
  connected: boolean;
  left: boolean;
  joinedAt: number;
  score: number;
  correctCount: number;
  totalResponseMs: number;
}

/** A participant's state for one question. Missing entry = never submitted (0 points, AC-M8). */
export interface AnswerState {
  submitted: boolean;
  solved: boolean;
  gaveUp: boolean;
  attempts: number;
  correct: boolean;
  score: number;
  /** Server receive time − question start, of the last submission. */
  responseMs: number | null;
  /** chosung only: the correct answer arrived before the reveal (or no reveal). */
  beforeReveal: boolean | null;
  answeredAt: number | null;
}

export interface LiveSession {
  sessionId: string;
  seq: number;
  questionIds: string[];
  memberKey: string;
  index: number;
  startedAt: number;
  deadlineAt: number;
  chosungRevealAt: number | null;
  chosungRevealed: boolean;
  /** Reveal phase end (next question or results), AC-M7. */
  nextAt: number | null;
  /** answers[questionIndex][participantId]. */
  answers: Array<Record<string, AnswerState>>;
}

/** Whole live room, stored as JSON in Redis (questions live in a separate key per session). */
export interface RoomState {
  code: string;
  roomId: string;
  version: number;
  phase: RoomPhase;
  hostParticipantId: string;
  settings: RoomSettings;
  seats: Seat[];
  createdAt: number;
  lobbyExpiresAt: number | null;
  finishedExpiresAt: number | null;
  /** Last session number used for RoomSession.seq. */
  seq: number;
  session: LiveSession | null;
  /** Rematch: avoid these unless nothing else fits (AC-M11). */
  previousQuestionIds: string[];
  results: BattleResultRowDto[] | null;
  resultsRecorded: boolean;
  /** Personal result parts after recording, per participantId. */
  you: Record<string, BattleResultYouDto> | null;
}

export function activeSeats(state: RoomState): Seat[] {
  return state.seats.filter((s) => !s.left);
}
