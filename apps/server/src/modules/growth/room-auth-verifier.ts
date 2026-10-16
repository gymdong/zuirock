import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import { TokensService } from '../../common/tokens.service.js';
import type { AuthVerifier, RoomIdentity } from '../rooms/auth-verifier.js';
import { UsersService } from '../users/users.service.js';

/** Binds LC's AUTH_VERIFIER to LB tokens: member JWT or signed guest token (typ=guest). */
@Injectable()
export class RoomAuthVerifier implements AuthVerifier {
  constructor(
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  async verify(token: string): Promise<RoomIdentity | null> {
    const owner = token ? this.tokens.verifyAny(token) : null;
    if (!owner) return null;
    if (owner.kind === 'guest') {
      const guest = await this.prisma.guest.findUnique({ where: { id: owner.guestId }, select: { mergedUserId: true } });
      return guest && !guest.mergedUserId ? { kind: 'guest', guestId: owner.guestId } : null;
    }
    const user = await this.prisma.user.findUnique({ where: { id: owner.userId } });
    return user ? { kind: 'user', userId: user.id, nickname: user.nickname, avatarUrl: this.users.avatar(user).url } : null;
  }
}
