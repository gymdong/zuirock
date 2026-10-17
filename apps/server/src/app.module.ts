import { Module } from '@nestjs/common';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AssetsModule } from './modules/assets/assets.module.js';
import { StaticModule } from './modules/static/static.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { DevLoginModule } from './modules/auth/dev-login.module.js';
import { DemoSeedModule } from './modules/demo-seed/demo-seed.module.js';
import { GrowthModule } from './modules/growth/growth.module.js';
import { GuestsModule } from './modules/guests/guests.module.js';
import { LearningReportsModule } from './modules/learning-reports/learning-reports.module.js';
import { SoloModule } from './modules/solo/solo.module.js';
import { TopicsModule } from './modules/topics/topics.module.js';
import { IssueReportsModule } from './modules/issue-reports/issue-reports.module.js';
import { SocialModule } from './modules/social/social.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WardrobeModule } from './modules/wardrobe/wardrobe.module.js';
import { RoomsModule } from './modules/rooms/rooms.module.js';

@Module({
  imports: [CommonModule, HealthModule, GrowthModule, UsersModule, GuestsModule, AuthModule, DevLoginModule.forRoot(), DemoSeedModule.forRoot(), TopicsModule, SoloModule, LearningReportsModule, AssetsModule, AdminModule, IssueReportsModule, SocialModule, WardrobeModule, StaticModule, RoomsModule],
})
export class AppModule {}
