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

/** 오늘 처음으로 연속 학습이 이어진 순간(풀이·대결 결과에 실려 앱이 연출을 띄운다). */
export interface StreakAdvanceDto {
  /** 오늘 반영된 뒤의 연속 일수. */
  current: number;
  /** 1 이면 새로 시작(또는 끊겼다가 다시 시작). */
  startedNew: boolean;
  /** 이번에 달성한 기념일과 치즈 보상(3/7/14/30일). */
  milestone?: { days: number; cheese: number };
  /** 다음 기념일(없으면 null). */
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
