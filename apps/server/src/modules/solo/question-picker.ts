import { Inject, Injectable } from '@nestjs/common';
import {
  selectQuestions,
  type CandidateQuestion,
  type DifficultyBand,
  type GrowthConfig,
  type Rng,
} from '@zuirock/game-rules';
import type { OwnerRef, TopicId } from '@zuirock/shared';
import { ApiError } from '../../common/api-error.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { ownerWhere } from '../../common/owner.js';
import { PrismaService } from '../../common/prisma.service.js';

export const SOLO_RNG = Symbol('SoloRng');

const candidateSelect = { id: true, topicId: true, subfieldId: true, type: true, difficulty: true } as const;

/** Published-only question selection for solo sets (AC-C3, AC-S2, AC-S6, D6-7). */
@Injectable()
export class QuestionPicker {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
    @Inject(SOLO_RNG) private readonly rng: Rng,
  ) {}

  async pool(where: { topicId?: string; subfieldId?: string }): Promise<CandidateQuestion[]> {
    const rows = await this.prisma.question.findMany({ where: { status: 'published', ...where }, select: candidateSelect });
    return rows.map((q) => ({ ...q, topicId: q.topicId as TopicId }));
  }

  async correctlyAnswered(owner: OwnerRef, topicId?: string): Promise<string[]> {
    const rows = await this.prisma.solveLog.findMany({
      where: { ...ownerWhere(owner), correct: true, ...(topicId ? { question: { topicId } } : {}) },
      select: { questionId: true },
      distinct: ['questionId'],
    });
    return rows.map((r) => r.questionId);
  }

  /** Open wrong-note questions that are still published (members only). */
  async reviewPool(owner: OwnerRef): Promise<CandidateQuestion[]> {
    if (owner.kind !== 'user') return [];
    const rows = await this.prisma.wrongNote.findMany({
      where: { userId: owner.userId, status: 'open', question: { status: 'published' } },
      select: { question: { select: candidateSelect } },
    });
    return rows.map((r) => ({ ...r.question, topicId: r.question.topicId as TopicId }));
  }

  /**
   * Stage / basic test (10/28): `count` questions from a fixed pool — not yet answered correctly
   * first, then already-correct ones, random within each group — served easy → hard.
   * 409 SOLO_SHORTAGE when the pool is too small.
   */
  async fromPool(owner: OwnerRef, topicId: string, poolIds: readonly string[], count: number, excludeIds: readonly string[] = []): Promise<string[]> {
    if (count <= 0) return [];
    const excluded = new Set(excludeIds);
    const difficulty = new Map((await this.pool({ topicId })).map((q) => [q.id, q.difficulty]));
    const ids = poolIds.filter((id) => !excluded.has(id) && difficulty.has(id));
    if (ids.length < count) {
      throw new ApiError(409, 'SOLO_SHORTAGE', '아직 풀 수 있는 문제가 부족해요', { available: ids.length, requested: count });
    }
    const correct = new Set(await this.correctlyAnswered(owner, topicId));
    const keyed = ids.map((id) => ({ id, k: (correct.has(id) ? 1 : 0) + this.rng() }));
    const picked = keyed.sort((a, b) => a.k - b.k).slice(0, count);
    // Served easy → hard, like the other solo sets.
    return picked.sort((a, b) => difficulty.get(a.id)! - difficulty.get(b.id)!).map((x) => x.id);
  }

  /** `count` questions in a difficulty band (composite, 3분 지식, quest, diagnostic); 409 SOLO_SHORTAGE when blocked (D6-7). */
  async forBand(
    owner: OwnerRef,
    where: { topicId?: string; subfieldId?: string },
    band: DifficultyBand,
    count: number,
    excludeIds: readonly string[] = [],
  ): Promise<string[]> {
    if (count <= 0) return [];
    const result = selectQuestions(
      {
        mode: 'solo',
        pool: await this.pool(where),
        count,
        band,
        answeredCorrectlyIds: await this.correctlyAnswered(owner, where.topicId),
        reviewPool: [],
        reviewMax: 0,
        excludeIds,
      },
      this.rng,
      this.cfg,
    );
    if (result.status !== 'ok') {
      throw new ApiError(409, 'SOLO_SHORTAGE', '아직 풀 수 있는 문제가 부족해요', {
        available: result.status === 'blocked' ? result.available : 0,
        requested: count,
      });
    }
    return result.questionIds;
  }

  /** Up to `max` random open wrong-note questions (AC-S6); picked before the main questions so they never collide. */
  async pickReviews(owner: OwnerRef, max: number): Promise<string[]> {
    const pool = (await this.reviewPool(owner)).map((q) => q.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool.slice(0, max);
  }

  /** Inserts review questions into the main order at random positions. */
  mix(main: readonly string[], reviewIds: readonly string[]): string[] {
    const out = [...main];
    for (const id of reviewIds) out.splice(Math.floor(this.rng() * (out.length + 1)), 0, id);
    return out;
  }

  /** Placement: one unserved question nearest to `difficulty`, unanswered ones first. */
  async placementQuestion(owner: OwnerRef, topicId: string, difficulty: number, excludeIds: readonly string[]): Promise<string> {
    const excluded = new Set(excludeIds);
    const pool = (await this.pool({ topicId })).filter((q) => !excluded.has(q.id));
    if (!pool.length) throw new ApiError(409, 'SOLO_SHORTAGE', '아직 풀 수 있는 문제가 부족해요');
    const correct = new Set(await this.correctlyAnswered(owner, topicId));
    const scored = pool.map((q) => ({ id: q.id, s: Math.abs(q.difficulty - difficulty) * 10 + (correct.has(q.id) ? 1 : 0) + this.rng() * 0.1 }));
    return scored.reduce((best, q) => (q.s < best.s ? q : best)).id;
  }
}
