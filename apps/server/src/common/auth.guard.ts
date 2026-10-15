import {
  createParamDecorator,
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { OwnerRef } from '@zuirock/shared';
import type { Request } from 'express';
import { forbidden, unauthorized } from './api-error.js';
import { PrismaService } from './prisma.service.js';
import { TokensService } from './tokens.service.js';

export type AuthLevel = 'member' | 'any' | 'admin';
const AUTH_LEVEL = 'zuirock:auth-level';

/** `member` = member JWT; `any` = member or guest token; `admin` = member with User.isAdmin. */
export const Auth = (level: AuthLevel = 'member') => SetMetadata(AUTH_LEVEL, level);

export interface AuthedRequest extends Request {
  owner?: OwnerRef;
}

export function bearer(req: Request): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization ?? '');
  return match?.[1]?.trim() || null;
}

/** Global guard: routes without @Auth() are public. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const level = this.reflector.getAllAndOverride<AuthLevel | undefined>(AUTH_LEVEL, [ctx.getHandler(), ctx.getClass()]);
    if (!level) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = bearer(req);
    const owner = token ? this.tokens.verifyAny(token) : null;
    if (!owner) throw unauthorized();
    if (level !== 'any' && owner.kind !== 'user') throw unauthorized('MEMBER_REQUIRED', '회원 로그인이 필요해요');
    if (owner.kind === 'user') {
      const user = await this.prisma.user.findUnique({ where: { id: owner.userId }, select: { isAdmin: true } });
      if (!user) throw unauthorized();
      if (level === 'admin' && !user.isAdmin) throw forbidden('ADMIN_REQUIRED', '관리자만 접근할 수 있어요');
    } else {
      const guest = await this.prisma.guest.findUnique({ where: { id: owner.guestId }, select: { mergedUserId: true } });
      if (!guest) throw unauthorized('GUEST_NOT_FOUND', '게스트 기록이 없어요');
      if (guest.mergedUserId) throw unauthorized('GUEST_MERGED', '이미 계정에 합쳐진 게스트예요');
    }
    req.owner = owner;
    return true;
  }
}

/** The authenticated owner (set by AuthGuard). */
export const Owner = createParamDecorator((_: unknown, ctx: ExecutionContext): OwnerRef => {
  const owner = ctx.switchToHttp().getRequest<AuthedRequest>().owner;
  if (!owner) throw unauthorized();
  return owner;
});

/** Member id of the authenticated request (use with @Auth('member'|'admin')). */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const owner = ctx.switchToHttp().getRequest<AuthedRequest>().owner;
  if (owner?.kind !== 'user') throw unauthorized();
  return owner.userId;
});
