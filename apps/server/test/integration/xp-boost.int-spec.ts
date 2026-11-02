import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { toKstDay } from '@zuirock/game-rules';
import { cryptoRng, EconomyService } from '../../src/modules/economy/economy.service.js';
import { grantedOn } from '../../src/modules/growth/xp.service.js';
import { QUESTION_POOL, type QuestionPool } from '../../src/modules/rooms/question-pool.js';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';
import { createRoomApp, until } from './lc-room-app.js';

const fixed = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

describe('경험치 부스트: chest reward, activation, bonus XP on solo sets', () => {
  let t: TestApp;
  const setRng = (r: () => number) => Object.assign(t.app.get(EconomyService) as object, { rng: r });
  const giveBoosts = (userId: string, quantity: number) =>
    t.prisma.userConsumable.upsert({ where: { userId_kind: { userId, kind: 'xp_boost' } }, create: { userId, kind: 'xp_boost', quantity }, update: { quantity } });
  const activate = (auth: string) => t.http().post('/api/me/boost/activate').set('Authorization', auth).set('Idempotency-Key', `k-${Math.random()}`).send({});
  const remaining = async (userId: string) => (await t.prisma.xpBoost.findUnique({ where: { userId } }))?.remainingSets ?? 0;
  const today = () => toKstDay(t.clock.now());

  beforeAll(async () => {
    t = await createTestApp();
    for (let i = 0; i < 30; i++) await makeQuestion(t.prisma, { difficulty: 2 });
  });
  afterAll(() => t.close());

  async function playStage(auth: string, correctN: number) {
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send({ kind: 'stage', topicId: 'science' }).expect(201);
    for (const [i, q] of s.body.questions.entries()) {
      const answer = i < correctN ? '정답' : '오답1';
      const r = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', auth).send({ questionId: q.id, answer, responseMs: 1, hintUsed: false }).expect(200);
      if (!r.body.final) await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/give-up`).set('Authorization', auth).send({ questionId: q.id }).expect(200);
    }
    return (await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/complete`).set('Authorization', auth).expect(200)).body;
  }

  it('quest/good chests can give an xp_boost; inventory lists it; at the 20 cap it becomes 30 cheese', async () => {
    const u = await makeUser(t);
    const c1 = await t.prisma.chest.create({ data: { userId: u.userId, tier: 'quest', questKey: `${today()}:stage` } });
    setRng(fixed(0, 0.1, 0.9, 0.99)); // quest: cheese 10, item hit, kind ≥ 0.5 → xp_boost, no protection
    const o1 = await t.http().post(`/api/me/chests/${c1.id}/open`).set('Authorization', u.auth).expect(200);
    expect(o1.body.rewards).toEqual([{ type: 'cheese', amount: 10 }, { type: 'item', kind: 'xp_boost', quantity: 1 }]);
    expect(o1.body.inventory.items).toContainEqual({ kind: 'xp_boost', owned: 1 });
    expect(o1.body.inventory.xpBoost).toEqual({ remainingSets: 0 });

    const c2 = await t.prisma.chest.create({ data: { userId: u.userId, tier: 'good', sourceTopicId: 'science', sourceLevel: 5 } });
    setRng(fixed(0, 0.1, 0.9, 0.99)); // good: weights 1:1:1, 0.9 → xp_boost
    const o2 = await t.http().post(`/api/me/chests/${c2.id}/open`).set('Authorization', u.auth).expect(200);
    expect(o2.body.rewards).toEqual([{ type: 'cheese', amount: 20 }, { type: 'item', kind: 'xp_boost', quantity: 1 }]);

    await giveBoosts(u.userId, 20);
    const c3 = await t.prisma.chest.create({ data: { userId: u.userId, tier: 'quest', questKey: `${today()}:battle` } });
    setRng(fixed(0, 0.1, 0.9, 0.99));
    const o3 = await t.http().post(`/api/me/chests/${c3.id}/open`).set('Authorization', u.auth).expect(200);
    expect(o3.body.rewards).toEqual([{ type: 'cheese', amount: 10 }, { type: 'cheese', amount: 30 }]);
    expect(o3.body.inventory.items).toContainEqual({ kind: 'xp_boost', owned: 20 });
    setRng(cryptoRng);

    const inv = await t.http().get('/api/me/inventory').set('Authorization', u.auth).expect(200);
    expect(inv.body.items.map((i: { kind: string }) => i.kind)).toEqual(['chosung_first', 'remove_wrong_choice', 'xp_boost']);
  });

  it('not a shop product and not a solo item', async () => {
    const u = await makeUser(t);
    await giveBoosts(u.userId, 1);
    const shop = await t.http().get('/api/shop').set('Authorization', u.auth).expect(200);
    expect(shop.body.items.map((i: { kind: string }) => i.kind)).toEqual(['streak_protection', 'chosung_first', 'remove_wrong_choice']);
    expect((await t.http().post('/api/shop/items/xp_boost/purchase').set('Authorization', u.auth).send({}).expect(404)).body.code).toBe('UNKNOWN_ITEM');
    const s = await t.http().post('/api/solo/sets').set('Authorization', u.auth).send({ kind: 'stage', topicId: 'science' }).expect(201);
    const use = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/items/use`).set('Authorization', u.auth).send({ questionId: s.body.questions[0].id, kind: 'xp_boost' }).expect(400);
    expect(use.body.code).toBe('BAD_KIND');
    expect((await t.prisma.userConsumable.findUniqueOrThrow({ where: { userId_kind: { userId: u.userId, kind: 'xp_boost' } } })).quantity).toBe(1);
  });

  it('activate: uses one item for 3 sets; 409 NO_ITEM without one; 409 BOOST_FULL past 9 (item kept); guests 401', async () => {
    const u = await makeUser(t);
    expect((await activate(u.auth).expect(409)).body.code).toBe('NO_ITEM');
    await giveBoosts(u.userId, 4);
    expect((await activate(u.auth).expect(200)).body).toEqual({ remainingSets: 3, owned: 3 });
    expect((await activate(u.auth).expect(200)).body).toEqual({ remainingSets: 6, owned: 2 });
    expect((await activate(u.auth).expect(200)).body).toEqual({ remainingSets: 9, owned: 1 });
    expect((await activate(u.auth).expect(409)).body.code).toBe('BOOST_FULL');
    const inv = await t.http().get('/api/me/inventory').set('Authorization', u.auth).expect(200);
    expect(inv.body.xpBoost).toEqual({ remainingSets: 9 });
    expect(inv.body.items).toContainEqual({ kind: 'xp_boost', owned: 1 });

    const p = await makeUser(t);
    await giveBoosts(p.userId, 1);
    const res = await Promise.all([activate(p.auth), activate(p.auth)]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await remaining(p.userId)).toBe(3);

    const g = await t.http().post('/api/guests').send({}).expect(201);
    await activate(`Bearer ${g.body.guestToken}`).expect(401);
  });

  it('a boosted set pays floor(granted × 0.5) once as an xp_boost row; replay and 0-XP sets use no boost', async () => {
    const u = await makeUser(t);
    await giveBoosts(u.userId, 1);
    await activate(u.auth).expect(200);

    const r1 = await playStage(u.auth, 8); // Lv.1 first clear
    expect(r1.xp.granted).toBeGreaterThan(0);
    const bonus = Math.floor(r1.xp.granted * 0.5);
    expect(r1.xpBoost).toEqual({ bonus, remainingSets: 2 });
    const rows = await t.prisma.xpLedger.findMany({ where: { userId: u.userId }, orderBy: { sourceType: 'asc' } });
    expect(rows.map((r) => [r.sourceType, r.sourceId, r.amount])).toEqual([
      ['stage', r1.setAttemptId, r1.xp.granted],
      ['xp_boost', `stage:${r1.setAttemptId}`, bonus],
    ]);

    const replay = await t.http().post(`/api/solo/sets/${r1.setAttemptId}/complete`).set('Authorization', u.auth).expect(200);
    expect(replay.body.xpBoost).toEqual({ bonus, remainingSets: 2 });
    expect(await remaining(u.userId)).toBe(2);
    expect(await t.prisma.xpLedger.count({ where: { userId: u.userId } })).toBe(2);

    const failed = await playStage(u.auth, 2); // Lv.2 failed → 0 XP
    expect(failed.xp.granted).toBe(0);
    expect(failed.xpBoost).toBeUndefined();
    expect(await remaining(u.userId)).toBe(2);
  });

  it('daily cap: a capped-out set (0 XP) uses no boost; the bonus is not clipped and not counted toward the cap', async () => {
    const u = await makeUser(t);
    await t.prisma.xpBoost.create({ data: { userId: u.userId, remainingSets: 3 } });
    const filler = (amount: number) =>
      t.prisma.xpLedger.create({ data: { userId: u.userId, sourceType: 'battle', sourceId: `filler-${amount}`, amount, preCapAmount: amount, cappedAmount: 0, reason: 'x', breakdown: {}, configVersion: 'x', kstDay: new Date(`${today()}T00:00:00Z`) } });
    await filler(2990);
    const r = await playStage(u.auth, 10);
    expect(r.xp).toMatchObject({ granted: 10, capReached: true });
    expect(r.xpBoost).toEqual({ bonus: 5, remainingSets: 2 });
    expect(await t.prisma.$transaction((tx) => grantedOn(tx, u.userId, today()))).toBe(3000);

    const v = await makeUser(t);
    await t.prisma.xpBoost.create({ data: { userId: v.userId, remainingSets: 3 } });
    await t.prisma.xpLedger.create({ data: { userId: v.userId, sourceType: 'battle', sourceId: 'full', amount: 3000, preCapAmount: 3000, cappedAmount: 0, reason: 'x', breakdown: {}, configVersion: 'x', kstDay: new Date(`${today()}T00:00:00Z`) } });
    const capped = await playStage(v.auth, 10);
    expect(capped.xp.granted).toBe(0);
    expect(capped.xpBoost).toBeUndefined();
    expect(await remaining(v.userId)).toBe(3);
  });

  it('guests never get a boost', async () => {
    const g = await t.http().post('/api/guests').send({}).expect(201);
    const r = await playStage(`Bearer ${g.body.guestToken}`, 9);
    expect(r.xp.ineligibleReason).toBe('GUEST');
    expect(r.xpBoost).toBeUndefined();
    expect(await t.prisma.xpLedger.count({ where: { sourceType: 'xp_boost', sourceId: `stage:${r.setAttemptId}` } })).toBe(0);
  });
});

describe('경험치 부스트 on battles (real DB)', () => {
  let t: Awaited<ReturnType<typeof createRoomApp>>;
  beforeAll(async () => {
    t = await createRoomApp();
    for (let i = 0; i < 6; i++) await makeQuestion(t.prisma, { topicId: 'science', type: 'mcq', difficulty: 2 });
  });
  afterAll(() => t.close());

  it('a finished battle pays the bonus once per boosted member; re-recording never starts a new one', async () => {
    const a = await t.member('부스트A');
    const c = await t.member('부스트C');
    await t.prisma.xpBoost.create({ data: { userId: a.userId, remainingSets: 1 } });

    const settings = { topicIds: ['science'], types: ['mcq'], questionCount: 5, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null } as const;
    const { code } = await t.engine.createRoom(a.identity, { ...settings, topicIds: [...settings.topicIds], types: [...settings.types] });
    const pa = await t.engine.join(a.identity, { code });
    const pc = await t.engine.join(c.identity, { code });
    await t.engine.ready(code, pc, true);
    expect((await t.engine.start(code, pa)).status).toBe('started');
    await t.clock.advance(3000); // 시작 카운트다운
    for (let i = 0; i < 5; i++) {
      await t.clock.advance(1000);
      await t.engine.submit(code, pa, i, '정답');
      await t.engine.submit(code, pc, i, '오답1');
      await t.clock.advance(3000);
    }

    const xpA = await until(() => t.prisma.xpLedger.findMany({ where: { userId: a.userId }, orderBy: { sourceType: 'asc' } }), (x) => x.length === 2);
    const battle = xpA[0]!;
    expect(battle.sourceType).toBe('battle');
    expect(xpA[1]).toMatchObject({ sourceType: 'xp_boost', sourceId: `battle:${battle.sourceId}`, amount: Math.floor(battle.amount * 0.5) });
    expect((await t.prisma.xpBoost.findUniqueOrThrow({ where: { userId: a.userId } })).remainingSets).toBe(0);
    expect(await t.prisma.xpLedger.count({ where: { userId: c.userId, sourceType: 'xp_boost' } })).toBe(0);

    // C activates a boost only after the battle: a re-record must not pay C, and A gets the stored bonus back.
    await t.prisma.xpBoost.create({ data: { userId: c.userId, remainingSets: 1 } });
    const state = (await t.engine.getRoom(code))!;
    const questions = await t.app.get<QuestionPool>(QUESTION_POOL).loadQuestions(state.session!.questionIds);
    const you = await t.results.record(state, questions);
    expect(you[pa]!.xpBoost).toEqual({ bonus: xpA[1]!.amount, remainingSets: 0 });
    expect(you[pc]!.xpBoost).toBeUndefined();
    expect(await t.prisma.xpLedger.count({ where: { sourceType: 'xp_boost' } })).toBe(1);
    expect((await t.prisma.xpBoost.findUniqueOrThrow({ where: { userId: c.userId } })).remainingSets).toBe(1);
  });
});
