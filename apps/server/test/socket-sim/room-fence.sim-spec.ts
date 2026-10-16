import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RedisService } from '../../src/common/redis.service.js';
import { World, lobbyWith, sleep, type Server } from './harness.js';

/** AC-M8 fencing: single-instance restart recovery, lease expiry after a crash, lost lease ⇒ silence. */
describe('rooms fence (CAS + lease)', () => {
  let world: World;
  let server: Server;
  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  const leaseKey = (code: string) => `${world.prefix}room:${code}:lease`;

  async function inQuestion() {
    const lobby = await lobbyWith(server, 1);
    await lobby.host.ok('room:start');
    const q = await lobby.host.next('room:question');
    return { ...lobby, q };
  }

  it('graceful restart (SIGTERM path): leases are released, the new instance recovers and fires the overdue deadline at once', async () => {
    const { code, hostToken, q } = await inQuestion();
    expect(server.engine.ownsRoom(code)).toBe(true);
    await server.close();
    const redis = world.apps[0]!.app.get(RedisService);
    expect(await redis.exists(leaseKey(code))).toBe(0);

    await world.clock.advance(40_000); // deadline passes while nobody runs the room
    const next = await world.boot();
    expect(next.engine.ownsRoom(code)).toBe(true);
    const host = await next.connect(hostToken);
    const snap = await host.ok('room:resume', { code });
    expect(snap.phase).toBe('reveal');
    expect(snap.reveal.index).toBe(0);
    expect(snap.reveal.nextAt).toBe(world.clock.now() + 3000);
    expect(snap.version).toBeGreaterThan(q.version);
    await world.clock.advance(3000);
    expect((await host.next('room:question')).question.index).toBe(1);
  });

  it('crash: a dead instance lease blocks recovery only until it expires', async () => {
    const { code, hostToken } = await inQuestion();
    const redis = server.app.get(RedisService);
    await redis.set(leaseKey(code), 'dead-instance', 'PX', 600);
    await server.close(); // its release does not touch a lease it no longer holds
    await world.clock.advance(31_000);
    const next = await world.boot();
    expect(next.engine.ownsRoom(code)).toBe(false);
    await sleep(900);
    expect(next.engine.ownsRoom(code)).toBe(true);
    const host = await next.connect(hostToken);
    expect((await host.ok('room:resume', { code })).phase).toBe('reveal');
  });

  it('an instance that lost its lease emits nothing and clears its timers', async () => {
    const { code, host, players, q } = await inQuestion();
    const g = players[0]!;
    const redis = server.app.get(RedisService);
    await redis.set(leaseKey(code), 'other-instance', 'PX', 60_000);
    await sleep(400); // renew interval (150 ms) notices the loss
    expect(server.engine.ownsRoom(code)).toBe(false);

    const before = host.events.length + g.events.length;
    await world.clock.advance(60_000); // the old deadline timer must not fire
    const submit = await g.call('room:submit', { questionIndex: q.question.index, answer: '가' });
    expect(submit.ok).toBe(false);
    await sleep(100);
    expect(host.events.length + g.events.length).toBe(before);
    const state = (await server.engine.getRoom(code))!;
    expect(state.phase).toBe('question');
    expect(state.version).toBe(q.version);
    await redis.del(leaseKey(code));
  });
});
