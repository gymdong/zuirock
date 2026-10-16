import { expect, test } from '@playwright/test';
import { connect, emit, memberToken, seedUsers } from './helpers.ts';

// Smoke checks that do not depend on unimplemented lanes: the single origin serves health and the web app.
test.describe('deployment smoke', () => {
  test('GET /api/health?deep=1 is 200', async ({ request }) => {
    const res = await request.get('/api/health?deep=1');
    expect(res.status()).toBe(200);
  });

  test('web export loads at /', async ({ page }) => {
    const res = await page.goto('/');
    expect(res?.status()).toBe(200);
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('admin build is served under /admin/', async ({ request }) => {
    const res = await request.get('/admin/', { headers: { Accept: 'text/html' } });
    expect(res.status()).toBe(200);
  });
});

// Guest B on the web export (iPhone/WebKit) plays a real battle against member A (socket client, seeded account).
test.describe('guest battle (AC-A8 web path)', () => {
  test.skip(!process.env.JWT_SECRET || process.env.E2E_TARGET === 'deployed' || !seedUsers(), 'needs JWT_SECRET, a local server and `pnpm seed:demo`');

  test('guest joins by link, plays 10 questions in the UI and sees the login prompt', async ({ page, request, baseURL }) => {
    test.setTimeout(240_000);
    const seed = seedUsers()!;
    const auth = { Authorization: `Bearer ${memberToken(seed.userId)}` };
    const created = await request.post('/api/rooms', {
      headers: auth,
      data: { settings: { topicIds: ['science'], types: ['mcq', 'ox'], questionCount: 10, minDifficulty: 2, timeLimitSec: 30, chosungRevealSec: null } },
    });
    expect(created.ok()).toBeTruthy();
    const { code } = (await created.json()) as { code: string };
    const a = await connect(baseURL!, memberToken(seed.userId));
    try {
      await emit(a.socket, 'room:join', { code });
      await page.goto(`/join/${code}?stay=1`);
      await page.getByLabel('닉네임').fill('게스트B');
      await page.getByText('게스트로 입장하기').click();
      await expect(page).toHaveURL(new RegExp(`/room/${code}/lobby`));
      await page.getByText('준비 완료').click();
      await emit(a.socket, 'room:start', {});

      let answeredByA = 0;
      const drive = (async () => {
        let done = false;
        void a.finished.then(() => (done = true));
        while (!done) {
          while (answeredByA < a.questions.length) {
            const e = a.questions[answeredByA++]!;
            await emit(a.socket, 'room:submit', { questionIndex: e.question.index, answer: 'zzz' }).catch(() => undefined);
          }
          await new Promise((r) => setTimeout(r, 150));
        }
      })();
      for (let i = 0; i < 10; i += 1) {
        await page.getByTestId('choice-0').click({ timeout: 40_000 });
        await page.waitForTimeout(500);
      }
      await drive;
      await expect(page).toHaveURL(new RegExp(`/room/${code}/result`), { timeout: 60_000 });
      await expect(page.getByText('로그인하고 기록 저장하기')).toBeVisible();
    } finally {
      a.socket.close();
    }
  });
});
