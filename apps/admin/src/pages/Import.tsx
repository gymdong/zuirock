import type { ImportResultDto } from '@zuirock/shared';
import { useState } from 'react';
import { api } from '../api/client.js';
import { describeItem, itemInfo, locateItems, type ItemInfo } from '../lib/locate.js';

export function Import() {
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('문제.json');
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState('');
  const [infos, setInfos] = useState<(index: number) => ItemInfo>(() => () => ({}));

  async function run(dryRun: boolean) {
    setError('');
    setResult(null);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      setError(`JSON을 읽을 수 없습니다: ${(e as Error).message}`);
      return;
    }
    try {
      const locs = locateItems(text);
      setInfos(() => (index: number) => itemInfo(raw, locs, index));
      setResult(await api.importQuestions(raw, dryRun));
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다');
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
    setResult(null);
  }

  return (
    <>
      <h1>문제 JSON 올리기</h1>
      <p>먼저 "검사만 하기"로 오류를 확인한 뒤, 통과한 문제만 초안으로 올립니다. 같은 문구는 건너뜁니다.</p>
      <div className="row">
        <input type="file" accept=".json,application/json" onChange={(e) => void pick(e.target.files?.[0])} />
        <span>{fileName}</span>
      </div>
      <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder="[ { ... } ]" />
      <div className="row">
        <button disabled={!text.trim()} onClick={() => void run(true)}>검사만 하기</button>
        <button disabled={!text.trim()} onClick={() => void run(false)}>초안으로 올리기</button>
      </div>
      {error && <p className="err">{error}</p>}
      {result && (
        <>
          <p className={result.errors.length ? 'err' : 'ok'}>
            {result.dryRun ? '검사' : '업로드'} 결과: {result.total}문제 중 {result.acceptedCount}개 통과, 오류 {result.errors.length}건, 경고 {result.warnings.length}건
            {!result.dryRun && ` — ${result.acceptedCount}건을 초안으로 올렸습니다`}
          </p>
          {[...result.errors.map((e) => ({ e, kind: '오류' })), ...result.warnings.map((e) => ({ e, kind: '경고' }))].length > 0 && (
            <table>
              <thead><tr><th>구분</th><th>{fileName}</th><th>위치</th><th>문제 앞부분</th><th>항목</th><th>이유</th></tr></thead>
              <tbody>
                {[...result.errors.map((e) => ({ e, kind: '오류' })), ...result.warnings.map((e) => ({ e, kind: '경고' }))].map(({ e, kind }, i) => (
                  <tr key={i}>
                    <td className={kind === '오류' ? 'err' : 'warn'}>{kind}</td>
                    <td>{e.index > 0 ? `${e.index}번째${describeItem(infos(e.index)) ? ` (${describeItem(infos(e.index))})` : ''}` : '파일 전체'}</td>
                    <td>{infos(e.index).preview ?? ''}</td>
                    <td>{e.field ?? ''}</td>
                    <td>{e.message.replace(`${e.index}번째 문제: `, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
