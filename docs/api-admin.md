# 관리자 API (lane LB → LE)

Every route is under `/api/admin`. Every request needs `Authorization: Bearer <member JWT>`, and that user must have `User.isAdmin = true`. A missing or invalid token answers 401. A member who is not an admin gets 403 `ADMIN_REQUIRED`. Admins log in with the normal OAuth flow (`POST /api/auth/:provider/start` → callback → `POST /api/auth/exchange`, with `returnTo` set to `${PUBLIC_ORIGIN}/admin/...`). To make a user an admin, set the flag in the DB (`UPDATE "User" SET "isAdmin" = true WHERE nickname = '…'`). Error bodies are `ApiErrorBody` `{ statusCode, code, message, details? }`.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/session` | — | `MeDto` (use it to check admin access) |
| GET | `/questions` | query `status, topicId, subfield, type, difficulty, importBatch, q` (text contains), `cursor, limit` (≤ 200, default 50) | `Paginated<AdminQuestionDto>` (ordered by createdAt; pass `nextCursor` back as `cursor`) |
| GET | `/questions/:id` | — | `AdminQuestionDto` (`solveCount`, `correctRate`, `openReportCount`) |
| PATCH | `/questions/:id` | `AdminUpdateQuestionRequest` | `AdminQuestionDto`. mcq needs the answer among 4 choices; OX answer is O/X; difficulty must be in 1–5 in 0.5 steps; duplicate text → 409 `DUPLICATE_QUESTION` |
| POST | `/questions/import` | JSON array of question objects (content/schema), or `{ questions, dryRun }`; query `?dryRun=1` | `ImportResultDto & { importBatch }`. Errors carry the 1-based `index`. Accepted questions are created as `draft` unless it is a dry run |
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
