import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommonModule } from '../../src/common/common.module.js';
import { CLOCK } from '../../src/common/clock.js';
import { PrismaService } from '../../src/common/prisma.service.js';
import { TokensService } from '../../src/common/tokens.service.js';
import { DemoSeedModule, demoSeedEnabled } from '../../src/modules/demo-seed/demo-seed.module.js';
import { GrowthModule } from '../../src/modules/growth/growth.module.js';
import { TopicsModule } from '../../src/modules/topics/topics.module.js';
import { TopicsService } from '../../src/modules/topics/topics.service.js';
import { FakeClock, makeQuestion, resetDb } from '../support/app.js';

const CONFIRM = { confirm: 'RESET_MY_DEMO_ACCOUNT' };

describe('admin demo seed (DEMO_SEED=1, admin, confirm)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokensService;
  const queries: string[] = [];
  const auth = (userId: string) => `Bearer ${tokens.signMember(userId)}`;

  beforeAll(async () => {
    const ref = await Test.createTestingModule({ imports: [CommonModule, GrowthModule, TopicsModule, DemoSeedModule.forRoot({ DEMO_SEED: '1' })] })
      .overrideProvider(CLOCK).useValue(new FakeClock())
      .compile();
    app = ref.createNestApplication({ logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(TokensService);
    tokens.signMember = ((sign) => (id: string) => sign(id).token)(TokensService.prototype.signMember.bind(tokens)) as never;
    await resetDb(prisma);
    await app.get(TopicsService).seed();
    for (const [topicId, subs] of Object.entries({ science: ['물리', '화학', '생물'], general: ['생활', '사회', '문화'], vocab: ['맞춤법', '한자어', '관용표현'], history: ['한국사', '세계사'] })) {
      for (const subfield of subs) for (let i = 0; i < 40; i++) await makeQuestion(prisma, { topicId, subfield, difficulty: topicId === 'science' && i < 8 ? 1.5 : 2.5 });
    }
    (prisma as unknown as { $on: (e: 'query', cb: (e: { query: string }) => void) => void }).$on('query', (e) => queries.push(e.query));
  });
  afterAll(() => app.close());

  it.each([[{ DEMO_SEED: '1' }, true], [{}, false], [{ DEMO_SEED: 'true' }, false]])('enabled(%o) = %s', (env, on) => expect(demoSeedEnabled(env)).toBe(on));

  it('route does not exist without DEMO_SEED=1 (404)', async () => {
    const ref = await Test.createTestingModule({ imports: [CommonModule, GrowthModule, DemoSeedModule.forRoot({ NODE_ENV: 'production' })] }).compile();
    const off = ref.createNestApplication({ logger: false });
    off.setGlobalPrefix('api');
    await off.init();
    const u = await prisma.user.create({ data: { nickname: 'nodemo', isAdmin: true } });
    await request(off.getHttpServer()).post('/api/admin/demo/seed').set('Authorization', auth(u.id)).send(CONFIRM).expect(404);
    await request(off.getHttpServer()).get('/api/admin/demo/seed/verify').set('Authorization', auth(u.id)).expect(404);
    await off.close();
  });

  it('403 for non-admin, 400 for a wrong confirm', async () => {
    const m = await prisma.user.create({ data: { nickname: '일반회원' } });
    const a = await prisma.user.create({ data: { nickname: '데모관리', isAdmin: true } });
    await request(app.getHttpServer()).post('/api/admin/demo/seed').set('Authorization', auth(m.id)).send(CONFIRM).expect(403);
    const r = await request(app.getHttpServer()).post('/api/admin/demo/seed').set('Authorization', auth(a.id)).send({ confirm: 'yes' }).expect(400);
    expect(r.body.code).toBe('CONFIRM_REQUIRED');
  });

  it('reset + apply on the caller only, idempotent, verify equals the plan numbers', async () => {
    const admin = await prisma.user.findUniqueOrThrow({ where: { nickname: '데모관리' } });
    const other = await prisma.user.findUniqueOrThrow({ where: { nickname: '일반회원' } });
    const q = (await prisma.question.findFirstOrThrow()).id;
    const set = await prisma.setAttempt.create({ data: { userId: other.id, kind: 'composite', status: 'completed' } });
    await prisma.solveLog.create({ data: { userId: other.id, questionId: q, mode: 'composite', correct: false, responseMs: 1, answeredAt: new Date(), kstDay: new Date('2026-10-21T00:00:00Z'), setAttemptId: set.id } });
    await prisma.cheeseLedger.create({ data: { userId: other.id, delta: 7, reason: 'seed_adjust' } });
    await prisma.wrongNote.create({ data: { userId: other.id, questionId: q, firstWrongAt: new Date(), lastWrongAt: new Date() } });
    const snapshot = async () => JSON.stringify(await Promise.all([
      prisma.solveLog.findMany({ where: { userId: other.id } }), prisma.cheeseLedger.findMany({ where: { userId: other.id } }),
      prisma.wrongNote.findMany({ where: { userId: other.id } }), prisma.user.findUnique({ where: { id: other.id } }),
    ]));
    const before = await snapshot();

    for (let run = 0; run < 2; run++) {
      queries.length = 0;
      const s = await request(app.getHttpServer()).post('/api/admin/demo/seed').set('Authorization', auth(admin.id)).send(CONFIRM).expect(200);
      const n = queries.filter((x) => !/^(BEGIN|COMMIT)/.test(x)).length;
      console.warn(`[demo-seed] run ${run + 1}: ${n} statements, ${s.body.durationMs} ms locally → ≈ ${(n * 0.2).toFixed(1)} s at 0.2 s/round trip`);
      expect(n).toBeLessThanOrEqual(40);
      expect(s.body).toMatchObject({ solves: 140, wrongNotes: 40, friends: 3, battles: 2, cheese: 320, streak: 28 });
      const v = await request(app.getHttpServer()).get('/api/admin/demo/seed/verify').set('Authorization', auth(admin.id)).expect(200);
      expect(v.body.checks.filter((c: { ok: boolean }) => !c.ok)).toEqual([]);
      expect(v.body.observed).toMatchObject({
        weeklySolved: 27, insufficientData: true, weakTopics: ['vocab', 'general'],
        allocation: { vocab: 3, general: 2, history: 3, science: 2 }, cheese: 320, streak: 28,
        topicLevels: { science: 6, general: 4, vocab: 3, history: 5 }, openWrongNotes: 40, friends: 3,
      });
    }
    expect(await prisma.socialAccount.count({ where: { providerUserId: { startsWith: 'seed-demo' } } })).toBe(3);
    expect(await prisma.room.count()).toBe(2);
    expect(await snapshot()).toBe(before);
    const me = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(me).toMatchObject({ nickname: '데모관리', isAdmin: true });
    const h2h = await request(app.getHttpServer()).get('/api/admin/demo/seed/status').set('Authorization', auth(admin.id)).expect(200);
    expect(h2h.body).toEqual({ running: false });
  });

  it('fails with a clear error naming the topic when published questions are short', async () => {
    await prisma.question.updateMany({ where: { topicId: 'history' }, data: { status: 'draft' } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { nickname: '데모관리' } });
    const r = await request(app.getHttpServer()).post('/api/admin/demo/seed').set('Authorization', auth(admin.id)).send(CONFIRM).expect(409);
    expect(r.body).toMatchObject({ code: 'NOT_ENOUGH_QUESTIONS' });
    expect(r.body.message).toContain('역사/');
    // nothing was reset: the transaction rolled back
    expect(await prisma.solveLog.count({ where: { userId: admin.id } })).toBe(140);
    await prisma.question.updateMany({ where: { topicId: 'history' }, data: { status: 'published' } });
  });
});
