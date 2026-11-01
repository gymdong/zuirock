import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kstDayStart, toKstDay } from '@zuirock/game-rules';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';

describe('daily quests (11/1): progress from today\'s records, one chest per quest, bonus chest', () => {
  let t: TestApp;
  const questionIds: string[] = [];
  const dayDate = () => new Date(`${toKstDay(t.clock.now())}T00:00:00Z`);
  beforeAll(async () => {
    t = await createTestApp();
    for (let i = 0; i < 22; i++) questionIds.push(await makeQuestion(t.prisma, { topicId: 'science', difficulty: 1 + (i % 9) * 0.5 }));
  });
  afterAll(() => t.close());

  const quests = async (auth: string) => (await t.http().get('/api/me/quests').set('Authorization', auth).expect(200)).body;
  const claim = (auth: string, id: string) => t.http().post(`/api/me/quests/${id}/claim`).set('Authorization', auth);

  it('starts empty; claiming an unfinished quest is 409; unknown quest is 404', async () => {
    const u = await makeUser(t);
    const q = await quests(u.auth);
    expect(q.quests.map((x: { id: string; progress: number; target: number; done: boolean }) => [x.id, x.progress, x.target, x.done])).toEqual([
      ['stage', 0, 1, false],
      ['battle', 0, 1, false],
      ['correct', 0, 20, false],
    ]);
    expect(q.claimable).toBe(0);
    expect(q.bonus).toMatchObject({ done: false, claimed: false, cleared: 0, total: 3, tier: 'good' });
    expect(new Date(q.resetsAt).getTime()).toBe(kstDayStart(toKstDay(t.clock.now() + 24 * 3600_000)));
    expect((await claim(u.auth, 'stage').expect(409)).body.code).toBe('QUEST_NOT_DONE');
    await claim(u.auth, 'nope').expect(404);
  });

  it('stage set + battle + 20 correct answers clear the quests; each claim gives one chest, idempotently', async () => {
    const u = await makeUser(t);
    await t.prisma.setAttempt.create({ data: { userId: u.userId, kind: 'stage', status: 'completed', topicId: 'science', level: 1, questionIds: [], reviewQuestionIds: [], kstDay: dayDate(), completedAt: new Date() } });
    // a skipped placement stage and yesterday's set do not count
    await t.prisma.setAttempt.create({ data: { userId: u.userId, kind: 'stage', status: 'completed', skipped: true, topicId: 'science', level: 2, questionIds: [], reviewQuestionIds: [], kstDay: dayDate(), completedAt: new Date() } });
    await t.prisma.setAttempt.create({ data: { userId: u.userId, kind: 'stage', status: 'completed', topicId: 'science', level: 3, questionIds: [], reviewQuestionIds: [], kstDay: new Date(dayDate().getTime() - 86_400_000), completedAt: new Date() } });
    let q = await quests(u.auth);
    expect(q.quests[0]).toMatchObject({ progress: 1, done: true, claimed: false });
    expect(q.claimable).toBe(1);

    const sess = await t.prisma.roomSession.create({ data: { room: { create: { code: '7001', settings: {} } }, seq: 1, settings: {}, questionIds: [], startedAt: new Date() } });
    const battle = await t.prisma.battleResult.create({ data: { roomSessionId: sess.id, participantId: u.userId, userId: u.userId, nickname: 'n', rank: 2, score: 0, correctCount: 0, totalResponseMs: 0, participantCount: 2, memberKey: u.userId, endedAt: new Date(), kstDay: dayDate() } });
    const log = (i: number, correct: boolean, submitted = true) =>
      t.prisma.solveLog.create({ data: { userId: u.userId, questionId: questionIds[i]!, mode: 'battle', correct, submitted, responseMs: 1, answeredAt: new Date(), kstDay: dayDate(), battleResultId: battle.id } });
    for (let i = 0; i < 19; i++) await log(i, true);
    q = await quests(u.auth);
    expect(q.quests[2]).toMatchObject({ progress: 19, target: 20, done: false });
    // wrong and unsubmitted answers do not count
    await log(20, false);
    await log(21, false, false);
    expect((await quests(u.auth)).quests[2].progress).toBe(19);
    await log(19, true);
    q = await quests(u.auth);
    expect(q.quests.map((x: { done: boolean }) => x.done)).toEqual([true, true, true]);
    expect(q.bonus).toMatchObject({ done: true, cleared: 3 });
    expect(q.claimable).toBe(4);

    const first = (await claim(u.auth, 'stage').expect(200)).body.chest;
    expect(first).toMatchObject({ tier: 'quest', opened: false });
    // same chest on a second claim, no duplicate row
    expect((await claim(u.auth, 'stage').expect(200)).body.chest.id).toBe(first.id);
    for (const id of ['battle', 'correct', 'all']) await claim(u.auth, id).expect(200);
    expect(await t.prisma.chest.count({ where: { userId: u.userId } })).toBe(4);
    expect((await t.prisma.chest.findMany({ where: { userId: u.userId }, orderBy: { questKey: 'asc' } })).map((c) => c.tier)).toEqual(['good', 'quest', 'quest', 'quest']);

    q = await quests(u.auth);
    expect(q.claimable).toBe(0);
    expect(q.quests.every((x: { claimed: boolean }) => x.claimed)).toBe(true);

    // the chest opens through the normal chest endpoint and is then reported as opened
    const opened = (await t.http().post(`/api/me/chests/${first.id}/open`).set('Authorization', u.auth).expect(200)).body;
    expect(opened.rewards.length).toBeGreaterThan(0);
    expect(opened.rewards[0]).toMatchObject({ type: 'cheese' });
    expect((await claim(u.auth, 'stage').expect(200)).body.chest).toMatchObject({ id: first.id, opened: true });
    const inv = (await t.http().get('/api/me/inventory').set('Authorization', u.auth).expect(200)).body;
    expect(inv.chests.map((c: { quest?: string; source: unknown }) => [c.quest, c.source]).sort()).toEqual([['all', null], ['battle', null], ['correct', null]]);
  });

  it('a new KST day starts the quests over (yesterday\'s claims do not carry)', async () => {
    const u = await makeUser(t);
    await t.prisma.setAttempt.create({ data: { userId: u.userId, kind: 'stage', status: 'completed', topicId: 'science', level: 1, questionIds: [], reviewQuestionIds: [], kstDay: dayDate(), completedAt: new Date() } });
    await claim(u.auth, 'stage').expect(200);
    t.clock.t += 24 * 3600_000;
    const q = await quests(u.auth);
    expect(q.quests[0]).toMatchObject({ progress: 0, done: false, claimed: false });
  });
});
