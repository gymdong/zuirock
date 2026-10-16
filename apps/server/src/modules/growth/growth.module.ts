import { Global, Module } from '@nestjs/common';
import { SOLVE_LOG_WRITER } from '../../ports/solve-log-writer.port.js';
import { STREAK_PORT } from '../../ports/streak.port.js';
import { WRONG_NOTE_PORT } from '../../ports/wrong-note.port.js';
import { XP_GRANT_PORT } from '../../ports/xp-grant.port.js';
import { AUTH_VERIFIER } from '../rooms/auth-verifier.js';
import { UsersModule } from '../users/users.module.js';
import { GrowthController } from './growth.controller.js';
import { RoomAuthVerifier } from './room-auth-verifier.js';
import { PrismaSolveLogWriter } from './solve-log.writer.js';
import { StreakService } from './streak.service.js';
import { WrongNotesService } from './wrong-notes.service.js';
import { XpService } from './xp.service.js';

/**
 * Real implementations of the four server ports (docs/contracts.md) plus the rooms auth verifier,
 * provided globally so lane LC injects them by token without importing LB modules.
 */
@Global()
@Module({
  imports: [UsersModule],
  controllers: [GrowthController],
  providers: [
    XpService,
    StreakService,
    WrongNotesService,
    PrismaSolveLogWriter,
    RoomAuthVerifier,
    { provide: XP_GRANT_PORT, useExisting: XpService },
    { provide: STREAK_PORT, useExisting: StreakService },
    { provide: WRONG_NOTE_PORT, useExisting: WrongNotesService },
    { provide: SOLVE_LOG_WRITER, useExisting: PrismaSolveLogWriter },
    { provide: AUTH_VERIFIER, useExisting: RoomAuthVerifier },
  ],
  exports: [XpService, StreakService, WrongNotesService, PrismaSolveLogWriter, XP_GRANT_PORT, STREAK_PORT, WRONG_NOTE_PORT, SOLVE_LOG_WRITER, AUTH_VERIFIER],
})
export class GrowthModule {}
