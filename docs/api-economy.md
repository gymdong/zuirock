# 경제 API (라운드 2, lane LB → LG)

All routes are under `/api` and need a member JWT (a guest token → 401). DTOs are in `packages/shared/src/dto/shop.ts`. Rule functions come from `@zuirock/game-rules` (`chest.ts`, LA) and numbers from `DEFAULT_CONFIG` (`chest`, `consumables`, `streak.protection`). Requirements: `docs/feedback-round2.md`.

| Method | Path | Body | Response / errors | DB queries (incl. auth guard) |
|---|---|---|---|---|
| GET | `/shop` | — | `ShopDto` | **2** (guard + one statement for cheese, held protections, consumables, unopened chests) |
| POST | `/shop/items/:kind/purchase` | `{ quantity? }` (1–99, default 1) | `{ cheese, owned }`; 402 `INSUFFICIENT_CHEESE`, 409 `MAX_HELD`, 404 `UNKNOWN_ITEM` | ≈ 6 in one transaction |
| GET | `/me/inventory` | — | `InventoryDto` | 3 |
| POST | `/me/chests/:id/open` | — | `OpenChestResponse`; 409 `CHEST_OPENED`, 404 `CHEST_NOT_FOUND` (also for another user's chest) | ≈ 8 in one transaction |
| GET | `/me/streak/calendar?month=YYYY-MM` | — | `StreakCalendarDto` (KST); 400 `BAD_MONTH` | **4** (guard + streak state + one aggregate over sets/battles/protection uses/tracking start + held protections); a streak catch-up runs first only when the state is more than a day stale (the hourly job normally keeps it fresh) |
| POST | `/solo/sets/:id/items/use` | `{ questionId, kind }` | `UseSoloItemResponse`; 404 `SET_NOT_FOUND` (anything that is not the caller's solo set, e.g. a room), 409 `NO_ITEM` / `ALREADY_USED` / `ALREADY_ANSWERED` / `SET_CLOSED`, 400 `WRONG_QUESTION_TYPE` / `NOT_IN_SET` / `BAD_KIND` | ≈ 7 |
| POST | `/solo/sets/:id/complete` | — | `SetResultDto` + `chest?: { id, tier }` | — |

Rules:
- **Shop:** the streak protection is sold here and at its old route `POST /me/streak/protections`; both write the same `protection_purchase` ledger rows (max 2 held). Consumables are in `UserConsumable` (max 99 each, cheese ledger `item_purchase` with `itemId = kind`).
- **No overspending:** every cheese spender takes the same sorted advisory xact locks: `(userId, cheese)`, plus `(userId, streak)` when protections are involved. This covers the shop, wardrobe, streak protection/restore and chest opening. A test checks 5 parallel purchases against 20 cheese: one 200 and four 402.
- **Chests:**
  - When granted: a member's stage first clear only, using the same `firstClear` as the XP rule. Failed or replayed stages, placement tests, basic tests and their skipped stages, and guests get no chest.
  - Tier: `good` when the level is a multiple of 5.
  - Idempotent: at most one chest per set attempt (`Chest.sourceSetAttemptId` unique), and repeating `/complete` returns the same chest.
  - Opening: rewards are rolled once with `rollChest` and a crypto RNG (`node:crypto randomInt`), then stored in `Chest.rewards`.
  - Reward rows: cheese becomes `chest_reward` ledger rows. A protection becomes a zero-cost `protection_purchase` row (30 cheese instead at the cap of 2). Items increment `UserConsumable`. If the player already holds the maximum (99) of a rolled consumable, that reward becomes cheese worth the item's shop price (15). The stored and returned reward list shows `{ type: 'cheese', amount: 15 }` in its place. rollChest itself applies only the protection cap.
- **Items (solo only):**
  - Uses: one per (set, question, kind) (`ItemUse` primary key), only before the question is answered.
  - `chosung_first` works only on chosung questions and returns the answer's first syllable. `remove_wrong_choice` works only on mcq and returns a wrong choice, never the answer.
  - Effect: the question is added to `SetAttempt.hintedQuestionIds`, the same mechanism as the hint button, so it loses the no-hint bonus. The clear rule (7/10) and the other XP rules are unchanged.
- **Calendar day states:**
  - `future`: after today.
  - `today`: today, with `sets`/`battles` counts when studied.
  - `studied`: a completed full solo set (≥ 10 questions, not a skip) or a finished battle that KST day, or a day inside the current or just-broken streak run (StreakState runStartDay..lastCountedDay) that was not protected. This keeps the calendar in sync with streaks built by `markActivity` alone, e.g. seeds.
  - `protected`: a `protection_use` row stamped at the following 00:00 KST.
  - `missed`: no activity and no protection, on or after the tracking start.
  - `none`: before the tracking start, i.e. the earlier of account creation and the first counted activity (KST day). Render it as an empty grey day.
- **Demo seed:** the reset also clears the caller's chests, consumables and item uses (cheese stays 320).
