import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/types.js';
import { checkRows, isConfirmed, isSeedOff, observedRows, seedErrorMessage, SEED_OFF_MESSAGE, summaryText } from './demo.js';

describe('demo seed helpers', () => {
  it('confirms only the exact word 초기화', () => {
    expect(isConfirmed('초기화')).toBe(true);
    expect(isConfirmed(' 초기화 ')).toBe(true);
    expect(isConfirmed('초기')).toBe(false);
    expect(isConfirmed('')).toBe(false);
    expect(isConfirmed('RESET_MY_DEMO_ACCOUNT')).toBe(false);
  });
  it('treats 404 as feature off and keeps server messages otherwise', () => {
    expect(isSeedOff(new ApiError(404, 'NOT_FOUND', 'x'))).toBe(true);
    expect(seedErrorMessage(new ApiError(404, 'NOT_FOUND', 'x'))).toBe(SEED_OFF_MESSAGE);
    expect(seedErrorMessage(new ApiError(409, 'NOT_ENOUGH_QUESTIONS', '과학/물리 문제가 모자라요'))).toBe('과학/물리 문제가 모자라요');
  });
  it('renders checks with marks and stringified values', () => {
    const rows = checkRows([
      { name: 'a', expected: 37, actual: 37, ok: true },
      { name: 'b', expected: ['x'], actual: 'y', ok: false },
    ]);
    expect(rows).toEqual([
      { mark: '✓', name: 'a', expected: '37', actual: '37', ok: true },
      { mark: '✗', name: 'b', expected: '["x"]', actual: 'y', ok: false },
    ]);
  });
  it('labels observed values and skips missing ones', () => {
    expect(observedRows({ weeklySolved: 37, friends: 2 })).toEqual([
      { label: '이번 주 풀이 수', value: '37' },
      { label: '친구', value: '2' },
    ]);
  });
  it('summarizes the seed result', () => {
    expect(summaryText({ userId: 'u', solves: 120, sets: 12, wrongNotes: 8, friends: 2, battles: 3, cheese: 90, streak: 5, durationMs: 7400 })).toContain('(7.4초)');
  });
});
