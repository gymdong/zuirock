import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { QUESTION_POOL, type QuestionPool } from '../../src/modules/rooms/question-pool.js';
import { makeQuestion } from '../support/app.js';
import { createRoomApp } from './lc-room-app.js';

/** 최근 푼 문제 덜 나오게: PrismaQuestionPool.recentSolveCounts against the real SolveLog table. */
describe('recent solve counts (real DB)', () => {
  let t: Awaited<ReturnType<typeof createRoomApp>>;
  const q: string[] = [];
  beforeAll(async () => {
    t = await createRoomApp();
    for (let i = 0; i < 4; i++) q.push(await makeQuestion(t.prisma, { topicId: 'science', type: 'mcq', difficulty: 2 }));
  });
  afterAll(() => t.close());

  // SolveLog must point at a set or a battle result (SolveLog_source_check) and is unique per set+question:
  // each test solve gets its own set.
  const solve = async (owner: { userId?: string; guestId?: string }, questionId: string, minutesAgo: number) => {
    const set = await t.prisma.setAttempt.create({ data: { ...owner, kind: 'composite', questionIds: [], reviewQuestionIds: [] } });
    const at = new Date(Date.now() - minutesAgo * 60_000);
    return t.prisma.solveLog.create({
      data: { ...owner, questionId, mode: 'composite', correct: true, responseMs: 1000, answeredAt: at, kstDay: new Date(at.toISOString().slice(0, 10)), setAttemptId: set.id },
    });
  };

  it("counts each participant once per question, only within their latest N solves; guests' logs count too", async () => {
    const a = await t.member('최근A');
    const b = await t.member('최근B');
    const guest = await t.prisma.guest.create({ data: { nickname: '최근게스트' } });
    // A: q0 twice (counted once) and q1; q2 is older than A's latest 3 solves.
    await solve({ userId: a.userId }, q[2]!, 50);
    await solve({ userId: a.userId }, q[0]!, 3);
    await solve({ userId: a.userId }, q[0]!, 2);
    await solve({ userId: a.userId }, q[1]!, 1);
    await solve({ userId: b.userId }, q[0]!, 5);
    await solve({ guestId: guest.id }, q[3]!, 5);

    const pool = t.app.get<QuestionPool>(QUESTION_POOL);
    const counts = await pool.recentSolveCounts(
      [
        { userId: a.userId, guestId: null },
        { userId: b.userId, guestId: null },
        { userId: null, guestId: guest.id },
      ],
      3,
    );
    expect(counts).toEqual({ [q[0]!]: 2, [q[1]!]: 1, [q[3]!]: 1 });
    expect(await pool.recentSolveCounts([{ userId: null, guestId: null }], 100)).toEqual({});
  });
});
