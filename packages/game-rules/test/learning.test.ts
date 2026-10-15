import { describe, expect, it } from 'vitest';
import type { SubfieldName, TopicId } from '@zuirock/shared';
import { historySummary, weeklyReport } from '../src/report.js';
import { addKstDays, kstDayStart } from '../src/time/kst.js';
import type { SolveFact } from '../src/types.js';
import { rankWeakness, topicWrongRates } from '../src/weakness.js';

const WEEK = '2026-10-12'; // Monday
const NOW = kstDayStart('2026-10-15') + 12 * 3_600_000;
const DAY = 86_400_000;

let seq = 0;
const solves = (
  n: number,
  correct: number,
  o: { topicId: TopicId; subfield: SubfieldName; responseMs?: number; at?: number },
): SolveFact[] =>
  Array.from({ length: n }, (_, i) => ({
    questionId: `q${seq++}`,
    topicId: o.topicId,
    subfieldId: `sf-${o.subfield}`,
    subfield: o.subfield,
    type: 'mcq',
    difficulty: 2,
    correct: i < correct,
    responseMs: o.responseMs ?? 5000,
    answeredAt: o.at ?? NOW - 3_600_000,
  }));

/** AC-E2E seed: this week's 27 solves of member A (plan §4.3 LF). */
const seedWeek = (): SolveFact[] => [
  ...solves(5, 4, { topicId: 'science', subfield: '물리' }),
  ...solves(5, 4, { topicId: 'science', subfield: '화학' }),
  ...solves(5, 4, { topicId: 'science', subfield: '생물' }),
  ...solves(4, 3, { topicId: 'general', subfield: '생활' }),
  ...solves(4, 3, { topicId: 'vocab', subfield: '맞춤법' }),
  ...solves(4, 3, { topicId: 'history', subfield: '한국사' }),
];
/** The E2E battle: 10 science questions, A gets `wrong` of them wrong. */
const battle = (wrong: number): SolveFact[] => [
  ...solves(4, 4 - Math.min(4, wrong), { topicId: 'science', subfield: '물리' }),
  ...solves(3, 3 - Math.min(3, Math.max(0, wrong - 4)), { topicId: 'science', subfield: '화학' }),
  ...solves(3, 3 - Math.max(0, wrong - 7), { topicId: 'science', subfield: '생물' }),
];
const TOPICS: TopicId[] = ['science', 'general', 'vocab', 'history'];

describe('topicWrongRates (30 days)', () => {
  /** 30-day seed: 과학 4/20, 상식 12/40, 어휘력 14/40, 역사 10/40 wrong. */
  const seed30 = (): SolveFact[] => [
    ...solves(20, 16, { topicId: 'science', subfield: '물리', at: NOW - 10 * DAY }),
    ...solves(40, 28, { topicId: 'general', subfield: '생활', at: NOW - 10 * DAY }),
    ...solves(40, 26, { topicId: 'vocab', subfield: '맞춤법', at: NOW - 10 * DAY }),
    ...solves(40, 30, { topicId: 'history', subfield: '한국사', at: NOW - 10 * DAY }),
  ];

  it('seed: weak topics {어휘력, 상식} → after the battle {과학, 어휘력}', () => {
    const before = topicWrongRates(seed30(), TOPICS, NOW);
    expect(before.map((r) => [r.topicId, r.wrongRate])).toEqual([
      ['vocab', 0.35],
      ['general', 0.3],
      ['history', 0.25],
      ['science', 0.2],
    ]);
    const after = topicWrongRates([...seed30(), ...battle(7)], TOPICS, NOW);
    expect(after.slice(0, 2).map((r) => r.topicId)).toEqual(['science', 'vocab']);
    expect(after[0]!.wrongRate).toBeCloseTo(11 / 30, 10);
  });

  it('window is (now − 30 d, now]; unknown topics ignored; 0 solves → 0', () => {
    const rows = topicWrongRates(
      [
        ...solves(1, 0, { topicId: 'science', subfield: '물리', at: NOW - 30 * DAY }), // excluded
        ...solves(1, 0, { topicId: 'science', subfield: '물리', at: NOW - 30 * DAY + 1 }),
        ...solves(1, 0, { topicId: 'science', subfield: '물리', at: NOW + 1 }), // future
        ...solves(1, 0, { topicId: 'art', subfield: '물리' }),
      ],
      ['general', 'science'],
      NOW,
    );
    expect(rows).toEqual([
      { topicId: 'science', solved: 1, wrongRate: 1 },
      { topicId: 'general', solved: 0, wrongRate: 0 },
    ]);
  });
});

describe('rankWeakness', () => {
  it('AC-E2E: after the battle the weaknesses are {물리, 화학, 생물}', () => {
    const r = rankWeakness([...seedWeek(), ...battle(7)], { 'sf-물리': 4 });
    expect(r.map((w) => w.subfield).sort()).toEqual(['물리', '생물', '화학']);
    expect(r[0]).toMatchObject({ subfield: '물리', solved: 9, wrongRate: 5 / 9, wrongNoteCount: 4 });
    expect(r[0]!.reason).toBe('오답률 56% · 평균 5.0초 · 오답노트 4문제');
  });

  it.each([
    [
      'needs ≥ 5 solves',
      [...solves(4, 0, { topicId: 'general', subfield: '생활' }), ...solves(5, 4, { topicId: 'general', subfield: '사회' })],
      ['사회'],
    ],
    [
      'tie on wrong rate → more solves first',
      [...solves(5, 4, { topicId: 'general', subfield: '생활' }), ...solves(10, 8, { topicId: 'general', subfield: '사회' })],
      ['사회', '생활'],
    ],
    [
      'tie on rate and solves → slower first',
      [
        ...solves(5, 4, { topicId: 'general', subfield: '생활', responseMs: 3000 }),
        ...solves(5, 4, { topicId: 'general', subfield: '사회', responseMs: 9000 }),
      ],
      ['사회', '생활'],
    ],
    [
      'top 3 only, by wrong rate',
      [
        ...solves(5, 5, { topicId: 'general', subfield: '생활' }),
        ...solves(5, 1, { topicId: 'general', subfield: '사회' }),
        ...solves(5, 2, { topicId: 'general', subfield: '문화' }),
        ...solves(5, 3, { topicId: 'vocab', subfield: '맞춤법' }),
      ],
      ['사회', '문화', '맞춤법'],
    ],
    [
      'full tie → subfield id order',
      [...solves(5, 4, { topicId: 'general', subfield: '생활' }), ...solves(5, 4, { topicId: 'general', subfield: '사회' })],
      ['사회', '생활'],
    ],
  ] as const)('%s', (_n, input, expected) => {
    expect(rankWeakness(input, {}).map((w) => w.subfield)).toEqual(expected);
  });
});

describe('weeklyReport', () => {
  it('AC-E2E: 27 → 37 solves, 과학 80% → ≤ 60%', () => {
    const base = { weekStart: WEEK, prevWeek: [], streakDays: 3, topicIds: TOPICS };
    const before = weeklyReport({ ...base, thisWeek: seedWeek() });
    expect(before.solved).toBe(27);
    expect(before.byTopic[0]).toMatchObject({ topicId: 'science', solved: 15, correctRate: 0.8 });
    for (const wrong of [7, 10]) {
      const after = weeklyReport({ ...base, thisWeek: [...seedWeek(), ...battle(wrong)] });
      expect(after.solved).toBe(37);
      expect(after.byTopic[0]!.correctRate).toBeLessThanOrEqual(0.6);
    }
  });

  it('week bounds, rates, deltas and most improved (≥ 10 solves)', () => {
    const r = weeklyReport({
      weekStart: WEEK,
      thisWeek: [
        ...solves(10, 9, { topicId: 'science', subfield: '물리' }),
        ...solves(10, 6, { topicId: 'general', subfield: '생활' }),
        ...solves(4, 4, { topicId: 'vocab', subfield: '맞춤법' }),
      ],
      prevWeek: [
        ...solves(10, 6, { topicId: 'science', subfield: '물리' }),
        ...solves(10, 5, { topicId: 'general', subfield: '생활' }),
        ...solves(10, 1, { topicId: 'vocab', subfield: '맞춤법' }),
      ],
      streakDays: 5,
      topicIds: ['science', 'general', 'vocab', 'history'],
    });
    expect(r.weekEnd).toBe(addKstDays(WEEK, 6));
    expect(r.correctRate).toBeCloseTo(19 / 24, 10);
    expect(r.streakDays).toBe(5);
    expect(r.byTopic.map((t) => [t.topicId, t.solved, t.deltaPp])).toEqual([
      ['science', 10, 30],
      ['general', 10, 10],
      ['vocab', 4, 90], // biggest gain but < 10 solves
      ['history', 0, null],
    ]);
    expect(r.byTopic[3]).toMatchObject({ correctRate: null, prevCorrectRate: null });
    expect(r.mostImproved).toEqual({ topicId: 'science', deltaPp: 30 });
  });

  it('no positive gain → mostImproved null; empty week → null rate', () => {
    const r = weeklyReport({
      weekStart: WEEK,
      thisWeek: solves(10, 5, { topicId: 'science', subfield: '물리' }),
      prevWeek: solves(10, 5, { topicId: 'science', subfield: '물리' }),
      streakDays: 0,
      topicIds: ['science'],
    });
    expect(r.mostImproved).toBeNull();
    expect(weeklyReport({ weekStart: WEEK, thisWeek: [], prevWeek: [], streakDays: 0, topicIds: [] }).correctRate).toBeNull();
  });
});

describe('historySummary', () => {
  it('totals, battles, KST months ascending, per-topic in topic order', () => {
    const r = historySummary({
      solves: [
        ...solves(2, 1, { topicId: 'science', subfield: '물리', at: kstDayStart('2026-10-01') }), // KST Oct (UTC Sep 30)
        ...solves(2, 2, { topicId: 'general', subfield: '생활', at: kstDayStart('2026-09-15') }),
      ],
      longestStreak: 12,
      battles: [
        { rank: 1, participantCount: 4 },
        { rank: 3, participantCount: 4 },
        { rank: 5, participantCount: 8 },
      ],
    });
    expect(r).toEqual({
      totalSolved: 4,
      correctRate: 0.75,
      longestStreak: 12,
      battles: { played: 3, wins: 1, podiums: 2 },
      monthly: [
        { month: '2026-09', solved: 2 },
        { month: '2026-10', solved: 2 },
      ],
      byTopic: [
        { topicId: 'general', solved: 2, correctRate: 1 },
        { topicId: 'science', solved: 2, correctRate: 0.5 },
      ],
    });
    expect(historySummary({ solves: [], longestStreak: 0, battles: [] }).correctRate).toBeNull();
  });
});
