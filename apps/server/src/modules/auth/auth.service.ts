import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  OAUTH_PROVIDERS,
  oauthCallbackPath,
  type AuthExchangeRequest,
  type AuthSession,
  type AuthStartRequest,
  type AuthStartResponse,
  type GuestMergeSummary,
  type OAuthProvider,
} from '@zuirock/shared';
import { ApiError, badRequest, unauthorized } from '../../common/api-error.js';
import { secretFromEnv } from '../../common/jwt.js';
import { RedisService } from '../../common/redis.service.js';
import { TokensService } from '../../common/tokens.service.js';
import { MergeService } from '../guests/merge.service.js';
import { UsersService } from '../users/users.service.js';
import { OAUTH_ADAPTERS, type OAuthAdapters } from './oauth-providers.js';

/** Redis key prefix for OAuth nonces and exchange codes. */
export const AUTH_KEY_PREFIX = 'lb:auth:';
const NONCE_TTL_SEC = 600;
const EXCHANGE_CODE_TTL_SEC = 60;

interface NonceRecord {
  provider: OAuthProvider;
  codeChallenge: string;
  returnTo: string;
  /** Server ↔ provider PKCE verifier (Kakao, Google). */
  providerVerifier: string;
  guestToken?: string;
}

interface ExchangeRecord {
  userId: string;
  codeChallenge: string;
  merge?: GuestMergeSummary;
}

const sha256url = (s: string) => createHash('sha256').update(s).digest('base64url');

export function publicOrigin(): string {
  return (process.env.PUBLIC_ORIGIN || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
}

/**
 * Server-relayed OAuth (plan §2.3(e)): client PKCE + state carrying only a signed nonce; the guest
 * token waits server-side under the nonce; the callback hands the client a one-time 60 s code.
 */
@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');
  private readonly stateSecret = secretFromEnv('STATE_SECRET');

  constructor(
    private readonly redis: RedisService,
    private readonly tokens: TokensService,
    private readonly users: UsersService,
    private readonly merges: MergeService,
    @Inject(OAUTH_ADAPTERS) private readonly adapters: OAuthAdapters,
  ) {}

  private async r(): Promise<RedisService> {
    if (this.redis.status === 'wait') await this.redis.connect();
    return this.redis;
  }

  provider(raw: string): OAuthProvider {
    if (!(OAUTH_PROVIDERS as readonly string[]).includes(raw)) throw badRequest('UNKNOWN_PROVIDER', '지원하지 않는 로그인이에요');
    return raw as OAuthProvider;
  }

  redirectUri(provider: OAuthProvider): string {
    return `${publicOrigin()}${oauthCallbackPath(provider)}`;
  }

  /** returnTo must be our own origin or the app scheme (no open redirect). */
  private checkReturnTo(returnTo: unknown): string {
    if (typeof returnTo !== 'string') throw badRequest('BAD_RETURN_TO', 'returnTo가 필요해요');
    const origin = publicOrigin();
    const ok =
      returnTo.startsWith(`${origin}/`) ||
      returnTo.startsWith('zuirock://') ||
      (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(returnTo));
    if (!ok) throw badRequest('BAD_RETURN_TO', '허용되지 않은 returnTo예요');
    return returnTo;
  }

  signState(nonce: string): string {
    return `${nonce}.${createHmac('sha256', this.stateSecret).update(nonce).digest('base64url')}`;
  }

  verifyState(state: string): string | null {
    const [nonce, sig, extra] = (state ?? '').split('.');
    if (!nonce || !sig || extra !== undefined) return null;
    const expected = createHmac('sha256', this.stateSecret).update(nonce).digest();
    const given = Buffer.from(sig, 'base64url');
    return given.length === expected.length && timingSafeEqual(given, expected) ? nonce : null;
  }

  async start(rawProvider: string, req: AuthStartRequest): Promise<AuthStartResponse> {
    const provider = this.provider(rawProvider);
    const adapter = this.adapters[provider];
    if (!adapter.configured()) throw new ApiError(HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_NOT_CONFIGURED', '아직 준비 중인 로그인이에요');
    if (req?.codeChallengeMethod !== 'S256' || typeof req.codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(req.codeChallenge)) {
      throw badRequest('BAD_PKCE', 'PKCE code challenge(S256)가 필요해요');
    }
    const returnTo = this.checkReturnTo(req.returnTo);
    if (req.guestToken !== undefined && !this.tokens.verifyGuest(req.guestToken)) {
      throw unauthorized('BAD_GUEST_TOKEN', '게스트 토큰이 올바르지 않아요');
    }
    const nonce = randomBytes(18).toString('base64url');
    const providerVerifier = randomBytes(32).toString('base64url');
    const record: NonceRecord = { provider, codeChallenge: req.codeChallenge, returnTo, providerVerifier, guestToken: req.guestToken };
    await (await this.r()).set(`${AUTH_KEY_PREFIX}nonce:${nonce}`, JSON.stringify(record), 'EX', NONCE_TTL_SEC);
    return {
      authorizeUrl: adapter.authorizeUrl({
        state: this.signState(nonce),
        redirectUri: this.redirectUri(provider),
        codeChallenge: sha256url(providerVerifier),
      }),
    };
  }

  /** Provider callback → redirect URL for the browser (`returnTo?code=` or `returnTo?error=`). */
  async callback(rawProvider: string, q: { code?: string; state?: string; error?: string }): Promise<string> {
    const provider = this.provider(rawProvider);
    const nonce = q.state ? this.verifyState(q.state) : null;
    if (!nonce) throw badRequest('BAD_STATE', '로그인 요청이 올바르지 않아요');
    const raw = await (await this.r()).getdel(`${AUTH_KEY_PREFIX}nonce:${nonce}`);
    if (!raw) throw badRequest('STATE_EXPIRED', '로그인 요청이 만료됐어요. 다시 시도해 주세요');
    const record = JSON.parse(raw) as NonceRecord;
    if (record.provider !== provider) throw badRequest('BAD_STATE', '로그인 요청이 올바르지 않아요');
    const back = (params: Record<string, string>) => {
      const url = new URL(record.returnTo);
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
      return url.toString();
    };
    if (q.error || !q.code) return back({ error: q.error || 'access_denied' });
    try {
      const profile = await this.adapters[provider].fetchProfile({
        code: q.code,
        state: q.state!,
        redirectUri: this.redirectUri(provider),
        codeVerifier: record.providerVerifier,
      });
      const user = await this.users.findOrCreateSocial(provider, profile);
      let merge: GuestMergeSummary | undefined;
      const guestId = record.guestToken ? this.tokens.verifyGuest(record.guestToken) : null;
      if (guestId) {
        try {
          merge = await this.merges.merge(guestId, user.id);
        } catch (error) {
          // Already merged / gone: login still succeeds, the client sees no merge summary.
          this.log.warn(`guest merge skipped: ${(error as Error).message}`);
        }
      }
      const code = randomBytes(24).toString('base64url');
      const ex: ExchangeRecord = { userId: user.id, codeChallenge: record.codeChallenge, merge };
      await (await this.r()).set(`${AUTH_KEY_PREFIX}code:${code}`, JSON.stringify(ex), 'EX', EXCHANGE_CODE_TTL_SEC);
      return back({ code });
    } catch (error) {
      this.log.warn(`${provider} callback failed: ${(error as Error).message}`);
      return back({ error: 'login_failed' });
    }
  }

  /** One-time code + PKCE verifier → member session. Reuse, expiry or a wrong verifier → 401. */
  async exchange(req: AuthExchangeRequest): Promise<AuthSession> {
    if (typeof req?.code !== 'string' || typeof req.codeVerifier !== 'string') throw badRequest('BAD_REQUEST', 'code와 codeVerifier가 필요해요');
    const raw = await (await this.r()).getdel(`${AUTH_KEY_PREFIX}code:${req.code}`);
    if (!raw) throw unauthorized('CODE_INVALID', '로그인 코드가 만료됐거나 이미 쓰였어요');
    const ex = JSON.parse(raw) as ExchangeRecord;
    if (sha256url(req.codeVerifier) !== ex.codeChallenge) throw unauthorized('PKCE_MISMATCH', '로그인 확인에 실패했어요');
    const { token, expiresAt } = this.tokens.signMember(ex.userId);
    return {
      accessToken: token,
      expiresAt: expiresAt.toISOString(),
      user: await this.users.me(ex.userId),
      ...(ex.merge ? { merge: ex.merge } : {}),
    };
  }
}
