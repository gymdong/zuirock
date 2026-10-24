import type {
  AdminBulkApproveRequest,
  AdminQuestionDto,
  AdminUpdateQuestionRequest,
  ImportResultDto,
  MeDto,
  Paginated,
  QuestionStatus,
  QuestionType,
  SubfieldName,
  TopicId,
} from '@zuirock/shared';

export interface QuestionQuery {
  topicId?: TopicId;
  subfield?: SubfieldName;
  status?: QuestionStatus;
  type?: QuestionType;
  difficulty?: number;
  /** 문제 본문에 포함된 글자(부분 일치). */
  q?: string;
  cursor?: string;
  limit?: number;
}

/** Aggregated client-side from GET /api/admin/questions (no counts route) — one row per (topic, difficulty, type, status) with count > 0. */
export interface CountRow {
  topicId: TopicId;
  difficulty: number;
  type: QuestionType;
  status: QuestionStatus;
  count: number;
}

export type BulkFilter = Omit<QuestionQuery, 'cursor' | 'limit'>;

/** POST /api/admin/questions/bulk-transition (lane LB): ids or filter, one request per click. */
export interface BulkTransitionRequest {
  ids?: string[];
  filter?: BulkFilter;
  to: 'reviewed' | 'published';
  limit?: number;
}

export interface BulkTransitionResponse {
  updated: number;
  skipped: Array<{ id: string; reason: string }>;
  remaining?: number;
}

export interface SeedCheck {
  name: string;
  expected: unknown;
  actual: unknown;
  ok: boolean;
}

export interface SeedVerify {
  ok: boolean;
  observed: Record<string, unknown>;
  checks: SeedCheck[];
}

export interface SeedResult {
  userId: string;
  solves: number;
  sets: number;
  wrongNotes: number;
  friends: number;
  battles: number;
  cheese: number;
  streak: number;
  durationMs: number;
}

export const SEED_CONFIRM = 'RESET_MY_DEMO_ACCOUNT';

export interface AdminApi {
  /** 404 (ApiError.status) means DEMO_SEED is off on the server. */
  seedVerify(): Promise<SeedVerify>;
  seedStatus(): Promise<{ running: boolean }>;
  seedApply(): Promise<SeedResult>;
  bulkTransition(body: BulkTransitionRequest): Promise<BulkTransitionResponse>;
  me(): Promise<MeDto>;
  listQuestions(q: QuestionQuery): Promise<Paginated<AdminQuestionDto>>;
  getQuestion(id: string): Promise<AdminQuestionDto>;
  updateQuestion(id: string, body: AdminUpdateQuestionRequest): Promise<AdminQuestionDto>;
  approve(body: AdminBulkApproveRequest): Promise<{ published: number }>;
  importQuestions(items: unknown, dryRun: boolean): Promise<ImportResultDto>;
  counts(): Promise<CountRow[]>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
