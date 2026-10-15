import type { OwnerRef } from '@zuirock/shared';
import type { Tx } from './tx.js';

export interface WrongNoteResult {
  questionId: string;
  correct: boolean;
  /** Answered in a wrong-note review slot; a correct review marks the note '복습 완료'. */
  isReview: boolean;
  at: Date;
}

/**
 * Wrong-note upkeep (AC-D6): wrong answers create/increment an open note; a correct review answer
 * marks it reviewed. Members only — a guest owner is a no-op (notes are rebuilt on merge).
 */
export interface WrongNotePort {
  recordResults(tx: Tx, ownerId: OwnerRef, results: readonly WrongNoteResult[]): Promise<void>;
}

export const WRONG_NOTE_PORT = Symbol('WrongNotePort');
