import type { AuthSession, OAuthProvider } from '@zuirock/shared';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { createPkcePair, type PkceCrypto } from '../lib/pkce';
import { storage } from '../lib/storage';
import { session } from '../state/session';
import { Api } from './endpoints';

const PENDING_KEY = 'zuirock.pkce';

interface PendingLogin {
  codeVerifier: string;
  /** Route to open after login (e.g. back to the battle result). */
  next: string | null;
}

const expoCrypto: PkceCrypto = {
  randomBytes: (n) => Crypto.getRandomBytes(n),
  sha256: async (s) =>
    new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(s))),
};

function callbackUrl(): string {
  if (Platform.OS === 'web') return `${window.location.origin}/auth/callback`;
  return Linking.createURL('auth/callback');
}

/**
 * Server-relayed OAuth with PKCE: the verifier stays on the device; the server keeps the
 * challenge (and the guest token, for the merge) under its state nonce and redirects back to
 * `/auth/callback?code=<one-time exchange code>`.
 */
export async function startLogin(provider: OAuthProvider, next: string | null = null): Promise<AuthSession | null> {
  const pkce = await createPkcePair(expoCrypto);
  await storage.set(PENDING_KEY, { codeVerifier: pkce.codeVerifier, next } satisfies PendingLogin);
  const returnTo = callbackUrl();
  const { authorizeUrl } = await Api.authStart(provider, {
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: 'S256',
    returnTo,
    guestToken: session.get().guest?.guestToken,
  });
  if (Platform.OS === 'web') {
    window.location.assign(authorizeUrl);
    return null;
  }
  const result = await WebBrowser.openAuthSessionAsync(authorizeUrl, returnTo);
  if (result.type !== 'success') return null;
  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
  if (!code) throw new Error(loginErrorMessage(String(queryParams?.error ?? '')));
  return (await completeLogin(code)).session;
}

/** Exchange the one-time code (60 s TTL) + verifier for the member session. */
export async function completeLogin(code: string): Promise<{ session: AuthSession; next: string | null }> {
  const pending = await storage.get<PendingLogin>(PENDING_KEY);
  if (!pending) throw new Error('로그인 정보가 만료됐어요. 다시 시도해 주세요.');
  await storage.remove(PENDING_KEY);
  const s = await Api.authExchange({ code, codeVerifier: pending.codeVerifier });
  await session.setMember(s);
  return { session: s, next: pending.next };
}

export function loginErrorMessage(error: string): string {
  if (error === 'access_denied') return '로그인을 취소했어요.';
  return '로그인하지 못했어요. 다시 시도해 주세요.';
}
