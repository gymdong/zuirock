import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { kstDayStart } from '@zuirock/game-rules';
import { cryptoRng, EconomyService } from '../../src/modules/economy/economy.service.js';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';

describe('economy: shop, chests, inventory, solo items, streak calendar', () => {
  let t: TestApp;
  const queries: string[] = [];
  const setRng = (r: () => number) => Object.assign(t.app.get(EconomyService) as object, { rng: r });
  const counted = async <T>(run: () => Promise<T>) => {
    queries.length = 0;
    const out = await run();
    return { out, n: queries.filter((q) => !/^(BEGIN|COMMIT)/.test(q)).length };
  };
  const give = (userId: string, delta: number) => t.prisma.cheeseLedger.create({ data: { userId, delta, reason: 'seed_adjust', createdAt: new Date(t.clock.now() - 60_000) } });

  beforeAll(async () => {
    t = await createTestApp();
    for (let i = 0; i < 14; i++) await makeQuestion(t.prisma, { difficulty: i % 2 ? 1 : 1.5, type: i % 2 ? 'mcq' : 'chosung' });
    // 80 science questions → 5 stages (15 each + remainder): stage 5 is the 'good chest' stage (10/28)
    for (let i = 0; i < 66; i++) await makeQuestion(t.prisma, { difficulty: 2 + (i % 7) * 0.5 });
    (t.prisma as unknown as { $on: (e: 'query', cb: (e: { query: string }) => void) => void }).$on('query', (e) => queries.push(e.query));
  });
  afterAll(() => t.close());

  it('cryptoRng returns values in [0, 1) (the real RNG the endpoints use)', () => {
    const xs = Array.from({ length: 2000 }, cryptoRng);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(1990);
  });

  it('GET /shop: catalog with owned counts in 1 query (+ guard)', async () => {
    const u = await makeUser(t);
    await give(u.userId, 100);
    const { out, n } = await counted(() => t.http().get('/api/shop').set('Authorization', u.auth).expect(200));
    expect(n).toBe(2);
    expect(out.body).toEqual({
      cheese: 100,
      chestsUnopened: 0,
      items: [
        expect.objectContaining({ kind: 'streak_protection', price: 50, owned: 0, max: 2 }),
        expect.objectContaining({ kind: 'chosung_first', price: 15, owned: 0, max: 99 }),
        expect.objectContaining({ kind: 'remove_wrong_choice', price: 15, owned: 0, max: 99 }),
      ],
    });
  });

  it('purchase: consumables and protection, 402 on insufficient cheese, 409 at the cap', async () => {
    const u = await makeUser(t);
    await give(u.userId, 160);
    const buy = (kind: string, quantity?: number) => t.http().post(`/api/shop/items/${kind}/purchase`).set('Authorization', u.auth).send(quantity ? { quantity } : {});
    expect((await buy('chosung_first', 2).expect(200)).body).toEqual({ cheese: 130, owned: 2 });
    expect((await buy('streak_protection').expect(200)).body).toEqual({ cheese: 80, owned: 1 });
    expect((await buy('streak_protection', 2).expect(409)).body.code).toBe('MAX_HELD');
    expect((await buy('remove_wrong_choice', 6).expect(402)).body.code).toBe('INSUFFICIENT_CHEESE');
    await t.prisma.userConsumable.update({ where: { userId_kind: { userId: u.userId, kind: 'chosung_first' } }, data: { quantity: 99 } });
    expect((await buy('chosung_first').expect(409)).body.code).toBe('MAX_HELD');
    await buy('nope').expect(404);
    const ledger = await t.prisma.cheeseLedger.findMany({ where: { userId: u.userId, reason: 'item_purchase' } });
    expect(ledger.map((l) => [l.delta, l.itemId])).toEqual([[-30, 'chosung_first']]);
    const shop = await t.http().get('/api/shop').set('Authorization', u.auth).expect(200);
    expect(shop.body.items.find((i: { kind: string }) => i.kind === 'streak_protection').owned).toBe(1);
  });

  it('two parallel purchases cannot overspend', async () => {
    const u = await makeUser(t);
    await give(u.userId, 20);
    const res = await Promise.all(Array.from({ length: 5 }, () => t.http().post('/api/shop/items/remove_wrong_choice/purchase').set('Authorization', u.auth).send({})));
    expect(res.map((r) => r.status).sort()).toEqual([200, 402, 402, 402, 402]);
    expect((await t.http().get('/api/shop').set('Authorization', u.auth)).body.cheese).toBe(5);
  });

  async function playStage(auth: string, correctN: number, body: object = { kind: 'stage', topicId: 'science' }) {
    const s = await t.http().post('/api/solo/sets').set('Authorization', auth).send(body).expect(201);
    for (const [i, q] of s.body.questions.entries()) {
      const ok = i < correctN;
      const answer = q.type === 'chosung' ? (ok ? '세종대왕' : 'ㅁ') : ok ? '정답' : '오답1';
      const r = await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/answers`).set('Authorization', auth).send({ questionId: q.id, answer, responseMs: 1, hintUsed: false }).expect(200);
      if (!r.body.final) await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/give-up`).set('Authorization', auth).send({ questionId: q.id }).expect(200);
    }
    return (await t.http().post(`/api/solo/sets/${s.body.setAttemptId}/complete`).set('Authorization', auth).expect(200)).body;
  }

  it('chest only on a first clear; good on multiples of 5; open once; inventory', async () => {
    const u = await makeUser(t);
    const fail = await playStage(u.auth, 5);
    expect(fail.chest).toBeUndefined();
    const basic = await playStage(u.auth, 9, { kind: 'basic_test', topicId: 'science', checkpointLevel: 5 });
    expect(basic.chest).toBeUndefined(); // skipped stages never grant
    await t.prisma.topicProgress.update({ where: { userId_topicId: { userId: u.userId, topicId: 'science' } }, data: { highestClearedStage: 3 } });
    const normal = await playStage(u.auth, 7); // Lv.4
    expect(normal.chest).toEqual({ id: expect.any(String), tier: 'normal' });
    const replay = await t.http().post(`/api/solo/sets/${normal.setAttemptId}/complete`).set('Authorization', u.auth).expect(200);
    expect(replay.body.chest).toEqual(normal.chest);
    await t.prisma.topicProgress.update({ where: { userId_topicId: { userId: u.userId, topicId: 'science' } }, data: { highestClearedStage: 4 } });
    const good = await playStage(u.auth, 8); // Lv.5
    expect(good.chest.tier).toBe('good');
    expect(await t.prisma.chest.count({ where: { userId: u.userId } })).toBe(2);

    const inv = await t.http().get('/api/me/inventory').set('Authorization', u.auth).expect(200);
    expect(inv.body.chests.map((c: { tier: string; source: { level: number } }) => [c.tier, c.source.level])).toEqual([['normal', 4], ['good', 5]]);

    setRng(() => 0.1); // normal: 70% branch → cheese 5 + floor(0.1 × 11) = 6
    const o1 = await t.http().post(`/api/me/chests/${normal.chest.id}/open`).set('Authorization', u.auth).expect(200);
    expect(o1.body).toMatchObject({ rewards: [{ type: 'cheese', amount: 6 }], cheese: 6 });
    expect((await t.http().post(`/api/me/chests/${normal.chest.id}/open`).set('Authorization', u.auth).expect(409)).body.code).toBe('CHEST_OPENED');

    setRng(() => 0.05); // good: cheese 21 + chosung_first + protection
    const o2 = await t.http().post(`/api/me/chests/${good.chest.id}/open`).set('Authorization', u.auth).expect(200);
    expect(o2.body.rewards).toEqual([{ type: 'cheese', amount: 21 }, { type: 'item', kind: 'chosung_first', quantity: 1 }, { type: 'protection' }]);
    expect(o2.body.cheese).toBe(27);
    expect(o2.body.inventory).toEqual({ items: [{ kind: 'chosung_first', owned: 1 }, { kind: 'remove_wrong_choice', owned: 0 }], chests: [] });
    const shop = await t.http().get('/api/shop').set('Authorization', u.auth).expect(200);
    expect(shop.body.items[0].owned).toBe(1); // protection from the chest
    const other = await makeUser(t);
    await t.http().post(`/api/me/chests/${good.chest.id}/open`).set('Authorization', other.auth).expect(404);
    setRng(cryptoRng);
  });

  it('good chest protection at the cap becomes 30 cheese', async () => {
    const u = await makeUser(t);
    for (let i = 0; i < 2; i++) await t.prisma.cheeseLedger.create({ data: { userId: u.userId, delta: 0, reason: 'protection_purchase', createdAt: new Date(t.clock.now() - 1000) } });
    const c = await t.prisma.chest.create({ data: { userId: u.userId, tier: 'good', sourceTopicId: 'science', sourceLevel: 5 } });
    setRng(() => 0.05);
    const r = await t.http().post(`/api/me/chests/${c.id}/open`).set('Authorization', u.auth).expect(200);
    expect(r.body.rewards).toContainEqual({ type: 'cheese', amount: 30 });
    setRng(cryptoRng);
  });

  it('a consumable rolled at the 99 cap becomes cheese worth its shop price', async () => {
    const u = await makeUser(t);
    await t.prisma.userConsumable.create({ data: { userId: u.userId, kind: 'chosung_first', quantity: 99 } });
    const c = await t.prisma.chest.create({ data: { userId: u.userId, tier: 'normal', sourceTopicId: 'science', sourceLevel: 3 } });
    setRng(() => 0.75); // normal: 70%..90% → chosung_first ×1
    const r = await t.http().post(`/api/me/chests/${c.id}/open`).set('Authorization', u.auth).expect(200);
    expect(r.body.rewards).toEqual([{ type: 'cheese', amount: 15 }]);
    expect(r.body.cheese).toBe(15);
    expect(r.body.inventory.items[0]).toEqual({ kind: 'chosung_first', owned: 99 });
    expect((await t.prisma.chest.findUniqueOrThrow({ where: { id: c.id } })).rewards).toEqual([{ type: 'cheese', amount: 15 }]);
    setRng(cryptoRng);
  });

  it('solo item use: one per question per kind, type rules, never the answer, counts as hinted', async () => {
    const u = await makeUser(t);
    await t.prisma.userConsumable.createMany({ data: [{ userId: u.userId, kind: 'chosung_first', quantity: 1 }, { userId: u.userId, kind: 'remove_wrong_choice', quantity: 5 }] });
    // stage 1 = the 16 easiest science questions: 7 chosung + 9 mcq, so 10 drawn always hold ≥ 1 chosung and ≥ 3 mcq
    const set = await t.http().post('/api/solo/sets').set('Authorization', u.auth).send({ kind: 'stage', topicId: 'science' }).expect(201);
    const qs = set.body.questions as Array<{ id: string; type: string }>;
    const ch = qs.find((q) => q.type === 'chosung')!;
    const mcqs = qs.filter((q) => q.type === 'mcq');
    const use = (questionId: string, kind: string) => t.http().post(`/api/solo/sets/${set.body.setAttemptId}/items/use`).set('Authorization', u.auth).send({ questionId, kind });
    expect((await use(mcqs[0]!.id, 'chosung_first').expect(400)).body.code).toBe('WRONG_QUESTION_TYPE');
    expect((await use(ch.id, 'remove_wrong_choice').expect(400)).body.code).toBe('WRONG_QUESTION_TYPE');
    expect((await use(ch.id, 'chosung_first').expect(200)).body).toEqual({ chosungFirst: '세', owned: 0 });
    expect((await use(ch.id, 'chosung_first').expect(409)).body.code).toBe('ALREADY_USED');
    expect((await use(mcqs[1]!.id, 'chosung_first').expect(400)).body.code).toBe('WRONG_QUESTION_TYPE');
    for (const q of mcqs.slice(0, 3)) {
      const r = await use(q.id, 'remove_wrong_choice').expect(200);
      expect(['오답1', '오답2', '오답3']).toContain(r.body.removedChoice);
    }
    expect((await use(mcqs[0]!.id, 'remove_wrong_choice').expect(409)).body.code).toBe('ALREADY_USED');
    const chosungSet = await t.prisma.setAttempt.findUniqueOrThrow({ where: { id: set.body.setAttemptId } });
    expect(chosungSet.hintedQuestionIds).toEqual(expect.arrayContaining([ch.id, mcqs[0]!.id]));
    await t.http().post(`/api/solo/sets/${set.body.setAttemptId}/answers`).set('Authorization', u.auth).send({ questionId: ch.id, answer: '세종대왕', responseMs: 1, hintUsed: false }).expect(200);
    expect(await t.prisma.solveLog.findFirstOrThrow({ where: { setAttemptId: set.body.setAttemptId, questionId: ch.id } })).toMatchObject({ hintUsed: true, beforeReveal: false, correct: true });
    // no items left for chosung, and not usable after answering / outside solo sets
    expect((await use(ch.id, 'chosung_first').expect(409)).body.code).toBe('ALREADY_ANSWERED');
    await t.http().post('/api/solo/sets/00000000-0000-0000-0000-000000000000/items/use').set('Authorization', u.auth).send({ questionId: ch.id, kind: 'chosung_first' }).expect(404);
    const fresh = await t.http().post('/api/solo/sets').set('Authorization', u.auth).send({ kind: 'composite' }).expect(201);
    const ch2 = (fresh.body.questions as Array<{ id: string; type: string }>).find((q) => q.type === 'chosung');
    if (ch2) {
      const r = await t.http().post(`/api/solo/sets/${fresh.body.setAttemptId}/items/use`).set('Authorization', u.auth).send({ questionId: ch2.id, kind: 'chosung_first' }).expect(409);
      expect(r.body.code).toBe('NO_ITEM');
    }
  });

  it('streak calendar: studied / protected / missed / today / future at KST boundaries (≤ 4 queries incl. guard)', async () => {
    const u = await makeUser(t);
    // account created 2026-10-15 05:00 KST; first activity 00:00 KST that day → tracking starts on 10-15
    await t.prisma.user.update({ where: { id: u.userId }, data: { createdAt: new Date(kstDayStart('2026-10-15') + 5 * 3_600_000) } });
    t.clock.t = kstDayStart('2026-10-21') + 12 * 3_600_000;
    const done = (at: number) => t.prisma.setAttempt.create({ data: { userId: u.userId, kind: 'composite', status: 'completed', totalCount: 10, completedAt: new Date(at) } });
    await done(kstDayStart('2026-10-16') - 60_000); // 23:59 KST on 10-15
    await done(kstDayStart('2026-10-15') + 1); // 00:00 KST on 10-15
    const session = await t.prisma.roomSession.create({ data: { room: { create: { code: '2222', settings: {} } }, seq: 1, settings: {}, questionIds: [], startedAt: new Date() } });
    await t.prisma.battleResult.create({ data: { roomSessionId: session.id, participantId: 'p', userId: u.userId, nickname: 'n', rank: 1, score: 0, correctCount: 0, totalResponseMs: 0, participantCount: 2, memberKey: 'k', endedAt: new Date(kstDayStart('2026-10-16') + 3_600_000), kstDay: new Date('2026-10-16T00:00:00Z') } });
    await t.prisma.cheeseLedger.create({ data: { userId: u.userId, delta: 0, reason: 'protection_use', createdAt: new Date(kstDayStart('2026-10-18')) } }); // protected 10-17
    await done(kstDayStart('2026-10-21') + 3_600_000); // today
    await t.prisma.streakState.create({ data: { userId: u.userId, current: 1, longest: 3, lastCountedDay: new Date('2026-10-21T00:00:00Z'), judgedThrough: new Date('2026-10-21T00:00:00Z') } });

    const { out, n } = await counted(() => t.http().get('/api/me/streak/calendar?month=2026-10').set('Authorization', u.auth).expect(200));
    expect(n).toBeLessThanOrEqual(4);
    const day = (d: string) => out.body.days.find((x: { date: string }) => x.date === d);
    expect(out.body.days).toHaveLength(31);
    expect(day('2026-10-14').state).toBe('none'); // 23:59 KST on 10-14 is before tracking started
    expect(day('2026-10-01').state).toBe('none');
    expect(day('2026-10-15')).toEqual({ date: '2026-10-15', state: 'studied', sets: 2, battles: 0 });
    expect(day('2026-10-16')).toEqual({ date: '2026-10-16', state: 'studied', sets: 0, battles: 1 });
    expect(day('2026-10-17').state).toBe('protected');
    expect(day('2026-10-18').state).toBe('missed');
    expect(day('2026-10-21')).toMatchObject({ state: 'today', sets: 1 });
    expect(day('2026-10-22').state).toBe('future');
    expect(out.body).toMatchObject({ month: '2026-10', current: 1, longest: 3, protectionsHeld: 0, nextMilestone: { days: 3, cheese: 10, daysLeft: 2 } });
    // a user with no activity: only days from account creation can be missed
    const fresh = await makeUser(t);
    await t.prisma.user.update({ where: { id: fresh.userId }, data: { createdAt: new Date(kstDayStart('2026-10-19') - 60_000) } }); // 23:59 KST 10-18
    const f = await t.http().get('/api/me/streak/calendar?month=2026-10').set('Authorization', fresh.auth).expect(200);
    const fd = (d: string) => f.body.days.find((x: { date: string }) => x.date === d).state;
    expect([fd('2026-10-17'), fd('2026-10-18'), fd('2026-10-20'), fd('2026-10-21')]).toEqual(['none', 'missed', 'missed', 'today']);
    // streak built by markActivity alone (seeds): run days count as studied, protected days stay protected
    const seeded = await makeUser(t);
    await t.prisma.streakState.create({ data: { userId: seeded.userId, current: 5, longest: 5, runStartDay: new Date('2026-10-16T00:00:00Z'), lastCountedDay: new Date('2026-10-21T00:00:00Z'), judgedThrough: new Date('2026-10-21T00:00:00Z') } });
    await t.prisma.cheeseLedger.create({ data: { userId: seeded.userId, delta: 0, reason: 'protection_use', createdAt: new Date(kstDayStart('2026-10-19')) } });
    await t.prisma.user.update({ where: { id: seeded.userId }, data: { createdAt: new Date(kstDayStart('2026-10-01')) } });
    const sc = await t.http().get('/api/me/streak/calendar?month=2026-10').set('Authorization', seeded.auth).expect(200);
    const sd = (d: string) => sc.body.days.find((x: { date: string }) => x.date === d).state;
    expect(['15', '16', '17', '18', '19', '20', '21'].map((d) => sd(`2026-10-${d}`))).toEqual(['missed', 'studied', 'studied', 'protected', 'studied', 'studied', 'today']);
    await t.http().get('/api/me/streak/calendar?month=2026-13').set('Authorization', u.auth).expect(400);
    console.warn(`[queries] GET /shop: 2, GET /me/streak/calendar: ${n} (incl. guard)`);
  });
});
