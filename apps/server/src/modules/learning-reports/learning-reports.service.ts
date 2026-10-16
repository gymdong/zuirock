import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  addKstDays,
  historySummary,
  kstDayStart,
  kstWeekStart,
  rankWeakness,
  toKstDay,
  weeklyReport,
  type GrowthConfig,
  type SolveFact,
} from '@zuirock/game-rules';
import type { HistorySummaryDto, KstDay, SubfieldName, TopicId, WeaknessReportDto, WeeklyReportDto } from '@zuirock/shared';
import { badRequest } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay, dayToDate } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import { loadTopicWrongRates } from '../growth/weak-topics.js';

const factInclude = { question: { include: { subfield: true } } } as const;
type LogWithQuestion = Prisma.SolveLogGetPayload<{ include: typeof factInclude }>;

function toFact(l: LogWithQuestion): SolveFact {
  return {
    questionId: l.questionId,
    topicId: l.question.topicId as TopicId,
    subfieldId: l.question.subfieldId,
    subfield: l.question.subfield.name as SubfieldName,
    type: l.question.type,
    difficulty: l.question.difficulty,
    correct: l.correct,
    responseMs: l.responseMs,
    answeredAt: l.answeredAt.getTime(),
  };
}

/**
 * Learning reports (AC-D2~D4): the current week is recomputed live; a finished week is finalized
 * lazily on first read into WeeklyReportSnapshot (no cron, D6-9) and regenerated after merge/deletion.
 */
@Injectable()
export class LearningReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private currentWeek(): KstDay {
    return kstWeekStart(toKstDay(this.clock.now()));
  }

  async weekFacts(userId: string, weekStart: KstDay): Promise<SolveFact[]> {
    const logs = await this.prisma.solveLog.findMany({
      where: { userId, answeredAt: { gte: new Date(kstDayStart(weekStart)), lt: new Date(kstDayStart(addKstDays(weekStart, 7))) } },
      include: factInclude,
    });
    return logs.map(toFact);
  }

  /** Days in the week with a streak-counting activity (full solo set or finished battle). */
  private async activityDays(userId: string, weekStart: KstDay): Promise<number> {
    const from = new Date(kstDayStart(weekStart));
    const to = new Date(kstDayStart(addKstDays(weekStart, 7)));
    const [sets, battles] = await Promise.all([
      this.prisma.setAttempt.findMany({
        where: { userId, status: 'completed', skipped: false, totalCount: { gte: this.cfg.stage.size }, completedAt: { gte: from, lt: to } },
        select: { completedAt: true },
      }),
      this.prisma.battleResult.findMany({ where: { userId, left: false, endedAt: { gte: from, lt: to } }, select: { kstDay: true } }),
    ]);
    return new Set([...sets.map((s) => toKstDay(s.completedAt!.getTime())), ...battles.map((b) => dateToDay(b.kstDay))]).size;
  }

  private async compute(userId: string, weekStart: KstDay): Promise<Omit<WeeklyReportDto, 'finalized'>> {
    const [thisWeek, prevWeek, selected, streakDays] = await Promise.all([
      this.weekFacts(userId, weekStart),
      this.weekFacts(userId, addKstDays(weekStart, -7)),
      this.prisma.userTopic.findMany({ where: { userId }, orderBy: { addedAt: 'asc' } }),
      this.activityDays(userId, weekStart),
    ]);
    const topicIds = [...new Set([...selected.map((s) => s.topicId as TopicId), ...thisWeek.map((f) => f.topicId)])];
    return weeklyReport({ weekStart, thisWeek, prevWeek, streakDays, topicIds }, this.cfg);
  }

  async weekly(userId: string, weekStart?: string): Promise<WeeklyReportDto> {
    const current = this.currentWeek();
    const week = weekStart ?? current;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || kstWeekStart(week) !== week) throw badRequest('BAD_WEEK', '주 시작일(월요일)이 올바르지 않아요');
    if (week >= current) return { ...(await this.compute(userId, week)), finalized: false };
    const snap = await this.prisma.weeklyReportSnapshot.findUnique({ where: { userId_weekStart: { userId, weekStart: dayToDate(week) } } });
    if (snap) return snap.payload as unknown as WeeklyReportDto;
    const payload: WeeklyReportDto = { ...(await this.compute(userId, week)), finalized: true };
    await this.prisma.weeklyReportSnapshot.upsert({
      where: { userId_weekStart: { userId, weekStart: dayToDate(week) } },
      create: { userId, weekStart: dayToDate(week), payload: payload as unknown as Prisma.InputJsonValue, configVersion: this.cfg.configVersion },
      update: {},
    });
    return payload;
  }

  async weakness(userId: string): Promise<WeaknessReportDto> {
    const weekStart = this.currentWeek();
    const facts = await this.weekFacts(userId, weekStart);
    const insufficientData = facts.length < this.cfg.report.minWeeklySolves;
    const notes = await this.prisma.wrongNote.findMany({ where: { userId, status: 'open' }, select: { question: { select: { subfieldId: true } } } });
    const noteCount: Record<string, number> = {};
    for (const n of notes) noteCount[n.question.subfieldId] = (noteCount[n.question.subfieldId] ?? 0) + 1;
    const weaknesses = insufficientData ? [] : rankWeakness(facts, noteCount, this.cfg);
    const { weak } = await loadTopicWrongRates(this.prisma, userId, this.clock.now(), this.cfg);
    const topics = await this.prisma.userTopic.count({ where: { userId } });
    const top = weaknesses[0];
    let quest: WeaknessReportDto['quest'] = null;
    if (top) {
      const done = await this.prisma.setAttempt.count({
        where: { userId, kind: 'quest', status: 'completed', weekStart: dayToDate(weekStart) },
      });
      quest = { subfieldId: top.subfieldId, completedThisWeek: done > 0 };
    }
    return {
      weekStart,
      weeklySolved: facts.length,
      insufficientData,
      minWeeklySolves: this.cfg.report.minWeeklySolves,
      weaknesses,
      weakTopics: weak,
      diagnostic: insufficientData ? { questionCount: this.cfg.diagnostic.perTopic * Math.max(1, topics) } : null,
      quest,
    };
  }

  async history(userId: string): Promise<HistorySummaryDto> {
    const [logs, streak, battles] = await Promise.all([
      this.prisma.solveLog.findMany({ where: { userId }, include: factInclude }),
      this.prisma.streakState.findUnique({ where: { userId } }),
      this.prisma.battleResult.findMany({ where: { userId }, select: { rank: true, participantCount: true } }),
    ]);
    return historySummary({ solves: logs.map(toFact), longestStreak: streak?.longest ?? 0, battles }, this.cfg);
  }
}
