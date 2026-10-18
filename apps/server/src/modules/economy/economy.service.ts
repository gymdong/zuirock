import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma, SetAttempt } from '@prisma/client';
import {
  addKstDays,
  chestTierForLevel,
  chosungFirstChar,
  diffKstDays,
  kstDayEnd,
  kstDayStart,
  pickRemovedChoice,
  rollChest,
  shopCatalog,
  toKstDay,
  type GrowthConfig,
  type Rng,
} from '@zuirock/game-rules';
import {
  CONSUMABLE_KINDS,
  SHOP_ITEM_KINDS,
  type ChestGrantDto,
  type ChestReward,
  type ConsumableKind,
  type InventoryDto,
  type OpenChestResponse,
  type PurchaseShopItemResponse,
  type ShopDto,
  type ShopItemKind,
  type StreakCalendarDto,
  type TopicId,
  type UseSoloItemResponse,
} from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { ApiError, badRequest, conflict, notFound } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dateToDay } from '../../common/kst-date.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/tx.js';
import { CHEESE_LOCK_DAY, STREAK_LOCK_DAY, StreakService, protectionsHeld } from '../growth/streak.service.js';

export const ECONOMY_RNG = Symbol('EconomyRng');
/** Crypto-quality uniform [0, 1) (chest rolls, removed choice). */
export const cryptoRng: Rng = () => randomInt(0, 2 ** 48) / 2 ** 48;

const insufficient = () => new ApiError(HttpStatus.PAYMENT_REQUIRED, 'INSUFFICIENT_CHEESE', '치즈가 부족해요');
const isConsumable = (k: string): k is ConsumableKind => (CONSUMABLE_KINDS as readonly string[]).includes(k);

interface Wallet {
  cheese: number;
  protections: number;
  consumables: Partial<Record<ConsumableKind, number>>;
  chests: number;
}

/**
 * Round-2 economy (docs/api-economy.md): shop, consumables, reward chests, streak calendar.
 * Every cheese spend/grant runs in one transaction under the user's sorted advisory xact locks.
 */
@Injectable()
export class EconomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly streak: StreakService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
    @Inject(ECONOMY_RNG) private readonly rng: Rng,
  ) {}

  /** One statement: cheese balance, held protections, consumables, unopened chests. */
  private async wallet(db: Tx, userId: string): Promise<Wallet> {
    const [row] = await db.$queryRaw<Array<{ cheese: number; protections: number; consumables: Record<string, number>; chests: number }>>`
      SELECT
        (SELECT coalesce(sum(delta), 0) FROM "CheeseLedger" WHERE "userId" = ${userId}::uuid)::int AS cheese,
        (SELECT greatest(0, count(*) FILTER (WHERE reason = 'protection_purchase') - count(*) FILTER (WHERE reason = 'protection_use'))
           FROM "CheeseLedger" WHERE "userId" = ${userId}::uuid AND reason IN ('protection_purchase', 'protection_use')
           AND "createdAt" <= ${new Date(this.clock.now())})::int AS protections,
        (SELECT coalesce(json_object_agg(kind, quantity), '{}'::json) FROM "UserConsumable" WHERE "userId" = ${userId}::uuid) AS consumables,
        (SELECT count(*) FROM "Chest" WHERE "userId" = ${userId}::uuid AND "openedAt" IS NULL)::int AS chests`;
    return { cheese: row!.cheese, protections: row!.protections, consumables: row!.consumables as Wallet['consumables'], chests: row!.chests };
  }

  async shop(userId: string): Promise<ShopDto> {
    const w = await this.wallet(this.prisma, userId);
    return {
      cheese: w.cheese,
      items: shopCatalog(this.cfg).map((i) => ({ ...i, owned: i.kind === 'streak_protection' ? w.protections : (w.consumables[i.kind] ?? 0) })),
      chestsUnopened: w.chests,
    };
  }

  async purchase(userId: string, rawKind: string, rawQty: unknown): Promise<PurchaseShopItemResponse> {
    if (!(SHOP_ITEM_KINDS as readonly string[]).includes(rawKind)) throw notFound('UNKNOWN_ITEM', '없는 상품이에요');
    const kind = rawKind as ShopItemKind;
    const quantity = rawQty === undefined ? 1 : Number(rawQty);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw badRequest('BAD_QUANTITY', '수량이 올바르지 않아요');
    const item = shopCatalog(this.cfg).find((i) => i.kind === kind)!;
    return this.prisma.$transaction(async (tx) => {
      await lockAll(tx, [{ userId, dayKey: CHEESE_LOCK_DAY }, { userId, dayKey: STREAK_LOCK_DAY }]);
      const w = await this.wallet(tx, userId);
      const owned = kind === 'streak_protection' ? w.protections : (w.consumables[kind] ?? 0);
      if (owned + quantity > item.max) throw conflict('MAX_HELD', `최대 ${item.max}개까지 가질 수 있어요`);
      const cost = item.price * quantity;
      if (w.cheese < cost) throw insufficient();
      const now = new Date(this.clock.now());
      if (kind === 'streak_protection') {
        // Same ledger rows as POST /me/streak/protections (held = purchases − uses).
        await tx.cheeseLedger.createMany({
          data: Array.from({ length: quantity }, () => ({ userId, delta: -item.price, reason: 'protection_purchase' as const, createdAt: now })),
        });
      } else {
        await tx.cheeseLedger.create({ data: { userId, delta: -cost, reason: 'item_purchase', itemId: kind, createdAt: now } });
        await tx.userConsumable.upsert({
          where: { userId_kind: { userId, kind } },
          create: { userId, kind, quantity },
          update: { quantity: { increment: quantity } },
        });
      }
      return { cheese: w.cheese - cost, owned: owned + quantity };
    });
  }

  async inventory(userId: string, db: Tx = this.prisma): Promise<InventoryDto> {
    const [items, chests] = await Promise.all([
      db.userConsumable.findMany({ where: { userId } }),
      db.chest.findMany({ where: { userId, openedAt: null }, orderBy: { grantedAt: 'asc' } }),
    ]);
    return {
      items: CONSUMABLE_KINDS.map((kind) => ({ kind, owned: items.find((i) => i.kind === kind)?.quantity ?? 0 })),
      chests: chests.map((c) => ({ id: c.id, tier: c.tier, source: { topicId: c.sourceTopicId as TopicId, level: c.sourceLevel }, grantedAt: c.grantedAt.toISOString() })),
    };
  }

  /**
   * Stage first clear → one chest (good on multiples of 5). Called inside the set-complete transaction;
   * idempotent on the set attempt. Guests, replays and skipped stages never reach this.
   */
  async grantStageChest(tx: Tx, userId: string, set: Pick<SetAttempt, 'id' | 'topicId' | 'level'>): Promise<ChestGrantDto> {
    const tier = chestTierForLevel(set.level!, this.cfg);
    const rows = await tx.$queryRaw<Array<{ id: string; tier: ChestGrantDto['tier'] }>>`
      INSERT INTO "Chest" (id, "userId", tier, "sourceTopicId", "sourceLevel", "sourceSetAttemptId", "grantedAt")
      VALUES (gen_random_uuid(), ${userId}::uuid, ${tier}::"ChestTier", ${set.topicId}, ${set.level}, ${set.id}::uuid, ${new Date(this.clock.now())})
      ON CONFLICT ("sourceSetAttemptId") DO UPDATE SET "sourceSetAttemptId" = EXCLUDED."sourceSetAttemptId"
      RETURNING id, tier`;
    return rows[0]!;
  }

  async chestForSet(setId: string): Promise<ChestGrantDto | undefined> {
    const c = await this.prisma.chest.findUnique({ where: { sourceSetAttemptId: setId }, select: { id: true, tier: true } });
    return c ?? undefined;
  }

  async openChest(userId: string, id: string): Promise<OpenChestResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockAll(tx, [{ userId, dayKey: CHEESE_LOCK_DAY }, { userId, dayKey: STREAK_LOCK_DAY }]);
      const chest = await tx.chest.findUnique({ where: { id } }).catch(() => null);
      if (!chest || chest.userId !== userId) throw notFound('CHEST_NOT_FOUND', '상자를 찾을 수 없어요');
      if (chest.openedAt) throw conflict('CHEST_OPENED', '이미 연 상자예요');
      const now = new Date(this.clock.now());
      const held = await protectionsHeld(tx, userId, new Date(now.getTime() + 1));
      const rewards: ChestReward[] = rollChest(chest.tier, this.rng, { protection: held }, this.cfg);
      const ledger: Prisma.CheeseLedgerCreateManyInput[] = [];
      for (const r of rewards) {
        if (r.type === 'cheese') ledger.push({ userId, delta: r.amount, reason: 'chest_reward', itemId: `chest:${chest.id}`, createdAt: now });
        // A protection reward is a zero-cost "purchase" row: held = purchases − uses.
        if (r.type === 'protection') ledger.push({ userId, delta: 0, reason: 'protection_purchase', itemId: `chest:${chest.id}`, createdAt: now });
        if (r.type === 'item') {
          const max = shopCatalog(this.cfg).find((i) => i.kind === r.kind)!.max;
          await tx.$executeRaw`
            INSERT INTO "UserConsumable" ("userId", kind, quantity) VALUES (${userId}::uuid, ${r.kind}::"ConsumableKind", ${Math.min(r.quantity, max)})
            ON CONFLICT ("userId", kind) DO UPDATE SET quantity = LEAST(${max}, "UserConsumable".quantity + EXCLUDED.quantity)`;
        }
      }
      if (ledger.length) await tx.cheeseLedger.createMany({ data: ledger });
      const done = await tx.chest.updateMany({ where: { id, openedAt: null }, data: { openedAt: now, rewards: rewards as unknown as Prisma.InputJsonValue } });
      if (done.count !== 1) throw conflict('CHEST_OPENED', '이미 연 상자예요');
      const cheese = (await tx.cheeseLedger.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta ?? 0;
      return { rewards, cheese, inventory: await this.inventory(userId, tx) };
    });
  }

  /** Solo-only item use (D-R2-2). One per (set, question, kind); the question then counts as hinted. */
  async useItem(userId: string, setId: string, req: { questionId?: unknown; kind?: unknown }): Promise<UseSoloItemResponse> {
    const kind = typeof req?.kind === 'string' && isConsumable(req.kind) ? req.kind : null;
    if (!kind) throw badRequest('BAD_KIND', '아이템 종류가 올바르지 않아요');
    const set = await this.prisma.setAttempt.findUnique({ where: { id: setId } }).catch(() => null);
    if (!set || set.userId !== userId) throw notFound('SET_NOT_FOUND', '솔로 세트를 찾을 수 없어요');
    if (set.status !== 'in_progress') throw conflict('SET_CLOSED', '이미 끝난 세트예요');
    const questionId = typeof req.questionId === 'string' ? req.questionId : '';
    if (!set.questionIds.includes(questionId)) throw badRequest('NOT_IN_SET', '이 세트의 문제가 아니에요');
    const [q, answered] = await Promise.all([
      this.prisma.question.findUniqueOrThrow({ where: { id: questionId } }),
      this.prisma.solveLog.count({ where: { setAttemptId: set.id, questionId } }),
    ]);
    if (answered) throw conflict('ALREADY_ANSWERED', '이미 답한 문제예요');
    if ((kind === 'chosung_first' && q.type !== 'chosung') || (kind === 'remove_wrong_choice' && q.type !== 'mcq')) {
      throw badRequest('WRONG_QUESTION_TYPE', kind === 'chosung_first' ? '초성퀴즈에만 쓸 수 있어요' : '객관식에만 쓸 수 있어요');
    }
    const value = kind === 'chosung_first' ? chosungFirstChar(q.answer) : pickRemovedChoice(q.choices, q.answer, this.rng);
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.itemUse.createMany({ data: [{ setAttemptId: set.id, questionId, kind, userId, value }], skipDuplicates: true });
      if (!inserted.count) throw conflict('ALREADY_USED', '이 문제에는 이미 썼어요');
      const left = await tx.$queryRaw<Array<{ quantity: number }>>`
        UPDATE "UserConsumable" SET quantity = quantity - 1 WHERE "userId" = ${userId}::uuid AND kind = ${kind}::"ConsumableKind" AND quantity > 0
        RETURNING quantity`;
      if (!left.length) throw conflict('NO_ITEM', '아이템이 없어요');
      // Reuses the solo hint mechanism: no no-hint bonus for this question (D-R2-2); the clear rule is untouched.
      await tx.$executeRaw`
        UPDATE "SetAttempt" SET "hintedQuestionIds" = array_append("hintedQuestionIds", ${questionId}::uuid)
        WHERE id = ${set.id}::uuid AND NOT (${questionId}::uuid = ANY("hintedQuestionIds"))`;
      return { ...(kind === 'chosung_first' ? { chosungFirst: value } : { removedChoice: value }), owned: left[0]!.quantity };
    });
  }

  /** Month view of the streak (KST). 2 statements, plus a streak catch-up only when the state is stale. */
  async calendar(userId: string, month?: string): Promise<StreakCalendarDto> {
    const today = toKstDay(this.clock.now());
    const m = month ?? today.slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) throw badRequest('BAD_MONTH', 'month는 YYYY-MM이에요');
    const first = `${m}-01`;
    const days: string[] = [];
    for (let d = first; d.startsWith(m); d = addKstDays(d, 1)) days.push(d);
    const from = new Date(kstDayStart(first));
    const to = new Date(kstDayEnd(days[days.length - 1]!));

    let state = await this.prisma.streakState.findUnique({ where: { userId } });
    if (state?.current && state.judgedThrough && diffKstDays(dateToDay(state.judgedThrough), today) > 1) {
      await this.streak.get(userId); // judge the missed days (protections at 00:00 KST) before showing them
      state = await this.prisma.streakState.findUnique({ where: { userId } });
    }
    const rows = await this.prisma.$queryRaw<Array<{ day: string; kind: 'set' | 'battle' | 'protected'; n: number }>>`
      SELECT day, kind, count(*)::int AS n FROM (
        SELECT to_char("completedAt" AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') AS day, 'set' AS kind FROM "SetAttempt"
          WHERE "userId" = ${userId}::uuid AND status = 'completed' AND NOT skipped AND "totalCount" >= ${this.cfg.stage.size}
          AND "completedAt" >= ${from} AND "completedAt" < ${to}
        UNION ALL
        SELECT to_char("kstDay", 'YYYY-MM-DD'), 'battle' FROM "BattleResult"
          WHERE "userId" = ${userId}::uuid AND NOT "left" AND "endedAt" >= ${from} AND "endedAt" < ${to}
        UNION ALL
        -- protection_use rows are stamped at the 00:00 KST boundary after the protected day
        SELECT to_char(("createdAt" - interval '1 millisecond') AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'), 'protected' FROM "CheeseLedger"
          WHERE "userId" = ${userId}::uuid AND reason = 'protection_use' AND "createdAt" > ${from} AND "createdAt" <= ${to}
      ) x GROUP BY day, kind`;
    const count = (day: string, kind: string) => rows.find((r) => r.day === day && r.kind === kind)?.n ?? 0;
    const held = Math.max(0, await protectionsHeld(this.prisma, userId, new Date(this.clock.now() + 1)));
    const current = state?.current ?? 0;
    const next = this.cfg.streak.milestones.find((x) => x.days > current) ?? null;
    return {
      month: m,
      days: days.map((date) => {
        const sets = count(date, 'set');
        const battles = count(date, 'battle');
        const studied = sets + battles > 0;
        const extra = studied ? { sets, battles } : {};
        if (date > today) return { date, state: 'future' as const };
        if (date === today) return { date, state: 'today' as const, ...extra };
        if (studied) return { date, state: 'studied' as const, ...extra };
        if (count(date, 'protected')) return { date, state: 'protected' as const };
        return { date, state: 'missed' as const };
      }),
      current,
      longest: state?.longest ?? 0,
      protectionsHeld: held,
      nextMilestone: next ? { days: next.days, cheese: next.cheese, daysLeft: next.days - current } : null,
    };
  }
}
