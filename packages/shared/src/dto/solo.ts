import type { ChosungVerdict, SetKind, TopicId } from '../enums.js';
import type { IsoDateTime } from './common.js';
import type { XpResultDto } from './growth.js';
import type { QuestionPublicDto, QuestionRevealDto } from './questions.js';

/**
 * POST /api/solo/sets — starts a 10-question solo set (no time limit, AC-S5).
 * - stage: `topicId` (+ level = current topic level)
 * - basic_test: `topicId` + `checkpointLevel` (10..90)
 * - placement: `topicId` (adaptive, questions come one at a time via /next)
 * - composite / daily / diagnostic: no extra fields
 * - quest: `subfieldId` (one of this week's weaknesses)
 */
export interface StartSetRequest {
  kind: SetKind;
  topicId?: TopicId;
  checkpointLevel?: number;
  subfieldId?: string;
}

export interface SetSessionDto {
  setAttemptId: string;
  kind: SetKind;
  topicId: TopicId | null;
  /** Stage level or basic-test checkpoint. */
  level: number | null;
  /** Empty for placement (use POST /api/solo/sets/:id/next). */
  questions: QuestionPublicDto[];
  /** Up to 2 wrong-note review questions mixed into the set (AC-S6). */
  reviewQuestionIds: string[];
  /** Solo sets that already count toward XP elsewhere (e.g. replayed stage) still log solves. */
  xpEligible: boolean;
  startedAt: IsoDateTime;
}

/** POST /api/solo/sets/:id/answers */
export interface SoloSubmitRequest {
  questionId: string;
  answer: string;
  /** Client-measured time on question, for reports only (solo has no timer). */
  responseMs: number;
  /** chosung: hint button pressed before this submission. */
  hintUsed: boolean;
}

export interface SoloSubmitResponse {
  /** mcq/ox: correct | wrong. chosung: correct | near | wrong. */
  verdict: ChosungVerdict;
  /** False while a chosung question can still be retried (wrong/near). */
  final: boolean;
  /** Present when final: answer + explanation shown immediately. */
  reveal?: QuestionRevealDto;
}

/**
 * POST /api/solo/sets/:id/hint — chosung only: the hint button reveals the chosung (AC-S5).
 * The server marks the question as hinted, so the later submission loses the no-hint bonus.
 */
export interface SoloHintRequest {
  questionId: string;
}

export interface SoloHintResponse {
  questionId: string;
  chosung: string;
}

/** POST /api/solo/sets/:id/give-up — chosung only, closes the question as wrong. */
export interface SoloGiveUpResponse {
  reveal: QuestionRevealDto;
}

/** POST /api/solo/sets/:id/next — placement test: next adaptive question or the result. */
export type PlacementNextDto =
  | { done: false; index: number; difficulty: number; question: QuestionPublicDto }
  | { done: true; result: PlacementResultDto };

export interface PlacementResultDto {
  /** Average difficulty of the last 5 questions, floored to 0.5. */
  averageDifficulty: number;
  /** "Lv.N부터 시작할까요?" */
  recommendedLevel: number;
  /** Lower start options if the user says no (lower checkpoints and Lv.1). */
  lowerOptions: number[];
}

/** POST /api/solo/topics/:topicId/start — confirm the start level after placement/basic test or Lv.1. */
export interface ConfirmStartLevelRequest {
  level: number;
  /** The placement or basic-test attempt that justifies the level (absent for Lv.1). */
  setAttemptId?: string;
}

/** POST /api/solo/sets/:id/complete */
export interface SetResultDto {
  setAttemptId: string;
  kind: SetKind;
  correctCount: number;
  totalCount: number;
  /** stage: ≥ 7/10. basic_test: ≥ 8/10. */
  passed: boolean;
  /** stage only. */
  firstClear: boolean;
  /** Topic level after this set (stage/basic_test), else null. */
  topicLevel: number | null;
  xp: XpResultDto;
  /** True when this set counted toward today's streak. */
  streakCounted: boolean;
  /** Number of wrong answers added to the wrong-note. */
  wrongNotesAdded: number;
}

/** GET /api/solo/composite/plan — D6-10 (c) allocation preview. */
export interface CompositePlanDto {
  allocation: Array<{ topicId: TopicId; count: number; wrongRate: number; weak: boolean }>;
  total: number;
}

/** GET /api/solo/daily — 오늘의 3분 지식 status. */
export interface DailySetStatusDto {
  kstDay: string;
  completed: boolean;
  xpGranted: boolean;
}
