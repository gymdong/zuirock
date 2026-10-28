import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { multiRecord, type MultiAggregate } from '@zuirock/game-rules';
import type { MultiRecordDto, TopicId } from '@zuirock/shared';
import { PrismaService } from '../../common/prisma.service.js';
import { StagePlanner } from '../solo/stage-planner.js';

/** Record queries shared by the friend profile (social) and the ranking/lobby endpoints (records). */
@Injectable()
export class RecordsStats {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stages: StagePlanner,
  ) {}

  /** Battle counts per member, from BattleResult (1st = win) and the battle SolveLogs. */
  async multiRecords(userIds: readonly string[]): Promise<Map<string, MultiRecordDto>> {
    const out = new Map<string, MultiRecordDto>();
    if (!userIds.length) return out;
    const ids = Prisma.sql`${[...userIds]}::uuid[]`;
    const [games, topics] = await Promise.all([
      this.prisma.$queryRaw<Array<{ userId: string; played: number; wins: number }>>`
        SELECT "userId", count(*)::int AS played, (count(*) FILTER (WHERE "rank" = 1))::int AS wins
        FROM "BattleResult"
        WHERE "userId" = ANY(${ids}) AND "participantCount" >= 2
        GROUP BY "userId"`,
      this.prisma.$queryRaw<Array<{ userId: string; topicId: string; answered: number; correct: number }>>`
        SELECT sl."userId", q."topicId", count(*)::int AS answered, (count(*) FILTER (WHERE sl."correct"))::int AS correct
        FROM "SolveLog" sl JOIN "Question" q ON q."id" = sl."questionId"
        WHERE sl."userId" = ANY(${ids}) AND sl."battleResultId" IS NOT NULL
        GROUP BY sl."userId", q."topicId"`,
    ]);
    for (const id of userIds) {
      const g = games.find((x) => x.userId === id);
      const agg: MultiAggregate = {
        played: g?.played ?? 0,
        wins: g?.wins ?? 0,
        topics: topics.filter((t) => t.userId === id).map((t) => ({ topicId: t.topicId as TopicId, answered: t.answered, correct: t.correct })),
      };
      out.set(id, multiRecord(agg));
    }
    return out;
  }

  /** Stages cleared, summed over topics, each capped at the topic's current stage count. */
  async clearedStages(userIds: readonly string[]): Promise<Map<string, number>> {
    const [rows, counts] = await Promise.all([
      this.prisma.topicProgress.findMany({ where: { userId: { in: [...userIds] } }, select: { userId: true, topicId: true, highestClearedStage: true } }),
      this.stages.stageCounts(),
    ]);
    const out = new Map<string, number>(userIds.map((id) => [id, 0]));
    for (const r of rows) out.set(r.userId, (out.get(r.userId) ?? 0) + Math.min(r.highestClearedStage, counts.get(r.topicId) ?? 0));
    return out;
  }
}
