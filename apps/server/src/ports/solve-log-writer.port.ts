import type { OwnerRef, SolveMode } from '@zuirock/shared';
import type { Tx } from './tx.js';

/** One SolveLog row (AC-D1). Exactly one of setAttemptId / battleResultId. */
export interface SolveLogInput {
  owner: OwnerRef;
  questionId: string;
  mode: SolveMode;
  correct: boolean;
  /** false = not submitted in a battle (missed / disconnected): correct = false, 0 points. */
  submitted: boolean;
  responseMs: number;
  /** chosung only, else null. */
  beforeReveal: boolean | null;
  hintUsed: boolean;
  attempts: number;
  isReview: boolean;
  answeredAt: Date;
  setAttemptId?: string;
  battleResultId?: string;
}

/**
 * Persists solve logs. Idempotent on (setAttemptId, questionId, owner) / (battleResultId, questionId):
 * rows that already exist are skipped. `kstDay` is derived from answeredAt by the implementation.
 */
export interface SolveLogWriter {
  writeMany(tx: Tx, logs: readonly SolveLogInput[]): Promise<void>;
}

export const SOLVE_LOG_WRITER = Symbol('SolveLogWriter');
