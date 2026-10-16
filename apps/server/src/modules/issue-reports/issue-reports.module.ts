import { Body, Controller, Inject, Injectable, Module, Param, Post } from '@nestjs/common';
import type { GrowthConfig } from '@zuirock/game-rules';
import type { CreateIssueReportRequest, IssueReportDto } from '@zuirock/shared';
import { badRequest, conflict, notFound } from '../../common/api-error.js';
import { Auth, UserId } from '../../common/auth.guard.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';

export function toIssueReportDto(r: {
  id: string; questionId: string; reason: string; evidenceText: string | null; evidenceUrl: string | null; status: IssueReportDto['status']; createdAt: Date;
}): IssueReportDto {
  return { id: r.id, questionId: r.questionId, reason: r.reason, evidenceText: r.evidenceText, evidenceUrl: r.evidenceUrl, status: r.status, createdAt: r.createdAt.toISOString() };
}

/**
 * Error reports from the explanation screen (AC-C6): evidence text or an http(s) link is required,
 * one per (question, reporter); open reports from 3 different users suspend the question until an
 * admin resolves them (POST /api/admin/issue-reports/:id/resolve).
 */
@Injectable()
export class IssueReportsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  async create(userId: string, questionId: string, req: CreateIssueReportRequest): Promise<IssueReportDto> {
    const reason = typeof req?.reason === 'string' ? req.reason.trim() : '';
    const evidenceText = typeof req?.evidenceText === 'string' && req.evidenceText.trim() ? req.evidenceText.trim() : null;
    const evidenceUrl = typeof req?.evidenceUrl === 'string' && req.evidenceUrl.trim() ? req.evidenceUrl.trim() : null;
    if (!reason) throw badRequest('REASON_REQUIRED', '신고 이유를 적어 주세요');
    if (!evidenceText && !evidenceUrl) throw badRequest('EVIDENCE_REQUIRED', '근거(설명이나 링크)가 필요해요');
    if (evidenceUrl && !/^https?:\/\/\S+$/i.test(evidenceUrl)) throw badRequest('BAD_EVIDENCE_URL', '링크는 http(s) 주소여야 해요');
    const q = await this.prisma.question.findUnique({ where: { id: questionId } }).catch(() => null);
    if (!q) throw notFound('QUESTION_NOT_FOUND', '문제를 찾을 수 없어요');
    return this.prisma.$transaction(async (tx) => {
      const exists = await tx.issueReport.findUnique({ where: { questionId_reporterId: { questionId, reporterId: userId } } });
      if (exists) throw conflict('ALREADY_REPORTED', '이미 신고한 문제예요');
      const r = await tx.issueReport.create({ data: { questionId, reporterId: userId, reason, evidenceText, evidenceUrl } });
      const open = await tx.issueReport.count({ where: { questionId, status: 'open' } });
      if (open >= this.cfg.issueReport.suspendThreshold) {
        await tx.question.updateMany({ where: { id: questionId, status: 'published' }, data: { status: 'suspended' } });
      }
      return toIssueReportDto(r);
    });
  }
}

@Controller('questions')
class IssueReportsController {
  constructor(private readonly reports: IssueReportsService) {}

  @Post(':id/reports')
  @Auth()
  create(@UserId() userId: string, @Param('id') id: string, @Body() body: CreateIssueReportRequest): Promise<IssueReportDto> {
    return this.reports.create(userId, id, body);
  }
}

@Module({ controllers: [IssueReportsController], providers: [IssueReportsService] })
export class IssueReportsModule {}
