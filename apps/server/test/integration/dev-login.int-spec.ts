import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommonModule } from '../../src/common/common.module.js';
import { DevLoginModule, devLoginEnabled } from '../../src/modules/auth/dev-login.module.js';
import { UsersModule } from '../../src/modules/users/users.module.js';

async function appWith(env: NodeJS.ProcessEnv) {
  const ref = await Test.createTestingModule({ imports: [CommonModule, UsersModule, DevLoginModule.forRoot(env)] }).compile();
  const app = ref.createNestApplication({ logger: false });
  app.setGlobalPrefix('api');
  await app.init();
  return app;
}

describe('dev login (DEV_LOGIN=1 and not production only)', () => {
  const apps: Awaited<ReturnType<typeof appWith>>[] = [];
  let on: (typeof apps)[number];
  beforeAll(async () => {
    on = await appWith({ DEV_LOGIN: '1', NODE_ENV: 'development' });
    apps.push(on);
  });
  afterAll(async () => Promise.all(apps.map((a) => a.close())));

  it.each([
    [{ DEV_LOGIN: '1', NODE_ENV: 'development' }, true],
    [{ DEV_LOGIN: '1', NODE_ENV: 'production' }, false],
    [{ DEV_LOGIN: '', NODE_ENV: 'development' }, false],
    [{ NODE_ENV: 'test' }, false],
  ])('enabled(%o) = %s', (env, expected) => expect(devLoginEnabled(env)).toBe(expected));

  it('issues the exchange-shaped session, reuses the user, sets isAdmin', async () => {
    const nick = `dev${Date.now() % 100000}`;
    const a = await request(on.getHttpServer()).post('/api/auth/dev-login').send({ nickname: nick, isAdmin: true }).expect(200);
    expect(a.body).toMatchObject({ accessToken: expect.any(String), expiresAt: expect.any(String), user: { nickname: nick, isAdmin: true } });
    const b = await request(on.getHttpServer()).post('/api/auth/dev-login').send({ nickname: nick }).expect(200);
    expect(b.body.user.id).toBe(a.body.user.id);
    const me = await request(on.getHttpServer()).get('/api/me').set('Authorization', `Bearer ${b.body.accessToken}`).expect(200);
    expect(me.body.id).toBe(a.body.user.id);
    await request(on.getHttpServer()).post('/api/auth/dev-login').send({ nickname: '' }).expect(400);
  });

  it('404 in production even with DEV_LOGIN=1, and logs nothing', async () => {
    const logs: string[] = [];
    const out = process.stdout.write.bind(process.stdout);
    const err = process.stderr.write.bind(process.stderr);
    const capture = (chunk: unknown) => (logs.push(String(chunk)), true);
    process.stdout.write = capture as typeof process.stdout.write;
    process.stderr.write = capture as typeof process.stderr.write;
    try {
      DevLoginModule.forRoot({ DEV_LOGIN: '1', NODE_ENV: 'production' });
      const prod = await appWith({ DEV_LOGIN: '1', NODE_ENV: 'production' });
      apps.push(prod);
      await request(prod.getHttpServer()).post('/api/auth/dev-login').send({ nickname: 'x' }).expect(404);
    } finally {
      process.stdout.write = out;
      process.stderr.write = err;
    }
    expect(logs.join('\n')).not.toMatch(/dev-login|DEV_LOGIN/i);
  });
});
