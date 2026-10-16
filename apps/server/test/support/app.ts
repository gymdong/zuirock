import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { CLOCK, type Clock } from '../../src/common/clock.js';
import { PrismaService } from '../../src/common/prisma.service.js';
import { RedisService } from '../../src/common/redis.service.js';
import { TokensService } from '../../src/common/tokens.service.js';
import { OAUTH_ADAPTERS, type OAuthAdapter, type OAuthAdapters, type OAuthProfile } from '../../src/modules/auth/oauth-providers.js';
import { TopicsService } from '../../src/modules/topics/topics.service.js';

export class FakeClock implements Clock {
  constructor(public t = Date.parse('2026-10-21T03:00:00Z')) {}
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

/** OAuth provider double: any code `ok:<providerUserId>` logs in; other codes fail. */
export function fakeAdapter(provider: OAuthAdapter['provider']): OAuthAdapter {
  return {
    provider,
    configured: () => true,
    authorizeUrl: ({ state, redirectUri }) => `https://fake.${provider}/authorize?state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    fetchProfile: async ({ code }): Promise<OAuthProfile> => {
      if (!code.startsWith('ok:')) throw new Error('bad code');
      const id = code.slice(3);
      return { providerUserId: id, nickname: `${provider}${id}`.slice(0, 12), avatarUrl: null };
    },
  };
}

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  redis: RedisService;
  tokens: TokensService;
  clock: FakeClock;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestApp> {
  const clock = new FakeClock();
  const adapters: OAuthAdapters = { kakao: fakeAdapter('kakao'), naver: fakeAdapter('naver'), google: fakeAdapter('google') };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(OAUTH_ADAPTERS)
    .useValue(adapters)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDb(prisma);
  await app.get(TopicsService).seed();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma,
    redis: app.get(RedisService),
    tokens: app.get(TokensService),
    clock,
    close: () => app.close(),
  };
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  const [{ db }] = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  if (!db.startsWith('zuirock_test_')) throw new Error(`resetDb refused on database ${db}`);
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

let seq = 0;

/** Inserts a question (published by default) and returns its id. */
export async function makeQuestion(
  prisma: PrismaClient,
  opts: { topicId?: string; subfield?: string; type?: 'mcq' | 'ox' | 'chosung'; difficulty?: number; status?: 'draft' | 'reviewed' | 'published' } = {},
): Promise<string> {
  const topicId = opts.topicId ?? 'science';
  const subfield = await prisma.subfield.findFirstOrThrow({ where: { topicId, ...(opts.subfield ? { name: opts.subfield } : {}) } });
  const type = opts.type ?? 'mcq';
  const n = ++seq;
  const q = await prisma.question.create({
    data: {
      topicId,
      subfieldId: subfield.id,
      type,
      difficulty: opts.difficulty ?? 1.5,
      question: `문제 ${n} ${topicId}`,
      normalizedText: `문제${n}${topicId}${Math.random()}`,
      answer: type === 'ox' ? 'O' : type === 'chosung' ? '세종대왕' : '정답',
      choices: type === 'mcq' ? ['정답', '오답1', '오답2', '오답3'] : [],
      explanation: '해설',
      sourceTitle: '출처',
      status: opts.status ?? 'published',
    },
  });
  return q.id;
}

/** Creates a member and returns its id and bearer header. */
export async function makeUser(t: TestApp, nickname = `u${++seq}`, isAdmin = false): Promise<{ userId: string; auth: string }> {
  const user = await t.prisma.user.create({ data: { nickname, isAdmin } });
  return { userId: user.id, auth: `Bearer ${t.tokens.signMember(user.id).token}` };
}
