import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  computeXpGrant,
  kstWeekStart,
  addKstDays,
  type GrowthConfig,
  type XpGrantContext,
  type XpGrantResult,
} from '@zuirock/game-rules';
import type { KstDay, XpBoostResultDto, XpSourceType } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay, dayToDate } from '../../common/kst-date.js';
import type { Tx } from '../../ports/tx.js';
import type { XpGrantContextInput, XpGrantPort, XpGrantRequest, XpLedgerEntry } from '../../ports/xp-grant.port.js';
import { loadTopicWrongRates } from './weak-topics.js';


export interface XpGrantOutcome {
  entries: XpLedgerEntry[];
  /** null when the grant already existed (idempotent replay) or the owner is a guest. */
  result: XpGrantResult | null;
}

type LedgerRow = Prisma.XpLedgerGetPayload<object>;

export function toLedgerEntry(r: LedgerRow): XpLedgerEntry {
  return {
    id: r.id,
    userId: r.userId,
    sourceType: r.sourceType,
    sourceId: r.sourceId,
    amount: r.amount,
    preCapAmount: r.preCapAmount,
    cappedAmount: r.cappedAmount,
    capReached: r.cappedAmount > 0 || (r.breakdown as { capReached?: boolean } | null)?.capReached === true,
    reason: r.reason,
    kstDay: dateToDay(r.kstDay),
    configVersion: r.configVersion,
    createdAt: r.createdAt,
  };
}

export function xpReason(type: XpSourceType, ctx: XpGrantContextInput | XpGrantContext, capReached: boolean): string {
  const base =
    ctx.kind === 'battle'
      ? `대결 ${ctx.rank}위${ctx.rematch ? ' (재대결 50%)' : ''}`
      : ({ stage: '스테이지 첫 클리어', composite: '종합 세트', daily: '오늘의 3분 지식', quest: '약점 집중 퀘스트', battle: '대결', xp_boost: '경험치 부스트' } as const)[type];
  return capReached ? `${base} · 오늘 XP 상한 도달` : base;
}

/** Account XP (AC-G1~G4). One ledger row per (sourceType, sourceId, userId); zero-eligibility writes nothing. */
@Injectable()
export class XpService implements XpGrantPort {
  constructor(@Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig) {}

  async grant(tx: Tx, req: XpGrantRequest): Promise<XpLedgerEntry[]> {
    return (await this.grantDetailed(tx, req)).entries;
  }

  async grantDetailed(tx: Tx, req: XpGrantRequest): Promise<XpGrantOutcome> {
    if (req.ownerId.kind !== 'user') return { entries: [], result: null };
    const userId = req.ownerId.userId;
    const key = { sourceType_sourceId_userId: { sourceType: req.source.type, sourceId: req.source.id, userId } };
    await lockAll(tx, [{ userId, dayKey: req.kstDay }]);
    const existing = await tx.xpLedger.findUnique({ where: key });
    if (existing) return { entries: [toLedgerEntry(existing)], result: null };

    const result = computeXpGrant(
      {
        context: await this.context(tx, userId, req),
        items: await this.items(tx, userId, req),
        grantedTodayBefore: await grantedOn(tx, userId, req.kstDay),
      },
      this.cfg,
    );
    if (!result.eligible || result.preCapTotal <= 0) return { entries: [], result };
    const row = await tx.xpLedger.create({
      data: {
        userId,
        sourceType: req.source.type,
        sourceId: req.source.id,
        amount: result.granted,
        preCapAmount: result.preCapTotal,
        cappedAmount: result.cappedAmount,
        reason: xpReason(req.source.type, req.context, result.capReached),
        breakdown: result as unknown as Prisma.InputJsonValue,
        configVersion: result.configVersion,
        kstDay: dayToDate(req.kstDay),
      },
    });
    return { entries: [toLedgerEntry(row)], result };
  }

  /**
   * 경험치 부스트: when the user has boosted sets left, pays floor(granted × bonusRate) as a separate
   * `xp_boost` ledger row (sourceId `<type>:<id>` of the boosted grant) and uses up one set. Idempotent on
   * that row: a replay returns the stored bonus and never uses another set. Nothing happens (and no set is
   * used) when the grant or the bonus is 0, or when `freshGrant` is false (the base grant already existed,
   * e.g. a re-recorded battle). Call inside the grant's transaction, after the grant itself.
   *
   * The bonus is neither clipped by nor counted toward the daily cap (`grantedOn` skips these rows), so a
   * boost always pays: the cap still applies to the base grant exactly as before.
   */
  async applyBoost(
    tx: Tx,
    userId: string,
    source: XpGrantRequest['source'],
    granted: number,
    kstDay: KstDay,
    freshGrant = true,
  ): Promise<XpBoostResultDto | undefined> {
    const sourceId = `${source.type}:${source.id}`;
    const existing = await tx.xpLedger.findUnique({ where: { sourceType_sourceId_userId: { sourceType: 'xp_boost', sourceId, userId } } });
    if (existing) {
      const state = await tx.xpBoost.findUnique({ where: { userId } });
      return { bonus: existing.amount, remainingSets: state?.remainingSets ?? 0 };
    }
    const bonus = Math.floor(granted * this.cfg.xpBoost.bonusRate);
    if (!freshGrant || bonus <= 0) return undefined;
    const left = await tx.$queryRaw<Array<{ remainingSets: number }>>`
      UPDATE "XpBoost" SET "remainingSets" = "remainingSets" - 1, "updatedAt" = now()
      WHERE "userId" = ${userId}::uuid AND "remainingSets" > 0
      RETURNING "remainingSets"`;
    if (!left.length) return undefined;
    await tx.xpLedger.create({
      data: {
        userId,
        sourceType: 'xp_boost',
        sourceId,
        amount: bonus,
        preCapAmount: bonus,
        cappedAmount: 0,
        reason: `경험치 부스트 +${Math.round(this.cfg.xpBoost.bonusRate * 100)}%`,
        breakdown: { base: granted, bonusRate: this.cfg.xpBoost.bonusRate } as Prisma.InputJsonValue,
        configVersion: this.cfg.configVersion,
        kstDay: dayToDate(kstDay),
      },
    });
    return { bonus, remainingSets: left[0]!.remainingSets };
  }

  private async context(tx: Tx, userId: string, req: XpGrantRequest): Promise<XpGrantContext> {
    const c = req.context;
    switch (c.kind) {
      case 'stage':
        return { kind: 'stage', cleared: c.cleared, alreadyCleared: !c.firstClear };
      case 'battle':
        return c;
      case 'composite':
        return { kind: 'composite', correctCount: c.correctCount, totalCount: c.totalCount };
      case 'daily': {
        const n = await tx.xpLedger.count({ where: { userId, sourceType: 'daily', kstDay: dayToDate(req.kstDay) } });
        return { kind: 'daily', correctCount: c.correctCount, totalCount: c.totalCount, alreadyGrantedToday: n > 0 };
      }
      case 'quest': {
        const week = kstWeekStart(req.kstDay);
        const n = await tx.xpLedger.count({
          where: { userId, sourceType: 'quest', kstDay: { gte: dayToDate(week), lte: dayToDate(addKstDays(week, 6)) } },
        });
        return { kind: 'quest', correctCount: c.correctCount, totalCount: c.totalCount, alreadyGrantedThisWeek: n > 0 };
      }
    }
  }

  private async items(tx: Tx, userId: string, req: XpGrantRequest) {
    if (!req.items.length) return [];
    const ids = req.items.map((i) => i.questionId);
    const [questions, notes] = await Promise.all([
      tx.question.findMany({ where: { id: { in: ids } }, select: { id: true, difficulty: true, type: true, topicId: true } }),
      tx.wrongNote.findMany({ where: { userId, questionId: { in: ids } } }),
    ]);
    const qById = new Map(questions.map((q) => [q.id, q]));
    const noteById = new Map(notes.map((n) => [n.questionId, n]));
    const first = Math.min(...req.items.map((i) => i.answeredAt.getTime()));
    // Weak topics as of the start of this set/battle, so write order inside the transaction does not matter.
    const { weak } = await loadTopicWrongRates(tx, userId, first - 1, this.cfg);
    const out = [];
    for (const item of req.items) {
      const q = qById.get(item.questionId);
      if (!q) continue;
      const at = item.answeredAt.getTime();
      const prior = await tx.solveLog.count({
        where: {
          userId,
          questionId: item.questionId,
          answeredAt: { gt: new Date(at - this.cfg.xp.sameQuestionDecay.windowMs), lt: item.answeredAt },
        },
      });
      const note = noteById.get(item.questionId);
      // The wrong-note port may already have marked this very answer as the review (reviewedAt = answeredAt).
      const reviewCompleted =
        item.isReview && item.correct && !!note && (note.status === 'open' || note.reviewedAt?.getTime() === at);
      out.push({
        questionId: q.id,
        difficulty: q.difficulty,
        questionType: q.type,
        correct: item.correct,
        noHint: item.noHint,
        weakTopic: weak.includes(q.topicId as never),
        reviewCompleted,
        priorSolvesInWindow: prior,
      });
    }
    return out;
  }
}

/** XP granted on a KST day toward the daily cap (경험치 부스트 bonus rows do not count, see `applyBoost`). */
export async function grantedOn(tx: Tx, userId: string, day: KstDay): Promise<number> {
  const sum = await tx.xpLedger.aggregate({ where: { userId, kstDay: dayToDate(day), sourceType: { not: 'xp_boost' } }, _sum: { amount: true } });
  return sum._sum.amount ?? 0;
}

