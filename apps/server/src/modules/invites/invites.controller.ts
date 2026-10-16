import { Controller, Get, Headers, HttpCode, Inject, Optional, Param, Post, UnauthorizedException } from '@nestjs/common';
import type { InviteDto } from '@zuirock/shared';
import { AUTH_VERIFIER, bearerToken, type AuthVerifier } from '../rooms/auth-verifier.js';
import { InvitesService } from './invites.service.js';

/** Resolves the calling member from `Authorization: Bearer`; guests have no inbox. */
export async function requireMember(auth: AuthVerifier | undefined, header: string | undefined) {
  const token = bearerToken(header);
  const identity = auth && token ? await auth.verify(token) : null;
  if (identity?.kind !== 'user') throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'member login required' });
  return identity;
}

@Controller('invites')
export class InvitesController {
  constructor(
    @Inject(InvitesService) private readonly invites: InvitesService,
    @Optional() @Inject(AUTH_VERIFIER) private readonly auth?: AuthVerifier,
  ) {}

  @Get()
  async inbox(@Headers('authorization') authz?: string): Promise<InviteDto[]> {
    const me = await requireMember(this.auth, authz);
    return this.invites.inbox(me.userId);
  }

  @Post(':id/accept')
  @HttpCode(200)
  async accept(@Param('id') id: string, @Headers('authorization') authz?: string) {
    const me = await requireMember(this.auth, authz);
    return this.invites.respond(id, me.userId, true);
  }

  @Post(':id/decline')
  @HttpCode(200)
  async decline(@Param('id') id: string, @Headers('authorization') authz?: string) {
    const me = await requireMember(this.auth, authz);
    return this.invites.respond(id, me.userId, false);
  }
}
