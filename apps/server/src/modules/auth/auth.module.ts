import { Module } from '@nestjs/common';
import { GuestsModule } from '../guests/guests.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OAUTH_ADAPTERS, realOAuthAdapters } from './oauth-providers.js';

@Module({
  imports: [UsersModule, GuestsModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: OAUTH_ADAPTERS, useValue: realOAuthAdapters }],
})
export class AuthModule {}
