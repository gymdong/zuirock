import { Module } from '@nestjs/common';
import { EconomyModule } from '../economy/economy.module.js';
import { LearningReportsModule } from '../learning-reports/learning-reports.module.js';
import { QuestionPicker, SOLO_RNG } from './question-picker.js';
import { SoloController } from './solo.controller.js';
import { SoloService } from './solo.service.js';
import { StagePlanner } from './stage-planner.js';

@Module({
  imports: [LearningReportsModule, EconomyModule],
  controllers: [SoloController],
  providers: [SoloService, QuestionPicker, StagePlanner, { provide: SOLO_RNG, useValue: Math.random }],
  exports: [SoloService, StagePlanner],
})
export class SoloModule {}
