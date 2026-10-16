import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GuestsService } from '../../src/modules/guests/guests.service.js';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';
import { addBattle, addSet, addXp } from '../support/history.js';

describe('guest merge (AC-A2, AC-A3, D6-3)', () => {
  let t: TestApp;
  const qs: string[] = [];
  beforeAll(async () => {
    t = await createTestApp();
    for (let i = 0; i < 12; i++) qs.push(await makeQuestion(t.prisma, { difficulty: 2 }));
  });
  afterAll(() => t.close());

  async function guestWithHistory() {
    const g = await t.http().post('/api/guests').send({ nickname: '게스트B' }).expect(201);
    const guestId = g.body.guestId as string;
    const ten = qs.slice(0, 10);
    await addBattle(t.prisma, { guestId }, { day: 2, questions: ten, correct: ten.map((_, i) => i < 3), rank: 2 });
    await addSet(t.prisma, { guestId }, { kind: 'stage', level: 1, day: 3, questions: ten, correct: ten.map((_, i) => i < 8) });
    return { guestId, token: g.body.guestToken as string };
  }

  it('moves all four sources, freezes account XP, grants the re-judged guest share, re-derives', async () => {
    const { userId, auth } = await makeUser(t);
    await addXp(t.prisma, userId, 2, 2990);
    await t.prisma.weeklyReportSnapshot.create({ data: { userId, weekStart: new Date('2026-10-12T00:00:00Z'), payload: {}, configVersion: 't' } });
    const before = await t.prisma.xpLedger.findMany({ where: { userId } });
    const { guestId, token } = await guestWithHistory();

    const res = await t.http().post('/api/guests/merge').set('Authorization', auth).send({ guestToken: token }).expect(200);
    expect(res.body.moved).toEqual({ solveLogs: 20, setAttempts: 1, battleResults: 1, cheeseLedger: 0 });
    for (const m of ['solveLog', 'setAttempt', 'battleResult', 'cheeseLedger'] as const) {
      expect(await (t.prisma[m] as unknown as { count: (a: object) => Promise<number> }).count({ where: { guestId } })).toBe(0);
    }
    const after = await t.prisma.xpLedger.findMany({ where: { userId }, orderBy: { kstDay: 'asc' } });
    expect(after.filter((r) => !r.viaMerge)).toEqual(before);
    const merged = after.filter((r) => r.viaMerge);
    expect(merged.map((r) => r.sourceType).sort()).toEqual(['battle', 'stage']);
    // day 2 had 2990 already → battle share clipped to 10 (cap 3000)
    expect(merged.find((r) => r.sourceType === 'battle')!.amount).toBe(10);
    expect(res.body.xpGranted).toBe(merged.reduce((s, r) => s + r.amount, 0));
    expect(await t.prisma.wrongNote.count({ where: { userId } })).toBe(7); // q3..q9 (q8, q9 wrong twice)
    expect((await t.prisma.topicProgress.findFirstOrThrow({ where: { userId } })).highestClearedStage).toBe(1);
    expect(await t.prisma.weeklyReportSnapshot.count({ where: { userId } })).toBe(0);
    // streak rebuilt from the two activity days (10-12, 10-13)
    expect((await t.prisma.streakState.findUniqueOrThrow({ where: { userId } })).longest).toBe(2);
  });

  it('a merged guest cannot merge again (409); raw guestId / forged token → 401', async () => {
    const a = await makeUser(t);
    const b = await makeUser(t);
    const { guestId, token } = await guestWithHistory();
    await t.http().post('/api/guests/merge').set('Authorization', a.auth).send({ guestToken: token }).expect(200);
    const again = await t.http().post('/api/guests/merge').set('Authorization', b.auth).send({ guestToken: token }).expect(409);
    expect(again.body.code).toBe('GUEST_ALREADY_MERGED');
    await t.http().post('/api/guests/merge').set('Authorization', a.auth).send({ guestToken: token }).expect(409);
    await t.http().post('/api/guests/merge').set('Authorization', a.auth).send({ guestToken: guestId }).expect(401);
    await t.http().post('/api/guests/merge').send({ guestToken: token }).expect(401);
  });

  it('cleanup deletes unmerged guests unseen for 30 days with their records (AC-A3)', async () => {
    const old = await guestWithHistory();
    const keep = await guestWithHistory();
    await t.prisma.guest.update({ where: { id: old.guestId }, data: { lastSeenAt: new Date(t.clock.now() - 31 * 86_400_000) } });
    expect(await t.app.get(GuestsService).cleanup()).toBe(1);
    expect(await t.prisma.solveLog.count({ where: { guestId: old.guestId } })).toBe(0);
    expect(await t.prisma.solveLog.count({ where: { guestId: keep.guestId } })).toBe(20);
  });
});
