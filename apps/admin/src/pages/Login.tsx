import { useState } from 'react';
import { api, setToken } from '../api/client.js';

export function Login({ onDone }: { onDone: () => void }) {
  const [token, setTokenText] = useState('');
  const [error, setError] = useState('');

  async function submit() {
    setToken(token.trim());
    try {
      const me = await api.me();
      if (!me.isAdmin) throw new Error('관리자 권한이 없는 계정입니다');
      onDone();
    } catch (e) {
      setToken(null);
      setError(e instanceof Error ? e.message : '로그인에 실패했습니다');
    }
  }

  return (
    <main>
      <h1>쥐락펴락 관리자 로그인</h1>
      <p>앱에서 로그인한 관리자 계정의 액세스 토큰(JWT)을 붙여 넣으세요.</p>
      <label className="f">
        액세스 토큰
        <textarea rows={4} value={token} onChange={(e) => setTokenText(e.target.value)} />
      </label>
      <button onClick={() => void submit()} disabled={!token.trim()}>
        로그인
      </button>
      {error && <p className="err">{error}</p>}
    </main>
  );
}
