import type { QuestionType, RoomSettings, TopicId } from '@zuirock/shared';
import { DEFAULT_CONFIG, type GrowthConfig } from './config/defaults.js';

/** D6-7: how far the band is widened when unanswered and reused questions run out. */
const WIDEN = 0.5;
import type { DifficultyBand } from './stage.js';
import type { Rng } from './types.js';

/** A servable question (caller passes only `published` ones, AC-C3). */
export interface CandidateQuestion {
  id: string;
  topicId: TopicId;
  subfieldId: string;
  type: QuestionType;
  difficulty: number;
}

export interface BattleSelectionRequest {
  mode: 'battle';
  pool: readonly CandidateQuestion[];
  settings: Pick<RoomSettings, 'topicIds' | 'types' | 'minDifficulty' | 'questionCount'>;
  /** Rematch: questions of the previous battle in this room, used only if nothing else fits. */
  avoidIds?: readonly string[];
  /**
   * 최근 푼 문제 덜 나오게: questionId → how many participants solved it recently. Such questions are
   * drawn with weight `cfg.room.recentSolved.weight ^ count` instead of 1 (still eligible, so no shortage).
   */
  recentSolveCounts?: Readonly<Record<string, number>>;
}

export interface SoloSelectionRequest {
  mode: 'solo';
  pool: readonly CandidateQuestion[];
  /** Questions to serve, excluding review questions. */
  count: number;
  band: DifficultyBand;
  /** Questions the owner already answered correctly; served only after unanswered ones. */
  answeredCorrectlyIds: readonly string[];
  /** Open wrong-note questions eligible for review. */
  reviewPool: readonly CandidateQuestion[];
  /** Max review questions mixed in (2, AC-S6). */
  reviewMax: number;
  /** Never serve these (e.g. questions already in this set). */
  excludeIds?: readonly string[];
}

export type SelectionResult =
  | {
      status: 'ok';
      /** Final serving order (review questions included at random positions). */
      questionIds: string[];
      reviewIds: string[];
      /** D6-7 fallback used: none, reused already-correct questions, or widened the band ±0.5★. */
      relaxation: 'none' | 'reused' | 'widened';
    }
  /** Battle only (AC-M2): fewer than requested match; `questionIds` holds all M. Room is not blocked. */
  | { status: 'shortage'; available: number; requested: number; questionIds: string[] }
  /** Solo only (D6-7): even after reuse and ±0.5★ there are not enough. */
  | { status: 'blocked'; available: number; requested: number };

/**
 * Question selection.
 * Battle (AC-M1): random among questions matching topics ∩ types ∩ difficulty ≥ min, no duplicates,
 * one order shared by all participants; prefers questions not in `avoidIds`.
 * Solo (AC-S2, AC-S6, D6-7): difficulty drawn by band weights, unanswered first, then
 * already-correct (reused), then band ±0.5★ (widened), else blocked; plus ≤ reviewMax reviews.
 */
export function selectQuestions(
  req: BattleSelectionRequest | SoloSelectionRequest,
  rng: Rng,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): SelectionResult {
  return req.mode === 'battle' ? selectBattle(req, rng, cfg) : selectSolo(req, rng);
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function uniqueById(qs: readonly CandidateQuestion[]): CandidateQuestion[] {
  const seen = new Set<string>();
  return qs.filter((q) => !seen.has(q.id) && (seen.add(q.id), true));
}

/**
 * Weighted random order without replacement (Efraimidis–Spirakis): key = u^(1/w), highest first.
 * With every weight 1 this is a uniform shuffle.
 */
function weightedOrder<T>(items: readonly T[], weightOf: (t: T) => number, rng: Rng): T[] {
  return items
    .map((item) => ({ item, key: Math.pow(rng(), 1 / Math.max(weightOf(item), 1e-6)) }))
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item);
}

function selectBattle(req: BattleSelectionRequest, rng: Rng, cfg: GrowthConfig): SelectionResult {
  const { topicIds, types, minDifficulty, questionCount } = req.settings;
  const avoid = new Set(req.avoidIds ?? []);
  const matching = uniqueById(
    req.pool.filter((q) => topicIds.includes(q.topicId) && types.includes(q.type) && q.difficulty >= minDifficulty),
  );
  const recent = req.recentSolveCounts;
  const notPrevious = matching.filter((q) => !avoid.has(q.id));
  const fresh = recent
    ? weightedOrder(notPrevious, (q) => Math.pow(cfg.room.recentSolved.weight, recent[q.id] ?? 0), rng)
    : shuffle(notPrevious, rng);
  const reused = shuffle(matching.filter((q) => avoid.has(q.id)), rng);
  const ordered = [...fresh, ...reused].map((q) => q.id);
  if (ordered.length < questionCount) {
    return { status: 'shortage', available: ordered.length, requested: questionCount, questionIds: ordered };
  }
  return {
    status: 'ok',
    questionIds: ordered.slice(0, questionCount),
    reviewIds: [],
    relaxation: fresh.length < questionCount ? 'reused' : 'none',
  };
}

/** Draws up to `n` questions, picking a difficulty by band weight among those still available. */
function drawWeighted(
  candidates: readonly CandidateQuestion[],
  n: number,
  weights: DifficultyBand['weights'],
  rng: Rng,
): CandidateQuestion[] {
  const byDifficulty = new Map<number, CandidateQuestion[]>();
  for (const q of shuffle(candidates, rng)) {
    const list = byDifficulty.get(q.difficulty);
    if (list) list.push(q);
    else byDifficulty.set(q.difficulty, [q]);
  }
  const weightOf = (d: number) => weights.find((w) => w.difficulty === d)?.weight ?? 0;
  const out: CandidateQuestion[] = [];
  while (out.length < n && byDifficulty.size > 0) {
    const options = [...byDifficulty.keys()].sort((a, b) => a - b);
    const total = options.reduce((a, d) => a + weightOf(d), 0);
    let pick = options[0]!;
    if (total > 0) {
      let r = rng() * total;
      for (const d of options) {
        pick = d;
        r -= weightOf(d);
        if (r < 0) break;
      }
    } else {
      pick = options[Math.floor(rng() * options.length)]!;
    }
    const list = byDifficulty.get(pick)!;
    out.push(list.pop()!);
    if (list.length === 0) byDifficulty.delete(pick);
  }
  return out;
}

function selectSolo(req: SoloSelectionRequest, rng: Rng): SelectionResult {
  const { band, count } = req;
  const excluded = new Set(req.excludeIds ?? []);
  const correct = new Set(req.answeredCorrectlyIds);
  const pool = uniqueById(req.pool.filter((q) => !excluded.has(q.id)));
  const inBand = (q: CandidateQuestion, pad: number) =>
    q.difficulty >= band.minDifficulty - pad && q.difficulty <= band.maxDifficulty + pad;
  const unanswered = pool.filter((q) => inBand(q, 0) && !correct.has(q.id));
  const answered = pool.filter((q) => inBand(q, 0) && correct.has(q.id));
  const widened = pool.filter((q) => inBand(q, WIDEN) && !inBand(q, 0));
  const widenedOrdered = [...widened.filter((q) => !correct.has(q.id)), ...widened.filter((q) => correct.has(q.id))];

  const available = unanswered.length + answered.length + widened.length;
  if (available < count) return { status: 'blocked', available, requested: count };

  const chosen = drawWeighted(unanswered, count, band.weights, rng);
  let relaxation: 'none' | 'reused' | 'widened' = 'none';
  if (chosen.length < count) {
    relaxation = 'reused';
    chosen.push(...drawWeighted(answered, count - chosen.length, band.weights, rng));
  }
  if (chosen.length < count) {
    relaxation = 'widened';
    const unansweredWide = shuffle(widenedOrdered.filter((q) => !correct.has(q.id)), rng);
    const answeredWide = shuffle(widenedOrdered.filter((q) => correct.has(q.id)), rng);
    chosen.push(...[...unansweredWide, ...answeredWide].slice(0, count - chosen.length));
  }
  // Ramp: easier questions first inside the set (random order within one difficulty).
  const main = chosen
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.difficulty - b.q.difficulty || a.i - b.i)
    .map(({ q }) => q.id);

  const used = new Set([...main, ...excluded]);
  const reviewIds = shuffle(uniqueById(req.reviewPool.filter((q) => !used.has(q.id))), rng)
    .slice(0, Math.max(0, req.reviewMax))
    .map((q) => q.id);
  const questionIds = [...main];
  for (const id of reviewIds) questionIds.splice(Math.floor(rng() * (questionIds.length + 1)), 0, id);
  return { status: 'ok', questionIds, reviewIds, relaxation };
}

export interface TopicWrongRate {
  topicId: TopicId;
  /** 0–1 over the last 30 days; 0 when no solves. */
  wrongRate: number;
  solved: number;
}

export interface CompositeAllocation {
  topicId: TopicId;
  count: number;
  /** One of the top-2 weak topics. */
  weak: boolean;
}

/**
 * Composite set allocation (AC-S7, D6-10 (c)) over the user's topics, total 10:
 * - ≥ 4 topics: top 2 by wrong rate share 5 questions, the rest share 5; inside each group
 *   proportional to wrong rate.
 * - ≤ 3 topics: all 10 proportional to wrong rate.
 * Integer counts by largest remainder; ties go to the higher wrong rate (then topic order);
 * a group whose wrong rates are all 0 splits evenly. Counts always sum to `total`.
 * Seed check: science 2 → 3 after the E2E battle (7 wrong: 2.56, 10 wrong: 2.86).
 */
export function allocateComposite(
  topics: readonly TopicWrongRate[],
  total: number = DEFAULT_CONFIG.composite.size,
  cfg: GrowthConfig = DEFAULT_CONFIG,
): CompositeAllocation[] {
  if (topics.length === 0) return [];
  const indexed = topics.map((t, order) => ({ ...t, order }));
  const ranked = [...indexed].sort((a, b) => b.wrongRate - a.wrongRate || a.order - b.order);
  const c = cfg.composite;
  const counts = new Map<number, number>();
  const weak = new Set(ranked.slice(0, c.weakTopicCount).map((t) => t.order));
  if (topics.length <= c.proportionalWhenTopicsAtMost) {
    largestRemainder(ranked, total, counts);
  } else {
    const weakTotal = Math.round(total * c.weakShare);
    largestRemainder(ranked.slice(0, c.weakTopicCount), weakTotal, counts);
    largestRemainder(ranked.slice(c.weakTopicCount), total - weakTotal, counts);
  }
  return indexed.map((t) => ({ topicId: t.topicId, count: counts.get(t.order) ?? 0, weak: weak.has(t.order) }));
}

/** Splits `n` across `group` in proportion to wrong rate (even when all are 0), largest remainder. */
function largestRemainder(
  group: ReadonlyArray<TopicWrongRate & { order: number }>,
  n: number,
  out: Map<number, number>,
): void {
  if (group.length === 0) return;
  const sum = group.reduce((a, t) => a + Math.max(0, t.wrongRate), 0);
  const quotas = group.map((t) => ({ t, q: sum > 0 ? (n * Math.max(0, t.wrongRate)) / sum : n / group.length }));
  let left = n;
  for (const { t, q } of quotas) {
    const base = Math.floor(q + 1e-9);
    out.set(t.order, base);
    left -= base;
  }
  const byRemainder = [...quotas].sort((a, b) => {
    const ra = a.q - Math.floor(a.q + 1e-9);
    const rb = b.q - Math.floor(b.q + 1e-9);
    return Math.abs(ra - rb) > 1e-9 ? rb - ra : b.t.wrongRate - a.t.wrongRate || a.t.order - b.t.order;
  });
  for (let i = 0; i < left; i++) {
    const { t } = byRemainder[i % byRemainder.length]!;
    out.set(t.order, (out.get(t.order) ?? 0) + 1);
  }
}
