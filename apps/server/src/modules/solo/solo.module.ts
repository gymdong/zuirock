import { Module } from '@nestjs/common';
import { LearningReportsModule } from '../learning-reports/learning-reports.module.js';
import { QuestionPicker, SOLO_RNG } from './question-picker.js';
import { SoloController } from './solo.controller.js';
import { SoloService } from './solo.service.js';

@Module({
  imports: [LearningReportsModule],
  controllers: [SoloController],
  providers: [SoloService, QuestionPicker, { provide: SOLO_RNG, useValue: Math.random }],
})
export class SoloModule {}
