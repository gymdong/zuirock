import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { World, sleep, type Server } from './harness.js';
import type { Payload } from './harness.js';

describe('rooms lobby (AC-M3, AC-M4, AC-A7 link)', () => {
  let world: World;
  let server: Server;
  beforeEach(async () => {
    world = new World();
    server = await world.boot();
  });
  afterEach(() => world.dispose());

  it('creates a 4-digit room with an invite link; guests join by code with deduplicated nicknames', async () => {
    const res = await server.http('POST', '/rooms', 'u:a:회원A', { settings: { topicIds: ['general'], types: ['mcq'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null } });
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^\d{4}$/);
    expect(res.body.inviteUrl).toBe(`https://zuirock.test/join/${res.body.code}`);
    const code = res.body.code as string;

    const host = await server.connect('u:a:회원A');
    const snap = await host.ok('room:join', { code });
    expect(snap.phase).toBe('lobby');
    expect(snap.hostParticipantId).toBe(snap.you.participantId);

    const g1 = await server.connect('g:g1');
    const g2 = await server.connect('g:g2');
    expect((await g1.ok('room:join', { code, nickname: '쥐돌이' })).participants.at(-1).nickname).toBe('쥐돌이');
    expect((await g2.ok('room:join', { code, nickname: '쥐돌이' })).participants.at(-1).nickname).toBe('쥐돌이2');
    expect((await (await server.connect('g:g3')).call('room:join', { code, nickname: '쥐' })).error).toBe('INVALID_NICKNAME');
    expect((await server.http('GET', `/rooms/${code}`)).body).toMatchObject({ code, phase: 'lobby', joinable: true, participantCount: 3 });
    expect((await (await server.connect('bad-token').catch((e) => e)).message)).toBe('UNAUTHORIZED');
  });

  it('rejects the 9th participant and joins after start', async () => {
    const code = await server.createRoom('u:h:방장');
    const host = await server.connect('u:h:방장');
    await host.ok('room:join', { code });
    const guests = [];
    for (let i = 0; i < 7; i++) {
      const g = await server.connect(`g:p${i}`);
      await g.ok('room:join', { code, nickname: `손님${i}` });
      await g.ok('room:ready', { ready: true });
      guests.push(g);
    }
    const ninth = await server.connect('g:p9');
    expect((await ninth.call('room:join', { code, nickname: '아홉번째' })).error).toBe('ROOM_FULL');
    expect((await server.http('GET', `/rooms/${code}`)).body.joinable).toBe(false);

    await guests[6]!.ok('room:leave');
    expect((await host.ok('room:start')).status).toBe('started');
    expect((await ninth.call('room:join', { code, nickname: '늦은손님' })).error).toBe('ROOM_IN_PROGRESS');
  });

  it('start needs ≥ 2 players, host only, all non-hosts ready; settings are validated', async () => {
    const code = await server.createRoom('u:h:방장');
    const host = await server.connect('u:h:방장');
    await host.ok('room:join', { code });
    expect((await host.call('room:start')).error).toBe('NOT_ENOUGH_PLAYERS');
    const g = await server.connect('g:x');
    await g.ok('room:join', { code, nickname: '손님' });
    expect((await host.call('room:start')).error).toBe('NOT_ALL_READY');
    expect((await g.call('room:start')).error).toBe('NOT_HOST');
    // reveal must be < time limit (30 s limit + 30 s reveal is rejected)
    const bad = { topicIds: ['general'], types: ['chosung'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: 30 };
    expect((await host.call('room:updateSettings', { settings: bad })).error).toBe('INVALID_SETTINGS');
    const good = { ...bad, timeLimitSec: 45 };
    await host.ok('room:updateSettings', { settings: good });
    expect((await g.next('room:settings')).settings.timeLimitSec).toBe(45);
    await g.ok('room:ready', { ready: true });
    const ready = await host.next('room:participants', (e) => e.participants.every((p: Payload) => p.isHost || p.ready));
    expect(ready.version).toBeGreaterThan(1);
    expect((await host.ok('room:start')).status).toBe('started');
  });

  it('hands the host seat to the next participant when the host leaves the lobby', async () => {
    const code = await server.createRoom('u:h:방장');
    const host = await server.connect('u:h:방장');
    await host.ok('room:join', { code });
    const g = await server.connect('g:x');
    const snap = await g.ok('room:join', { code, nickname: '손님' });
    await host.ok('room:leave');
    const ev = await g.next('room:participants', (e) => e.participants.length === 1);
    expect(ev.hostParticipantId).toBe(snap.you.participantId);
  });

  it('dissolves a lobby that does not start within 30 minutes', async () => {
    const code = await server.createRoom('u:h:방장');
    const host = await server.connect('u:h:방장');
    await host.ok('room:join', { code });
    await world.clock.advance(29 * 60_000);
    await sleep(30);
    expect(host.count('room:dissolved')).toBe(0);
    await world.clock.advance(60_000);
    expect((await host.next('room:dissolved')).reason).toBe('lobby_timeout');
    await sleep(30);
    expect((await server.http('GET', `/rooms/${code}`)).status).toBe(404);
  });
});
