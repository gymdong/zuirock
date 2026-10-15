import type { QuestionType, RoomSettings, TopicId } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';
import type { EpochMs } from './types.js';

export type RoomSettingsError =
  | 'TOPICS_EMPTY'
  | 'TOPIC_UNAVAILABLE'
  | 'TYPES_EMPTY'
  | 'QUESTION_COUNT_OUT_OF_RANGE'
  | 'MIN_DIFFICULTY_INVALID'
  | 'TIME_LIMIT_INVALID'
  | 'CHOSUNG_REVEAL_INVALID'
  | 'CHOSUNG_REVEAL_NOT_BEFORE_LIMIT';

export type RoomSettingsValidation = { ok: true } | { ok: false; errors: RoomSettingsError[] };

/**
 * Host settings check (spec 방장 설정, AC-M5 reveal rule):
 * ≥ 1 topic, all in `availableTopicIds`; ≥ 1 type; question count 5–100 (integer);
 * min difficulty 1–5 in 0.5 steps; time limit ∈ {30, 45, 60} s; chosung reveal ∈ {30, 45, null}
 * and, when not null, strictly less than the time limit (e.g. 30 s limit + 30 s reveal is rejected).
 * Duplicate topics/types are rejected as invalid.
 */
export function validateRoomSettings(
  settings: RoomSettings,
  availableTopicIds: readonly TopicId[],
  cfg: GrowthConfig = DEFAULT_CONFIG,
): RoomSettingsValidation {
  throw new NotImplementedError('validateRoomSettings');
}

export interface ParticipantQuestionState {
  participantId: string;
  connected: boolean;
  /** mcq/ox: submitted once. chosung: unused. */
  submitted: boolean;
  /** chosung: answered correctly. */
  solved: boolean;
  /** chosung: pressed 포기. */
  gaveUp: boolean;
}

export interface QuestionCompleteInput {
  questionType: QuestionType;
  participants: readonly ParticipantQuestionState[];
  now: EpochMs;
  deadlineAt: EpochMs;
}

/**
 * Whether the current battle question closes now (AC-M7):
 * true when now ≥ deadlineAt, or when every *connected* participant is done —
 * mcq/ox: submitted; chosung: solved or gave up (wrong/near attempts do not count as done).
 * Disconnected participants are ignored. With zero connected participants only the deadline closes it.
 */
export function isQuestionComplete(input: QuestionCompleteInput): boolean {
  throw new NotImplementedError('isQuestionComplete');
}

export type NicknameValidation =
  | { ok: true; nickname: string }
  | { ok: false; reason: 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARS' };

/**
 * Guest nickname (spec 입장): trimmed, 2–10 characters (code points). Control characters and
 * line breaks are invalid. Returns the trimmed nickname.
 */
export function validateGuestNickname(raw: string, cfg: GrowthConfig = DEFAULT_CONFIG): NicknameValidation {
  throw new NotImplementedError('validateGuestNickname');
}

/**
 * Same-room nickname collision (AC-M3): returns `nickname` if unused, otherwise appends the smallest
 * integer ≥ 2 that makes it unique ("쥐돌이" → "쥐돌이2" → "쥐돌이3"). Comparison is exact.
 */
export function dedupeNickname(nickname: string, taken: readonly string[]): string {
  throw new NotImplementedError('dedupeNickname');
}
