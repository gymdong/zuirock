import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World, lobbyWith, sleep } from './harness.js';

describe('rooms start countdown', () => {
  let world: World;
  beforeEach(() => {
    world = new World();
    (world.cfg.room as { startCountdownMs: number }).startCountdownMs = 3000;
  });
  afterEach(() => world.dispose());

  it('opens the first question after the countdown: timer starts then, answers before it are refused', async () => {
    const server = await world.boot();
    const { host, players } = await lobbyWith(server, 2, { questionCount: 5 });
    const startAt = world.clock.now();
    expect((await host.ok('room:start')).status).toBe('started');
    const q = (await host.next('room:question')).question;
    expect(q.startedAt - startAt).toBe(3000);
    expect(q.deadlineAt - q.startedAt).toBe(30_000);

    await world.clock.advance(1000);
    const early = await players[0]!.call('room:submit', { questionIndex: 0, answer: '가' });
    expect(early.ok).toBe(false);

    await world.clock.advance(2000); // countdown over
    await sleep(20);
    const ok = await players[0]!.ok('room:submit', { questionIndex: 0, answer: '가' });
    expect(ok.status).toBe('wrong');
  });
});
