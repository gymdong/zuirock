import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, Question, Subfield } from '@prisma/client';
import { normalize, recommendDifficulty, validateImport, type GrowthConfig } from '@zuirock/game-rules';
import {
  DIFFICULTIES,
  TOPIC_ID_BY_NAME,
  TOPIC_NAME_BY_ID,
  type AdminBulkApproveRequest,
  type AdminQuestionDto,
  type AdminUpdateQuestionRequest,
  type CalibrationDto,
  type ImportResultDto,
  type IssueReportDto,
  type Paginated,
  type QuestionInput,
  type QuestionStatus,
  type TopicName,
} from '@zuirock/shared';
import { badRequest, conflict, notFound } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { PrismaService } from '../../common/prisma.service.js';
import { toPublicQuestion } from '../../common/question-dto.js';

type Q = Question & { subfield: Subfield };

/** Allowed manual status changes; `draft → published` must pass review first (AC-C3). */
const TRANSITIONS: Record<QuestionStatus, QuestionStatus[]> = {
  draft: ['reviewed', 'suspended'],
  reviewed: ['draft', 'published', 'suspended'],
  published: ['suspended'],
  suspended: ['reviewed', 'published'],
};
const BULK_MAX = 50;

function toInput(q: Q): QuestionInput {
  return {
    topic: TOPIC_NAME_BY_ID[q.topicId as keyof typeof TOPIC_NAME_BY_ID],
    subfield: q.subfield.name,
    type: q.type,
    difficulty: q.difficulty,
    question: q.question,
    answer: q.answer,
    ...(q.type === 'mcq' ? { choices: q.choices } : {}),
    explanation: q.explanation,
    source: { title: q.sourceTitle, url: q.sourceUrl },
  } as QuestionInput;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private async stats(ids: string[]) {
    const [solves, reports] = await Promise.all([
      this.prisma.solveLog.groupBy({ by: ['questionId', 'correct'], where: { questionId: { in: ids } }, _count: { _all: true } }),
      this.prisma.issueReport.groupBy({ by: ['questionId'], where: { questionId: { in: ids }, status: 'open' }, _count: { _all: true } }),
    ]);
    return (id: string) => {
      const n = solves.filter((s) => s.questionId === id).reduce((a, s) => a + s._count._all, 0);
      const c = solves.find((s) => s.questionId === id && s.correct)?._count._all ?? 0;
      return { solveCount: n, correctRate: n ? c / n : null, openReportCount: reports.find((r) => r.questionId === id)?._count._all ?? 0 };
    };
  }

  private dto(q: Q, s: { solveCount: number; correctRate: number | null; openReportCount: number }): AdminQuestionDto {
    return {
      ...toPublicQuestion(q),
      choices: q.type === 'mcq' ? q.choices : undefined,
      answer: q.answer,
      explanation: q.explanation,
      source: { title: q.sourceTitle, url: q.sourceUrl },
      status: q.status,
      recommendedDifficulty: q.recommendedDifficulty,
      ...s,
      createdAt: q.createdAt.toISOString(),
      updatedAt: q.updatedAt.toISOString(),
    };
  }

  async list(f: Record<string, string | undefined>): Promise<Paginated<AdminQuestionDto>> {
    const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200);
    const where: Prisma.QuestionWhereInput = {
      ...(f.status ? { status: f.status as QuestionStatus } : {}),
      ...(f.topicId ? { topicId: f.topicId } : {}),
      ...(f.subfield ? { subfield: { name: f.subfield } } : {}),
      ...(f.type ? { type: f.type as Question['type'] } : {}),
      ...(f.difficulty ? { difficulty: Number(f.difficulty) } : {}),
      ...(f.importBatch ? { importBatch: f.importBatch } : {}),
      ...(f.q ? { question: { contains: f.q } } : {}),
    };
    const rows = await this.prisma.question.findMany({
      where,
      include: { subfield: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, limit);
    const stat = await this.stats(page.map((q) => q.id));
    return { items: page.map((q) => this.dto(q, stat(q.id))), nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  }

  async get(id: string): Promise<AdminQuestionDto> {
    const q = await this.prisma.question.findUnique({ where: { id }, include: { subfield: true } }).catch(() => null);
    if (!q) throw notFound('QUESTION_NOT_FOUND', '문제를 찾을 수 없어요');
    return this.dto(q, (await this.stats([id]))(id));
  }

  async update(id: string, adminId: string, req: AdminUpdateQuestionRequest): Promise<AdminQuestionDto> {
    const cur = await this.prisma.question.findUnique({ where: { id }, include: { subfield: true } }).catch(() => null);
    if (!cur) throw notFound('QUESTION_NOT_FOUND', '문제를 찾을 수 없어요');
    const data: Prisma.QuestionUncheckedUpdateInput = {};
    if (req.question !== undefined) {
      data.question = req.question;
      data.normalizedText = normalize(req.question);
    }
    if (req.answer !== undefined) data.answer = req.answer;
    if (req.choices !== undefined) data.choices = req.choices;
    if (req.explanation !== undefined) data.explanation = req.explanation;
    if (req.source) {
      data.sourceTitle = req.source.title;
      data.sourceUrl = req.source.url ?? '';
    }
    if (req.difficulty !== undefined) {
      if (!(DIFFICULTIES as readonly number[]).includes(req.difficulty)) throw badRequest('BAD_DIFFICULTY', '난이도는 1~5, 0.5 단위예요');
      data.difficulty = req.difficulty;
    }
    if (req.subfield !== undefined) {
      const sf = await this.prisma.subfield.findUnique({ where: { topicId_name: { topicId: cur.topicId, name: req.subfield } } });
      if (!sf) throw badRequest('BAD_SUBFIELD', '세부 분야가 올바르지 않아요');
      data.subfieldId = sf.id;
    }
    const type = cur.type;
    const answer = (data.answer as string | undefined) ?? cur.answer;
    const choices = (data.choices as string[] | undefined) ?? cur.choices;
    if (type === 'mcq' && (choices.length !== 4 || !choices.includes(answer))) throw badRequest('ANSWER_NOT_IN_CHOICES', '보기 4개 중에 정답이 있어야 해요');
    if (type === 'ox' && !['O', 'X'].includes(answer)) throw badRequest('BAD_OX_ANSWER', 'OX 정답은 O 또는 X예요');
    if (req.status !== undefined && req.status !== cur.status) {
      if (!TRANSITIONS[cur.status].includes(req.status)) throw conflict('BAD_TRANSITION', `${cur.status} → ${req.status}로 바꿀 수 없어요`);
      data.status = req.status;
      const now = new Date(this.clock.now());
      if (req.status === 'reviewed') Object.assign(data, { reviewedById: adminId, reviewedAt: now });
      if (req.status === 'published') data.publishedAt = now;
    }
    try {
      await this.prisma.question.update({ where: { id }, data });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw conflict('DUPLICATE_QUESTION', '같은 문구의 문제가 이미 있어요');
      throw error;
    }
    return this.get(id);
  }

  /** JSON upload → validateImport; passing questions become `draft` unless dryRun (AC-C2). */
  async import(raw: unknown, dryRun: boolean): Promise<ImportResultDto & { importBatch: string | null }> {
    const existing = new Set((await this.prisma.question.findMany({ select: { normalizedText: true } })).map((q) => q.normalizedText));
    const v = validateImport(raw, existing);
    const total = Array.isArray(raw) ? raw.length : 0;
    let importBatch: string | null = null;
    if (!dryRun && v.accepted.length) {
      importBatch = `batch-${new Date(this.clock.now()).toISOString()}-${randomUUID().slice(0, 8)}`;
      const subfields = await this.prisma.subfield.findMany();
      await this.prisma.question.createMany({
        skipDuplicates: true,
        data: v.accepted.map(({ question: q, normalizedText }) => {
          const topicId = TOPIC_ID_BY_NAME[q.topic as TopicName];
          const sf = subfields.find((s) => s.topicId === topicId && s.name === q.subfield);
          if (!sf) throw badRequest('BAD_SUBFIELD', `${q.topic}/${q.subfield} 세부 분야가 DB에 없어요`);
          return {
            topicId,
            subfieldId: sf.id,
            type: q.type,
            difficulty: q.difficulty,
            question: q.question,
            normalizedText,
            answer: q.answer,
            choices: q.type === 'mcq' ? (q.choices ?? []) : [],
            explanation: q.explanation,
            sourceTitle: q.source.title,
            sourceUrl: q.source.url ?? '',
            status: 'draft' as const,
            importBatch,
          };
        }),
      });
    }
    return { total, acceptedCount: v.accepted.length, errors: v.errors, warnings: v.warnings, dryRun, importBatch };
  }

  /** Bulk approve (plan §4.3 LE): ≤ 50, all `reviewed`, one subfield, source.title, links checked, no warnings. */
  async approve(adminId: string, req: AdminBulkApproveRequest): Promise<{ published: number }> {
    const ids = [...new Set(req?.questionIds ?? [])];
    if (!ids.length || ids.length > BULK_MAX) throw badRequest('BULK_SIZE', `한 번에 1~${BULK_MAX}문제만 승인할 수 있어요`);
    const qs = await this.prisma.question.findMany({ where: { id: { in: ids } }, include: { subfield: true } });
    if (qs.length !== ids.length) throw notFound('QUESTION_NOT_FOUND', '없는 문제가 있어요');
    if (qs.some((q) => q.status !== 'reviewed')) throw conflict('NOT_REVIEWED', '검수 완료 상태의 문제만 승인할 수 있어요');
    if (new Set(qs.map((q) => q.subfieldId)).size !== 1) throw badRequest('MIXED_SUBFIELD', '같은 세부 분야끼리만 일괄 승인할 수 있어요');
    if (qs.some((q) => !q.sourceTitle.trim())) throw badRequest('SOURCE_TITLE_REQUIRED', '출처 제목이 없는 문제가 있어요');
    if (qs.some((q) => q.sourceUrl.trim()) && req.linksChecked !== true) throw badRequest('LINKS_NOT_CHECKED', '출처 링크를 확인해 주세요');
    const warned = validateImport(qs.map(toInput), new Set()).warnings;
    if (warned.length) throw badRequest('HAS_WARNINGS', '경고가 있는 문제는 하나씩 승인해 주세요', warned);
    const now = new Date(this.clock.now());
    const { count } = await this.prisma.question.updateMany({
      where: { id: { in: ids }, status: 'reviewed' },
      data: { status: 'published', publishedAt: now },
    });
    void adminId;
    return { published: count };
  }

  // ---------- stubs for pass 2 (issue reports, calibration) ----------

  async issueReports(status?: string): Promise<IssueReportDto[]> {
    const rows = await this.prisma.issueReport.findMany({
      where: status === 'open' || status === 'accepted' || status === 'rejected' ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      questionId: r.questionId,
      reason: r.reason,
      evidenceText: r.evidenceText,
      evidenceUrl: r.evidenceUrl,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async calibration(): Promise<CalibrationDto[]> {
    const groups = await this.prisma.solveLog.groupBy({ by: ['questionId', 'correct'], _count: { _all: true } });
    const byQ = new Map<string, { n: number; c: number }>();
    for (const g of groups) {
      const e = byQ.get(g.questionId) ?? { n: 0, c: 0 };
      e.n += g._count._all;
      if (g.correct) e.c += g._count._all;
      byQ.set(g.questionId, e);
    }
    const eligible = [...byQ].filter(([, e]) => e.n >= this.cfg.calibration.minSolves);
    const qs = await this.prisma.question.findMany({ where: { id: { in: eligible.map(([id]) => id) } }, select: { id: true, difficulty: true } });
    return eligible.flatMap(([id, e]) => {
      const rec = recommendDifficulty({ solveCount: e.n, correctCount: e.c }, this.cfg);
      const q = qs.find((x) => x.id === id);
      return rec === null || !q ? [] : [{ questionId: id, difficulty: q.difficulty, recommendedDifficulty: rec, solveCount: e.n, correctRate: e.c / e.n }];
    });
  }
}
