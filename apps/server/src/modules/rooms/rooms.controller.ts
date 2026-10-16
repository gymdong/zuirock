import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import type { CreateRoomRequest, CreateRoomResponse, RoomLookupDto } from '@zuirock/shared';
import { requireMember } from '../invites/invites.controller.js';
import { InvitesService } from '../invites/invites.service.js';
import { AUTH_VERIFIER, type AuthVerifier } from './auth-verifier.js';
import { RoomEngine, RoomError } from './room-engine.service.js';

function httpError(err: unknown): never {
  if (err instanceof RoomError) {
    const body = { code: err.code, message: err.message };
    if (err.code === 'ROOM_NOT_FOUND') throw new NotFoundException(body);
    if (err.code === 'UNAUTHORIZED') throw new UnauthorizedException(body);
    throw new BadRequestException(body);
  }
  throw err;
}

@Controller('rooms')
export class RoomsController {
  constructor(
    @Inject(RoomEngine) private readonly engine: RoomEngine,
    @Inject(InvitesService) private readonly invites: InvitesService,
    @Optional() @Inject(AUTH_VERIFIER) private readonly auth?: AuthVerifier,
  ) {}

  /** 대결 신청 (AC-A7): creates the room, inbox invites for friends and the share link. */
  @Post()
  async create(@Body() body: CreateRoomRequest, @Headers('authorization') authz?: string): Promise<CreateRoomResponse> {
    const me = await requireMember(this.auth, authz);
    if (!body?.settings) throw new BadRequestException({ code: 'INVALID_SETTINGS', message: 'settings required' });
    const room = await this.engine.createRoom(me, body.settings).catch(httpError);
    if (body.inviteFriendIds?.length) await this.invites.invite(room, me.userId, body.inviteFriendIds);
    return { roomId: room.roomId, code: room.code, inviteUrl: this.invites.inviteUrl(room.code) };
  }

  /** Join landing lookup (no auth). */
  @Get(':code')
  async lookup(@Param('code') code: string): Promise<RoomLookupDto> {
    const dto = /^\d{4}$/.test(code) ? await this.engine.lookup(code) : null;
    if (!dto) throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'room not found' });
    return dto;
  }

  /** Invite more friends to a room you are in (lobby only). */
  @Post(':code/invites')
  @HttpCode(201)
  async invite(
    @Param('code') code: string,
    @Body() body: { userIds?: string[] },
    @Headers('authorization') authz?: string,
  ): Promise<{ inviteIds: string[]; inviteUrl: string }> {
    const me = await requireMember(this.auth, authz);
    const room = /^\d{4}$/.test(code) ? await this.engine.getRoom(code) : null;
    if (!room || room.phase === 'dissolved') throw new NotFoundException({ code: 'ROOM_NOT_FOUND', message: 'room not found' });
    if (!room.seats.some((s) => s.userId === me.userId && !s.left)) {
      throw new BadRequestException({ code: 'NOT_IN_ROOM', message: 'join the room first' });
    }
    if (room.phase !== 'lobby') throw new BadRequestException({ code: 'ROOM_IN_PROGRESS', message: 'battle already started' });
    const inviteIds = await this.invites.invite(room, me.userId, body?.userIds ?? []);
    return { inviteIds, inviteUrl: this.invites.inviteUrl(code) };
  }
}
