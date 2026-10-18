import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeQuestion } from './fakes/fakes.js';
import { World, lobbyWith, sleep, type Server } from './harness.js';

/** D-R2-1: chosungRevealSec is the REMAINING time N; reveal at timeLimit − N elapsed; +30 only before it. */
describe('chosung reveal at remaining N (D-R2-1) and 0.5-step difficulty', () => {
  let world: World;
  let server: Server;
  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  const answerOf = (id: string) => world.pool.questions.find((q) => q.public.id === id)!.answer;
  const score = (limit: number, atMs: number, bonus: boolean) => 100 + Math.floor(((limit * 1000 - atMs) / (limit * 1000)) * 50) + (bonus ? 30 : 0);

  it.each([
    { limit: 60, n: 45, revealAtMs: 15_000 },
    { limit: 30, n: 1, revealAtMs: 29_000 },
    { limit: 45, n: null, revealAtMs: null },
  ] as const)('limit $limit, N=$n → reveal at $revealAtMs ms elapsed', async ({ limit, n, revealAtMs }) => {
    const { host, players } = await lobbyWith(server, 1, { types: ['chosung'], timeLimitSec: limit, chosungRevealSec: n });
    const g = players[0]!;
    await host.ok('room:start');
    const q = (await host.next('room:question')).question;
    expect(q).toMatchObject({ timeLimitSec: limit, chosungRevealSec: n, deadlineAt: q.startedAt + limit * 1000 });
    expect(q.chosungRevealAt === null ? null : q.chosungRevealAt - q.startedAt).toBe(revealAtMs);
    const answer = answerOf(q.question.id);

    const before = (revealAtMs ?? limit * 1000) - 500;
    await world.clock.advance(before);
    expect(await host.ok('room:submit', { questionIndex: 0, answer })).toMatchObject({ score: score(limit, before, true) });
    await sleep(20);
    expect(g.count('room:chosungReveal')).toBe(0);
    if (revealAtMs === null) return;

    await world.clock.advance(500); // exactly at the reveal
    expect((await g.next('room:chosungReveal')).chosung).toMatch(/^[ㄱ-ㅎ]+$/);
    expect(await g.ok('room:submit', { questionIndex: 0, answer })).toMatchObject({ score: score(limit, revealAtMs, false) });
  });

  it('filters by a 0.5-step minimum difficulty and rejects other fractions', async () => {
    world.pool.questions.push(makeQuestion('mcq-25', 'general', 'mcq', 2.5, '정답25'));
    const { host, players } = await lobbyWith(server, 1, { minDifficulty: 2.5, questionCount: 7 });
    const settings = { topicIds: ['general'], types: ['mcq'], questionCount: 7, minDifficulty: 2.3, timeLimitSec: 30, chosungRevealSec: null };
    expect((await host.call('room:updateSettings', { settings })).error).toBe('INVALID_SETTINGS');
    await host.ok('room:start');
    const diffs: number[] = [];
    for (let i = 0; i < 7; i++) {
      const q = (await host.next('room:question', (e) => e.question.index === i)).question;
      diffs.push(q.question.difficulty);
      for (const c of [host, ...players]) await c.ok('room:submit', { questionIndex: i, answer: '가' });
      await host.next('room:reveal');
      await world.clock.advance(3000);
    }
    // pool ★≥2.5 = six ★3 + one ★2.5; the ★2 questions never appear
    expect(diffs.sort()).toEqual([2.5, 3, 3, 3, 3, 3, 3]);
  });
});
