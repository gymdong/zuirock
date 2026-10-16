import { Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import type { CheeseLedgerEntryDto, StreakDto, StreakPurchaseResponse, WrongNoteDto } from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { PrismaService } from '../../common/prisma.service.js';
import { StreakService } from './streak.service.js';
import { WrongNotesService } from './wrong-notes.service.js';

@Controller('me')
@Auth()
export class GrowthController {
  constructor(
    private readonly streak: StreakService,
    private readonly wrongNotes: WrongNotesService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('streak')
  getStreak(@UserId() userId: string): Promise<StreakDto> {
    return this.streak.get(userId);
  }

  @Post('streak/protections')
  @HttpCode(200)
  buyProtection(@UserId() userId: string): Promise<StreakPurchaseResponse> {
    return this.streak.buyProtection(userId);
  }

  @Post('streak/restore')
  @HttpCode(200)
  restore(@UserId() userId: string): Promise<StreakPurchaseResponse> {
    return this.streak.restore(userId);
  }

  @Get('wrong-notes')
  listWrongNotes(@UserId() userId: string, @Query('status') status?: string): Promise<WrongNoteDto[]> {
    return this.wrongNotes.list(userId, status);
  }

  @Get('cheese-ledger')
  async cheeseLedger(@UserId() userId: string): Promise<CheeseLedgerEntryDto[]> {
    const rows = await this.prisma.cheeseLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, createdAt: r.createdAt.toISOString() }));
  }
}
