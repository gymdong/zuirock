/**
 * Shared enumerations. String values are the wire format (REST, Socket.IO, DB enums).
 * Topic data itself lives in `content/topics.json`; the constants here mirror it so that
 * clients and the import schema can be typed. Adding a topic with questions needs no code
 * change for availability (AC-C8) — only these literal lists change when a new topic id appears.
 */

export const QUESTION_TYPES = ['chosung', 'mcq', 'ox'] as const;
/** 초성퀴즈 · 객관식(4지선다) · OX */
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** All topic ids from content/topics.json, in display order. */
export const TOPIC_IDS = [
  'general',
  'vocab',
  'history',
  'science',
  'geography',
  'art',
  'economy',
  'philosophy',
  'sports',
] as const;
export type TopicId = (typeof TOPIC_IDS)[number];

/** Topics that have a question bank in the MVP (`mvp: true` in topics.json). */
export const MVP_TOPIC_IDS = ['general', 'vocab', 'history', 'science'] as const;
export type MvpTopicId = (typeof MVP_TOPIC_IDS)[number];

/** Korean topic names as used in question JSON (`topic` field). */
export const TOPIC_NAME_BY_ID = {
  general: '상식',
  vocab: '어휘력',
  history: '역사',
  science: '과학',
  geography: '지리',
  art: '예술',
  economy: '경제',
  philosophy: '철학',
  sports: '스포츠',
} as const satisfies Record<TopicId, string>;
export type TopicName = (typeof TOPIC_NAME_BY_ID)[TopicId];

export const MVP_TOPIC_NAMES = ['상식', '어휘력', '역사', '과학'] as const;
export type MvpTopicName = (typeof MVP_TOPIC_NAMES)[number];

export const TOPIC_ID_BY_NAME: Record<TopicName, TopicId> = Object.fromEntries(
  Object.entries(TOPIC_NAME_BY_ID).map(([id, name]) => [name, id]),
) as Record<TopicName, TopicId>;

/** Fixed subfields per MVP topic (spec: 문제 콘텐츠). */
export const SUBFIELDS_BY_TOPIC = {
  상식: ['생활', '사회', '문화'],
  어휘력: ['맞춤법', '한자어', '순화어'],
  역사: ['한국사', '세계사'],
  과학: ['물리', '화학', '생물', '지구'],
} as const satisfies Record<MvpTopicName, readonly string[]>;

export const SUBFIELD_NAMES = [
  '생활',
  '사회',
  '문화',
  '맞춤법',
  '한자어',
  '순화어',
  '한국사',
  '세계사',
  '물리',
  '화학',
  '생물',
  '지구',
] as const;
export type SubfieldName = (typeof SUBFIELD_NAMES)[number];

/** Difficulty ★1–★5 in 0.5 steps. */
export const DIFFICULTIES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** Question lifecycle. Only `published` questions are served (AC-C3). */
export const QUESTION_STATUSES = ['draft', 'reviewed', 'published', 'suspended'] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

/**
 * Mode recorded on every SolveLog (AC-D1). `diagnostic` is the first-diagnosis set shown
 * when weekly data is insufficient (AC-D4); it grants no XP.
 */
export const SOLVE_MODES = [
  'stage',
  'composite',
  'daily',
  'quest',
  'placement',
  'basic_test',
  'battle',
  'diagnostic',
] as const;
export type SolveMode = (typeof SOLVE_MODES)[number];

/** Solo set kinds recorded in SetAttempt. `stage` rows with `skipped=true` mark placement skips. */
export const SET_KINDS = ['stage', 'composite', 'daily', 'quest', 'placement', 'basic_test', 'diagnostic'] as const;
export type SetKind = (typeof SET_KINDS)[number];

export const SET_ATTEMPT_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
export type SetAttemptStatus = (typeof SET_ATTEMPT_STATUSES)[number];

/** XpLedger.sourceType. Idempotency key = (sourceType, sourceId, userId). */
export const XP_SOURCE_TYPES = ['stage', 'composite', 'daily', 'quest', 'battle'] as const;
export type XpSourceType = (typeof XP_SOURCE_TYPES)[number];

/**
 * CheeseLedger.reason. `protection_use` has delta 0: held protections = purchases − uses up to an
 * instant (judged at 00:00 KST, plan §4.3 LB).
 */
export const CHEESE_REASONS = [
  'streak_milestone',
  'protection_purchase',
  'protection_use',
  'streak_restore',
  'item_purchase',
  'seed_adjust',
  'chest_reward',
] as const;
export type CheeseReason = (typeof CHEESE_REASONS)[number];

/** Live room phase (Redis). */
export const ROOM_PHASES = ['lobby', 'question', 'reveal', 'finished', 'dissolved'] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];

/** Persisted Room record status. */
export const ROOM_STATUSES = ['lobby', 'playing', 'finished', 'dissolved'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const ROOM_TIME_LIMITS_SEC = [30, 45, 60] as const;
export type RoomTimeLimitSec = (typeof ROOM_TIME_LIMITS_SEC)[number];

/** 초성 공개 시점 = 화면의 **남은 시간(초)** 이 N이 될 때(D-R2-1). `null` = 힌트 없음. N < 제한시간. */
export const CHOSUNG_REVEAL_OPTIONS_SEC = [45, 30, 15, null] as const;
export type ChosungRevealSec = (typeof CHOSUNG_REVEAL_OPTIONS_SEC)[number];

export const ITEM_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'accessory'] as const;
/** 모자·상의·하의·신발·소품. The body is a separate base layer, not a slot. */
export type ItemSlot = (typeof ITEM_SLOTS)[number];

export const ITEM_ACQUIRE_KINDS = ['default', 'cheese', 'level'] as const;
export type ItemAcquireKind = (typeof ITEM_ACQUIRE_KINDS)[number];

export const AVATAR_SOURCES = ['social', 'upload', 'character'] as const;
export type AvatarSource = (typeof AVATAR_SOURCES)[number];

/** In login order: Kakao (default), Naver, Google. */
export const OAUTH_PROVIDERS = ['kakao', 'naver', 'google'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const FRIENDSHIP_STATUSES = ['pending', 'accepted'] as const;
export type FriendshipStatus = (typeof FRIENDSHIP_STATUSES)[number];

export const INVITE_STATUSES = ['pending', 'accepted', 'declined', 'expired'] as const;
export type InviteStatus = (typeof INVITE_STATUSES)[number];

export const ISSUE_REPORT_STATUSES = ['open', 'accepted', 'rejected'] as const;
export type IssueReportStatus = (typeof ISSUE_REPORT_STATUSES)[number];

export const WRONG_NOTE_STATUSES = ['open', 'reviewed'] as const;
/** `reviewed` = 복습 완료 (one correct answer in review). */
export type WrongNoteStatus = (typeof WRONG_NOTE_STATUSES)[number];

/** Result of a chosung judgement (AC-C5). `near` is shown only to the submitter. */
export const CHOSUNG_VERDICTS = ['correct', 'near', 'wrong'] as const;
export type ChosungVerdict = (typeof CHOSUNG_VERDICTS)[number];

/** Activity kinds that count toward the daily streak (AC-G6). */
export const STREAK_ACTIVITY_KINDS = ['solo_set', 'battle'] as const;
export type StreakActivityKind = (typeof STREAK_ACTIVITY_KINDS)[number];
