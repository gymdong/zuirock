import { test } from '@playwright/test';

// AC-E2E (plan §4.3 LF). Observations are the same as docs/demo-runbook.md section 7. Seed numbers come from
// scripts/seed/demo-profile.ts (this week 27 solves, topic levels 25/22/21/24).
test.describe('AC-E2E loop: battle 1 then battle 2', () => {
  test.fixme(
    true,
    'Needs seed insertion through LB services (pass 2: scripts/seed/insert.ts), LB report/weak-topic/composite endpoints, LC rooms and LD screens.',
  );

  for (const wrongCount of [7, 10]) {
    test(`battle 1 (science, mcq/ox, 10q, star>=2, 30s): member A answers ${10 - wrongCount} right / ${wrongCount} wrong`, async () => {
      // Observations to assert after battle 1:
      // 1. this-week solves 27 -> 37; report goes from insufficientData to weakTopics = {물리, 화학, 생물}
      // 2. science this-week accuracy 80% -> <= 60%
      // 3. weak topics {어휘력, 상식} -> {과학, 어휘력}; composite allocation science 2 -> 3
      // 4. XP ledger gains a battle-reason row; wrong notes grow by >= 7
      // 5. guest B logs in: B's 10 SolveLog + 1 BattleResult move to B's account
    });
  }

  test('battle 2 (상식·역사·과학, star>=3, chosung+mcq, 10q) starts only after observations 1-5', async () => {
    // Gate: runs after the battle 1 test in the same worker (serial order).
  });
});
