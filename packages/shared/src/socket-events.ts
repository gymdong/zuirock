import type { EpochMs } from './dto/common.js';
import type {
  BattleResultRowDto,
  BattleResultYouDto,
  LiveQuestionDto,
  RevealDto,
  RoomParticipantDto,
  RoomSettings,
  RoomSnapshotDto,
} from './dto/room.js';

/**
 * Socket.IO contract for live rooms (server-authoritative, plan §2.3(c), LC).
 *
 * - Namespace `ROOM_NAMESPACE`; handshake `auth: SocketAuth` carries a member JWT or a signed
 *   guest token. Native clients use `transports: ['websocket']`.
 * - Every server event carries the room `version`; clients ignore events older than the last
 *   snapshot and call `room:resume` on reconnect to fill gaps.
 * - Client→server events always take an ack callback returning `Ack<T>`.
 */

export const ROOM_NAMESPACE = '/rooms';

export interface SocketAuth {
  /** Member access token (JWT) or guest token (JWT `typ=guest`). */
  token: string;
}

export type RoomErrorCode =
  | 'UNAUTHORIZED'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ROOM_IN_PROGRESS'
  | 'ROOM_DISSOLVED'
  | 'NOT_IN_ROOM'
  | 'NOT_HOST'
  | 'WRONG_PHASE'
  | 'INVALID_SETTINGS'
  | 'INVALID_NICKNAME'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_ALL_READY'
  | 'NO_QUESTIONS'
  | 'STALE_QUESTION'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export type Ack<T> = { ok: true; data: T } | { ok: false; error: RoomErrorCode; message?: string };
export type AckFn<T> = (res: Ack<T>) => void;

// ---- client → server payloads ----

export interface JoinRoomPayload {
  code: string;
  /** Guests: 2–10 chars; deduplicated with a numeric suffix inside the room (AC-M3). */
  nickname?: string;
  /** Set when joining via an in-app invite. */
  inviteId?: string;
}

export interface ResumeRoomPayload {
  code: string;
  /** Last version the client applied; the server always answers with a full snapshot. */
  lastVersion?: number;
}

export interface ReadyPayload {
  ready: boolean;
}

export interface UpdateSettingsPayload {
  settings: RoomSettings;
}

export interface StartRoomPayload {
  /**
   * Host's consent to start with fewer questions (AC-M2). Must equal the `available` count from a
   * previous `shortage` reply; the server re-checks atomically and replies `shortage` again if the
   * pool changed.
   */
  acceptShortageCount?: number;
}

export type StartRoomResult =
  | { status: 'started'; sessionId: string }
  /** "조건에 맞는 문제가 M개뿐이에요. M문제로 진행할까요?" — shown to the host only. */
  | { status: 'shortage'; available: number; requested: number };

export interface SubmitAnswerPayload {
  /** Index of the question being answered; mismatches return `STALE_QUESTION`. */
  questionIndex: number;
  answer: string;
}

/**
 * Result of a submission, delivered only to the submitter (ack).
 * - `correct` / `wrong`: mcq/ox are final after one submission; chosung `correct` is final.
 * - `near`: chosung containment ("거의 비슷했어요!"), may retry. Never broadcast.
 * - `late`: received after the server deadline; rejected, nothing recorded.
 * - `duplicate`: mcq/ox second submission or chosung after solving/giving up; rejected (AC-M6).
 */
export type SubmitAnswerResult =
  | { status: 'correct'; score: number; final: true }
  | { status: 'wrong'; final: boolean }
  | { status: 'near'; final: false }
  | { status: 'late'; final: true }
  | { status: 'duplicate'; final: true };

export interface GiveUpPayload {
  questionIndex: number;
}

export interface TimePingPayload {
  clientSentAt: number;
}

export interface ClientToServerEvents {
  'room:join': (payload: JoinRoomPayload, ack: AckFn<RoomSnapshotDto>) => void;
  'room:resume': (payload: ResumeRoomPayload, ack: AckFn<RoomSnapshotDto>) => void;
  'room:leave': (payload: Record<string, never>, ack: AckFn<null>) => void;
  'room:ready': (payload: ReadyPayload, ack: AckFn<null>) => void;
  'room:updateSettings': (payload: UpdateSettingsPayload, ack: AckFn<null>) => void;
  'room:start': (payload: StartRoomPayload, ack: AckFn<StartRoomResult>) => void;
  'room:submit': (payload: SubmitAnswerPayload, ack: AckFn<SubmitAnswerResult>) => void;
  /** chosung only: stop trying this question (counts as done for "all submitted"). */
  'room:giveUp': (payload: GiveUpPayload, ack: AckFn<null>) => void;
  /** '한 판 더': back to the lobby with the same code and settings (AC-M11). */
  'room:rematch': (payload: Record<string, never>, ack: AckFn<RoomSnapshotDto>) => void;
  'time:ping': (payload: TimePingPayload, ack: AckFn<{ serverNow: EpochMs }>) => void;
}

// ---- server → client payloads ----

interface Versioned {
  version: number;
  serverNow: EpochMs;
}

export interface ParticipantsEvent extends Versioned {
  hostParticipantId: string;
  participants: RoomParticipantDto[];
}

export interface SettingsEvent extends Versioned {
  settings: RoomSettings;
}

export interface QuestionEvent extends Versioned {
  question: LiveQuestionDto;
}

export interface ChosungRevealEvent extends Versioned {
  questionIndex: number;
  chosung: string;
}

export interface ProgressEvent extends Versioned {
  questionIndex: number;
  /** Participants who are done (mcq/ox submitted, chosung solved or gave up). */
  doneCount: number;
  /** Connected participants considered for "everyone submitted". */
  activeCount: number;
}

export interface RevealEvent extends Versioned {
  reveal: RevealDto;
}

export interface FinishedEvent extends Versioned {
  sessionId: string;
  results: BattleResultRowDto[];
  /** Personalised per socket. */
  you: BattleResultYouDto;
}

export interface DissolvedEvent extends Versioned {
  reason: 'lobby_timeout' | 'empty';
}

export interface ServerToClientEvents {
  'room:state': (snapshot: RoomSnapshotDto) => void;
  'room:participants': (e: ParticipantsEvent) => void;
  'room:settings': (e: SettingsEvent) => void;
  'room:question': (e: QuestionEvent) => void;
  'room:chosungReveal': (e: ChosungRevealEvent) => void;
  'room:progress': (e: ProgressEvent) => void;
  'room:reveal': (e: RevealEvent) => void;
  'room:finished': (e: FinishedEvent) => void;
  'room:dissolved': (e: DissolvedEvent) => void;
  'room:error': (e: { code: RoomErrorCode; message?: string }) => void;
}

export type ClientEventName = keyof ClientToServerEvents;
export type ServerEventName = keyof ServerToClientEvents;
