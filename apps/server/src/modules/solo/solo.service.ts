import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, SetAttempt } from '@prisma/client';
import {
  accountLevel,
  allocateComposite,
  basicTestPass,
  computeXpGrant,
  judgeChosung,
  judgeStage,
  kstWeekStart,
  normalize,
  placementNext,
  placementResult,
  toChosung,
  toKstDay,
  type GrowthConfig,
} from '@zuirock/game-rules';
import type {
  CompositePlanDto,
  ConfirmStartLevelRequest,
  DailySetStatusDto,
  OwnerRef,
  PlacementNextDto,
  SetKind,
  SetResultDto,
  SetSessionDto,
  SoloGiveUpResponse,
  SoloHintResponse,
  SoloSubmitRequest,
  SoloSubmitResponse,
  StartSetRequest,
  TopicId,
  TopicProgressDto,
  XpResultDto,
} from '@zuirock/shared';
import { SET_KINDS, TOPIC_IDS } from '@zuirock/shared';
import { lockAll } from '../../common/advisory-lock.js';
import { badRequest, conflict, forbidden, notFound } from '../../common/api-error.js';
import { CLOCK, type Clock } from '../../common/clock.js';
import { GROWTH_CONFIG } from '../../common/growth-config.js';
import { dayToDate } from '../../common/kst-date.js';
import { ownerWhere } from '../../common/owner.js';
import { PrismaService } from '../../common/prisma.service.js';
import { toPublicQuestion, toRevealDto } from '../../common/question-dto.js';
import { RedisService } from '../../common/redis.service.js';
import { withTxRetry } from '../../common/tx-retry.js';
import type { Tx } from '../../ports/tx.js';
import { PrismaSolveLogWriter } from '../growth/solve-log.writer.js';
import { StreakService } from '../growth/streak.service.js';
import { loadTopicWrongRates } from '../growth/weak-topics.js';
import { WrongNotesService } from '../growth/wrong-notes.service.js';
import { XpService } from '../growth/xp.service.js';
import { EconomyService } from '../economy/economy.service.js';
import { LearningReportsService } from '../learning-reports/learning-reports.service.js';
import { QuestionPicker } from './question-picker.js';

/** Per-question chosung retry state while a set is open (attempts, hint opened). */
const PENDING_PREFIX = 'lb:solo:pending:';
const PENDING_TTL_SEC = 2 * 86_400;
const XP_KINDS = ['stage', 'composite', 'daily', 'quest'] as const;
type XpKind = (typeof XP_KINDS)[number];

const isTopic = (t: unknown): t is TopicId => typeof t === 'string' && (TOPIC_IDS as readonly string[]).includes(t);

/**
 * Solo sets (spec 솔로 학습): stage, basic test, placement, composite, daily (3분 지식), quest,
 * diagnostic. No timer; every final answer is a SolveLog; completion judges, grants XP, counts the
 * streak and updates wrong notes in one transaction. Topic level moves only through stages.
 */
@Injectable()
export class SoloService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly picker: QuestionPicker,
    private readonly logs: PrismaSolveLogWriter,
    private readonly xp: XpService,
    private readonly streak: StreakService,
    private readonly wrongNotes: WrongNotesService,
    private readonly reports: LearningReportsService,
    private readonly economy: EconomyService,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(GROWTH_CONFIG) private readonly cfg: GrowthConfig,
  ) {}

  private async r(): Promise<RedisService> {
    if (this.redis.status === 'wait') await this.redis.connect();
    return this.redis;
  }

  // ---------- progress ----------

  /** Highest cleared stage: TopicProgress for members, passed stage rows (incl. skips) for guests. */
  async highestCleared(db: Tx, owner: OwnerRef, topicId: string): Promise<number> {
    if (owner.kind === 'user') {
      const p = await db.topicProgress.findUnique({ where: { userId_topicId: { userId: owner.userId, topicId } } });
      return p?.highestClearedStage ?? 0;
    }
    const best = await db.setAttempt.aggregate({
      where: { guestId: owner.guestId, kind: 'stage', topicId, passed: true },
      _max: { level: true },
    });
    return best._max.level ?? 0;
  }

  private levelOf(highest: number): number {
    return Math.min(highest + 1, this.cfg.stage.maxLevel);
  }

  /** Raises the cleared stage (never lowers); members also mark the topic started. */
  private async raiseProgress(tx: Tx, owner: OwnerRef, topicId: string, highest: number, skipRow: boolean): Promise<void> {
    if (skipRow && highest > 0) {
      // Skipped stages count as cleared with no XP (AC-S4); one row at the top level is enough to derive it.
      await tx.setAttempt.create({
        data: {
          ...ownerWhere(owner),
          kind: 'stage',
          status: 'completed',
          topicId,
          level: highest,
          passed: true,
          skipped: true,
          completedAt: new Date(this.clock.now()),
          kstDay: dayToDate(toKstDay(this.clock.now())),
        },
      });
    }
    if (owner.kind !== 'user') return;
    const cur = await tx.topicProgress.findUnique({ where: { userId_topicId: { userId: owner.userId, topicId } } });
    const next = Math.max(cur?.highestClearedStage ?? 0, highest);
    const completed = next >= this.cfg.stage.maxLevel;
    await tx.topicProgress.upsert({
      where: { userId_topicId: { userId: owner.userId, topicId } },
      create: { userId: owner.userId, topicId, highestClearedStage: next, completed, started: true },
      update: { highestClearedStage: next, completed, started: true },
    });
  }

  private async userTopics(owner: OwnerRef): Promise<TopicId[]> {
    if (owner.kind === 'user') {
      const rows = await this.prisma.userTopic.findMany({ where: { userId: owner.userId }, orderBy: { addedAt: 'asc' } });
      if (rows.length) return rows.map((r) => r.topicId as TopicId);
    }
    const counts = await this.prisma.question.groupBy({ by: ['topicId'], where: { status: 'published' }, _count: { _all: true } });
    return counts.map((c) => c.topicId).filter(isTopic);
  }

  // ---------- start ----------

  async start(owner: OwnerRef, req: StartSetRequest, idempotencyKey?: string): Promise<SetSessionDto> {
    if (idempotencyKey) {
      const existing = await this.prisma.setAttempt.findUnique({ where: { idempotencyKey } });
      if (existing) return this.session(this.ensureOwner(existing, owner));
    }
    if (!(SET_KINDS as readonly string[]).includes(req?.kind)) throw badRequest('BAD_SET_KIND', '세트 종류가 올바르지 않아요');
    const kind = req.kind as SetKind;
    const now = this.clock.now();
    const today = toKstDay(now);
    let topicId: string | null = null;
    let level: number | null = null;
    let subfieldId: string | null = null;
    let main: string[] = [];
    // Review questions first (excluded from the main draw); test-like sets get none.
    const reviewIds = ['stage', 'composite', 'daily', 'quest'].includes(kind) ? await this.picker.pickReviews(owner, this.cfg.stage.reviewMaxPerSet) : [];

    switch (kind) {
      case 'stage': {
        if (!isTopic(req.topicId)) throw badRequest('BAD_TOPIC', '주제를 골라 주세요');
        topicId = req.topicId;
        level = this.levelOf(await this.highestCleared(this.prisma, owner, topicId));
        main = await this.picker.forLevel(owner, { topicId }, level, this.cfg.stage.size - reviewIds.length, reviewIds);
        break;
      }
      case 'basic_test': {
        if (!isTopic(req.topicId)) throw badRequest('BAD_TOPIC', '주제를 골라 주세요');
        if (!this.cfg.basicTest.checkpoints.includes(req.checkpointLevel ?? -1)) throw badRequest('BAD_CHECKPOINT', '체크포인트가 올바르지 않아요');
        topicId = req.topicId;
        level = req.checkpointLevel!;
        main = await this.picker.forLevel(owner, { topicId }, level, this.cfg.basicTest.size);
        break;
      }
      case 'placement': {
        if (!isTopic(req.topicId)) throw badRequest('BAD_TOPIC', '주제를 골라 주세요');
        topicId = req.topicId;
        break;
      }
      case 'composite':
      case 'daily': {
        if (kind === 'daily') {
          const open = await this.prisma.setAttempt.findFirst({
            where: { ...ownerWhere(owner), kind: 'daily', status: 'in_progress', kstDay: dayToDate(today) },
          });
          if (open) return this.session(open);
        }
        main = await this.compositeQuestions(owner, (kind === 'daily' ? this.cfg.daily.size : this.cfg.composite.size) - reviewIds.length, reviewIds);
        break;
      }
      case 'quest': {
        if (owner.kind !== 'user') throw forbidden('MEMBER_REQUIRED', '회원만 퀘스트를 할 수 있어요');
        const weakness = await this.reports.weakness(owner.userId);
        const target = weakness.weaknesses.find((w) => w.subfieldId === req.subfieldId);
        if (!target) throw badRequest('NOT_A_WEAKNESS', '이번 주 약점 분야가 아니에요');
        subfieldId = target.subfieldId;
        topicId = target.topicId;
        const lvl = this.levelOf(await this.highestCleared(this.prisma, owner, topicId));
        main = await this.picker.forLevel(owner, { subfieldId }, lvl, this.cfg.quest.size - reviewIds.length, reviewIds);
        break;
      }
      case 'diagnostic': {
        for (const t of await this.userTopics(owner)) {
          const lvl = this.levelOf(await this.highestCleared(this.prisma, owner, t));
          main.push(...(await this.picker.forLevel(owner, { topicId: t }, lvl, this.cfg.diagnostic.perTopic, main)));
        }
        break;
      }
    }

    const questionIds = this.picker.mix(main, reviewIds);
    try {
      const set = await this.prisma.setAttempt.create({
        data: {
          ...ownerWhere(owner),
          kind,
          topicId,
          level,
          subfieldId,
          questionIds,
          reviewQuestionIds: reviewIds,
          totalCount: questionIds.length,
          kstDay: dayToDate(today),
          weekStart: kind === 'quest' ? dayToDate(kstWeekStart(today)) : null,
          idempotencyKey: idempotencyKey ?? null,
          startedAt: new Date(now),
        },
      });
      return this.session(set);
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002' && idempotencyKey) {
        return this.session(this.ensureOwner(await this.prisma.setAttempt.findUniqueOrThrow({ where: { idempotencyKey } }), owner));
      }
      throw error;
    }
  }

  /** D6-10 (c) allocation over the owner's topics, each topic at its own level band. */
  private async compositeQuestions(owner: OwnerRef, total: number, excludeIds: readonly string[]): Promise<string[]> {
    const topics = await this.userTopics(owner);
    if (!topics.length) throw conflict('NO_TOPICS', '먼저 주제를 골라 주세요');
    const rates =
      owner.kind === 'user'
        ? (await loadTopicWrongRates(this.prisma, owner.userId, this.clock.now(), this.cfg, topics)).rates
        : topics.map((topicId) => ({ topicId, wrongRate: 0, solved: 0 }));
    const out: string[] = [];
    for (const a of allocateComposite(rates, total, this.cfg)) {
      if (!a.count) continue;
      const lvl = this.levelOf(await this.highestCleared(this.prisma, owner, a.topicId));
      out.push(...(await this.picker.forLevel(owner, { topicId: a.topicId }, lvl, a.count, [...excludeIds, ...out])));
    }
    return out;
  }

  async compositePlan(userId: string): Promise<CompositePlanDto> {
    const topics = await this.userTopics({ kind: 'user', userId });
    const { rates } = await loadTopicWrongRates(this.prisma, userId, this.clock.now(), this.cfg, topics);
    const alloc = allocateComposite(rates, this.cfg.composite.size, this.cfg);
    return {
      allocation: alloc.map((a) => ({ ...a, wrongRate: rates.find((r) => r.topicId === a.topicId)?.wrongRate ?? 0 })),
      total: alloc.reduce((s, a) => s + a.count, 0),
    };
  }

  async dailyStatus(owner: OwnerRef): Promise<DailySetStatusDto> {
    const kstDay = toKstDay(this.clock.now());
    const done = await this.prisma.setAttempt.count({ where: { ...ownerWhere(owner), kind: 'daily', status: 'completed', kstDay: dayToDate(kstDay) } });
    const xp = owner.kind === 'user' ? await this.prisma.xpLedger.count({ where: { userId: owner.userId, sourceType: 'daily', kstDay: dayToDate(kstDay) } }) : 0;
    return { kstDay, completed: done > 0, xpGranted: xp > 0 };
  }

  private ensureOwner(set: SetAttempt, owner: OwnerRef): SetAttempt {
    const mine = owner.kind === 'user' ? set.userId === owner.userId : set.guestId === owner.guestId;
    if (!mine) throw notFound('SET_NOT_FOUND', '세트를 찾을 수 없어요');
    return set;
  }

  private async loadSet(owner: OwnerRef, id: string): Promise<SetAttempt> {
    const set = await this.prisma.setAttempt.findUnique({ where: { id } }).catch(() => null);
    if (!set) throw notFound('SET_NOT_FOUND', '세트를 찾을 수 없어요');
    return this.ensureOwner(set, owner);
  }

  private async session(set: SetAttempt): Promise<SetSessionDto> {
    const qs = await this.prisma.question.findMany({ where: { id: { in: set.questionIds } }, include: { subfield: true } });
    const byId = new Map(qs.map((q) => [q.id, q]));
    return {
      setAttemptId: set.id,
      kind: set.kind,
      topicId: (set.topicId as TopicId) ?? null,
      level: set.level,
      questions: set.kind === 'placement' ? [] : set.questionIds.flatMap((id) => (byId.has(id) ? [toPublicQuestion(byId.get(id)!)] : [])),
      reviewQuestionIds: set.reviewQuestionIds,
      xpEligible: (XP_KINDS as readonly string[]).includes(set.kind),
      startedAt: set.startedAt.toISOString(),
    };
  }

  // ---------- answers ----------

  async submit(owner: OwnerRef, setId: string, req: SoloSubmitRequest): Promise<SoloSubmitResponse> {
    return this.answer(owner, setId, req, false);
  }

  async giveUp(owner: OwnerRef, setId: string, questionId: string): Promise<SoloGiveUpResponse> {
    const res = await this.answer(owner, setId, { questionId, answer: '', responseMs: 0, hintUsed: false }, true);
    return { reveal: res.reveal! };
  }

  /** Reveals the chosung and records the hint server-side (authoritative: no no-hint bonus afterwards). */
  async hint(owner: OwnerRef, setId: string, questionId: string): Promise<SoloHintResponse> {
    const set = await this.loadSet(owner, setId);
    if (typeof questionId !== 'string' || !set.questionIds.includes(questionId)) throw badRequest('NOT_IN_SET', '이 세트의 문제가 아니에요');
    const q = await this.prisma.question.findUniqueOrThrow({ where: { id: questionId } });
    if (q.type !== 'chosung') throw badRequest('HINT_CHOSUNG_ONLY', '초성 문제만 힌트가 있어요');
    if (!set.hintedQuestionIds.includes(questionId)) {
      await this.prisma.setAttempt.update({ where: { id: set.id }, data: { hintedQuestionIds: { push: questionId } } });
    }
    return { questionId, chosung: toChosung(q.answer) };
  }

  private async answer(owner: OwnerRef, setId: string, req: SoloSubmitRequest, giveUp: boolean): Promise<SoloSubmitResponse> {
    const set = await this.loadSet(owner, setId);
    if (set.status !== 'in_progress') throw conflict('SET_CLOSED', '이미 끝난 세트예요');
    if (typeof req?.questionId !== 'string' || !set.questionIds.includes(req.questionId)) throw badRequest('NOT_IN_SET', '이 세트의 문제가 아니에요');
    const q = await this.prisma.question.findUniqueOrThrow({ where: { id: req.questionId } });
    const done = await this.prisma.solveLog.findFirst({ where: { setAttemptId: set.id, questionId: q.id } });
    if (done) throw conflict('ALREADY_ANSWERED', '이미 답한 문제예요');
    if (giveUp && q.type !== 'chosung') throw badRequest('GIVE_UP_CHOSUNG_ONLY', '초성 문제만 포기할 수 있어요');

    const key = `${PENDING_PREFIX}${set.id}:${q.id}`;
    const redis = await this.r();
    const pending = await redis.hgetall(key);
    const hintUsed = set.hintedQuestionIds.includes(q.id) || !!req.hintUsed;
    const answer = String(req.answer ?? '');

    let verdict: SoloSubmitResponse['verdict'];
    if (giveUp) verdict = 'wrong';
    else if (q.type === 'chosung') verdict = judgeChosung(answer, q.answer);
    else verdict = normalize(answer).toUpperCase() === normalize(q.answer).toUpperCase() ? 'correct' : 'wrong';

    const final = q.type !== 'chosung' || verdict === 'correct' || giveUp;
    const attempts = Number(pending.attempts ?? 0) + (giveUp ? 0 : 1);
    const responseMs = Number(pending.responseMs ?? 0) + Math.max(0, Number(req.responseMs) || 0);
    if (!final) {
      await redis.hset(key, { attempts: String(attempts), responseMs: String(responseMs) });
      await redis.expire(key, PENDING_TTL_SEC);
      return { verdict, final: false };
    }
    const correct = verdict === 'correct';
    await this.prisma.$transaction((tx) =>
      this.logs.writeMany(tx, [
        {
          owner,
          questionId: q.id,
          mode: set.kind,
          correct,
          submitted: true,
          responseMs,
          beforeReveal: q.type === 'chosung' ? correct && !hintUsed : null,
          hintUsed,
          attempts: Math.max(1, attempts),
          isReview: set.reviewQuestionIds.includes(q.id),
          answeredAt: new Date(this.clock.now()),
          setAttemptId: set.id,
        },
      ]),
    );
    await redis.del(key);
    return { verdict, final: true, reveal: toRevealDto(q) };
  }

  // ---------- placement ----------

  private async placementHistory(set: SetAttempt) {
    const logs = await this.prisma.solveLog.findMany({
      where: { setAttemptId: set.id },
      include: { question: { select: { difficulty: true } } },
      orderBy: { answeredAt: 'asc' },
    });
    return logs.map((l) => ({ difficulty: l.question.difficulty, correct: l.correct }));
  }

  async placementNext(owner: OwnerRef, setId: string): Promise<PlacementNextDto> {
    const set = await this.loadSet(owner, setId);
    if (set.kind !== 'placement') throw badRequest('NOT_PLACEMENT', '레벨테스트가 아니에요');
    const history = await this.placementHistory(set);
    const step = placementNext(history, this.cfg);
    if (step.done) {
      const r = placementResult(history, this.cfg);
      return { done: true, result: { averageDifficulty: r.averageDifficulty, recommendedLevel: r.recommendedLevel, lowerOptions: r.lowerOptions } };
    }
    let questionId = set.questionIds[history.length];
    if (!questionId) {
      questionId = await this.picker.placementQuestion(owner, set.topicId!, step.nextDifficulty, set.questionIds);
      await this.prisma.setAttempt.update({ where: { id: set.id }, data: { questionIds: { push: questionId }, totalCount: { increment: 1 } } });
    }
    const q = await this.prisma.question.findUniqueOrThrow({ where: { id: questionId }, include: { subfield: true } });
    return { done: false, index: step.index, difficulty: step.nextDifficulty, question: toPublicQuestion(q) };
  }

  /** Start level after placement (recommended or a lower option), a passed basic test, or Lv.1. */
  async confirmStart(owner: OwnerRef, topicId: string, req: ConfirmStartLevelRequest): Promise<TopicProgressDto> {
    if (!isTopic(topicId)) throw notFound('TOPIC_NOT_FOUND', '주제를 찾을 수 없어요');
    const level = Number(req?.level);
    if (!Number.isInteger(level) || level < 1 || level > this.cfg.stage.maxLevel) throw badRequest('BAD_LEVEL', '레벨이 올바르지 않아요');
    if (level > 1) {
      if (!req.setAttemptId) throw badRequest('ATTEMPT_REQUIRED', '레벨테스트나 기초 테스트 결과가 필요해요');
      const set = await this.loadSet(owner, req.setAttemptId);
      if (set.topicId !== topicId) throw badRequest('BAD_ATTEMPT', '다른 주제의 결과예요');
      if (set.kind === 'placement') {
        const r = placementResult(await this.placementHistory(set), this.cfg);
        if (![r.recommendedLevel, ...r.lowerOptions].includes(level)) throw badRequest('BAD_LEVEL', '고를 수 없는 레벨이에요');
      } else if (!(set.kind === 'basic_test' && set.passed && set.level === level)) {
        throw badRequest('BAD_ATTEMPT', '합격한 기초 테스트가 아니에요');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      const before = await this.highestCleared(tx, owner, topicId);
      await this.raiseProgress(tx, owner, topicId, Math.max(before, level - 1), level - 1 > before);
    });
    const highest = await this.highestCleared(this.prisma, owner, topicId);
    const selected = owner.kind === 'user' && !!(await this.prisma.userTopic.findUnique({ where: { userId_topicId: { userId: owner.userId, topicId } } }));
    return {
      topicId,
      level: this.levelOf(highest),
      highestClearedStage: highest,
      completed: highest >= this.cfg.stage.maxLevel,
      selected,
      started: true,
    };
  }

  // ---------- complete ----------

  async complete(owner: OwnerRef, setId: string): Promise<SetResultDto> {
    const set = await this.loadSet(owner, setId);
    if (set.status === 'completed') return this.replayResult(owner, set);
    return withTxRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const now = this.clock.now();
        const today = toKstDay(now);
        if (owner.kind === 'user') await lockAll(tx, [{ userId: owner.userId, dayKey: today }]);
        const fresh = await tx.setAttempt.findUniqueOrThrow({ where: { id: set.id } });
        if (fresh.status === 'completed') return null;
        const logs = await tx.solveLog.findMany({ where: { setAttemptId: set.id }, include: { question: { select: { type: true } } } });
        const total = fresh.questionIds.length;
        if (logs.length < (fresh.kind === 'placement' ? this.cfg.placement.questionCount : total)) {
          throw badRequest('SET_INCOMPLETE', '아직 풀지 않은 문제가 있어요');
        }
        const correctCount = logs.filter((l) => l.correct).length;
        let passed = correctCount >= this.cfg.setPass.passCorrect;
        let firstClear = false;
        let topicLevel: number | null = null;

        if (fresh.kind === 'stage') {
          const before = await this.highestCleared(tx, owner, fresh.topicId!);
          const j = judgeStage({ level: fresh.level!, correctCount, totalCount: total, highestClearedBefore: before }, this.cfg);
          passed = j.cleared;
          firstClear = j.firstClear;
          if (j.cleared) await this.raiseProgress(tx, owner, fresh.topicId!, j.highestClearedAfter, false);
          topicLevel = j.levelAfter;
        } else if (fresh.kind === 'basic_test') {
          const before = await this.highestCleared(tx, owner, fresh.topicId!);
          const r = basicTestPass({ checkpointLevel: fresh.level!, correctCount, totalCount: total, highestClearedBefore: before }, this.cfg);
          passed = r.passed;
          if (r.passed && r.highestClearedAfter > before) await this.raiseProgress(tx, owner, fresh.topicId!, r.highestClearedAfter, true);
          topicLevel = this.levelOf(Math.max(before, r.highestClearedAfter));
        } else if (fresh.kind === 'placement' || fresh.kind === 'diagnostic') {
          passed = true;
        }

        const xp = await this.grantXp(tx, owner, fresh, logs, today, passed, firstClear, correctCount, total);
        const streakCounted = total >= this.cfg.stage.size;
        if (streakCounted) await this.streak.markActivity(tx, owner, today, 'solo_set');
        await this.wrongNotes.recordResults(tx, owner, logs.map((l) => ({ questionId: l.questionId, correct: l.correct, isReview: l.isReview, at: l.answeredAt })));

        await tx.setAttempt.update({
          where: { id: fresh.id },
          data: { status: 'completed', completedAt: new Date(now), kstDay: dayToDate(today), correctCount, totalCount: total, passed, firstClear },
        });
        return {
          setAttemptId: fresh.id,
          kind: fresh.kind,
          correctCount,
          totalCount: total,
          passed,
          firstClear,
          topicLevel,
          xp,
          streakCounted,
          wrongNotesAdded: owner.kind === 'user' ? logs.filter((l) => !l.correct).length : 0,
          // Reward chest on a member's stage first clear only (same rule as the XP first clear).
          ...(fresh.kind === 'stage' && firstClear && owner.kind === 'user'
            ? { chest: await this.economy.grantStageChest(tx, owner.userId, fresh) }
            : {}),
        } satisfies SetResultDto;
      }),
    ).then(async (result) => result ?? this.replayResult(owner, await this.loadSet(owner, setId)));
  }

  private async grantXp(
    tx: Tx,
    owner: OwnerRef,
    set: SetAttempt,
    logs: Prisma.SolveLogGetPayload<{ include: { question: { select: { type: true } } } }>[],
    today: string,
    passed: boolean,
    firstClear: boolean,
    correctCount: number,
    totalCount: number,
  ): Promise<XpResultDto> {
    if (!(XP_KINDS as readonly string[]).includes(set.kind)) return { granted: 0, preCapTotal: 0, capReached: false, ineligibleReason: 'NO_XP_MODE' };
    const kind = set.kind as XpKind;
    const context = kind === 'stage' ? { kind, cleared: passed, firstClear } : { kind, correctCount, totalCount };
    const items = logs.map((l) => ({
      questionId: l.questionId,
      correct: l.correct,
      noHint: l.question.type === 'chosung' && !l.hintUsed,
      isReview: l.isReview,
      answeredAt: l.answeredAt,
    }));
    if (owner.kind === 'guest') {
      // D6-6: guests see "최대 N XP" (no decay/weak-topic data, empty cap).
      const ctx =
        kind === 'stage'
          ? { kind, cleared: passed, alreadyCleared: !firstClear }
          : kind === 'daily'
            ? { kind, correctCount, totalCount, alreadyGrantedToday: false }
            : kind === 'quest'
              ? { kind, correctCount, totalCount, alreadyGrantedThisWeek: false }
              : { kind, correctCount, totalCount };
      const difficulties = await tx.question.findMany({ where: { id: { in: logs.map((l) => l.questionId) } }, select: { id: true, difficulty: true } });
      const dmap = new Map(difficulties.map((d) => [d.id, d.difficulty]));
      const full = computeXpGrant(
        {
          context: ctx,
          items: logs.map((l, i) => ({ ...items[i]!, difficulty: dmap.get(l.questionId) ?? 0, questionType: l.question.type, weakTopic: false, reviewCompleted: false, priorSolvesInWindow: 0 })),
          grantedTodayBefore: 0,
        },
        this.cfg,
      );
      return { granted: 0, preCapTotal: 0, capReached: false, ineligibleReason: 'GUEST', guestPreviewMax: full.granted };
    }
    const { entries, result } = await this.xp.grantDetailed(tx, {
      ownerId: owner,
      source: { type: kind, id: set.id },
      items,
      kstDay: today,
      context,
    });
    const granted = entries.reduce((s, e) => s + e.amount, 0);
    const total = await tx.xpLedger.aggregate({ where: { userId: owner.userId }, _sum: { amount: true } });
    return {
      granted,
      preCapTotal: result?.preCapTotal ?? entries.reduce((s, e) => s + e.preCapAmount, 0),
      capReached: result?.capReached ?? entries.some((e) => e.capReached),
      ...(result && !result.eligible && result.ineligibleReason ? { ineligibleReason: result.ineligibleReason } : {}),
      levelAfter: accountLevel(total._sum.amount ?? 0, this.cfg),
    };
  }

  /** Same response for a repeated complete call (idempotent). */
  private async replayResult(owner: OwnerRef, set: SetAttempt): Promise<SetResultDto> {
    const ledger =
      owner.kind === 'user' && (XP_KINDS as readonly string[]).includes(set.kind)
        ? await this.prisma.xpLedger.findUnique({ where: { sourceType_sourceId_userId: { sourceType: set.kind as XpKind, sourceId: set.id, userId: owner.userId } } })
        : null;
    let topicLevel: number | null = null;
    if (set.kind === 'stage' || set.kind === 'basic_test') topicLevel = this.levelOf(await this.highestCleared(this.prisma, owner, set.topicId!));
    return {
      setAttemptId: set.id,
      kind: set.kind,
      correctCount: set.correctCount,
      totalCount: set.totalCount,
      passed: set.passed ?? false,
      firstClear: set.firstClear,
      topicLevel,
      xp: {
        granted: ledger?.amount ?? 0,
        preCapTotal: ledger?.preCapAmount ?? 0,
        capReached: (ledger?.cappedAmount ?? 0) > 0,
        ...(owner.kind === 'guest' ? { ineligibleReason: 'GUEST' as const } : {}),
      },
      streakCounted: set.totalCount >= this.cfg.stage.size,
      wrongNotesAdded: owner.kind === 'user' ? set.totalCount - set.correctCount : 0,
      ...(set.kind === 'stage' && set.firstClear ? { chest: await this.economy.chestForSet(set.id) } : {}),
    };
  }
}
