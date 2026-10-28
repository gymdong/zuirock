import { Controller, Get, HttpCode, Injectable, Module, Param } from '@nestjs/common';
import { MIN_RANKED_ANSWERS, placeByValue } from '@zuirock/game-rules';
import type { FriendRankingDto, RankingEntryDto, RoomRecordsDto } from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { notFound, forbidden } from '../../common/api-error.js';
import { RecordsStats } from './records.stats.js';
import { RoomEngine } from '../rooms/room-engine.service.js';
import { RoomsModule } from '../rooms/rooms.module.js';
import { SocialModule, SocialService } from '../social/social.module.js';
import { StagePlanner } from '../solo/stage-planner.js';
import { UsersModule } from '../users/users.module.js';

/** Multiplayer records and the friend ranking (10/28). Members only; guests have no record. */
@Injectable()
export class RecordsService {
  constructor(
    private readonly stats: RecordsStats,
    private readonly social: SocialService,
    private readonly engine: RoomEngine,
  ) {}

  async ranking(me: string): Promise<FriendRankingDto> {
    const [list, self] = await Promise.all([this.social.list(me), this.social.summaryOf(me)]);
    const people = list.friends;
    const all = [self, ...people];
    const ids = all.map((p) => p.userId);
    const [records, cleared] = await Promise.all([this.stats.multiRecords(ids), this.stats.clearedStages(ids)]);
    const solo = placeByValue(ids.map((id) => cleared.get(id) ?? 0));
    const multi = placeByValue(ids.map((id) => ((records.get(id)?.answered ?? 0) >= MIN_RANKED_ANSWERS ? (records.get(id)!.correctRate as number) : null)));
    const entries: RankingEntryDto[] = all.map((p, i) => ({
      userId: p.userId,
      nickname: p.nickname,
      avatar: p.avatar,
      level: p.level,
      isMe: p.userId === me,
      clearedStages: cleared.get(p.userId) ?? 0,
      record: records.get(p.userId)!,
      soloRank: solo[i]!,
      multiRank: multi[i] ?? null,
    }));
    return { entries, minAnswered: MIN_RANKED_ANSWERS };
  }

  /** Records of the member participants of a room the caller sits in. */
  async roomRecords(me: string, code: string): Promise<RoomRecordsDto> {
    const room = /^\d{4}$/.test(code) ? await this.engine.getRoom(code) : null;
    if (!room || room.phase === 'dissolved') throw notFound('ROOM_NOT_FOUND', '방을 찾을 수 없어요');
    if (!room.seats.some((s) => s.userId === me && !s.left)) throw forbidden('NOT_IN_ROOM', '이 방의 참가자만 볼 수 있어요');
    const members = room.seats.filter((s) => s.userId);
    const records = await this.stats.multiRecords(members.map((s) => s.userId!));
    return { records: Object.fromEntries(members.map((s) => [s.participantId, records.get(s.userId!)!])) };
  }
}

@Controller()
@Auth('member')
class RecordsController {
  constructor(private readonly records: RecordsService) {}

  @Get('rankings/friends')
  ranking(@UserId() me: string): Promise<FriendRankingDto> {
    return this.records.ranking(me);
  }

  @Get('rooms/:code/records')
  @HttpCode(200)
  room(@UserId() me: string, @Param('code') code: string): Promise<RoomRecordsDto> {
    return this.records.roomRecords(me, code);
  }
}

@Module({
  imports: [SocialModule, UsersModule, RoomsModule],
  controllers: [RecordsController],
  providers: [RecordsService, RecordsStats, StagePlanner],
  exports: [RecordsService],
})
export class RecordsModule {}
