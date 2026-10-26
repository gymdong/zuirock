import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { roomKeyPrefix } from '../../src/modules/rooms/rooms.tokens.js';
import { World, lobbyWith, sleep, type Client, type Server } from './harness.js';

/** Result recording retries: 3 attempts with backoff, then a pending record the recovery scan retries. */
describe('rooms result recording retry', () => {
  let world: World;
  let server: Server;
  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  async function playToEnd(all: Client[]) {
    for (let i = 0; i < 5; i++) {
      const q = await all[0]!.next('room:question', (e) => e.question.index === i);
      const answer = world.pool.questions.find((x) => x.public.id === q.question.question.id)!.answer;
      for (const c of all) await c.ok('room:submit', { questionIndex: i, answer });
      await all[0]!.next('room:reveal');
      await world.clock.advance(3000);
    }
  }

  it('retries with backoff and announces the real XP once a later attempt succeeds', async () => {
    const { host, players } = await lobbyWith(server, 1);
    await host.ok('room:start');
    world.ports.failGrants = 2;
    await playToEnd([host, ...players]);
    await sleep(50);
    expect(host.count('room:finished')).toBe(0);
    await world.clock.advance(1000); // attempt 2 fails
    await sleep(50);
    await world.clock.advance(2000); // attempt 3 succeeds
    const fin = await host.next('room:finished');
    expect(fin.you.xp.granted).toBe(100);
    expect(host.count('room:finished')).toBe(1);
    expect(await world.redis.smembers(`${world.prefix}pending`)).toEqual([]);
  });

  it('after 3 failures announces 0 XP, keeps a pending record, and the recovery scan records it and re-announces', async () => {
    const { host, players } = await lobbyWith(server, 1);
    await host.ok('room:start');
    world.ports.failGrants = 3;
    await playToEnd([host, ...players]);
    await sleep(50);
    await world.clock.advance(1000);
    await sleep(50);
    await world.clock.advance(2000);
    const first = await host.next('room:finished');
    expect(first.you.xp.granted).toBe(0);
    expect(await world.redis.smembers(`${world.prefix}pending`)).toHaveLength(1);
    // the scan retries after 15 scans (150 ms each in tests)
    const fin = await host.next('room:finished', () => true, 5000);
    expect(fin.you.xp.granted).toBe(100);
    expect(fin.version).toBeGreaterThan(first.version);
    expect(world.repo.results).toHaveLength(2);
    expect(await world.redis.smembers(`${world.prefix}pending`)).toEqual([]);
  });

  const pendingIds = () => world.redis.smembers(`${world.prefix}pending`);
  const dead = async () => (await world.redis.keys(`${world.prefix}pending-dead:*`)).length;

  async function finishedWithFailures(error?: Error & { code?: string }) {
    const { host, players } = await lobbyWith(server, 1);
    await host.ok('room:start');
    world.ports.failGrants = 1000;
    if (error) world.ports.failError = error;
    await playToEnd([host, ...players]);
    for (const ms of [0, 1000, 2000]) {
      await sleep(50);
      await world.clock.advance(ms); // attempts 1–3 → 0 XP announced
    }
    await sleep(50);
    return host;
  }

  it('drops a non-retryable record (FK violation P2003) after one attempt and still announces', async () => {
    const host = await finishedWithFailures(Object.assign(new Error('Foreign key constraint violated on BattleResult_roomSessionId_fkey'), { code: 'P2003' }));
    expect((await host.next('room:finished')).you.xp.granted).toBe(0);
    expect(await pendingIds()).toEqual([]);
    expect(await dead()).toBe(0);
    // Let the first (failing) attempt settle before snapshotting, or a slow machine counts it after the snapshot.
    let failuresBefore = world.ports.failGrants;
    for (let i = 0; i < 20; i++) {
      await sleep(100);
      if (world.ports.failGrants === failuresBefore) break;
      failuresBefore = world.ports.failGrants;
    }
    await world.clock.advance(10_000);
    await sleep(2600); // > one pending retry period (15 scans × 150 ms)
    expect(world.ports.failGrants).toBe(failuresBefore); // never retried
  });

  it('dead-letters a record older than 1 h and one that reached 20 attempts', async () => {
    await finishedWithFailures();
    const [sid] = await pendingIds();
    expect(sid).toBeDefined();
    await world.clock.advance(61 * 60_000);
    for (let i = 0; i < 100 && (await pendingIds()).length; i++) await sleep(50);
    expect(await pendingIds()).toEqual([]);
    expect(JSON.parse((await world.redis.get(`${world.prefix}pending-dead:${sid}`))!).reason).toBe('max_age');
    expect(await world.redis.pttl(`${world.prefix}pending-dead:${sid}`)).toBeGreaterThan(23 * 3600_000);

    await finishedWithFailures();
    const [sid2] = await pendingIds();
    const key = `${world.prefix}pending:${sid2}`;
    await world.redis.set(key, JSON.stringify({ ...JSON.parse((await world.redis.get(key))!), attempts: 19 }), 'KEEPTTL');
    for (let i = 0; i < 100 && (await pendingIds()).length; i++) await sleep(50);
    expect(await pendingIds()).toEqual([]);
    expect(JSON.parse((await world.redis.get(`${world.prefix}pending-dead:${sid2}`))!).attempts).toBe(20);
  });

  it('scopes Redis keys per database unless ROOM_KEY_PREFIX is set', () => {
    const a = roomKeyPrefix({ DATABASE_URL: 'postgresql://u:p@h:5432/zuirock_test_lb' });
    const b = roomKeyPrefix({ DATABASE_URL: 'postgresql://u:p@h:5432/zuirock' });
    expect(a).toMatch(/^lc:[0-9a-f]{8}:$/);
    expect(a).not.toBe(b);
    expect(roomKeyPrefix({ DATABASE_URL: 'postgresql://x:y@other:6543/zuirock?pgbouncer=true' })).toBe(b);
    expect(roomKeyPrefix({ ROOM_KEY_PREFIX: 'lc:e2e:' })).toBe('lc:e2e:');
  });
});
