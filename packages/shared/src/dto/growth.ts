import type { CheeseReason, XpSourceType } from '../enums.js';
import type { IsoDateTime, KstDay } from './common.js';
import type { AccountLevelDto } from './users.js';

/** XP outcome attached to set/battle results. */
export interface XpResultDto {
  /** XP actually added to the account (after daily cap). Guests: 0. */
  granted: number;
  /** Sum before the daily cap. */
  preCapTotal: number;
  /** '오늘 XP 상한 도달' (AC-G4). */
  capReached: boolean;
  /** Why no XP was granted, if so. */
  ineligibleReason?: XpIneligibleReason;
  /** Guest preview: "최대 N XP" (D6-6). */
  guestPreviewMax?: number;
  levelAfter?: AccountLevelDto;
}

export type XpIneligibleReason =
  | 'NOT_FIRST_CLEAR'
  | 'STAGE_FAILED'
  | 'BELOW_PASS'
  | 'DAILY_ALREADY_GRANTED'
  | 'QUEST_ALREADY_GRANTED'
  | 'NO_XP_MODE'
  | 'GUEST';

/** GET /api/me/xp-ledger — XP history with reasons (AC-G1). */
export interface XpLedgerEntryDto {
  id: string;
  sourceType: XpSourceType;
  sourceId: string;
  amount: number;
  preCapAmount: number;
  cappedAmount: number;
  reason: string;
  kstDay: KstDay;
  configVersion: string;
  createdAt: IsoDateTime;
}

/** GET /api/me/streak */
export interface StreakDto {
  current: number;
  longest: number;
  /** Today (KST) already counted. */
  todayCounted: boolean;
  protections: number;
  maxProtections: number;
  protectionPrice: number;
  /** Present when the streak broke and can be restored today for 100 cheese. */
  restorable: { lostLength: number; cost: number; untilKstDay: KstDay } | null;
  nextMilestone: { days: number; cheese: number } | null;
}

/** POST /api/me/streak/protections · POST /api/me/streak/restore */
export interface StreakPurchaseResponse {
  streak: StreakDto;
  cheese: number;
}

export interface CheeseLedgerEntryDto {
  id: string;
  delta: number;
  reason: CheeseReason;
  createdAt: IsoDateTime;
}
