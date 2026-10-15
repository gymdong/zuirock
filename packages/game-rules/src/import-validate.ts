import type { QuestionInput } from '@zuirock/shared';
import { NotImplementedError } from './errors.js';

export type ImportIssueCode =
  /** File root is not a JSON array, or is empty. */
  | 'NOT_ARRAY'
  | 'EMPTY'
  /** Violates content/schema/question.schema.json (via questionInputSchema); one issue per zod issue. */
  | 'SCHEMA'
  /** mcq answer is not exactly one of the 4 choices. */
  | 'ANSWER_NOT_IN_CHOICES'
  /** Same normalized question text earlier in this file. */
  | 'DUPLICATE_IN_FILE'
  /** Same normalized question text as an existing question. */
  | 'DUPLICATE_EXISTING'
  /** Warning: the question text contains the answer (GUIDE §4). */
  | 'ANSWER_IN_QUESTION';

export interface ImportIssue {
  /** 1-based position in the file ("몇 번째 문제"); 0 for file-level errors. */
  index: number;
  field?: string;
  code: ImportIssueCode;
  message: string;
}

export interface ImportValidation {
  /** Questions that passed every error check; they become `draft`. */
  accepted: Array<{ index: number; question: QuestionInput; normalizedText: string }>;
  errors: ImportIssue[];
  /** Non-blocking; bulk approval requires zero warnings. */
  warnings: ImportIssue[];
}

/**
 * Import check (AC-C2): schema (required fields, ★1–5 in 0.5 steps, types, topic/subfield),
 * mcq choices contain the answer, duplicates in file / against `existingNormalizedTexts`
 * (normalized with `normalize`). Errors name the question number and the reason; only passing
 * questions are returned in `accepted`.
 */
export function validateImport(raw: unknown, existingNormalizedTexts: ReadonlySet<string>): ImportValidation {
  throw new NotImplementedError('validateImport');
}
