# 관리자 API (lane LB → LE)

Every route is under `/api/admin`. Every request needs `Authorization: Bearer <member JWT>`, and that user must have `User.isAdmin = true`. A missing or invalid token answers 401. A member who is not an admin gets 403 `ADMIN_REQUIRED`. Admins log in with the normal OAuth flow (`POST /api/auth/:provider/start` → callback → `POST /api/auth/exchange`, with `returnTo` set to `${PUBLIC_ORIGIN}/admin/...`). To make a user an admin, set the flag in the DB (`UPDATE "User" SET "isAdmin" = true WHERE nickname = '…'`). Error bodies are `ApiErrorBody` `{ statusCode, code, message, details? }`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/session` | — | `MeDto` (use it to check admin access) |
| GET | `/questions` | query `status, topicId, subfield` (name), `subfieldId, type, difficulty, importBatch, q` (text contains), `cursor, limit` (≤ 200, default 50) | `Paginated<AdminQuestionDto> & { total }` (ordered by createdAt; pass `nextCursor` back as `cursor`; `total` counts every row matching the filter) |
| GET | `/questions/:id` | — | `AdminQuestionDto` (`solveCount`, `correctRate`, `openReportCount`) |
| PATCH | `/questions/:id` | `AdminUpdateQuestionRequest` | `AdminQuestionDto`. mcq needs the answer among 4 choices; OX answer is O/X; difficulty must be in 1–5 in 0.5 steps; duplicate text → 409 `DUPLICATE_QUESTION` |
| POST | `/questions/import` | JSON array of question objects (content/schema), or `{ questions, dryRun }`; query `?dryRun=1` | `ImportResultDto & { importBatch }`. Errors carry the 1-based `index`. Items may carry an optional integer `no` (≥ 1); it is accepted, ignored (not stored, not part of the duplicate check) and the import response shape is unchanged — clients map `index` back to `no`, the JSON line and the question text themselves. Accepted questions are created as `draft` unless it is a dry run |
| POST | `/questions/bulk-transition` | `{ ids?: string[] \| filter?: { status?, topicId?, subfield?, subfieldId?, type?, difficulty?, importBatch?, q? }, to: 'reviewed' \| 'published', limit?: number }` (send exactly one of `ids` and `filter`; `limit` default and max 500, also the max number of `ids`) | `{ updated, skipped: { id, reason }[], remaining? }` (see below) |
| POST | `/questions/approve` | `AdminBulkApproveRequest` | `{ published }` |
| GET | `/issue-reports` | query `status=open\|accepted\|rejected` | `IssueReportDto[]` (pass 2 adds the resolve action) |
| GET | `/calibration` | — | `CalibrationDto[]` (questions with ≥ 30 solves; pass 2 adds the apply action) |

Status transitions (PATCH `status`). Any other change answers 409 `BAD_TRANSITION`:

| from | to |
|---|---|
| draft | reviewed, suspended |
| reviewed | draft, published, suspended |
| published | suspended |
| suspended | reviewed, published |

Bulk approve rules, checked in this order:
1. 1–50 ids, otherwise 400 `BULK_SIZE`.
2. All must be `reviewed`, otherwise 409 `NOT_REVIEWED`.
3. All must be in one subfield, otherwise 400 `MIXED_SUBFIELD`.
4. Every question needs `source.title`, otherwise 400 `SOURCE_TITLE_REQUIRED`.
5. If any `source.url` is non-empty, `linksChecked: true` is required, otherwise 400 `LINKS_NOT_CHECKED`.
6. Zero import warnings (e.g. the answer appears in the question), otherwise 400 `HAS_WARNINGS` with `details`. Approve those questions one at a time with PATCH.

Only `published` questions are served (AC-C3). `GET /api/topics` marks a topic `available` once it has a published question (AC-C8). `GET /api/questions/stats` (public) returns published counts per topic × type × difficulty.

## Bulk transition (`POST /questions/bulk-transition`)

For publishing large batches when every DB round trip to the deployed DB is slow. It has none of `approve`'s limits (same subfield, 50 items, link check, warnings); `approve` stays as it was.

- Allowed changes: `draft → reviewed`, `draft → published` (review and publish in one step: sets `reviewedAt`, `reviewedById` and `publishedAt`), `reviewed → published` (sets `publishedAt`).
- Skipped rows get a reason: `SUSPENDED`, `ALREADY_PUBLISHED`, `ALREADY_REVIEWED` (only with `to: 'reviewed'`), `MISSING_SOURCE_TITLE`, `NOT_FOUND`.
- `ids` mode: the response explains every id that was not updated.
- `filter` takes the same keys as `GET /questions` (`subfield` is the subfield name, e.g. `화학`). An unknown key, a subfield name that does not exist, a malformed `subfieldId` UUID, or an invalid status, type, topic or difficulty answers 400 `BAD_FILTER`; a filter is never silently widened. Validation needs no extra DB query.
- `filter` mode: rows are processed in createdAt order, up to `limit` per call. `skipped` lists only the matching rows with an empty source title. `remaining` is how many eligible rows are left; call again until it is 0.
- Calling twice changes nothing the second time (`updated: 0`).
- It runs in one transaction with two statements: one SELECT that finds the skip reasons, and one set-based `UPDATE … RETURNING`. The request makes 3 DB queries including the auth guard (tested).

## DB queries per request (tested in `apps/server/test/integration/bulk-transition.int-spec.ts`)

| Request | Queries |
|---|---|
| every admin route | the auth guard adds 1 (the user's `isAdmin`) |
| `GET /questions` | 3 = guard + page + count (one SQL statement pulls the page, subfield name, solve stats and open report count) |
| `GET /questions/:id` | 2 = guard + 1 |
| `POST /questions/bulk-transition` | 3 = guard + skip-reason SELECT + UPDATE (BEGIN/COMMIT not counted) |

## Demo seed (`/demo/seed`, `DEMO_SEED=1` only)

These routes exist only while the env var `DEMO_SEED=1` is set (otherwise 404, the same pattern as dev login). Set it in the Render dashboard only for the demo period; `render.yaml` never sets it. All routes also need an admin.

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/demo/seed` | `{ "confirm": "RESET_MY_DEMO_ACCOUNT" }` (anything else → 400 `CONFIRM_REQUIRED`) | `{ userId, solves, sets, wrongNotes, friends, battles, cheese, streak, durationMs }`; 409 `SEED_RUNNING` while another seed runs; 409 `NOT_ENOUGH_QUESTIONS` naming the topic/subfield when published questions are short (nothing is changed) |
| GET | `/demo/seed/verify` | — | `{ ok, observed: { weeklySolved, insufficientData, weakTopics, allocation, cheese, streak, topicLevels, openWrongNotes, friends }, checks: [{ name, expected, actual, ok }] }` |
| GET | `/demo/seed/status` | — | `{ running }` |

What the seed does, in one transaction:
- **Reset, caller only:** solve logs, set attempts, battle results, wrong notes, report snapshots, XP, topic progress, streak, cheese ledger, selected topics. Also every `seed-demo` user, with their demo rooms.
- **Kept:** the account, nickname, avatar, admin flag, social logins, items and equipped items. No other real user's data is touched.
- **Apply:** the demo member-A state from the server clock, using published questions only.
  - this week 27 solves; 30-day wrong rates 과학 20%, 상식 30%, 어휘력 35%, 역사 25%;
  - topic levels 25/22/21/24; selected topics = the 4 MVP topics;
  - a 28-day streak with its milestone cheese, one protection purchase and a `seed_adjust` row, giving 320 cheese;
  - 40 open wrong notes;
  - friends 도토리박사·소금빵·치즈쥐, plus 2 head-to-head battles.
- **Cost:** about 30 SQL statements, all set-based inserts. That is about 6 s at Neon's 0.2 s round trip, so it runs synchronously.
- **Idempotent:** running it twice gives the same state.

The admin UI can call `POST /api/admin/demo/seed` and `GET /api/admin/demo/seed/verify`; a 404 means the feature is off.
