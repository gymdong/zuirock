import { Body, Controller, Get, HttpCode, Module, Post, type DynamicModule } from '@nestjs/common';
import { Auth, UserId } from '../../common/auth.guard.js';
import { LearningReportsModule } from '../learning-reports/learning-reports.module.js';
import { SocialModule } from '../social/social.module.js';
import { SoloModule } from '../solo/solo.module.js';
import { UsersModule } from '../users/users.module.js';
import { DemoSeedService, type DemoSeedSummary, type DemoVerifyDto } from './demo-seed.service.js';

/** Demo seed routes exist only with DEMO_SEED=1 (set on Render for the demo period only). */
export function demoSeedEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEMO_SEED === '1';
}

@Controller('admin/demo/seed')
@Auth('admin')
class DemoSeedController {
  constructor(private readonly demo: DemoSeedService) {}

  /** Resets the caller's learning records and applies the demo member-A state (synchronous, ≈ 5 s on Neon). */
  @Post()
  @HttpCode(200)
  seed(@UserId() userId: string, @Body() body: { confirm?: string }): Promise<DemoSeedSummary> {
    return this.demo.seed(userId, body?.confirm);
  }

  @Get('status')
  status(): { running: boolean } {
    return { running: this.demo.isRunning() };
  }

  @Get('verify')
  verify(@UserId() userId: string): Promise<DemoVerifyDto> {
    return this.demo.verify(userId);
  }
}

@Module({})
export class DemoSeedModule {
  static forRoot(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    if (!demoSeedEnabled(env)) return { module: DemoSeedModule };
    return {
      module: DemoSeedModule,
      imports: [UsersModule, LearningReportsModule, SoloModule, SocialModule],
      controllers: [DemoSeedController],
      providers: [DemoSeedService],
    };
  }
}
