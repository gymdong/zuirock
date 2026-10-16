import { Inject, Injectable } from '@nestjs/common';
import type { InviteDto, InviteStatus } from '@zuirock/shared';
import { accountLevel } from '@zuirock/game-rules';
import { PrismaService } from '../../common/prisma.service.js';

export interface InviteRepository {
  /** Accepted friendship between two members. */
  areFriends(a: string, b: string): Promise<boolean>;
  create(input: { roomId: string; fromUserId: string; toUserId: string; expiresAt: Date }): Promise<string>;
  /** Pending, unexpired invites for `toUserId`, newest first. */
  listPending(toUserId: string, now: Date): Promise<InviteDto[]>;
  /** Moves a pending, unexpired invite of `toUserId`; returns its room code or null if none. */
  respond(inviteId: string, toUserId: string, status: Extract<InviteStatus, 'accepted' | 'declined'>, now: Date): Promise<string | null>;
}

export const INVITE_REPOSITORY = Symbol('InviteRepository');

@Injectable()
export class PrismaInviteRepository implements InviteRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async areFriends(a: string, b: string): Promise<boolean> {
    const [low, high] = a < b ? [a, b] : [b, a];
    const row = await this.prisma.friendship.findUnique({ where: { userLowId_userHighId: { userLowId: low, userHighId: high } } });
    return row?.status === 'accepted';
  }

  async create(input: { roomId: string; fromUserId: string; toUserId: string; expiresAt: Date }): Promise<string> {
    const row = await this.prisma.invite.create({ data: input, select: { id: true } });
    return row.id;
  }

  async listPending(toUserId: string, now: Date): Promise<InviteDto[]> {
    const rows = await this.prisma.invite.findMany({
      where: { toUserId, status: 'pending', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      include: { room: { select: { code: true } }, fromUser: true },
    });
    const senders = [...new Set(rows.map((r) => r.fromUserId))];
    const xp = await this.prisma.xpLedger.groupBy({ by: ['userId'], where: { userId: { in: senders } }, _sum: { amount: true } });
    const xpBy = new Map(xp.map((x) => [x.userId, x._sum.amount ?? 0]));
    return rows.map((r) => ({
      id: r.id,
      roomCode: r.room.code,
      from: {
        userId: r.fromUser.id,
        nickname: r.fromUser.nickname,
        avatar: {
          source: r.fromUser.avatarSource,
          url:
            r.fromUser.avatarSource === 'social'
              ? r.fromUser.socialAvatarUrl
              : r.fromUser.avatarSource === 'upload' && r.fromUser.avatarAssetKey
                ? `/api/assets/${r.fromUser.avatarAssetKey}`
                : null,
        },
        level: accountLevel(xpBy.get(r.fromUserId) ?? 0).level,
      },
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    }));
  }

  async respond(
    inviteId: string,
    toUserId: string,
    status: Extract<InviteStatus, 'accepted' | 'declined'>,
    now: Date,
  ): Promise<string | null> {
    const res = await this.prisma.invite.updateMany({
      where: { id: inviteId, toUserId, status: 'pending', expiresAt: { gt: now } },
      data: { status },
    });
    if (res.count === 0) return null;
    const row = await this.prisma.invite.findUnique({ where: { id: inviteId }, include: { room: { select: { code: true } } } });
    return row?.room.code ?? null;
  }
}
