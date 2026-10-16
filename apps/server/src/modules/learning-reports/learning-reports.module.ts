import { Module } from '@nestjs/common';
import { LearningReportsController } from './learning-reports.controller.js';
import { LearningReportsService } from './learning-reports.service.js';

@Module({ controllers: [LearningReportsController], providers: [LearningReportsService], exports: [LearningReportsService] })
export class LearningReportsModule {}
