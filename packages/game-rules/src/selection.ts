import type { QuestionType, RoomSettings, TopicId } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import { NotImplementedError } from './errors.js';
import type { DifficultyBand } from './stage.js';
import type { Rng } from './types.js';

/** A servable question (caller passes only `published` ones, AC-C3). */
export interface CandidateQuestion {
  id: string;
  topicId: TopicId;
  subfieldId: string;
  type: QuestionType;
  difficulty: number;
}

export interface BattleSelectionRequest {
  mode: 'battle';
  pool: readonly CandidateQuestion[];
  settings: Pick<RoomSettings, 'topicIds' | 'types' | 'minDifficulty' | 'questionCount'>;
  /** Rematch: questions of the previous battle in this room, used only if nothing else fits. */
  avoidIds?: readonly string[];
}

export interface SoloSelectionRequest {
  mode: 'solo';
  pool: readonly CandidateQuestion[];
  /** Questions to serve, excluding review questions. */
  count: number;
  band: DifficultyBand;
  /** Questions the owner already answered correctly; served only after unanswered ones. */
  answeredCorrectlyIds: readonly string[];
  /** Open wrong-note questions eligible for review. */
  reviewPool: readonly CandidateQuestion[];
  /** Max review questions mixed in (2, AC-S6). */
  reviewMax: number;
  /** Never serve these (e.g. questions already in this set). */
  excludeIds?: readonly string[];
}

export type SelectionResult =
  | {
      status: 'ok';
      /** Final serving order (review questions included at random positions). */
      questionIds: string[];
      reviewIds: string[];
      /** D6-7 fallback used: none, reused already-correct questions, or widened the band ±0.5★. */
      relaxation: 'none' | 'reused' | 'widened';
    }
  /** Battle only (AC-M2): fewer than requested match; `questionIds` holds all M. Room is not blocked. */
  | { status: 'shortage'; available: number; requested: number; questionIds: string[] }
  /** Solo only (D6-7): even after reuse and ±0.5★ there are not enough. */
  | { status: 'blocked'; available: number; requested: number };

/**
 * Question selection.
 * Battle (AC-M1): random among questions matching topics ∩ types ∩ difficulty ≥ min, no duplicates,
 * one order shared by all participants; prefers questions not in `avoidIds`.
 * Solo (AC-S2, AC-S6, D6-7): difficulty drawn by band weights, unanswered first, then
 * already-correct (reused), then band ±0.5★ (widened), else blocked; plus ≤ reviewMax reviews.
 */
export function selectQuestions(
  req: BattleSelectionRequest | SoloSelectionRequest,
  rng: Rng,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): SelectionResult {
  throw new NotImplementedError('selectQuestions');
}

export interface TopicWrongRate {
  topicId: TopicId;
  /** 0–1 over the last 30 days; 0 when no solves. */
  wrongRate: number;
  solved: number;
}

export interface CompositeAllocation {
  topicId: TopicId;
  count: number;
  /** One of the top-2 weak topics. */
  weak: boolean;
}

/**
 * Composite set allocation (AC-S7, D6-10 (c)) over the user's topics, total 10:
 * - ≥ 4 topics: top 2 by wrong rate share 5 questions, the rest share 5; inside each group
 *   proportional to wrong rate.
 * - ≤ 3 topics: all 10 proportional to wrong rate.
 * Integer counts by largest remainder; ties go to the higher wrong rate (then topic order);
 * a group whose wrong rates are all 0 splits evenly. Counts always sum to `total`.
 * Seed check: science 2 → 3 after the E2E battle (7 wrong: 2.56, 10 wrong: 2.86).
 */
export function allocateComposite(
  topics: readonly TopicWrongRate[],
  total: number = DEFAULT_CONFIG.composite.size,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): CompositeAllocation[] {
  throw new NotImplementedError('allocateComposite');
}
