import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Question, type Subfield } from '@prisma/client';
import { normalize, recommendDifficulty, validateImport, type GrowthConfig } from '@zuirock/game-rules';
import {
  DIFFICULTIES,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SUBFIELD_NAMES,
  TOPIC_IDS,
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
import { toIssueReportDto } from '../issue-reports/issue-reports.module.js';

type Q = Question & { subfield: Subfield };

/** Allowed manual status changes; `draft → published` must pass review first (AC-C3). */
const TRANSITIONS: Record<QuestionStatus, QuestionStatus[]> = {
  draft: ['reviewed', 'suspended'],
  reviewed: ['draft', 'published', 'suspended'],
  published: ['suspended'],
  suspended: ['reviewed', 'published'],
};
const BULK_MAX = 50;
const BULK_TRANSITION_MAX = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Same keys as GET /questions (LE's admin UI sends one filter object to both). */
const BULK_FILTER_KEYS = ['status', 'topicId', 'subfield', 'subfieldId', 'type', 'difficulty', 'importBatch', 'q'] as const;
type BulkFilter = Partial<Record<(typeof BULK_FILTER_KEYS)[number], string | number>>;

/**
 * Validates a bulk filter without a DB round trip: unknown keys, unknown enum values, a subfield
 * name that does not exist or a malformed UUID → 400 BAD_FILTER (never silently widened).
 */
function checkBulkFilter(f: unknown): Record<string, string | undefined> {
  const bad = (why: string) => badRequest('BAD_FILTER', `필터가 올바르지 않아요: ${why}`);
  if (typeof f !== 'object' || f === null || Array.isArray(f)) throw bad('object');
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(f)) {
    if (!(BULK_FILTER_KEYS as readonly string[]).includes(k)) throw bad(`unknown key ${k}`);
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'string' && typeof v !== 'number') throw bad(k);
    out[k] = String(v);
  }
  if (out.status && !(QUESTION_STATUSES as readonly string[]).includes(out.status)) throw bad('status');
  if (out.type && !(QUESTION_TYPES as readonly string[]).includes(out.type)) throw bad('type');
  if (out.topicId && !(TOPIC_IDS as readonly string[]).includes(out.topicId)) throw bad('topicId');
  if (out.subfield && !(SUBFIELD_NAMES as readonly string[]).includes(out.subfield)) throw bad('subfield');
  if (out.subfieldId && !UUID.test(out.subfieldId)) throw bad('subfieldId');
  if (out.difficulty && !(DIFFICULTIES as readonly number[]).includes(Number(out.difficulty))) throw bad('difficulty');
  return out;
}

export interface BulkTransitionRequest {
  ids?: string[];
  filter?: BulkFilter;
  to: 'reviewed' | 'published';
  limit?: number;
}

export interface BulkTransitionResult {
  updated: number;
  skipped: Array<{ id: string; reason: 'NOT_FOUND' | 'SUSPENDED' | 'ALREADY_PUBLISHED' | 'ALREADY_REVIEWED' | 'MISSING_SOURCE_TITLE' }>;
  /** Filter mode: eligible rows left after this call (call again until 0). */
  remaining?: number;
}

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

  /**
   * One SQL statement for a page of questions with subfield name, solve stats and open report count
   * (Render ↔ Neon round trips are slow; plan: ≤ 2 queries per admin list request).
   */
  private async page(where: Prisma.Sql, limit: number, cursor?: string): Promise<AdminQuestionDto[]> {
    const after = cursor && UUID.test(cursor)
      ? Prisma.sql`AND (q."createdAt", q.id) > (SELECT c."createdAt", c.id FROM "Question" c WHERE c.id = ${cursor}::uuid)`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<Question & { subfieldName: string; solveCount: bigint; correctCount: bigint; openReportCount: bigint }>>`
      SELECT q.*, s.name AS "subfieldName",
        (SELECT count(*) FROM "SolveLog" l WHERE l."questionId" = q.id) AS "solveCount",
        (SELECT count(*) FROM "SolveLog" l WHERE l."questionId" = q.id AND l.correct) AS "correctCount",
        (SELECT count(*) FROM "IssueReport" r WHERE r."questionId" = q.id AND r.status = 'open') AS "openReportCount"
      FROM "Question" q JOIN "Subfield" s ON s.id = q."subfieldId"
      WHERE ${where} ${after}
      ORDER BY q."createdAt", q.id
      LIMIT ${limit}`;
    return rows.map((r) => {
      const n = Number(r.solveCount);
      return this.dto({ ...r, subfield: { id: r.subfieldId, topicId: r.topicId, name: r.subfieldName } }, {
        solveCount: n,
        correctRate: n ? Number(r.correctCount) / n : null,
        openReportCount: Number(r.openReportCount),
      });
    });
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

  private filterSql(f: Record<string, string | undefined>): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (f.status) parts.push(Prisma.sql`q.status::text = ${f.status}`);
    if (f.topicId) parts.push(Prisma.sql`q."topicId" = ${f.topicId}`);
    if (f.subfield) parts.push(Prisma.sql`s.name = ${f.subfield}`);
    if (f.subfieldId && UUID.test(f.subfieldId)) parts.push(Prisma.sql`q."subfieldId" = ${f.subfieldId}::uuid`);
    if (f.type) parts.push(Prisma.sql`q.type::text = ${f.type}`);
    if (f.difficulty) parts.push(Prisma.sql`q.difficulty = ${Number(f.difficulty)}`);
    if (f.importBatch) parts.push(Prisma.sql`q."importBatch" = ${f.importBatch}`);
    if (f.q) parts.push(Prisma.sql`strpos(q.question, ${f.q}) > 0`);
    return Prisma.join(parts, ' AND ');
  }

  /** 2 queries: the page (+1 row to detect a next page) and the total count. */
  async list(f: Record<string, string | undefined>): Promise<Paginated<AdminQuestionDto> & { total: number }> {
    const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200);
    const where = this.filterSql(f);
    const [rows, [count]] = await Promise.all([
      this.page(where, limit + 1, f.cursor),
      this.prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM "Question" q JOIN "Subfield" s ON s.id = q."subfieldId" WHERE ${where}`,
    ]);
    const items = rows.slice(0, limit);
    return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.id : null, total: Number(count!.n) };
  }

  async get(id: string): Promise<AdminQuestionDto> {
    const [q] = UUID.test(id) ? await this.page(Prisma.sql`q.id = ${id}::uuid`, 1) : [];
    if (!q) throw notFound('QUESTION_NOT_FOUND', '문제를 찾을 수 없어요');
    return q;
  }

  /**
   * Bulk status change without the subfield/50 limits of `approve` (docs/api-admin.md).
   * draft → reviewed, draft → published, reviewed → published; suspended/published rows and rows
   * without source.title are skipped. 2 statements in one transaction: one SELECT for skip reasons
   * (ids mode) or for missing-title rows (filter mode), and one set-based UPDATE … RETURNING.
   */
  async bulkTransition(adminId: string, req: BulkTransitionRequest): Promise<BulkTransitionResult> {
    const to = req?.to;
    if (to !== 'reviewed' && to !== 'published') throw badRequest('BAD_TARGET', "to는 'reviewed' 또는 'published'예요");
    const hasIds = Array.isArray(req.ids);
    const hasFilter = !!req.filter && typeof req.filter === 'object';
    if (hasIds === hasFilter) throw badRequest('IDS_XOR_FILTER', 'ids와 filter 중 하나만 보내 주세요');
    const limit = Math.min(Math.max(Number(req.limit) || BULK_TRANSITION_MAX, 1), BULK_TRANSITION_MAX);
    const from = to === 'reviewed' ? ['draft'] : ['draft', 'reviewed'];
    const now = new Date(this.clock.now());
    const skipped: BulkTransitionResult['skipped'] = [];

    let scope: Prisma.Sql;
    if (hasIds) {
      if (req.ids!.length > BULK_TRANSITION_MAX) throw badRequest('BULK_SIZE', `한 번에 ${BULK_TRANSITION_MAX}문제까지예요`);
      const ids = [...new Set(req.ids!.filter((x): x is string => typeof x === 'string'))];
      if (ids.length > BULK_TRANSITION_MAX) throw badRequest('BULK_SIZE', `한 번에 ${BULK_TRANSITION_MAX}문제까지예요`);
      for (const id of ids.filter((x) => !UUID.test(x))) skipped.push({ id, reason: 'NOT_FOUND' });
      scope = Prisma.sql`q.id = ANY(${ids.filter((x) => UUID.test(x))}::uuid[])`;
    } else {
      scope = this.filterSql(checkBulkFilter(req.filter!));
    }

    return this.prisma.$transaction(async (tx) => {
      if (hasIds) {
        const ids = req.ids!.filter((x) => UUID.test(x));
        const found = await tx.$queryRaw<Array<{ id: string; status: QuestionStatus; sourceTitle: string }>>`
          SELECT q.id, q.status, q."sourceTitle" FROM "Question" q WHERE ${scope}`;
        const byId = new Map(found.map((r) => [r.id, r]));
        for (const id of ids) {
          const r = byId.get(id);
          if (!r) skipped.push({ id, reason: 'NOT_FOUND' });
          else if (r.status === 'suspended') skipped.push({ id, reason: 'SUSPENDED' });
          else if (r.status === 'published') skipped.push({ id, reason: 'ALREADY_PUBLISHED' });
          else if (!from.includes(r.status)) skipped.push({ id, reason: 'ALREADY_REVIEWED' });
          else if (!r.sourceTitle.trim()) skipped.push({ id, reason: 'MISSING_SOURCE_TITLE' });
        }
      } else {
        const missing = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT q.id FROM "Question" q JOIN "Subfield" s ON s.id = q."subfieldId"
          WHERE ${scope} AND q.status::text = ANY(${from}) AND btrim(q."sourceTitle") = ''
          ORDER BY q."createdAt", q.id LIMIT ${BULK_TRANSITION_MAX}`;
        for (const r of missing) skipped.push({ id: r.id, reason: 'MISSING_SOURCE_TITLE' });
      }
      // count(*) OVER () = all eligible rows before LIMIT → `remaining` without another query.
      const updated = await tx.$queryRaw<Array<{ id: string; total: bigint }>>`
        WITH target AS (
          SELECT q.id, count(*) OVER () AS total FROM "Question" q JOIN "Subfield" s ON s.id = q."subfieldId"
          WHERE ${scope} AND q.status::text = ANY(${from}) AND btrim(q."sourceTitle") <> ''
          ORDER BY q."createdAt", q.id LIMIT ${limit}
        )
        UPDATE "Question" u SET
          status = ${to}::"QuestionStatus",
          "reviewedAt" = CASE WHEN u.status = 'draft' THEN ${now} ELSE u."reviewedAt" END,
          "reviewedById" = CASE WHEN u.status = 'draft' THEN ${adminId}::uuid ELSE u."reviewedById" END,
          "publishedAt" = CASE WHEN ${to} = 'published' THEN ${now} ELSE u."publishedAt" END,
          "updatedAt" = ${now}
        FROM target
        WHERE u.id = target.id AND u.status::text = ANY(${from})
        RETURNING u.id, target.total`;
      const total = updated.length ? Number(updated[0]!.total) : 0;
      return {
        updated: updated.length,
        skipped,
        ...(hasFilter ? { remaining: Math.max(0, total - updated.length) } : {}),
      };
    });
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

  // ---------- issue reports, calibration ----------

  async issueReports(status?: string): Promise<IssueReportDto[]> {
    const rows = await this.prisma.issueReport.findMany({
      where: status === 'open' || status === 'accepted' || status === 'rejected' ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toIssueReportDto);
  }

  /** Resolve a report; `republish` re-opens a suspended question once no open reports remain. */
  async resolveReport(adminId: string, id: string, req: { status?: string; republish?: boolean }): Promise<IssueReportDto> {
    if (req?.status !== 'accepted' && req?.status !== 'rejected') throw badRequest('BAD_STATUS', 'accepted 또는 rejected만 가능해요');
    const r = await this.prisma.issueReport.findUnique({ where: { id } }).catch(() => null);
    if (!r) throw notFound('REPORT_NOT_FOUND', '신고를 찾을 수 없어요');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.issueReport.update({ where: { id }, data: { status: req.status as 'accepted' | 'rejected', resolvedById: adminId, resolvedAt: new Date(this.clock.now()) } });
      if (req.republish && (await tx.issueReport.count({ where: { questionId: r.questionId, status: 'open' } })) === 0) {
        await tx.question.updateMany({ where: { id: r.questionId, status: 'suspended' }, data: { status: 'published' } });
      }
      return u;
    });
    return toIssueReportDto(updated);
  }

  /** Applies the recommended ★ (AC-C7: admin approval, never automatic). */
  async applyCalibration(questionId: string): Promise<AdminQuestionDto> {
    const rec = (await this.calibration()).find((c) => c.questionId === questionId);
    if (!rec) throw badRequest('NOT_CALIBRATABLE', '풀이 30회 이상인 문제만 보정할 수 있어요');
    await this.prisma.question.update({ where: { id: questionId }, data: { difficulty: rec.recommendedDifficulty, recommendedDifficulty: rec.recommendedDifficulty } });
    return this.get(questionId);
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
