import { kstDayStart, addKstDays } from '@zuirock/game-rules';
import type { PrismaClient } from '@prisma/client';

/** mulberry32: deterministic rng for generated histories. */
export function rngFrom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Owner = { userId: string } | { guestId: string };
const BASE = '2026-10-10';
export const dayAt = (d: number, minute = 0) => new Date(kstDayStart(addKstDays(BASE, d)) + 3_600_000 + minute * 60_000);
const dateOf = (d: number) => new Date(`${addKstDays(BASE, d)}T00:00:00Z`);

/** One completed solo set with its SolveLogs. */
export async function addSet(
  p: PrismaClient,
  owner: Owner,
  o: { kind: 'stage' | 'composite' | 'daily'; day: number; minute?: number; questions: string[]; correct: boolean[]; level?: number },
): Promise<string> {
  const at = dayAt(o.day, o.minute);
  const correctCount = o.correct.filter(Boolean).length;
  const set = await p.setAttempt.create({
    data: {
      ...owner,
      kind: o.kind,
      status: 'completed',
      topicId: 'science',
      level: o.level ?? null,
      questionIds: o.questions,
      correctCount,
      totalCount: o.questions.length,
      passed: correctCount >= 7,
      completedAt: at,
      kstDay: dateOf(o.day),
    },
  });
  await p.solveLog.createMany({
    data: o.questions.map((questionId, i) => ({
      ...owner,
      questionId,
      mode: o.kind,
      correct: o.correct[i]!,
      responseMs: 1000,
      answeredAt: new Date(at.getTime() - (o.questions.length - i) * 1000),
      kstDay: dateOf(o.day),
      setAttemptId: set.id,
    })),
  });
  return set.id;
}

/** One battle result with its SolveLogs (own room session). */
export async function addBattle(
  p: PrismaClient,
  owner: Owner,
  o: { day: number; minute?: number; questions: string[]; correct: boolean[]; rank: number; rematch?: boolean },
): Promise<string> {
  const at = dayAt(o.day, o.minute);
  const room = await p.room.create({ data: { code: '0000', settings: {} } });
  const session = await p.roomSession.create({ data: { roomId: room.id, seq: 1, settings: {}, questionIds: o.questions, startedAt: at } });
  const br = await p.battleResult.create({
    data: {
      ...owner,
      roomSessionId: session.id,
      participantId: 'p',
      nickname: 'n',
      rank: o.rank,
      score: 0,
      correctCount: o.correct.filter(Boolean).length,
      totalResponseMs: 0,
      participantCount: 4,
      memberKey: 'k',
      rematch: o.rematch ?? false,
      endedAt: at,
      kstDay: dateOf(o.day),
    },
  });
  await p.solveLog.createMany({
    data: o.questions.map((questionId, i) => ({
      ...owner,
      questionId,
      mode: 'battle' as const,
      correct: o.correct[i]!,
      responseMs: 1000,
      answeredAt: new Date(at.getTime() - (o.questions.length - i) * 1000),
      kstDay: dateOf(o.day),
      battleResultId: br.id,
    })),
  });
  return br.id;
}

export async function addXp(p: PrismaClient, userId: string, day: number, amount: number, sourceType: 'battle' | 'daily' | 'stage' = 'battle', sourceId = `acct-${Math.random()}`) {
  await p.xpLedger.create({
    data: { userId, sourceType, sourceId, amount, preCapAmount: amount, cappedAmount: 0, reason: 'account', breakdown: {}, configVersion: 't', kstDay: dateOf(day) },
  });
}
