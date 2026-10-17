import { ApiError, type SeedCheck, type SeedResult } from '../api/types.js';

export const CONFIRM_WORD = '초기화';

/** The seed button's confirm dialog only enables on the exact word. */
export const isConfirmed = (typed: string): boolean => typed.trim() === CONFIRM_WORD;

export const SEED_OFF_MESSAGE = 'DEMO_SEED=1 환경 변수가 꺼져 있어요';

/** 404 from verify/status/apply means the server has DEMO_SEED off. */
export const isSeedOff = (e: unknown): boolean => e instanceof ApiError && e.status === 404;

export function seedErrorMessage(e: unknown): string {
  if (isSeedOff(e)) return SEED_OFF_MESSAGE;
  return e instanceof Error ? e.message : '시연 데이터 적용에 실패했습니다';
}

const show = (v: unknown): string => (typeof v === 'string' ? v : JSON.stringify(v));

export interface CheckRow {
  mark: '✓' | '✗';
  name: string;
  expected: string;
  actual: string;
  ok: boolean;
}

export function checkRows(checks: SeedCheck[]): CheckRow[] {
  return checks.map((c) => ({ mark: c.ok ? '✓' : '✗', name: c.name, expected: show(c.expected), actual: show(c.actual), ok: c.ok }));
}

const OBSERVED_LABELS: Array<[key: string, label: string]> = [
  ['weeklySolved', '이번 주 풀이 수'],
  ['insufficientData', '데이터 부족'],
  ['weakTopics', '취약 주제'],
  ['allocation', '종합 세트 배정'],
  ['cheese', '치즈'],
  ['streak', '스트릭'],
  ['topicLevels', '주제 레벨'],
  ['openWrongNotes', '열린 오답노트'],
  ['friends', '친구'],
];

export function observedRows(observed: Record<string, unknown>): Array<{ label: string; value: string }> {
  return OBSERVED_LABELS.filter(([k]) => k in observed).map(([k, label]) => ({ label, value: show(observed[k]) }));
}

export const summaryText = (r: SeedResult): string =>
  `풀이 ${r.solves}, 세트 ${r.sets}, 오답노트 ${r.wrongNotes}, 친구 ${r.friends}, 대결 ${r.battles}, 치즈 ${r.cheese}, 스트릭 ${r.streak} (${(r.durationMs / 1000).toFixed(1)}초)`;
