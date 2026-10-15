import type { QuestionStatus, QuestionType, SubfieldName, TopicId } from '../enums.js';
import type { IsoDateTime } from './common.js';

/** A question as served to players. Never contains the answer. */
export interface QuestionPublicDto {
  id: string;
  topicId: TopicId;
  subfield: SubfieldName;
  type: QuestionType;
  difficulty: number;
  question: string;
  /** mcq only: 4 choices. */
  choices?: string[];
  /** chosung only: number of syllables in the answer. */
  answerLength?: number;
}

/** Answer + explanation, sent after a question is closed (battle reveal / solo per-question). */
export interface QuestionRevealDto {
  questionId: string;
  answer: string;
  explanation: string;
  source: { title: string; url: string };
}

/** Admin view of a question (p admin Questions/QuestionEdit). */
export interface AdminQuestionDto extends QuestionPublicDto {
  answer: string;
  explanation: string;
  source: { title: string; url: string };
  status: QuestionStatus;
  recommendedDifficulty: number | null;
  solveCount: number;
  correctRate: number | null;
  openReportCount: number;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

/** PATCH /api/admin/questions/:id */
export interface AdminUpdateQuestionRequest {
  question?: string;
  answer?: string;
  choices?: string[];
  explanation?: string;
  source?: { title: string; url: string };
  difficulty?: number;
  subfield?: SubfieldName;
  status?: QuestionStatus;
}

/** POST /api/admin/questions/approve — only `reviewed`, ≤ 50, same subfield, has source.title. */
export interface AdminBulkApproveRequest {
  questionIds: string[];
  /** Reviewer confirmed every non-empty source.url opens. */
  linksChecked: boolean;
}

/** One error from import validation; `index` is 1-based within the file. */
export interface ImportErrorDto {
  index: number;
  field?: string;
  code: string;
  message: string;
}

/** POST /api/admin/questions/import (and scripts/import-questions.ts --dry-run output). */
export interface ImportResultDto {
  total: number;
  acceptedCount: number;
  errors: ImportErrorDto[];
  warnings: ImportErrorDto[];
  dryRun: boolean;
}

/** GET /api/admin/calibration — questions with ≥ 30 solves (AC-C7). */
export interface CalibrationDto {
  questionId: string;
  difficulty: number;
  recommendedDifficulty: number;
  solveCount: number;
  correctRate: number;
}

/** POST /api/questions/:id/reports — evidence (text or link) required (AC-C6). */
export interface CreateIssueReportRequest {
  reason: string;
  evidenceText?: string;
  evidenceUrl?: string;
}

export interface IssueReportDto {
  id: string;
  questionId: string;
  reason: string;
  evidenceText: string | null;
  evidenceUrl: string | null;
  status: 'open' | 'accepted' | 'rejected';
  createdAt: IsoDateTime;
}
