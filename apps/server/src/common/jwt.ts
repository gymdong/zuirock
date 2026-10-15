import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';

/** Minimal HS256 JWT (no dependency). Claims are validated by the caller. */
export interface JwtClaims {
  sub: string;
  typ: string;
  iat: number;
  exp: number;
  [key: string]: unknown;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function signJwt(claims: Omit<JwtClaims, 'iat' | 'exp'>, secret: string, ttlSec: number, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...claims, iat, exp: iat + ttlSec }));
  const sig = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

/** Returns the claims, or null for a malformed, forged or expired token. */
export function verifyJwt(token: string, secret: string, nowMs: number): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts as [string, string, string];
  const expected = createHmac('sha256', secret).update(`${head}.${body}`).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as JwtClaims;
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null;
    return claims.exp * 1000 > nowMs ? claims : null;
  } catch {
    return null;
  }
}

const ephemeral = new Map<string, string>();

/** Reads a signing key from env. Production refuses to start without it; dev gets a per-process key. */
export function secretFromEnv(name: 'JWT_SECRET' | 'STATE_SECRET' | 'GUEST_TOKEN_SECRET'): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} is not set`);
  let key = ephemeral.get(name);
  if (!key) {
    key = randomBytes(32).toString('hex');
    ephemeral.set(name, key);
    Logger.warn(`${name} not set; using an ephemeral key (tokens die on restart)`, 'Auth');
  }
  return key;
}
