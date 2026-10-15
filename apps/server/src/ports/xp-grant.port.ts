import type { KstDay, OwnerRef, XpSourceType } from '@zuirock/shared';
import type { Tx } from './tx.js';

/** Raw per-question facts; the implementation (LB) adds weak-topic, review and decay data from the DB. */
export interface XpGrantItem {
  questionId: string;
  correct: boolean;
  /** chosung: solved before the reveal (battle) / without the hint (solo). false for mcq/ox. */
  noHint: boolean;
  /** Answer was given in a wrong-note review slot. */
  isReview: boolean;
  answeredAt: Date;
}

/** Set/battle facts the caller knows; mirrors `XpGrantContext` in @zuirock/game-rules minus DB-derived flags. */
export type XpGrantContextInput =
  | { kind: 'stage'; cleared: boolean; firstClear: boolean }
  | { kind: 'composite' | 'daily' | 'quest'; correctCount: number; totalCount: number }
  | { kind: 'battle'; rank: number; rematch: boolean };

export interface XpGrantRequest {
  /** XP is granted to members only; for a guest owner nothing is written and [] is returned. */
  ownerId: OwnerRef;
  /** Idempotency key (sourceType, sourceId, userId): a repeated call returns the existing entries. */
  source: { type: XpSourceType; id: string };
  items: readonly XpGrantItem[];
  /** KST day of the grant (daily cap bucket). */
  kstDay: KstDay;
  context: XpGrantContextInput;
}

export interface XpLedgerEntry {
  id: string;
  userId: string;
  sourceType: XpSourceType;
  sourceId: string;
  amount: number;
  preCapAmount: number;
  cappedAmount: number;
  capReached: boolean;
  reason: string;
  kstDay: KstDay;
  configVersion: string;
  createdAt: Date;
}

/**
 * Account XP grant (AC-G1~G4). Implemented by LB with `computeXpGrant`; takes the
 * (userId, kstDay) advisory xact lock before reading the day's granted XP.
 */
export interface XpGrantPort {
  grant(tx: Tx, req: XpGrantRequest): Promise<XpLedgerEntry[]>;
}

export const XP_GRANT_PORT = Symbol('XpGrantPort');
