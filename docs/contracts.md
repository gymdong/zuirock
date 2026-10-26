# 쥐락펴락 계약 (G1, D1 고정)

레인들이 함께 쓰는 계약 요약이다. 권위 문서는 `.omc/plans/`의 MVP 계획과 `.omc/specs/`의 deep-interview 스펙이다. 프로젝트 이름은 `zuirock`이다(`.omc/handoffs/team-exec-d0.md`). 여기 적힌 파일을 바꾸려면 아래 "소유권" 규칙을 따른다.

## 패키지

| 이름 | 위치 | 내용 |
|---|---|---|
| `@zuirock/shared` | `packages/shared` | enums, DTO(`src/dto/*`), 소켓 이벤트, 문제 JSON zod 스키마 |
| `@zuirock/game-rules` | `packages/game-rules` | 순수 규칙 함수(I/O·`Date.now` 없음), `config/defaults.ts`, `time/kst.ts` |
| `@zuirock/server` | `apps/server` | NestJS 12(ESM) + Prisma 6, `src/ports/*` |
| `@zuirock/mobile` | `apps/mobile` | Expo SDK 57, Expo Router, `web.output: "single"`, slug·scheme `zuirock`, `com.zuirock.app` |
| `@zuirock/admin` | `apps/admin` | Vite + React, base `/admin/` |

- React는 Expo SDK 57에 맞춰 `19.2.3` 하나로 고정(`pnpm-workspace.yaml` overrides). `node_modules`는 hoisted.
- 패키지는 ESM이다. 상대 import에 `.js` 확장자를 붙인다. 타입은 `src`, 런타임은 `dist`(`turbo build`가 `^build`를 먼저 돈다).
- 의존성은 게시 14일 이상 지난 버전만 설치된다(`minimumReleaseAge`).

## 공용 타입 (`@zuirock/shared`)

- 문제: `QuestionType = chosung | mcq | ox`, `QuestionStatus = draft | reviewed | published | suspended`(출제는 `published`만), `questionInputSchema`/`questionBatchSchema`는 `content/schema/question.schema.json`과 같은 판정(테스트로 고정).
- 주제: `TopicId`(`general, vocab, history, science` + 준비 중 5개), `TOPIC_NAME_BY_ID`, `SUBFIELDS_BY_TOPIC`.
- 모드: `SolveMode = stage | composite | daily | quest | placement | basic_test | battle | diagnostic`. `diagnostic`은 '데이터 부족' 진단 세트이고 XP가 없다.
- 소유자: `OwnerRef = { kind: 'user', userId } | { kind: 'guest', guestId }`.
- 시간: REST는 `IsoDateTime`, 소켓·점수는 서버 `EpochMs`, 날짜 키는 `KstDay`(`YYYY-MM-DD`, KST).
- DTO 파일: `auth`(PKCE·교환 코드·게스트 토큰·병합), `users`, `topics`, `questions`(공개/관리자/가져오기/신고), `solo`, `growth`(XP·스트릭·치즈), `learning`(오답노트·주간 리포트·약점·전체 기록), `room`, `social`(친구·초대함), `character`.

## 소켓 이벤트 (`socket-events.ts`, 네임스페이스 `/rooms`)

- 인증: handshake `auth.token` = 회원 JWT 또는 게스트 토큰(`typ=guest`).
- 클라이언트 → 서버(모두 ack `Ack<T>`): `room:join`, `room:resume`, `room:leave`, `room:ready`, `room:updateSettings`, `room:start`, `room:submit`, `room:giveUp`, `room:rematch`, `time:ping`.
- 서버 → 클라이언트: `room:state`(전체 스냅샷), `room:participants`, `room:settings`, `room:question`, `room:chosungReveal`, `room:progress`, `room:reveal`(3초), `room:finished`(소켓별 `you` 포함), `room:dissolved`, `room:error`.
- 모든 서버 이벤트에 방 `version`(CAS 펜스)과 `serverNow`가 있다. 재접속하면 `room:resume`으로 스냅샷을 받는다.
- 문제 부족(AC-M2): `room:start` → `{ status: 'shortage', available, requested }`(방장 ack에만) → 방장이 `acceptShortageCount: available`로 다시 시작. 서버는 시작 시 원자적으로 재확인한다.
- 제출 결과(AC-M6)는 제출자 ack로만 간다: `correct | wrong | near | late | duplicate`. `near`는 방송하지 않는다. `late`는 서버 마감 이후 수신분이며 기록하지 않는다.

## 규칙 함수 (`@zuirock/game-rules`)

- 시그니처·JSDoc이 계약이다. 본문은 `NotImplementedError`이고 LA가 D4까지 교체한다(D4 게이트: `NotImplementedError` 사용 0건).
- 수치는 모두 `DEFAULT_CONFIG`(`config/defaults.ts`)에서 읽는다. 서버는 `resolveConfig(growth.json)`으로 덮어쓰고, 값을 바꾸면 `configVersion`을 올린다.
- 함수는 `now`·`rng`를 인자로 받는다. KST 경계는 `time/kst.ts`만 쓴다(`toKstDay`, `kstDayStart`, `kstWeekStart` 등, 구현·테스트 완료).
- XP 순서: 문제별 (난이도×10) × (1 + 노힌트 0.2 + max(취약 0.5, 복습 0.5)) × 감쇠 → 문제별 내림 → 합계 → (퀘스트 +50 | 순위 보너스) → 재대결 ×0.5 → 일일 남은 상한.
- 그 밖의 결정(동점 순위 공유, 감쇠 집계 범위, 반올림, 빈 방 처리 등)은 각 함수 JSDoc에 적었다. 바꾸려면 리드 승인이 필요하다.

## 서버 내부 포트 (`apps/server/src/ports`)

LC(`room-result.service.ts`)는 아래 4개에만 의존한다. 모두 호출자가 연 트랜잭션의 `tx: Prisma.TransactionClient`를 받는다. 구현은 LB가 하고, D5에 DI 토큰만 바꿔 연결한다.

| 포트 | 토큰 | 메서드 |
|---|---|---|
| `XpGrantPort` | `XP_GRANT_PORT` | `grant(tx, { ownerId, source: {type, id}, items, kstDay, context }) → XpLedgerEntry[]` |
| `SolveLogWriter` | `SOLVE_LOG_WRITER` | `writeMany(tx, logs: SolveLogInput[]) → void` |
| `WrongNotePort` | `WRONG_NOTE_PORT` | `recordResults(tx, ownerId, results) → void` |
| `StreakPort` | `STREAK_PORT` | `markActivity(tx, ownerId, kstDay, 'solo_set' \| 'battle') → void` |

- `XpGrantPort`의 `context`(대결 순위·재대결 여부, 세트 정답 수)는 계획 시그니처에 추가한 필드다. 재대결 여부는 LC가 `BattleResult.memberKey`로 1시간 안의 같은 멤버 대결을 찾아 정한다.
- 게스트 소유자: XP·오답노트·스트릭 포트는 아무것도 쓰지 않는다. 게스트 결과 화면의 "최대 N XP"는 LC가 `computeXpGrant`로 계산한다(D6-6).
- 멱등: XP는 (sourceType, sourceId, userId), SolveLog는 (setAttemptId, questionId, owner)·(battleResultId, questionId), 대결 결과는 (roomSessionId, participantId).

## 데이터 모델 (`apps/server/prisma/schema.prisma`)

- 원천 4종: `SolveLog`, `SetAttempt`, `BattleResult`, `CheeseLedger`. 소유자는 userId·guestId 중 정확히 하나(raw CHECK). 병합 때 이 4종의 소유권만 옮긴다.
- `XpLedger`는 append-only이고 `configVersion`·`breakdown`을 저장한다.
- 파생: `TopicProgress`, `StreakState`, `WrongNote`, `WeeklyReportSnapshot`, `UserItem`. 보호권 보유 수는 `CheeseLedger`(`protection_purchase` − `protection_use`)로 계산한다.
- 그 밖: `User`, `SocialAccount`, `Guest`, `Topic`, `Subfield`, `Question`, `Room`, `RoomSession`, `Friendship`(쌍마다 1행, low < high), `Invite`, `Item`, `CharacterEquip`, `Asset`(bytea, key = sha256), `IssueReport`((문제, 신고자)당 1건, 근거 필수).
- raw SQL(`-- raw:` 표시, 첫 마이그레이션 끝): owner CHECK 4개, SolveLog 출처 CHECK, 마일스톤 치즈 키 CHECK, 게스트 1회 병합 트리거, 난이도·보기 수 CHECK, 신고 근거 CHECK, 친구 순서 CHECK. Prisma diff는 CHECK·트리거를 무시하므로 다음 마이그레이션에서 지워지지 않는다.
- 멱등 UNIQUE는 Prisma `@@unique`로 표현했다: XpLedger (sourceType, sourceId, userId), CheeseLedger (userId, milestone, runStartDay).
- 데이터소스: `DATABASE_URL`(pooled, pgbouncer) + `DIRECT_URL`(마이그레이션). advisory lock은 `pg_advisory_xact_lock`만 쓴다(`pnpm check:advisory-locks`, CI).

## 배포 주소·OAuth

- 배포 주소는 환경 변수 `PUBLIC_ORIGIN` 하나에서만 읽는다. 소스 코드에 주소를 쓰지 않는다. 기본값 `https://zuirock.onrender.com`은 **임시값**이다. Render 서브도메인은 전역 고유라 접미사가 붙을 수 있으므로, 실제 주소는 Render 대시보드에서 확인해 `.env`·Render 환경 변수에 넣는다.
- `apps/mobile/app.config.ts`는 빌드 때 `PUBLIC_ORIGIN`을 읽어 Android App Links 호스트(`/join/*`, https일 때만)와 `extra.publicOrigin`을 만든다.
- OAuth redirect URI = `PUBLIC_ORIGIN` + `oauthCallbackPath(provider)` = `/api/auth/{kakao|naver|google}/callback`(`@zuirock/shared`). 로그인 순서와 구현 순서는 카카오(기본) → 네이버 → Google(`OAUTH_LOGIN_ORDER`).
- `infra/render.yaml`: Docker 웹 서비스 `zuirock`(free, `healthCheckPath: /api/health`). 비밀 값은 `sync: false`로 두고 대시보드에서 입력한다. 이름 목록은 `.env.example`과 같다.

## 소유권 (계획 §4.1)

| 레인 | 쓰기 범위 |
|---|---|
| L0 | 루트 설정, `packages/shared`, `apps/server/prisma`(D1까지), game-rules 시그니처·defaults, `src/ports`, `infra/docker-compose.yml`, CI |
| LA | `packages/game-rules/**` |
| LB | `apps/server/src/modules/*`(rooms 제외), `src/common/*`, **D2부터 `schema.prisma`와 마이그레이션 단독** |
| LC | `modules/rooms`, `modules/invites`, `test/socket-sim` (LB 모듈 import 금지, 포트만) |
| LD | `apps/mobile/**` |
| LE | `apps/admin/**`, `scripts/import-questions.ts`, `content/fixtures/**`, `content/items/**` |
| LF | `infra/**`, `scripts/seed/**`, `scripts/keepalive.ts`, `e2e/**`, `docs/**` |

- `shared`·`ports` 변경은 PR 1건으로 리드 승인을 받는다. 다른 레인은 스키마 변경을 LB에 요청한다.
- `content/` 문서 4종(GUIDE, schema, prompts, topics.json)은 에이전트가 수정하지 않는다.

## 로컬 실행

```sh
corepack enable && pnpm i
pnpm db:up                                   # postgres:16, redis:7 (noeviction)
cp .env.example .env                         # 로컬 값 채우기
pnpm db:migrate                              # prisma migrate deploy
pnpm turbo run build --filter=@zuirock/server && pnpm --filter @zuirock/server start   # GET /api/health(?deep=1)
pnpm --filter @zuirock/mobile web             # Expo 웹
```

### 레인별 로컬 DB·Redis 규칙

로컬 Postgres와 Redis는 여러 레인이 함께 쓴다. 다른 레인이 쓰는 DB를 리셋하는 사고를 막으려고 아래처럼 나눈다.

| 레인 | 개발 DB | 테스트 DB | Redis 키 접두사 | 서버 포트 |
|---|---|---|---|---|
| LB | `zuirock_lb` | `zuirock_test_lb` | `lb:` | 3001 |
| LC | `zuirock_lc` | `zuirock_test_lc` | `lc:` | 3002 |
| LD | `zuirock_ld` | — | `ld:` | 3003 |
| LF | `zuirock_lf` | `zuirock_test_lf` | `lf:` | 3004 |

- 공용 `zuirock` DB는 통합 데모·시드(`scripts/seed`)에만 쓴다. 이 DB를 리셋하기 전에 리드에게 알린다.
- DB를 만들 때: `docker exec zuirock-postgres-1 psql -U zuirock -c 'CREATE DATABASE zuirock_lb'`. 그다음 `.env`의 `DATABASE_URL`·`DIRECT_URL`을 자기 레인 DB로 바꾼다.
- `pnpm db:migrate`는 루트 `.env`를 읽는다(`node --env-file-if-exists`). 셸에 이미 내보낸 값이 있으면 그 값을 먼저 쓴다.
- 서버 통합 테스트는 `zuirock_test_*` DB에서만 돈다. 테스트는 시작할 때 DB 전체를 비우므로 실행기끼리 DB를 나눠야 한다. **10/26부터 `TEST_DATABASE_URL`이 없으면 실행마다 새 DB `zuirock_test_run_<시각>_<무작위>`를 만들고 끝나면 지운다**(`vitest.config.ts`, `test/support/global-setup.ts`, 6시간 지난 잔여 DB도 정리). 특정 DB를 쓰려면 지금처럼 `TEST_DATABASE_URL`로 정한다(예: `TEST_DATABASE_URL=postgresql://zuirock:zuirock@localhost:5432/zuirock_test_lead`). 같은 DB를 함께 쓰면 401/404와 deadlock(40P01) 같은 가짜 실패가 난다. `test/support/global-setup.ts`와 `resetDb`가 다른 DB 이름을 거부한다.

Android 키스토어는 `scripts/make-keystore.sh`로 한 번만 만든다. 결과 파일은 git에 올리지 않는다.

## 배포 디렉터리

컨테이너(`infra/Dockerfile`) 안의 고정 경로다. 서버 정적 서빙 모듈(LB)이 이 경로를 읽는다.

| 경로 | 내용 |
|---|---|
| `/app/dist/main.js` | NestJS 서버(`$PORT`) |
| `/app/public/web` | Expo 웹 export(`/`, SPA fallback) |
| `/app/public/admin` | 관리자 빌드(`/admin/*`, Vite base `/admin/`) |

시작 순서: `infra/docker-entrypoint.sh`가 `DIRECT_URL`로 `prisma migrate deploy` 후 서버를 띄운다. 웹 빌드는 빌드 시점의 `PUBLIC_ORIGIN`을 쓴다(Docker build arg).
