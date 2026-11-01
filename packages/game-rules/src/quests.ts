import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

export type QuestDef = GrowthConfig['quests']['daily'][number];

/** 'all' is the bonus chest for clearing every daily quest. */
export const ALL_CLEAR_QUEST_ID = 'all';

export function dailyQuestDefs(cfg: GrowthConfig = DEFAULT_CONFIG): QuestDef[] {
  return cfg.quests.daily;
}

/** Idempotency key of a claimed quest chest: one per user, KST day and quest. */
export function questKey(kstDay: string, questId: string): string {
  return `${kstDay}:${questId}`;
}

export interface QuestStatus {
  id: string;
  progress: number;
  target: number;
  done: boolean;
}

/** progress is clamped to the target for display; `done` once the target is reached. */
export function questStatus(def: QuestDef, raw: number): QuestStatus {
  return { id: def.id, progress: Math.min(Math.max(0, raw), def.target), target: def.target, done: raw >= def.target };
}
