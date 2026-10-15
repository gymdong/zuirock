import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ApiErrorFilter } from './api-error.js';
import { AuthGuard } from './auth.guard.js';
import { CLOCK, systemClock } from './clock.js';
import { GROWTH_CONFIG, loadGrowthConfig } from './growth-config.js';
import { PrismaService } from './prisma.service.js';
import { RedisService } from './redis.service.js';
import { TokensService } from './tokens.service.js';

@Global()
@Module({
  providers: [
    PrismaService,
    RedisService,
    TokensService,
    { provide: CLOCK, useValue: systemClock },
    { provide: GROWTH_CONFIG, useFactory: loadGrowthConfig },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: ApiErrorFilter },
  ],
  exports: [PrismaService, RedisService, TokensService, CLOCK, GROWTH_CONFIG],
})
export class CommonModule {}
