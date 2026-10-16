import type { AdminQuestionDto } from '@zuirock/shared';
import { describe, expect, it } from 'vitest';
import { BULK_LIMIT, breakdown, buildRequest, emptySelection, isPageSelected, selectAllMatching, selectRange, selectedCount, setPage, toggleRow } from './selection.js';

const q = (id: string, over: Partial<AdminQuestionDto> = {}): AdminQuestionDto =>
  ({ id, topicId: 'science', subfield: '물리', difficulty: 2, status: 'draft', ...over }) as AdminQuestionDto;
const page = ['a', 'b', 'c', 'd'].map((id) => q(id));

describe('selection', () => {
  it('page mode counts ids; header checkbox selects and clears the page', () => {
    let s = setPage(emptySelection(), page, true);
    expect(selectedCount(s)).toBe(4);
    expect(isPageSelected(s, page)).toBe(true);
    s = setPage(s, page, false);
    expect(selectedCount(s)).toBe(0);
  });
  it('filter mode counts the total and sends the filter, not ids', () => {
    const all = Array.from({ length: 700 }, (_, i) => q(`x${i}`));
    const s = selectAllMatching(all);
    expect(selectedCount(s)).toBe(700);
    const req = buildRequest(s, { status: 'draft' }, 'published');
    expect(req).toEqual({ filter: { status: 'draft' }, to: 'published', limit: BULK_LIMIT });
    expect(req.ids).toBeUndefined();
  });
  it('page mode sends ids only', () => {
    const req = buildRequest(setPage(emptySelection(), page, true), { status: 'draft' }, 'reviewed');
    expect(req).toEqual({ ids: ['a', 'b', 'c', 'd'], to: 'reviewed' });
  });
  it('toggling a row in filter mode falls back to ids', () => {
    const s = toggleRow(selectAllMatching(page), page[0]!);
    expect(s.mode).toBe('page');
    expect(selectedCount(s)).toBe(3);
  });
  it('shift-click selects the range between two rows', () => {
    const s = selectRange(emptySelection(), page, 3, 1, true);
    expect([...s.items.keys()]).toEqual(['b', 'c', 'd']);
  });
  it('breaks down by topic/subfield/difficulty', () => {
    const b = breakdown([q('a'), q('b'), q('c', { subfield: '화학', difficulty: 3 })]);
    expect(b).toEqual([
      { key: 'science/물리 ★2', count: 2 },
      { key: 'science/화학 ★3', count: 1 },
    ]);
  });
});
