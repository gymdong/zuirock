/** ISO-8601 timestamp string (UTC), e.g. `2026-10-16T03:00:00.000Z`. */
export type IsoDateTime = string;
/** KST calendar day `YYYY-MM-DD` (day boundary = 00:00 KST). */
export type KstDay = string;
/** Server epoch milliseconds. All scoring/timer values use the server clock. */
export type EpochMs = number;

/**
 * Owner of a source record (SolveLog, SetAttempt, BattleResult, CheeseLedger):
 * exactly one of a member or a guest (DB CHECK enforces this).
 */
export type OwnerRef = { kind: 'user'; userId: string } | { kind: 'guest'; guestId: string };

/** Header carrying a client-generated key for set/battle result writes. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Error body for every non-2xx REST response. */
export interface ApiErrorBody {
  statusCode: number;
  /** Stable machine-readable code, e.g. `GUEST_ALREADY_MERGED`. */
  code: string;
  message: string;
  details?: unknown;
}

export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
