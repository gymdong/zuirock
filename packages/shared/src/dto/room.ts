import type {
  ChosungRevealSec,
  QuestionType,
  RoomPhase,
  RoomTimeLimitSec,
  TopicId,
} from '../enums.js';
import type { EpochMs, IsoDateTime } from './common.js';
import type { XpResultDto } from './growth.js';
import type { QuestionPublicDto, QuestionRevealDto } from './questions.js';

/** Host settings (p9). Validated by `validateRoomSettings` (@zuirock/game-rules). */
export interface RoomSettings {
  /** One or more topics; must be available (have published questions). */
  topicIds: TopicId[];
  /** One or more of chosung/mcq/ox. */
  types: QuestionType[];
  /** 5–100. */
  questionCount: number;
  /** ★N 이상 (1–5, 0.5 step). */
  minDifficulty: number;
  /** 30 / 45 / 60 s per question. */
  timeLimitSec: RoomTimeLimitSec;
  /** 남은 시간 N초일 때 초성 공개(REMAINING seconds, D-R2-1): 45 / 30 / 15, 또는 null(힌트 없음). N < timeLimitSec. */
  chosungRevealSec: ChosungRevealSec;
  /**
   * 최근 푼 문제 덜 나오게: questions any participant solved among their latest solves are drawn
   * with a lower weight (never excluded, so no shortage). Absent = on (default for new rooms).
   */
  avoidRecent?: boolean;
}

/** POST /api/rooms (member). Also creates invites for `inviteFriendIds` (AC-A7). */
export interface CreateRoomRequest {
  settings: RoomSettings;
  inviteFriendIds?: string[];
}

export interface CreateRoomResponse {
  roomId: string;
  /** 4-digit numeric code. */
  code: string;
  /** https://<host>/join/<code> */
  inviteUrl: string;
}

/** GET /api/rooms/:code — join landing lookup (no auth). */
export interface RoomLookupDto {
  code: string;
  phase: RoomPhase;
  /** False when full (8), started, finished or dissolved. */
  joinable: boolean;
  hostNickname: string;
  participantCount: number;
  maxPlayers: number;
}

export interface RoomParticipantDto {
  /** Stable seat id inside the room (survives reconnects). */
  participantId: string;
  kind: 'user' | 'guest';
  userId: string | null;
  nickname: string;
  avatarUrl: string | null;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  /** Left during a battle; still ranked in results. */
  left: boolean;
}

/** The current question as broadcast to everyone (same order for all, AC-M1). */
export interface LiveQuestionDto {
  /** 0-based index. */
  index: number;
  total: number;
  question: QuestionPublicDto;
  /** Server time the question opened. Countdown: remaining = deadlineAt − (serverNow-corrected now). */
  startedAt: EpochMs;
  /** startedAt + timeLimitSec × 1000. */
  deadlineAt: EpochMs;
  /** Per-question limit (30/45/60), for drawing the countdown bar (60→1). Always sent by the server (round 2). */
  timeLimitSec?: number;
  /**
   * chosung only: REMAINING seconds N at which the chosung is shown (D-R2-1) — the hint marker sits at N
   * on the countdown. null when '힌트 없음' or not chosung. Always sent by the server (round 2).
   */
  chosungRevealSec?: number | null;
  /** chosung only: absolute reveal time = startedAt + (timeLimitSec − N) × 1000; null when no reveal. */
  chosungRevealAt: EpochMs | null;
  /** Present once revealed (server time ≥ chosungRevealAt). */
  chosung?: string;
}

export interface ScoreboardEntryDto {
  participantId: string;
  nickname: string;
  score: number;
  correctCount: number;
}

export interface RevealDto {
  index: number;
  reveal: QuestionRevealDto;
  correctParticipantIds: string[];
  scoreboard: ScoreboardEntryDto[];
  /** When the next question (or results) starts: reveal lasts 3 s (AC-M7). */
  nextAt: EpochMs;
}

/** Per-participant result row (p11). Ranking: score → correct count → total response time (AC-M9). */
export interface BattleResultRowDto {
  participantId: string;
  nickname: string;
  kind: 'user' | 'guest';
  rank: number;
  score: number;
  correctCount: number;
  totalResponseMs: number;
  left: boolean;
}

/** Personal part of the result, sent only to that participant. */
export interface BattleResultYouDto {
  participantId: string;
  xp: XpResultDto;
  /** "틀린 N문제는 오답노트에 담았어요" (members). */
  wrongNotesAdded: number;
  /** Guests: show '로그인하고 기록 저장하기'. */
  canSaveByLogin: boolean;
}

/** Your own state for the current question. */
export interface YouQuestionStateDto {
  submitted: boolean;
  solved: boolean;
  gaveUp: boolean;
  /** chosung attempts so far. */
  attempts: number;
}

/** Full room snapshot: reply to room:join / room:resume and `room:state` broadcast. */
export interface RoomSnapshotDto {
  roomId: string;
  /** Current/most recent battle session (null in a fresh lobby). */
  sessionId: string | null;
  code: string;
  phase: RoomPhase;
  /** Monotonic room version (CAS fence); clients drop events with a lower version. */
  version: number;
  hostParticipantId: string;
  settings: RoomSettings;
  participants: RoomParticipantDto[];
  /** Lobby auto-dissolves at this time (30 min). */
  lobbyExpiresAt: EpochMs | null;
  question: LiveQuestionDto | null;
  you: { participantId: string; question: YouQuestionStateDto | null };
  reveal: RevealDto | null;
  results: BattleResultRowDto[] | null;
  serverNow: EpochMs;
}

/** Battle record between two members, for friend profile (p16). */
export interface HeadToHeadDto {
  played: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayedAt: IsoDateTime | null;
}
