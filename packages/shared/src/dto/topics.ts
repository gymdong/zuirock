import type { SubfieldName, TopicId } from '../enums.js';

export interface SubfieldDto {
  id: string;
  name: SubfieldName;
}

/** GET /api/topics */
export interface TopicDto {
  id: TopicId;
  name: string;
  subtitle: string;
  subfields: SubfieldDto[];
  /** True when the topic has at least one published question; otherwise shown as '준비 중' (AC-S9, AC-C8). */
  available: boolean;
  sortOrder: number;
}

/** GET /api/me/topics/:topicId — topic level (p6). */
export interface TopicProgressDto {
  topicId: TopicId;
  /** Lv.1 … stageCount = highest cleared stage + 1. */
  level: number;
  highestClearedStage: number;
  /** Last stage cleared (reopens when more questions are published). */
  completed: boolean;
  selected: boolean;
  /** Whether the user picked a start (placement / basic test / Lv.1) for this topic. */
  started: boolean;
  /** Stages the topic has now: published questions ÷ 15 (10/28); grows as questions are published. */
  stageCount: number;
  /** Basic-test checkpoints (every 5 stages). */
  checkpoints: number[];
  /** Difficulty range of the current stage's questions; null before the topic has stages. */
  stage: { minDifficulty: number; maxDifficulty: number } | null;
}
