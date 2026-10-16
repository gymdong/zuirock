import type {
  Ack,
  RoomErrorCode,
  RoomSnapshotDto,
  StartRoomResult,
  SubmitAnswerResult,
} from '@zuirock/shared';
import { useSyncExternalStore } from 'react';
import { syncClock, TimeSync } from '../lib/timeSync';
import { applyRoomEvent, applySnapshot, EMPTY_ROOM, type RoomView } from '../realtime/roomReducer';
import { createRoomSocket, type RoomSocket } from '../realtime/socket';
import { session } from './session';

export type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting';

export interface RoomStoreState extends RoomView {
  code: string | null;
  connection: Connection;
  error: string | null;
}

const ERROR_COPY: Record<RoomErrorCode, string> = {
  UNAUTHORIZED: '다시 로그인하거나 닉네임으로 입장해 주세요.',
  ROOM_NOT_FOUND: '방을 찾을 수 없어요. 코드를 확인해 주세요.',
  ROOM_FULL: '방이 가득 찼어요 (최대 8명).',
  ROOM_IN_PROGRESS: '이미 대결이 시작된 방이에요.',
  ROOM_DISSOLVED: '방이 사라졌어요.',
  NOT_IN_ROOM: '방에 참가하지 않았어요.',
  NOT_HOST: '방장만 할 수 있어요.',
  WRONG_PHASE: '지금은 할 수 없어요.',
  INVALID_SETTINGS: '방 설정을 확인해 주세요.',
  INVALID_NICKNAME: '닉네임은 2~10자로 입력해 주세요.',
  NOT_ENOUGH_PLAYERS: '2명 이상 모여야 시작할 수 있어요.',
  NOT_ALL_READY: '모두 준비 완료해야 시작할 수 있어요.',
  NO_QUESTIONS: '조건에 맞는 문제가 없어요. 설정을 바꿔 주세요.',
  STALE_QUESTION: '이미 다음 문제로 넘어갔어요.',
  RATE_LIMITED: '너무 빨라요. 잠시 후 다시 시도해 주세요.',
  INTERNAL: '서버에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
};

export function roomErrorMessage(code: RoomErrorCode, fallback?: string): string {
  return ERROR_COPY[code] ?? fallback ?? ERROR_COPY.INTERNAL;
}

class RoomError extends Error {
  constructor(readonly code: RoomErrorCode, message: string) {
    super(message);
  }
}

const SERVER_EVENTS = [
  'room:state',
  'room:participants',
  'room:settings',
  'room:question',
  'room:chosungReveal',
  'room:progress',
  'room:reveal',
  'room:finished',
  'room:dissolved',
] as const;

/** One live room per app: socket, versioned state and the server clock. */
class RoomStore {
  readonly clock = new TimeSync();
  private state: RoomStoreState = { ...EMPTY_ROOM, code: null, connection: 'idle', error: null };
  private listeners = new Set<() => void>();
  private socket: RoomSocket | null = null;
  private joined = false;

  get = () => this.state;
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(next: Partial<RoomStoreState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((l) => l());
  }

  private request<T>(event: string, payload: unknown, timeoutMs = 10_000): Promise<T> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new RoomError('NOT_IN_ROOM', ERROR_COPY.NOT_IN_ROOM));
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new RoomError('INTERNAL', '응답이 없어요. 연결을 확인해 주세요.')), timeoutMs);
      socket.emit(event, payload, ((res: Ack<T>) => {
        clearTimeout(timer);
        if (res.ok) resolve(res.data);
        else reject(new RoomError(res.error, roomErrorMessage(res.error, res.message)));
      }) as never);
    });
  }

  private onSnapshot(s: RoomSnapshotDto) {
    this.clock.observe(s.serverNow);
    this.set({ ...applySnapshot(this.state, s), error: null });
  }

  /**
   * Connect and enter `code`: `room:join` the first time (guests pass their nickname), then
   * `room:resume` after every reconnect.
   */
  async enter(code: string, nickname?: string): Promise<RoomSnapshotDto> {
    if (this.socket && this.state.code === code && this.joined && this.state.snapshot) return this.state.snapshot;
    this.close();
    const token = session.token();
    if (!token) throw new RoomError('UNAUTHORIZED', ERROR_COPY.UNAUTHORIZED);
    this.set({ ...EMPTY_ROOM, code, connection: 'connecting', error: null });
    const socket = createRoomSocket(token);
    this.socket = socket;

    for (const name of SERVER_EVENTS) {
      socket.on(name, ((payload: { serverNow: number }) => {
        this.clock.observe(payload.serverNow);
        this.set(applyRoomEvent(this.state, name, payload as never));
      }) as never);
    }
    socket.on('room:error', ((e: { code: RoomErrorCode; message?: string }) =>
      this.set({ error: roomErrorMessage(e.code, e.message) })) as never);
    socket.on('disconnect', (() => this.set({ connection: 'reconnecting' })) as never);
    socket.on('connect', (() => {
      this.set({ connection: 'connected' });
      void syncClock(this.clock, (clientSentAt) =>
        this.request<{ serverNow: number }>('time:ping', { clientSentAt }).then((r) => r.serverNow),
      );
      if (this.joined) {
        this.request<RoomSnapshotDto>('room:resume', { code, lastVersion: this.state.snapshot?.version })
          .then((s) => this.onSnapshot(s))
          .catch((e: RoomError) => this.set({ error: e.message }));
      }
    }) as never);

    const snapshot = await this.request<RoomSnapshotDto>('room:join', { code, nickname }, 30_000);
    this.joined = true;
    this.onSnapshot(snapshot);
    return snapshot;
  }

  ready(ready: boolean) {
    return this.request<null>('room:ready', { ready });
  }
  start(acceptShortageCount?: number) {
    return this.request<StartRoomResult>('room:start', acceptShortageCount ? { acceptShortageCount } : {});
  }
  submit(questionIndex: number, answer: string) {
    return this.request<SubmitAnswerResult>('room:submit', { questionIndex, answer });
  }
  giveUp(questionIndex: number) {
    return this.request<null>('room:giveUp', { questionIndex });
  }
  async rematch() {
    const s = await this.request<RoomSnapshotDto>('room:rematch', {});
    this.set({ finished: null });
    this.onSnapshot(s);
  }
  async leave() {
    try {
      await this.request<null>('room:leave', {}, 3000);
    } catch {
      // Leaving is best-effort; the seat times out server-side.
    }
    this.close();
  }

  close() {
    this.socket?.disconnect();
    this.socket = null;
    this.joined = false;
    this.clock.reset();
    this.set({ ...EMPTY_ROOM, code: null, connection: 'idle', error: null });
  }
}

export const roomStore = new RoomStore();

export function useRoom(): RoomStoreState {
  return useSyncExternalStore(roomStore.subscribe, roomStore.get, roomStore.get);
}
