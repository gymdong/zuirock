import { randomUUID } from 'node:crypto';
import type { InviteDto, InviteStatus, OwnerRef, QuestionType, RoomSettings, RoomStatus, TopicId } from '@zuirock/shared';
import type { CandidateQuestion } from '@zuirock/game-rules';
import type { AuthVerifier, RoomIdentity } from '../../../src/modules/rooms/auth-verifier.js';
import type { Clock } from '../../../src/modules/rooms/clock.js';
import type { QuestionPool, RoomQuestion } from '../../../src/modules/rooms/question-pool.js';
import type { BattleResultInput, RoomResultRepository } from '../../../src/modules/rooms/room-result.repository.js';
import type { InviteRepository } from '../../../src/modules/invites/invite.repository.js';
import type {
  SolveLogInput,
  SolveLogWriter,
  StreakPort,
  Tx,
  WrongNotePort,
  WrongNoteResult,
  XpGrantPort,
  XpGrantRequest,
  XpLedgerEntry,
} from '../../../src/ports/index.js';

/** Manual clock: game timers fire only from `advance`. */
export class FakeClock implements Clock {
  private t: number;
  private seq = 0;
  private readonly timers = new Map<number, { at: number; fn: () => void | Promise<void> }>();

  constructor(start = Date.UTC(2026, 9, 16, 3, 0, 0)) {
    this.t = start;
  }
  now(): number {
    return this.t;
  }
  setTimer(fn: () => void | Promise<void>, delayMs: number): unknown {
    const id = ++this.seq;
    this.timers.set(id, { at: this.t + Math.max(0, delayMs), fn });
    return id;
  }
  clearTimer(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  /** Moves time forward, firing due timers in order and awaiting each. */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      let next: [number, { at: number; fn: () => void | Promise<void> }] | undefined;
      for (const e of this.timers) if (e[1].at <= target && (!next || e[1].at < next[1].at)) next = e;
      if (!next) break;
      this.timers.delete(next[0]);
      this.t = Math.max(this.t, next[1].at);
      await next[1].fn();
    }
    this.t = target;
  }
}

/** Token format for tests: `u:<id>:<nickname>` (member) or `g:<id>` (guest). */
export class FakeAuthVerifier implements AuthVerifier {
  async verify(token: string): Promise<RoomIdentity | null> {
    const [kind, id, nickname] = decodeURIComponent(token).split(':');
    if (kind === 'u' && id && nickname) return { kind: 'user', userId: id, nickname, avatarUrl: null };
    if (kind === 'g' && id) return { kind: 'guest', guestId: id };
    return null;
  }
}

export function makeQuestion(
  id: string,
  topicId: TopicId,
  type: QuestionType,
  difficulty: number,
  answer: string,
): RoomQuestion & { candidate: CandidateQuestion } {
  return {
    candidate: { id, topicId, subfieldId: `${topicId}-sub`, type, difficulty },
    public: {
      id,
      topicId,
      subfield: '생활',
      type,
      difficulty,
      question: `Q ${id}`,
      ...(type === 'mcq' ? { choices: ['가', '나', '다', answer] } : {}),
      ...(type === 'chosung' ? { answerLength: [...answer].length } : {}),
    },
    answer,
    reveal: { questionId: id, answer, explanation: `exp ${id}`, source: { title: 'src', url: '' } },
  };
}

export class FakeQuestionPool implements QuestionPool {
  /** questionId → participants who solved it recently (what recentSolveCounts returns). */
  recent: Record<string, number> = {};
  recentCalls: Array<{ owners: number; limit: number }> = [];
  constructor(public questions: Array<ReturnType<typeof makeQuestion>>) {}
  async recentSolveCounts(owners: ReadonlyArray<{ userId: string | null; guestId: string | null }>, limit: number): Promise<Record<string, number>> {
    this.recentCalls.push({ owners: owners.length, limit });
    return this.recent;
  }
  async availableTopicIds(): Promise<TopicId[]> {
    return [...new Set(this.questions.map((q) => q.public.topicId))];
  }
  async findCandidates(s: Pick<RoomSettings, 'topicIds' | 'types' | 'minDifficulty'>): Promise<CandidateQuestion[]> {
    return this.questions
      .filter((q) => s.topicIds.includes(q.public.topicId) && s.types.includes(q.public.type) && q.public.difficulty >= s.minDifficulty)
      .map((q) => q.candidate);
  }
  async loadQuestions(ids: readonly string[]): Promise<RoomQuestion[]> {
    return ids.flatMap((id) => {
      const q = this.questions.find((x) => x.public.id === id);
      return q ? [{ public: q.public, answer: q.answer, reveal: q.reveal }] : [];
    });
  }
}

export class FakeRoomResultRepository implements RoomResultRepository {
  rooms = new Map<string, { code: string; status: RoomStatus }>();
  sessions = new Map<string, { roomId: string; questionIds: readonly string[]; endedAt: Date | null }>();
  results: Array<BattleResultInput & { id: string }> = [];
  transactions = 0;

  async createRoom(input: { code: string; host: OwnerRef; settings: RoomSettings }): Promise<{ roomId: string }> {
    const roomId = randomUUID();
    this.rooms.set(roomId, { code: input.code, status: 'lobby' });
    return { roomId };
  }
  async updateRoomStatus(roomId: string, status: RoomStatus): Promise<void> {
    const r = this.rooms.get(roomId);
    if (r) r.status = status;
  }
  async createSession(input: { id: string; roomId: string; questionIds: readonly string[] }): Promise<void> {
    if (!this.sessions.has(input.id)) this.sessions.set(input.id, { roomId: input.roomId, questionIds: input.questionIds, endedAt: null });
  }
  async hasBattleSince(memberKey: string, since: Date, excludeSessionId: string): Promise<boolean> {
    return this.results.some((r) => r.memberKey === memberKey && r.endedAt >= since && r.roomSessionId !== excludeSessionId);
  }
  async transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    this.transactions++;
    return fn({} as Tx);
  }
  async writeBattleResults(_tx: Tx, rows: readonly BattleResultInput[]): Promise<{ ids: Map<string, string>; created: Set<string> }> {
    const created = new Set<string>();
    for (const r of rows) {
      if (!this.results.some((x) => x.roomSessionId === r.roomSessionId && x.participantId === r.participantId)) {
        this.results.push({ ...r, id: randomUUID() });
        created.add(r.participantId);
      }
    }
    const sid = rows[0]?.roomSessionId;
    return { ids: new Map(this.results.filter((x) => x.roomSessionId === sid).map((x) => [x.participantId, x.id])), created };
  }
  async endSession(_tx: Tx, sessionId: string, endedAt: Date): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (s) s.endedAt = endedAt;
  }
}

/** In-memory versions of the four LB ports, idempotent like the real ones. */
export class FakePorts implements XpGrantPort, SolveLogWriter, WrongNotePort, StreakPort {
  xp: XpLedgerEntry[] = [];
  xpRequests: XpGrantRequest[] = [];
  logs: SolveLogInput[] = [];
  wrong: Array<{ owner: OwnerRef; results: readonly WrongNoteResult[] }> = [];
  streak: Array<{ owner: OwnerRef; day: string }> = [];

  /** Number of upcoming grant calls that fail (simulated DB outage). */
  failGrants = 0;
  /** Error thrown by failing grants (default: a retryable outage). */
  failError: Error & { code?: string } = new Error('simulated DB outage');

  async grant(_tx: Tx, req: XpGrantRequest): Promise<XpLedgerEntry[]> {
    if (this.failGrants > 0) {
      this.failGrants--;
      throw this.failError;
    }
    this.xpRequests.push(req);
    if (req.ownerId.kind !== 'user') return [];
    const userId = req.ownerId.userId;
    const existing = this.xp.filter((e) => e.sourceId === req.source.id && e.userId === userId);
    if (existing.length) return existing;
    const amount = req.items.filter((i) => i.correct).length * 20;
    const entry: XpLedgerEntry = {
      id: randomUUID(),
      userId,
      sourceType: req.source.type,
      sourceId: req.source.id,
      amount,
      preCapAmount: amount,
      cappedAmount: 0,
      capReached: false,
      reason: 'battle',
      kstDay: req.kstDay,
      configVersion: 'test',
      createdAt: new Date(),
    };
    this.xp.push(entry);
    return [entry];
  }
  async writeMany(_tx: Tx, logs: readonly SolveLogInput[]): Promise<void> {
    for (const l of logs) {
      if (!this.logs.some((x) => x.battleResultId === l.battleResultId && x.questionId === l.questionId)) this.logs.push(l);
    }
  }
  async recordResults(_tx: Tx, owner: OwnerRef, results: readonly WrongNoteResult[]): Promise<void> {
    if (owner.kind === 'user') this.wrong.push({ owner, results });
  }
  async markActivity(_tx: Tx, owner: OwnerRef, day: string): Promise<void> {
    const key = JSON.stringify(owner);
    if (!this.streak.some((s) => JSON.stringify(s.owner) === key && s.day === day)) this.streak.push({ owner, day });
  }
}

export class FakeInviteRepository implements InviteRepository {
  friends = new Set<string>();
  invites: Array<{ id: string; roomId: string; fromUserId: string; toUserId: string; status: InviteStatus; expiresAt: Date }> = [];
  constructor(private readonly roomCode: (roomId: string) => string) {}

  addFriends(a: string, b: string): void {
    this.friends.add([a, b].sort().join('|'));
  }
  async areFriends(a: string, b: string): Promise<boolean> {
    return this.friends.has([a, b].sort().join('|'));
  }
  async create(input: { roomId: string; fromUserId: string; toUserId: string; expiresAt: Date }): Promise<string> {
    const id = randomUUID();
    this.invites.push({ id, ...input, status: 'pending' });
    return id;
  }
  async listPending(toUserId: string, now: Date): Promise<InviteDto[]> {
    return this.invites
      .filter((i) => i.toUserId === toUserId && i.status === 'pending' && i.expiresAt > now)
      .map((i) => ({
        id: i.id,
        roomCode: this.roomCode(i.roomId),
        from: { userId: i.fromUserId, nickname: i.fromUserId, avatar: { source: 'character', url: null }, level: 1 },
        status: i.status,
        createdAt: now.toISOString(),
        expiresAt: i.expiresAt.toISOString(),
      }));
  }
  async respond(id: string, toUserId: string, status: 'accepted' | 'declined', now: Date): Promise<string | null> {
    const inv = this.invites.find((i) => i.id === id && i.toUserId === toUserId && i.status === 'pending' && i.expiresAt > now);
    if (!inv) return null;
    inv.status = status;
    return this.roomCode(inv.roomId);
  }
}
