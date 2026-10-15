import type { SolveMode, SubfieldName, TopicId, WrongNoteStatus } from '../enums.js';
import type { IsoDateTime, KstDay } from './common.js';
import type { QuestionPublicDto, QuestionRevealDto } from './questions.js';

/** GET /api/me/wrong-notes */
export interface WrongNoteDto {
  questionId: string;
  question: QuestionPublicDto;
  reveal: QuestionRevealDto;
  status: WrongNoteStatus;
  wrongCount: number;
  lastWrongAt: IsoDateTime;
  reviewedAt: IsoDateTime | null;
}

export interface TopicWeekStatDto {
  topicId: TopicId;
  solved: number;
  correctRate: number | null;
  /** Same metric for the previous week (null if no solves). */
  prevCorrectRate: number | null;
  /** correctRate − prevCorrectRate in percentage points, null if either side is missing. */
  deltaPp: number | null;
}

/** GET /api/reports/weekly/current and /api/reports/weekly/:weekStart (Mon–Sun KST, p12). */
export interface WeeklyReportDto {
  weekStart: KstDay;
  weekEnd: KstDay;
  /** false = current week (live), true = finalized snapshot. */
  finalized: boolean;
  solved: number;
  correctRate: number | null;
  /** Streak days within the week. */
  streakDays: number;
  byTopic: TopicWeekStatDto[];
  /** '가장 많이 늘었어요': topic with ≥ 10 solves this week and the largest positive gain. */
  mostImproved: { topicId: TopicId; deltaPp: number } | null;
}

export interface WeaknessItemDto {
  subfieldId: string;
  subfield: SubfieldName;
  topicId: TopicId;
  solved: number;
  wrongRate: number;
  avgResponseMs: number;
  wrongNoteCount: number;
  /** One-line reason (오답률·응답 시간·오답노트 문제 수). */
  reason: string;
}

/** GET /api/reports/weakness */
export interface WeaknessReportDto {
  weekStart: KstDay;
  weeklySolved: number;
  /** weeklySolved < 30 → '아직 데이터가 부족해요' (AC-D4). */
  insufficientData: boolean;
  minWeeklySolves: number;
  /** Up to 3, subfield level, ≥ 5 solves, by wrong rate (AC-D3). Empty when insufficientData. */
  weaknesses: WeaknessItemDto[];
  /** Topic-level weak topics (30-day top 2 by wrong rate) — composite weighting / XP +50%. */
  weakTopics: TopicId[];
  /** First diagnosis set offer (5 per selected topic) when data is insufficient. */
  diagnostic: { questionCount: number } | null;
  quest: { subfieldId: string; completedThisWeek: boolean } | null;
}

/** GET /api/reports/history — 전체 기록 탭. */
export interface HistorySummaryDto {
  totalSolved: number;
  correctRate: number | null;
  longestStreak: number;
  battles: { played: number; wins: number; podiums: number };
  monthly: Array<{ month: string; solved: number }>;
  byTopic: Array<{ topicId: TopicId; solved: number; correctRate: number | null }>;
}

/** One SolveLog as exposed to clients (debug / history detail). */
export interface SolveLogDto {
  id: string;
  questionId: string;
  mode: SolveMode;
  correct: boolean;
  responseMs: number;
  beforeReveal: boolean | null;
  answeredAt: IsoDateTime;
}
