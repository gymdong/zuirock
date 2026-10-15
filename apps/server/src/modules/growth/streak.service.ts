import { Inject, Injectable } from '@nestjs/common';
import type { StreakState as StreakRow } from '@prisma/client';
import {
  addKstDays,
  applyStreakDay,
  canBuyProtection,
  kstDayEnd,
  restoreStreak,
  toKstDay,
  type GrowthConfig,
  type StreakEvent,
  type StreakState,
} from '@zuirock/game-rules';
import type { KstDay, OwnerRef, StreakActivityKind, StreakDto, StreakPurchaseResponse } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { badRequest } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay, dayToDate } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import { withTxRetry } from '../../common/tx-retry.js';
import type { StreakPort } from '../../ports/streak.port.js';
import type { Tx } from '../../ports/tx.js';

const STREAK_LOCK_DAY = 'streak';

function fromRow(r: StreakRow | null): StreakState {
  const d = (x: Date | null | undefined) => (x ? dateToDay(x) : null);
  return {
    current: r?.current ?? 0,
    longest: r?.longest ?? 0,
    lastCountedDay: d(r?.lastCountedDay),
    runStartDay: d(r?.runStartDay),
    judgedThrough: d(r?.judgedThrough),
    broken:
      r?.brokenMissedDay && r.brokenRunStartDay
        ? { missedDay: dateToDay(r.brokenMissedDay), lostLength: r.brokenLostLength ?? 0, runStartDay: dateToDay(r.brokenRunStartDay) }
        : null,
  };
}

function toRow(s: StreakState) {
  const d = (x: KstDay | null) => (x ? dayToDate(x) : null);
  return {
    current: s.current,
    longest: s.longest,
    lastCountedDay: d(s.lastCountedDay),
    runStartDay: d(s.runStartDay),
    judgedThrough: d(s.judgedThrough),
    brokenMissedDay: d(s.broken?.missedDay ?? null),
    brokenLostLength: s.broken?.lostLength ?? null,
    brokenRunStartDay: d(s.broken?.runStartDay ?? null),
  };
}

/** Held protections at an instant = purchases − uses with createdAt < instant (plan §4.3 LB). */
export async function protectionsHeld(db: Tx, userId: string, before: Date): Promise<number> {
  const rows = await db.cheeseLedger.groupBy({
    by: ['reason'],
    where: { userId, reason: { in: ['protection_purchase', 'protection_use'] }, createdAt: { lt: before } },
    _count: { _all: true },
  });
  const n = (reason: string) => rows.find((r) => r.reason === reason)?._count._all ?? 0;
  return n('protection_purchase') - n('protection_use');
}

/**
 * Streak (AC-G6, AC-G7). Activity days are judged as they happen; days without activity are judged
 * lazily (on read or on the next activity) using the protections held at the following 00:00 KST.
 * Idempotent per day via judgedThrough; milestone cheese keyed by (userId, milestone, runStartDay).
 */
@Injectable()
export class StreakService implements StreakPort {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async markActivity(tx: Tx, owner: OwnerRef, kstDay: KstDay, _kind: StreakActivityKind): Promise<void> {
    if (owner.kind !== 'user') return;
    await lockAll(tx, [{ userId: owner.userId, dayKey: STREAK_LOCK_DAY }]);
    let state = await this.catchUp(tx, owner.userId, addKstDays(kstDay, -1));
    const applied = applyStreakDay(state, { day: kstDay, active: true, protectionsAtBoundary: 0 }, this.cfg);
    state = applied.state;
    await this.persist(tx, owner.userId, state, applied.events);
  }

  /** Judges every unjudged day up to `through` as inactive and stores the result. */
  async catchUp(tx: Tx, userId: string, through: KstDay): Promise<StreakState> {
    let state = fromRow(await tx.streakState.findUnique({ where: { userId } }));
    if (!state.judgedThrough) return state; // nothing to judge before the first activity
    const events: StreakEvent[] = [];
    for (let day = addKstDays(state.judgedThrough, 1); day <= through; day = addKstDays(day, 1)) {
      if (state.current === 0) {
        // Nothing left to protect or break: jump straight to `through`.
        state = { ...state, judgedThrough: through };
        break;
      }
      const held = await protectionsHeld(tx, userId, new Date(kstDayEnd(day)));
      const applied = applyStreakDay(state, { day, active: false, protectionsAtBoundary: held }, this.cfg);
      state = applied.state;
      events.push(...applied.events);
      // A used protection must count before the next boundary.
      for (const e of applied.events) {
        if (e.type === 'protection_used') {
          await tx.cheeseLedger.create({
            data: { userId, delta: 0, reason: 'protection_use', createdAt: new Date(kstDayEnd(e.day)) },
          });
        }
      }
    }
    await this.persist(tx, userId, state, events.filter((e) => e.type !== 'protection_used'));
    return state;
  }

  private async persist(tx: Tx, userId: string, state: StreakState, events: readonly StreakEvent[]): Promise<void> {
    const data = toRow(state);
    await tx.streakState.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    const milestones = events.filter((e) => e.type === 'milestone');
    if (milestones.length) {
      await tx.cheeseLedger.createMany({
        skipDuplicates: true,
        data: milestones.map((m) => ({
          userId,
          delta: m.cheese,
          reason: 'streak_milestone' as const,
          milestone: m.days,
          runStartDay: dayToDate(m.runStartDay),
        })),
      });
    }
  }

  private today(): KstDay {
    return toKstDay(this.clock.now());
  }

  async get(userId: string): Promise<StreakDto> {
    return withTxRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await lockAll(tx, [{ userId, dayKey: STREAK_LOCK_DAY }]);
        const today = this.today();
        const state = await this.catchUp(tx, userId, addKstDays(today, -1));
        return this.dto(tx, userId, state, today);
      }),
    );
  }

  private async dto(tx: Tx, userId: string, state: StreakState, today: KstDay): Promise<StreakDto> {
    const held = await protectionsHeld(tx, userId, new Date(this.clock.now() + 1));
    const restorable =
      state.broken && addKstDays(state.broken.missedDay, this.cfg.streak.restore.windowDays) >= today
        ? {
            lostLength: state.broken.lostLength,
            cost: this.cfg.streak.restore.cost,
            untilKstDay: addKstDays(state.broken.missedDay, this.cfg.streak.restore.windowDays),
          }
        : null;
    const next = this.cfg.streak.milestones.find((m) => m.days > state.current) ?? null;
    return {
      current: state.current,
      longest: state.longest,
      todayCounted: state.lastCountedDay === today,
      protections: held,
      maxProtections: this.cfg.streak.protection.maxHeld,
      protectionPrice: this.cfg.streak.protection.price,
      restorable,
      nextMilestone: next ? { days: next.days, cheese: next.cheese } : null,
    };
  }

  private async balance(tx: Tx, userId: string): Promise<number> {
    const sum = await tx.cheeseLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    return sum._sum.delta ?? 0;
  }

  async buyProtection(userId: string): Promise<StreakPurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockAll(tx, [{ userId, dayKey: STREAK_LOCK_DAY }]);
      const today = this.today();
      const state = await this.catchUp(tx, userId, addKstDays(today, -1));
      const cheese = await this.balance(tx, userId);
      const held = await protectionsHeld(tx, userId, new Date(this.clock.now() + 1));
      const check = canBuyProtection({ held, cheese }, this.cfg);
      if (!check.ok) throw badRequest(check.reason, check.reason === 'MAX_HELD' ? '보호권은 최대 2개까지 가질 수 있어요' : '치즈가 부족해요');
      await tx.cheeseLedger.create({
        data: { userId, delta: -check.price, reason: 'protection_purchase', createdAt: new Date(this.clock.now()) },
      });
      return { streak: await this.dto(tx, userId, state, today), cheese: cheese - check.price };
    });
  }

  async restore(userId: string): Promise<StreakPurchaseResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockAll(tx, [{ userId, dayKey: STREAK_LOCK_DAY }]);
      const today = this.today();
      const state = await this.catchUp(tx, userId, addKstDays(today, -1));
      const cheese = await this.balance(tx, userId);
      const result = restoreStreak(state, { today, cheese }, this.cfg);
      if (!result.ok) throw badRequest(result.reason, result.reason === 'INSUFFICIENT_CHEESE' ? '치즈가 부족해요' : '복구할 수 있는 스트릭이 없어요');
      await tx.cheeseLedger.create({
        data: { userId, delta: -result.cost, reason: 'streak_restore', createdAt: new Date(this.clock.now()) },
      });
      await this.persist(tx, userId, result.state, []);
      return { streak: await this.dto(tx, userId, result.state, today), cheese: cheese - result.cost };
    });
  }
}
