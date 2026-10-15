import type { QuestionType, SubfieldName, TopicId } from '@zuirock/shared';

/** Server epoch milliseconds. Rule functions never read the clock; callers pass `now`. */
export type EpochMs = number;
/** KST calendar day `YYYY-MM-DD`. */
export type KstDay = string;
/** Random source in [0, 1). Inject a seeded one in tests. */
export type Rng = () => number;

/** Minimal solve record that report/weakness rules aggregate (a projection of SolveLog). */
export interface SolveFact {
  questionId: string;
  topicId: TopicId;
  subfieldId: string;
  subfield: SubfieldName;
  type: QuestionType;
  difficulty: number;
  correct: boolean;
  responseMs: number;
  answeredAt: EpochMs;
}
