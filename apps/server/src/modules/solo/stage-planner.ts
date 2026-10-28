import { Inject, Injectable } from '@nestjs/common';
import { basicTestCheckpoints, planStages, stageCountFor, topicLevel, type GrowthConfig, type StagePlan } from '@zuirock/game-rules';
import type { TopicProgressDto } from '@zuirock/shared';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/tx.js';

/**
 * Stage pools of a topic (10/28): computed from the published questions on every call, so new or
 * suspended questions take effect at once. ~150–450 small rows per topic.
 */
@Injectable()
export class StagePlanner {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async plan(topicId: string, db: Tx = this.prisma): Promise<StagePlan> {
    const qs = await db.question.findMany({ where: { status: 'published', topicId }, select: { id: true, difficulty: true, subfieldId: true } });
    return planStages(qs, this.cfg);
  }

  async stageCount(topicId: string, db: Tx = this.prisma): Promise<number> {
    return stageCountFor(await db.question.count({ where: { status: 'published', topicId } }), this.cfg);
  }

  async stageCounts(db: Tx = this.prisma): Promise<Map<string, number>> {
    const rows = await db.question.groupBy({ by: ['topicId'], where: { status: 'published' }, _count: { _all: true } });
    return new Map(rows.map((r) => [r.topicId, stageCountFor(r._count._all, this.cfg)]));
  }

  /** The stage-dependent part of TopicProgressDto. */
  progress(plan: StagePlan, highestClearedStage: number): Pick<TopicProgressDto, 'level' | 'completed' | 'stageCount' | 'checkpoints' | 'stage'> {
    const { level, completed } = topicLevel(highestClearedStage, plan.stageCount);
    return {
      level,
      completed,
      stageCount: plan.stageCount,
      checkpoints: basicTestCheckpoints(plan.stageCount, this.cfg),
      stage: plan.ranges[level - 1] ?? null,
    };
  }
}
