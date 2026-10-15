import { describe, expect, it } from 'vitest';
import { validateImport } from '../src/import-validate.js';

const mcq = (o: Record<string, unknown> = {}) => ({
  topic: '과학',
  subfield: '물리',
  type: 'mcq',
  difficulty: 2,
  question: '빛의 속도에 가장 가까운 값은?',
  answer: '초속 30만 km',
  choices: ['초속 30만 km', '초속 3만 km', '초속 300 km', '초속 3억 km'],
  explanation: '빛은 진공에서 초속 약 30만 km로 움직입니다.',
  source: { title: '물리학 개론', url: '' },
  ...o,
});
const chosung = (o: Record<string, unknown> = {}) => ({
  ...mcq(),
  type: 'chosung',
  question: '한글을 만든 조선의 임금은?',
  answer: '세종대왕',
  choices: undefined,
  topic: '역사',
  subfield: '한국사',
  ...o,
});

describe('validateImport', () => {
  it.each([
    [{}, 'NOT_ARRAY'],
    ['[]', 'NOT_ARRAY'],
    [[], 'EMPTY'],
  ])('file-level error for %j', (raw, code) => {
    const r = validateImport(raw, new Set());
    expect(r.errors).toEqual([expect.objectContaining({ index: 0, code })]);
    expect(r.accepted).toEqual([]);
  });

  it('accepts valid questions with normalized text', () => {
    const r = validateImport([mcq(), chosung()], new Set());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.accepted.map((a) => [a.index, a.normalizedText])).toEqual([
      [1, '빛의속도에가장가까운값은'],
      [2, '한글을만든조선의임금은'],
    ]);
  });

  it.each([
    ['difficulty not in 0.5 steps', { difficulty: 2.3 }, 'SCHEMA', 'difficulty'],
    ['difficulty out of range', { difficulty: 5.5 }, 'SCHEMA', 'difficulty'],
    ['missing explanation', { explanation: undefined }, 'SCHEMA', 'explanation'],
    ['subfield of another topic', { subfield: '한국사' }, 'SCHEMA', 'subfield'],
    ['mcq with 3 choices', { choices: ['a', 'b', 'c'] }, 'SCHEMA', 'choices'],
    ['mcq answer not in choices', { answer: '초속 1 km' }, 'ANSWER_NOT_IN_CHOICES', 'choices'],
  ])('%s', (_n, patch, code, field) => {
    const r = validateImport([mcq(), mcq({ ...patch, question: '두 번째 문제 문구입니다' })], new Set());
    expect(r.accepted.map((a) => a.index)).toEqual([1]);
    expect(r.errors[0]).toMatchObject({ index: 2, code, field });
    expect(r.errors[0]!.message).toContain('2번째 문제');
  });

  it('duplicates in file and against existing questions (normalized)', () => {
    const r = validateImport(
      [mcq(), mcq({ question: '빛의 속도에 가장 가까운 값은 ?' }), chosung()],
      new Set(['한글을만든조선의임금은']),
    );
    expect(r.accepted.map((a) => a.index)).toEqual([1]);
    expect(r.errors.map((e) => [e.index, e.code])).toEqual([
      [2, 'DUPLICATE_IN_FILE'],
      [3, 'DUPLICATE_EXISTING'],
    ]);
    expect(r.errors[0]!.message).toContain('1번째');
  });

  it('warns (without blocking) when the question contains the answer', () => {
    const r = validateImport([chosung({ question: '세종대왕이 만든 문자는 무엇일까?' })], new Set());
    expect(r.accepted).toHaveLength(1);
    expect(r.warnings).toEqual([expect.objectContaining({ index: 1, code: 'ANSWER_IN_QUESTION' })]);
  });

  it('ox answers never trigger the answer-in-question warning', () => {
    const ox = { ...mcq(), type: 'ox', answer: 'O', choices: undefined, question: 'O 표시는 맞다는 뜻이다.' };
    const r = validateImport([ox], new Set());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('a non-object entry is a schema error at its position', () => {
    const r = validateImport([42], new Set());
    expect(r.errors[0]).toMatchObject({ index: 1, code: 'SCHEMA' });
    expect(r.errors[0]).not.toHaveProperty('field');
  });
});
