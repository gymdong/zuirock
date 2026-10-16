import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { accountLevel, type GrowthConfig } from '@zuirock/game-rules';
import type {
  CreateFriendRequest,
  FriendListDto,
  FriendProfileDto,
  FriendSummaryDto,
  HeadToHeadDto,
  TopicId,
  UserSearchResultDto,
} from '@zuirock/shared';
import type { User } from '@prisma/client';
import { badRequest, conflict, forbidden, notFound } from '../../common/api-error.js';
import { Auth, UserId } from '../../common/auth.guard.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';
import { UsersModule } from '../users/users.module.js';
import { UsersService } from '../users/users.service.js';

const pair = (a: string, b: string) => (a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a });

/** Friends (AC-A5, AC-A6): members only, one Friendship row per pair; deleting removes it for both. */
@Injectable()
export class SocialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private async summaries(users: User[]): Promise<Map<string, FriendSummaryDto>> {
    const xp = await this.prisma.xpLedger.groupBy({ by: ['userId'], where: { userId: { in: users.map((u) => u.id) } }, _sum: { amount: true } });
    return new Map(
      users.map((u) => [
        u.id,
        { userId: u.id, nickname: u.nickname, avatar: this.users.avatar(u), level: accountLevel(xp.find((x) => x.userId === u.id)?._sum.amount ?? 0, this.cfg).level },
      ]),
    );
  }

  async list(me: string): Promise<FriendListDto> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userLowId: me }, { userHighId: me }] },
      include: { userLow: true, userHigh: true },
      orderBy: { createdAt: 'desc' },
    });
    const other = (r: (typeof rows)[number]) => (r.userLowId === me ? r.userHigh : r.userLow);
    const sums = await this.summaries(rows.map(other));
    const req = (r: (typeof rows)[number]) => ({ requestId: other(r).id, user: sums.get(other(r).id)!, status: r.status, createdAt: r.createdAt.toISOString() });
    return {
      friends: rows.filter((r) => r.status === 'accepted').map((r) => sums.get(other(r).id)!),
      incoming: rows.filter((r) => r.status === 'pending' && r.requesterId !== me).map(req),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requesterId === me).map(req),
    };
  }

  async search(me: string, nickname: string): Promise<UserSearchResultDto> {
    const q = (nickname ?? '').trim();
    if (!q) return { users: [] };
    const found = await this.prisma.user.findMany({ where: { nickname: { contains: q }, id: { not: me } }, take: 20, orderBy: { nickname: 'asc' } });
    const rels = await this.prisma.friendship.findMany({ where: { OR: found.map((u) => pair(me, u.id)) } });
    const sums = await this.summaries(found);
    return {
      users: found.map((u) => ({ ...sums.get(u.id)!, friendship: rels.find((r) => r.userLowId === u.id || r.userHighId === u.id)?.status ?? 'none' })),
    };
  }

  async request(me: string, req: CreateFriendRequest): Promise<FriendListDto> {
    const target = typeof req?.userId === 'string' ? req.userId : '';
    if (!target || target === me) throw badRequest('BAD_TARGET', '친구로 추가할 수 없는 사용자예요');
    if (!(await this.prisma.user.findUnique({ where: { id: target } }).catch(() => null))) throw notFound('USER_NOT_FOUND', '회원을 찾을 수 없어요');
    const key = pair(me, target);
    const existing = await this.prisma.friendship.findUnique({ where: { userLowId_userHighId: key } });
    if (existing?.status === 'accepted') throw conflict('ALREADY_FRIENDS', '이미 친구예요');
    if (existing && existing.requesterId !== me) return this.accept(me, target); // crossing requests → friends
    if (!existing) await this.prisma.friendship.create({ data: { ...key, requesterId: me } });
    return this.list(me);
  }

  async accept(me: string, other: string): Promise<FriendListDto> {
    const r = await this.prisma.friendship.findUnique({ where: { userLowId_userHighId: pair(me, other) } });
    if (!r || r.status !== 'pending' || r.requesterId === me) throw notFound('REQUEST_NOT_FOUND', '받은 친구 신청이 없어요');
    await this.prisma.friendship.update({ where: { userLowId_userHighId: pair(me, other) }, data: { status: 'accepted', acceptedAt: new Date(this.clock.now()) } });
    return this.list(me);
  }

  /** Deletes a friend, cancels an outgoing request or declines an incoming one. */
  async remove(me: string, other: string): Promise<FriendListDto> {
    await this.prisma.friendship.deleteMany({ where: pair(me, other) });
    return this.list(me);
  }

  async headToHead(me: string, other: string): Promise<HeadToHeadDto> {
    const mine = await this.prisma.battleResult.findMany({ where: { userId: me }, select: { roomSessionId: true, rank: true, endedAt: true } });
    const theirs = await this.prisma.battleResult.findMany({
      where: { userId: other, roomSessionId: { in: mine.map((m) => m.roomSessionId) } },
      select: { roomSessionId: true, rank: true },
    });
    const h: HeadToHeadDto = { played: 0, wins: 0, losses: 0, draws: 0, lastPlayedAt: null };
    let last = 0;
    for (const t of theirs) {
      const m = mine.find((x) => x.roomSessionId === t.roomSessionId)!;
      h.played++;
      if (m.rank < t.rank) h.wins++;
      else if (m.rank > t.rank) h.losses++;
      else h.draws++;
      last = Math.max(last, m.endedAt.getTime());
    }
    h.lastPlayedAt = last ? new Date(last).toISOString() : null;
    return h;
  }

  async profile(me: string, other: string): Promise<FriendProfileDto> {
    const r = await this.prisma.friendship.findUnique({ where: { userLowId_userHighId: pair(me, other) } }).catch(() => null);
    if (r?.status !== 'accepted') throw forbidden('NOT_FRIENDS', '친구만 볼 수 있어요');
    const [dto, progress, headToHead] = await Promise.all([
      this.users.me(other),
      this.prisma.topicProgress.findMany({ where: { userId: other }, orderBy: { topicId: 'asc' } }),
      this.headToHead(me, other),
    ]);
    return {
      userId: other,
      nickname: dto.nickname,
      avatar: dto.avatar,
      equipped: dto.equipped,
      level: dto.level,
      topicLevels: progress.map((p) => ({ topicId: p.topicId as TopicId, level: Math.min(p.highestClearedStage + 1, this.cfg.stage.maxLevel) })),
      headToHead,
    };
  }
}

@Controller()
@Auth()
class SocialController {
  constructor(private readonly social: SocialService) {}

  @Get('friends')
  list(@UserId() me: string) {
    return this.social.list(me);
  }

  @Get('users/search')
  search(@UserId() me: string, @Query('nickname') nickname: string) {
    return this.social.search(me, nickname);
  }

  @Post('friends/requests')
  request(@UserId() me: string, @Body() body: CreateFriendRequest) {
    return this.social.request(me, body);
  }

  @Post('friends/:userId/accept')
  @HttpCode(200)
  accept(@UserId() me: string, @Param('userId') userId: string) {
    return this.social.accept(me, userId);
  }

  @Delete('friends/:userId')
  remove(@UserId() me: string, @Param('userId') userId: string) {
    return this.social.remove(me, userId);
  }

  @Get('friends/:userId')
  profile(@UserId() me: string, @Param('userId') userId: string) {
    return this.social.profile(me, userId);
  }
}

@Module({ imports: [UsersModule], controllers: [SocialController], providers: [SocialService] })
export class SocialModule {}
