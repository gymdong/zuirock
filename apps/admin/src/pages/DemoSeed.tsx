import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import type { SeedResult, SeedVerify } from '../api/types.js';
import { CONFIRM_WORD, SEED_OFF_MESSAGE, checkRows, isConfirmed, isSeedOff, observedRows, seedErrorMessage, summaryText } from '../lib/demo.js';

export function DemoSeed() {
  const [off, setOff] = useState(false);
  const [verify, setVerify] = useState<SeedVerify | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState<SeedResult | null>(null);
  const [error, setError] = useState('');

  const runVerify = useCallback(async () => {
    setLoading(true);
    try {
      setVerify(await api.seedVerify());
      setOff(false);
    } catch (e) {
      if (isSeedOff(e)) setOff(true);
      else setError(seedErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void runVerify();
  }, [runVerify]);

  async function apply() {
    setDialog(false);
    setTyped('');
    setRunning(true);
    setError('');
    setDone(null);
    try {
      setDone(await api.seedApply());
    } catch (e) {
      if (isSeedOff(e)) setOff(true);
      setError(seedErrorMessage(e));
    } finally {
      setRunning(false);
    }
    await runVerify();
  }

  return (
    <>
      <h1>시연 데이터</h1>
      {off && <p className="warn">{SEED_OFF_MESSAGE}</p>}
      <div className="row">
        <button disabled={off || running || loading} onClick={() => void runVerify()}>검증</button>
        <button className="danger" disabled={off || running} onClick={() => setDialog(true)}>
          seed 적용 (내 계정 학습 기록이 모두 초기화돼요)
        </button>
        {running && <span className="spinner" role="status">적용하는 중… 5~10초 걸려요</span>}
      </div>
      {error && <p className="err">{error}</p>}
      {done && <p className="ok">적용했습니다: {summaryText(done)}</p>}
      {!off && loading && !verify && <p>불러오는 중…</p>}
      {verify && !off && (
        <>
          <h2 className={verify.ok ? 'ok' : 'err'}>{verify.ok ? '모든 검증 통과' : '검증 실패 항목 있음'}</h2>
          <table>
            <thead><tr><th></th><th>항목</th><th>기대값</th><th>실제값</th></tr></thead>
            <tbody>
              {checkRows(verify.checks).map((r) => (
                <tr key={r.name}>
                  <td className={r.ok ? 'ok' : 'err'}>{r.mark}</td>
                  <td>{r.name}</td>
                  <td>{r.expected}</td>
                  <td>{r.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>관측값</h2>
          <table>
            <tbody>
              {observedRows(verify.observed).map((r) => (
                <tr key={r.label}><th>{r.label}</th><td>{r.value}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {dialog && (
        <div className="dialog">
          <div className="box">
            <h3 className="err">내 계정의 학습 기록이 모두 초기화돼요</h3>
            <p>계속하려면 <strong>{CONFIRM_WORD}</strong>를 입력하세요.</p>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            <div className="row">
              <button className="danger" disabled={!isConfirmed(typed) || running} onClick={() => void apply()}>적용</button>
              <button onClick={() => { setDialog(false); setTyped(''); }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
