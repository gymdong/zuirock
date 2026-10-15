import { expect, test } from '@playwright/test';

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
    const res = await request.get('/admin/');
    expect(res.status()).toBe(200);
  });
});

test.describe('guest battle (AC-A8 web path)', () => {
  test.fixme(
    true,
    'Needs lane LB (guest token + /api/rooms) and lane LD (room/lobby screens with testIDs); un-fixme at D7 and add selectors.',
  );

  test('guest joins a room by code, plays 10 questions and sees the result with a login prompt', async ({ page }) => {
    await page.goto('/');
    // 1. member API creates a room (settings: science only, mcq/ox, 10 questions, star>=2, 30s)
    // 2. guest opens /join/<code>, enters a nickname
    // 3. both answer; result screen shows ranking and "로그인하고 기록 저장하기" (Kakao first)
  });
});
