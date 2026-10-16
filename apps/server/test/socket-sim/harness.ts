import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, type Socket } from 'socket.io-client';
import { resolveConfig, type GrowthConfig } from '@zuirock/game-rules';
import type { RoomSettings } from '@zuirock/shared';
import { CommonModule } from '../../src/common/common.module.js';
import { RedisService } from '../../src/common/redis.service.js';
import { AUTH_VERIFIER } from '../../src/modules/rooms/auth-verifier.js';
import { QUESTION_POOL } from '../../src/modules/rooms/question-pool.js';
import { RoomEngine } from '../../src/modules/rooms/room-engine.service.js';
import { ROOM_RESULT_REPOSITORY } from '../../src/modules/rooms/room-result.repository.js';
import { RoomResultService } from '../../src/modules/rooms/room-result.service.js';
import { RoomsModule } from '../../src/modules/rooms/rooms.module.js';
import { ROOM_CLOCK, ROOM_CONFIG, ROOM_OPTIONS, ROOM_RNG } from '../../src/modules/rooms/rooms.tokens.js';
import { INVITE_REPOSITORY } from '../../src/modules/invites/invite.repository.js';
import { SOLVE_LOG_WRITER, STREAK_PORT, WRONG_NOTE_PORT, XP_GRANT_PORT } from '../../src/ports/index.js';
import {
  FakeAuthVerifier,
  FakeClock,
  FakeInviteRepository,
  FakePorts,
  FakeQuestionPool,
  FakeRoomResultRepository,
  makeQuestion,
} from './fakes/fakes.js';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Shared fakes; a "restart" boots a second app over the same world (Redis prefix, clock, DB fakes). */
export class World {
  readonly prefix = `lc:test:${randomUUID().slice(0, 8)}:`;
  readonly clock = new FakeClock();
  readonly repo = new FakeRoomResultRepository();
  readonly ports = new FakePorts();
  readonly invites = new FakeInviteRepository((roomId) => this.repo.rooms.get(roomId)?.code ?? '');
  readonly cfg: GrowthConfig = resolveConfig({ room: { leaseMs: 5000, leaseRenewMs: 150, recoveryScanMs: 150 } });
  pool = new FakeQuestionPool(defaultQuestions());
  private seed = 42;
  /** Deterministic rng (mulberry32). */
  readonly rng = () => {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  apps: Server[] = [];

  async boot(): Promise<Server> {
    @Global()
    @Module({
      providers: [
        { provide: AUTH_VERIFIER, useValue: new FakeAuthVerifier() },
        { provide: XP_GRANT_PORT, useValue: this.ports },
        { provide: SOLVE_LOG_WRITER, useValue: this.ports },
        { provide: WRONG_NOTE_PORT, useValue: this.ports },
        { provide: STREAK_PORT, useValue: this.ports },
      ],
      exports: [AUTH_VERIFIER, XP_GRANT_PORT, SOLVE_LOG_WRITER, WRONG_NOTE_PORT, STREAK_PORT],
    })
    class FakePortsModule {}

    const moduleRef = await Test.createTestingModule({ imports: [CommonModule, FakePortsModule, RoomsModule] })
      .overrideProvider(ROOM_CLOCK)
      .useValue(this.clock)
      .overrideProvider(ROOM_RNG)
      .useValue(this.rng)
      .overrideProvider(ROOM_CONFIG)
      .useValue(this.cfg)
      .overrideProvider(ROOM_OPTIONS)
      .useValue({ keyPrefix: this.prefix, publicOrigin: 'https://zuirock.test' })
      .overrideProvider(QUESTION_POOL)
      .useValue(this.pool)
      .overrideProvider(ROOM_RESULT_REPOSITORY)
      .useValue(this.repo)
      .overrideProvider(INVITE_REPOSITORY)
      .useValue(this.invites)
      .compile();
    const app = moduleRef.createNestApplication({ logger: ['error'] });
    app.setGlobalPrefix('api');
    await app.listen(0);
    const server = new Server(app, this);
    this.apps.push(server);
    return server;
  }

  /** Deletes this world's Redis keys and closes every app. */
  async dispose(): Promise<void> {
    const redis = this.apps[0]?.app.get(RedisService);
    const keys = redis ? await redis.keys(`${this.prefix}*`) : [];
    if (redis && keys.length) await redis.del(...keys);
    for (const s of this.apps) await s.close();
  }
}

export class Server {
  readonly url: string;
  readonly engine: RoomEngine;
  readonly results: RoomResultService;
  readonly clients: Client[] = [];
  private closed = false;

  constructor(
    readonly app: INestApplication,
    readonly world: World,
  ) {
    const addr = app.getHttpServer().address() as { port: number };
    this.url = `http://127.0.0.1:${addr.port}`;
    this.engine = app.get(RoomEngine);
    this.results = app.get(RoomResultService);
  }

  async connect(token: string): Promise<Client> {
    const socket = io(`${this.url}/rooms`, { transports: ['websocket'], auth: { token }, forceNew: true, reconnection: false });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (e) => reject(e));
    });
    const c = new Client(socket);
    this.clients.push(c);
    return c;
  }

  async http(method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${this.url}/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${encodeURIComponent(token)}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  /** Creates a room over REST as member `host` (token) and returns its code. */
  async createRoom(hostToken: string, settings: Partial<RoomSettings> = {}): Promise<string> {
    const res = await this.http('POST', '/rooms', hostToken, { settings: { ...SETTINGS, ...settings } });
    if (res.status !== 201) throw new Error(`create room ${res.status} ${JSON.stringify(res.body)}`);
    return res.body.code as string;
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const c of this.clients) c.socket.disconnect();
    await this.app.close();
  }
}

export class Client {
  readonly events: Array<{ ev: string; data: any; taken: boolean }> = [];
  constructor(readonly socket: Socket) {
    socket.onAny((ev: string, data: unknown) => this.events.push({ ev, data, taken: false }));
  }

  call<T = any>(ev: string, payload: unknown = {}): Promise<{ ok: boolean; data: T; error?: string }> {
    return new Promise((resolve) => this.socket.emit(ev, payload, resolve));
  }

  async ok<T = any>(ev: string, payload: unknown = {}): Promise<T> {
    const res = await this.call<T>(ev, payload);
    if (!res.ok) throw new Error(`${ev} failed: ${res.error}`);
    return res.data;
  }

  /** Next not-yet-taken event of this name (optionally matching), waiting up to `timeoutMs`. */
  async next(ev: string, pred: (d: any) => boolean = () => true, timeoutMs = 2000): Promise<any> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.events.find((e) => !e.taken && e.ev === ev && pred(e.data));
      if (hit) {
        hit.taken = true;
        return hit.data;
      }
      if (Date.now() > until) throw new Error(`timeout waiting for ${ev}`);
      await sleep(5);
    }
  }

  count(ev: string): number {
    return this.events.filter((e) => e.ev === ev).length;
  }

  last(ev: string): any {
    return [...this.events].reverse().find((e) => e.ev === ev)?.data;
  }
}

export const SETTINGS: RoomSettings = {
  topicIds: ['general'],
  types: ['mcq'],
  questionCount: 5,
  minDifficulty: 2,
  timeLimitSec: 30,
  chosungRevealSec: null,
};

/** general: 12 mcq (★2–3), 8 ox (★2), 6 chosung (★2); science: 4 mcq (★1), so ★2+ science has none. */
export function defaultQuestions() {
  const qs: Array<ReturnType<typeof makeQuestion>> = [];
  for (let i = 0; i < 12; i++) qs.push(makeQuestion(`mcq-${i}`, 'general', 'mcq', i % 2 ? 3 : 2, `정답${i}`));
  for (let i = 0; i < 8; i++) qs.push(makeQuestion(`ox-${i}`, 'general', 'ox', 2, i % 2 ? 'O' : 'X'));
  const words = ['세종대왕', '이순신', '훈민정음', '거북선', '경복궁', '한라산'];
  words.forEach((w, i) => qs.push(makeQuestion(`ch-${i}`, 'general', 'chosung', 2, w)));
  for (let i = 0; i < 4; i++) qs.push(makeQuestion(`sci-${i}`, 'science', 'mcq', 1, `과학${i}`));
  return qs;
}

/** Host member + N guests joined and ready. */
export async function lobbyWith(server: Server, guests: number, settings: Partial<RoomSettings> = {}) {
  const hostToken = `u:host-${randomUUID().slice(0, 6)}:방장`;
  const code = await server.createRoom(hostToken, settings);
  const host = await server.connect(hostToken);
  await host.ok('room:join', { code });
  const players: Client[] = [];
  for (let i = 0; i < guests; i++) {
    const c = await server.connect(`g:guest-${randomUUID().slice(0, 6)}`);
    await c.ok('room:join', { code, nickname: `손님${i + 1}` });
    await c.ok('room:ready', { ready: true });
    players.push(c);
  }
  return { code, host, hostToken, players };
}
