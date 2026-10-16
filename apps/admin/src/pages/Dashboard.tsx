import { DIFFICULTIES, MVP_TOPIC_IDS, TOPIC_NAME_BY_ID } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { CountRow } from '../api/types.js';
import { countByTopicStar, preconditionChecks } from '../lib/counts.js';

export function Dashboard() {
  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [status, setStatus] = useState<CountRow['status'] | 'all'>('published');
  const [error, setError] = useState('');

  useEffect(() => {
    api.counts().then(setRows, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="err">{error}</p>;
  if (!rows) return <p>불러오는 중…</p>;
  const table = countByTopicStar(rows, status);
  return (
    <>
      <h1>문제 현황</h1>
      <div className="row">
        <label>
          상태{' '}
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">전체</option>
            <option value="draft">초안</option>
            <option value="reviewed">검수 완료</option>
            <option value="published">공개</option>
            <option value="suspended">중지</option>
          </select>
        </label>
      </div>
      <table>
        <thead>
          <tr>
            <th>주제</th>
            {DIFFICULTIES.map((d) => (
              <th key={d}>★{d}</th>
            ))}
            <th>합계</th>
          </tr>
        </thead>
        <tbody>
          {MVP_TOPIC_IDS.map((t) => (
            <tr key={t}>
              <th>{TOPIC_NAME_BY_ID[t]}</th>
              {table[t].map((n, i) => (
                <td key={i}>{n}</td>
              ))}
              <td>{table[t].reduce((a, b) => a + b, 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>E2E 콘텐츠 전제 조건 (공개 문제 기준)</h2>
      <ul>
        {preconditionChecks(rows).map((c) => (
          <li key={c.label} className={c.ok ? 'ok' : 'err'}>
            {c.ok ? '충족' : '미달'} · {c.label}: {c.value} / {c.need}
          </li>
        ))}
      </ul>
    </>
  );
}
