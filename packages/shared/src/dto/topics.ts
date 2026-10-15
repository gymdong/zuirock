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
  /** Lv.1–99 = highest cleared stage + 1. */
  level: number;
  highestClearedStage: number;
  /** Lv.99 cleared. */
  completed: boolean;
  selected: boolean;
  /** Whether the user picked a start (placement / basic test / Lv.1) for this topic. */
  started: boolean;
}
