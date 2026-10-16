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
import {
  BULK_LIMIT,
  breakdown,
  buildRequest,
  emptySelection,
  isPageSelected,
  selectAllMatching,
  selectRange,
  selectedCount,
  setPage as setPageSelected,
  toggleRow,
  type Selection,
} from '../lib/selection.js';

const STATUS_KO: Record<QuestionStatus, string> = { draft: '초안', reviewed: '검수 완료', published: '공개', suspended: '중지' };
const TYPE_KO: Record<QuestionType, string> = { chosung: '초성', mcq: '객관식', ox: 'OX' };
const PAGE_SIZES = [50, 100, 200];

export function Questions() {
  const [filter, setFilter] = useState<QuestionQuery>({ status: 'reviewed' });
  const [cursors, setCursors] = useState<string[]>([]); // cursors[i] = cursor to load page i+1
  const [page, setPage] = useState<{ items: AdminQuestionDto[]; nextCursor: string | null } | null>(null);
  const [pageSize, setPageSize] = useState(50);
  const [sel, setSel] = useState<Selection>(emptySelection());
  const [lastIdx, setLastIdx] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmTo, setConfirmTo] = useState<'reviewed' | 'published' | null>(null);
  const [result, setResult] = useState('');
  const [linksChecked, setLinksChecked] = useState(false);
  const [msg, setMsg] = useState('');

  const cursor = cursors.length ? cursors[cursors.length - 1] : undefined;
  const load = useCallback(() => {
    setPage(null);
    api.listQuestions({ ...filter, limit: pageSize, cursor }).then(setPage, (e: Error) => setMsg(e.message));
  }, [filter, cursor, pageSize]);
  useEffect(load, [load]);

  const change = (patch: QuestionQuery) => {
    setFilter({ ...filter, ...patch });
    setCursors([]);
    setSel(emptySelection());
  };
  const onRow = (q: AdminQuestionDto, idx: number, shift: boolean) => {
    if (shift && lastIdx !== null && page) setSel(selectRange(sel, page.items, lastIdx, idx, !sel.items.has(q.id)));
    else setSel(toggleRow(sel, q));
    setLastIdx(idx);
  };
  const pageAll = page ? isPageSelected(sel, page.items) : false;

  async function selectEverything() {
    setMsg('필터에 맞는 문제를 세는 중…');
    const all: AdminQuestionDto[] = [];
    let c: string | undefined;
    do {
      const r = await api.listQuestions({ ...filter, limit: 200, cursor: c });
      all.push(...r.items);
      c = r.nextCursor ?? undefined;
    } while (c);
    setSel(selectAllMatching(all));
    setMsg('');
  }

  async function transition(to: 'reviewed' | 'published') {
    setPending(true);
    setConfirmTo(null);
    try {
      const { cursor: _c, limit: _l, ...f } = filter;
      const r = await api.bulkTransition(buildRequest(sel, f, to));
      const why = r.skipped.slice(0, 3).map((s) => s.reason).join(' / ');
      setResult(`${r.updated}건 변경, ${r.skipped.length}건 건너뜀${why ? ` (${why})` : ''}${r.remaining ? `, 남은 ${r.remaining}건` : ''}`);
      setSel(emptySelection());
      load();
    } catch (e) {
      setResult(e instanceof Error ? e.message : '일괄 변경에 실패했습니다');
    } finally {
      setPending(false);
    }
  }
  const chosen = [...sel.items.values()];
  const problems = checkApprove(chosen, linksChecked);

  async function approve() {
    try {
      const r = await api.approve({ questionIds: chosen.map((q) => q.id), linksChecked });
      setMsg(`${r.published}건을 공개했습니다`);
      setSel(emptySelection());
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
      {result && <p className="ok">{result}</p>}
      <div className="row">
        <label>
          쪽당{' '}
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setCursors([]); setSel(emptySelection()); }}>
            {PAGE_SIZES.map((n) => (<option key={n} value={n}>{n}개</option>))}
          </select>
        </label>
      </div>
      {pageAll && sel.mode === 'page' && (page?.nextCursor || cursors.length > 0) && (
        <div className="row warn">
          이 쪽의 {sel.items.size}건을 선택했습니다.
          <button onClick={() => void selectEverything()}>현재 필터에 맞는 전체 선택</button>
        </div>
      )}
      {sel.mode === 'filter' && <div className="row warn">현재 필터에 맞는 전체 {sel.total}건을 선택했습니다. (한 번에 최대 {BULK_LIMIT}건)</div>}
      <div className="bar">
        <strong>선택 {selectedCount(sel)}건</strong>
        <button disabled={pending || selectedCount(sel) === 0} onClick={() => setConfirmTo('published')}>공개하기 (검수 완료 포함)</button>
        <button disabled={pending || selectedCount(sel) === 0} onClick={() => setConfirmTo('reviewed')}>검수 완료만</button>
        {needsLinkCheck(chosen) && (
          <label><input type="checkbox" checked={linksChecked} onChange={(e) => setLinksChecked(e.target.checked)} /> 링크 확인</label>
        )}
        <button disabled={pending || sel.mode === 'filter' || problems.length > 0} onClick={() => void approve()}>
          규칙 검사 승인 · 최대 {BULK_APPROVE_MAX}건
        </button>
        {sel.mode === 'page' && chosen.length > 0 && problems.length > 0 && <span className="err">{problems.join(' / ')}</span>}
      </div>
      {confirmTo && (
        <div className="dialog">
          <div className="box">
            <h3>{selectedCount(sel)}건을 {confirmTo === 'published' ? '공개' : '검수 완료'}로 바꿀까요?</h3>
            <ul>
              {breakdown(sel.items.values()).map((b) => (<li key={b.key}>{b.key}: {b.count}건</li>))}
            </ul>
            <div className="row">
              <button disabled={pending} onClick={() => void transition(confirmTo)}>확인</button>
              <button onClick={() => setConfirmTo(null)}>취소</button>
            </div>
          </div>
        </div>
      )}
      {!page ? (
        <p>불러오는 중…</p>
      ) : (
        <table>
          <thead>
            <tr><th><input type="checkbox" checked={pageAll} onChange={(e) => setSel(setPageSelected(sel, page.items, e.target.checked))} /></th><th>주제/분야</th><th>유형</th><th>★</th><th>문제</th><th>정답</th><th>상태</th><th>작업</th></tr>
          </thead>
          <tbody>
            {page.items.map((q, idx) => (
              <tr key={q.id}>
                <td><input type="checkbox" checked={sel.items.has(q.id)} onChange={() => undefined} onClick={(e) => onRow(q, idx, e.shiftKey)} /></td>
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
        <button disabled={cursors.length === 0} onClick={() => { setCursors(cursors.slice(0, -1)); setSel(emptySelection()); }}>이전</button>
        <span>{cursors.length + 1}쪽</span>
        <button disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) { setCursors([...cursors, page.nextCursor]); setSel(emptySelection()); } }}>다음</button>
      </div>
    </>
  );
}
