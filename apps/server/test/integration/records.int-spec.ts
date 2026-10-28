import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';

describe('multiplayer records + friend ranking (10/28)', () => {
  let t: TestApp;
  const qs: Record<string, string[]> = { science: [], history: [] };

  beforeAll(async () => {
    t = await createTestApp();
    for (const topicId of ['science', 'history']) for (let i = 0; i < 20; i++) qs[topicId]!.push(await makeQuestion(t.prisma, { topicId, difficulty: 1 + (i % 9) * 0.5 }));
  });
  afterAll(() => t.close());

  let seq = 0;
  /** One battle: `ranks` = [userId, rank][]; participantCount = people in the room. */
  async function battle(ranks: Array<[string, number]>, participantCount = ranks.length) {
    const code = String(5000 + ++seq);
    const sess = await t.prisma.roomSession.create({ data: { room: { create: { code, settings: {} } }, seq: 1, settings: {}, questionIds: [], startedAt: new Date() } });
    const out: Record<string, string> = {};
    for (const [userId, rank] of ranks) {
      const r = await t.prisma.battleResult.create({
        data: { roomSessionId: sess.id, participantId: userId, userId, nickname: 'n', rank, score: 0, correctCount: 0, totalResponseMs: 0, participantCount, memberKey: userId, endedAt: new Date(), kstDay: new Date('2026-10-28T00:00:00Z') },
      });
      out[userId] = r.id;
    }
    return out;
  }
  /** `n` battle answers of `userId` in `topic`, the first `correct` of them right (distinct questions per call via `from`). */
  async function answers(userId: string, battleResultId: string, topic: string, from: number, n: number, correct: number) {
    for (let i = 0; i < n; i++) {
      await t.prisma.solveLog.create({
        data: { userId, questionId: qs[topic]![from + i]!, mode: 'battle', correct: i < correct, responseMs: 1, answeredAt: new Date(), kstDay: new Date('2026-10-28T00:00:00Z'), battleResultId },
      });
    }
  }
  const befriend = (a: string, b: string) => {
    const [low, high] = [a, b].sort();
    return t.prisma.friendship.create({ data: { userLowId: low!, userHighId: high!, requesterId: a, status: 'accepted' } });
  };

  it('record: 1st = win, others = loss, lone rooms excluded; best topic needs 5 answers; ranking per mode among friends', async () => {
    const a = await makeUser(t, '전적A');
    const b = await makeUser(t, '전적B');
    const c = await makeUser(t, '전적C');
    const stranger = await makeUser(t, '남남');
    await befriend(a.userId, b.userId);
    await befriend(a.userId, c.userId);

    // A wins 2 of 3 against B, plus one 3-player room won by nobody of ours (A 3rd) and one room with only A (excluded)
    const g1 = await battle([[a.userId, 1], [b.userId, 2]]);
    const g2 = await battle([[a.userId, 1], [b.userId, 2]]);
    const g3 = await battle([[a.userId, 2], [b.userId, 1]]);
    const g4 = await battle([[a.userId, 3], [c.userId, 1]], 3);
    await battle([[a.userId, 1]], 1);
    // shared 1st place counts as a win for both
    const g5 = await battle([[b.userId, 1], [c.userId, 1]]);
    await answers(a.userId, g1[a.userId]!, 'science', 0, 8, 6); // science 6/8
    await answers(a.userId, g2[a.userId]!, 'history', 0, 4, 1); // history 1/4 (< 5: not eligible for best topic)
    await answers(b.userId, g3[b.userId]!, 'science', 8, 5, 5); // 5/5 but only 5 answers → not ranked
    await answers(c.userId, g5[c.userId]!, 'history', 4, 10, 9); // 9/10 → ranked, higher than A
    void g4;

    const r = await t.http().get('/api/rankings/friends').set('Authorization', a.auth).expect(200);
    expect(r.body.minAnswered).toBe(10);
    const byName = Object.fromEntries(r.body.entries.map((e: { nickname: string }) => [e.nickname, e]));
    expect(Object.keys(byName).sort()).toEqual(['전적A', '전적B', '전적C']); // not the stranger
    expect(byName['전적A']).toMatchObject({ isMe: true, record: { played: 4, wins: 2, losses: 2, winRate: 0.5, answered: 12, correct: 7 } });
    expect(byName['전적A'].record.bestTopic).toEqual({ topicId: 'science', correctRate: 0.75, answered: 8 });
    expect(byName['전적B'].record).toMatchObject({ played: 4, wins: 2, losses: 2 });
    expect(byName['전적C'].record).toMatchObject({ played: 2, wins: 2, answered: 10, correctRate: 0.9 });
    expect(byName['전적C'].record.bestTopic).toEqual({ topicId: 'history', correctRate: 0.9, answered: 10 });
    // multi ranking: C 90% > A 58% (12 answers); B has only 5 answers → unranked
    expect([byName['전적C'].multiRank, byName['전적A'].multiRank, byName['전적B'].multiRank]).toEqual([1, 2, null]);

    // solo ranking: cleared stages summed over topics (capped at each topic's stage count: 20 questions → 1 stage)
    await t.prisma.topicProgress.createMany({
      data: [
        { userId: a.userId, topicId: 'science', highestClearedStage: 1, started: true },
        { userId: a.userId, topicId: 'history', highestClearedStage: 7, started: true }, // capped to 1
        { userId: b.userId, topicId: 'science', highestClearedStage: 1, started: true },
      ],
    });
    const r2 = await t.http().get('/api/rankings/friends').set('Authorization', a.auth).expect(200);
    const e2 = Object.fromEntries(r2.body.entries.map((e: { nickname: string }) => [e.nickname, e]));
    expect([e2['전적A'].clearedStages, e2['전적B'].clearedStages, e2['전적C'].clearedStages]).toEqual([2, 1, 0]);
    expect([e2['전적A'].soloRank, e2['전적B'].soloRank, e2['전적C'].soloRank]).toEqual([1, 2, 3]);

    // a member without friends sees only themself; guests/anonymous are rejected
    const solo = await t.http().get('/api/rankings/friends').set('Authorization', stranger.auth).expect(200);
    expect(solo.body.entries).toHaveLength(1);
    expect(solo.body.entries[0]).toMatchObject({ isMe: true, soloRank: 1, multiRank: null, record: { played: 0, winRate: null, correctRate: null, bestTopic: null } });
    await t.http().get('/api/rankings/friends').expect(401);

    // friend profile carries the record too
    const p = await t.http().get(`/api/friends/${c.userId}`).set('Authorization', a.auth).expect(200);
    expect(p.body).toMatchObject({ record: { played: 2, wins: 2 }, clearedStages: 0 });
  });

  it('room records: participants only, members only, keyed by participantId', async () => {
    const host = await makeUser(t, '방장전적');
    const other = await makeUser(t, '구경꾼');
    const g = await battle([[host.userId, 1], [other.userId, 2]]);
    await answers(host.userId, g[host.userId]!, 'science', 0, 6, 6);
    const settings = { topicIds: ['science'], types: ['mcq'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null };
    const created = await t.http().post('/api/rooms').set('Authorization', host.auth).send({ settings }).expect(201);
    const r = await t.http().get(`/api/rooms/${created.body.code}/records`).set('Authorization', host.auth).expect(200);
    const rec = Object.values(r.body.records) as Array<{ played: number; wins: number; bestTopic: { topicId: string } }>;
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ played: 1, wins: 1, bestTopic: { topicId: 'science' } });
    await t.http().get(`/api/rooms/${created.body.code}/records`).set('Authorization', other.auth).expect(403);
    await t.http().get('/api/rooms/9999/records').set('Authorization', host.auth).expect(404);
    await t.http().get(`/api/rooms/${created.body.code}/records`).expect(401);
  });
});
