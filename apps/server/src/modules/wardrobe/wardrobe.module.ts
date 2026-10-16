import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Param, Post, Put } from '@nestjs/common';
import type { Item } from '@prisma/client';
import { accountLevel, type GrowthConfig } from '@zuirock/game-rules';
import { ITEM_SLOTS, type EquipRequest, type ItemDto, type ItemSlot, type PurchaseItemResponse, type WardrobeDto } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { badRequest, conflict, notFound } from '../../common/api-error.js';
import { Auth, UserId } from '../../common/auth.guard.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Tx } from '../../ports/tx.js';

const toItemDto = (i: Item): ItemDto => ({
  id: i.id,
  slot: i.slot,
  name: i.name,
  imageUrl: `/api/assets/${i.imageKey}`,
  acquire: i.acquire,
  price: i.price,
  unlockLevel: i.unlockLevel,
  sortOrder: i.sortOrder,
});

/**
 * Character wardrobe (AC-G8, AC-G9). Items are data (Item rows + Asset images, synced from
 * content/items). Owned = default, bought with cheese, or level-unlocked at the account level.
 * Only owned items can be equipped; previewing unowned ones is client-side.
 */
@Injectable()
export class WardrobeService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private async ownedIds(db: Tx, userId: string, items: Item[]): Promise<Set<string>> {
    const [bought, xp] = await Promise.all([
      db.userItem.findMany({ where: { userId }, select: { itemId: true } }),
      db.xpLedger.aggregate({ where: { userId }, _sum: { amount: true } }),
    ]);
    const level = accountLevel(xp._sum.amount ?? 0, this.cfg).level;
    const owned = new Set(bought.map((b) => b.itemId));
    for (const i of items) {
      if (i.acquire === 'default' || (i.acquire === 'level' && level >= (i.unlockLevel ?? this.cfg.items.unlockLevel))) owned.add(i.id);
    }
    return owned;
  }

  private async balance(db: Tx, userId: string): Promise<number> {
    return (await db.cheeseLedger.aggregate({ where: { userId }, _sum: { delta: true } }))._sum.delta ?? 0;
  }

  async get(userId: string): Promise<WardrobeDto> {
    const items = await this.prisma.item.findMany({ orderBy: [{ slot: 'asc' }, { sortOrder: 'asc' }] });
    const [owned, equipped, cheese] = await Promise.all([
      this.ownedIds(this.prisma, userId, items),
      this.prisma.characterEquip.findMany({ where: { userId } }),
      this.balance(this.prisma, userId),
    ]);
    const body = process.env.CHARACTER_BODY_ASSET_KEY;
    return {
      bodyImageUrl: body ? `/api/assets/${body}` : '',
      items: items.map((i) => ({ ...toItemDto(i), owned: owned.has(i.id) })),
      equipped: Object.fromEntries(equipped.map((e) => [e.slot, e.itemId])),
      cheese,
    };
  }

  async purchase(userId: string, itemId: string): Promise<PurchaseItemResponse> {
    return this.prisma.$transaction(async (tx) => {
      await lockAll(tx, [{ userId, dayKey: 'cheese' }]);
      const item = await tx.item.findUnique({ where: { id: itemId } });
      if (!item) throw notFound('ITEM_NOT_FOUND', '아이템을 찾을 수 없어요');
      if (item.acquire !== 'cheese' || item.price === null) throw badRequest('NOT_FOR_SALE', '치즈로 살 수 없는 아이템이에요');
      if ((await this.ownedIds(tx, userId, [item])).has(item.id)) throw conflict('ALREADY_OWNED', '이미 가진 아이템이에요');
      const cheese = await this.balance(tx, userId);
      if (cheese < item.price) throw badRequest('INSUFFICIENT_CHEESE', '치즈가 부족해요');
      await tx.cheeseLedger.create({ data: { userId, delta: -item.price, reason: 'item_purchase', itemId: item.id } });
      await tx.userItem.create({ data: { userId, itemId: item.id } });
      return { itemId: item.id, cheese: cheese - item.price };
    });
  }

  async equip(userId: string, req: EquipRequest): Promise<WardrobeDto> {
    const equipped = req?.equipped ?? {};
    const slots = Object.keys(equipped);
    if (slots.some((s) => !(ITEM_SLOTS as readonly string[]).includes(s))) throw badRequest('BAD_SLOT', '부위가 올바르지 않아요');
    const ids = Object.values(equipped).filter((v): v is string => typeof v === 'string');
    const items = await this.prisma.item.findMany({ where: { id: { in: ids } } });
    const owned = await this.ownedIds(this.prisma, userId, items);
    for (const [slot, id] of Object.entries(equipped)) {
      if (!id) continue;
      const item = items.find((i) => i.id === id);
      if (!item || item.slot !== slot) throw badRequest('BAD_ITEM', '그 부위에 입을 수 없는 아이템이에요');
      if (!owned.has(id)) throw badRequest('NOT_OWNED', '가진 아이템만 입을 수 있어요');
    }
    await this.prisma.$transaction([
      this.prisma.characterEquip.deleteMany({ where: { userId } }),
      this.prisma.characterEquip.createMany({
        data: Object.entries(equipped)
          .filter(([, id]) => !!id)
          .map(([slot, itemId]) => ({ userId, slot: slot as ItemSlot, itemId: itemId as string })),
      }),
    ]);
    return this.get(userId);
  }
}

@Controller('me/wardrobe')
@Auth()
class WardrobeController {
  constructor(private readonly wardrobe: WardrobeService) {}

  @Get()
  get(@UserId() userId: string) {
    return this.wardrobe.get(userId);
  }

  @Post('items/:itemId/purchase')
  @HttpCode(200)
  purchase(@UserId() userId: string, @Param('itemId') itemId: string) {
    return this.wardrobe.purchase(userId, itemId);
  }

  @Put('equipped')
  equip(@UserId() userId: string, @Body() body: EquipRequest) {
    return this.wardrobe.equip(userId, body);
  }
}

@Module({ controllers: [WardrobeController], providers: [WardrobeService] })
export class WardrobeModule {}
