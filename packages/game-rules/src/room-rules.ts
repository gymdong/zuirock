import { QUESTION_TYPES, type QuestionType, type RoomSettings, type TopicId } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import type { EpochMs } from './types.js';

export type RoomSettingsError =
  | 'TOPICS_EMPTY'
  | 'TOPIC_UNAVAILABLE'
  | 'TYPES_EMPTY'
  | 'QUESTION_COUNT_OUT_OF_RANGE'
  | 'MIN_DIFFICULTY_INVALID'
  | 'TIME_LIMIT_INVALID'
  | 'AVOID_RECENT_INVALID'
  | 'CHOSUNG_REVEAL_INVALID'
  | 'CHOSUNG_REVEAL_NOT_BEFORE_LIMIT';

export type RoomSettingsValidation = { ok: true } | { ok: false; errors: RoomSettingsError[] };

/**
 * Host settings check (spec 방장 설정, AC-M5 reveal rule, feedback round 2):
 * ≥ 1 topic, all in `availableTopicIds`; ≥ 1 type; question count 5–100 (integer);
 * min difficulty 1–5 in 0.5 steps; time limit ∈ {30, 45, 60} s; chosung reveal = null or an integer
 * N of REMAINING seconds with 0 < N < time limit (D-R2-1; N ≥ limit → CHOSUNG_REVEAL_NOT_BEFORE_LIMIT,
 * N ≤ 0 or non-integer → CHOSUNG_REVEAL_INVALID).
 * Duplicate topics/types are rejected as invalid.
 */
export function validateRoomSettings(
  settings: RoomSettings,
  availableTopicIds: readonly TopicId[],
  cfg: GrowthConfig = DEFAULT_CONFIG,
): RoomSettingsValidation {
  const errors: RoomSettingsError[] = [];
  const topics = settings.topicIds ?? [];
  if (topics.length === 0) errors.push('TOPICS_EMPTY');
  else if (new Set(topics).size !== topics.length || topics.some((t) => !availableTopicIds.includes(t))) {
    errors.push('TOPIC_UNAVAILABLE');
  }
  const types = settings.types ?? [];
  if (types.length === 0 || new Set(types).size !== types.length || types.some((t) => !QUESTION_TYPES.includes(t))) {
    errors.push('TYPES_EMPTY');
  }
  const { min, max } = cfg.room.questionCount;
  const n = settings.questionCount;
  if (!Number.isInteger(n) || n < min || n > max) errors.push('QUESTION_COUNT_OUT_OF_RANGE');
  const d = settings.minDifficulty;
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 1 || d > 5 || !Number.isInteger(d * 2)) {
    errors.push('MIN_DIFFICULTY_INVALID');
  }
  const limitOk = cfg.room.timeLimitsSec.includes(settings.timeLimitSec);
  if (!limitOk) errors.push('TIME_LIMIT_INVALID');
  const reveal: number | null = settings.chosungRevealSec;
  if (reveal !== null) {
    if (typeof reveal !== 'number' || !Number.isInteger(reveal) || reveal <= 0) errors.push('CHOSUNG_REVEAL_INVALID');
    else if (limitOk && reveal >= settings.timeLimitSec) errors.push('CHOSUNG_REVEAL_NOT_BEFORE_LIMIT');
  }
  if (settings.avoidRecent !== undefined && typeof settings.avoidRecent !== 'boolean') errors.push('AVOID_RECENT_INVALID');
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * Elapsed seconds since the question started at which the chosung is revealed (D-R2-1):
 * `chosungRevealSec` stores the REMAINING time N, so reveal happens at timeLimit − N
 * (60 s limit, N = 45 → 15 s after the start). null (힌트 없음) → null.
 */
export function chosungRevealElapsedSec(timeLimitSec: number, revealRemainingSec: number | null): number | null {
  return revealRemainingSec === null ? null : timeLimitSec - revealRemainingSec;
}

/** Host choices for the chosung reveal: the configured remaining-time options below the limit, then null. */
export function allowedChosungRevealOptions(timeLimitSec: number, cfg: GrowthConfig = DEFAULT_CONFIG): (number | null)[] {
  return [...cfg.room.chosungRevealSec.filter((n): n is number => n !== null && n > 0 && n < timeLimitSec), null];
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
  if (input.now >= input.deadlineAt) return true;
  const connected = input.participants.filter((p) => p.connected);
  if (connected.length === 0) return false;
  return connected.every((p) => (input.questionType === 'chosung' ? p.solved || p.gaveUp : p.submitted));
}

export type NicknameValidation =
  | { ok: true; nickname: string }
  | { ok: false; reason: 'TOO_SHORT' | 'TOO_LONG' | 'INVALID_CHARS' };

/**
 * Guest nickname (spec 입장): trimmed, 2–10 characters (code points). Control characters and
 * line breaks are invalid. Returns the trimmed nickname.
 */
export function validateGuestNickname(raw: string, cfg: GrowthConfig = DEFAULT_CONFIG): NicknameValidation {
  const nickname = raw.trim();
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(nickname)) return { ok: false, reason: 'INVALID_CHARS' };
  const length = [...nickname].length;
  if (length < cfg.nickname.guestMin) return { ok: false, reason: 'TOO_SHORT' };
  if (length > cfg.nickname.guestMax) return { ok: false, reason: 'TOO_LONG' };
  return { ok: true, nickname };
}

/**
 * Same-room nickname collision (AC-M3): returns `nickname` if unused, otherwise appends the smallest
 * integer ≥ 2 that makes it unique ("쥐돌이" → "쥐돌이2" → "쥐돌이3"). Comparison is exact.
 */
export function dedupeNickname(nickname: string, taken: readonly string[]): string {
  const used = new Set(taken);
  if (!used.has(nickname)) return nickname;
  for (let i = 2; ; i++) {
    const candidate = `${nickname}${i}`;
    if (!used.has(candidate)) return candidate;
  }
}
