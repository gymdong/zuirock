import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeQuestion } from '../support/app.js';
import { createRoomApp } from './lc-room-app.js';

/** AC-A7 against PrismaInviteRepository and the real auth verifier. */
describe('invites (real DB)', () => {
  let t: Awaited<ReturnType<typeof createRoomApp>>;
  beforeAll(async () => {
    t = await createRoomApp();
    await makeQuestion(t.prisma, { topicId: 'science', type: 'mcq', difficulty: 2 });
  });
  afterAll(() => t.close());

  it('room creation invites friends only; inbox shows sender and code; accept / decline', async () => {
    const a = await t.member('회원A');
    const b = await t.member('회원B');
    const stranger = await t.member('남남');
    const [low, high] = [a.userId, b.userId].sort();
    await t.prisma.friendship.create({ data: { userLowId: low!, userHighId: high!, requesterId: a.userId, status: 'accepted' } });
    const settings = { topicIds: ['science'], types: ['mcq'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null };

    await t.http().post('/api/rooms').set('Authorization', a.auth).send({ settings, inviteFriendIds: [stranger.userId] }).expect(403);
    await t.http().post('/api/rooms').send({ settings }).expect(401);
    const created = await t.http().post('/api/rooms').set('Authorization', a.auth).send({ settings, inviteFriendIds: [b.userId] }).expect(201);
    const code = created.body.code as string;
    expect(created.body.inviteUrl).toBe(`https://zuirock.test/join/${code}`);
    expect(await t.prisma.room.count({ where: { code, status: 'lobby' } })).toBe(1);

    const inbox = await t.http().get('/api/invites').set('Authorization', b.auth).expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ roomCode: code, status: 'pending', from: { userId: a.userId, nickname: '회원A', level: 1 } });
    // expiresAt comes from the fake room clock, createdAt from the DB's real now(): compare against the fake clock.
    expect(Date.parse(inbox.body[0].expiresAt) - t.clock.now()).toBeGreaterThan(29 * 60_000);

    await t.http().post(`/api/invites/${inbox.body[0].id}/accept`).set('Authorization', stranger.auth).expect(404);
    const acc = await t.http().post(`/api/invites/${inbox.body[0].id}/accept`).set('Authorization', b.auth).expect(200);
    expect(acc.body.roomCode).toBe(code);
    await t.http().post(`/api/invites/${inbox.body[0].id}/decline`).set('Authorization', b.auth).expect(404);
    expect((await t.http().get('/api/invites').set('Authorization', b.auth)).body).toHaveLength(0);
    expect((await t.http().get(`/api/rooms/${code}`).expect(200)).body).toMatchObject({ code, joinable: true, hostNickname: '회원A' });
  });
});
