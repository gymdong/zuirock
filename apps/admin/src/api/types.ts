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
  cursor?: string;
  limit?: number;
}

/** GET /api/admin/questions/counts — one row per (topic, difficulty, type, status) with count > 0. */
export interface CountRow {
  topicId: TopicId;
  difficulty: number;
  type: QuestionType;
  status: QuestionStatus;
  count: number;
}

export interface AdminApi {
  me(): Promise<MeDto>;
  listQuestions(q: QuestionQuery): Promise<Paginated<AdminQuestionDto>>;
  getQuestion(id: string): Promise<AdminQuestionDto>;
  updateQuestion(id: string, body: AdminUpdateQuestionRequest): Promise<AdminQuestionDto>;
  approve(body: AdminBulkApproveRequest): Promise<{ approved: number }>;
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
