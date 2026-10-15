import { Inject, Injectable } from '@nestjs/common';
import type { OwnerRef } from '@zuirock/shared';
import { CLOCK, type Clock } from './clock.js';
import { secretFromEnv, signJwt, verifyJwt } from './jwt.js';

const DAY_SEC = 86_400;
export const MEMBER_TOKEN_TTL_SEC = 30 * DAY_SEC;
/** Guest tokens live as long as unmerged guest records (AC-A3). */
export const GUEST_TOKEN_TTL_SEC = 30 * DAY_SEC;

/** Member access tokens (typ=user) and signed guest tokens (typ=guest), separate keys. */
@Injectable()
export class TokensService {
  private readonly memberSecret = secretFromEnv('JWT_SECRET');
  private readonly guestSecret = secretFromEnv('GUEST_TOKEN_SECRET');

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  signMember(userId: string): { token: string; expiresAt: Date } {
    const now = this.clock.now();
    return {
      token: signJwt({ sub: userId, typ: 'user' }, this.memberSecret, MEMBER_TOKEN_TTL_SEC, now),
      expiresAt: new Date(now + MEMBER_TOKEN_TTL_SEC * 1000),
    };
  }

  signGuest(guestId: string): { token: string; expiresAt: Date } {
    const now = this.clock.now();
    return {
      token: signJwt({ sub: guestId, typ: 'guest' }, this.guestSecret, GUEST_TOKEN_TTL_SEC, now),
      expiresAt: new Date(now + GUEST_TOKEN_TTL_SEC * 1000),
    };
  }

  verifyMember(token: string): string | null {
    const claims = verifyJwt(token, this.memberSecret, this.clock.now());
    return claims?.typ === 'user' ? claims.sub : null;
  }

  verifyGuest(token: string): string | null {
    const claims = verifyJwt(token, this.guestSecret, this.clock.now());
    return claims?.typ === 'guest' ? claims.sub : null;
  }

  /** Member or guest token → owner. */
  verifyAny(token: string): OwnerRef | null {
    const userId = this.verifyMember(token);
    if (userId) return { kind: 'user', userId };
    const guestId = this.verifyGuest(token);
    return guestId ? { kind: 'guest', guestId } : null;
  }
}
