import { DIFFICULTIES, MVP_TOPIC_IDS, type MvpTopicId } from '@zuirock/shared';
import type { CountRow } from '../api/types.js';

/** topic × star table of published counts (or any status). */
export function countByTopicStar(rows: CountRow[], status: CountRow['status'] | 'all'): Record<MvpTopicId, number[]> {
  const out = Object.fromEntries(MVP_TOPIC_IDS.map((t) => [t, DIFFICULTIES.map(() => 0)])) as Record<MvpTopicId, number[]>;
  for (const r of rows) {
    if (status !== 'all' && r.status !== status) continue;
    const row = out[r.topicId as MvpTopicId];
    const i = DIFFICULTIES.findIndex((d) => d === r.difficulty);
    if (row && i >= 0) row[i]! += r.count;
  }
  return out;
}

export interface Check {
  label: string;
  value: number;
  need: number;
  ok: boolean;
}

const sum = (rows: CountRow[], f: (r: CountRow) => boolean) => rows.filter(f).reduce((a, r) => a + r.count, 0);

/** D9 콘텐츠 전제 조건(공개 문제 기준): 과학 ★2+ ≥20, 주제별 ★2~3 ≥10, 쇼케이스(상식·역사·과학, ★3+, 초성·객관식) ≥10. */
export function preconditionChecks(rows: CountRow[]): Check[] {
  const pub = rows.filter((r) => r.status === 'published');
  const mk = (label: string, value: number, need: number): Check => ({ label, value, need, ok: value >= need });
  const names = { general: '상식', vocab: '어휘력', history: '역사', science: '과학', geography: '지리', sports: '스포츠' } as const;
  return [
    mk('과학 ★2 이상 공개', sum(pub, (r) => r.topicId === 'science' && r.difficulty >= 2), 20),
    ...MVP_TOPIC_IDS.map((t) => mk(`${names[t]} ★2~3 공개`, sum(pub, (r) => r.topicId === t && r.difficulty >= 2 && r.difficulty <= 3), 10)),
    mk(
      '쇼케이스: 상식·역사·과학 ★3 이상 초성·객관식 공개',
      sum(pub, (r) => ['general', 'history', 'science'].includes(r.topicId) && r.difficulty >= 3 && r.type !== 'ox'),
      10,
    ),
  ];
}
