import type { AdminQuestionDto } from '@zuirock/shared';
import type { BulkFilter, BulkTransitionRequest } from '../api/types.js';

export const BULK_LIMIT = 500;

/** `page`: explicit ids. `filter`: everything matching the current filter (`items` is the loaded snapshot, `total` its size). */
export interface Selection {
  mode: 'page' | 'filter';
  items: Map<string, AdminQuestionDto>;
  total: number;
}

export const emptySelection = (): Selection => ({ mode: 'page', items: new Map(), total: 0 });

export const selectedCount = (s: Selection): number => (s.mode === 'filter' ? s.total : s.items.size);

/** Toggling a single row leaves filter mode and keeps the snapshot minus/plus that row. */
export function toggleRow(s: Selection, q: AdminQuestionDto): Selection {
  const items = new Map(s.items);
  if (items.has(q.id)) items.delete(q.id);
  else items.set(q.id, q);
  return { mode: 'page', items, total: items.size };
}

export function setPage(s: Selection, page: AdminQuestionDto[], checked: boolean): Selection {
  const items = new Map(s.mode === 'page' ? s.items : []);
  for (const q of page) {
    if (checked) items.set(q.id, q);
    else items.delete(q.id);
  }
  return { mode: 'page', items, total: items.size };
}

export const isPageSelected = (s: Selection, page: AdminQuestionDto[]): boolean =>
  page.length > 0 && page.every((q) => s.items.has(q.id));

/** Shift-click: select (or clear, following the clicked row's new state) rows between two indexes. */
export function selectRange(s: Selection, page: AdminQuestionDto[], from: number, to: number, checked: boolean): Selection {
  const [a, b] = from < to ? [from, to] : [to, from];
  return setPage(s, page.slice(a, b + 1), checked);
}

export function selectAllMatching(matching: AdminQuestionDto[]): Selection {
  return { mode: 'filter', items: new Map(matching.map((q) => [q.id, q])), total: matching.length };
}

export function buildRequest(s: Selection, filter: BulkFilter, to: BulkTransitionRequest['to']): BulkTransitionRequest {
  if (s.mode === 'filter') return { filter, to, limit: Math.min(s.total, BULK_LIMIT) };
  return { ids: [...s.items.keys()], to };
}

export function breakdown(items: Iterable<AdminQuestionDto>): Array<{ key: string; count: number }> {
  const m = new Map<string, number>();
  for (const q of items) {
    const key = `${q.topicId}/${q.subfield} ★${q.difficulty}`;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m].map(([key, count]) => ({ key, count })).sort((x, y) => x.key.localeCompare(y.key));
}
