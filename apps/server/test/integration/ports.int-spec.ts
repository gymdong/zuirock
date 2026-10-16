import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addKstDays, kstDayStart, toKstDay } from '@zuirock/game-rules';
import { SOLVE_LOG_WRITER, STREAK_PORT, WRONG_NOTE_PORT, XP_GRANT_PORT, type SolveLogWriter, type StreakPort, type WrongNotePort, type XpGrantPort } from '../../src/ports/index.js';
import { StreakService } from '../../src/modules/growth/streak.service.js';
import { createTestApp, makeQuestion, makeUser, resetDb, type TestApp } from '../support/app.js';
import { TopicsService } from '../../src/modules/topics/topics.service.js';

describe('server ports (LC contract)', () => {
  let t: TestApp;
  let xp: XpGrantPort;
  let logs: SolveLogWriter;
  let notes: WrongNotePort;
  let streak: StreakPort;
  beforeAll(async () => {
    t = await createTestApp();
    xp = t.app.get(XP_GRANT_PORT);
    logs = t.app.get(SOLVE_LOG_WRITER);
    notes = t.app.get(WRONG_NOTE_PORT);
    streak = t.app.get(STREAK_PORT);
  });
  beforeEach(async () => {
    await resetDb(t.prisma);
    await t.app.get(TopicsService).seed();
  });
  afterAll(() => t.close());

  const battleSession = async () => {
    const room = await t.prisma.room.create({ data: { code: '1234', settings: {} } });
    return t.prisma.roomSession.create({ data: { roomId: room.id, seq: 1, settings: {}, questionIds: [], startedAt: new Date() } });
  };

  it('XP: battle grant with rank bonus, idempotent on (sourceType, sourceId, userId); guests get nothing', async () => {
    const { userId } = await makeUser(t);
    const q = await makeQuestion(t.prisma, { difficulty: 3 });
    const at = new Date(t.clock.now());
    const req = {
      ownerId: { kind: 'user' as const, userId },
      source: { type: 'battle' as const, id: 'br-1' },
      items: [{ questionId: q, correct: true, noHint: false, isReview: false, answeredAt: at }],
      kstDay: toKstDay(at.getTime()),
      context: { kind: 'battle' as const, rank: 1, rematch: false },
    };
    const first = await t.prisma.$transaction((tx) => xp.grant(tx, req));
    expect(first[0]!.amount).toBe(30 + 15);
    const again = await t.prisma.$transaction((tx) => xp.grant(tx, req));
    expect(again[0]!.id).toBe(first[0]!.id);
    expect(await t.prisma.xpLedger.count()).toBe(1);
    expect(await t.prisma.$transaction((tx) => xp.grant(tx, { ...req, ownerId: { kind: 'guest', guestId: 'x' } }))).toEqual([]);
  });

  it('XP: same-question decay from SolveLogs within 7 days and daily cap 3000', async () => {
    const { userId } = await makeUser(t);
    const q = await makeQuestion(t.prisma, { difficulty: 5 });
    const now = t.clock.now();
    const set = await t.prisma.setAttempt.create({ data: { userId, kind: 'composite', status: 'completed' } });
    await t.prisma.$transaction((tx) =>
      logs.writeMany(tx, [{ owner: { kind: 'user', userId }, questionId: q, mode: 'composite', correct: true, submitted: true, responseMs: 1, beforeReveal: null, hintUsed: false, attempts: 1, isReview: false, answeredAt: new Date(now - 86_400_000), setAttemptId: set.id }]),
    );
    const day = toKstDay(now);
    const item = { questionId: q, correct: true, noHint: false, isReview: false, answeredAt: new Date(now) };
    const [e] = await t.prisma.$transaction((tx) =>
      xp.grant(tx, { ownerId: { kind: 'user', userId }, source: { type: 'battle', id: 'b-decay' }, items: [item], kstDay: day, context: { kind: 'battle', rank: 4, rematch: false } }),
    );
    expect(e!.amount).toBe(37); // floor(50 × 1.5 weak topic × 0.5 decay)

    await t.prisma.xpLedger.create({ data: { userId, sourceType: 'battle', sourceId: 'filler', amount: 2990, preCapAmount: 2990, cappedAmount: 0, reason: 'x', breakdown: {}, configVersion: 'x', kstDay: new Date(`${day}T00:00:00Z`) } });
    const [capped] = await t.prisma.$transaction((tx) =>
      xp.grant(tx, { ownerId: { kind: 'user', userId }, source: { type: 'battle', id: 'b-cap' }, items: [], kstDay: day, context: { kind: 'battle', rank: 1, rematch: false } }),
    );
    expect(capped!.amount).toBe(0);
    expect(capped!.capReached).toBe(true);
  });

  it('XP: concurrent grants for one user/day never exceed the cap (advisory xact lock)', async () => {
    const { userId } = await makeUser(t);
    const day = toKstDay(t.clock.now());
    await t.prisma.xpLedger.create({ data: { userId, sourceType: 'battle', sourceId: 'filler', amount: 2980, preCapAmount: 2980, cappedAmount: 0, reason: 'x', breakdown: {}, configVersion: 'x', kstDay: new Date(`${day}T00:00:00Z`) } });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        t.prisma.$transaction((tx) =>
          xp.grant(tx, { ownerId: { kind: 'user', userId }, source: { type: 'battle', id: `c${i}` }, items: [], kstDay: day, context: { kind: 'battle', rank: 1, rematch: false } }),
        ),
      ),
    );
    const sum = await t.prisma.xpLedger.aggregate({ where: { userId }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(3000);
  });

  it('SolveLogWriter is idempotent per (battleResultId, questionId); guest owners allowed', async () => {
    const guest = await t.prisma.guest.create({ data: {} });
    const s = await battleSession();
    const br = await t.prisma.battleResult.create({ data: { roomSessionId: s.id, participantId: 'p1', guestId: guest.id, nickname: 'g', rank: 1, score: 0, correctCount: 0, totalResponseMs: 0, participantCount: 2, memberKey: 'k', endedAt: new Date(), kstDay: new Date('2026-10-21T00:00:00Z') } });
    const q = await makeQuestion(t.prisma);
    const log = { owner: { kind: 'guest' as const, guestId: guest.id }, questionId: q, mode: 'battle' as const, correct: false, submitted: false, responseMs: 0, beforeReveal: null, hintUsed: false, attempts: 1, isReview: false, answeredAt: new Date(t.clock.now()), battleResultId: br.id };
    await t.prisma.$transaction((tx) => logs.writeMany(tx, [log]));
    await t.prisma.$transaction((tx) => logs.writeMany(tx, [log]));
    const rows = await t.prisma.solveLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kstDay.toISOString().slice(0, 10)).toBe(toKstDay(t.clock.now()));
  });

  it('WrongNotePort: wrong → open (count), correct review → reviewed; guests no-op', async () => {
    const { userId } = await makeUser(t);
    const q = await makeQuestion(t.prisma);
    const owner = { kind: 'user' as const, userId };
    await t.prisma.$transaction((tx) => notes.recordResults(tx, owner, [{ questionId: q, correct: false, isReview: false, at: new Date(1) }]));
    await t.prisma.$transaction((tx) => notes.recordResults(tx, owner, [{ questionId: q, correct: false, isReview: false, at: new Date(2) }]));
    expect((await t.prisma.wrongNote.findFirstOrThrow()).wrongCount).toBe(2);
    await t.prisma.$transaction((tx) => notes.recordResults(tx, owner, [{ questionId: q, correct: true, isReview: true, at: new Date(3) }]));
    expect((await t.prisma.wrongNote.findFirstOrThrow()).status).toBe('reviewed');
    await t.prisma.$transaction((tx) => notes.recordResults(tx, { kind: 'guest', guestId: 'g' }, [{ questionId: q, correct: false, isReview: false, at: new Date(4) }]));
    expect(await t.prisma.wrongNote.count()).toBe(1);
  });

  it('StreakPort: idempotent per day, milestone cheese once per run, KST day boundary', async () => {
    const { userId } = await makeUser(t);
    const owner = { kind: 'user' as const, userId };
    const d0 = '2026-10-10';
    for (let i = 0; i < 3; i++) {
      await t.prisma.$transaction((tx) => streak.markActivity(tx, owner, addKstDays(d0, i), 'solo_set'));
      await t.prisma.$transaction((tx) => streak.markActivity(tx, owner, addKstDays(d0, i), 'battle'));
    }
    const st = await t.prisma.streakState.findUniqueOrThrow({ where: { userId } });
    expect(st.current).toBe(3);
    const cheese = await t.prisma.cheeseLedger.findMany({ where: { userId } });
    expect(cheese.map((c) => [c.milestone, c.delta])).toEqual([[3, 10]]);
    // 23:59:59 KST on 10-12 and 00:00 KST on 10-13 are different days
    expect(toKstDay(kstDayStart('2026-10-13') - 1)).toBe('2026-10-12');
  });

  it('protection bought after 00:00 KST is not used for the previous day (AC-G7) → broken, restorable for 100', async () => {
    const { userId, auth } = await makeUser(t);
    const owner = { kind: 'user' as const, userId };
    await t.prisma.cheeseLedger.create({ data: { userId, delta: 200, reason: 'seed_adjust' } });
    await t.prisma.$transaction((tx) => streak.markActivity(tx, owner, '2026-10-19', 'solo_set'));
    // 10-20 inactive. 00:10 KST on 10-21: buy a protection; judged lazily at 00:30.
    t.clock.t = kstDayStart('2026-10-21') + 10 * 60_000;
    await t.http().post('/api/me/streak/protections').set('Authorization', auth).expect(200);
    t.clock.t = kstDayStart('2026-10-21') + 30 * 60_000;
    const s = await t.http().get('/api/me/streak').set('Authorization', auth).expect(200);
    expect(s.body.current).toBe(0);
    expect(s.body.protections).toBe(1);
    expect(s.body.restorable).toMatchObject({ lostLength: 1, cost: 100 });
    const r = await t.http().post('/api/me/streak/restore').set('Authorization', auth).expect(200);
    expect(r.body.streak.current).toBe(1);
    expect(r.body.cheese).toBe(200 - 50 - 100);
  });

  it('protection held at the boundary is used automatically', async () => {
    const { userId, auth } = await makeUser(t);
    await t.prisma.cheeseLedger.create({ data: { userId, delta: 100, reason: 'seed_adjust', createdAt: new Date(kstDayStart('2026-10-01')) } });
    await t.prisma.cheeseLedger.create({ data: { userId, delta: -50, reason: 'protection_purchase', createdAt: new Date(kstDayStart('2026-10-19')) } });
    await t.prisma.$transaction((tx) => streak.markActivity(tx, { kind: 'user', userId }, '2026-10-19', 'battle'));
    t.clock.t = kstDayStart('2026-10-21') + 60_000;
    const s = await t.http().get('/api/me/streak').set('Authorization', auth).expect(200);
    expect(s.body).toMatchObject({ current: 1, protections: 0, restorable: null });
    expect(t.app.get(StreakService)).toBeDefined();
  });
});
