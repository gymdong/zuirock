import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api/client.js';
import { Dashboard } from './pages/Dashboard.js';
import { Import } from './pages/Import.js';
import { Login } from './pages/Login.js';
import { QuestionEdit } from './pages/QuestionEdit.js';
import { Questions } from './pages/Questions.js';

const hash = () => window.location.hash.replace(/^#/, '') || '/';

export function App() {
  const [route, setRoute] = useState(hash());
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const on = () => setRoute(hash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (authed !== null) return;
    if (!getToken() && import.meta.env.VITE_MOCK !== '1') {
      setAuthed(false);
      return;
    }
    api.me().then((m) => setAuthed(m.isAdmin), () => setAuthed(false));
  }, [authed]);

  if (authed === null) return <p>확인 중…</p>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const edit = /^\/questions\/(.+)$/.exec(route);
  return (
    <>
      <header className="top">
        <strong>쥐락펴락 관리자</strong>
        <a href="#/">현황</a>
        <a href="#/questions">문제</a>
        <a href="#/import">올리기</a>
        <span className="sp" />
        <button onClick={() => { setToken(null); setAuthed(false); }}>로그아웃</button>
      </header>
      <main>
        {edit ? <QuestionEdit id={edit[1]!} /> : route === '/questions' ? <Questions /> : route === '/import' ? <Import /> : <Dashboard />}
      </main>
    </>
  );
}
