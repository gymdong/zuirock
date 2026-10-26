import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World, lobbyWith, sleep, type Client, type Server } from './harness.js';

/** 대결 채팅·스티커 (10/26): chosung answers through chat, wrong ones shown as typed, near never broadcast. */
describe('rooms chat + stickers', () => {
  let world: World;
  let server: Server;
  const answerOf = (id: string) => world.pool.questions.find((q) => q.public.id === id)!.answer;

  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  /** Lets the per-participant flood guard (0.7 s, fake clock) pass between lines. */
  const gap = () => world.clock.advance(1000);
  const chats = (c: Client) => c.events.filter((e) => e.ev === 'room:chat').map((e) => e.data);

  it('lobby chat reaches everyone; empty lines and floods are rejected; stickers broadcast', async () => {
    const { host, players } = await lobbyWith(server, 1);
    const g = players[0]!;
    expect(await host.ok('room:chat', { text: '  안녕하세요! 반가워요 이 문장은 서른 글자를 훌쩍 넘어가는 긴 문장입니다  ' })).toEqual({ status: 'sent' });
    const line = await g.next('room:chat');
    expect(line).toMatchObject({ kind: 'chat', nickname: '방장' });
    expect([...line.text].length).toBe(30);
    expect((await host.call('room:chat', { text: '연달아' })).error).toBe('RATE_LIMITED');
    expect((await g.call('room:chat', { text: '   ' })).error).toBe('CHAT_EMPTY');

    expect(await g.ok('room:sticker', { sticker: 'lol' })).toBeNull();
    expect(await host.next('room:sticker')).toMatchObject({ sticker: 'lol', nickname: '손님1' });
    expect((await g.call('room:sticker', { sticker: 'nope' })).error).toBe('BAD_STICKER');
  });

  it('chosung through chat: wrong is shown as typed, near only to the sender, correct without the answer; solvers cannot leak it', async () => {
    const { host, players } = await lobbyWith(server, 1, { types: ['chosung'], questionCount: 5, timeLimitSec: 45, chosungRevealSec: null });
    const g = players[0]!;
    await host.ok('room:start');
    const q = (await host.next('room:question', (e) => e.question.index === 0)).question;
    await g.next('room:question', (e) => e.question.index === 0);
    const answer = answerOf(q.question.id);

    expect(await g.ok('room:chat', { text: '전혀다른답' })).toEqual({ status: 'answer', result: { status: 'wrong', final: false } });
    expect(await host.next('room:chat')).toMatchObject({ kind: 'wrong', text: '전혀다른답', nickname: '손님1' });
    await gap();
    expect(await g.ok('room:chat', { text: answer.slice(0, 2) })).toEqual({ status: 'answer', result: { status: 'near', final: false } });
    await sleep(30);
    expect(chats(host).some((c) => c.text === answer.slice(0, 2))).toBe(false); // AC-M6: near never broadcast

    await gap();
    const solved = await host.ok('room:chat', { text: answer });
    expect(solved).toMatchObject({ status: 'answer', result: { status: 'correct', final: true } });
    const correct = await g.next('room:chat', (e) => e.kind === 'correct');
    expect(correct).toMatchObject({ nickname: '방장' });
    expect(correct).not.toHaveProperty('text');
    expect(JSON.stringify(chats(g))).not.toContain(answer);

    await gap();
    expect((await host.call('room:chat', { text: answer })).error).toBe('CHAT_ANSWER_LEAK');
    await gap(); // a refused line still counts for the flood guard
    expect(await host.ok('room:chat', { text: '쉬웠다ㅋㅋ' })).toEqual({ status: 'sent' });
    expect(await g.next('room:chat', (e) => e.kind === 'chat')).toMatchObject({ text: '쉬웠다ㅋㅋ' });
  });

  it('mcq: chat is plain chat and never counts as an answer', async () => {
    const { host, players } = await lobbyWith(server, 1, { types: ['mcq'], questionCount: 5 });
    await host.ok('room:start');
    await host.next('room:question', (e) => e.question.index === 0);
    expect(await players[0]!.ok('room:chat', { text: '2번 같아' })).toEqual({ status: 'sent' });
    expect(await host.next('room:chat')).toMatchObject({ kind: 'chat', text: '2번 같아' });
    expect(host.count('room:progress')).toBe(0);
  });

  it('host can turn chat off: lines and stickers are refused', async () => {
    const { host, players } = await lobbyWith(server, 1, { chat: false });
    expect((await host.call('room:chat', { text: '안녕' })).error).toBe('CHAT_OFF');
    expect((await players[0]!.call('room:sticker', { sticker: 'yay' })).error).toBe('CHAT_OFF');
  });
});
