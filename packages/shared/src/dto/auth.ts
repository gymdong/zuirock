import { OAUTH_PROVIDERS, type OAuthProvider } from '../enums.js';
import type { IsoDateTime } from './common.js';
import type { MeDto } from './users.js';

/** Login buttons and implementation order: Kakao first (default), then Naver, then Google. */
export const OAUTH_LOGIN_ORDER: readonly OAuthProvider[] = OAUTH_PROVIDERS;

/**
 * Provider redirect URI = `${PUBLIC_ORIGIN}${oauthCallbackPath(provider)}`. The origin always comes
 * from the PUBLIC_ORIGIN env var (the Render subdomain is confirmed on its dashboard), never source.
 */
export function oauthCallbackPath(provider: OAuthProvider): string {
  return `/api/auth/${provider}/callback`;
}

/**
 * POST /api/auth/:provider/start — server-relayed OAuth with PKCE.
 * The guest token (if any) travels in the body and is stored server-side under the state nonce.
 */
export interface AuthStartRequest {
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  /** Where the server sends the browser/app after the provider callback. */
  returnTo: string;
  guestToken?: string;
}

export interface AuthStartResponse {
  authorizeUrl: string;
}

/** POST /api/auth/exchange — one-time exchange code (60 s TTL) + PKCE verifier → JWT. */
export interface AuthExchangeRequest {
  code: string;
  codeVerifier: string;
}

export interface AuthSession {
  accessToken: string;
  expiresAt: IsoDateTime;
  user: MeDto;
  /** Present when a guest token was attached to the login and merged. */
  merge?: GuestMergeSummary;
}

/** POST /api/guests — creates a guest identity (web storage temp id). */
export interface CreateGuestRequest {
  nickname?: string;
}

export interface GuestSession {
  guestId: string;
  /** Signed JWT (`typ=guest`). Required for merge and for guest socket seats. */
  guestToken: string;
  nickname: string | null;
  expiresAt: IsoDateTime;
}

/** POST /api/guests/merge — merge needs the signed guest token, never a raw guestId. */
export interface GuestMergeRequest {
  guestToken: string;
}

export interface GuestMergeSummary {
  guestId: string;
  moved: {
    solveLogs: number;
    setAttempts: number;
    battleResults: number;
    cheeseLedger: number;
  };
  /** XP granted for the guest portion after re-judging the combined history. */
  xpGranted: number;
}
