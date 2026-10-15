import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { RedisService } from '../../common/redis.service.js';
import type { RoomQuestion } from './question-pool.js';
import { LEASE_RELEASE_LUA, LEASE_RENEW_LUA, ROOM_CAS_LUA } from './room-cas.lua.js';
import type { RoomState } from './room-state.js';
import { ROOM_OPTIONS, type RoomsOptions } from './rooms.tokens.js';

/** Safety-net TTL for room keys; the engine deletes rooms long before (finished + 1 h). */
const STATE_TTL_MS = 3 * 60 * 60 * 1000;

export type CasResult = { ok: true; version: number } | { ok: false; reason: 'conflict' | 'lease_lost' | 'gone' };

type ScriptRedis = Redis & {
  lcRoomCas(state: string, lease: string, expected: number, json: string, owner: string, ttl: number): Promise<number>;
  lcLeaseRenew(lease: string, owner: string, ttl: number): Promise<number>;
  lcLeaseRelease(lease: string, owner: string): Promise<number>;
};

/** Redis-backed room store: version CAS (room-cas.lua) fenced by a per-room lease. Keys under `lc:`. */
@Injectable()
export class RoomStore {
  private readonly redis: ScriptRedis;
  private readonly p: string;

  constructor(@Inject(RedisService) redis: RedisService, @Inject(ROOM_OPTIONS) options: RoomsOptions) {
    this.p = options.keyPrefix;
    const r = redis as unknown as ScriptRedis;
    if (typeof r.lcRoomCas !== 'function') {
      r.defineCommand('lcRoomCas', { numberOfKeys: 2, lua: ROOM_CAS_LUA });
      r.defineCommand('lcLeaseRenew', { numberOfKeys: 1, lua: LEASE_RENEW_LUA });
      r.defineCommand('lcLeaseRelease', { numberOfKeys: 1, lua: LEASE_RELEASE_LUA });
    }
    this.redis = r;
  }

  private stateKey(code: string): string {
    return `${this.p}room:${code}`;
  }
  private leaseKey(code: string): string {
    return `${this.p}room:${code}:lease`;
  }
  private questionsKey(code: string): string {
    return `${this.p}room:${code}:questions`;
  }
  private indexKey(): string {
    return `${this.p}rooms`;
  }

  /** Creates the room if the code is free and takes its lease. */
  async create(state: RoomState, owner: string, leaseMs: number): Promise<boolean> {
    const key = this.stateKey(state.code);
    const created = await this.redis.hsetnx(key, 'v', String(state.version));
    if (created === 0) return false;
    await this.redis
      .multi()
      .hset(key, 'd', JSON.stringify(state))
      .pexpire(key, STATE_TTL_MS)
      .set(this.leaseKey(state.code), owner, 'PX', leaseMs)
      .sadd(this.indexKey(), state.code)
      .exec();
    return true;
  }

  async exists(code: string): Promise<boolean> {
    return (await this.redis.exists(this.stateKey(code))) === 1;
  }

  async load(code: string): Promise<RoomState | null> {
    const json = await this.redis.hget(this.stateKey(code), 'd');
    return json ? (JSON.parse(json) as RoomState) : null;
  }

  /** Writes `next` (whose version must be expected + 1) if the version and lease still match. */
  async cas(next: RoomState, expected: number, owner: string): Promise<CasResult> {
    const res = await this.redis.lcRoomCas(
      this.stateKey(next.code),
      this.leaseKey(next.code),
      expected,
      JSON.stringify(next),
      owner,
      STATE_TTL_MS,
    );
    if (res >= 0) return { ok: true, version: res };
    return { ok: false, reason: res === -1 ? 'conflict' : res === -2 ? 'lease_lost' : 'gone' };
  }

  async remove(code: string, owner: string): Promise<void> {
    if ((await this.redis.get(this.leaseKey(code))) !== owner) return;
    await this.redis
      .multi()
      .del(this.stateKey(code), this.questionsKey(code), this.leaseKey(code))
      .srem(this.indexKey(), code)
      .exec();
  }

  async forget(code: string): Promise<void> {
    await this.redis.srem(this.indexKey(), code);
  }

  async listCodes(): Promise<string[]> {
    return this.redis.smembers(this.indexKey());
  }

  async saveQuestions(code: string, questions: readonly RoomQuestion[]): Promise<void> {
    await this.redis.set(this.questionsKey(code), JSON.stringify(questions), 'PX', STATE_TTL_MS);
  }

  async loadQuestions(code: string): Promise<RoomQuestion[]> {
    const json = await this.redis.get(this.questionsKey(code));
    return json ? (JSON.parse(json) as RoomQuestion[]) : [];
  }

  async acquireLease(code: string, owner: string, leaseMs: number): Promise<boolean> {
    return (await this.redis.set(this.leaseKey(code), owner, 'PX', leaseMs, 'NX')) === 'OK';
  }

  async renewLease(code: string, owner: string, leaseMs: number): Promise<boolean> {
    return (await this.redis.lcLeaseRenew(this.leaseKey(code), owner, leaseMs)) === 1;
  }

  async releaseLease(code: string, owner: string): Promise<void> {
    await this.redis.lcLeaseRelease(this.leaseKey(code), owner);
  }
}
