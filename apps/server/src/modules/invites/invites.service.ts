import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { InviteDto } from '@zuirock/shared';
import { ROOM_CLOCK, ROOM_CONFIG, ROOM_OPTIONS, type RoomConfig, type RoomsOptions } from '../rooms/rooms.tokens.js';
import type { Clock } from '../rooms/clock.js';
import { INVITE_REPOSITORY, type InviteRepository } from './invite.repository.js';

/** In-app inbox invites (AC-A7). Invites live as long as a lobby (30 min). */
@Injectable()
export class InvitesService {
  constructor(
    @Inject(INVITE_REPOSITORY) private readonly repo: InviteRepository,
    @Inject(ROOM_CLOCK) private readonly clock: Clock,
    @Inject(ROOM_CONFIG) private readonly cfg: RoomConfig,
    @Inject(ROOM_OPTIONS) private readonly options: RoomsOptions,
  ) {}

  inviteUrl(code: string): string {
    return `${this.options.publicOrigin}/join/${code}`;
  }

  /** Friends only; non-friends are rejected as a whole (403). */
  async invite(room: { roomId: string }, fromUserId: string, toUserIds: readonly string[]): Promise<string[]> {
    const unique = [...new Set(toUserIds)].filter((id) => id !== fromUserId);
    for (const to of unique) {
      if (!(await this.repo.areFriends(fromUserId, to))) throw new ForbiddenException({ code: 'NOT_FRIENDS', message: to });
    }
    const expiresAt = new Date(this.clock.now() + this.cfg.room.lobbyTtlMs);
    const ids: string[] = [];
    for (const to of unique) ids.push(await this.repo.create({ roomId: room.roomId, fromUserId, toUserId: to, expiresAt }));
    return ids;
  }

  inbox(userId: string): Promise<InviteDto[]> {
    return this.repo.listPending(userId, new Date(this.clock.now()));
  }

  async respond(inviteId: string, userId: string, accept: boolean): Promise<{ roomCode: string; inviteUrl: string }> {
    const code = await this.repo.respond(inviteId, userId, accept ? 'accepted' : 'declined', new Date(this.clock.now()));
    if (!code) throw new NotFoundException({ code: 'INVITE_NOT_FOUND', message: 'invite not found or expired' });
    return { roomCode: code, inviteUrl: this.inviteUrl(code) };
  }
}
