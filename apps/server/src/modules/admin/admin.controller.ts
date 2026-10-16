import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { AdminBulkApproveRequest, AdminUpdateQuestionRequest, MeDto } from '@zuirock/shared';
import { Auth, UserId } from '../../common/auth.guard.js';
import { UsersService } from '../users/users.service.js';
import { AdminService } from './admin.service.js';

/** Admin API (docs/api-admin.md). Every route needs a member JWT whose user has isAdmin. */
@Controller('admin')
@Auth('admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly users: UsersService,
  ) {}

  @Get('session')
  session(@UserId() userId: string): Promise<MeDto> {
    return this.users.me(userId);
  }

  @Get('questions')
  list(@Query() query: Record<string, string | undefined>) {
    return this.admin.list(query);
  }

  @Get('questions/:id')
  get(@Param('id') id: string) {
    return this.admin.get(id);
  }

  @Patch('questions/:id')
  update(@UserId() userId: string, @Param('id') id: string, @Body() body: AdminUpdateQuestionRequest) {
    return this.admin.update(id, userId, body ?? {});
  }

  /** Body: the question JSON array, or `{ questions: [...] }`. `?dryRun=1` validates only. */
  @Post('questions/import')
  @HttpCode(200)
  import(@Body() body: unknown, @Query('dryRun') dryRun?: string) {
    const raw = Array.isArray(body) ? body : (body as { questions?: unknown })?.questions;
    const dry = dryRun === '1' || dryRun === 'true' || (body as { dryRun?: boolean })?.dryRun === true;
    return this.admin.import(raw, dry);
  }

  @Post('questions/approve')
  @HttpCode(200)
  approve(@UserId() userId: string, @Body() body: AdminBulkApproveRequest) {
    return this.admin.approve(userId, body);
  }

  @Get('issue-reports')
  issueReports(@Query('status') status?: string) {
    return this.admin.issueReports(status);
  }

  @Post('issue-reports/:id/resolve')
  @HttpCode(200)
  resolve(@UserId() userId: string, @Param('id') id: string, @Body() body: { status?: string; republish?: boolean }) {
    return this.admin.resolveReport(userId, id, body);
  }

  @Get('calibration')
  calibration() {
    return this.admin.calibration();
  }

  @Post('calibration/:questionId/apply')
  @HttpCode(200)
  applyCalibration(@Param('questionId') questionId: string) {
    return this.admin.applyCalibration(questionId);
  }
}
