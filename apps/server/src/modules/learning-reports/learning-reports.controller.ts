import { Controller, Get, Param } from '@nestjs/common';
import type { HistorySummaryDto, WeaknessReportDto, WeeklyReportDto } from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { LearningReportsService } from './learning-reports.service.js';

@Controller('reports')
@Auth()
export class LearningReportsController {
  constructor(private readonly reports: LearningReportsService) {}

  @Get('weekly/current')
  current(@UserId() userId: string): Promise<WeeklyReportDto> {
    return this.reports.weekly(userId);
  }

  @Get('weekly/:weekStart')
  week(@UserId() userId: string, @Param('weekStart') weekStart: string): Promise<WeeklyReportDto> {
    return this.reports.weekly(userId, weekStart);
  }

  @Get('weakness')
  weakness(@UserId() userId: string): Promise<WeaknessReportDto> {
    return this.reports.weakness(userId);
  }

  @Get('history')
  history(@UserId() userId: string): Promise<HistorySummaryDto> {
    return this.reports.history(userId);
  }
}
