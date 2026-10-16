import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUESTION_POOL, type QuestionPool } from '../../src/modules/rooms/question-pool.js';
import { randomUUID } from 'node:crypto';
import { RedisService } from '../../src/common/redis.service.js';
import { RoomStore } from '../../src/modules/rooms/room-store.js';
import { makeQuestion } from '../support/app.js';
import { createRoomApp, until } from './lc-room-app.js';

/** AC-M10 against the real Prisma adapters and LB ports, plus the guest merge path (AC-A2). */
describe('room result recording (real DB)', () => {
  let t: Awaited<ReturnType<typeof createRoomApp>>;
  let roomCode = '';
  beforeAll(async () => {
    t = await createRoomApp();
    for (let i = 0; i < 6; i++) await makeQuestion(t.prisma, { topicId: 'science', type: 'mcq', difficulty: 2 });
  });
  afterAll(() => t.close());

  it('records BattleResult, SolveLog, XP with rank bonus, wrong notes, streak in one go; re-recording is a no-op; guest share merges', async () => {
    const a = await t.member('회원A');
    const c = await t.member('회원C');
    const g = await t.http().post('/api/guests').send({ nickname: '게스트B' }).expect(201);
    const guestId = g.body.guestId as string;

    const settings = { topicIds: ['science'], types: ['mcq'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null } as const;
    const { code } = await t.engine.createRoom(a.identity, { ...settings, topicIds: [...settings.topicIds], types: [...settings.types] });
    roomCode = code;
    const pa = await t.engine.join(a.identity, { code });
    const pc = await t.engine.join(c.identity, { code });
    const pb = await t.engine.join({ kind: 'guest', guestId }, { code, nickname: '게스트B' });
    await t.engine.ready(code, pc, true);
    await t.engine.ready(code, pb, true);
    expect((await t.engine.start(code, pa)).status).toBe('started');
    for (let i = 0; i < 5; i++) {
      await t.clock.advance(1000);
      await t.engine.submit(code, pa, i, '정답');
      await t.engine.submit(code, pb, i, i < 2 ? '정답' : '오답1');
      await t.engine.submit(code, pc, i, '오답1');
      await t.clock.advance(3000);
    }

    const rows = await until(
      () => t.prisma.battleResult.findMany({ orderBy: { rank: 'asc' } }),
      (r) => r.length === 3,
    );
    expect(rows.map((r) => [r.rank, r.correctCount, r.userId ?? r.guestId])).toEqual([
      [1, 5, a.userId],
      [2, 2, guestId],
      [3, 0, c.userId],
    ]);
    expect(rows.every((r) => r.participantCount === 3 && !r.rematch)).toBe(true);
    const ids = rows.map((r) => r.id);
    expect(await t.prisma.solveLog.count({ where: { battleResultId: { in: ids }, mode: 'battle' } })).toBe(15);
    expect(await t.prisma.solveLog.count({ where: { guestId } })).toBe(5);

    const xpA = await until(() => t.prisma.xpLedger.findMany({ where: { userId: a.userId } }), (x) => x.length === 1);
    expect(xpA[0]).toMatchObject({ sourceType: 'battle', sourceId: rows[0]!.id });
    expect((xpA[0]!.breakdown as { rankBonus: number }).rankBonus).toBe(15);
    const xpC = await t.prisma.xpLedger.findFirstOrThrow({ where: { userId: c.userId } });
    expect(xpC.amount).toBe(5); // all wrong: rank-3 bonus only
    expect(await t.prisma.wrongNote.count({ where: { userId: c.userId, status: 'open' } })).toBe(5);
    expect(await t.prisma.wrongNote.count({ where: { userId: a.userId } })).toBe(0);
    expect((await t.prisma.streakState.findUniqueOrThrow({ where: { userId: a.userId } })).current).toBeGreaterThanOrEqual(1);
    expect(await t.prisma.streakState.findUnique({ where: { userId: c.userId } })).not.toBeNull();
    expect((await t.prisma.roomSession.findFirstOrThrow()).endedAt).not.toBeNull();

    // idempotent re-recording
    const state = (await t.engine.getRoom(code))!;
    const questions = await t.app.get<QuestionPool>(QUESTION_POOL).loadQuestions(state.session!.questionIds);
    await t.results.record(state, questions);
    expect(await t.prisma.battleResult.count()).toBe(3);
    expect(await t.prisma.solveLog.count()).toBe(15);
    expect(await t.prisma.xpLedger.count()).toBe(2);
    expect((await t.prisma.wrongNote.findFirstOrThrow({ where: { userId: c.userId } })).wrongCount).toBe(1);

    // the guest logs in later and merges: account XP frozen, guest battle moves over
    const d = await t.member('회원D');
    await t.prisma.xpLedger.create({
      data: { userId: d.userId, sourceType: 'daily', sourceId: 'before', amount: 40, preCapAmount: 40, cappedAmount: 0, reason: 'x', breakdown: {}, configVersion: 't', kstDay: new Date('2026-10-21T00:00:00Z') },
    });
    const before = await t.prisma.xpLedger.findMany({ where: { userId: d.userId } });
    const merged = await t.http().post('/api/guests/merge').set('Authorization', d.auth).send({ guestToken: g.body.guestToken }).expect(200);
    expect(merged.body.moved).toMatchObject({ solveLogs: 5, battleResults: 1 });
    const after = await t.prisma.xpLedger.findMany({ where: { userId: d.userId } });
    expect(after.filter((x) => !x.viaMerge)).toEqual(before);
    expect(after.some((x) => x.viaMerge && x.sourceType === 'battle')).toBe(true);
    expect(await t.prisma.battleResult.count({ where: { userId: d.userId } })).toBe(1);
  });

  it('drops a pending record whose session is not in this database (real P2003) without retrying', async () => {
    const store = t.app.get(RoomStore);
    const state = (await t.engine.getRoom(roomCode))!;
    const sessionId = randomUUID();
    state.session!.sessionId = sessionId;
    const questions = await t.app.get<QuestionPool>(QUESTION_POOL).loadQuestions(state.session!.questionIds);
    await store.savePending(sessionId, { code: roomCode, state, questions, createdAt: t.clock.now(), attempts: 0 });
    await until(() => store.listPending(), (ids) => !ids.includes(sessionId), 8000); // picked up by the recovery scan
    expect(await store.loadPending(sessionId)).toBeNull();
    expect(await t.app.get(RedisService).keys(`*pending-dead:${sessionId}`)).toEqual([]); // dropped, not dead-lettered
    expect(await t.prisma.battleResult.count({ where: { roomSessionId: sessionId } })).toBe(0);
  });
});
