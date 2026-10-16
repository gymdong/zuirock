import type { AdminQuestionDto } from '@zuirock/shared';
import { describe, expect, it } from 'vitest';
import type { CountRow } from '../api/types.js';
import { checkApprove } from './approve.js';
import { countByTopicStar, preconditionChecks } from './counts.js';

const q = (over: Partial<AdminQuestionDto> = {}): AdminQuestionDto =>
  ({ id: 'a', status: 'reviewed', subfield: '물리', source: { title: '교과서', url: '' }, ...over }) as AdminQuestionDto;

describe('checkApprove', () => {
  it('passes reviewed same-subfield questions', () => {
    expect(checkApprove([q(), q({ id: 'b' })], false)).toEqual([]);
  });
  it('rejects non-reviewed, mixed subfields, empty title, >50', () => {
    expect(checkApprove([q({ status: 'draft' })], false)).toHaveLength(1);
    expect(checkApprove([q(), q({ subfield: '화학' })], false)).toHaveLength(1);
    expect(checkApprove([q({ source: { title: ' ', url: '' } })], false)).toHaveLength(1);
    expect(checkApprove(Array.from({ length: 51 }, () => q()), false)).toHaveLength(1);
    expect(checkApprove([], false)).toHaveLength(1);
  });
  it('requires 링크 확인 only when a url exists', () => {
    const withUrl = q({ source: { title: 't', url: 'https://example.com' } });
    expect(checkApprove([withUrl], false)).toHaveLength(1);
    expect(checkApprove([withUrl], true)).toEqual([]);
  });
});

describe('counts', () => {
  const rows: CountRow[] = [
    { topicId: 'science', difficulty: 2, type: 'mcq', status: 'published', count: 20 },
    { topicId: 'science', difficulty: 1, type: 'ox', status: 'published', count: 5 },
    { topicId: 'vocab', difficulty: 2.5, type: 'ox', status: 'draft', count: 9 },
  ];
  it('aggregates topic × star by status', () => {
    expect(countByTopicStar(rows, 'published').science[2]).toBe(20);
    expect(countByTopicStar(rows, 'all').vocab[3]).toBe(9);
  });
  it('evaluates the D9 preconditions on published rows only', () => {
    const c = preconditionChecks(rows);
    expect(c[0]).toMatchObject({ value: 20, ok: true });
    expect(c.find((x) => x.label.startsWith('어휘력'))).toMatchObject({ value: 0, ok: false });
    expect(c.at(-1)).toMatchObject({ value: 0, ok: false });
  });
});
