import { Module } from '@nestjs/common';
import { DEFAULT_CONFIG } from '@zuirock/game-rules';
import { InvitesController } from '../invites/invites.controller.js';
import { InvitesService } from '../invites/invites.service.js';
import { INVITE_REPOSITORY, PrismaInviteRepository } from '../invites/invite.repository.js';
import { SystemClock } from './clock.js';
import { PrismaQuestionPool, QUESTION_POOL } from './question-pool.js';
import { RoomEngine } from './room-engine.service.js';
import { PrismaRoomResultRepository, ROOM_RESULT_REPOSITORY } from './room-result.repository.js';
import { RoomResultService } from './room-result.service.js';
import { RoomStore } from './room-store.js';
import { RoomsController } from './rooms.controller.js';
import { RoomsGateway } from './rooms.gateway.js';
import { ROOM_CLOCK, ROOM_CONFIG, ROOM_OPTIONS, ROOM_RNG, defaultRoomsOptions } from './rooms.tokens.js';

/**
 * Live rooms + invites (lane LC). Depends on `src/ports/*` (XP, solve log, wrong note, streak) and
 * `AUTH_VERIFIER`, all bound outside this module (injected optionally so the app boots before LB lands).
 */
@Module({
  controllers: [RoomsController, InvitesController],
  providers: [
    RoomEngine,
    RoomStore,
    RoomResultService,
    RoomsGateway,
    InvitesService,
    { provide: ROOM_OPTIONS, useFactory: defaultRoomsOptions },
    { provide: ROOM_CLOCK, useClass: SystemClock },
    { provide: ROOM_RNG, useValue: Math.random },
    { provide: ROOM_CONFIG, useValue: DEFAULT_CONFIG },
    { provide: QUESTION_POOL, useClass: PrismaQuestionPool },
    { provide: ROOM_RESULT_REPOSITORY, useClass: PrismaRoomResultRepository },
    { provide: INVITE_REPOSITORY, useClass: PrismaInviteRepository },
  ],
  exports: [RoomEngine],
})
export class RoomsModule {}
