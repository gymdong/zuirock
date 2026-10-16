import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SETTINGS, World, type Server } from './harness.js';

/** AC-A7: 대결 신청 creates the room, inbox invites for friends and the share link. */
describe('invites', () => {
  let world: World;
  let server: Server;
  beforeEach(async () => {
    world = new World();
    server = await world.boot();
    world.invites.addFriends('a', 'b');
  });
  afterEach(() => world.dispose());

  it('creates inbox invites for friends only; accept returns the room; decline removes it', async () => {
    const forbidden = await server.http('POST', '/rooms', 'u:a:회원A', { settings: SETTINGS, inviteFriendIds: ['stranger'] });
    expect(forbidden.status).toBe(403);

    const created = await server.http('POST', '/rooms', 'u:a:회원A', { settings: SETTINGS, inviteFriendIds: ['b'] });
    expect(created.status).toBe(201);
    const code = created.body.code;
    expect(created.body.inviteUrl).toBe(`https://zuirock.test/join/${code}`);

    expect((await server.http('GET', '/invites', 'g:guest')).status).toBe(401);
    const inbox = await server.http('GET', '/invites', 'u:b:회원B');
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0]).toMatchObject({ roomCode: code, status: 'pending', from: { userId: 'a' } });

    const accepted = await server.http('POST', `/invites/${inbox.body[0].id}/accept`, 'u:b:회원B');
    expect(accepted.body).toEqual({ roomCode: code, inviteUrl: `https://zuirock.test/join/${code}` });
    expect((await server.http('POST', `/invites/${inbox.body[0].id}/decline`, 'u:b:회원B')).status).toBe(404);
    expect((await server.http('GET', '/invites', 'u:b:회원B')).body).toHaveLength(0);

    // invite more friends from inside the lobby
    world.invites.addFriends('a', 'c');
    const host = await server.connect('u:a:회원A');
    await host.ok('room:join', { code });
    const more = await server.http('POST', `/rooms/${code}/invites`, 'u:a:회원A', { userIds: ['c'] });
    expect(more.status).toBe(201);
    const inboxC = await server.http('GET', '/invites', 'u:c:회원C');
    await server.http('POST', `/invites/${inboxC.body[0].id}/decline`, 'u:c:회원C');
    expect((await server.http('GET', '/invites', 'u:c:회원C')).body).toHaveLength(0);
  });
});
