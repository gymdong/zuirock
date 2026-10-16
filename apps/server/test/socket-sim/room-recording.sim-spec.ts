import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});
