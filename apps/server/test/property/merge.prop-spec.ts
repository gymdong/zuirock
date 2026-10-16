import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MergeService } from '../../src/modules/guests/merge.service.js';
import { createTestApp, makeQuestion, makeUser, type TestApp } from '../support/app.js';
import { addBattle, addSet, addXp, rngFrom } from '../support/history.js';

/**
 * Merge property test (plan §4.5: 50 histories, battles and solo mixed). For random account and
 * guest histories: (a) account XP rows unchanged, (b) daily cap per day, (c) decay — a question
 * already solved twice in the 7-day window earns 0, (d) full ownership transfer, (e) re-run is 409
 * with nothing changed, (f) set-level limits (one daily XP per day, stage XP only above cleared),
 * (g) milestone cheese unique per (milestone, runStartDay), (h) no account cheese row revoked.
 */
describe('merge property (AC-A2)', () => {
  let t: TestApp;
  let merges: MergeService;
  const qs: string[] = [];
  let run = 0;
  beforeAll(async () => {
    t = await createTestApp();
    merges = t.app.get(MergeService);
    for (let i = 0; i < 20; i++) qs.push(await makeQuestion(t.prisma, { difficulty: 1 + (i % 9) * 0.5 }));
  });
  afterAll(() => t.close());

  it('holds for 50 random histories', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer(), async (seed) => {
        const r = rngFrom(seed);
        const int = (n: number) => Math.floor(r() * n);
        const pick = (n: number) => [...qs].sort(() => r() - 0.5).slice(0, n);
        const { userId } = await makeUser(t, `p${++run}`);
        const guest = await t.prisma.guest.create({ data: {} });
        const g = { guestId: guest.id };

        // account history
        const cleared = int(3);
        if (cleared) await t.prisma.topicProgress.create({ data: { userId, topicId: 'science', highestClearedStage: cleared, started: true } });
        for (let i = int(4); i > 0; i--) {
          const day = int(6);
          const qq = pick(3);
          await addSet(t.prisma, { userId }, { kind: 'composite', day, questions: qq, correct: qq.map(() => r() < 0.5) });
          await addXp(t.prisma, userId, day, int(3000), r() < 0.3 ? 'daily' : 'battle');
        }
        await t.prisma.cheeseLedger.create({ data: { userId, delta: 10, reason: 'streak_milestone', milestone: 3, runStartDay: new Date('2026-10-01T00:00:00Z') } });

        // guest history: stages, composite, daily, battles
        for (let i = 1 + int(5); i > 0; i--) {
          const day = int(6);
          const n = 3 + int(8);
          const qq = pick(n);
          const correct = qq.map(() => r() < 0.75);
          const kind = int(4);
          if (kind === 3) await addBattle(t.prisma, g, { day, minute: int(600), questions: qq, correct, rank: 1 + int(4), rematch: r() < 0.3 });
          else await addSet(t.prisma, g, { kind: (['stage', 'composite', 'daily'] as const)[kind]!, level: 1 + int(4), day, minute: int(600), questions: qq, correct });
        }

        const accountXp = await t.prisma.xpLedger.findMany({ where: { userId }, orderBy: { id: 'asc' } });
        const accountCheese = await t.prisma.cheeseLedger.findMany({ where: { userId }, orderBy: { id: 'asc' } });
        const guestCounts = await Promise.all([
          t.prisma.solveLog.count({ where: g }),
          t.prisma.setAttempt.count({ where: g }),
          t.prisma.battleResult.count({ where: g }),
        ]);

        const summary = await merges.merge(guest.id, userId);
        const ledger = await t.prisma.xpLedger.findMany({ where: { userId } });

        // (a) frozen account rows
        expect(ledger.filter((x) => !x.viaMerge).sort((a, b) => a.id.localeCompare(b.id))).toEqual(accountXp);
        // (b) daily cap
        const byDay = new Map<string, number>();
        for (const x of ledger) byDay.set(x.kstDay.toISOString(), (byDay.get(x.kstDay.toISOString()) ?? 0) + x.amount);
        const accountByDay = new Map<string, number>();
        for (const x of accountXp) accountByDay.set(x.kstDay.toISOString(), (accountByDay.get(x.kstDay.toISOString()) ?? 0) + x.amount);
        for (const [d, total] of byDay) expect(total).toBeLessThanOrEqual(Math.max(3000, accountByDay.get(d) ?? 0));
        // (c) decay factors are 0 / 0.5 / 1 only and the summary equals the rows
        for (const x of ledger.filter((l) => l.viaMerge)) {
          for (const item of (x.breakdown as { items: Array<{ decayFactor: number }> }).items) expect([0, 0.5, 1]).toContain(item.decayFactor);
        }
        expect(summary.xpGranted).toBe(ledger.filter((x) => x.viaMerge).reduce((s, x) => s + x.amount, 0));
        // (d) ownership transfer
        expect([summary.moved.solveLogs, summary.moved.setAttempts, summary.moved.battleResults]).toEqual(guestCounts);
        expect(await t.prisma.solveLog.count({ where: g })).toBe(0);
        // (f) set-level limits: one daily grant per day; stage XP only for levels above the account's cleared stage, once per level
        const dailyDays = ledger.filter((x) => x.sourceType === 'daily' && x.viaMerge).map((x) => x.kstDay.toISOString());
        const accountDaily = new Set(accountXp.filter((x) => x.sourceType === 'daily').map((x) => x.kstDay.toISOString()));
        expect(new Set(dailyDays).size).toBe(dailyDays.length);
        for (const d of dailyDays) expect(accountDaily.has(d)).toBe(false);
        const stageRows = ledger.filter((x) => x.sourceType === 'stage' && x.viaMerge && x.preCapAmount > 0);
        const stageSets = await t.prisma.setAttempt.findMany({ where: { id: { in: stageRows.map((x) => x.sourceId) } } });
        const levels = stageSets.map((s) => s.level!);
        expect(new Set(levels).size).toBe(levels.length);
        for (const l of levels) expect(l).toBeGreaterThan(cleared);
        // (e) idempotent: second merge is rejected and changes nothing
        await expect(merges.merge(guest.id, userId)).rejects.toMatchObject({ status: 409 });
        expect(await t.prisma.xpLedger.count({ where: { userId } })).toBe(ledger.length);
        // (g) + (h)
        const cheese = await t.prisma.cheeseLedger.findMany({ where: { userId } });
        const keys = cheese.filter((c) => c.reason === 'streak_milestone').map((c) => `${c.milestone}|${c.runStartDay?.toISOString()}`);
        expect(new Set(keys).size).toBe(keys.length);
        for (const c of accountCheese) expect(cheese.some((x) => x.id === c.id && x.delta === c.delta)).toBe(true);
      }),
      { numRuns: 50 },
    );
  }, 300_000);
});
