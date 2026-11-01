import { Inject, Injectable } from '@nestjs/common';
import { addKstDays, ALL_CLEAR_QUEST_ID, dailyQuestDefs, kstDayStart, questKey, questStatus, toKstDay, type GrowthConfig, type QuestDef } from '@zuirock/game-rules';
import type { ChestTier, ClaimQuestResponse, DailyQuestDto, DailyQuestsDto } from '@zuirock/shared';
import { notFound, conflict } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dayToDate } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/tx.js';

/**
 * 일일 퀘스트(11/1): 진행도는 오늘(KST) 풀이·대결 기록에서 그때그때 센다(풀이·대결 코드는 건드리지 않는다).
 * 보상 받기 = 퀘스트 상자 1개를 만들어 준다. 키(userId, '날짜:퀘스트')가 유일해서 두 번 받아도 같은 상자다.
 * 상자는 기존 상자 열기(/me/chests/:id/open)로 연다.
 */
@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private async raw(db: Tx, userId: string, day: string): Promise<Record<QuestDef['metric'], number>> {
    const kstDay = dayToDate(day);
    const [stage_sets, battles, correct_answers] = await Promise.all([
      db.setAttempt.count({ where: { userId, kind: 'stage', status: 'completed', skipped: false, kstDay } }),
      db.battleResult.count({ where: { userId, kstDay, left: false } }),
      db.solveLog.count({ where: { userId, kstDay, correct: true, submitted: true } }),
    ]);
    return { stage_sets, battles, correct_answers };
  }

  async daily(userId: string, db: Tx = this.prisma): Promise<DailyQuestsDto> {
    const now = this.clock.now();
    const day = toKstDay(now);
    const defs = dailyQuestDefs(this.cfg);
    const [raw, chests] = await Promise.all([
      this.raw(db, userId, day),
      db.chest.findMany({ where: { userId, questKey: { startsWith: `${day}:` } }, select: { id: true, tier: true, questKey: true, openedAt: true } }),
    ]);
    const byKey = new Map(chests.map((c) => [c.questKey!, { id: c.id, tier: c.tier as ChestTier, opened: c.openedAt !== null }]));
    const quests: DailyQuestDto[] = defs.map((d) => {
      const s = questStatus(d, raw[d.metric]);
      const chest = byKey.get(questKey(day, d.id));
      return { id: d.id, title: d.title, desc: d.desc, progress: s.progress, target: s.target, done: s.done, claimed: !!chest, tier: 'quest', ...(chest ? { chest } : {}) };
    });
    const cleared = quests.filter((q) => q.done).length;
    const bonusChest = byKey.get(questKey(day, ALL_CLEAR_QUEST_ID));
    const bonus: DailyQuestsDto['bonus'] = {
      id: ALL_CLEAR_QUEST_ID,
      title: '오늘의 퀘스트 모두 완료',
      done: cleared === quests.length,
      claimed: !!bonusChest,
      tier: 'good',
      cleared,
      total: quests.length,
      ...(bonusChest ? { chest: bonusChest } : {}),
    };
    return {
      kstDay: day,
      resetsAt: new Date(kstDayStart(addKstDays(day, 1))).toISOString(),
      quests,
      bonus,
      claimable: quests.filter((q) => q.done && !q.claimed).length + (bonus.done && !bonus.claimed ? 1 : 0),
    };
  }

  async claim(userId: string, id: string): Promise<ClaimQuestResponse> {
    const day = toKstDay(this.clock.now());
    const state = await this.daily(userId);
    const target = id === ALL_CLEAR_QUEST_ID ? state.bonus : state.quests.find((q) => q.id === id);
    if (!target) throw notFound('QUEST_NOT_FOUND', '퀘스트를 찾을 수 없어요');
    if (target.chest) return { chest: target.chest };
    if (!target.done) throw conflict('QUEST_NOT_DONE', '아직 완료하지 못한 퀘스트예요');
    const key = questKey(day, id);
    await this.prisma.chest.createMany({
      data: [{ userId, tier: target.tier, questKey: key, grantedAt: new Date(this.clock.now()) }],
      skipDuplicates: true,
    });
    const chest = await this.prisma.chest.findUniqueOrThrow({ where: { userId_questKey: { userId, questKey: key } }, select: { id: true, tier: true, openedAt: true } });
    return { chest: { id: chest.id, tier: chest.tier as ChestTier, opened: chest.openedAt !== null } };
  }
}
