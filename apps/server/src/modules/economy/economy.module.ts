import { Body, Controller, Get, HttpCode, Module, Param, Post, Query } from '@nestjs/common';
import type { PurchaseShopItemRequest, UseSoloItemRequest } from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { cryptoRng, ECONOMY_RNG, EconomyService } from './economy.service.js';
import { QuestsService } from './quests.service.js';

@Controller()
@Auth()
class EconomyController {
  constructor(
    private readonly economy: EconomyService,
    private readonly quests: QuestsService,
  ) {}

  @Get('shop')
  shop(@UserId() userId: string) {
    return this.economy.shop(userId);
  }

  @Post('shop/items/:kind/purchase')
  @HttpCode(200)
  purchase(@UserId() userId: string, @Param('kind') kind: string, @Body() body: PurchaseShopItemRequest) {
    return this.economy.purchase(userId, kind, body?.quantity);
  }

  @Get('me/inventory')
  inventory(@UserId() userId: string) {
    return this.economy.inventory(userId);
  }

  @Post('me/chests/:id/open')
  @HttpCode(200)
  open(@UserId() userId: string, @Param('id') id: string) {
    return this.economy.openChest(userId, id);
  }

  @Get('me/quests')
  dailyQuests(@UserId() userId: string) {
    return this.quests.daily(userId);
  }

  @Post('me/quests/:id/claim')
  @HttpCode(200)
  claimQuest(@UserId() userId: string, @Param('id') id: string) {
    return this.quests.claim(userId, id);
  }

  @Get('me/streak/calendar')
  calendar(@UserId() userId: string, @Query('month') month?: string) {
    return this.economy.calendar(userId, month);
  }

  @Post('solo/sets/:id/items/use')
  @HttpCode(200)
  use(@UserId() userId: string, @Param('id') id: string, @Body() body: UseSoloItemRequest) {
    return this.economy.useItem(userId, id, body);
  }
}

@Module({
  controllers: [EconomyController],
  providers: [EconomyService, QuestsService, { provide: ECONOMY_RNG, useValue: cryptoRng }],
  exports: [EconomyService, QuestsService],
})
export class EconomyModule {}
