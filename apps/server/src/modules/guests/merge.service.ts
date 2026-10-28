import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  computeMergeGrant,
  kstWeekStart,
  toKstDay,
  topicLevel,
  type GrowthConfig,
  type MergeSource,
} from '@zuirock/game-rules';
import type { GuestMergeSummary, KstDay, TopicId } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { conflict, notFound } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay, dayToDate } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import { withTxRetry } from '../../common/tx-retry.js';
import type { Tx } from '../../ports/tx.js';
import { StreakService } from '../growth/streak.service.js';
import { loadTopicWrongRates } from '../growth/weak-topics.js';
import { applyWrongNotes } from '../growth/wrong-notes.service.js';
import { xpReason } from '../growth/xp.service.js';
import { StagePlanner } from '../solo/stage-planner.js';

const XP_SET_KINDS = ['stage', 'composite', 'daily', 'quest'] as const;

/**
 * Guest → member merge (plan §4.3 LB 병합, D6-3, AC-A2/A3), one transaction:
 * claim the guest (409 if merged), move the 4 source tables, keep account XP frozen, grant only the
 * guest share via computeMergeGrant, re-derive topic progress / wrong notes / streak, drop the
 * affected weekly snapshots so they are re-finalized from the combined logs on next read.
 */
@Injectable()
export class MergeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streak: StreakService,
    private readonly stages: StagePlanner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  merge(guestId: string, userId: string): Promise<GuestMergeSummary> {
    return withTxRetry(() => this.prisma.$transaction((tx) => this.mergeTx(tx, guestId, userId), { timeout: 60_000 }));
  }

  async mergeTx(tx: Tx, guestId: string, userId: string): Promise<GuestMergeSummary> {
    const now = new Date(this.clock.now());
    const claimed = await tx.guest.updateMany({ where: { id: guestId, mergedUserId: null }, data: { mergedUserId: userId, mergedAt: now } });
    if (claimed.count === 0) {
      const exists = await tx.guest.findUnique({ where: { id: guestId }, select: { id: true } });
      if (!exists) throw notFound('GUEST_NOT_FOUND', '게스트 기록이 없어요');
      throw conflict('GUEST_ALREADY_MERGED', '이미 다른 계정에 합쳐진 게스트 기록이에요');
    }

    const [sets, battles, guestLogs] = await Promise.all([
      tx.setAttempt.findMany({ where: { guestId, status: 'completed' } }),
      tx.battleResult.findMany({ where: { guestId } }),
      tx.solveLog.findMany({ where: { guestId }, include: { question: { select: { difficulty: true, type: true, topicId: true } } } }),
    ]);
    const days = new Set<KstDay>(guestLogs.map((l) => dateToDay(l.kstDay)));
    for (const s of sets) if (s.completedAt) days.add(toKstDay(s.completedAt.getTime()));
    for (const b of battles) days.add(dateToDay(b.kstDay));
    await lockAll(tx, [...days].map((dayKey) => ({ userId, dayKey })));

    const xpGranted = await this.grantGuestShare(tx, userId, sets, battles, guestLogs);

    const moved = {
      solveLogs: (await tx.solveLog.updateMany({ where: { guestId }, data: { guestId: null, userId } })).count,
      setAttempts: (await tx.setAttempt.updateMany({ where: { guestId }, data: { guestId: null, userId } })).count,
      battleResults: (await tx.battleResult.updateMany({ where: { guestId }, data: { guestId: null, userId } })).count,
      cheeseLedger: (await tx.cheeseLedger.updateMany({ where: { guestId }, data: { guestId: null, userId } })).count,
    };

    await this.rederive(tx, userId, sets, guestLogs);
    const weeks = [...new Set([...days].map((d) => kstWeekStart(d)))];
    if (weeks.length) {
      await tx.weeklyReportSnapshot.deleteMany({ where: { userId, weekStart: { in: weeks.map(dayToDate) } } });
    }
    return { guestId, moved, xpGranted };
  }

  private async grantGuestShare(
    tx: Tx,
    userId: string,
    sets: Prisma.SetAttemptGetPayload<object>[],
    battles: Prisma.BattleResultGetPayload<object>[],
    guestLogs: Prisma.SolveLogGetPayload<{ include: { question: { select: { difficulty: true; type: true; topicId: true } } } }>[],
  ): Promise<number> {
    const [accountSolves, progress, ledger] = await Promise.all([
      tx.solveLog.findMany({ where: { userId }, select: { questionId: true, answeredAt: true } }),
      tx.topicProgress.findMany({ where: { userId } }),
      tx.xpLedger.findMany({ where: { userId }, select: { sourceType: true, kstDay: true, amount: true } }),
    ]);
    const grantedXpByDay: Record<KstDay, number> = {};
    for (const r of ledger) grantedXpByDay[dateToDay(r.kstDay)] = (grantedXpByDay[dateToDay(r.kstDay)] ?? 0) + r.amount;
    const { weak } = await loadTopicWrongRates(tx, userId, this.clock.now(), this.cfg);

    const logsBySet = new Map<string, typeof guestLogs>();
    const logsByBattle = new Map<string, typeof guestLogs>();
    for (const l of guestLogs) {
      const [map, key] = l.setAttemptId ? [logsBySet, l.setAttemptId] : [logsByBattle, l.battleResultId!];
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    const items = (logs: typeof guestLogs = [], battle: boolean) =>
      logs.map((l) => ({
        questionId: l.questionId,
        difficulty: l.question.difficulty,
        questionType: l.question.type,
        correct: l.correct,
        noHint: battle ? l.beforeReveal === true : !l.hintUsed,
        weakTopic: weak.includes(l.question.topicId as TopicId),
        reviewCompleted: false, // guests have no wrong notes
        answeredAt: l.answeredAt.getTime(),
      }));

    const sources: MergeSource[] = [];
    for (const s of sets) {
      if (!(XP_SET_KINDS as readonly string[]).includes(s.kind) || s.skipped || !s.completedAt) continue;
      const set: MergeSource['set'] =
        s.kind === 'stage'
          ? { kind: 'stage', topicId: s.topicId as TopicId, level: s.level ?? 0, cleared: s.passed === true }
          : { kind: s.kind as 'composite' | 'daily' | 'quest', correctCount: s.correctCount, totalCount: s.totalCount };
      sources.push({ source: { type: s.kind as 'stage', id: s.id }, completedAt: s.completedAt.getTime(), set, items: items(logsBySet.get(s.id), false) });
    }
    for (const b of battles) {
      sources.push({
        source: { type: 'battle', id: b.id },
        completedAt: b.endedAt.getTime(),
        set: { kind: 'battle', rank: b.rank, rematch: b.rematch },
        items: items(logsByBattle.get(b.id), true),
      });
    }

    const result = computeMergeGrant(
      {
        account: {
          solves: accountSolves.map((s) => ({ questionId: s.questionId, answeredAt: s.answeredAt.getTime() })),
          clearedStages: progress.flatMap((p) =>
            Array.from({ length: p.highestClearedStage }, (_, i) => ({ topicId: p.topicId as TopicId, level: i + 1 })),
          ),
          dailyGrantedDays: ledger.filter((r) => r.sourceType === 'daily').map((r) => dateToDay(r.kstDay)),
          questGrantedWeeks: ledger.filter((r) => r.sourceType === 'quest').map((r) => kstWeekStart(dateToDay(r.kstDay))),
          grantedXpByDay,
        },
        guestSources: sources,
      },
      this.cfg,
    );

    let total = 0;
    for (const line of result.lines) {
      if (!line.result.eligible || line.result.preCapTotal <= 0) continue;
      const src = sources.find((s) => s.source.id === line.source.id)!;
      const ctx = src.set.kind === 'battle' ? src.set : { kind: src.set.kind } as never;
      const created = await tx.xpLedger.createMany({
        skipDuplicates: true,
        data: [
          {
            userId,
            sourceType: line.source.type,
            sourceId: line.source.id,
            amount: line.result.granted,
            preCapAmount: line.result.preCapTotal,
            cappedAmount: line.result.cappedAmount,
            reason: `게스트 기록 병합 · ${xpReason(line.source.type, ctx, line.result.capReached)}`,
            breakdown: line.result as unknown as Prisma.InputJsonValue,
            configVersion: line.result.configVersion,
            kstDay: dayToDate(line.kstDay),
            viaMerge: true,
          },
        ],
      });
      if (created.count) total += line.result.granted;
    }
    return total;
  }

  private async rederive(
    tx: Tx,
    userId: string,
    sets: Prisma.SetAttemptGetPayload<object>[],
    guestLogs: Prisma.SolveLogGetPayload<object>[],
  ): Promise<void> {
    // Topic level comes from solo stages only (incl. placement/basic-test skips recorded as stage rows).
    const best = new Map<string, number>();
    for (const s of sets) {
      if (s.kind === 'stage' && s.passed && s.topicId && s.level) best.set(s.topicId, Math.max(best.get(s.topicId) ?? 0, s.level));
    }
    for (const [topicId, level] of best) {
      const cur = await tx.topicProgress.findUnique({ where: { userId_topicId: { userId, topicId } } });
      const highest = Math.max(cur?.highestClearedStage ?? 0, level);
      const completed = topicLevel(highest, await this.stages.stageCount(topicId, tx)).completed;
      await tx.topicProgress.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: { userId, topicId, highestClearedStage: highest, completed, started: true },
        update: { highestClearedStage: highest, completed, started: true },
      });
    }
    await applyWrongNotes(
      tx,
      userId,
      guestLogs.map((l) => ({ questionId: l.questionId, correct: l.correct, isReview: l.isReview, at: l.answeredAt })),
    );
    // Streak over the combined activity days (all sources now belong to the user).
    const [doneSets, doneBattles] = await Promise.all([
      tx.setAttempt.findMany({ where: { userId, status: 'completed', skipped: false }, select: { completedAt: true } }),
      tx.battleResult.findMany({ where: { userId, left: false }, select: { kstDay: true } }),
    ]);
    const activity = new Set<KstDay>([
      ...doneSets.filter((s) => s.completedAt).map((s) => toKstDay(s.completedAt!.getTime())),
      ...doneBattles.map((b) => dateToDay(b.kstDay)),
    ]);
    await this.streak.rebuild(tx, userId, activity);
  }
}

