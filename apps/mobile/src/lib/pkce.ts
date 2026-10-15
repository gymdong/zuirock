/**
 * PKCE (RFC 7636, S256) for the server-relayed OAuth flow (`AuthStartRequest`).
 * Crypto primitives are injected so this module stays free of native imports; `src/api/auth.ts`
 * wires expo-crypto in the app and tests use node:crypto.
 */
export interface PkceCrypto {
  randomBytes(length: number): Uint8Array;
  sha256(input: string): Promise<Uint8Array>;
}

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return out;
}

/** 32 random bytes → 43-char verifier (RFC 7636 §4.1: 43–128 chars of [A-Za-z0-9-._~]). */
export function createCodeVerifier(crypto: PkceCrypto): string {
  return base64UrlEncode(crypto.randomBytes(32));
}

export async function codeChallengeS256(verifier: string, crypto: PkceCrypto): Promise<string> {
  return base64UrlEncode(await crypto.sha256(verifier));
}

export async function createPkcePair(crypto: PkceCrypto): Promise<PkcePair> {
  const codeVerifier = createCodeVerifier(crypto);
  return { codeVerifier, codeChallenge: await codeChallengeS256(codeVerifier, crypto), codeChallengeMethod: 'S256' };
}
