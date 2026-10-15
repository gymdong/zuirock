/**
 * Socket/REST identity for rooms. LC does not import LB's auth module; the lead binds
 * `AUTH_VERIFIER` to an adapter over LB's JWT helpers (member access token or guest token `typ=guest`).
 */
export type RoomIdentity =
  | { kind: 'user'; userId: string; nickname: string; avatarUrl: string | null }
  | { kind: 'guest'; guestId: string };

export interface AuthVerifier {
  /** Returns null for a missing, expired or invalid token. Never throws for bad tokens. */
  verify(token: string): Promise<RoomIdentity | null>;
}

export const AUTH_VERIFIER = Symbol('RoomAuthVerifier');

/** Stable owner key used for seats and the rematch member key. */
export function identityKey(identity: RoomIdentity): string {
  return identity.kind === 'user' ? `u:${identity.userId}` : `g:${identity.guestId}`;
}

export function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}
