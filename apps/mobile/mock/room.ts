import { DEFAULT_CONFIG, judgeChosung, normalize, rankPlayers, scoreAnswer } from '@zuirock/game-rules';
import type {
  Ack,
  CreateRoomResponse,
  LiveQuestionDto,
  RoomLookupDto,
  RoomParticipantDto,
  RoomSettings,
  RoomSnapshotDto,
  ScoreboardEntryDto,
  SubmitAnswerResult,
} from '@zuirock/shared';
import { inviteUrl } from '../src/lib/config';
import { setMockSocketFactory, type RoomSocket } from '../src/realtime/socket';
import { QUESTIONS, type MockQuestion } from './data';

/**
 * In-memory room engine behind a fake socket (EXPO_PUBLIC_API_MOCK=1). It follows the socket
 * contract closely enough to drive lobby → play → reveal → result: versioned events, per-submitter
 * acks (near is never broadcast), chosung reveal, 3 s reveal, shortage reply, bots.
 * Mock limits: one human per room, at most 8 questions available.
 */
type Listener = (payload: never) => void;

interface Player {
  p: RoomParticipantDto;
  score: number;
  correctCount: number;
  totalResponseMs: number;
  done: boolean;
  attempts: number;
}

interface Room {
  code: string;
  settings: RoomSettings;
  version: number;
  phase: RoomSnapshotDto['phase'];
  players: Player[];
  hostId: string;
  questions: MockQuestion[];
  index: number;
  live: LiveQuestionDto | null;
  reveal: RoomSnapshotDto['reveal'];
  correctIds: string[];
  timers: ReturnType<typeof setTimeout>[];
  socket: MockSocket | null;
  sessionNo: number;
}

const rooms = new Map<string, Room>();
const now = () => Date.now();

function bot(id: string, nickname: string, kind: 'user' | 'guest'): Player {
  return {
    p: { participantId: id, kind, userId: kind === 'user' ? id : null, nickname, avatarUrl: null, isHost: false, ready: true, connected: true, left: false },
    score: 0,
    correctCount: 0,
    totalResponseMs: 0,
    done: false,
    attempts: 0,
  };
}

function newRoom(code: string, settings: RoomSettings): Room {
  const room: Room = {
    code,
    settings,
    version: 1,
    phase: 'lobby',
    players: [],
    hostId: '',
    questions: [],
    index: -1,
    live: null,
    reveal: null,
    correctIds: [],
    timers: [],
    socket: null,
    sessionNo: 0,
  };
  rooms.set(code, room);
  return room;
}

const DEMO_SETTINGS: RoomSettings = {
  topicIds: ['general', 'history', 'science'],
  types: ['chosung', 'mcq'],
  questionCount: 8,
  minDifficulty: 3,
  timeLimitSec: 60,
  chosungRevealSec: 45,
};

export function createMockRoom(settings: RoomSettings): CreateRoomResponse {
  let code = '5931';
  while (rooms.has(code)) code = String(1000 + Math.floor(Math.random() * 9000));
  newRoom(code, settings);
  return { roomId: `room-${code}`, code, inviteUrl: inviteUrl(code) };
}

export function lookupMockRoom(code: string): RoomLookupDto | null {
  const room = rooms.get(code) ?? (code === '4827' ? newRoom(code, DEMO_SETTINGS) : null);
  if (!room) return null;
  const host = room.players.find((x) => x.p.participantId === room.hostId);
  return {
    code,
    phase: room.phase,
    joinable: room.phase === 'lobby' && room.players.length < DEFAULT_CONFIG.room.maxPlayers,
    hostNickname: host?.p.nickname ?? '도토리박사',
    participantCount: Math.max(room.players.length, 1),
    maxPlayers: DEFAULT_CONFIG.room.maxPlayers,
  };
}

function snapshot(room: Room, youId: string): RoomSnapshotDto {
  const you = room.players.find((x) => x.p.participantId === youId);
  return {
    roomId: `room-${room.code}`,
    sessionId: room.sessionNo ? `s-${room.sessionNo}` : null,
    code: room.code,
    phase: room.phase,
    version: room.version,
    hostParticipantId: room.hostId,
    settings: room.settings,
    participants: room.players.map((x) => ({ ...x.p, isHost: x.p.participantId === room.hostId })),
    lobbyExpiresAt: room.phase === 'lobby' ? now() + DEFAULT_CONFIG.room.lobbyTtlMs : null,
    question: room.live,
    you: {
      participantId: youId,
      question: room.live && you ? { submitted: you.done, solved: room.correctIds.includes(youId), gaveUp: false, attempts: you.attempts } : null,
    },
    reveal: room.reveal,
    results: null,
    serverNow: now(),
  };
}

function scoreboard(room: Room): ScoreboardEntryDto[] {
  return [...room.players]
    .sort((a, b) => b.score - a.score)
    .map((x) => ({ participantId: x.p.participantId, nickname: x.p.nickname, score: x.score, correctCount: x.correctCount }));
}

function emit(room: Room, event: string, payload: object) {
  room.version += 1;
  room.socket?.deliver(event, { ...payload, version: room.version, serverNow: now() });
}

function later(room: Room, ms: number, fn: () => void) {
  room.timers.push(setTimeout(fn, ms));
}

function clearTimers(room: Room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

function judge(m: MockQuestion, answer: string): 'correct' | 'near' | 'wrong' {
  if (m.pub.type === 'chosung') return judgeChosung(answer, m.reveal.answer);
  return normalize(answer) === normalize(m.reveal.answer) ? 'correct' : 'wrong';
}

function award(room: Room, pl: Player, correct: boolean): number {
  const live = room.live!;
  const t = now();
  pl.totalResponseMs += t - live.startedAt;
  if (!correct) return 0;
  const s = scoreAnswer({
    questionType: live.question.type,
    correct: true,
    timeLimitMs: room.settings.timeLimitSec * 1000,
    remainingMs: live.deadlineAt - t,
    beforeReveal: live.chosungRevealAt == null || t < live.chosungRevealAt,
  }).total;
  pl.score += s;
  pl.correctCount += 1;
  room.correctIds.push(pl.p.participantId);
  return s;
}

function markDone(room: Room, pl: Player) {
  pl.done = true;
  const doneCount = room.players.filter((x) => x.done).length;
  emit(room, 'room:progress', { questionIndex: room.index, doneCount, activeCount: room.players.length });
  if (doneCount === room.players.length) closeQuestion(room);
}

function startQuestion(room: Room) {
  clearTimers(room);
  room.index += 1;
  room.correctIds = [];
  room.reveal = null;
  room.players.forEach((x) => {
    x.done = false;
    x.attempts = 0;
  });
  const m = room.questions[room.index]!;
  const startedAt = now();
  const limit = room.settings.timeLimitSec * 1000;
  const revealSec = m.pub.type === 'chosung' ? room.settings.chosungRevealSec : null;
  room.live = {
    index: room.index,
    total: room.questions.length,
    question: m.pub,
    startedAt,
    deadlineAt: startedAt + limit,
    chosungRevealAt: revealSec == null ? null : startedAt + revealSec * 1000,
  };
  room.phase = 'question';
  emit(room, 'room:question', { question: room.live });
  if (revealSec != null) {
    later(room, revealSec * 1000, () => {
      room.live = { ...room.live!, chosung: m.chosung };
      emit(room, 'room:chosungReveal', { questionIndex: room.index, chosung: m.chosung });
    });
  }
  // Bots answer after a few seconds; each is right ~70% of the time.
  room.players
    .filter((x) => x.p.participantId.startsWith('bot'))
    .forEach((x, i) =>
      later(room, 3000 + i * 2500 + Math.random() * 3000, () => {
        if (x.done || room.phase !== 'question') return;
        award(room, x, Math.random() < 0.7);
        markDone(room, x);
      }),
    );
  later(room, limit, () => closeQuestion(room));
}

function closeQuestion(room: Room) {
  if (room.phase !== 'question') return;
  clearTimers(room);
  room.phase = 'reveal';
  const m = room.questions[room.index]!;
  room.reveal = {
    index: room.index,
    reveal: m.reveal,
    correctParticipantIds: room.correctIds,
    scoreboard: scoreboard(room),
    nextAt: now() + DEFAULT_CONFIG.room.revealMs,
  };
  emit(room, 'room:reveal', { reveal: room.reveal });
  later(room, DEFAULT_CONFIG.room.revealMs, () => (room.index + 1 < room.questions.length ? startQuestion(room) : finish(room)));
}

function finish(room: Room) {
  room.phase = 'finished';
  room.live = null;
  const ranked = rankPlayers(room.players.map((x) => ({ participantId: x.p.participantId, score: x.score, correctCount: x.correctCount, totalResponseMs: x.totalResponseMs })));
  const results = ranked.map((r) => {
    const pl = room.players.find((x) => x.p.participantId === r.participantId)!;
    return { ...r, nickname: pl.p.nickname, kind: pl.p.kind, left: pl.p.left };
  });
  const youId = room.socket?.participantId ?? '';
  const me = room.players.find((x) => x.p.participantId === youId);
  const myRank = results.find((r) => r.participantId === youId)?.rank ?? 0;
  const bonus = [0, 15, 10, 5][myRank] ?? 0;
  const xpBase = (me?.correctCount ?? 0) * 35 + bonus;
  const guest = me?.p.kind === 'guest';
  emit(room, 'room:finished', {
    sessionId: `s-${room.sessionNo}`,
    results,
    you: {
      participantId: youId,
      xp: guest
        ? { granted: 0, preCapTotal: 0, capReached: false, ineligibleReason: 'GUEST', guestPreviewMax: xpBase }
        : { granted: xpBase, preCapTotal: xpBase, capReached: false },
      wrongNotesAdded: guest ? 0 : room.questions.length - (me?.correctCount ?? 0),
      canSaveByLogin: guest,
    },
  });
}

class MockSocket implements RoomSocket {
  private listeners = new Map<string, Set<Listener>>();
  connected = false;
  participantId = '';
  private room: Room | null = null;

  constructor(private readonly token: string) {
    setTimeout(() => {
      this.connected = true;
      this.deliver('connect', {});
    }, 50);
  }

  deliver(event: string, payload: unknown) {
    this.listeners.get(event)?.forEach((l) => l(payload as never));
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }

  off(event: string, fn?: Listener) {
    if (fn) this.listeners.get(event)?.delete(fn);
    else this.listeners.delete(event);
  }

  disconnect() {
    this.connected = false;
    if (this.room?.socket === this) this.room.socket = null;
  }

  emit(event: string, payload: unknown, ack: (res: never) => void) {
    setTimeout(() => {
      try {
        ack({ ok: true, data: this.handle(event, payload as Record<string, unknown>) } as Ack<unknown> as never);
      } catch (e) {
        ack({ ok: false, error: (e as Error).message } as never);
      }
    }, 60);
  }

  private handle(event: string, payload: Record<string, unknown>): unknown {
    if (event === 'time:ping') return { serverNow: now() };
    if (event === 'room:join' || event === 'room:resume') {
      const code = String(payload.code);
      if (!lookupMockRoom(code)) throw new Error('ROOM_NOT_FOUND');
      const room = rooms.get(code)!;
      if (room.players.length === 0) {
        room.players.push(bot('bot-1', '도토리박사', 'user'));
        room.hostId = 'bot-1';
      }
      const member = this.token === 'mock-member';
      const id = member ? 'me' : 'guest-me';
      if (!room.players.some((x) => x.p.participantId === id)) {
        if (room.phase !== 'lobby') throw new Error('ROOM_IN_PROGRESS');
        const nickname = member ? '치즈러버' : decodeURIComponent(this.token.split(':')[1] ?? '게스트');
        const pl = bot(id, nickname, member ? 'user' : 'guest');
        pl.p.ready = false;
        pl.p.userId = member ? 'u-me' : null;
        room.players.push(pl);
        // A created room is hosted by its creator; the demo room keeps the bot host.
        if (member && rooms.get(code)!.hostId === 'bot-1' && code !== '4827') room.hostId = id;
        if (room.players.length < 3) room.players.push(bot('bot-2', '소금빵', 'guest'));
      }
      this.participantId = id;
      this.room = room;
      room.socket = this;
      emit(room, 'room:participants', { hostParticipantId: room.hostId, participants: snapshot(room, id).participants });
      return snapshot(room, id);
    }
    const room = this.room;
    if (!room) throw new Error('NOT_IN_ROOM');
    const me = room.players.find((x) => x.p.participantId === this.participantId)!;
    switch (event) {
      case 'room:ready':
        me.p.ready = Boolean(payload.ready);
        emit(room, 'room:participants', { hostParticipantId: room.hostId, participants: snapshot(room, me.p.participantId).participants });
        // The bot host starts once everyone is ready.
        if (room.hostId !== me.p.participantId && me.p.ready) later(room, 1500, () => this.begin(room));
        return null;
      case 'room:start': {
        if (room.hostId !== me.p.participantId) throw new Error('NOT_HOST');
        const available = QUESTIONS.length;
        const requested = room.settings.questionCount;
        if (requested > available && payload.acceptShortageCount !== available) {
          return { status: 'shortage', available, requested };
        }
        this.begin(room);
        return { status: 'started', sessionId: `s-${room.sessionNo}` };
      }
      case 'room:submit': {
        if (room.phase !== 'question') return { status: 'late', final: true } satisfies SubmitAnswerResult;
        if (payload.questionIndex !== room.index) throw new Error('STALE_QUESTION');
        if (me.done) return { status: 'duplicate', final: true } satisfies SubmitAnswerResult;
        const m = room.questions[room.index]!;
        me.attempts += 1;
        const verdict = judge(m, String(payload.answer));
        if (verdict === 'correct') {
          const score = award(room, me, true);
          markDone(room, me);
          return { status: 'correct', score, final: true } satisfies SubmitAnswerResult;
        }
        if (m.pub.type !== 'chosung') {
          award(room, me, false);
          markDone(room, me);
          return { status: 'wrong', final: true } satisfies SubmitAnswerResult;
        }
        return verdict === 'near' ? { status: 'near', final: false } : { status: 'wrong', final: false };
      }
      case 'room:giveUp':
        if (!me.done) {
          award(room, me, false);
          markDone(room, me);
        }
        return null;
      case 'room:rematch':
        clearTimers(room);
        room.phase = 'lobby';
        room.index = -1;
        room.live = null;
        room.reveal = null;
        room.players.forEach((x) => Object.assign(x, { score: 0, correctCount: 0, totalResponseMs: 0, done: false }));
        room.players.forEach((x) => (x.p.ready = x.p.participantId.startsWith('bot')));
        room.version += 1;
        return snapshot(room, me.p.participantId);
      case 'room:leave':
        room.players = room.players.filter((x) => x !== me);
        return null;
      default:
        throw new Error('INTERNAL');
    }
  }

  private begin(room: Room) {
    if (room.phase !== 'lobby') return;
    room.sessionNo += 1;
    const pool = QUESTIONS.filter((q) => room.settings.types.includes(q.pub.type));
    room.questions = (pool.length ? pool : QUESTIONS).slice(0, room.settings.questionCount);
    room.index = -1;
    startQuestion(room);
  }
}

setMockSocketFactory((token) => new MockSocket(token));
