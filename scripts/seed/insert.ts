// Inserts the demo member A state (scripts/seed/demo-profile.ts) through the real server services:
// UsersService, SolveLogWriter, XpService, StreakService, WrongNotesService. Needs a built server
// (`pnpm turbo run build --filter=@zuirock/server`) and DATABASE_URL/REDIS_URL, e.g.
//   node --env-file=.env scripts/seed/insert.ts [--reset] [--dev-questions]
// --dev-questions is DEV ONLY: imports content/fixtures/dev-questions.json as *published* questions when the
// database has none (bypasses review). Never use it on the deployed database unless the D9 precondition needs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { TOPIC_ID_BY_NAME } from '@zuirock/shared';
import { toKstDay, kstDayStart } from '@zuirock/game-rules';
import { buildDemoProfile } from './demo-profile.ts';
import type { SeedSolve, SeedTopic } from './generators.ts';

const SEED_PROVIDER_PREFIX = 'seed-demo';
const dist = resolve(import.meta.dirname, '../../apps/server/dist');
const load = async (rel: string) => import(pathToFileURL(resolve(dist, rel)).href);

const reset = process.argv.includes('--reset');
const withDevQuestions = process.argv.includes('--dev-questions');

const { AppModule } = await load('app.module.js');
// HTTP app that is initialised but never listens: StaticModule needs an HTTP adapter.
const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
await app.init();
const get = <T>(cls: new (...a: never[]) => T): T => app.get(cls, { strict: false });

const { PrismaService } = await load('common/prisma.service.js');
const { UsersService } = await load('modules/users/users.service.js');
const { XpService } = await load('modules/growth/xp.service.js');
const { StreakService } = await load('modules/growth/streak.service.js');
const { WrongNotesService } = await load('modules/growth/wrong-notes.service.js');
const { SOLVE_LOG_WRITER } = await load('ports/solve-log-writer.port.js');
const prisma = get(PrismaService) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const users = get(UsersService) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const xp = get(XpService) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const streak = get(StreakService) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const wrongNotes = get(WrongNotesService) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
const solveLogWriter = app.get(SOLVE_LOG_WRITER, { strict: false });

async function deleteSeedUsers(): Promise<void> {
  const accounts = await prisma.socialAccount.findMany({
    where: { providerUserId: { startsWith: SEED_PROVIDER_PREFIX } },
    select: { userId: true },
  });
  const ids = accounts.map((a: { userId: string }) => a.userId);
  if (ids.length) await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function importDevQuestions(): Promise<void> {
  if ((await prisma.question.count({ where: { status: 'published' } })) > 0) return;
  const raw = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../content/fixtures/dev-questions.json'), 'utf8'));
  const norm = (t: string) => t.normalize('NFC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
  for (const q of raw) {
    const topicId = TOPIC_ID_BY_NAME[q.topic as keyof typeof TOPIC_ID_BY_NAME];
    const sub = await prisma.subfield.findUnique({ where: { topicId_name: { topicId, name: q.subfield } } });
    if (!sub) continue;
    await prisma.question.upsert({
      where: { normalizedText: norm(q.question) },
      update: {},
      create: {
        topicId, subfieldId: sub.id, type: q.type, difficulty: q.difficulty, question: q.question,
        normalizedText: norm(q.question), answer: q.answer, choices: q.choices ?? [], explanation: q.explanation,
        sourceTitle: q.source.title, sourceUrl: q.source.url ?? '', status: 'published', importBatch: 'dev-seed',
        publishedAt: new Date(),
      },
    });
  }
  console.log('[seed] DEV ONLY: published dev fixture questions');
}

if (reset) await deleteSeedUsers();
if (withDevQuestions) await importDevQuestions();
await deleteSeedUsers(); // idempotent: always rebuild A from scratch

const now = Date.now();
const profile = buildDemoProfile(now);
const user = await users.findOrCreateSocial('kakao', { providerUserId: `${SEED_PROVIDER_PREFIX}-a`, nickname: '쥐락A' });
const userId: string = user.id;
const topicIds = (Object.keys(profile.topicLevels) as SeedTopic[]).map((t) => TOPIC_ID_BY_NAME[t]);
await users.setTopics(userId, topicIds);
for (const [name, level] of Object.entries(profile.topicLevels)) {
  const topicId = TOPIC_ID_BY_NAME[name as SeedTopic];
  await prisma.topicProgress.upsert({
    where: { userId_topicId: { userId, topicId } },
    update: { highestClearedStage: level - 1, started: true },
    create: { userId, topicId, highestClearedStage: level - 1, started: true },
  });
}

// Published question pool per (topic, subfield).
// Science wrong answers are drawn from the easy (< ★2) questions so that battle 1 (★2+) never repeats a wrong-noted
// question: the wrong-note count then grows by exactly the number of battle mistakes (observation 4).
const pool = new Map<string, string[]>();
const published = await prisma.question.findMany({
  where: { status: 'published' },
  select: { id: true, topicId: true, difficulty: true, subfield: { select: { name: true } } },
  orderBy: { id: 'asc' },
});
for (const q of published) {
  const key = `${q.topicId}/${q.subfield.name}${q.topicId === 'science' && q.difficulty < 2 ? '/easy' : ''}`;
  pool.set(key, [...(pool.get(key) ?? []), q.id]);
}
const used = new Map<string, number>();
const pick = (s: SeedSolve): string => {
  const easyKey = `${TOPIC_ID_BY_NAME[s.topic]}/${s.subfield}/easy`;
  const key = s.topic === '과학' && !s.correct && pool.has(easyKey) ? easyKey : `${TOPIC_ID_BY_NAME[s.topic]}/${s.subfield}`;
  const ids = pool.get(key);
  if (!ids?.length) throw new Error(`no published question for ${key} (run with --dev-questions or approve content)`);
  const n = used.get(key) ?? 0;
  used.set(key, n + 1);
  return ids[n % ids.length]!;
};

// Solves are grouped into completed 10-question stage sets per topic (chronological).
const all = [...profile.olderSolves, ...profile.thisWeekSolves].sort((a, b) => a.at - b.at);
const byTopic = new Map<SeedTopic, SeedSolve[]>();
for (const s of all) byTopic.set(s.topic, [...(byTopic.get(s.topic) ?? []), s]);
let setNo = 0;
for (const [topic, solves] of byTopic) {
  for (let i = 0; i < solves.length; i += 10) {
    const chunk = solves.slice(i, i + 10);
    const questionIds = chunk.map(pick);
    const last = new Date(chunk[chunk.length - 1]!.at);
    const correctCount = chunk.filter((s) => s.correct).length;
    const kstDay = toKstDay(last.getTime());
    await prisma.$transaction(async (tx: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      const set = await tx.setAttempt.create({
        data: {
          userId, kind: 'stage', status: 'completed', topicId: TOPIC_ID_BY_NAME[topic],
          level: profile.topicLevels[topic], questionIds, correctCount, totalCount: chunk.length,
          passed: correctCount >= 7, startedAt: new Date(chunk[0]!.at), completedAt: last,
          kstDay: new Date(`${kstDay}T00:00:00.000Z`),
        },
      });
      const owner = { kind: 'user' as const, userId };
      await solveLogWriter.writeMany(tx, chunk.map((s, j) => ({
        owner, questionId: questionIds[j]!, mode: 'stage', correct: s.correct, submitted: true, responseMs: 8000,
        beforeReveal: null, hintUsed: false, attempts: 1, isReview: false, answeredAt: new Date(s.at), setAttemptId: set.id,
      })));
      await wrongNotes.recordResults(tx, owner, chunk.map((s, j) => ({ questionId: questionIds[j]!, correct: s.correct, isReview: false, at: new Date(s.at) })));
      await xp.grant(tx, {
        ownerId: owner, source: { type: 'stage', id: set.id }, kstDay,
        items: chunk.map((s, j) => ({ questionId: questionIds[j]!, correct: s.correct, noHint: false, isReview: false, answeredAt: new Date(s.at) })),
        context: { kind: 'stage', cleared: correctCount >= 7, firstClear: false },
      });
    });
    setNo += 1;
  }
}

// 28-day streak through the real streak logic (milestone cheese comes out of it).
for (const day of profile.streak.days) {
  await prisma.$transaction(async (tx: any) => streak.markActivity(tx, { kind: 'user', userId }, day, 'solo_set')); // eslint-disable-line @typescript-eslint/no-explicit-any
}
await streak.buyProtection(userId);
const balance: number = await users.cheeseBalance(userId);
await prisma.cheeseLedger.create({ data: { userId, delta: profile.cheese.target - balance, reason: 'seed_adjust' } });

// Friends (accepted friendships; Friendship rows are ordered low < high).
for (const f of profile.friends) {
  const fu = await users.findOrCreateSocial('kakao', { providerUserId: `${SEED_PROVIDER_PREFIX}-${f.nickname}`, nickname: f.nickname });
  const [low, high] = userId < fu.id ? [userId, fu.id] : [fu.id, userId];
  await prisma.friendship.create({ data: { userLowId: low, userHighId: high, requesterId: userId, status: 'accepted', acceptedAt: new Date(now) } });
}

// Member account the guest B logs into during the E2E merge step (no activity of its own).
const b = await users.findOrCreateSocial('kakao', { providerUserId: `${SEED_PROVIDER_PREFIX}-b`, nickname: '쥐락B' });
writeFileSync(resolve(import.meta.dirname, '../../e2e/.seed-user.json'), JSON.stringify({ userId, loginBId: b.id }));
console.log(`[seed] member A=${userId} sets=${setNo} week=${kstDayStart(toKstDay(now))} cheese=${await users.cheeseBalance(userId)}`);
console.log('[seed] note: battle records are not seeded (BattleResult needs real rooms); pass 3 if wanted');
await app.close();
