import type { OAuthProvider } from '@zuirock/shared';

export interface OAuthProfile {
  providerUserId: string;
  nickname: string | null;
  avatarUrl: string | null;
}

/** One OAuth provider. Real adapters call the provider over HTTPS; tests bind fakes (OAUTH_ADAPTERS). */
export interface OAuthAdapter {
  readonly provider: OAuthProvider;
  /** False when the client id/secret env vars are missing (the start endpoint answers 503). */
  configured(): boolean;
  authorizeUrl(input: { state: string; redirectUri: string; codeChallenge: string }): string;
  /** Authorization code → user profile. Throws on any provider error. */
  fetchProfile(input: { code: string; state: string; redirectUri: string; codeVerifier: string }): Promise<OAuthProfile>;
}

export const OAUTH_ADAPTERS = Symbol('OAuthAdapters');
export type OAuthAdapters = Record<OAuthProvider, OAuthAdapter>;

async function postForm(url: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: new URLSearchParams(form),
  });
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || typeof body.access_token !== 'string') throw new Error(`token exchange failed (${res.status})`);
  return body;
}

async function getJson(url: string, accessToken: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`profile request failed (${res.status})`);
  return (await res.json()) as Record<string, unknown>;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const env = (name: string) => process.env[name] ?? '';

/** Kakao Login (REST API key = client id). PKCE supported. Default login button. */
export const kakaoAdapter: OAuthAdapter = {
  provider: 'kakao',
  configured: () => !!env('KAKAO_CLIENT_ID'),
  authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
    `https://kauth.kakao.com/oauth/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: env('KAKAO_CLIENT_ID'),
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })}`,
  async fetchProfile({ code, redirectUri, codeVerifier }) {
    const token = await postForm('https://kauth.kakao.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: env('KAKAO_CLIENT_ID'),
      ...(env('KAKAO_CLIENT_SECRET') ? { client_secret: env('KAKAO_CLIENT_SECRET') } : {}),
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
    const me = await getJson('https://kapi.kakao.com/v2/user/me', token.access_token as string);
    const account = (me.kakao_account ?? {}) as { profile?: { nickname?: string; profile_image_url?: string } };
    const props = (me.properties ?? {}) as { nickname?: string; profile_image?: string };
    return {
      providerUserId: String(me.id),
      nickname: str(account.profile?.nickname) ?? str(props.nickname),
      avatarUrl: str(account.profile?.profile_image_url) ?? str(props.profile_image),
    };
  },
};

/** Naver Login. No PKCE on Naver's side; the client↔server PKCE still applies. */
export const naverAdapter: OAuthAdapter = {
  provider: 'naver',
  configured: () => !!env('NAVER_CLIENT_ID') && !!env('NAVER_CLIENT_SECRET'),
  authorizeUrl: ({ state, redirectUri }) =>
    `https://nid.naver.com/oauth2.0/authorize?${new URLSearchParams({
      response_type: 'code',
      client_id: env('NAVER_CLIENT_ID'),
      redirect_uri: redirectUri,
      state,
    })}`,
  async fetchProfile({ code, state }) {
    const token = await postForm('https://nid.naver.com/oauth2.0/token', {
      grant_type: 'authorization_code',
      client_id: env('NAVER_CLIENT_ID'),
      client_secret: env('NAVER_CLIENT_SECRET'),
      code,
      state,
    });
    const me = await getJson('https://openapi.naver.com/v1/nid/me', token.access_token as string);
    const r = (me.response ?? {}) as { id?: string; nickname?: string; profile_image?: string };
    if (!r.id) throw new Error('naver profile without id');
    return { providerUserId: r.id, nickname: str(r.nickname), avatarUrl: str(r.profile_image) };
  },
};

/** Google (OpenID Connect userinfo). PKCE supported. */
export const googleAdapter: OAuthAdapter = {
  provider: 'google',
  configured: () => !!env('GOOGLE_CLIENT_ID') && !!env('GOOGLE_CLIENT_SECRET'),
  authorizeUrl: ({ state, redirectUri, codeChallenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      response_type: 'code',
      client_id: env('GOOGLE_CLIENT_ID'),
      redirect_uri: redirectUri,
      scope: 'openid profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })}`,
  async fetchProfile({ code, redirectUri, codeVerifier }) {
    const token = await postForm('https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      client_id: env('GOOGLE_CLIENT_ID'),
      client_secret: env('GOOGLE_CLIENT_SECRET'),
      redirect_uri: redirectUri,
      code,
      code_verifier: codeVerifier,
    });
    const me = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token.access_token as string);
    if (!str(me.sub)) throw new Error('google profile without sub');
    return { providerUserId: me.sub as string, nickname: str(me.name), avatarUrl: str(me.picture) };
  },
};

export const realOAuthAdapters: OAuthAdapters = { kakao: kakaoAdapter, naver: naverAdapter, google: googleAdapter };
