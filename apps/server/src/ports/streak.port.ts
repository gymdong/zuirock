import type { KstDay, OwnerRef, StreakActivityKind, StreakAdvanceDto } from '@zuirock/shared';
import type { Tx } from './tx.js';

/**
 * Marks that the owner completed a streak-counting activity on `kstDay` (AC-G6): a full 10-question
 * solo set (cleared or not) or a battle played to the end. Idempotent per (owner, kstDay); pays
 * milestone cheese with the (userId, milestone, runStartDay) key. Guests: no-op.
 */
export interface StreakPort {
  /** Resolves to the advance when this call newly counted today (for the streak animation), else null/void. */
  markActivity(tx: Tx, ownerId: OwnerRef, kstDay: KstDay, kind: StreakActivityKind): Promise<StreakAdvanceDto | null | void>;
}

export const STREAK_PORT = Symbol('StreakPort');
