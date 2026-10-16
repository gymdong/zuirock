import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/common/prisma.service.js';
import { RedisService } from '../../src/common/redis.service.js';
import { TokensService } from '../../src/common/tokens.service.js';
import { TopicsService } from '../../src/modules/topics/topics.service.js';
import { RoomEngine } from '../../src/modules/rooms/room-engine.service.js';
import { RoomResultService } from '../../src/modules/rooms/room-result.service.js';
import { ROOM_CLOCK, ROOM_OPTIONS } from '../../src/modules/rooms/rooms.tokens.js';
import { FakeClock } from '../socket-sim/fakes/fakes.js';
import { resetDb } from '../support/app.js';

/** Full AppModule (real Prisma adapters, LB ports) with a fake room clock and an isolated `lc:` Redis prefix. */
export async function createRoomApp() {
  const clock = new FakeClock(Date.parse('2026-10-21T03:00:00Z'));
  const prefix = `lc:test:int:${randomUUID().slice(0, 8)}:`;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ROOM_CLOCK)
    .useValue(clock)
    .overrideProvider(ROOM_OPTIONS)
    .useValue({ keyPrefix: prefix, publicOrigin: 'https://zuirock.test' })
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error'] });
  app.setGlobalPrefix('api');
  await app.init();
  const prisma = app.get(PrismaService);
  await resetDb(prisma);
  await app.get(TopicsService).seed();
  const redis = app.get(RedisService);
  const tokens = app.get(TokensService);
  return {
    app,
    clock,
    prisma,
    tokens,
    engine: app.get(RoomEngine),
    results: app.get(RoomResultService),
    http: () => request(app.getHttpServer()),
    async member(nickname: string) {
      const user = await prisma.user.create({ data: { nickname } });
      return {
        userId: user.id,
        auth: `Bearer ${tokens.signMember(user.id).token}`,
        identity: { kind: 'user' as const, userId: user.id, nickname, avatarUrl: null },
      };
    },
    async close() {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
      await app.close();
    },
  };
}

export async function until<T>(fn: () => Promise<T>, ok: (v: T) => boolean, timeoutMs = 5000): Promise<T> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (ok(v)) return v;
    if (Date.now() > end) throw new Error('condition not met');
    await new Promise((r) => setTimeout(r, 25));
  }
}
