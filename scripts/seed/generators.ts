// Pure data generators for the demo seed (plan §4.3 LF). No I/O, no clock: everything derives from `now`.
import { DEFAULT_CONFIG, addKstDays, kstDayStart, kstWeekStart, toKstDay } from '@zuirock/game-rules';

export type SeedTopic = '과학' | '상식' | '어휘력' | '역사';

export const SUBFIELDS: Record<SeedTopic, readonly string[]> = {
  과학: ['물리', '화학', '생물'],
  상식: ['생활', '사회', '문화'],
  어휘력: ['맞춤법', '한자어', '순화어'],
  역사: ['한국사', '세계사'],
};

export interface SeedSolve {
  topic: SeedTopic;
  subfield: string;
  correct: boolean;
  /** Epoch ms, always <= now. */
  at: number;
}

export interface SolveBlock {
  topic: SeedTopic;
  /** Subfields cycle across the block. */
  count: number;
  wrong: number;
}

/**
 * Builds `count` solves for a topic cycling its subfields; the first `wrong` of the *last* rounds are wrong
 * (wrongs are spread evenly so every subfield keeps a mix). `perSubfieldWrong` overrides the spread.
 */
export function buildSolves(
  block: SolveBlock,
  from: number,
  to: number,
  perSubfieldWrong?: Record<string, number>,
): SeedSolve[] {
  const subs = SUBFIELDS[block.topic];
  const solves: SeedSolve[] = [];
  const wrongLeft: Record<string, number> = {};
  if (perSubfieldWrong) Object.assign(wrongLeft, perSubfieldWrong);
  else {
    // spread wrongs round-robin over subfields
    for (let i = 0; i < block.wrong; i += 1) {
      const sub = subs[i % subs.length]!;
      wrongLeft[sub] = (wrongLeft[sub] ?? 0) + 1;
    }
  }
  const span = Math.max(to - from, 1);
  for (let i = 0; i < block.count; i += 1) {
    const subfield = subs[i % subs.length]!;
    const wrong = (wrongLeft[subfield] ?? 0) > 0;
    if (wrong) wrongLeft[subfield] = (wrongLeft[subfield] ?? 0) - 1;
    solves.push({
      topic: block.topic,
      subfield,
      correct: !wrong,
      at: Math.floor(from + (span * (i + 1)) / (block.count + 1)),
    });
  }
  return solves;
}

/** Consecutive KST days ending on the KST day of `now`. */
export function buildStreakDays(now: number, length: number): string[] {
  const today = toKstDay(now);
  return Array.from({ length }, (_, i) => addKstDays(today, -(length - 1 - i)));
}

/** Cheese granted by streak milestones for a continuous run of `runLength` days (config-driven). */
export function streakMilestoneCheese(runLength: number): number {
  return DEFAULT_CONFIG.streak.milestones.filter((m) => m.days <= runLength).reduce((sum, m) => sum + m.cheese, 0);
}

/** `seed_adjust` ledger amount so that recomputed streak cheese − purchases + adjust = target. */
export function cheeseSeedAdjust(target: number, recomputed: number, purchases: number): number {
  return target - recomputed + purchases;
}

/** Start of the KST Mon–Sun week containing `now`, and the earliest instant of the 30-day window. */
export function windows(now: number): { weekStart: number; thirtyDayStart: number } {
  const today = toKstDay(now);
  return {
    weekStart: kstDayStart(kstWeekStart(today)),
    thirtyDayStart: now - 29 * 86_400_000,
  };
}
