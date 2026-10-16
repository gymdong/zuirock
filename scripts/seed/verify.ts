// Checks the AC-E2E "before battle" observables of the seeded member A against a running server (real API calls).
//   node --env-file=.env scripts/seed/verify.ts [baseUrl]     (needs DATABASE_URL-free: only JWT_SECRET + baseUrl)
// A member token is minted locally from JWT_SECRET (same HS256 format as the server) for the seeded user.
import { createHmac } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const base = (process.argv[2] ?? process.env.E2E_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const secret = process.env.JWT_SECRET ?? '';
const seedFile = new URL('../../e2e/.seed-user.json', import.meta.url);
const userId = process.env.SEED_USER_ID ?? (existsSync(seedFile) ? (JSON.parse(readFileSync(seedFile, 'utf8')) as { userId: string }).userId : '');
if (!secret || !userId) {
  console.error('JWT_SECRET and SEED_USER_ID (printed by seed:demo as member A=...) are required');
  process.exit(1);
}
const b64 = (v: string) => Buffer.from(v).toString('base64url');
const iat = Math.floor(Date.now() / 1000);
const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
const body = b64(JSON.stringify({ sub: userId, typ: 'user', iat, exp: iat + 3600 }));
const token = `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${base}/api${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

const weakness = await api<{ weeklySolved: number; insufficientData: boolean; weaknesses: { subfieldId: string }[]; weakTopics: string[] }>('/reports/weakness');
const plan = await api<{ allocation: { topicId: string; count: number; wrongRate: number }[]; total: number }>('/solo/composite/plan');
const me = await api<{ cheese?: number }>('/me');
const streak = await api<{ current: number }>('/me/streak');
const notes = await api<unknown[]>('/me/wrong-notes');
console.log(JSON.stringify({ weeklySolved: weakness.weeklySolved, insufficientData: weakness.insufficientData, weaknessCount: weakness.weaknesses.length, weakTopics: weakness.weakTopics, allocation: plan.allocation, cheese: me.cheese, streak: streak.current, openWrongNotes: notes.length }, null, 1));

const fails: string[] = [];
const expect = (ok: boolean, what: string) => { if (!ok) fails.push(what); };
expect(weakness.weeklySolved === 27, 'weeklySolved === 27');
// Plan §4.3 observation 1: before the battle the report is '데이터 부족' (27 solves); it flips at 37.
expect(weakness.insufficientData === true, 'insufficientData === true before the battle');
expect(weakness.weaknesses.length === 0, 'no weaknesses before the battle');
expect(weakness.weakTopics.join() === ['vocab', 'general'].join(), 'weakTopics = vocab, general');
expect(plan.total === 10, 'composite total 10');
const alloc = Object.fromEntries(plan.allocation.map((a) => [a.topicId, a.count]));
expect(alloc.vocab === 3 && alloc.general === 2 && alloc.history === 3 && alloc.science === 2, 'allocation 어휘력3 상식2 역사3 과학2');
expect(me.cheese === 320, 'cheese 320');
expect(streak.current === 28, 'streak 28');
if (fails.length) { console.error('FAILED:', fails.join('; ')); process.exit(1); }
console.log('seed verify: OK');
