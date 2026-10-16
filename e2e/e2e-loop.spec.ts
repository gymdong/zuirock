import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { connect, emit, memberToken, seedUsers, type Player } from './helpers.ts';

// AC-E2E (plan §4.3 LF), local server + compose DB. Both players are real socket clients against the real
// server; member A's answers come from the dev fixture (content/fixtures/dev-questions.json). Observables 1-5 are
// asserted for the 7-wrong and the 10-wrong case, each from a freshly reset seed (`pnpm seed:reset`).
// Deployed runs skip this file: the deployed DB holds reviewed content and no JWT_SECRET is available.
const local = process.env.E2E_TARGET !== 'deployed' && !!process.env.JWT_SECRET;
const fixture = JSON.parse(readFileSync(new URL('../content/fixtures/dev-questions.json', import.meta.url), 'utf8')) as {
  question: string;
  answer: string;
}[];
const answerOf = new Map(fixture.map((q) => [q.question, q.answer]));

test.describe.configure({ mode: 'serial' });
test.skip(!local, 'needs JWT_SECRET and a local server (E2E_BASE_URL) with the seeded DB');

interface Weakness { weeklySolved: number; insufficientData: boolean; weaknesses: { subfield: string; topicId: string; solved: number }[]; weakTopics: string[] }
interface Plan { allocation: { topicId: string; count: number }[] }

for (const wrongCount of [7, 10]) {
  test(`battle 1 with ${wrongCount} wrong answers: observables 1-5`, async ({ request, baseURL }) => {
    test.setTimeout(240_000);
    execFileSync('node', ['--env-file=.env', 'scripts/seed/insert.ts', '--reset', '--dev-questions'], { stdio: 'ignore' });
    const seed = seedUsers()!;
    const auth = { Authorization: `Bearer ${memberToken(seed.userId)}` };
    const get = async <T>(path: string, headers = auth) => (await (await request.get(`/api${path}`, { headers })).json()) as T;

    // Before: 27 solves => '데이터 부족'; weak topics {어휘력, 상식}; science share 2.
    const before = await get<Weakness>('/reports/weakness');
    expect(before).toMatchObject({ weeklySolved: 27, insufficientData: true, weakTopics: ['vocab', 'general'] });
    const planBefore = await get<Plan>('/solo/composite/plan');
    expect(planBefore.allocation.find((a) => a.topicId === 'science')?.count).toBe(2);
    const sciBefore = (await get<{ byTopic: { topicId: string; correctRate: number }[] }>('/reports/weekly/current')).byTopic.find((t) => t.topicId === 'science')!;
    expect(sciBefore.correctRate).toBeCloseTo(0.8, 2);
    const notesBefore = (await get<unknown[]>('/me/wrong-notes')).length;
    const xpBefore = (await get<{ sourceType: string }[]>('/me/xp-ledger')).filter((x) => x.sourceType === 'battle').length;

    // Guest B (separate "device") and member A create and play the room: science, mcq/ox, 10 q, ★2+, 30 s.
    const guest = (await (await request.post('/api/guests', { data: { nickname: '게스트B' } })).json()) as { guestToken: string };
    const created = await request.post('/api/rooms', {
      headers: auth,
      data: { settings: { topicIds: ['science'], types: ['mcq', 'ox'], questionCount: 10, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null } },
    });
    expect(created.ok()).toBeTruthy();
    const { code } = (await created.json()) as { code: string };
    const a: Player = await connect(baseURL!, memberToken(seed.userId));
    const b: Player = await connect(baseURL!, guest.guestToken);
    try {
      await emit(a.socket, 'room:join', { code });
      await emit(b.socket, 'room:join', { code, nickname: '게스트B' });
      await emit(b.socket, 'room:ready', { ready: true });
      const started = await emit<{ status: string }>(a.socket, 'room:start', {});
      expect(started.status).toBe('started');

      // A answers (10 - wrongCount) correctly from the fixture and the rest with an impossible answer; B answers wrong.
      const wanted = new Set(Array.from({ length: 10 - wrongCount }, (_, i) => i));
      const play = async (p: Player, pick: (index: number, text: string) => string) => {
        let done = false;
        void p.finished.then(() => (done = true));
        const seen = new Set<number>();
        while (!done) {
          for (const e of [...p.questions]) {
            if (seen.has(e.question.index)) continue;
            seen.add(e.question.index);
            await emit(p.socket, 'room:submit', { questionIndex: e.question.index, answer: pick(e.question.index, e.question.question.question) }).catch(() => undefined);
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      };
      await Promise.all([
        play(a, (i, text) => (wanted.has(i) ? (answerOf.get(text) ?? 'zzz') : 'zzz')),
        play(b, () => 'zzz'),
      ]);
      await Promise.race([a.finished, new Promise((_, rej) => setTimeout(() => rej(new Error('battle did not finish')), 120_000))]);
      await b.finished;
    } finally {
      a.socket.close();
      b.socket.close();
    }

    // Observables (the server records results asynchronously after 'finished'; poll briefly).
    await expect.poll(async () => (await get<Weakness>('/reports/weakness')).weeklySolved, { timeout: 30_000 }).toBe(37);
    const after = await get<Weakness>('/reports/weakness');
    expect(after.insufficientData).toBe(false); // 1
    // 과학 has four subfields (물리·화학·생물·지구) and the battle draws random ★2+ questions, so the exact top 3 can
    // vary (지구 has no seed solves and only counts once it reaches 5). Deterministic claim: three distinct science
    // subfields, each with at least the minimum solves (the three seeded subfields always qualify).
    expect(after.weaknesses).toHaveLength(3); // 1
    expect(new Set(after.weaknesses.map((w) => w.subfield)).size).toBe(3);
    expect(after.weaknesses.every((w) => w.topicId === 'science' && w.solved >= 5)).toBe(true);
    const sciAfter = (await get<{ byTopic: { topicId: string; correctRate: number }[] }>('/reports/weekly/current')).byTopic.find((t) => t.topicId === 'science')!;
    expect(sciAfter.correctRate).toBeLessThanOrEqual(0.6); // 2
    expect([...after.weakTopics].sort()).toEqual(['science', 'vocab']); // 3
    const planAfter = await get<Plan>('/solo/composite/plan');
    expect(planAfter.allocation.find((x) => x.topicId === 'science')?.count).toBe(3); // 3
    const xpAfter = (await get<{ sourceType: string }[]>('/me/xp-ledger')).filter((x) => x.sourceType === 'battle').length;
    expect(xpAfter).toBeGreaterThan(xpBefore); // 4
    expect((await get<unknown[]>('/me/wrong-notes')).length - notesBefore).toBeGreaterThanOrEqual(7); // 4

    // 5: guest B logs in (member account B) and the guest's records move over.
    const bAuth = { Authorization: `Bearer ${memberToken(seed.loginBId)}` };
    const merged = await request.post('/api/guests/merge', { headers: bAuth, data: { guestToken: guest.guestToken } });
    expect(merged.ok()).toBeTruthy();
    expect(((await merged.json()) as { moved: { solveLogs: number; battleResults: number } }).moved).toMatchObject({ solveLogs: 10, battleResults: 1 });
  });
}
