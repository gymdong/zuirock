import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import type { CreateGuestRequest, GuestMergeRequest, GuestMergeSummary, GuestSession } from '@zuirock/shared';
import { unauthorized } from '../../common/api-error.js';
import { Auth, UserId } from '../../common/auth.guard.js';
import { TokensService } from '../../common/tokens.service.js';
import { GuestsService } from './guests.service.js';
import { MergeService } from './merge.service.js';

@Controller('guests')
export class GuestsController {
  constructor(
    private readonly guests: GuestsService,
    private readonly merges: MergeService,
    private readonly tokens: TokensService,
  ) {}

  @Post()
  create(@Body() body: CreateGuestRequest): Promise<GuestSession> {
    return this.guests.create(body ?? {});
  }

  /** Needs the signed guest token; a raw guestId is never accepted (401). */
  @Post('merge')
  @HttpCode(200)
  @Auth()
  merge(@UserId() userId: string, @Body() body: GuestMergeRequest): Promise<GuestMergeSummary> {
    const guestId = typeof body?.guestToken === 'string' ? this.tokens.verifyGuest(body.guestToken) : null;
    if (!guestId) throw unauthorized('BAD_GUEST_TOKEN', '게스트 토큰이 올바르지 않아요');
    return this.merges.merge(guestId, userId);
  }
}
