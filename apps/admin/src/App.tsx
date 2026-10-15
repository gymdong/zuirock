import { QUESTION_STATUSES } from '@zuirock/shared';

export function App() {
  return (
    <main style={{ fontFamily: 'sans-serif', padding: 24 }}>
      <h1>쥐락펴락 관리자</h1>
      <p>문제 상태: {QUESTION_STATUSES.join(' → ')}</p>
    </main>
  );
}
