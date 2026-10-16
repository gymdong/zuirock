import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { Namespace } from 'socket.io';
import {
  dedupeNickname,
  isQuestionComplete,
  judgeChosung,
  rankPlayers,
  scoreAnswer,
  selectQuestions,
  toChosung,
  validateGuestNickname,
  validateRoomSettings,
  type Rng,
} from '@zuirock/game-rules';
import type {
  BattleResultRowDto,
  BattleResultYouDto,
  JoinRoomPayload,
  LiveQuestionDto,
  RevealDto,
  RoomErrorCode,
  RoomLookupDto,
  RoomParticipantDto,
  RoomSettings,
  RoomSnapshotDto,
  StartRoomResult,
  SubmitAnswerResult,
} from '@zuirock/shared';
import { identityKey, type RoomIdentity } from './auth-verifier.js';
import type { Clock } from './clock.js';
import { QUESTION_POOL, type QuestionPool, type RoomQuestion } from './question-pool.js';
import { ROOM_RESULT_REPOSITORY, type RoomResultRepository } from './room-result.repository.js';
import { RoomResultService } from './room-result.service.js';
import { activeSeats, type AnswerState, type RoomState, type Seat } from './room-state.js';
import { RoomStore } from './room-store.js';
import { ROOM_CLOCK, ROOM_CONFIG, ROOM_RNG, type RoomConfig } from './rooms.tokens.js';

export class RoomError extends Error {
  constructor(
    readonly code: RoomErrorCode,
    message?: string,
  ) {
    super(message ?? code);
  }
}

/** Side effects of one mutation; run only after the CAS write succeeded, and only while we own the lease. */
interface Fx {
  emits: Array<(nsp: Namespace) => void>;
  after: Array<() => Promise<void>>;
}

const RECORD_ATTEMPTS = 3;
const PENDING_MAX_ATTEMPTS = 20;
const PENDING_MAX_AGE_MS = 60 * 60 * 1000;

/** Prisma errors that will fail the same way on every retry (FK, unique, validation). */
function isRetryable(err: unknown): boolean {
  const e = err as { code?: unknown; name?: unknown };
  if (e?.code === 'P2003' || e?.code === 'P2002') return false;
  return e?.name !== 'PrismaClientValidationError';
}

/** One line: error code/name plus the last non-empty message line (Prisma puts the cause last). */
function errorSummary(err: unknown): string {
  const e = err as { code?: unknown; name?: unknown; message?: unknown };
  const lines = String(e?.message ?? err).split('\n').map((l) => l.trim()).filter(Boolean);
  return `${String(e?.code ?? e?.name ?? 'Error')}: ${(lines.at(-1) ?? '').slice(0, 200)}`;
}
/** Pending records are retried every this many recovery scans (2 s × 15 = 30 s). */
const PENDING_RETRY_SCANS = 15;

export function roomChannel(code: string): string {
  return `room:${code}`;
}

/**
 * Server-authoritative room state machine (plan §2.3(c) C1): lobby → question → reveal(3 s) → … → finished.
 * State lives in Redis behind a per-room version CAS and lease; every emit goes through `emitIfOwner`.
 * Game deadlines use the injected Clock; lease renewal and the recovery scan use real intervals.
 */
@Injectable()
export class RoomEngine implements OnApplicationBootstrap, OnModuleDestroy {
  readonly instanceId = randomUUID();
  private readonly logger = new Logger(RoomEngine.name);
  private nsp: Namespace | null = null;
  private readonly owned = new Set<string>();
  private readonly timers = new Map<string, unknown>();
  private readonly locks = new Map<string, Promise<unknown>>();
  private readonly cache = new Map<string, RoomState>();
  private readonly questionCache = new Map<string, RoomQuestion[]>();
  private renewInterval: NodeJS.Timeout | null = null;
  private scanInterval: NodeJS.Timeout | null = null;
  private shuttingDown = false;
  private readonly lastRecordAttempt = new Map<string, number>();

  constructor(
    @Inject(RoomStore) private readonly store: RoomStore,
    @Inject(QUESTION_POOL) private readonly pool: QuestionPool,
    @Inject(RoomResultService) private readonly results: RoomResultService,
    @Inject(ROOM_RESULT_REPOSITORY) private readonly repo: RoomResultRepository,
    @Inject(ROOM_CLOCK) private readonly clock: Clock,
    @Inject(ROOM_RNG) private readonly rng: Rng,
    @Inject(ROOM_CONFIG) private readonly cfg: RoomConfig,
  ) {}

  // ---------------------------------------------------------------- lifecycle

  attach(nsp: Namespace): void {
    this.nsp = nsp;
  }

  async onApplicationBootstrap(): Promise<void> {
    const r = this.cfg.room;
    this.renewInterval = setInterval(() => void this.renewLeases(), r.leaseRenewMs);
    this.scanInterval = setInterval(() => void this.recoverAll(), r.recoveryScanMs);
    await this.recoverAll();
  }

  /** SIGTERM (enableShutdownHooks): stop timers, release leases, drop sockets so clients resume elsewhere. */
  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.renewInterval) clearInterval(this.renewInterval);
    if (this.scanInterval) clearInterval(this.scanInterval);
    for (const handle of this.timers.values()) this.clock.clearTimer(handle);
    this.timers.clear();
    const codes = [...this.owned];
    this.owned.clear();
    await Promise.allSettled(codes.map((code) => this.store.releaseLease(code, this.instanceId)));
    this.nsp?.disconnectSockets(true);
    await this.store.close();
  }

  ownsRoom(code: string): boolean {
    return this.owned.has(code);
  }

  /** The only way rooms emit: an instance that lost the lease (or is shutting down) emits nothing. */
  emitIfOwner(code: string, fn: (nsp: Namespace) => void): boolean {
    if (this.shuttingDown || !this.owned.has(code) || !this.nsp) return false;
    fn(this.nsp);
    return true;
  }

  private lose(code: string): void {
    if (!this.owned.delete(code)) return;
    const handle = this.timers.get(code);
    if (handle !== undefined) this.clock.clearTimer(handle);
    this.timers.delete(code);
    this.cache.delete(code);
    this.logger.warn(`lost lease for room ${code}`);
  }

  private async renewLeases(): Promise<void> {
    for (const code of [...this.owned]) {
      try {
        if (!(await this.store.renewLease(code, this.instanceId, this.cfg.room.leaseMs))) this.lose(code);
      } catch (err) {
        this.logger.error(`lease renew ${code}: ${String(err)}`);
      }
    }
  }

  private async recoverAll(): Promise<void> {
    if (this.shuttingDown) return;
    try {
      for (const code of await this.store.listCodes()) {
        if (!this.owned.has(code)) await this.recover(code);
      }
      for (const sessionId of await this.store.listPending()) {
        const last = this.lastRecordAttempt.get(sessionId) ?? 0;
        if (Date.now() - last >= this.cfg.room.recoveryScanMs * PENDING_RETRY_SCANS) void this.attemptRecording(sessionId, RECORD_ATTEMPTS);
      }
    } catch (err) {
      this.logger.error(`recovery scan: ${String(err)}`);
    }
  }

  /** Takes over an orphaned room: seats start disconnected (sockets must resume), overdue deadlines fire now. */
  private async recover(code: string): Promise<void> {
    if (!(await this.store.acquireLease(code, this.instanceId, this.cfg.room.leaseMs))) return;
    this.owned.add(code);
    if (!(await this.store.exists(code))) {
      this.owned.delete(code);
      await this.store.forget(code);
      await this.store.releaseLease(code, this.instanceId);
      return;
    }
    this.logger.log(`recovered room ${code}`);
    const state = await this.mutate(code, async (s, fx, now) => {
      for (const seat of s.seats) seat.connected = false;
      await this.advance(s, fx, now);
      return s;
    }).catch((err: unknown) => {
      this.logger.error(`recover ${code}: ${String(err)}`);
      return null;
    });
    if (state?.phase === 'finished' && state.recordingPending && state.session) {
      if (!(await this.store.loadPending(state.session.sessionId))) void this.beginRecording(state);
    }
  }

  // ---------------------------------------------------------------- core mutation

  private withLock<T>(code: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(code) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.catch(() => undefined);
    this.locks.set(code, tail);
    void tail.then(() => {
      if (this.locks.get(code) === tail) this.locks.delete(code);
    });
    return run;
  }

  private async mutate<T>(code: string, fn: (s: RoomState, fx: Fx, now: number) => T | Promise<T>): Promise<T> {
    if (this.shuttingDown) throw new RoomError('INTERNAL', 'shutting down');
    return this.withLock(code, async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await this.store.load(code);
        if (!current || current.phase === 'dissolved') throw new RoomError('ROOM_NOT_FOUND');
        if (!this.owned.has(code)) {
          if (!(await this.store.acquireLease(code, this.instanceId, this.cfg.room.leaseMs))) {
            throw new RoomError('INTERNAL', 'room is served by another instance');
          }
          this.owned.add(code);
        }
        const next = structuredClone(current);
        const fx: Fx = { emits: [], after: [] };
        const result = await fn(next, fx, this.clock.now());
        if (JSON.stringify(next) !== JSON.stringify(current)) {
          next.version = current.version + 1;
          const res = await this.store.cas(next, current.version, this.instanceId);
          if (!res.ok) {
            if (res.reason === 'conflict') continue;
            if (res.reason === 'lease_lost') this.lose(code);
            throw new RoomError(res.reason === 'gone' ? 'ROOM_NOT_FOUND' : 'INTERNAL', res.reason);
          }
        }
        this.cache.set(code, next);
        this.arm(next);
        for (const emit of fx.emits) this.emitIfOwner(code, emit);
        for (const task of fx.after) void task().catch((err: unknown) => this.logger.error(`${code}: ${String(err)}`));
        return result;
      }
      throw new RoomError('INTERNAL', 'version conflict');
    });
  }

  private arm(s: RoomState): void {
    const prev = this.timers.get(s.code);
    if (prev !== undefined) this.clock.clearTimer(prev);
    this.timers.delete(s.code);
    if (!this.owned.has(s.code)) return;
    const due = this.nextDue(s);
    if (due === null) return;
    this.timers.set(
      s.code,
      this.clock.setTimer(() => this.tick(s.code), due - this.clock.now()),
    );
  }

  private nextDue(s: RoomState): number | null {
    const sess = s.session;
    switch (s.phase) {
      case 'lobby':
        return s.lobbyExpiresAt;
      case 'question':
        return sess!.chosungRevealAt !== null && !sess!.chosungRevealed
          ? Math.min(sess!.chosungRevealAt, sess!.deadlineAt)
          : sess!.deadlineAt;
      case 'reveal':
        return sess!.nextAt;
      case 'finished':
        return s.finishedExpiresAt;
      default:
        return null;
    }
  }

  private async tick(code: string): Promise<void> {
    this.timers.delete(code);
    if (!this.owned.has(code) || this.shuttingDown) return;
    await this.mutate(code, (s, fx, now) => this.advance(s, fx, now)).catch((err: unknown) => {
      if (!(err instanceof RoomError && err.code === 'ROOM_NOT_FOUND')) this.logger.error(`tick ${code}: ${String(err)}`);
    });
  }

  /** Applies every transition whose time has come (also used after recovery: overdue → immediately). */
  private async advance(s: RoomState, fx: Fx, now: number): Promise<void> {
    for (let guard = 0; guard < 6; guard++) {
      const sess = s.session;
      if (s.phase === 'lobby') {
        if (s.lobbyExpiresAt !== null && now >= s.lobbyExpiresAt) this.dissolve(s, fx, 'lobby_timeout');
        return;
      }
      if (s.phase === 'question' && sess) {
        if (sess.chosungRevealAt !== null && !sess.chosungRevealed && now >= sess.chosungRevealAt && now < sess.deadlineAt) {
          sess.chosungRevealed = true;
          const qs = await this.questionsFor(s);
          const chosung = toChosung(qs[sess.index]!.answer);
          fx.emits.push((nsp) =>
            nsp.to(roomChannel(s.code)).emit('room:chosungReveal', {
              version: s.version,
              serverNow: this.clock.now(),
              questionIndex: sess.index,
              chosung,
            }),
          );
        }
        if (now >= sess.deadlineAt || (await this.isComplete(s, now))) {
          await this.closeQuestion(s, fx, now);
          continue;
        }
        return;
      }
      if (s.phase === 'reveal' && sess) {
        if (sess.nextAt !== null && now >= sess.nextAt) {
          if (sess.index + 1 < sess.questionIds.length) await this.startQuestion(s, fx, sess.index + 1, now);
          else this.finish(s, fx, now);
          continue;
        }
        return;
      }
      if (s.phase === 'finished') {
        if (s.finishedExpiresAt !== null && now >= s.finishedExpiresAt) {
          s.phase = 'dissolved';
          fx.after.push(() => this.removeRoom(s.code));
        }
        return;
      }
      return;
    }
  }

  private dissolve(s: RoomState, fx: Fx, reason: 'lobby_timeout' | 'empty'): void {
    s.phase = 'dissolved';
    fx.emits.push((nsp) => {
      nsp.to(roomChannel(s.code)).emit('room:dissolved', { version: s.version, serverNow: this.clock.now(), reason });
      nsp.in(roomChannel(s.code)).socketsLeave(roomChannel(s.code));
    });
    fx.after.push(async () => {
      await this.repo.updateRoomStatus(s.roomId, 'dissolved').catch(() => undefined);
      await this.removeRoom(s.code);
    });
  }

  private async removeRoom(code: string): Promise<void> {
    await this.withLock(code, async () => {
      await this.store.remove(code, this.instanceId);
      this.lose(code);
      for (const key of this.questionCache.keys()) if (key.startsWith(`${code}:`)) this.questionCache.delete(key);
    });
  }

  private async questionsFor(s: RoomState): Promise<RoomQuestion[]> {
    if (!s.session) return [];
    const key = `${s.code}:${s.session.sessionId}`;
    let qs = this.questionCache.get(key);
    if (!qs) {
      qs = await this.store.loadQuestions(s.code);
      this.questionCache.set(key, qs);
    }
    return qs;
  }

  private async isComplete(s: RoomState, now: number): Promise<boolean> {
    const sess = s.session!;
    const q = (await this.questionsFor(s))[sess.index]!;
    const answers = sess.answers[sess.index] ?? {};
    return isQuestionComplete({
      questionType: q.public.type,
      now,
      deadlineAt: sess.deadlineAt,
      participants: s.seats.map((seat) => ({
        participantId: seat.participantId,
        connected: seat.connected && !seat.left,
        submitted: answers[seat.participantId]?.submitted ?? false,
        solved: answers[seat.participantId]?.solved ?? false,
        gaveUp: answers[seat.participantId]?.gaveUp ?? false,
      })),
    });
  }

  private async startQuestion(s: RoomState, fx: Fx, index: number, now: number): Promise<void> {
    const sess = s.session!;
    const q = (await this.questionsFor(s))[index]!;
    const revealSec = s.settings.chosungRevealSec;
    s.phase = 'question';
    sess.index = index;
    sess.startedAt = now;
    sess.deadlineAt = now + s.settings.timeLimitSec * 1000;
    sess.chosungRevealAt = q.public.type === 'chosung' && revealSec !== null ? now + revealSec * 1000 : null;
    sess.chosungRevealed = false;
    sess.nextAt = null;
    sess.answers[index] = {};
    fx.emits.push((nsp) =>
      nsp.to(roomChannel(s.code)).emit('room:question', {
        version: s.version,
        serverNow: this.clock.now(),
        question: this.liveQuestion(s, q),
      }),
    );
  }

  private async closeQuestion(s: RoomState, fx: Fx, now: number): Promise<void> {
    const sess = s.session!;
    s.phase = 'reveal';
    sess.nextAt = now + this.cfg.room.revealMs;
    const reveal = this.revealDto(s, await this.questionsFor(s));
    fx.emits.push((nsp) =>
      nsp.to(roomChannel(s.code)).emit('room:reveal', { version: s.version, serverNow: this.clock.now(), reveal }),
    );
  }

  private finish(s: RoomState, fx: Fx, now: number): void {
    const ranked = rankPlayers(
      s.seats.map((seat) => ({
        participantId: seat.participantId,
        score: seat.score,
        correctCount: seat.correctCount,
        totalResponseMs: seat.totalResponseMs,
      })),
    );
    const seatById = new Map(s.seats.map((seat) => [seat.participantId, seat]));
    s.results = ranked.map((r): BattleResultRowDto => {
      const seat = seatById.get(r.participantId)!;
      return {
        participantId: r.participantId,
        nickname: seat.nickname,
        kind: seat.kind,
        rank: r.rank,
        score: r.score,
        correctCount: r.correctCount,
        totalResponseMs: r.totalResponseMs,
        left: seat.left,
      };
    });
    s.phase = 'finished';
    s.finishedExpiresAt = now + this.cfg.room.finishedRetentionMs;
    s.previousQuestionIds = [...s.session!.questionIds];
    s.recordingPending = true;
    s.you = null;
    fx.after.push(() => this.beginRecording(s));
  }

  /** Persists a pending record of the finished battle, then records it (idempotent writes). */
  private async beginRecording(s: RoomState): Promise<void> {
    const session = s.session!;
    await this.store.savePending(session.sessionId, {
      code: s.code,
      state: s,
      questions: await this.questionsFor(s),
      createdAt: this.clock.now(),
      attempts: 0,
    });
    void this.repo.updateRoomStatus(s.roomId, 'finished').catch(() => undefined);
    await this.attemptRecording(session.sessionId, 1);
  }

  /**
   * One recording attempt. Retryable failures: backoff (1 s, 2 s) up to RECORD_ATTEMPTS, then announce 0 XP
   * and leave the record to the recovery scan (every PENDING_RETRY_SCANS scans) until it lands, is older than
   * PENDING_MAX_AGE_MS, or failed PENDING_MAX_ATTEMPTS times (then dead-lettered). Non-retryable failures
   * (FK / unique / validation) drop the record at once. A late success re-sends `room:finished` with real XP.
   */
  private async attemptRecording(sessionId: string, attempt: number): Promise<void> {
    if (this.shuttingDown) return;
    this.lastRecordAttempt.set(sessionId, Date.now());
    if (!(await this.store.lockPending(sessionId, this.instanceId, 60_000))) return;
    const pending = await this.store.loadPending(sessionId);
    if (!pending) return this.store.unlockPending(sessionId, this.instanceId);
    const tag = `${pending.code}/${sessionId}`;
    pending.createdAt ??= 0; // records from older builds: treat as expired
    pending.attempts ??= 0;
    if (this.clock.now() - pending.createdAt >= PENDING_MAX_AGE_MS) {
      await this.store.killPending(sessionId, pending, 'max_age');
      this.lastRecordAttempt.delete(sessionId);
      this.logger.error(`record results ${tag}: gave up after ${pending.attempts} attempts (older than 1 h); moved to pending-dead`);
      return;
    }
    try {
      const you = await this.results.record(pending.state, pending.questions);
      await this.store.deletePending(sessionId);
      this.lastRecordAttempt.delete(sessionId);
      await this.announce(pending.code, sessionId, you);
    } catch (err) {
      const why = errorSummary(err);
      if (!isRetryable(err)) {
        await this.store.deletePending(sessionId);
        this.lastRecordAttempt.delete(sessionId);
        this.logger.warn(`record results ${tag}: not retryable, dropped (${why})`);
        await this.announce(pending.code, sessionId, null);
        return;
      }
      pending.attempts += 1;
      if (pending.attempts >= PENDING_MAX_ATTEMPTS) {
        await this.store.killPending(sessionId, pending, why);
        this.lastRecordAttempt.delete(sessionId);
        this.logger.error(`record results ${tag}: gave up after ${pending.attempts} attempts (${why}); moved to pending-dead`);
        await this.announce(pending.code, sessionId, null);
        return;
      }
      await this.store.updatePending(sessionId, pending);
      await this.store.unlockPending(sessionId, this.instanceId);
      this.logger.warn(`record results ${tag} attempt ${pending.attempts} failed: ${why}`);
      if (attempt < RECORD_ATTEMPTS) {
        this.clock.setTimer(() => this.attemptRecording(sessionId, attempt + 1), 1000 * 2 ** (attempt - 1));
      } else if (attempt === RECORD_ATTEMPTS) {
        await this.announce(pending.code, sessionId, null);
      }
    }
  }

  /** Sends `room:finished` (again) to the room if it is still showing that session's results. */
  private async announce(code: string, sessionId: string, you: Record<string, BattleResultYouDto> | null): Promise<void> {
    await this.mutate(code, (st, fx) => {
      if (st.phase !== 'finished' || st.session?.sessionId !== sessionId) return;
      if (you === null && st.you !== null) return; // already announced; keep waiting for the real XP
      st.recordingPending = you === null;
      st.you = you ?? Object.fromEntries(st.seats.map((seat) => [seat.participantId, this.fallbackYou(seat)]));
      fx.emits.push((nsp) =>
        this.forEachSocket(nsp, code, (socket, pid) =>
          socket.emit('room:finished', {
            version: st.version,
            serverNow: this.clock.now(),
            sessionId,
            results: st.results ?? [],
            you: st.you![pid] ?? this.fallbackYou(st.seats.find((x) => x.participantId === pid)!),
          }),
        ),
      );
    }).catch((err: unknown) => {
      if (!(err instanceof RoomError && err.code === 'ROOM_NOT_FOUND')) this.logger.error(`announce ${code}: ${String(err)}`);
    });
  }

  private fallbackYou(seat: Seat): BattleResultYouDto {
    return {
      participantId: seat.participantId,
      xp: { granted: 0, preCapTotal: 0, capReached: false },
      wrongNotesAdded: 0,
      canSaveByLogin: seat.kind === 'guest',
    };
  }

  // ---------------------------------------------------------------- emit helpers

  private forEachSocket(
    nsp: Namespace,
    code: string,
    fn: (socket: { emit: (ev: string, data: unknown) => unknown }, participantId: string) => void,
  ): void {
    const ids = nsp.adapter.rooms.get(roomChannel(code));
    for (const id of ids ?? []) {
      const socket = nsp.sockets.get(id);
      const pid = socket?.data?.participantId as string | undefined;
      if (socket && pid && socket.data.code === code) fn(socket, pid);
    }
  }

  private emitParticipants(s: RoomState, fx: Fx): void {
    fx.emits.push((nsp) =>
      nsp.to(roomChannel(s.code)).emit('room:participants', {
        version: s.version,
        serverNow: this.clock.now(),
        hostParticipantId: s.hostParticipantId,
        participants: this.participants(s),
      }),
    );
  }

  private emitProgress(s: RoomState, fx: Fx): void {
    const sess = s.session!;
    const answers = sess.answers[sess.index] ?? {};
    const active = s.seats.filter((seat) => seat.connected && !seat.left);
    const done = active.filter((seat) => {
      const a = answers[seat.participantId];
      return a !== undefined && (a.submitted || a.solved || a.gaveUp);
    });
    fx.emits.push((nsp) =>
      nsp.to(roomChannel(s.code)).emit('room:progress', {
        version: s.version,
        serverNow: this.clock.now(),
        questionIndex: sess.index,
        doneCount: done.length,
        activeCount: active.length,
      }),
    );
  }

  // ---------------------------------------------------------------- DTOs

  private participants(s: RoomState): RoomParticipantDto[] {
    return s.seats.map((seat) => ({
      participantId: seat.participantId,
      kind: seat.kind,
      userId: seat.userId,
      nickname: seat.nickname,
      avatarUrl: seat.avatarUrl,
      isHost: seat.participantId === s.hostParticipantId,
      ready: seat.ready,
      connected: seat.connected,
      left: seat.left,
    }));
  }

  private liveQuestion(s: RoomState, q: RoomQuestion): LiveQuestionDto {
    const sess = s.session!;
    return {
      index: sess.index,
      total: sess.questionIds.length,
      question: q.public,
      startedAt: sess.startedAt,
      deadlineAt: sess.deadlineAt,
      chosungRevealAt: sess.chosungRevealAt,
      ...(sess.chosungRevealed ? { chosung: toChosung(q.answer) } : {}),
    };
  }

  private revealDto(s: RoomState, qs: readonly RoomQuestion[]): RevealDto {
    const sess = s.session!;
    const answers = sess.answers[sess.index] ?? {};
    return {
      index: sess.index,
      reveal: qs[sess.index]!.reveal,
      correctParticipantIds: Object.entries(answers)
        .filter(([, a]) => a.correct)
        .map(([pid]) => pid),
      scoreboard: s.seats
        .map((seat) => ({
          participantId: seat.participantId,
          nickname: seat.nickname,
          score: seat.score,
          correctCount: seat.correctCount,
        }))
        .sort((a, b) => b.score - a.score || b.correctCount - a.correctCount),
      nextAt: sess.nextAt!,
    };
  }

  private snapshot(s: RoomState, qs: readonly RoomQuestion[], participantId: string): RoomSnapshotDto {
    const sess = s.session;
    const inQuestion = s.phase === 'question' && sess !== null;
    const a = inQuestion ? sess.answers[sess.index]?.[participantId] : undefined;
    return {
      roomId: s.roomId,
      sessionId: sess?.sessionId ?? null,
      code: s.code,
      phase: s.phase,
      version: s.version,
      hostParticipantId: s.hostParticipantId,
      settings: s.settings,
      participants: this.participants(s),
      lobbyExpiresAt: s.phase === 'lobby' ? s.lobbyExpiresAt : null,
      question: (inQuestion || s.phase === 'reveal') && sess ? this.liveQuestion(s, qs[sess.index]!) : null,
      you: {
        participantId,
        question: inQuestion
          ? { submitted: a?.submitted ?? false, solved: a?.solved ?? false, gaveUp: a?.gaveUp ?? false, attempts: a?.attempts ?? 0 }
          : null,
      },
      reveal: s.phase === 'reveal' && sess ? this.revealDto(s, qs) : null,
      results: s.phase === 'finished' ? s.results : null,
      serverNow: this.clock.now(),
    };
  }

  async snapshotFor(code: string, participantId: string): Promise<RoomSnapshotDto> {
    const s = this.cache.get(code) ?? (await this.store.load(code));
    if (!s) throw new RoomError('ROOM_NOT_FOUND');
    return this.snapshot(s, await this.questionsFor(s), participantId);
  }

  // ---------------------------------------------------------------- queries

  async getRoom(code: string): Promise<RoomState | null> {
    return this.store.load(code);
  }

  async lookup(code: string): Promise<RoomLookupDto | null> {
    const s = await this.store.load(code);
    if (!s || s.phase === 'dissolved') return null;
    const host = s.seats.find((seat) => seat.participantId === s.hostParticipantId);
    return {
      code: s.code,
      phase: s.phase,
      joinable: s.phase === 'lobby' && s.seats.length < this.cfg.room.maxPlayers,
      hostNickname: host?.nickname ?? '',
      participantCount: activeSeats(s).length,
      maxPlayers: this.cfg.room.maxPlayers,
    };
  }

  // ---------------------------------------------------------------- actions

  private async validateSettings(settings: RoomSettings): Promise<void> {
    const res = validateRoomSettings(settings, await this.pool.availableTopicIds(), this.cfg);
    if (!res.ok) throw new RoomError('INVALID_SETTINGS', res.errors.join(','));
  }

  /** POST /api/rooms (members). The creator's seat is reserved as host and connects on `room:join`. */
  async createRoom(identity: RoomIdentity, settings: RoomSettings): Promise<{ roomId: string; code: string }> {
    if (identity.kind !== 'user') throw new RoomError('UNAUTHORIZED', 'members only');
    await this.validateSettings(settings);
    for (let attempt = 0; attempt < 30; attempt++) {
      const code = String(randomInt(0, 10 ** this.cfg.room.codeDigits)).padStart(this.cfg.room.codeDigits, '0');
      if (await this.store.exists(code)) continue;
      const { roomId } = await this.repo.createRoom({ code, host: { kind: 'user', userId: identity.userId }, settings });
      const now = this.clock.now();
      const host = this.newSeat(identity, identity.nickname, now);
      const state: RoomState = {
        code,
        roomId,
        version: 1,
        phase: 'lobby',
        hostParticipantId: host.participantId,
        settings,
        seats: [host],
        createdAt: now,
        lobbyExpiresAt: now + this.cfg.room.lobbyTtlMs,
        finishedExpiresAt: null,
        seq: 0,
        session: null,
        previousQuestionIds: [],
        results: null,
        recordingPending: false,
        you: null,
      };
      if (await this.store.create(state, this.instanceId, this.cfg.room.leaseMs)) {
        this.owned.add(code);
        this.cache.set(code, state);
        this.arm(state);
        return { roomId, code };
      }
    }
    throw new RoomError('INTERNAL', 'no free room code');
  }

  private newSeat(identity: RoomIdentity, nickname: string, now: number): Seat {
    return {
      participantId: randomUUID(),
      ownerKey: identityKey(identity),
      kind: identity.kind,
      userId: identity.kind === 'user' ? identity.userId : null,
      guestId: identity.kind === 'guest' ? identity.guestId : null,
      nickname,
      avatarUrl: identity.kind === 'user' ? identity.avatarUrl : null,
      ready: false,
      connected: true,
      left: false,
      joinedAt: now,
      score: 0,
      correctCount: 0,
      totalResponseMs: 0,
    };
  }

  /** room:join — new seat in the lobby, or a reconnect to an existing seat (AC-M3). */
  async join(identity: RoomIdentity, payload: JoinRoomPayload): Promise<string> {
    const key = identityKey(identity);
    return this.mutate(payload.code, (s, fx, now) => {
      const existing = s.seats.find((seat) => seat.ownerKey === key);
      if (existing) {
        existing.connected = true;
        existing.left = false;
        this.emitParticipants(s, fx);
        return existing.participantId;
      }
      if (s.phase !== 'lobby') throw new RoomError('ROOM_IN_PROGRESS');
      if (s.seats.length >= this.cfg.room.maxPlayers) throw new RoomError('ROOM_FULL');
      let nickname: string;
      if (identity.kind === 'user') nickname = identity.nickname;
      else {
        const v = validateGuestNickname(payload.nickname ?? '', this.cfg);
        if (!v.ok) throw new RoomError('INVALID_NICKNAME', v.reason);
        nickname = v.nickname;
      }
      const seat = this.newSeat(identity, dedupeNickname(nickname, s.seats.map((x) => x.nickname)), now);
      s.seats.push(seat);
      this.emitParticipants(s, fx);
      return seat.participantId;
    });
  }

  /** room:resume — reattach to an existing seat; missed questions simply have no answer (0 points, AC-M8). */
  async resume(identity: RoomIdentity, code: string): Promise<string> {
    const key = identityKey(identity);
    return this.mutate(code, async (s, fx, now) => {
      const seat = s.seats.find((x) => x.ownerKey === key);
      if (!seat) throw new RoomError('NOT_IN_ROOM');
      seat.connected = true;
      seat.left = false;
      this.emitParticipants(s, fx);
      await this.advance(s, fx, now);
      return seat.participantId;
    });
  }

  private handOffHost(s: RoomState, leaving: Seat): void {
    if (s.hostParticipantId !== leaving.participantId) return;
    const next = s.seats.find((x) => x.participantId !== leaving.participantId && !x.left);
    if (next) s.hostParticipantId = next.participantId;
  }

  /** room:leave — lobby: seat removed (host handed to the next participant); battle: kept as `left`. */
  async leave(code: string, participantId: string): Promise<void> {
    await this.mutate(code, async (s, fx, now) => {
      const seat = s.seats.find((x) => x.participantId === participantId);
      if (!seat) throw new RoomError('NOT_IN_ROOM');
      this.handOffHost(s, seat);
      if (s.phase === 'lobby') {
        s.seats = s.seats.filter((x) => x !== seat);
        if (s.seats.length === 0) return this.dissolve(s, fx, 'empty');
      } else {
        seat.left = true;
        seat.connected = false;
        seat.ready = false;
      }
      this.emitParticipants(s, fx);
      if (s.phase === 'question') this.emitProgress(s, fx);
      await this.advance(s, fx, now);
    });
  }

  /** Socket closed without leaving: the seat stays; in a question it no longer blocks "everyone submitted". */
  async disconnect(code: string, participantId: string): Promise<void> {
    if (this.shuttingDown || !this.owned.has(code)) return;
    let stillConnected = false;
    this.emitIfOwner(code, (nsp) =>
      this.forEachSocket(nsp, code, (_s, pid) => {
        if (pid === participantId) stillConnected = true;
      }),
    );
    if (stillConnected) return;
    await this.mutate(code, async (s, fx, now) => {
      const seat = s.seats.find((x) => x.participantId === participantId);
      if (!seat || !seat.connected) return;
      seat.connected = false;
      this.emitParticipants(s, fx);
      if (s.phase === 'question') this.emitProgress(s, fx);
      await this.advance(s, fx, now);
    }).catch(() => undefined);
  }

  async ready(code: string, participantId: string, ready: boolean): Promise<void> {
    await this.mutate(code, (s, fx) => {
      if (s.phase !== 'lobby') throw new RoomError('WRONG_PHASE');
      const seat = s.seats.find((x) => x.participantId === participantId);
      if (!seat) throw new RoomError('NOT_IN_ROOM');
      seat.ready = ready;
      this.emitParticipants(s, fx);
    });
  }

  async updateSettings(code: string, participantId: string, settings: RoomSettings): Promise<void> {
    await this.validateSettings(settings);
    await this.mutate(code, (s, fx) => {
      if (s.hostParticipantId !== participantId) throw new RoomError('NOT_HOST');
      if (s.phase !== 'lobby') throw new RoomError('WRONG_PHASE');
      s.settings = settings;
      fx.emits.push((nsp) =>
        nsp.to(roomChannel(s.code)).emit('room:settings', { version: s.version, serverNow: this.clock.now(), settings }),
      );
    });
  }

  /**
   * room:start (AC-M1, M2, M4): ≥ 2 players, all non-hosts ready; questions are selected and re-loaded
   * inside the room lock, so a pool change between the shortage reply and the confirmation is caught.
   */
  async start(code: string, participantId: string, acceptShortageCount?: number): Promise<StartRoomResult> {
    return this.mutate(code, async (s, fx, now): Promise<StartRoomResult> => {
      if (s.hostParticipantId !== participantId) throw new RoomError('NOT_HOST');
      if (s.phase !== 'lobby') throw new RoomError('WRONG_PHASE');
      if (s.seats.length < this.cfg.room.minPlayers) throw new RoomError('NOT_ENOUGH_PLAYERS');
      if (s.seats.some((x) => x.participantId !== s.hostParticipantId && !x.ready)) throw new RoomError('NOT_ALL_READY');

      let questions: RoomQuestion[] = [];
      for (let attempt = 0; attempt < 2; attempt++) {
        const pool = await this.pool.findCandidates(s.settings);
        const sel = selectQuestions(
          { mode: 'battle', pool, settings: s.settings, avoidIds: s.previousQuestionIds },
          this.rng,
          this.cfg,
        );
        if (sel.status === 'blocked') throw new RoomError('NO_QUESTIONS');
        if (sel.status === 'shortage') {
          if (sel.available === 0) throw new RoomError('NO_QUESTIONS');
          if (acceptShortageCount !== sel.available) {
            return { status: 'shortage', available: sel.available, requested: sel.requested };
          }
        }
        questions = await this.pool.loadQuestions(sel.questionIds);
        if (questions.length === sel.questionIds.length) break;
        questions = [];
      }
      if (questions.length === 0) throw new RoomError('NO_QUESTIONS');

      const sessionId = randomUUID();
      const questionIds = questions.map((q) => q.public.id);
      s.seq += 1;
      await this.repo.createSession({
        id: sessionId,
        roomId: s.roomId,
        seq: s.seq,
        settings: s.settings,
        questionIds,
        startedAt: new Date(now),
      });
      await this.store.saveQuestions(s.code, questions);
      this.questionCache.set(`${s.code}:${sessionId}`, questions);
      for (const seat of s.seats) Object.assign(seat, { score: 0, correctCount: 0, totalResponseMs: 0 });
      s.session = {
        sessionId,
        seq: s.seq,
        questionIds,
        memberKey: s.seats.map((x) => x.ownerKey).sort().join(','),
        index: 0,
        startedAt: now,
        deadlineAt: now,
        chosungRevealAt: null,
        chosungRevealed: false,
        nextAt: null,
        answers: [],
      };
      s.lobbyExpiresAt = null;
      s.results = null;
      await this.startQuestion(s, fx, 0, now);
      fx.after.push(() => this.repo.updateRoomStatus(s.roomId, 'playing'));
      return { status: 'started', sessionId };
    });
  }

  /** room:submit (AC-M5, M6). The result goes only to the submitter's ack. */
  async submit(code: string, participantId: string, questionIndex: number, answer: string): Promise<SubmitAnswerResult> {
    return this.mutate(code, async (s, fx, now): Promise<SubmitAnswerResult> => {
      const seat = s.seats.find((x) => x.participantId === participantId);
      if (!seat) throw new RoomError('NOT_IN_ROOM');
      const sess = s.session;
      if (!sess || s.phase === 'lobby') throw new RoomError('WRONG_PHASE');
      if (questionIndex > sess.index || questionIndex < 0) throw new RoomError('STALE_QUESTION');
      if (questionIndex < sess.index || s.phase !== 'question' || now >= sess.deadlineAt) {
        await this.advance(s, fx, now);
        return { status: 'late', final: true };
      }
      const q = (await this.questionsFor(s))[sess.index]!;
      const answers = (sess.answers[sess.index] ??= {});
      const a: AnswerState = (answers[participantId] ??= {
        submitted: false,
        solved: false,
        gaveUp: false,
        attempts: 0,
        correct: false,
        score: 0,
        responseMs: null,
        beforeReveal: null,
        answeredAt: null,
      });
      const isChosung = q.public.type === 'chosung';
      if (isChosung ? a.solved || a.gaveUp : a.submitted) return { status: 'duplicate', final: true };

      const verdict = isChosung
        ? judgeChosung(answer, q.answer)
        : answer.trim() === q.answer.trim()
          ? 'correct'
          : 'wrong';
      a.attempts += 1;
      a.answeredAt = now;
      a.responseMs = now - sess.startedAt;
      if (!isChosung) a.submitted = true;
      let result: SubmitAnswerResult;
      if (verdict === 'correct') {
        const beforeReveal = sess.chosungRevealAt === null || now < sess.chosungRevealAt;
        const score = scoreAnswer(
          {
            questionType: q.public.type,
            correct: true,
            timeLimitMs: s.settings.timeLimitSec * 1000,
            remainingMs: sess.deadlineAt - now,
            beforeReveal,
          },
          this.cfg,
        ).total;
        Object.assign(a, { correct: true, solved: isChosung, score, submitted: true, beforeReveal: isChosung ? beforeReveal : null });
        seat.score += score;
        seat.correctCount += 1;
        result = { status: 'correct', score, final: true };
      } else {
        result = verdict === 'near' ? { status: 'near', final: false } : { status: 'wrong', final: !isChosung };
      }
      // Response time counts once per question: the final answer for mcq/ox, the solving answer for chosung.
      if (!isChosung || verdict === 'correct') seat.totalResponseMs += a.responseMs;
      this.emitProgress(s, fx);
      await this.advance(s, fx, now);
      return result;
    });
  }

  /** room:giveUp — chosung "포기": done for "everyone submitted", no more attempts. */
  async giveUp(code: string, participantId: string, questionIndex: number): Promise<void> {
    await this.mutate(code, async (s, fx, now) => {
      const sess = s.session;
      if (!sess || s.phase !== 'question') throw new RoomError('WRONG_PHASE');
      if (questionIndex !== sess.index) throw new RoomError('STALE_QUESTION');
      if (!s.seats.some((x) => x.participantId === participantId)) throw new RoomError('NOT_IN_ROOM');
      const q = (await this.questionsFor(s))[sess.index]!;
      if (q.public.type !== 'chosung') throw new RoomError('WRONG_PHASE', 'chosung only');
      const answers = (sess.answers[sess.index] ??= {});
      const a = (answers[participantId] ??= {
        submitted: false,
        solved: false,
        gaveUp: false,
        attempts: 0,
        correct: false,
        score: 0,
        responseMs: null,
        beforeReveal: null,
        answeredAt: null,
      });
      if (a.solved || a.gaveUp) return;
      a.gaveUp = true;
      a.answeredAt = now;
      this.emitProgress(s, fx);
      await this.advance(s, fx, now);
    });
  }

  /** room:rematch — '한 판 더' (AC-M11): same code and settings, back to the lobby; leavers are dropped. */
  async rematch(code: string, participantId: string): Promise<void> {
    await this.mutate(code, (s, fx, now) => {
      const seat = s.seats.find((x) => x.participantId === participantId);
      if (!seat) throw new RoomError('NOT_IN_ROOM');
      if (s.phase === 'lobby') return;
      // Results must be announced first; a still-pending record survives in the store and keeps retrying.
      if (s.phase !== 'finished' || s.you === null) throw new RoomError('WRONG_PHASE');
      seat.left = false;
      s.seats = s.seats.filter((x) => !x.left);
      for (const x of s.seats) Object.assign(x, { ready: false, score: 0, correctCount: 0, totalResponseMs: 0 });
      if (!s.seats.some((x) => x.participantId === s.hostParticipantId)) s.hostParticipantId = s.seats[0]!.participantId;
      s.phase = 'lobby';
      s.lobbyExpiresAt = now + this.cfg.room.lobbyTtlMs;
      s.finishedExpiresAt = null;
      s.session = null;
      s.results = null;
      s.you = null;
      s.recordingPending = false;
      fx.emits.push((nsp) => this.forEachSocket(nsp, code, (socket, pid) => socket.emit('room:state', this.snapshot(s, [], pid))));
      fx.after.push(() => this.repo.updateRoomStatus(s.roomId, 'lobby'));
    });
  }
}
