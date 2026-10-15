import { Body, Controller, Get, Param, Patch, Put, Query } from '@nestjs/common';
import type {
  MeDto,
  NicknameAvailabilityDto,
  TopicProgressDto,
  UpdateProfileRequest,
  UpdateSelectedTopicsRequest,
  XpLedgerEntryDto,
} from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { UsersService } from './users.service.js';

@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @Auth()
  me(@UserId() userId: string): Promise<MeDto> {
    return this.users.me(userId);
  }

  @Patch('me')
  @Auth()
  update(@UserId() userId: string, @Body() body: UpdateProfileRequest): Promise<MeDto> {
    return this.users.updateProfile(userId, body ?? {});
  }

  @Put('me/topics')
  @Auth()
  topics(@UserId() userId: string, @Body() body: UpdateSelectedTopicsRequest): Promise<MeDto> {
    return this.users.setTopics(userId, body?.topicIds ?? []);
  }

  @Get('me/topics/:topicId')
  @Auth()
  topicProgress(@UserId() userId: string, @Param('topicId') topicId: string): Promise<TopicProgressDto> {
    return this.users.topicProgress(userId, topicId);
  }

  @Get('me/xp-ledger')
  @Auth()
  xpLedger(@UserId() userId: string, @Query('limit') limit?: string): Promise<XpLedgerEntryDto[]> {
    return this.users.xpLedger(userId, Number(limit) || 50);
  }

  @Get('users/nickname-available')
  @Auth()
  nickname(@UserId() userId: string, @Query('nickname') nickname: string): Promise<NicknameAvailabilityDto> {
    return this.users.nicknameAvailable(nickname, userId);
  }
}
