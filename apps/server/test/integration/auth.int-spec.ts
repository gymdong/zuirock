import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../support/app.js';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

describe('auth (AC-A1)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  async function login(provider: string, id: string, guestToken?: string) {
    const { verifier, challenge } = pkce();
    const start = await t
      .http()
      .post(`/api/auth/${provider}/start`)
      .send({ codeChallenge: challenge, codeChallengeMethod: 'S256', returnTo: 'https://zuirock.test/auth/callback', guestToken })
      .expect(200);
    const authorize = new URL(start.body.authorizeUrl);
    expect(authorize.searchParams.get('redirect_uri')).toBe(`https://zuirock.test/api/auth/${provider}/callback`);
    const state = authorize.searchParams.get('state')!;
    const cb = await t.http().get(`/api/auth/${provider}/callback`).query({ code: `ok:${id}`, state }).expect(302);
    const code = new URL(cb.headers.location!).searchParams.get('code')!;
    return { verifier, code, state };
  }

  it('kakao login → exchange → JWT works on /api/me; same social id reuses the user', async () => {
    const { verifier, code } = await login('kakao', '1001');
    const session = await t.http().post('/api/auth/exchange').send({ code, codeVerifier: verifier }).expect(200);
    expect(session.body.user.providers).toEqual(['kakao']);
    const me = await t.http().get('/api/me').set('Authorization', `Bearer ${session.body.accessToken}`).expect(200);
    expect(me.body.id).toBe(session.body.user.id);
    const again = await login('kakao', '1001');
    const s2 = await t.http().post('/api/auth/exchange').send({ code: again.code, codeVerifier: again.verifier }).expect(200);
    expect(s2.body.user.id).toBe(session.body.user.id);
  });

  it('naver and google use the same flow', async () => {
    for (const p of ['naver', 'google']) {
      const { verifier, code } = await login(p, '2002');
      const s = await t.http().post('/api/auth/exchange').send({ code, codeVerifier: verifier }).expect(200);
      expect(s.body.user.providers).toEqual([p]);
    }
  });

  it('rejects PKCE mismatch, code reuse, forged and replayed state', async () => {
    const a = await login('kakao', '3003');
    await t.http().post('/api/auth/exchange').send({ code: a.code, codeVerifier: pkce().verifier }).expect(401);
    // the code was consumed by the failed attempt (one-time)
    await t.http().post('/api/auth/exchange').send({ code: a.code, codeVerifier: a.verifier }).expect(401);

    const b = await login('kakao', '3004');
    await t.http().post('/api/auth/exchange').send({ code: b.code, codeVerifier: b.verifier }).expect(200);
    await t.http().post('/api/auth/exchange').send({ code: b.code, codeVerifier: b.verifier }).expect(401);
    // state replay (nonce already consumed) and forged signature
    await t.http().get('/api/auth/kakao/callback').query({ code: 'ok:3004', state: b.state }).expect(400);
    const [nonce] = b.state.split('.');
    await t.http().get('/api/auth/kakao/callback').query({ code: 'ok:3004', state: `${nonce}.forged` }).expect(400);
  });

  it('exchange code expires after 60 s', async () => {
    const a = await login('kakao', '4004');
    const key = `lb:auth:code:${a.code}`;
    expect(await t.redis.ttl(key)).toBeLessThanOrEqual(60);
    await t.redis.del(key); // expiry
    await t.http().post('/api/auth/exchange').send({ code: a.code, codeVerifier: a.verifier }).expect(401);
  });

  it('rejects open redirects and bad PKCE input', async () => {
    const { challenge } = pkce();
    await t.http().post('/api/auth/kakao/start').send({ codeChallenge: challenge, codeChallengeMethod: 'S256', returnTo: 'https://evil.example/' }).expect(400);
    await t.http().post('/api/auth/kakao/start').send({ codeChallenge: 'short', codeChallengeMethod: 'S256', returnTo: 'https://zuirock.test/x' }).expect(400);
  });

  it('guest token attached at start is merged during the callback', async () => {
    const guest = await t.http().post('/api/guests').send({ nickname: '게스트' }).expect(201);
    const { verifier, code } = await login('kakao', '5005', guest.body.guestToken);
    const s = await t.http().post('/api/auth/exchange').send({ code, codeVerifier: verifier }).expect(200);
    expect(s.body.merge.guestId).toBe(guest.body.guestId);
    // merged guest token no longer authenticates
    await t.http().get('/api/solo/daily').set('Authorization', `Bearer ${guest.body.guestToken}`).expect((r) => expect([401, 404]).toContain(r.status));
  });
});
