import type { ChestReward, ChestTier, ShopItemKind } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';
import type { Rng } from './types.js';

/**
 * Chest for a first-cleared stage: 'good' when the level is a multiple of 5 (instead of normal).
 * The caller grants a chest only on a first clear (same rule as XP).
 */
export function chestTierForLevel(level: number, cfg: GrowthConfig = DEFAULT_CONFIG): ChestTier {
  return level > 0 && level % cfg.chest.goodEveryLevels === 0 ? 'good' : 'normal';
}

function uniformInt(rng: Rng, range: { min: number; max: number }): number {
  return range.min + Math.floor(rng() * (range.max - range.min + 1));
}

/**
 * Opens a chest (feedback round 2, #3). Rewards are decided here once and stored by the caller.
 * Normal: 70% cheese 5–15 | 20% chosung_first ×1 | 10% remove_wrong_choice ×1.
 * Good: cheese 20–50, plus 50% one consumable (half each), plus 10% a streak protection —
 * 30 cheese instead when `held.protection` is already at the cap (2).
 */
export function rollChest(tier: ChestTier, rng: Rng, held: { protection: number }, cfg: GrowthConfig = DEFAULT_CONFIG): ChestReward[] {
  if (tier === 'normal') {
    const n = cfg.chest.normal;
    const r = rng();
    if (r < n.cheeseChance) return [{ type: 'cheese', amount: uniformInt(rng, n.cheese) }];
    if (r < n.cheeseChance + n.chosungFirstChance) return [{ type: 'item', kind: 'chosung_first', quantity: 1 }];
    return [{ type: 'item', kind: 'remove_wrong_choice', quantity: 1 }];
  }
  const g = cfg.chest.good;
  const rewards: ChestReward[] = [{ type: 'cheese', amount: uniformInt(rng, g.cheese) }];
  if (rng() < g.itemChance) {
    rewards.push({ type: 'item', kind: rng() < 0.5 ? 'chosung_first' : 'remove_wrong_choice', quantity: 1 });
  }
  if (rng() < g.protectionChance) {
    rewards.push(
      held.protection >= cfg.streak.protection.maxHeld
        ? { type: 'cheese', amount: g.protectionFallbackCheese }
        : { type: 'protection' },
    );
  }
  return rewards;
}

export interface ShopCatalogItem {
  kind: ShopItemKind;
  name: string;
  desc: string;
  price: number;
  /** Maximum held. */
  max: number;
}

/** The three shop items (feedback round 2, #2), prices and caps from the config. */
export function shopCatalog(cfg: GrowthConfig = DEFAULT_CONFIG): ShopCatalogItem[] {
  return [
    {
      kind: 'streak_protection',
      name: '연속학습 보호권',
      desc: '학습하지 못한 날이 끝날 때 자동으로 사용되어 연속 기록을 지켜요.',
      price: cfg.streak.protection.price,
      max: cfg.streak.protection.maxHeld,
    },
    {
      kind: 'chosung_first',
      name: '초성 첫 글자 공개권',
      desc: '솔로 초성퀴즈에서 정답의 첫 글자를 보여줘요. 사용한 문제는 노힌트 보너스가 없어요.',
      price: cfg.consumables.chosungFirst.price,
      max: cfg.consumables.chosungFirst.maxHeld,
    },
    {
      kind: 'remove_wrong_choice',
      name: '오답 보기 제거권',
      desc: '솔로 객관식에서 정답이 아닌 보기 1개를 지워줘요. 사용한 문제는 노힌트 보너스가 없어요.',
      price: cfg.consumables.removeWrongChoice.price,
      max: cfg.consumables.removeWrongChoice.maxHeld,
    },
  ];
}

/** 오답 보기 제거권: a random choice that is not the answer. Throws RangeError if none exists. */
export function pickRemovedChoice(choices: readonly string[], answer: string, rng: Rng): string {
  const wrong = choices.filter((c) => c !== answer);
  if (wrong.length === 0) throw new RangeError('no wrong choice to remove');
  return wrong[Math.min(Math.floor(rng() * wrong.length), wrong.length - 1)]!;
}

/** 초성 첫 글자 공개권: the answer's first actual character (a syllable, not its initial consonant). */
export function chosungFirstChar(answer: string): string {
  return [...answer.trim()][0] ?? '';
}
