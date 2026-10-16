import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import type {
  CompositePlanDto,
  ConfirmStartLevelRequest,
  DailySetStatusDto,
  OwnerRef,
  PlacementNextDto,
  SetResultDto,
  SetSessionDto,
  SoloGiveUpResponse,
  SoloSubmitRequest,
  SoloSubmitResponse,
  StartSetRequest,
  TopicProgressDto,
} from '@zuirock/shared';
import { Auth, Owner, UserId } from '../../common/auth.guard.js';
import { SoloService } from './solo.service.js';

/** Solo sets for members and guests (guest results are merged on login). */
@Controller('solo')
@Auth('any')
export class SoloController {
  constructor(private readonly solo: SoloService) {}

  @Post('sets')
  start(@Owner() owner: OwnerRef, @Body() body: StartSetRequest, @Headers('idempotency-key') key?: string): Promise<SetSessionDto> {
    return this.solo.start(owner, body, key || undefined);
  }

  @Post('sets/:id/answers')
  @HttpCode(200)
  answer(@Owner() owner: OwnerRef, @Param('id') id: string, @Body() body: SoloSubmitRequest): Promise<SoloSubmitResponse> {
    return this.solo.submit(owner, id, body);
  }

  @Post('sets/:id/hint')
  @HttpCode(200)
  hint(@Owner() owner: OwnerRef, @Param('id') id: string, @Body() body: { questionId: string }) {
    return this.solo.hint(owner, id, body?.questionId);
  }

  @Post('sets/:id/give-up')
  @HttpCode(200)
  giveUp(@Owner() owner: OwnerRef, @Param('id') id: string, @Body() body: { questionId: string }): Promise<SoloGiveUpResponse> {
    return this.solo.giveUp(owner, id, body?.questionId);
  }

  @Post('sets/:id/next')
  @HttpCode(200)
  next(@Owner() owner: OwnerRef, @Param('id') id: string): Promise<PlacementNextDto> {
    return this.solo.placementNext(owner, id);
  }

  @Post('sets/:id/complete')
  @HttpCode(200)
  complete(@Owner() owner: OwnerRef, @Param('id') id: string): Promise<SetResultDto> {
    return this.solo.complete(owner, id);
  }

  @Post('topics/:topicId/start')
  @HttpCode(200)
  confirmStart(@Owner() owner: OwnerRef, @Param('topicId') topicId: string, @Body() body: ConfirmStartLevelRequest): Promise<TopicProgressDto> {
    return this.solo.confirmStart(owner, topicId, body);
  }

  @Get('composite/plan')
  @Auth('member')
  plan(@UserId() userId: string): Promise<CompositePlanDto> {
    return this.solo.compositePlan(userId);
  }

  @Get('daily')
  daily(@Owner() owner: OwnerRef): Promise<DailySetStatusDto> {
    return this.solo.dailyStatus(owner);
  }
}
