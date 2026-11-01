import type { ChestGrantDto, ChestTier } from './shop.js';

/** One daily quest (KST day). `chest` is set once the reward was claimed (it may still be unopened). */
export interface DailyQuestDto {
  id: string;
  title: string;
  desc: string;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
  tier: ChestTier;
  chest?: ChestGrantDto & { opened: boolean };
}

/** GET /api/me/quests */
export interface DailyQuestsDto {
  kstDay: string;
  /** Resets at 00:00 KST: ISO time of the next reset. */
  resetsAt: string;
  quests: DailyQuestDto[];
  /** Bonus chest for clearing every quest. */
  bonus: Omit<DailyQuestDto, 'progress' | 'target' | 'desc'> & { cleared: number; total: number };
  /** Rewards ready to claim (done but not claimed), for the home badge. */
  claimable: number;
}

/** POST /api/me/quests/:id/claim — `id` may be 'all' for the bonus. Idempotent: a second claim returns the same chest. */
export interface ClaimQuestResponse {
  chest: ChestGrantDto & { opened: boolean };
}
