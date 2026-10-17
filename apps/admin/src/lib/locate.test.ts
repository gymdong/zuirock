import { describe, expect, it } from 'vitest';
import { describeItem, itemInfo, locateItems } from './locate.js';

describe('locate', () => {
  const text = '[\n  {"no": 7, "question": "가나다"},\n  {"question": "x, [y] {z}"}\n]';
  it('finds the start line of each top-level item', () => {
    expect(locateItems(text).map((l) => l.line)).toEqual([2, 3]);
  });
  it('describes no and line', () => {
    const raw = JSON.parse(text) as unknown;
    expect(describeItem(itemInfo(raw, locateItems(text), 1))).toBe('no 7, 줄 2');
    expect(describeItem(itemInfo(raw, locateItems(text), 2))).toBe('줄 3');
  });
});
