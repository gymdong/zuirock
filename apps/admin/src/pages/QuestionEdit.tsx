import { DIFFICULTIES, type AdminQuestionDto, type QuestionStatus } from '@zuirock/shared';
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { checkApprove, needsLinkCheck } from '../lib/approve.js';

export function QuestionEdit({ id }: { id: string }) {
  const [q, setQ] = useState<AdminQuestionDto | null>(null);
  const [msg, setMsg] = useState('');
  const [linksChecked, setLinksChecked] = useState(false);

  useEffect(() => {
    api.getQuestion(id).then(setQ, (e: Error) => setMsg(e.message));
  }, [id]);
  if (!q) return <p className={msg ? 'err' : undefined}>{msg || '불러오는 중…'}</p>;

  const set = <K extends keyof AdminQuestionDto>(k: K, v: AdminQuestionDto[K]) => setQ({ ...q, [k]: v });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      setQ(await api.getQuestion(id));
      setMsg(ok);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '실패했습니다');
    }
  };
  const save = () =>
    run(
      () =>
        api.updateQuestion(id, {
          question: q.question,
          answer: q.answer,
          ...(q.type === 'mcq' ? { choices: q.choices } : {}),
          explanation: q.explanation,
          source: q.source,
          difficulty: q.difficulty,
        }),
      '저장했습니다',
    );
  const setStatus = (status: QuestionStatus) => run(() => api.updateQuestion(id, { status }), '상태를 바꿨습니다');
  const problems = checkApprove([q], linksChecked);

  return (
    <>
      <p><a href="#/questions">← 목록</a></p>
      <h1>문제 수정 <span className={`badge ${q.status}`}>{q.status}</span></h1>
      <p>{q.topicId} / {q.subfield} / {q.type} · 풀이 {q.solveCount}회 · 신고 {q.openReportCount}건</p>
      <label className="f">문제<textarea rows={3} value={q.question} onChange={(e) => set('question', e.target.value)} /></label>
      <label className="f">정답<input value={q.answer} onChange={(e) => set('answer', e.target.value)} /></label>
      {q.type === 'mcq' && (
        <label className="f">
          보기 (한 줄에 하나, 4개)
          <textarea rows={4} value={(q.choices ?? []).join('\n')} onChange={(e) => set('choices', e.target.value.split('\n'))} />
        </label>
      )}
      <label className="f">해설<textarea rows={3} value={q.explanation} onChange={(e) => set('explanation', e.target.value)} /></label>
      <label className="f">출처 제목<input value={q.source.title} onChange={(e) => set('source', { ...q.source, title: e.target.value })} /></label>
      <label className="f">출처 주소 (모르면 비워 둠)<input value={q.source.url} onChange={(e) => set('source', { ...q.source, url: e.target.value })} /></label>
      <label className="f">
        난이도
        <select value={q.difficulty} onChange={(e) => set('difficulty', Number(e.target.value))}>
          {DIFFICULTIES.map((d) => (<option key={d} value={d}>★{d}</option>))}
        </select>
      </label>
      <div className="row">
        <button onClick={() => void save()}>저장</button>
        {q.status === 'draft' && <button onClick={() => void setStatus('reviewed')}>검수 완료로</button>}
        {q.status === 'reviewed' && <button onClick={() => void setStatus('draft')}>초안으로 되돌리기</button>}
        {q.status !== 'suspended' && <button onClick={() => void setStatus('suspended')}>중지</button>}
        {q.status === 'suspended' && <button onClick={() => void setStatus('reviewed')}>검수 완료로 복귀</button>}
      </div>
      {q.status === 'reviewed' && (
        <div className="row">
          {needsLinkCheck([q]) && (
            <label><input type="checkbox" checked={linksChecked} onChange={(e) => setLinksChecked(e.target.checked)} /> 링크 확인</label>
          )}
          <button disabled={problems.length > 0} onClick={() => void run(() => api.approve({ questionIds: [q.id], linksChecked }), '공개했습니다')}>
            승인(공개)
          </button>
          {problems.length > 0 && <span className="err">{problems.join(' / ')}</span>}
        </div>
      )}
      {msg && <p className="warn">{msg}</p>}
    </>
  );
}
