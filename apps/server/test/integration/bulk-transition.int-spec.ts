import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, makeUser, type TestApp } from '../support/app.js';

describe('admin bulk transition + query budget', () => {
  let t: TestApp;
  let admin: string;
  let queries: string[] = [];
  let seq = 0;

  const insert = async (n: number, over: { status?: 'draft' | 'reviewed' | 'published' | 'suspended'; sourceTitle?: string; subfield?: string } = {}) => {
    const sf = await t.prisma.subfield.findFirstOrThrow({ where: { topicId: 'science', name: over.subfield ?? '물리' } });
    const rows = Array.from({ length: n }, () => {
      const i = ++seq;
      return {
        topicId: 'science', subfieldId: sf.id, type: 'ox' as const, difficulty: 2, question: `벌크 ${i}`, normalizedText: `bulk${i}`,
        answer: 'O', choices: [], explanation: '해설입니다 해설입니다', sourceTitle: over.sourceTitle ?? '교과서', status: over.status ?? 'draft',
      };
    });
    await t.prisma.question.createMany({ data: rows });
    return (await t.prisma.question.findMany({ where: { normalizedText: { in: rows.map((r) => r.normalizedText) } }, select: { id: true } })).map((r) => r.id);
  };
  /** Runs a request and returns its body plus the DB statements it issued (BEGIN/COMMIT excluded). */
  const measured = async <T>(run: () => Promise<{ body: T }>) => {
    queries = [];
    const { body } = await run();
    return { body, n: queries.filter((q) => !/^(BEGIN|COMMIT|ROLLBACK)/.test(q)).length };
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await makeUser(t, '벌크관리', true)).auth;
    (t.prisma as unknown as { $on: (e: 'query', cb: (e: { query: string }) => void) => void }).$on('query', (e) => queries.push(e.query));
  });
  afterAll(() => t.close());

  const bulk = (body: object) => t.http().post('/api/admin/questions/bulk-transition').set('Authorization', admin).send(body).expect(200);

  it('300 drafts → published in one call (3 statements: guard + select + update), then idempotent', async () => {
    const ids = await insert(300);
    const r = await measured(() => bulk({ ids, to: 'published' }));
    expect(r.body).toEqual({ updated: 300, skipped: [] });
    console.info(`[queries] bulk-transition ids×300: ${r.n}`);
    expect(r.n).toBe(3);
    const rows = await t.prisma.question.findMany({ where: { id: { in: ids } } });
    expect(rows.every((q) => q.status === 'published' && q.reviewedAt && q.publishedAt && q.reviewedById)).toBe(true);
    const again = await bulk({ ids, to: 'published' });
    expect(again.body.updated).toBe(0);
    expect(again.body.skipped).toHaveLength(300);
    expect(new Set(again.body.skipped.map((s: { reason: string }) => s.reason))).toEqual(new Set(['ALREADY_PUBLISHED']));
  });

  it('skips suspended, published, missing source title and unknown ids with reasons', async () => {
    const [draft] = await insert(1);
    const [susp] = await insert(1, { status: 'suspended' });
    const [pub] = await insert(1, { status: 'published' });
    const [noTitle] = await insert(1, { sourceTitle: '  ' });
    const [rev] = await insert(1, { status: 'reviewed' });
    const r = await bulk({ ids: [draft, susp, pub, noTitle, rev, '00000000-0000-0000-0000-000000000000', 'nope'], to: 'reviewed' });
    expect(r.body.updated).toBe(1);
    expect(Object.fromEntries(r.body.skipped.map((s: { id: string; reason: string }) => [s.id, s.reason]))).toEqual({
      [susp!]: 'SUSPENDED', [pub!]: 'ALREADY_PUBLISHED', [noTitle!]: 'MISSING_SOURCE_TITLE', [rev!]: 'ALREADY_REVIEWED',
      '00000000-0000-0000-0000-000000000000': 'NOT_FOUND', nope: 'NOT_FOUND',
    });
    expect((await t.prisma.question.findUniqueOrThrow({ where: { id: draft! } })).status).toBe('reviewed');
    expect((await t.prisma.question.findUniqueOrThrow({ where: { id: susp! } })).status).toBe('suspended');
  });

  it('filter mode with limit reports remaining; no subfield or 50-item restriction', async () => {
    const sf = await t.prisma.subfield.findFirstOrThrow({ where: { topicId: 'science', name: '화학' } });
    await insert(70, { status: 'reviewed', subfield: '화학' });
    await insert(2, { status: 'reviewed', subfield: '화학', sourceTitle: '' });
    const first = await measured(() => bulk({ filter: { subfieldId: sf.id, status: 'reviewed' }, to: 'published', limit: 60 }));
    console.info(`[queries] bulk-transition filter: ${first.n}`);
    expect(first.n).toBe(3);
    expect(first.body).toMatchObject({ updated: 60, remaining: 10 });
    expect(first.body.skipped.map((s: { reason: string }) => s.reason)).toEqual(['MISSING_SOURCE_TITLE', 'MISSING_SOURCE_TITLE']);
    expect((await bulk({ filter: { subfieldId: sf.id, status: 'reviewed' }, to: 'published' })).body).toMatchObject({ updated: 10, remaining: 0 });
    expect((await bulk({ filter: { subfieldId: sf.id, status: 'reviewed' }, to: 'published' })).body).toMatchObject({ updated: 0, remaining: 0 });
  });

  it('filter keys match GET /questions: subfield name, importBatch; unknown or bad values → 400 BAD_FILTER', async () => {
    const chem = await insert(5, { subfield: '화학' });
    const phys = await insert(4, { subfield: '물리' });
    const r = await measured(() => bulk({ filter: { topicId: 'science', subfield: '화학', status: 'draft' }, to: 'published' }));
    expect(r.n).toBe(3);
    expect(r.body).toEqual({ updated: 5, skipped: [], remaining: 0 });
    expect((await t.prisma.question.findMany({ where: { id: { in: chem } } })).every((q) => q.status === 'published')).toBe(true);
    expect((await t.prisma.question.findMany({ where: { id: { in: phys } } })).every((q) => q.status === 'draft')).toBe(true);

    await t.prisma.question.updateMany({ where: { id: { in: phys.slice(0, 2) } }, data: { importBatch: 'batch-x' } });
    expect((await bulk({ filter: { importBatch: 'batch-x' }, to: 'reviewed' })).body).toMatchObject({ updated: 2, remaining: 0 });
    expect(await t.prisma.question.count({ where: { id: { in: phys }, status: 'reviewed' } })).toBe(2);

    const before = await t.prisma.question.count({ where: { status: 'published' } });
    for (const filter of [{ subfieldName: '화학' }, { subfield: '없는분야' }, { subfieldId: 'not-a-uuid' }, { status: 'gone' }, { difficulty: 7 }, []]) {
      const res = await t.http().post('/api/admin/questions/bulk-transition').set('Authorization', admin).send({ filter, to: 'published' }).expect(400);
      expect(res.body.code).toBe('BAD_FILTER');
    }
    expect(await t.prisma.question.count({ where: { status: 'published' } })).toBe(before);
  });

  it('validates input', async () => {
    const post = (body: object) => t.http().post('/api/admin/questions/bulk-transition').set('Authorization', admin).send(body);
    expect((await post({ to: 'published' })).status).toBe(400);
    expect((await post({ ids: [], filter: {}, to: 'published' })).status).toBe(400);
    expect((await post({ ids: [], to: 'suspended' })).status).toBe(400);
    expect((await post({ ids: Array(501).fill('x'), to: 'published' })).status).toBe(400);
  });

  it('query budget: list = guard + page + count, get = guard + 1', async () => {
    const list = await measured(() => t.http().get('/api/admin/questions?status=published&limit=50').set('Authorization', admin).expect(200));
    expect(list.body).toMatchObject({ total: expect.any(Number) });
    expect((list.body as { items: unknown[] }).items).toHaveLength(50);
    const id = (list.body as { items: Array<{ id: string }> }).items[0]!.id;
    const one = await measured(() => t.http().get(`/api/admin/questions/${id}`).set('Authorization', admin).expect(200));
    console.info(`[queries] GET /admin/questions: ${list.n}, GET /admin/questions/:id: ${one.n}`);
    expect(list.n).toBe(3);
    expect(one.n).toBe(2);
    const next = await t.http().get(`/api/admin/questions?status=published&limit=50&cursor=${(list.body as { nextCursor: string }).nextCursor}`).set('Authorization', admin).expect(200);
    expect(next.body.items[0].id).not.toBe(id);
  });
});
