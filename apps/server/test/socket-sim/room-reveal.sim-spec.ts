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

  it('첫 글자 힌트: 초성이 열리고 15초 뒤 같은 이벤트로 첫 글자만 열린다(꺼져 있으면 열리지 않는다)', async () => {
    const { host, players } = await lobbyWith(server, 1, { types: ['chosung'], timeLimitSec: 60, chosungRevealSec: 45, firstLetterHint: true });
    const g = players[0]!;
    await host.ok('room:start');
    const q = (await host.next('room:question')).question;
    expect(q.firstLetterRevealAt - q.startedAt).toBe(30_000);
    const answer = answerOf(q.question.id);

    await world.clock.advance(15_000); // 초성 공개
    expect((await g.next('room:chosungReveal')).chosung).toMatch(/^[ㄱ-ㅎ]+$/);
    await world.clock.advance(14_999);
    await sleep(20);
    expect(g.count('room:chosungReveal')).toBe(1); // 아직 첫 글자 전
    await world.clock.advance(1); // 초성 공개 + 15초
    const hint = (await g.next('room:chosungReveal')).chosung as string;
    expect(hint[0]).toBe(answer[0]);
    expect(hint.slice(1)).toMatch(/^[ㄱ-ㅎ]+$/);
  });

  it('첫 글자 힌트가 꺼져 있으면 초성만 한 번 열린다', async () => {
    const { host, players } = await lobbyWith(server, 1, { types: ['chosung'], timeLimitSec: 60, chosungRevealSec: 45 });
    const g = players[0]!;
    await host.ok('room:start');
    const q = (await host.next('room:question')).question;
    expect(q.firstLetterRevealAt).toBeNull();
    await world.clock.advance(40_000);
    await sleep(30);
    expect(g.count('room:chosungReveal')).toBe(1);
  });

  it('첫 글자 힌트를 켜도 초성이 15초 남기고 열리면(열 시간이 없으면) 첫 글자는 열리지 않고 오류도 아니다', async () => {
    const { host, players } = await lobbyWith(server, 1, { types: ['chosung'], timeLimitSec: 30, chosungRevealSec: 15, firstLetterHint: true });
    const g = players[0]!;
    await host.ok('room:start');
    const q = (await host.next('room:question')).question;
    expect(q.chosungRevealAt - q.startedAt).toBe(15_000);
    expect(q.firstLetterRevealAt).toBeNull();
    await world.clock.advance(29_000);
    await sleep(30);
    expect(g.count('room:chosungReveal')).toBe(1); // 초성 한 번만
  });

  it('난이도 범위 ★min~★max: 범위 밖 문제는 나오지 않고, max < min 은 거절된다', async () => {
    world.pool.questions.push(makeQuestion('mcq-25b', 'general', 'mcq', 2.5, '정답25b'), makeQuestion('mcq-4', 'general', 'mcq', 4, '정답4'), makeQuestion('mcq-45', 'general', 'mcq', 4.5, '정답45'));
    const { host, players } = await lobbyWith(server, 1, { minDifficulty: 2.5, maxDifficulty: 3, questionCount: 5 });
    const bad = { topicIds: ['general'], types: ['mcq'], questionCount: 5, minDifficulty: 3, maxDifficulty: 2.5, timeLimitSec: 30, chosungRevealSec: null };
    expect((await host.call('room:updateSettings', { settings: bad })).error).toBe('INVALID_SETTINGS');
    await host.ok('room:start');
    const diffs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const q = (await host.next('room:question', (e) => e.question.index === i)).question;
      diffs.push(q.question.difficulty);
      for (const c of [host, ...players]) await c.ok('room:submit', { questionIndex: i, answer: '가' });
      await host.next('room:reveal');
      await world.clock.advance(3000);
    }
    expect(diffs.every((d) => d >= 2.5 && d <= 3)).toBe(true);
  });
});
