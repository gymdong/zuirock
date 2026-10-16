import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kstDayStart } from '@zuirock/game-rules';
import { StreakService } from '../../src/modules/growth/streak.service.js';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';
import { addBattle, addSet, addXp } from '../support/history.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8, 2)]);

describe('pass 2 [L]: reports, deletion, friends, wardrobe, calibration, quest, history, streak job', () => {
  let t: TestApp;
  let admin: string;
  beforeAll(async () => {
    t = await createTestApp();
    admin = (await makeUser(t, '관리자2', true)).auth;
  });
  afterAll(() => t.close());

  it('issue reports: evidence required, one per user, 3 reporters suspend, admin resolves (AC-C6)', async () => {
    const q = await makeQuestion(t.prisma);
    const users = await Promise.all([1, 2, 3].map((i) => makeUser(t, `신고${i}`)));
    await t.http().post(`/api/questions/${q}/reports`).set('Authorization', users[0]!.auth).send({ reason: '정답 오류' }).expect(400);
    await t.http().post(`/api/questions/${q}/reports`).set('Authorization', users[0]!.auth).send({ reason: '정답 오류', evidenceUrl: 'ftp://x' }).expect(400);
    for (const [i, u] of users.entries()) {
      await t.http().post(`/api/questions/${q}/reports`).set('Authorization', u.auth).send({ reason: '정답 오류', evidenceText: `근거 ${i}` }).expect(201);
      expect((await t.prisma.question.findUniqueOrThrow({ where: { id: q } })).status).toBe(i < 2 ? 'published' : 'suspended');
    }
    await t.http().post(`/api/questions/${q}/reports`).set('Authorization', users[0]!.auth).send({ reason: 'x', evidenceText: 'y' }).expect(409);
    const list = await t.http().get('/api/admin/issue-reports?status=open').set('Authorization', admin).expect(200);
    const ids = list.body.filter((r: { questionId: string }) => r.questionId === q).map((r: { id: string }) => r.id);
    for (const id of ids) await t.http().post(`/api/admin/issue-reports/${id}/resolve`).set('Authorization', admin).send({ status: 'rejected', republish: true }).expect(200);
    expect((await t.prisma.question.findUniqueOrThrow({ where: { id: q } })).status).toBe('published');
  });

  it('calibration apply needs ≥ 30 solves and admin action (AC-C7)', async () => {
    const q = await makeQuestion(t.prisma, { difficulty: 4 });
    const { userId } = await makeUser(t);
    await t.http().post(`/api/admin/calibration/${q}/apply`).set('Authorization', admin).expect(400);
    // 30 solves (one per set)
    for (let i = 0; i < 30; i++) await addSet(t.prisma, { userId }, { kind: 'composite', day: i % 7, minute: i, questions: [q], correct: [true] });
    const r = await t.http().post(`/api/admin/calibration/${q}/apply`).set('Authorization', admin).expect(200);
    expect(r.body.difficulty).toBe(1);
  });

  it('friends: request/accept/delete on both sides, search, profile with head-to-head (AC-A5, AC-A6)', async () => {
    const a = await makeUser(t, '친구A');
    const b = await makeUser(t, '친구B');
    const s = await t.http().get('/api/users/search?nickname=친구').set('Authorization', a.auth).expect(200);
    expect(s.body.users.map((u: { nickname: string }) => u.nickname)).toEqual(['친구B']);
    await t.http().post('/api/friends/requests').set('Authorization', a.auth).send({ userId: b.userId }).expect(201);
    await t.http().get(`/api/friends/${b.userId}`).set('Authorization', a.auth).expect(403);
    const inc = await t.http().get('/api/friends').set('Authorization', b.auth).expect(200);
    expect(inc.body.incoming[0].user.userId).toBe(a.userId);
    await t.http().post(`/api/friends/${a.userId}/accept`).set('Authorization', b.auth).expect(200);
    for (const [me, other] of [[a, b], [b, a]] as const) {
      const l = await t.http().get('/api/friends').set('Authorization', me.auth).expect(200);
      expect(l.body.friends.map((f: { userId: string }) => f.userId)).toEqual([other.userId]);
    }
    const sess = await t.prisma.roomSession.create({ data: { room: { create: { code: '1111', settings: {} } }, seq: 1, settings: {}, questionIds: [], startedAt: new Date() } });
    for (const [u, rank] of [[a, 1], [b, 2]] as const) {
      await t.prisma.battleResult.create({ data: { roomSessionId: sess.id, participantId: u.userId, userId: u.userId, nickname: 'n', rank, score: 0, correctCount: 0, totalResponseMs: 0, participantCount: 2, memberKey: 'k', endedAt: new Date(), kstDay: new Date('2026-10-21T00:00:00Z') } });
    }
    const p = await t.http().get(`/api/friends/${b.userId}`).set('Authorization', a.auth).expect(200);
    expect(p.body).toMatchObject({ nickname: '친구B', level: { level: 1 }, headToHead: { played: 1, wins: 1, losses: 0 } });
    await t.http().delete(`/api/friends/${a.userId}`).set('Authorization', b.auth).expect(200);
    expect((await t.http().get('/api/friends').set('Authorization', a.auth)).body.friends).toEqual([]);
  });

  it('wardrobe: default owned, buy 80/150 with cheese, Lv.20 unlock, equip owned only (AC-G8, AC-G9)', async () => {
    await t.prisma.asset.create({ data: { key: 'a'.repeat(64), contentType: 'image/png', size: PNG.length, bytes: new Uint8Array(PNG) } });
    const img = 'a'.repeat(64);
    await t.prisma.item.createMany({
      data: [
        { id: 'hat-basic', slot: 'hat', name: '기본', imageKey: img, acquire: 'default', sortOrder: 0 },
        { id: 'hat-beret', slot: 'hat', name: '베레', imageKey: img, acquire: 'cheese', price: 80, sortOrder: 1 },
        { id: 'hat-crown', slot: 'hat', name: '왕관', imageKey: img, acquire: 'cheese', price: 150, sortOrder: 2 },
        { id: 'hat-lv', slot: 'hat', name: '탐험', imageKey: img, acquire: 'level', unlockLevel: 20, sortOrder: 3 },
      ],
    });
    const u = await makeUser(t);
    await t.prisma.cheeseLedger.create({ data: { userId: u.userId, delta: 100, reason: 'seed_adjust' } });
    let w = await t.http().get('/api/me/wardrobe').set('Authorization', u.auth).expect(200);
    expect(w.body.items.filter((i: { owned: boolean }) => i.owned).map((i: { id: string }) => i.id)).toEqual(['hat-basic']);
    expect(w.body.items[0].imageUrl).toBe(`/api/assets/${img}`);
    await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { hat: 'hat-beret' } }).expect(400);
    await t.http().post('/api/me/wardrobe/items/hat-crown/purchase').set('Authorization', u.auth).expect(400);
    const buy = await t.http().post('/api/me/wardrobe/items/hat-beret/purchase').set('Authorization', u.auth).expect(200);
    expect(buy.body.cheese).toBe(20);
    await t.http().post('/api/me/wardrobe/items/hat-beret/purchase').set('Authorization', u.auth).expect(409);
    await t.http().post('/api/me/wardrobe/items/hat-lv/purchase').set('Authorization', u.auth).expect(400);
    await addXp(t.prisma, u.userId, 1, 19 * 20 * 50); // 19000 XP = Lv.20
    w = await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { hat: 'hat-lv' } }).expect(200);
    expect(w.body.equipped).toEqual({ hat: 'hat-lv' });
    await t.http().put('/api/me/wardrobe/equipped').set('Authorization', u.auth).send({ equipped: { top: 'hat-basic' } }).expect(400);
    // AC-G9: swapping Item.imageKey changes the URL without code changes
    await t.prisma.asset.create({ data: { key: 'b'.repeat(64), contentType: 'image/png', size: PNG.length, bytes: new Uint8Array(PNG) } });
    await t.prisma.item.update({ where: { id: 'hat-basic' }, data: { imageKey: 'b'.repeat(64) } });
    w = await t.http().get('/api/me/wardrobe').set('Authorization', u.auth).expect(200);
    expect(w.body.items[0].imageUrl).toBe(`/api/assets/${'b'.repeat(64)}`);
  });

  it('quest: +50 XP with ≥ 7/10 on a weak subfield, once per week (AC-D5); history tab', async () => {
    const u = await makeUser(t, '퀘스트');
    const phys: string[] = [];
    for (let i = 0; i < 12; i++) phys.push(await makeQuestion(t.prisma, { subfield: '물리', difficulty: 1.5 }));
    // 30 solves this week (BASE+10 = 10-20), 물리 mostly wrong → top weakness
    for (let s = 0; s < 3; s++) await addSet(t.prisma, { userId: u.userId }, { kind: 'composite', day: 10, minute: s * 20, questions: phys.slice(0, 10), correct: phys.slice(0, 10).map((_, i) => i < 3) });
    await addBattle(t.prisma, { userId: u.userId }, { day: 10, minute: 90, questions: phys.slice(0, 2), correct: [true, false], rank: 1 });
    const weak = await t.http().get('/api/reports/weakness').set('Authorization', u.auth).expect(200);
    expect(weak.body.insufficientData).toBe(false);
    const subfieldId = weak.body.weaknesses[0].subfieldId;
    expect(weak.body.quest).toEqual({ subfieldId, completedThisWeek: false });
    const play = async () => {
      const s = await t.http().post('/api/solo/sets').set('Authorization', u.auth).send({ kind: 'quest', subfieldId }).expect(201);
      for (const [i, q] of s.body.questions.entries()) {
        await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', u.auth).send({ questionId: q.id, answer: i < 8 ? '정답' : '오답1', responseMs: 1, hintUsed: false }).expect(200);
      }
      return (await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/complete`).set('Authorization', u.auth).expect(200)).body;
    };
    expect((await play()).xp.granted).toBe(50);
    expect((await play()).xp).toMatchObject({ granted: 0, ineligibleReason: 'QUEST_ALREADY_GRANTED' });
    const h = await t.http().get('/api/reports/history').set('Authorization', u.auth).expect(200);
    expect(h.body).toMatchObject({ totalSolved: 52, battles: { played: 1, wins: 1, podiums: 1 } });
  });

  it('daily streak job judges yesterday with the 00:00 protections', async () => {
    const u = await makeUser(t);
    await t.prisma.streakState.create({ data: { userId: u.userId, current: 5, longest: 5, lastCountedDay: new Date('2026-10-18T00:00:00Z'), runStartDay: new Date('2026-10-14T00:00:00Z'), judgedThrough: new Date('2026-10-18T00:00:00Z') } });
    t.clock.t = kstDayStart('2026-10-21') + 60_000;
    expect(await t.app.get(StreakService).catchUpAll()).toBeGreaterThanOrEqual(1);
    const st = await t.prisma.streakState.findUniqueOrThrow({ where: { userId: u.userId } });
    expect(st.current).toBe(0);
    expect(st.judgedThrough!.toISOString().slice(0, 10)).toBe('2026-10-20');
  });

  it('AC-D7: learning-record deletion resets level/XP but keeps the account; withdrawal deletes everything', async () => {
    const u = await makeUser(t, '삭제');
    const q = await makeQuestion(t.prisma);
    await addSet(t.prisma, { userId: u.userId }, { kind: 'stage', level: 1, day: 1, questions: [q], correct: [false] });
    await addXp(t.prisma, u.userId, 1, 500);
    await t.prisma.wrongNote.create({ data: { userId: u.userId, questionId: q, firstWrongAt: new Date(), lastWrongAt: new Date() } });
    await t.prisma.cheeseLedger.create({ data: { userId: u.userId, delta: 30, reason: 'seed_adjust' } });
    const up = await t.http().post('/api/assets').set('Authorization', u.auth).attach('file', PNG, 'a.png').expect(201);
    await t.http().patch('/api/me').set('Authorization', u.auth).send({ avatarSource: 'upload', avatarAssetKey: up.body.key }).expect(200);

    await t.http().delete('/api/me/learning-records').set('Authorization', u.auth).expect(200);
    const me = await t.http().get('/api/me').set('Authorization', u.auth).expect(200);
    expect(me.body).toMatchObject({ level: { level: 1, totalXp: 0 }, cheese: 30 });
    for (const m of ['solveLog', 'setAttempt', 'wrongNote', 'xpLedger'] as const) {
      expect(await (t.prisma[m] as unknown as { count: (a: object) => Promise<number> }).count({ where: { userId: u.userId } })).toBe(0);
    }
    await t.http().delete('/api/me').set('Authorization', u.auth).expect(200);
    expect(await t.prisma.user.count({ where: { id: u.userId } })).toBe(0);
    expect(await t.prisma.cheeseLedger.count({ where: { userId: u.userId } })).toBe(0);
    expect(await t.prisma.asset.count({ where: { key: up.body.key } })).toBe(0);
    await t.http().get('/api/me').set('Authorization', u.auth).expect(401);
  });
});
