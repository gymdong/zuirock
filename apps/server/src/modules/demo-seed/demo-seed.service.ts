import { randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildDemoProfile, type SeedSolve, type SeedTopic } from '@zuirock/demo-seed';
import { applyStreakDay, toKstDay, type GrowthConfig, type StreakEvent, type StreakState } from '@zuirock/game-rules';
import { MVP_TOPIC_IDS, TOPIC_ID_BY_NAME, type TopicId } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { ApiError, badRequest, conflict } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dayToDate } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/tx.js';
import { LearningReportsService } from '../learning-reports/learning-reports.service.js';
import { SocialService } from '../social/social.module.js';
import { SoloService } from '../solo/solo.service.js';
import { StreakService } from '../growth/streak.service.js';
import { UsersService } from '../users/users.service.js';

export const DEMO_SEED_CONFIRM = 'RESET_MY_DEMO_ACCOUNT';
/** Seed users (demo friends) are recognisable only by this social-account prefix; nothing else is touched. */
export const SEED_PROVIDER_PREFIX = 'seed-demo';
const SET_SIZE = 10;
const DAY_MS = 86_400_000;

export interface DemoSeedSummary {
  userId: string;
  solves: number;
  sets: number;
  wrongNotes: number;
  friends: number;
  battles: number;
  cheese: number;
  streak: number;
  durationMs: number;
}

export interface DemoVerifyDto {
  ok: boolean;
  observed: {
    weeklySolved: number;
    insufficientData: boolean;
    weakTopics: TopicId[];
    allocation: Record<string, number>;
    cheese: number;
    streak: number;
    topicLevels: Record<string, number>;
    openWrongNotes: number;
    friends: number;
  };
  checks: Array<{ name: string; expected: unknown; actual: unknown; ok: boolean }>;
}

/** Plan §4.3 LF "AC-E2E 합격 기준", before battle 1 (docs/demo-runbook.md §5). */
export const DEMO_EXPECTED = {
  weeklySolved: 27,
  insufficientData: true,
  weakTopics: ['vocab', 'general'],
  allocation: { vocab: 3, general: 2, history: 3, science: 2 },
  cheese: 320,
  streak: 28,
  topicLevels: { science: 25, general: 22, vocab: 21, history: 24 },
} as const;

/**
 * Applies the demo member-A state to the CALLER (an admin's real account), from the server clock.
 * Reset = the AC-D7 learning-record deletion + the caller's cheese/topics + all seed-demo users and
 * their rooms. Apply = set-based inserts (≈ 25 statements, Neon ≈ 0.2 s each) whose derived values
 * come from the same rules the services use (applyStreakDay, wrong-note upkeep, TopicProgress).
 */
@Injectable()
export class DemoSeedService {
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly reports: LearningReportsService,
    private readonly solo: SoloService,
    private readonly social: SocialService,
    private readonly streak: StreakService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async seed(userId: string, confirm: unknown): Promise<DemoSeedSummary> {
    if (confirm !== DEMO_SEED_CONFIRM) throw badRequest('CONFIRM_REQUIRED', `confirm: '${DEMO_SEED_CONFIRM}'가 필요해요`);
    if (this.running) throw conflict('SEED_RUNNING', '시드가 이미 진행 중이에요');
    this.running = true;
    const t0 = Date.now();
    try {
      const summary = await this.prisma.$transaction((tx) => this.run(tx, userId, this.clock.now()), { timeout: 120_000, maxWait: 10_000 });
      return { ...summary, durationMs: Date.now() - t0 };
    } finally {
      this.running = false;
    }
  }

  private async run(tx: Tx, userId: string, now: number): Promise<Omit<DemoSeedSummary, 'durationMs'>> {
    await lockAll(tx, [{ userId, dayKey: 'demo-seed' }]);
    const profile = buildDemoProfile(now);
    const solves = [...profile.olderSolves, ...profile.thisWeekSolves].sort((a, b) => a.at - b.at);

    // ---------- question pool (one query, published only) ----------
    const published = await tx.$queryRaw<Array<{ id: string; topicId: string; subfield: string; difficulty: number }>>`
      SELECT q.id, q."topicId", s.name AS subfield, q.difficulty FROM "Question" q JOIN "Subfield" s ON s.id = q."subfieldId"
      WHERE q.status = 'published' ORDER BY q.difficulty, q.id`;
    const pool = new Map<string, string[]>();
    for (const q of published) {
      for (const key of [`${q.topicId}/${q.subfield}`, ...(q.topicId === 'science' && q.difficulty < 2 ? [`${q.topicId}/${q.subfield}/easy`] : [])]) {
        pool.set(key, [...(pool.get(key) ?? []), q.id]);
      }
    }
    // Distinct questions per solve; science wrongs come from < ★2 so battle 1 (★2+) never hits a wrong-noted question.
    const taken = new Set<string>();
    const pick = (s: SeedSolve): string => {
      const topicId = TOPIC_ID_BY_NAME[s.topic];
      const keys = s.topic === '과학' && !s.correct ? [`${topicId}/${s.subfield}/easy`, `${topicId}/${s.subfield}`] : [`${topicId}/${s.subfield}`];
      for (const key of keys) {
        const id = pool.get(key)?.find((x) => !taken.has(x));
        if (id) return taken.add(id), id;
      }
      const need = solves.filter((x) => x.topic === s.topic && x.subfield === s.subfield).length;
      throw new ApiError(HttpStatus.CONFLICT, 'NOT_ENOUGH_QUESTIONS', `${s.topic}/${s.subfield}: 공개 문제가 부족해요 (필요 ${need}, 공개 ${pool.get(`${topicId}/${s.subfield}`)?.length ?? 0})`);
    };
    const qids = solves.map(pick);

    // ---------- reset ----------
    const seedIds = (await tx.socialAccount.findMany({ where: { providerUserId: { startsWith: SEED_PROVIDER_PREFIX } }, select: { userId: true } })).map((a) => a.userId);
    if (seedIds.length) {
      await tx.room.deleteMany({ where: { sessions: { some: { results: { some: { userId: { in: seedIds } } } } } } });
      await tx.user.deleteMany({ where: { id: { in: seedIds } } });
    }
    for (const m of ['solveLog', 'setAttempt', 'battleResult', 'wrongNote', 'weeklyReportSnapshot', 'xpLedger', 'topicProgress', 'streakState', 'cheeseLedger', 'userTopic'] as const) {
      await (tx[m] as unknown as { deleteMany: (a: object) => Promise<unknown> }).deleteMany({ where: { userId } });
    }

    // ---------- sets + solve logs (per topic, chronological chunks of 10, like scripts/seed/insert.ts) ----------
    const sets: Prisma.SetAttemptCreateManyInput[] = [];
    const logs: Prisma.SolveLogCreateManyInput[] = [];
    for (const topic of Object.keys(profile.topicLevels) as SeedTopic[]) {
      const idx = solves.map((s, i) => [s, i] as const).filter(([s]) => s.topic === topic);
      for (let i = 0; i < idx.length; i += SET_SIZE) {
        const chunk = idx.slice(i, i + SET_SIZE);
        const id = randomUUID();
        const correct = chunk.filter(([s]) => s.correct).length;
        const last = chunk[chunk.length - 1]![0].at;
        sets.push({
          id, userId, kind: 'stage', status: 'completed', topicId: TOPIC_ID_BY_NAME[topic], level: profile.topicLevels[topic],
          questionIds: chunk.map(([, j]) => qids[j]!), correctCount: correct, totalCount: chunk.length, passed: correct >= 7,
          startedAt: new Date(chunk[0]![0].at), completedAt: new Date(last), kstDay: dayToDate(toKstDay(last)),
        });
        for (const [s, j] of chunk) {
          logs.push({
            userId, questionId: qids[j]!, mode: 'stage', correct: s.correct, submitted: true, responseMs: 8000, hintUsed: false,
            attempts: 1, isReview: false, answeredAt: new Date(s.at), kstDay: dayToDate(toKstDay(s.at)), setAttemptId: id,
          });
        }
      }
    }
    await tx.setAttempt.createMany({ data: sets });
    await tx.solveLog.createMany({ data: logs });
    const wrong = logs.filter((l) => !l.correct);
    await tx.wrongNote.createMany({
      data: wrong.map((l) => ({ userId, questionId: l.questionId, firstWrongAt: l.answeredAt, lastWrongAt: l.answeredAt })),
    });

    // ---------- topics + levels ----------
    await tx.userTopic.createMany({ data: MVP_TOPIC_IDS.map((topicId, i) => ({ userId, topicId, addedAt: new Date(now - (4 - i) * 1000) })) });
    await tx.topicProgress.createMany({
      data: (Object.entries(profile.topicLevels) as [SeedTopic, number][]).map(([t, level]) => ({
        userId, topicId: TOPIC_ID_BY_NAME[t], highestClearedStage: level - 1, started: true,
      })),
    });

    // ---------- streak (same rule as StreakService.markActivity) + cheese ----------
    let state: StreakState = { current: 0, longest: 0, lastCountedDay: null, runStartDay: null, judgedThrough: null, broken: null };
    const events: StreakEvent[] = [];
    for (const day of profile.streak.days) {
      const r = applyStreakDay(state, { day, active: true, protectionsAtBoundary: 0 }, this.cfg);
      state = r.state;
      events.push(...r.events);
    }
    await tx.streakState.create({
      data: {
        userId, current: state.current, longest: state.longest, lastCountedDay: dayToDate(state.lastCountedDay!),
        runStartDay: dayToDate(state.runStartDay!), judgedThrough: dayToDate(state.judgedThrough!),
      },
    });
    const milestones = events.flatMap((e) => (e.type === 'milestone' ? [e] : []));
    const recomputed = milestones.reduce((s, m) => s + m.cheese, 0);
    const price = this.cfg.streak.protection.price;
    const at = (ms: number) => new Date(ms);
    await tx.cheeseLedger.createMany({
      data: [
        ...milestones.map((m) => ({ userId, delta: m.cheese, reason: 'streak_milestone' as const, milestone: m.days, runStartDay: dayToDate(m.runStartDay), createdAt: at(now - 2000) })),
        { userId, delta: -price, reason: 'protection_purchase' as const, createdAt: at(now - 1000) },
        { userId, delta: profile.cheese.target - recomputed + price, reason: 'seed_adjust' as const, createdAt: at(now) },
      ],
    });

    // ---------- friends + head-to-head ----------
    const names = profile.friends.map((f) => f.nickname);
    const clash = new Set((await tx.user.findMany({ where: { nickname: { in: names } }, select: { nickname: true } })).map((u) => u.nickname));
    const friends = names.map((name, i) => ({
      id: randomUUID(),
      key: name,
      nickname: clash.has(name) ? `${[...name].slice(0, 7).join('')}${100 + i}` : name,
    }));
    await tx.user.createMany({ data: friends.map((f) => ({ id: f.id, nickname: f.nickname })) });
    await tx.socialAccount.createMany({ data: friends.map((f) => ({ userId: f.id, provider: 'kakao' as const, providerUserId: `${SEED_PROVIDER_PREFIX}-${f.key}` })) });
    await tx.friendship.createMany({
      data: friends.map((f) => ({
        ...(userId < f.id ? { userLowId: userId, userHighId: f.id } : { userLowId: f.id, userHighId: userId }),
        requesterId: userId, status: 'accepted' as const, acceptedAt: at(now),
      })),
    });
    const battles = profile.battleRecords.flatMap((b) => {
      const f = friends.find((x) => x.key === b.opponent);
      if (!f) return [];
      const endedAt = at(now - b.daysAgo * DAY_MS);
      return [{ b, f, roomId: randomUUID(), sessionId: randomUUID(), endedAt }];
    });
    if (battles.length) {
      await tx.room.createMany({ data: battles.map((x) => ({ id: x.roomId, code: '0000', hostUserId: userId, settings: {}, status: 'finished' as const, createdAt: x.endedAt, closedAt: x.endedAt })) });
      await tx.roomSession.createMany({ data: battles.map((x) => ({ id: x.sessionId, roomId: x.roomId, seq: 1, settings: {}, questionIds: [], startedAt: x.endedAt, endedAt: x.endedAt })) });
      await tx.battleResult.createMany({
        data: battles.flatMap((x) => {
          const memberKey = [`u:${userId}`, `u:${x.f.id}`].sort().join('|');
          const row = (id: string, nickname: string, rank: number) => ({
            roomSessionId: x.sessionId, participantId: id, userId: id, nickname, rank, score: rank === 1 ? 900 : 700,
            correctCount: rank === 1 ? 8 : 6, totalResponseMs: 60_000, participantCount: 2, memberKey, endedAt: x.endedAt,
            kstDay: dayToDate(toKstDay(x.endedAt.getTime())),
          });
          return [row(userId, 'me', x.b.won ? 1 : 2), row(x.f.id, x.f.nickname, x.b.won ? 2 : 1)];
        }),
      });
    }

    return {
      userId,
      solves: logs.length,
      sets: sets.length,
      wrongNotes: wrong.length,
      friends: friends.length,
      battles: battles.length,
      cheese: profile.cheese.target,
      streak: state.current,
    };
  }

  /** The runbook §5 observables, computed by the real services for the caller. */
  async verify(userId: string): Promise<DemoVerifyDto> {
    const [weak, plan, me, streak, progress, open, friends] = await Promise.all([
      this.reports.weakness(userId),
      this.solo.compositePlan(userId),
      this.users.me(userId),
      this.streak.get(userId),
      this.prisma.topicProgress.findMany({ where: { userId } }),
      this.prisma.wrongNote.count({ where: { userId, status: 'open' } }),
      this.social.list(userId),
    ]);
    const observed: DemoVerifyDto['observed'] = {
      weeklySolved: weak.weeklySolved,
      insufficientData: weak.insufficientData,
      weakTopics: weak.weakTopics,
      allocation: Object.fromEntries(plan.allocation.map((a) => [a.topicId, a.count])),
      cheese: me.cheese,
      streak: streak.current,
      topicLevels: Object.fromEntries(progress.map((p) => [p.topicId, Math.min(p.highestClearedStage + 1, this.cfg.stage.maxLevel)])),
      openWrongNotes: open,
      friends: friends.friends.length,
    };
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
    const sorted = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort());
    const checks = [
      { name: 'weeklySolved', expected: DEMO_EXPECTED.weeklySolved, actual: observed.weeklySolved },
      { name: 'insufficientData', expected: DEMO_EXPECTED.insufficientData, actual: observed.insufficientData },
      { name: 'weakTopics', expected: DEMO_EXPECTED.weakTopics, actual: observed.weakTopics },
      { name: 'allocation', expected: sorted({ ...DEMO_EXPECTED.allocation }), actual: sorted(observed.allocation) },
      { name: 'cheese', expected: DEMO_EXPECTED.cheese, actual: observed.cheese },
      { name: 'streak', expected: DEMO_EXPECTED.streak, actual: observed.streak },
      { name: 'topicLevels', expected: sorted({ ...DEMO_EXPECTED.topicLevels }), actual: sorted(observed.topicLevels) },
    ].map((c) => ({ ...c, ok: same(c.expected, c.actual) }));
    return { ok: checks.every((c) => c.ok), observed, checks };
  }

  /** For the status route: the seed runs synchronously (≈ 25 statements), so there is no job queue. */
  isRunning(): boolean {
    return this.running;
  }
}
