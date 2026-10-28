import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addKstDays, kstDayStart, kstWeekStart, toKstDay } from '@zuirock/game-rules';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';

describe('solo sets + reports (AC-S1~S8, AC-G2~G4, AC-D2~D4)', () => {
  let t: TestApp;
  let auth: string;
  let userId: string;
  const types = new Map<string, string>();

  beforeAll(async () => {
    t = await createTestApp();
    for (const topicId of ['science', 'history']) {
      for (const d of [1, 1.5, 2, 1, 1.5, 2, 1, 1.5, 2, 1, 1.5, 2, 1, 2, 2.5, 3, 3.5, 4, 4.5, 5, 2.5, 3, 3.5, 4, 4.5, 5]) {
        const type = d === 2 ? 'chosung' : 'mcq';
        types.set(await makeQuestion(t.prisma, { topicId, difficulty: d, type }), type);
      }
    }
    ({ userId, auth } = await makeUser(t, '솔로'));
    await t.http().put('/api/me/topics').set('Authorization', auth).send({ topicIds: ['science', 'history'] }).expect(200);
  });
  afterAll(() => t.close());

  const answerFor = (id: string, correct: boolean) =>
    types.get(id) === 'chosung' ? (correct ? '세종 대왕' : 'ㅁㅁ') : correct ? '정답' : '오답1';

  /** Starts a set and answers the first `correctN` questions correctly. */
  async function play(body: object, correctN: number, as = auth) {
    const s = await t.http().post('/api/solo/sets').set('Authorization', as).send(body).expect(201);
    for (const [i, q] of s.body.questions.entries()) {
      const ok = i < correctN;
      const r = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', as)
        .send({ questionId: q.id, answer: answerFor(q.id, ok), responseMs: 1000, hintUsed: false });
      if (r.status !== 200) throw new Error(JSON.stringify(r.body));
      if (!r.body.final) await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/give-up`).set('Authorization', as).send({ questionId: q.id }).expect(200);
    }
    const done = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/complete`).set('Authorization', as).expect(200);
    return { session: s.body, result: done.body };
  }

  it('stage: 7/10 clears (first clear XP), replay is idempotent, 6/10 keeps the level (AC-S1, AC-G2)', async () => {
    const { session, result } = await play({ kind: 'stage', topicId: 'science' }, 7);
    expect(session.questions).toHaveLength(10);
    expect(session.questions.every((q: { difficulty: number }) => q.difficulty >= 1 && q.difficulty <= 2)).toBe(true);
    expect(result).toMatchObject({ passed: true, firstClear: true, topicLevel: 2, streakCounted: true, wrongNotesAdded: 3 });
    expect(result.xp.granted).toBeGreaterThan(0);
    const again = await t.http().post(`/api/solo/sets/${session.setAttemptId}/complete`).set('Authorization', auth).expect(200);
    expect(again.body.xp.granted).toBe(result.xp.granted);
    expect(await t.prisma.xpLedger.count({ where: { userId } })).toBe(1);

    const fail = await play({ kind: 'stage', topicId: 'science' }, 6);
    expect(fail.result).toMatchObject({ passed: false, topicLevel: 2 });
    expect(fail.result.xp.granted).toBe(0);
    // every final answer became a SolveLog with the set's mode (AC-D1)
    expect(await t.prisma.solveLog.count({ where: { userId, mode: 'stage' } })).toBe(20);
  });

  it('wrong-note questions are mixed into later sets, at most 2 (AC-S6)', async () => {
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'stage', topicId: 'history' }).expect(201);
    expect(s.body.reviewQuestionIds.length).toBe(2);
    expect(s.body.questions).toHaveLength(10);
  });

  it('hint: chosung only, authoritative, removes the no-hint flag (AC-S5)', async () => {
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'composite' }).expect(201);
    const qs = s.body.questions as Array<{ id: string; type: string }>;
    const ch = qs.find((q) => q.type === 'chosung');
    const mcq = qs.find((q) => q.type === 'mcq')!;
    await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/hint`).set('Authorization', auth).send({ questionId: mcq.id }).expect(400);
    await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/hint`).set('Authorization', auth).send({ questionId: '00000000-0000-0000-0000-000000000000' }).expect(400);
    if (ch) {
      const h = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/hint`).set('Authorization', auth).send({ questionId: ch.id }).expect(200);
      expect(h.body).toEqual({ questionId: ch.id, chosung: 'ㅅㅈㄷㅇ' });
      await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', auth)
        .send({ questionId: ch.id, answer: '세종대왕', responseMs: 5, hintUsed: false }).expect(200);
      const log = await t.prisma.solveLog.findFirstOrThrow({ where: { setAttemptId: s.body.setAttemptId, questionId: ch.id } });
      expect(log).toMatchObject({ hintUsed: true, beforeReveal: false, correct: true });
    }
  });

  it('composite/daily: XP only ≥ 7/10, daily once per KST day, topic level unchanged (AC-G3, AC-S8)', async () => {
    const before = await t.http().get('/api/me/topics/science').set('Authorization', auth).expect(200);
    const low = await play({ kind: 'composite' }, 6);
    expect(low.result.xp).toMatchObject({ granted: 0, ineligibleReason: 'BELOW_PASS' });
    const d1 = await play({ kind: 'daily' }, 8);
    expect(d1.result.xp.granted).toBeGreaterThan(0);
    const d2 = await play({ kind: 'daily' }, 8);
    expect(d2.result.xp).toMatchObject({ granted: 0, ineligibleReason: 'DAILY_ALREADY_GRANTED' });
    const st = await t.http().get('/api/solo/daily').set('Authorization', auth).expect(200);
    expect(st.body).toMatchObject({ completed: true, xpGranted: true });
    const after = await t.http().get('/api/me/topics/science').set('Authorization', auth).expect(200);
    expect(after.body.level).toBe(before.body.level);
    const plan = await t.http().get('/api/solo/composite/plan').set('Authorization', auth).expect(200);
    expect(plan.body.total).toBe(10);
  });

  it('leaving mid-set: abandon drops the answers; a half-played daily set is replaced, not resumed (10/27)', async () => {
    const answerFirst = async (setId: string, q: { id: string }) => {
      const r = await t.http().post(`/api/solo/sets/${setId}/answers`).set('Authorization', auth)
        .send({ questionId: q.id, answer: answerFor(q.id, true), responseMs: 1000, hintUsed: false }).expect(200);
      expect(r.body.final).toBe(true);
    };
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'stage', topicId: 'science' }).expect(201);
    await answerFirst(s.body.setAttemptId, s.body.questions[0]);
    await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/abandon`).set('Authorization', auth).expect(204);
    expect(await t.prisma.solveLog.count({ where: { setAttemptId: s.body.setAttemptId } })).toBe(0);
    expect((await t.prisma.setAttempt.findUniqueOrThrow({ where: { id: s.body.setAttemptId } })).status).toBe('abandoned');
    await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', auth)
      .send({ questionId: s.body.questions[1].id, answer: 'x', responseMs: 1000, hintUsed: false }).expect(409);
    await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/abandon`).set('Authorization', auth).expect(204);

    // Daily: left without the dialog (app killed) → re-entry gets a new set and question 1 is answerable.
    const d1 = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'daily' }).expect(201);
    await answerFirst(d1.body.setAttemptId, d1.body.questions[0]);
    const d2 = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'daily' }).expect(201);
    expect(d2.body.setAttemptId).not.toBe(d1.body.setAttemptId);
    await answerFirst(d2.body.setAttemptId, d2.body.questions[0]);
    expect((await t.prisma.setAttempt.findUniqueOrThrow({ where: { id: d1.body.setAttemptId } })).status).toBe('abandoned');
    await t.http().post(`/api/solo/sets/${d2.body.setAttemptId}/abandon`).set('Authorization', auth).expect(204);
  });

  it('basic test: 8/10 jumps to the checkpoint, skipped stages are cleared without XP (AC-S4)', async () => {
    const { result } = await play({ kind: 'basic_test', topicId: 'history', checkpointLevel: 10 }, 8);
    expect(result).toMatchObject({ passed: true, topicLevel: 10 });
    expect(result.xp.ineligibleReason).toBe('NO_XP_MODE');
    const conf = await t.http().post('/api/solo/topics/history/start').set('Authorization', auth).send({ level: 10, setAttemptId: result.setAttemptId }).expect(200);
    expect(conf.body.level).toBe(10);
  });

  it('placement: 15 adaptive questions from ★2.5, then a start-level choice (AC-S3)', async () => {
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'placement', topicId: 'science' }).expect(201);
    const id = s.body.setAttemptId;
    let next = await t.http().post(`/api/solo/sets/${id}/next`).set('Authorization', auth).expect(200);
    expect(next.body.difficulty).toBe(2.5);
    while (!next.body.done) {
      await t.http().post(`/api/solo/sets/${id}/answers`).set('Authorization', auth)
        .send({ questionId: next.body.question.id, answer: answerFor(next.body.question.id, true), responseMs: 1, hintUsed: false }).expect(200);
      next = await t.http().post(`/api/solo/sets/${id}/next`).set('Authorization', auth).expect(200);
    }
    expect(next.body.result.recommendedLevel).toBeGreaterThan(1);
    await t.http().post(`/api/solo/sets/${id}/complete`).set('Authorization', auth).expect(200);
    await t.http().post('/api/solo/topics/science/start').set('Authorization', auth).send({ level: 99, setAttemptId: id }).expect(400);
    const ok = await t.http().post('/api/solo/topics/science/start').set('Authorization', auth).send({ level: next.body.result.recommendedLevel, setAttemptId: id }).expect(200);
    expect(ok.body.level).toBe(next.body.result.recommendedLevel);
  });

  it('guest: logs recorded, no XP, "최대 N XP" preview (D6-6)', async () => {
    const g = await t.http().post('/api/guests').send({}).expect(201);
    const { result } = await play({ kind: 'stage', topicId: 'science' }, 9, `Bearer ${g.body.guestToken}`);
    expect(result.xp).toMatchObject({ granted: 0, ineligibleReason: 'GUEST' });
    expect(result.xp.guestPreviewMax).toBeGreaterThan(0);
  });

  it('reports: live week, insufficient data < 30, weaknesses ≥ 30, lazy past-week snapshot', async () => {
    const w = await t.http().get('/api/reports/weekly/current').set('Authorization', auth).expect(200);
    const solved = await t.prisma.solveLog.count({
      where: { userId, answeredAt: { gte: new Date(kstDayStart(kstWeekStart(toKstDay(t.clock.now())))) } },
    });
    expect(w.body).toMatchObject({ finalized: false, solved });
    const weak = await t.http().get('/api/reports/weakness').set('Authorization', auth).expect(200);
    expect(weak.body.insufficientData).toBe(solved < 30);
    if (!weak.body.insufficientData) expect(weak.body.weaknesses.length).toBeGreaterThan(0);
    expect(weak.body.weakTopics.length).toBeGreaterThan(0);

    const thisWeek = w.body.weekStart;
    t.clock.t = kstDayStart(addKstDays(thisWeek, 7)) + 3_600_000; // next Monday 01:00 KST
    const past = await t.http().get(`/api/reports/weekly/${thisWeek}`).set('Authorization', auth).expect(200);
    expect(past.body).toMatchObject({ finalized: true, solved });
    expect(await t.prisma.weeklyReportSnapshot.count({ where: { userId } })).toBe(1);
    const fresh = await t.http().get('/api/reports/weakness').set('Authorization', auth).expect(200);
    expect(fresh.body).toMatchObject({ weeklySolved: 0, insufficientData: true, diagnostic: { questionCount: 10 } });
  });
});
