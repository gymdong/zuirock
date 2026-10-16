import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World, lobbyWith, sleep, type Client, type Server } from './harness.js';
import type { Payload } from './harness.js';

describe('rooms battle (AC-M1, M2, M5–M11)', () => {
  let world: World;
  let server: Server;
  const answerOf = (id: string) => world.pool.questions.find((q) => q.public.id === id)!.answer;

  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  /** Waits for question `index` on every client and returns it (asserting everyone got the same one). */
  async function question(clients: Client[], index: number) {
    const qs = await Promise.all(clients.map((c) => c.next('room:question', (e) => e.question.index === index)));
    for (const q of qs) expect(q.question.question.id).toBe(qs[0].question.question.id);
    return qs[0].question;
  }

  it('serves matching, unique questions in one order; scores by server time; mcq is single-submit; reveal lasts 3 s', async () => {
    const { host, players } = await lobbyWith(server, 2, { minDifficulty: 3, questionCount: 5 });
    const all = [host, ...players];
    expect((await host.ok('room:start')).status).toBe('started');

    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      const q = await question(all, i);
      seen.push(q.question.id);
      expect(q.question).toMatchObject({ topicId: 'general', type: 'mcq' });
      expect(q.question.difficulty).toBeGreaterThanOrEqual(3);
      expect(q.question).not.toHaveProperty('answer');
      expect(q.deadlineAt - q.startedAt).toBe(30_000);

      if (i === 0) {
        await world.clock.advance(10_000);
        // remaining 20 s of 30 s → 100 + floor(20/30 × 50) = 133
        expect(await host.ok('room:submit', { questionIndex: 0, answer: answerOf(q.question.id) })).toEqual({ status: 'correct', score: 133, final: true });
        expect(await host.ok('room:submit', { questionIndex: 0, answer: answerOf(q.question.id) })).toEqual({ status: 'duplicate', final: true });
        expect(await players[0]!.ok('room:submit', { questionIndex: 0, answer: '가' })).toEqual({ status: 'wrong', final: true });
        await sleep(30);
        expect(host.count('room:reveal')).toBe(0); // players[1] has not answered yet
        await world.clock.advance(20_000); // deadline
        const reveal = (await host.next('room:reveal')).reveal;
        expect(reveal.reveal.answer).toBe(answerOf(q.question.id));
        expect(reveal.nextAt - world.clock.now()).toBe(3000);
        expect(reveal.scoreboard[0]).toMatchObject({ score: 133, correctCount: 1 });
        expect(await players[1]!.ok('room:submit', { questionIndex: 0, answer: '가' })).toEqual({ status: 'late', final: true });
      } else {
        for (const c of all) await c.ok('room:submit', { questionIndex: i, answer: '가' });
        // everyone submitted → reveal immediately, without waiting for the deadline
        expect((await host.next('room:reveal')).reveal.index).toBe(i);
      }
      await world.clock.advance(2999);
      await sleep(20);
      expect(host.count('room:question')).toBe(i + 1);
      await world.clock.advance(1);
    }
    expect(new Set(seen).size).toBe(5);
    const fin = await host.next('room:finished');
    expect(fin.results).toHaveLength(3);
  });

  it('chosung: multiple submissions, near only to the submitter, +30 before reveal, reveal broadcast, give up', async () => {
    const { host, players } = await lobbyWith(server, 1, {
      types: ['chosung'],
      questionCount: 5,
      timeLimitSec: 45,
      chosungRevealSec: 30,
    });
    const g = players[0]!;
    await host.ok('room:start');
    const q = await question([host, g], 0);
    expect(q.chosungRevealAt - q.startedAt).toBe(30_000);
    expect(q.question.answerLength).toBe([...answerOf(q.question.id)].length);
    const answer = answerOf(q.question.id);

    expect(await g.ok('room:submit', { questionIndex: 0, answer: answer.slice(0, 2) })).toEqual({ status: 'near', final: false });
    expect(await g.ok('room:submit', { questionIndex: 0, answer: '전혀다른답' })).toEqual({ status: 'wrong', final: false });
    await world.clock.advance(9_000);
    // remaining 36/45 → 100 + 40 + 30 (before reveal)
    expect(await host.ok('room:submit', { questionIndex: 0, answer })).toEqual({ status: 'correct', score: 170, final: true });
    expect(await host.ok('room:submit', { questionIndex: 0, answer })).toEqual({ status: 'duplicate', final: true });
    await world.clock.advance(21_000); // t = 30 s → chosung reveal
    expect((await g.next('room:chosungReveal')).chosung).toMatch(/^[ㄱ-ㅎ]+$/);
    // after the reveal: remaining 15/45 → 100 + 16, no +30
    expect(await g.ok('room:submit', { questionIndex: 0, answer })).toEqual({ status: 'correct', score: 116, final: true });
    await host.next('room:reveal');
    // `near` never reaches anyone else: the host saw only progress / lifecycle events
    expect(host.events.some((e) => JSON.stringify(e.data).includes('near'))).toBe(false);

    await world.clock.advance(3000);
    await question([host, g], 1);
    await host.ok('room:giveUp', { questionIndex: 1 });
    expect(await host.ok('room:submit', { questionIndex: 1, answer: '아무거나' })).toEqual({ status: 'duplicate', final: true });
    await sleep(20);
    expect(host.count('room:reveal')).toBe(1);
    await g.ok('room:giveUp', { questionIndex: 1 });
    expect((await host.next('room:reveal')).reveal.index).toBe(1);
  });

  it('shortage: host confirms M; the count is re-checked atomically at start', async () => {
    const { host } = await lobbyWith(server, 1, { topicIds: ['science'], minDifficulty: 1, questionCount: 10 });
    expect(await host.ok('room:start')).toEqual({ status: 'shortage', available: 4, requested: 10 });
    world.pool.questions = world.pool.questions.filter((q) => q.public.id !== 'sci-0'); // suspended meanwhile
    expect(await host.ok('room:start', { acceptShortageCount: 4 })).toEqual({ status: 'shortage', available: 3, requested: 10 });
    expect((await host.ok('room:start', { acceptShortageCount: 3 })).status).toBe('started');
    expect((await host.next('room:question')).question.total).toBe(3);
  });

  it('reconnect resumes the current question with a snapshot; missed questions score 0; host leaving does not stop the battle', async () => {
    const { code, host, players } = await lobbyWith(server, 2);
    const [g1, g2] = players as [Client, Client];
    const g1Token = (await g1.ok('room:resume', { code })).you.participantId as string;
    await host.ok('room:start');
    const q0 = await question([host, g1, g2], 0);
    g1.socket.disconnect();
    await host.next('room:participants', (e) => e.participants.some((p: Payload) => !p.connected));
    await host.ok('room:submit', { questionIndex: 0, answer: answerOf(q0.question.id) });
    await g2.ok('room:submit', { questionIndex: 0, answer: '가' });
    await host.next('room:reveal'); // disconnected g1 does not block "everyone submitted"
    await world.clock.advance(3000);
    await question([host, g2], 1);
    await world.clock.advance(5000);

    const g1b = await server.connect(g1.socket.auth ? (g1.socket.auth as { token: string }).token : '');
    const snap = await g1b.ok('room:resume', { code });
    expect(snap.you.participantId).toBe(g1Token);
    expect(snap.phase).toBe('question');
    expect(snap.question.index).toBe(1);
    expect(snap.question.deadlineAt - snap.serverNow).toBe(25_000);
    expect(snap.you.question).toMatchObject({ submitted: false, attempts: 0 });

    await host.ok('room:leave');
    for (let i = 1; i < 5; i++) {
      if (i > 1) await question([g1b, g2], i);
      await world.clock.advance(30_000);
      await g2.next('room:reveal', (e) => e.reveal.index === i);
      await world.clock.advance(3000);
    }
    const fin = await g1b.next('room:finished');
    const me = fin.results.find((r: Payload) => r.participantId === g1Token);
    expect(me).toMatchObject({ score: 0, correctCount: 0 });
    expect(fin.results.find((r: Payload) => r.kind === 'user')).toMatchObject({ left: true, correctCount: 1 });
    const logs = world.ports.logs.filter((l) => l.owner.kind === 'guest' && l.questionId === q0.question.id);
    expect(logs.some((l) => !l.submitted && !l.correct)).toBe(true);
  });

  it('ranks ties, records results idempotently in one transaction, and rematches with the same code and fresh questions', async () => {
    const { code, host, players } = await lobbyWith(server, 2, { questionCount: 5 });
    const [g1, g2] = players as [Client, Client];
    const all = [host, g1, g2];
    const settings = (await host.ok('room:resume', { code })).settings;
    await host.ok('room:start');
    const first: string[] = [];
    for (let i = 0; i < 5; i++) {
      const q = await question(all, i);
      first.push(q.question.id);
      await host.ok('room:submit', { questionIndex: i, answer: answerOf(q.question.id) });
      await g1.ok('room:submit', { questionIndex: i, answer: answerOf(q.question.id) });
      await g2.ok('room:submit', { questionIndex: i, answer: '가' });
      await host.next('room:reveal');
      await world.clock.advance(3000);
    }
    const [hf, gf] = await Promise.all([host.next('room:finished'), g1.next('room:finished')]);
    expect(hf.results.map((r: Payload) => r.rank)).toEqual([1, 1, 3]);
    expect(hf.you.xp.granted).toBe(100);
    expect(gf.you).toMatchObject({ canSaveByLogin: true, xp: { granted: 0, ineligibleReason: 'GUEST' } });
    expect(gf.you.xp.guestPreviewMax).toBeGreaterThan(0);
    expect(hf.you.wrongNotesAdded).toBe(0);

    expect(world.repo.results).toHaveLength(3);
    expect(world.ports.logs).toHaveLength(15);
    expect(world.repo.transactions).toBe(1);
    // re-running the recording for the same session writes nothing new
    const state = (await server.engine.getRoom(code))!;
    await server.results.record(state, await world.pool.loadQuestions(state.session!.questionIds));
    expect(world.repo.results).toHaveLength(3);
    expect(world.ports.logs).toHaveLength(15);
    expect(world.ports.xp).toHaveLength(1);
    expect(world.ports.xpRequests.every((r) => r.context.kind === 'battle' && r.context.rematch === false)).toBe(true);

    expect(world.ports.xpRequests).toHaveLength(6); // the re-run asked again; the fake port returned the same entry

    // 한 판 더
    const back = await g2.ok('room:rematch');
    expect(back).toMatchObject({ code, phase: 'lobby', settings });
    expect((await host.next('room:state')).phase).toBe('lobby');
    for (const g of [g1, g2]) await g.ok('room:ready', { ready: true });
    await host.ok('room:start');
    const second: string[] = [];
    for (let i = 0; i < 5; i++) {
      const q = await question(all, i);
      second.push(q.question.id);
      for (const c of all) await c.ok('room:submit', { questionIndex: i, answer: '가' });
      await host.next('room:reveal');
      await world.clock.advance(3000);
    }
    await host.next('room:finished');
    expect(second.filter((id) => first.includes(id))).toEqual([]);
    expect(world.ports.xpRequests.slice(6).every((r) => r.context.kind === 'battle' && r.context.rematch)).toBe(true);
  });
});
