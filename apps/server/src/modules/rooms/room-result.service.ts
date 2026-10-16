import { Inject, Injectable, Optional } from '@nestjs/common';
import type { BattleResultYouDto, OwnerRef, XpResultDto } from '@zuirock/shared';
import { computeXpGrant, toKstDay } from '@zuirock/game-rules';
import {
  SOLVE_LOG_WRITER,
  STREAK_PORT,
  WRONG_NOTE_PORT,
  XP_GRANT_PORT,
  type SolveLogInput,
  type SolveLogWriter,
  type StreakPort,
  type WrongNotePort,
  type XpGrantItem,
  type XpGrantPort,
} from '../../ports/index.js';
import type { RoomQuestion } from './question-pool.js';
import { ROOM_RESULT_REPOSITORY, type BattleResultInput, type RoomResultRepository } from './room-result.repository.js';
import type { RoomState, Seat } from './room-state.js';
import { ROOM_CLOCK, ROOM_CONFIG, type RoomConfig } from './rooms.tokens.js';
import type { Clock } from './clock.js';

function ownerOf(seat: Seat): OwnerRef {
  return seat.kind === 'user' ? { kind: 'user', userId: seat.userId! } : { kind: 'guest', guestId: seat.guestId! };
}

/**
 * Records a finished battle (AC-M10): BattleResult, SolveLog, XP, wrong notes and streak in ONE
 * transaction. Re-running for the same session is safe: every write is idempotent on
 * (roomSessionId, participantId) / (battleResultId, questionId) / (battle, battleResultId, userId).
 */
@Injectable()
export class RoomResultService {
  constructor(
    @Inject(ROOM_RESULT_REPOSITORY) private readonly repo: RoomResultRepository,
    @Inject(ROOM_CLOCK) private readonly clock: Clock,
    @Inject(ROOM_CONFIG) private readonly cfg: RoomConfig,
    @Optional() @Inject(XP_GRANT_PORT) private readonly xp?: XpGrantPort,
    @Optional() @Inject(SOLVE_LOG_WRITER) private readonly solveLogs?: SolveLogWriter,
    @Optional() @Inject(WRONG_NOTE_PORT) private readonly wrongNotes?: WrongNotePort,
    @Optional() @Inject(STREAK_PORT) private readonly streak?: StreakPort,
  ) {}

  async record(state: RoomState, questions: readonly RoomQuestion[]): Promise<Record<string, BattleResultYouDto>> {
    const { xp, solveLogs, wrongNotes, streak } = this;
    if (!xp || !solveLogs || !wrongNotes || !streak) throw new Error('rooms: result ports are not bound');
    const session = state.session;
    const results = state.results;
    if (!session || !results) throw new Error('rooms: no finished session to record');

    const endedAtMs = session.nextAt ?? this.clock.now();
    const endedAt = new Date(endedAtMs);
    const kstDay = toKstDay(endedAtMs);
    const rematch = await this.repo.hasBattleSince(
      session.memberKey,
      new Date(endedAtMs - this.cfg.xp.rematch.windowMs),
      session.sessionId,
    );
    const rowByPid = new Map(results.map((r) => [r.participantId, r]));
    const seats = state.seats.filter((s) => rowByPid.has(s.participantId));

    return this.repo.transaction(async (tx) => {
      const rows: BattleResultInput[] = seats.map((seat) => {
        const r = rowByPid.get(seat.participantId)!;
        return {
          roomSessionId: session.sessionId,
          participantId: seat.participantId,
          owner: ownerOf(seat),
          nickname: seat.nickname,
          rank: r.rank,
          score: r.score,
          correctCount: r.correctCount,
          totalResponseMs: r.totalResponseMs,
          participantCount: seats.length,
          left: seat.left,
          memberKey: session.memberKey,
          rematch,
          endedAt,
          kstDay,
        };
      });
      const { ids: resultIds, created } = await this.repo.writeBattleResults(tx, rows);

      const logs: SolveLogInput[] = [];
      const you: Record<string, BattleResultYouDto> = {};
      for (const seat of seats) {
        const owner = ownerOf(seat);
        const battleResultId = resultIds.get(seat.participantId)!;
        const items: XpGrantItem[] = [];
        const wrong: Array<{ questionId: string; correct: boolean; isReview: boolean; at: Date }> = [];
        session.questionIds.forEach((questionId, i) => {
          const q = questions[i];
          const a = session.answers[i]?.[seat.participantId];
          const answeredAt = new Date(a?.answeredAt ?? endedAtMs);
          const chosung = q?.public.type === 'chosung';
          const submitted = a !== undefined && (a.submitted || a.attempts > 0 || a.gaveUp);
          logs.push({
            owner,
            questionId,
            mode: 'battle',
            correct: a?.correct ?? false,
            submitted,
            responseMs: a?.responseMs ?? 0,
            beforeReveal: chosung ? (a?.beforeReveal ?? null) : null,
            hintUsed: chosung && a?.correct === true && a.beforeReveal === false,
            attempts: a?.attempts ?? 0,
            isReview: false,
            answeredAt,
            battleResultId,
          });
          if (submitted) {
            items.push({
              questionId,
              correct: a.correct,
              noHint: chosung && a.correct && a.beforeReveal === true,
              isReview: false,
              answeredAt,
            });
            wrong.push({ questionId, correct: a.correct, isReview: false, at: answeredAt });
          }
        });

        const rank = rowByPid.get(seat.participantId)!.rank;
        const entries = await xp.grant(tx, {
          ownerId: owner,
          source: { type: 'battle', id: battleResultId },
          items,
          kstDay,
          context: { kind: 'battle', rank, rematch },
        });
        // Wrong notes count occurrences, so they are written only together with a new BattleResult row.
        if (created.has(seat.participantId)) await wrongNotes.recordResults(tx, owner, wrong);
        if (!seat.left) await streak.markActivity(tx, owner, kstDay, 'battle');

        const xpDto: XpResultDto =
          seat.kind === 'user'
            ? {
                granted: entries.reduce((n, e) => n + e.amount, 0),
                preCapTotal: entries.reduce((n, e) => n + e.preCapAmount, 0),
                capReached: entries.some((e) => e.capReached),
              }
            : {
                granted: 0,
                preCapTotal: 0,
                capReached: false,
                ineligibleReason: 'GUEST',
                guestPreviewMax: this.guestPreview(items, questions, session.questionIds, rank, rematch),
              };
        you[seat.participantId] = {
          participantId: seat.participantId,
          xp: xpDto,
          wrongNotesAdded: seat.kind === 'user' ? wrong.filter((w) => !w.correct).length : 0,
          canSaveByLogin: seat.kind === 'guest',
        };
      }
      await solveLogs.writeMany(tx, logs);
      await this.repo.endSession(tx, session.sessionId, endedAt);
      return you;
    });
  }

  /** "최대 N XP" for guests (D6-6): what a member would get with no weak-topic/decay data. */
  private guestPreview(
    items: readonly XpGrantItem[],
    questions: readonly RoomQuestion[],
    questionIds: readonly string[],
    rank: number,
    rematch: boolean,
  ): number {
    const byId = new Map(questionIds.map((id, i) => [id, questions[i]]));
    return computeXpGrant(
      {
        context: { kind: 'battle', rank, rematch },
        grantedTodayBefore: 0,
        items: items.map((it) => {
          const q = byId.get(it.questionId);
          return {
            questionId: it.questionId,
            difficulty: q?.public.difficulty ?? 1,
            questionType: q?.public.type ?? 'mcq',
            correct: it.correct,
            noHint: it.noHint,
            weakTopic: false,
            reviewCompleted: false,
            priorSolvesInWindow: 0,
          };
        }),
      },
      this.cfg,
    ).preCapTotal;
  }
}
