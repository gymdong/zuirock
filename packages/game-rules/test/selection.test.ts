import { describe, expect, it } from 'vitest';
import type { TopicId } from '@zuirock/shared';
import { allocateComposite, selectQuestions, type CandidateQuestion, type TopicWrongRate } from '../src/selection.js';
import { difficultyBand } from '../src/stage.js';

/** Seeded mulberry32 in [0, 1). */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (id: string, difficulty: number, o: Partial<CandidateQuestion> = {}): CandidateQuestion => ({
  id,
  topicId: 'science',
  subfieldId: 'phys',
  type: 'mcq',
  difficulty,
  ...o,
});

describe('allocateComposite', () => {
  const rates = (r: Array<[TopicId, number]>): TopicWrongRate[] => r.map(([topicId, wrongRate]) => ({ topicId, wrongRate, solved: 40 }));
  const counts = (r: Array<[TopicId, number]>) => Object.fromEntries(allocateComposite(rates(r)).map((a) => [a.topicId, a.count]));

  it('AC-E2E seed arithmetic: before the battle 어휘력 3, 상식 2, 역사 3, 과학 2', () => {
    const before = allocateComposite(
      rates([
        ['science', 0.2],
        ['general', 0.3],
        ['vocab', 0.35],
        ['history', 0.25],
      ]),
    );
    expect(before).toEqual([
      { topicId: 'science', count: 2, weak: false },
      { topicId: 'general', count: 2, weak: true },
      { topicId: 'vocab', count: 3, weak: true },
      { topicId: 'history', count: 3, weak: false },
    ]);
  });

  it.each([
    ['A misses 7 (과학 11/30 = 36.7%, quota 2.56)', 11 / 30],
    ['A misses 10 (과학 14/30 = 46.7%, quota 2.86)', 14 / 30],
  ])('AC-E2E seed arithmetic after the battle: %s → 과학 3', (_n, science) => {
    const after = allocateComposite(
      rates([
        ['science', science],
        ['general', 0.3],
        ['vocab', 0.35],
        ['history', 0.25],
      ]),
    );
    expect(after.find((a) => a.topicId === 'science')).toEqual({ topicId: 'science', count: 3, weak: true });
    expect(after.filter((a) => a.weak).map((a) => a.topicId).sort()).toEqual(['science', 'vocab']);
    expect(after.reduce((s, a) => s + a.count, 0)).toBe(10);
  });

  it.each([
    ['4 topics all zero → even per group', [['science', 0], ['general', 0], ['vocab', 0], ['history', 0]], { science: 3, general: 2, vocab: 3, history: 2 }],
    ['3 topics proportional', [['science', 0.5], ['general', 0.3], ['vocab', 0.2]], { science: 5, general: 3, vocab: 2 }],
    ['3 topics all zero → even, ties to topic order', [['science', 0], ['general', 0], ['vocab', 0]], { science: 4, general: 3, vocab: 3 }],
    ['2 equal topics split 5/5', [['science', 0.25], ['general', 0.25]], { science: 5, general: 5 }],
    ['1 topic gets all', [['history', 0.4]], { history: 10 }],
    ['5 topics, rest group of 3', [['science', 0.6], ['general', 0.4], ['vocab', 0.3], ['history', 0.2], ['art', 0]], { science: 3, general: 2, vocab: 3, history: 2, art: 0 }],
    ['4 topics, weak group one zero', [['science', 0.5], ['general', 0], ['vocab', 0], ['history', 0]], { science: 5, general: 0, vocab: 3, history: 2 }],
  ] as const)('%s', (_n, r, expected) => {
    expect(counts(r as unknown as Array<[TopicId, number]>)).toEqual(expected);
  });

  it('remainder tie goes to the higher wrong rate', () => {
    // 3 topics: quotas 4.5, 3.5, 2 → equal .5 remainders → higher rate first
    expect(counts([['science', 0.45], ['general', 0.35], ['vocab', 0.2]])).toEqual({ science: 5, general: 3, vocab: 2 });
  });

  it('empty input and custom total', () => {
    expect(allocateComposite([])).toEqual([]);
    expect(allocateComposite(rates([['science', 1], ['general', 1], ['vocab', 1], ['history', 1]]), 20).map((a) => a.count)).toEqual([5, 5, 5, 5]);
  });
});

describe('selectQuestions — battle', () => {
  const pool = [
    q('a', 1),
    q('b', 2),
    q('c', 2.5, { type: 'ox' }),
    q('d', 3, { type: 'chosung' }),
    q('e', 4, { topicId: 'history' }),
    q('f', 5),
    q('f', 5), // duplicate row
    q('g', 2),
  ];
  const settings = { topicIds: ['science' as const], types: ['mcq' as const, 'ox' as const], minDifficulty: 2, questionCount: 4 };

  it('matches topics ∩ types ∩ difficulty ≥ min, no duplicates (AC-M1)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const r = selectQuestions({ mode: 'battle', pool, settings }, seeded(seed));
      expect(r.status).toBe('ok');
      if (r.status !== 'ok') return;
      expect([...r.questionIds].sort()).toEqual(['b', 'c', 'f', 'g']);
      expect(r.relaxation).toBe('none');
    }
  });

  it('is deterministic for a given rng (one shared order)', () => {
    const a = selectQuestions({ mode: 'battle', pool, settings }, seeded(7));
    expect(selectQuestions({ mode: 'battle', pool, settings }, seeded(7))).toEqual(a);
  });

  it('reports shortage with all M matching (AC-M2)', () => {
    const r = selectQuestions({ mode: 'battle', pool, settings: { ...settings, questionCount: 10 } }, seeded(1));
    expect(r).toMatchObject({ status: 'shortage', available: 4, requested: 10 });
    if (r.status === 'shortage') expect([...r.questionIds].sort()).toEqual(['b', 'c', 'f', 'g']);
  });

  it('rematch prefers questions outside avoidIds', () => {
    const r = selectQuestions({ mode: 'battle', pool, settings: { ...settings, questionCount: 2 }, avoidIds: ['b', 'c'] }, seeded(3));
    expect(r.status === 'ok' && [...r.questionIds].sort()).toEqual(['f', 'g']);
    const r2 = selectQuestions({ mode: 'battle', pool, settings: { ...settings, questionCount: 3 }, avoidIds: ['b', 'c'] }, seeded(3));
    expect(r2).toMatchObject({ status: 'ok', relaxation: 'reused' });
  });
});

describe('selectQuestions — solo', () => {
  const band = difficultyBand(25); // ★2–3
  const inBand = Array.from({ length: 30 }, (_, i) => q(`n${i}`, [2, 2.5, 3][i % 3]!));
  const base = { mode: 'solo' as const, count: 10, band, answeredCorrectlyIds: [], reviewPool: [], reviewMax: 2 };

  it('serves unanswered in-band questions, ramped easy → hard', () => {
    const r = selectQuestions({ ...base, pool: [...inBand, q('x', 1), q('y', 5)] }, seeded(1));
    expect(r).toMatchObject({ status: 'ok', relaxation: 'none', reviewIds: [] });
    if (r.status !== 'ok') return;
    expect(new Set(r.questionIds).size).toBe(10);
    const ds = r.questionIds.map((id) => inBand.find((c) => c.id === id)!.difficulty);
    expect(ds).toEqual([...ds].sort((a, b) => a - b));
  });

  it('unanswered first, then already-correct (reused)', () => {
    const correct = inBand.slice(0, 25).map((c) => c.id);
    const r = selectQuestions({ ...base, pool: inBand, answeredCorrectlyIds: correct }, seeded(2));
    expect(r).toMatchObject({ status: 'ok', relaxation: 'reused' });
    if (r.status === 'ok') for (const c of inBand.slice(25)) expect(r.questionIds).toContain(c.id);
  });

  it('then widens the band by ±0.5★ (D6-7)', () => {
    const pool = [...inBand.slice(0, 6), q('w1', 1.5), q('w2', 3.5), q('w3', 3.5), q('w4', 1.5), q('far', 4)];
    const r = selectQuestions({ ...base, pool, answeredCorrectlyIds: ['w4'] }, seeded(3));
    expect(r).toMatchObject({ status: 'ok', relaxation: 'widened' });
    if (r.status === 'ok') {
      expect([...r.questionIds].sort()).toEqual([...inBand.slice(0, 6).map((c) => c.id), 'w1', 'w2', 'w3', 'w4'].sort());
    }
  });

  it('blocks when even the widened band is short', () => {
    const r = selectQuestions({ ...base, pool: [...inBand.slice(0, 5), q('w', 3.5), q('far', 5)] }, seeded(4));
    expect(r).toEqual({ status: 'blocked', available: 6, requested: 10 });
  });

  it('mixes in at most reviewMax review questions, never duplicates or excluded ids', () => {
    const reviewPool = [q('r1', 1), q('r2', 5), q('r3', 4), inBand[0]!, q('ex', 2)];
    for (let seed = 1; seed <= 10; seed++) {
      const r = selectQuestions({ ...base, pool: inBand, reviewPool, excludeIds: ['ex'] }, seeded(seed));
      if (r.status !== 'ok') throw new Error('expected ok');
      expect(r.reviewIds).toHaveLength(2);
      expect(r.questionIds).toHaveLength(12);
      expect(new Set(r.questionIds).size).toBe(12);
      expect(r.questionIds).not.toContain('ex');
      for (const id of r.reviewIds) expect(r.questionIds).toContain(id);
    }
  });

  it('draws by band weight: low levels favour the easy end', () => {
    const big = Array.from({ length: 300 }, (_, i) => q(`b${i}`, [1, 1.5, 2][i % 3]!));
    let easy = 0;
    let hard = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = selectQuestions({ ...base, band: difficultyBand(1), pool: big }, seeded(seed));
      if (r.status !== 'ok') throw new Error('expected ok');
      for (const id of r.questionIds) {
        const d = big.find((c) => c.id === id)!.difficulty;
        if (d === 1) easy++;
        if (d === 2) hard++;
      }
    }
    expect(easy).toBeGreaterThan(hard * 3);
  });

  it('falls back to uniform when the band weights miss the pool difficulties', () => {
    const r = selectQuestions(
      { ...base, count: 2, band: { minDifficulty: 2, maxDifficulty: 3, weights: [] }, pool: [q('a', 2), q('b', 3)] },
      seeded(5),
    );
    expect(r.status === 'ok' && r.questionIds).toEqual(['a', 'b']);
  });
});
