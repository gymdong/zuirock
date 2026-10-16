import {
  DIFFICULTIES,
  MVP_TOPIC_IDS,
  QUESTION_STATUSES,
  QUESTION_TYPES,
  SUBFIELDS_BY_TOPIC,
  TOPIC_NAME_BY_ID,
  type AdminQuestionDto,
  type QuestionStatus,
  type QuestionType,
  type TopicId,
} from '@zuirock/shared';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { QuestionQuery } from '../api/types.js';
import { BULK_APPROVE_MAX, checkApprove, needsLinkCheck } from '../lib/approve.js';

const STATUS_KO: Record<QuestionStatus, string> = { draft: '초안', reviewed: '검수 완료', published: '공개', suspended: '중지' };
const TYPE_KO: Record<QuestionType, string> = { chosung: '초성', mcq: '객관식', ox: 'OX' };
const PAGE = 20;

export function Questions() {
  const [filter, setFilter] = useState<QuestionQuery>({ status: 'reviewed' });
  const [cursors, setCursors] = useState<string[]>([]); // cursors[i] = cursor to load page i+1
  const [page, setPage] = useState<{ items: AdminQuestionDto[]; nextCursor: string | null } | null>(null);
  const [selected, setSelected] = useState<Map<string, AdminQuestionDto>>(new Map());
  const [linksChecked, setLinksChecked] = useState(false);
  const [msg, setMsg] = useState('');

  const cursor = cursors.length ? cursors[cursors.length - 1] : undefined;
  const load = useCallback(() => {
    setPage(null);
    api.listQuestions({ ...filter, limit: PAGE, cursor }).then(setPage, (e: Error) => setMsg(e.message));
  }, [filter, cursor]);
  useEffect(load, [load]);

  const change = (patch: QuestionQuery) => {
    setFilter({ ...filter, ...patch });
    setCursors([]);
    setSelected(new Map());
  };
  const toggle = (q: AdminQuestionDto) => {
    const next = new Map(selected);
    if (next.has(q.id)) next.delete(q.id);
    else next.set(q.id, q);
    setSelected(next);
  };
  const chosen = [...selected.values()];
  const problems = checkApprove(chosen, linksChecked);

  async function approve() {
    try {
      const r = await api.approve({ questionIds: chosen.map((q) => q.id), linksChecked });
      setMsg(`${r.published}건을 공개했습니다`);
      setSelected(new Map());
      setLinksChecked(false);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '승인에 실패했습니다');
    }
  }

  async function mark(q: AdminQuestionDto, status: QuestionStatus) {
    try {
      await api.updateQuestion(q.id, { status });
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '상태 변경에 실패했습니다');
    }
  }

  const subfields = filter.topicId ? SUBFIELDS_BY_TOPIC[TOPIC_NAME_BY_ID[filter.topicId as (typeof MVP_TOPIC_IDS)[number]]] : [];

  return (
    <>
      <h1>문제 목록</h1>
      <div className="row">
        <select value={filter.topicId ?? ''} onChange={(e) => change({ topicId: (e.target.value || undefined) as TopicId | undefined, subfield: undefined })}>
          <option value="">주제 전체</option>
          {MVP_TOPIC_IDS.map((t) => (
            <option key={t} value={t}>{TOPIC_NAME_BY_ID[t]}</option>
          ))}
        </select>
        <select value={filter.subfield ?? ''} onChange={(e) => change({ subfield: (e.target.value || undefined) as QuestionQuery['subfield'] })}>
          <option value="">세부 분야 전체</option>
          {subfields.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={filter.status ?? ''} onChange={(e) => change({ status: (e.target.value || undefined) as QuestionStatus | undefined })}>
          <option value="">상태 전체</option>
          {QUESTION_STATUSES.map((s) => (
            <option key={s} value={s}>{STATUS_KO[s]}</option>
          ))}
        </select>
        <select value={filter.difficulty ?? ''} onChange={(e) => change({ difficulty: e.target.value ? Number(e.target.value) : undefined })}>
          <option value="">난이도 전체</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>★{d}</option>
          ))}
        </select>
        <select value={filter.type ?? ''} onChange={(e) => change({ type: (e.target.value || undefined) as QuestionType | undefined })}>
          <option value="">유형 전체</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{TYPE_KO[t]}</option>
          ))}
        </select>
      </div>
      {msg && <p className="warn">{msg}</p>}
      <div className="row">
        <strong>선택 {chosen.length}건</strong>
        {needsLinkCheck(chosen) && (
          <label>
            <input type="checkbox" checked={linksChecked} onChange={(e) => setLinksChecked(e.target.checked)} /> 링크 확인
          </label>
        )}
        <button disabled={problems.length > 0} onClick={() => void approve()}>
          선택 승인(공개) · 최대 {BULK_APPROVE_MAX}건
        </button>
        {chosen.length > 0 && problems.length > 0 && <span className="err">{problems.join(' / ')}</span>}
      </div>
      {!page ? (
        <p>불러오는 중…</p>
      ) : (
        <table>
          <thead>
            <tr><th></th><th>주제/분야</th><th>유형</th><th>★</th><th>문제</th><th>정답</th><th>상태</th><th>작업</th></tr>
          </thead>
          <tbody>
            {page.items.map((q) => (
              <tr key={q.id}>
                <td><input type="checkbox" checked={selected.has(q.id)} onChange={() => toggle(q)} /></td>
                <td>{TOPIC_NAME_BY_ID[q.topicId as (typeof MVP_TOPIC_IDS)[number]] ?? q.topicId}/{q.subfield}</td>
                <td>{TYPE_KO[q.type]}</td>
                <td>{q.difficulty}</td>
                <td className="q">{q.question}</td>
                <td>{q.answer}</td>
                <td><span className={`badge ${q.status}`}>{STATUS_KO[q.status]}</span></td>
                <td>
                  <a href={`#/questions/${q.id}`}>수정</a>{' '}
                  {q.status === 'draft' && <button onClick={() => void mark(q, 'reviewed')}>검수 완료</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row">
        <button disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))}>이전</button>
        <span>{cursors.length + 1}쪽</span>
        <button disabled={!page?.nextCursor} onClick={() => page?.nextCursor && setCursors([...cursors, page.nextCursor])}>다음</button>
      </div>
    </>
  );
}
