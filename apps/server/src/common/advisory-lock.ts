import type { Tx } from '../ports/tx.js';

export interface LockKey {
  userId: string;
  dayKey: string;
}

/**
 * Takes transaction-scoped advisory locks for every (userId, dayKey) in one global order
 * (sorted, deduplicated) so concurrent result writers never deadlock. Only pg_advisory_xact_lock:
 * session locks do not survive PgBouncer transaction pooling (plan §2.3(d)).
 */
export async function lockAll(tx: Tx, keys: readonly LockKey[]): Promise<void> {
  const names = [...new Set(keys.map((k) => `${k.userId}|${k.dayKey}`))].sort();
  for (const name of names) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${name}, 0))`;
  }
}
