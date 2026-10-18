import type { TopicId } from '../enums.js';
import type { IsoDateTime, KstDay } from './common.js';

/** Solo-only consumables (D-R2-2). Using one on a question removes that question's no-hint bonus. */
export const CONSUMABLE_KINDS = ['chosung_first', 'remove_wrong_choice'] as const;
export type ConsumableKind = (typeof CONSUMABLE_KINDS)[number];

/** Shop products: the streak protection (existing rules, max 2) plus the consumables (max 99 each). */
export const SHOP_ITEM_KINDS = ['streak_protection', ...CONSUMABLE_KINDS] as const;
export type ShopItemKind = (typeof SHOP_ITEM_KINDS)[number];

export const CHEST_TIERS = ['normal', 'good'] as const;
/** normal = every stage first clear; good = first clear of a stage whose level is a multiple of 5 (instead of normal). */
export type ChestTier = (typeof CHEST_TIERS)[number];

// ---------- streak calendar ----------

export type StreakDayState = 'studied' | 'protected' | 'missed' | 'today' | 'future';

/** GET /api/me/streak/calendar?month=YYYY-MM (KST). */
export interface StreakCalendarDto {
  /** `YYYY-MM`. */
  month: string;
  days: Array<{
    date: KstDay;
    state: StreakDayState;
    /** Completed full solo sets that day (studied days). */
    sets?: number;
    /** Finished battles that day (studied days). */
    battles?: number;
  }>;
  current: number;
  longest: number;
  protectionsHeld: number;
  nextMilestone: { days: number; cheese: number; daysLeft: number } | null;
}

// ---------- shop ----------

export interface ShopItemDto {
  kind: ShopItemKind;
  name: string;
  desc: string;
  price: number;
  owned: number;
  /** Holding cap (protection 2, consumables 99). */
  max: number;
}

/** GET /api/shop */
export interface ShopDto {
  cheese: number;
  items: ShopItemDto[];
  chestsUnopened: number;
}

/** POST /api/shop/items/:kind/purchase — 402 INSUFFICIENT_CHEESE, 409 MAX_HELD. */
export interface PurchaseShopItemRequest {
  /** Default 1. */
  quantity?: number;
}

export interface PurchaseShopItemResponse {
  cheese: number;
  owned: number;
}

// ---------- inventory & chests ----------

export interface ChestDto {
  id: string;
  tier: ChestTier;
  source: { topicId: TopicId; level: number };
  grantedAt: IsoDateTime;
}

/** GET /api/me/inventory — consumables held and unopened chests. */
export interface InventoryDto {
  items: Array<{ kind: ConsumableKind; owned: number }>;
  chests: ChestDto[];
}

export type ChestReward =
  | { type: 'cheese'; amount: number }
  | { type: 'item'; kind: ConsumableKind; quantity: number }
  | { type: 'protection' };

/** POST /api/me/chests/:id/open — rewards are rolled once and stored; a second open is 409 CHEST_OPENED. */
export interface OpenChestResponse {
  rewards: ChestReward[];
  cheese: number;
  inventory: InventoryDto;
}

/** Added to SetResultDto (stage first clear only). */
export interface ChestGrantDto {
  id: string;
  tier: ChestTier;
}

// ---------- solo item use ----------

/** POST /api/solo/sets/:id/items/use — solo sets only (404 elsewhere). */
export interface UseSoloItemRequest {
  questionId: string;
  kind: ConsumableKind;
}

/**
 * 409 NO_ITEM (none held) / 409 ALREADY_USED (same kind on this question) / 400 WRONG_QUESTION_TYPE
 * (chosung_first on non-chosung, remove_wrong_choice on non-mcq). The question counts as hinted.
 */
export interface UseSoloItemResponse {
  /** chosung_first: the first syllable of the answer (not its consonant). */
  chosungFirst?: string;
  /** remove_wrong_choice: one wrong choice the client should hide (never the answer). */
  removedChoice?: string;
  owned: number;
}
