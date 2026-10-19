> 보관용 사본(2026-10-15 작성, 이후 사용자 결정으로 일부 바뀜: 무료 플랜·iPhone USB 설치·지구 분야·2차 피드백). 최신 결정은 docs/PROJECT-STATE.md와 docs/feedback-round2.md가 우선한다. 문서 안의 "zuirak"는 "zuirock"으로 읽는다.

# 쥐락펴락 MVP 구현 계획

Status: FINAL v5 — Critic 승인(개선 반영), pending approval

- 입력 스펙(권위 문서): `.omc/specs/deep-interview-zuirak.md` (이하 "스펙"). 스펙에서 확정된 항목은 다시 열지 않는다. 예외는 사용자가 승인한 스펙 변경 1건(D6-10, AC-S7 해석)뿐이다.
- 모드: RALPLAN 합의 루프, SHORT 모드
  - v2: Architect(SOUND-WITH-CHANGES)·Critic(REVISE) 피드백 반영
  - v3: Critic(APPROVE-WITH-IMPROVEMENTS)·Architect(SOUND-WITH-CHANGES) 피드백 반영
  - **v4: 사용자 결정 반영** — 2주 시연, 무료 인프라만, Apple 유료 계정 없음, D6-10 (c) 채택
  - **v5: Critic(APPROVE-WITH-IMPROVEMENTS)·Architect(SOUND-WITH-CHANGES) 반영** — GUIDE §2 납품·검수 일정 정렬, 시연 대결 2회, 서버 내부 포트 계약, Neon 운영 규칙
- 작성일: 2026-10-15 (= D0). **시연일: 2026-10-29(목) = D14**
- 실행 방식: 에이전트 병렬 실행(team / ralph). 레인별 담당 디렉터리를 나누어 충돌을 줄인다.

---

## 1. 요구사항 요약

스펙 "Goal"의 루프 **대결 → 풀이 로그 → 레벨/XP → 리포트 → 약점 학습**을 배포 환경·실기기에서 끝까지 돌리는 것(AC-E2E)이 MVP의 완료 기준이다. 세부 규칙은 스펙 해당 절을 따른다.

| 영역 | 스펙 절 | AC |
|---|---|---|
| 플랫폼·스택·배포 | Constraints > 플랫폼·기술 스택·환경 | AC-A1, AC-A8, AC-E2E |
| 문제 콘텐츠 | Constraints > 문제 콘텐츠 | AC-C1~C8 |
| 실시간 퀴즈방 | Constraints > 실시간 퀴즈방 | AC-M1~M11 |
| 솔로·주제 레벨 | Constraints > 솔로 학습·주제 레벨 | AC-S1~S9 |
| 계정·게스트·프로필 | Constraints > 계정·게스트·프로필 | AC-A1~A8 |
| 성장 시스템 | Constraints > 성장 시스템 | AC-G1~G9 |
| 학습 데이터 | Constraints > 학습 데이터 | AC-D1~D8 |

### 사용자 결정에 따른 스펙 적용 범위 조정 (v4)

- **iOS**: 유료 Apple Developer Program 없이 진행한다.
  - iOS 시연은 Safari 웹 빌드로 한다.
  - 선택 사항으로, 사용자 iPhone에 무료 Apple ID(Xcode Personal Team)로 USB 설치한 Release 빌드도 쓸 수 있다. 이 빌드는 7일 뒤 만료된다.
  - **AC-A8의 iOS 범위는 웹뿐이다.** 딥링크(앱으로 열림)는 Android와 웹에서 검증한다.
  - 스펙의 "TestFlight·APK"는 "APK + iOS 웹(+선택: 무료 프로비저닝 빌드)"으로 대체한다.
- **배포**: 무료 등급만 쓴다. 도메인은 구입하지 않고 `*.onrender.com` 서브도메인을 쓴다. 스펙의 "HTTPS 도메인"은 이 서브도메인으로 충족한다.
- **AC-S7**: D6-10 (c) 해석을 적용한다. 상위 2개 주제 합계 50%이고, 그룹 안에서는 오답률에 비례해 나눈다. 주제가 3개 이하이면 전체를 오답률 비례로 나눈다.

### 설계상 불변 조건

1. **원천 기록 4종**:
   - `SolveLog`(문제 단위 제출)
   - `SetAttempt`(세트 단위 결과, 배치 테스트로 건너뛴 레벨 포함)
   - `BattleResult`(참가자별 순위·점수·정답 수·총 응답 시간·멤버 집합, userId 또는 guestId 소유)
   - `CheeseLedger`
   
   **`XpLedger`는 append-only 지급 기록**이며 `configVersion`을 저장한다. 파생 데이터는 원천과 설정에서 계산한다: 주제 레벨, 스트릭, 오답노트, 리포트, 보유 아이템.
2. **모든 수치는 설정 기본값**(`packages/game-rules/src/config/defaults.ts`)에서 가져오고, `apps/server/config/growth.json`으로 덮어쓸 수 있다.
3. **시간은 서버 시계 + KST 경계를 쓴다.** 규칙 함수는 `now`를 인자로 받는다.
4. **"취약 주제"는 주제 단위**(종합 가중, XP +50%)이고, **"약점 3가지"는 세부 분야 단위**(리포트·퀘스트)다.

---

## 2. RALPLAN-DR 요약

### 2.1 Principles

1. **순수 규칙 우선**: 도메인 규칙은 `packages/game-rules`에 I/O 없이 두고, 서버·시드·병합·미리보기가 공유한다.
2. **서버 권위**: 점수·출제·타이머·판정은 서버에서만 한다.
3. **원천 보존 + 지급 불변**: 원천은 소유권만 옮기고, 지급된 XP·치즈·쓴 보호권은 회수하지 않는다.
4. **시연 경로 우선 + 계약 먼저**(v4 강화): D1에 공용 타입·Prisma 스키마·규칙 함수 시그니처를 고정한다. 그 뒤 레인을 병렬로 돌리고, 각 레인은 AC-E2E 경로부터 만든다.
5. **무료·단일 인스턴스 운영**(v4): 시연 규모(방 3개 × 8명)에 필요한 장치만 넣는다. 확장용 장치는 시연 뒤로 미룬다.

### 2.2 Decision Drivers

1. **14일 일정과 병렬 에이전트 실행**: 레인 사이 계약이 흔들리면 통합 비용이 폭증한다.
2. **규칙 정확성 검증 가능성**: AC 대부분이 수치 규칙이다.
3. **무료 등급 제약 아래 실기기 동작**: 슬립·콜드 스타트, 서브도메인 OAuth, Android 딥링크, 인앱 브라우저에서 동작해야 한다.

### 2.3 Viable Options

#### (a) ORM — **Prisma (선호)** vs Drizzle vs TypeORM

| 옵션 | 장점 | 단점 |
|---|---|---|
| **Prisma** | 마이그레이션 성숙, 스키마 한 파일(D1 계약 고정에 유리) | raw SQL 제약조건은 수동 |
| Drizzle | SQL 타입 안전 | 데이터 마이그레이션 관례 부족 |
| TypeORM | Nest 예제 | 타입·마이그레이션 신뢰성 낮음 |

- 선택: Prisma.
  - CHECK, 부분 UNIQUE, 멱등 키는 `--create-only`로 마이그레이션을 만든 뒤 SQL을 직접 편집하고 `-- raw:` 주석으로 표시한다.
  - `binaryTargets = ["native", "debian-openssl-3.0.x"]`
  - 무료 Postgres(Neon)를 쓰면 `DATABASE_URL`(pooled)과 `DIRECT_URL`(마이그레이션용)을 분리한다.

#### (b) 모노레포 — **pnpm workspaces + Turborepo (선호)** vs Nx

- 선택: pnpm + Turborepo. Nx는 설정 비용 때문에 기각했다.
- **v4 변경**: 격리 설치 검증에 시간을 쓰지 않는다. 처음부터 `.npmrc`에 `node-linker=hoisted`를 두고, `pnpm.overrides`로 React를 Expo SDK 버전에 고정한다.

#### (c) 실시간 방 권위

| 옵션 | 장점 | 단점 |
|---|---|---|
| **C1. 단일 인스턴스 RoomEngine + Redis 상태 + 방별 버전 CAS 펜스·리스 (선호, v4: adapter 없음)** | 코드 공유, 재시작 복구, 배포가 겹쳐도 전이는 한 번만 일어남 | 배포가 겹치는 수십 초 동안 구 인스턴스 소켓은 이벤트를 놓칠 수 있음 → 강제 재접속과 `room:resume`으로 보완 |
| C1+. 위 + Socket.IO Redis adapter(브로드캐스트 전용) + pub/sub 리스 회수 (v3안) | 겹침 중에도 이벤트 끊김 없음 | 구현·테스트 비용(2-인스턴스 시뮬레이션). 무료 Redis 명령 수 소비 |
| C2. 별도 게임 서버 | 격리·확장 | 로직 중복, 일정 초과 |

- **선택: C1. v3의 adapter와 pub/sub는 시연 뒤로 미룬다.** 근거:
  1. 무료 웹 서비스는 단일 인스턴스다.
  2. 배포 겹침은 배포할 때만 생긴다. 무료 등급에서 겹침이 있는지는 D0 확인 필요다. 시연 당일에는 배포를 동결하므로 겹침이 생기지 않는다.
  3. 겹침이 생기더라도 SIGTERM 때 소켓을 강제로 끊는다. 클라이언트는 새 인스턴스에 재접속하고, `room:resume` 스냅샷으로 놓친 이벤트를 메운다. 진행이 1~2초 끊길 뿐 데이터는 정확하다.
- **CAS 펜스와 리스는 유지한다.** 비용이 작다(Lua 스크립트 1개). 무료 등급에서 배포 겹침이 있든 없든, 같은 프로세스 안의 타이머 중복 실행과 재시작 직후의 이중 전이를 막는 데에도 쓰이기 때문이다.
- 함께 유지하는 장치:
  - SIGTERM 때 리스를 반납하고 소켓을 끊는다.
  - 기동 시와 2초 주기로 리스가 없는 활성 방을 회수한다.
  - 마감이 지난 방은 즉시 전이한다.
  - 리스를 잃은 인스턴스는 송신을 멈춘다(`emitIfOwner`).
- C2는 기각했다.

#### (d) 호스팅 (v4: 무료 등급만)

| 옵션 | 장점 | 단점 / 불확실성 |
|---|---|---|
| **D-free-1. Render 무료 Web Service(Docker, `*.onrender.com`) + Neon 무료 Postgres + Render 무료 Key Value (선호)** | HTTPS 서브도메인 기본 제공, WebSocket 지원(D0 확인 필요), 한 대시보드, Docker 이미지는 기존 설계 그대로 | 유휴 약 15분 뒤 슬립과 콜드 스타트(수십 초, D0 확인 필요). 월 무료 사용 시간 한도(D0 확인 필요). 무료 인스턴스 메모리(512MB 추정, D0 확인 필요). Key Value 무료 등급은 영속성 없음, 용량 한도(D0 확인 필요) |
| D-free-2. Koyeb 무료 인스턴스 + Neon + Upstash 무료 Redis | 대체 가능 | 무료 등급 조건·리전(D0 확인 필요), Upstash 무료 명령 수 한도(D0 확인 필요)가 리스 갱신(방당 3초마다)과 충돌할 수 있음 |
| D-free-3. 개발자 노트북 + Cloudflare 임시 터널 | 비용 0, 성능 좋음 | 임시 터널 주소가 실행마다 바뀌어 OAuth 콜백 등록이 깨짐. 노트북 의존 → 기각(비상 시 로컬 시연 폴백으로만 runbook에 기재) |

- **선택: D-free-1.** 세부 사항:
  - **Postgres = Neon 무료**. Render 무료 Postgres는 생성 후 일정 기간이 지나면 만료되는 정책이 있었다(기간 D0 확인 필요). Neon은 만료 정책이 없고, 대신 저장 용량 한도와 유휴 시 컴퓨트 자동 중지가 있다(D0 확인 필요). 리전은 Render 웹 서비스와 같은 지역(예: 싱가포르)으로 맞춘다(D0 확인 필요).
  - **Neon 운영 규칙(v5)**:
    - 런타임 `DATABASE_URL`은 pooled 엔드포인트에 `?pgbouncer=true&connect_timeout=15`(자동 중지 후 재개 지연 흡수, 값은 D0 실측으로 조정)를 붙인다. 마이그레이션은 `DIRECT_URL`(비풀링)로만 한다.
    - PgBouncer 트랜잭션 풀링 아래에서는 세션 단위 상태가 유지되지 않는다. 그래서 advisory lock은 **트랜잭션 범위 변형(`pg_advisory_xact_lock`)만** 쓴다. 세션 lock(`pg_advisory_lock`)은 쓰지 않으며, CI에서 grep으로 검사한다.
    - 결과 기록 트랜잭션(세트 결과, 대결 결과, 병합)이 Prisma `P1001`(연결 불가)이나 `P1017`(연결 끊김)로 실패하면 지수 백오프로 최대 3회 재시도한다. 멱등 키가 있어 재시도해도 중복 지급이 없다.
    - keepalive 주기는 **4분 이하**로 둔다. Neon 자동 중지와 Render 슬립을 함께 막기 위해서다.
  - **Redis = Render Key Value 무료**. 같은 네트워크라 명령 수 과금 한도를 피할 수 있다(D0 확인 필요). `maxmemory-policy noeviction` 설정이 가능한지 D0에 확인한다. 불가하면 방 상태 키에 TTL을 명시하고 용량을 모니터링한다. 영속성이 없으므로 Redis가 재시작되면 진행 중인 방과 OAuth nonce가 사라진다. 시연 규모에서는 감수하고, runbook에서 "방 다시 만들기"로 복구한다.
  - **이미지 = PostgreSQL `bytea`**(R2 폐기). 테이블 `Asset(key = sha256, contentType, bytes, createdAt)`, `GET /api/assets/:key`, `Cache-Control: public, max-age=31536000, immutable`. 아바타는 클라이언트에서 512px로 리사이즈하고 서버는 1MB를 넘으면 거부한다. 아이템은 20개 + 몸 1개로 수 MB 수준이라 Neon 무료 용량에 미치는 영향이 작다.
  - **딥링크 파일**: `https://<app>.onrender.com/.well-known/assetlinks.json`(Android App Links). iOS에는 유니버설 링크가 없다(유료 계정 필요).
  - **슬립 대응**: runbook에 시연 30분 전 워밍업을 넣는다.
    - 워밍업 항목: 헬스 체크, DB 쿼리, Redis ping, 그리고 **Redis 재시작 감지**. 기동 시 서버가 Redis에 `boot:sentinel` 키를 만들어 두므로, 워밍업 때 이 키가 없으면 Redis가 재시작된 것이다. 그러면 진행 중인 방과 OAuth nonce가 사라졌으므로 방을 새로 만들고 로그인을 다시 확인한다.
    - **D12·D13 리허설과 D14 시연 동안** 노트북에서 `scripts/keepalive.ts`가 **4분 이하** 주기로 `/api/health?deep=1`을 호출한다. 이 요청은 DB와 Redis를 모두 건드린다.

#### (e) 부가 결정

- **단일 출처(`https://<app>.onrender.com`)에서 NestJS가 아래 순서로 요청을 처리한다**:
  1. `/api/*`
  2. `/socket.io/*`
  3. `/.well-known/assetlinks.json`(`application/json`)
  4. `/admin/*`(관리자 SPA, 없는 경로는 `/admin/index.html`)
  5. Expo 웹 정적 파일
  6. 그 외 `GET`이면서 `Accept: text/html`이면 Expo `index.html`. 나머지는 404
- **Expo Router 웹 출력은 `web.output: "single"`이다.**
- **`EXPO_PUBLIC_*` 전달 경로**는 D0에 Render Docker 빌드 인자 지원 여부를 확인해 정한다. 지원하지 않으면 비밀이 아닌 값을 `infra/web.env.production`에 커밋하고 Dockerfile에서 읽는다.
- **빌드 위치**: 폴백 경로(CI 사전 빌드)는 **D4까지 실제로 한 번 돌려 검증**한다. D5 첫 전체 배포에서 막히지 않게 하기 위해서다. 무료 빌드 환경의 메모리·시간 한도(D0 확인 필요)로 Expo 웹 export가 실패하면, GitHub Actions에서 웹·관리자 정적 결과물을 빌드한다. 그 결과를 Docker 이미지에 넣는 방식(사전 빌드 이미지 배포 지원 여부, D0 확인 필요) 또는 Render 무료 Static Site(별도 서브도메인, CORS 허용)로 분리하는 방식으로 폴백한다.
- **OAuth**: 서버 중계 방식이다.
  - PKCE를 쓴다.
  - state에는 서명 nonce만 싣는다. 게스트 토큰은 `POST /start` 본문으로 받아 nonce 키로 Redis에 보관한다.
  - 1회용 교환 코드를 쓴다.
  - 병합에는 서명 게스트 토큰이 필요하다.
- **테스트**: Vitest, Jest(Nest·jest-expo), Playwright, fast-check.
- **RN Socket.IO**: 네이티브는 `transports: ['websocket']`이다. 재접속 백오프 상한(`reconnectionDelayMax`)은 **D0에 측정한 콜드 스타트 시간보다 길게** 잡는다(기본값 60초, 측정값 + 15초 중 큰 값). `reconnectionAttempts`는 무제한이다. 콜드 스타트 중에 재시도를 포기하지 않게 하기 위해서다.

---

## 3. 저장소 구조 (계획)

`content/` 아래의 사용자 작성 문서 4종은 **코디네이터·사용자가 D0에 작성한다. 에이전트는 수정하지 않는다**: `content/GUIDE.md`, `content/schema/question.schema.json`, `content/prompts/claude-question-template.md`, `content/topics.json`.

```
zui/
├─ package.json, pnpm-workspace.yaml, turbo.json, tsconfig.base.json
├─ .npmrc                          # node-linker=hoisted
├─ .env.example                    # OAuth 키, JWT/STATE/GUEST 서명 키, DATABASE_URL/DIRECT_URL, REDIS_URL, PUBLIC_ORIGIN
├─ .github/workflows/ci.yml        # lint·typecheck·unit·int (+ 필요 시 웹 정적 빌드)
├─ apps/
│  ├─ mobile/                      # Expo — web.output "single"
│  │  ├─ app.config.ts             # scheme "zuirak", Android intentFilters(autoVerify, <app>.onrender.com/join/*)
│  │  ├─ eas.json                  # preview: Android APK
│  │  ├─ metro.config.js
│  │  ├─ assets/fonts/ + LICENSES.md
│  │  ├─ app/
│  │  │  ├─ _layout.tsx, (auth)/login.tsx(p2), auth/callback.tsx
│  │  │  ├─ (tabs)/_layout.tsx, (tabs)/home/index.tsx(p3·p5), (tabs)/battle/index.tsx,
│  │  │  │  (tabs)/report/index.tsx(p12), (tabs)/profile/index.tsx(p13)
│  │  │  ├─ topics/select.tsx(p4), topics/[topicId]/index.tsx(p6), topics/[topicId]/start.tsx(p7)
│  │  │  ├─ solo/[setId].tsx, solo/[setId]/result.tsx
│  │  │  ├─ battle/create.tsx(p9), room/[code]/{lobby(p10),play(p8),result(p11)}.tsx
│  │  │  ├─ join/[code].tsx        # 초대 착지 + 인앱 브라우저 탈출
│  │  │  ├─ profile/{edit(p14),character(p15),wrong-notes,topics,account}.tsx
│  │  │  └─ friends/index.tsx, friends/[userId].tsx(p16)
│  │  └─ src/{theme,components,api(client,socket),lib(timeSync,inAppBrowser,pkce),state(session,guest)}
│  ├─ server/
│  │  ├─ prisma/schema.prisma, prisma/migrations/
│  │  ├─ config/growth.json
│  │  ├─ src/common/{clock,kst,advisory-lock(lockAll),assets(bytea)}.ts
│  │  ├─ src/modules/{auth,users,guests,topics,questions,solve-logs,set-attempts,solo,progress,xp,cheese,
│  │  │               streak,wrong-notes,learning-reports,rooms,invites,friends,characters,
│  │  │               issue-reports,admin,account,static}/
│  │  │   rooms/: rooms.gateway.ts, room.engine.ts, room.store.ts, room-cas.lua, room.timer.ts,
│  │  │           room.recovery.ts, room-result.service.ts
│  │  └─ test/{integration,socket-sim,property}/
│  └─ admin/ src/pages/{Login,Questions,QuestionEdit,Import,IssueReports,Calibration,Items}.tsx
├─ packages/
│  ├─ shared/      src/{question.schema.ts(content/schema와 동치 테스트), socket-events.ts, dto/*, enums.ts}
│  └─ game-rules/  src/{config/defaults.ts, time/kst.ts, scoring, ranking, room-rules, xp, account-level,
│                       stage, placement, selection(allocateComposite), streak, chosung, weakness,
│                       report, calibration, import-validate}.ts + test/
├─ content/
│  ├─ GUIDE.md, schema/question.schema.json, prompts/claude-question-template.md, topics.json  # D0, 사용자 작성
│  ├─ fixtures/dev-questions.json  # 에이전트 작성, D2까지, 약 120문제(비상·개발용)
│  ├─ questions/{general,vocab,history,science}/*.json   # 사용자 납품 D1~D6
│  └─ items/items.json + items/images/*.png              # 임시 에셋
├─ scripts/
│  ├─ import-questions.ts, sync-items.ts(→ Asset bytea + Item.imageKey)
│  ├─ keepalive.ts                 # 리허설·시연 중 4분 이하 주기 deep 헬스 호출
│  └─ seed/{demo.ts, generators.ts, demo-profile.ts}
├─ infra/
│  ├─ docker-compose.yml           # postgres:16, redis:7
│  ├─ Dockerfile                   # web export + admin build + server
│  ├─ render.yaml                  # free web service (+ Key Value free); Neon은 외부 URL
│  └─ web.env.production           # (폴백 시) 비밀 아닌 EXPO_PUBLIC_* 값
├─ e2e/ playwright.config.ts, tests/*.spec.ts
└─ docs/ manual-qa-checklist.md, demo-runbook.md
```

---

## 4. 구현 계획 — D0~D14 일 단위

### 4.1 병렬 레인과 담당 디렉터리

| 레인 | 담당(쓰기 권한) | 기간 | 내용 |
|---|---|---|---|
| **L0 계약·골격**(단일 에이전트, 리드) | 루트 설정, `packages/shared`, `apps/server/prisma`, `packages/game-rules/src` **시그니처·타입·defaults**, `apps/server/src/ports/*.ts` **서버 내부 포트 인터페이스**, `infra/docker-compose.yml`, CI | D0~D1 | 계약 고정. D2부터 `schema.prisma` 변경과 마이그레이션 생성은 **LB 담당자만** 한다(다른 레인은 LB에 요청). `shared`·`ports` 변경은 PR 1건으로 리드 승인 |
| **LA 규칙** | `packages/game-rules/**` | D2~D4 | 모든 순수 함수 구현과 단위 테스트 |
| **LB 서버 코어(REST)** | `apps/server/src/modules/*`(rooms 제외), `common/*` | D2~D8 | 인증·게스트·병합·솔로·XP·스트릭·오답노트·리포트·관리자 API·자산 |
| **LC 실시간** | `apps/server/src/modules/rooms`, `invites`, `test/socket-sim` | D2~D6 | 방 엔진, 펜스, 결과 기록. **LB 모듈은 직접 import하지 않고 `ports/*`에만 의존**(D2~D4는 인메모리 가짜 구현으로 테스트) |
| **LD 클라이언트** | `apps/mobile/**` | D2~D11 | D2~D7은 [CP] 화면(초기에는 목 API), D8~D11은 [L] 화면 |
| **LE 관리자·콘텐츠** | `apps/admin/**`, `scripts/import-questions.ts`, `content/fixtures/**`, `content/items/**` | D2~D9 | 업로드·검수·승인, 픽스처, 아이템 |
| **LF 인프라·시드·QA** | `infra/**`, `scripts/seed/**`, `scripts/keepalive.ts`, `e2e/**`, `docs/**` | D0, D5~D14 | 무료 등급 프로비저닝, 배포, APK, 시드, E2E, runbook |

- 통합 규칙:
  - 각 레인은 하루 1회 이상 `main`에 머지한다(CI 통과 필수).
  - LB·LC는 D2~D3 동안 LA의 시그니처에 맞춰 스텁 구현으로 개발하고, D4에 실구현으로 교체한다.
  - LC의 결과 기록은 D5에 LB의 포트 실구현으로 연결한다(Nest DI 토큰 교체만 하면 됨).
  - LD는 D2~D4 동안 `shared` DTO 기반 목 API(MSW 또는 로컬 목 서버)로 개발하고, D5부터 실서버에 붙는다.

### 4.2 일 단위 마일스톤

| 일 | 날짜 | 마일스톤 / 게이트 | 완료 기준(검증 가능) |
|---|---|---|---|
| **D0** | 10-15(목) | 계획 승인, **GUIDE·스키마·템플릿·topics.json 전달 완료(사용자·코디네이터 작성)**, 무료 등급 계정 생성, OAuth 앱 3종 등록 시작. **첫 번째 확인: Google이 `onrender.com` 서브도메인을 승인된 도메인으로 받는지**(공개 접미사 목록 등재 도메인) | `content/` 문서 4종 존재. Render 서비스에 hello 응답과 WebSocket 에코가 배포되어 `wss://<app>.onrender.com` 연결 성공. "D0 확인 필요" 목록(8장)의 답이 runbook에 기록됨 |
| **D1** | 10-16(금) | **G1 계약 고정**: `shared` DTO·소켓 이벤트, `schema.prisma` + 첫 마이그레이션, game-rules 시그니처·defaults, **서버 내부 포트**(`XpGrantPort`, `SolveLogWriter`, `WrongNotePort`, `StreakPort`), 모노레포·compose·CI. **Android 서명 키스토어 1개 고정** | `pnpm i && pnpm dev`로 헬스 200, Expo 웹 로드. `pnpm turbo run typecheck` 통과. `question.schema.ts` ↔ `content/schema/question.schema.json` 동치 테스트 통과. 키스토어 SHA-256을 runbook에 기록 |
| **D2** | 10-17(토) | 레인 LA~LE 병렬 착수. **비상 픽스처 120문제 완성**. **문제 1차(과학 150) 납품** → 로컬 `import --dry-run`(형식 검사만) | `content/fixtures/dev-questions.json`이 `validateImport` 오류 0. 로컬 DB에 공개 상태로 반입(개발용). 1차 파일 dry-run 오류 목록을 사용자에게 회신 |
| D3 | 10-18(일) | LA 절반, LB 인증(Google 먼저)·게스트 토큰, LC 방 생성·입장·대기실, LD 테마·p2·p9·p10 | 해당 단위·통합 테스트 녹색 |
| **D4** | 10-19(월) | **LA 완료**: game-rules 전 함수와 테스트. **문제 2차(상식·역사 ★3~★5, 208) 납품** → dry-run. **CI 사전 빌드 폴백(웹 export) 1회 검증** | `game-rules test --coverage` ≥ 90%, 스펙 표 `it.each` 전부, D6-10 배정 테스트. CI 산출물로 정적 웹 기동 확인 |
| **D5** | 10-20(화) | **M-A 세로 관통(로컬)**: 회원 A(웹)가 방 생성 → 게스트 B(다른 브라우저)가 링크 입장 → 대결 → 결과 → SolveLog·BattleResult·XP·오답노트 저장. **첫 전체 배포**(Render). **문제 3차(상식·역사 ★1~★2.5, 92) 납품**. 1~3차를 배포 DB에 `draft`로 반입하고 **배포된 관리자 웹에서 검수 시작**(하루 약 120문제) | `e2e/tests/guest-battle.spec.ts` 로컬 녹색. 배포본에서 게스트 입장 수동 확인. 배포 관리자 웹 로그인과 검수 화면 동작 |
| D6 | 10-21(수) | 병합(서명 게스트 토큰), 실시간 리포트·약점·`insufficientData`·`weakTopics`, 종합 세트(`allocateComposite`). LC 완료. **문제 4차(어휘력 150) 납품 = 납품 마감**, 배포 DB 반입 | `guest-merge.int-spec.ts`, `room-*.sim-spec.ts` 녹색 |
| **D7** | 10-22(목) | **M-B 핵심 루프 완성(배포)**: AC-E2E 관측값 1~5를 **로컬 시드로** 확인, 배포본에서 OAuth 3종 웹 로그인 | `e2e-loop.spec.ts` 로컬 녹색. 배포 도메인 OAuth 웹 3/3 |
| D8 | 10-23(금) | [L] 화면 1차: p4·p6·p7(스테이지·레벨테스트·기초 테스트), p13·p14, 오답노트 화면 | 해당 통합 테스트 + 화면 진입 확인 |
| D9 | 10-24(토) | [L] 화면 2차: p15 캐릭터, p16 친구, 전체 기록, 스트릭·보호권, 신고·보정 화면. **문제 검수·승인 완료(배포 DB)**. **E2E 콘텐츠 전제 조건 점검**(4.3 LF) | 공개 문제 수 리포트(주제별·별점별) runbook 기록. 전제 조건 미달 주제는 그 주제만 픽스처 공개 |
| **D10** | 10-25(일) | **Android APK 빌드**와 assetlinks 검증. (선택) iOS 무료 프로비저닝 Release 빌드 — 프로비저닝 7일 만료이므로 D10 이후 빌드가 시연일(D14)까지 유효. 시드 최종 | APK 설치 기기에서 `https://<app>.onrender.com/join/1234`가 앱으로 열림 |
| D11 | 10-26(월) | 버그 수정, 배포본 E2E, 수동 체크리스트 1회차 | `pnpm e2e:deployed` 녹색, 체크리스트 1회차 기록 |
| **D12** | 10-27(화) | **기능 동결(하드)**, 실기기 리허설 1회(워밍업 + keepalive 가동, 대결 2회 순서대로) | 동결 이후 변경은 시연 차단 버그만(리드 승인). 리허설 관측값 1~5 합격 |
| **D13** | 10-28(수) | 실기기 리허설 2회(워밍업 + keepalive 가동), 시연용 시드 재생성 리허설, 배포 동결 | 리허설 2회 연속 합격, 시드 리셋 5분 안에 복원 |
| **D14** | 10-29(목) | **시연**: 30분 전 워밍업과 keepalive 시작, 당일 `now` 기준 시드 재생성 | runbook 절차 완료 |

### 4.3 단계별 상세 (레인 기준)

#### L0 — 계약·골격 (D0~D1) [CP]

- 산출물:
  - `packages/shared/src/{dto/*, socket-events.ts, enums.ts, question.schema.ts}`
  - `apps/server/prisma/schema.prisma`: 원천 4종 + 파생(XpLedger, TopicProgress, StreakState, WrongNote, WeeklyReportSnapshot) + User/Guest/Question/Topic/Subfield/Room 기록/Friend/Invite/Item/Asset/IssueReport. raw SQL: owner CHECK, `Guest.mergedUserId` 부분 UNIQUE, XpLedger 멱등 키 UNIQUE(`sourceType`, `sourceId`, `userId`), 치즈 멱등 키 UNIQUE(`userId`, `milestone`, `runStartDay`)
  - `packages/game-rules/src/*.ts`의 함수 시그니처와 타입. 본문은 임시로 `throw new NotImplementedError()`만 둔다. LA가 D4까지 전부 실구현으로 바꾸고, D4 게이트에서 `NotImplementedError` 사용 0건을 CI grep으로 검사한다.
  - `config/defaults.ts`(스펙 수치 전부 + `configVersion`)
  - **서버 내부 포트**(`apps/server/src/ports/`). 모두 트랜잭션 클라이언트 `tx`를 받아 한 트랜잭션 안에서 호출된다.
    - `XpGrantPort.grant(tx, {ownerId, source: {type, id}, items, kstDay}) → XpLedgerEntry[]`
    - `SolveLogWriter.writeMany(tx, logs: SolveLogInput[]) → void`
    - `WrongNotePort.recordResults(tx, ownerId, results) → void`
    - `StreakPort.markActivity(tx, ownerId, kstDay, kind: 'solo_set' | 'battle') → void`
    - 구현은 LB 담당이다. LC(`room-result.service.ts`)는 이 4개 포트에만 의존한다.
- **GUIDE 관련**: GUIDE·스키마·템플릿·topics.json은 D0에 사용자·코디네이터가 작성해 **완료되었다**(AC-C1 산출물). L0은 `content/schema/question.schema.json`과 `shared/question.schema.ts`가 GUIDE의 예제 JSON에 같은 판정을 내리는지 테스트로만 묶는다.
- 문제 분포는 v3에서 권장했다(주제당 ★1: 6, ★1.5: 10, ★2: 14, ★2.5: 16, ★3: 18, ★3.5: 20, ★4: 22, ★4.5: 22, ★5: 22). GUIDE에 반영됐는지 D1에 확인만 한다. 레벨 구간 커버리지 문제(Lv.1~19 풀 30문제로 190슬롯, 16%)는 D8의 "감수"로 확정한다.

#### LA — 순수 규칙 (D2~D4) [CP]

함수 계약은 v3와 같다. 요지:
- `scoreAnswer`: 100 + floor(남은 비율 × 50) + 초성 문제 공개 전 정답 +30. D6-1에 따라 '힌트 없음'에서도 적용.
- `rankPlayers`
- `validateRoomSettings`: 공개 시점 < 제한 시간
- `isQuestionComplete`: 초성은 정답·포기·끊김 기준
- `computeXpGrant`: 보너스는 가산식(D6-2) → 감쇠 → 합계 → 순위 보너스 → 재대결 50% → 남은 상한
- `computeMergeGrant`: 합친 이력으로 감쇠와 세트 단위 제한(첫 클리어, 3분 지식 하루 1회, 퀘스트 주 1회)을 재판정. 게스트 몫만 감액. 날짜별 남은 상한
- `judgeStage`, `topicLevel`, `difficultyBand`, `placementNext`, `placementResult`, `basicTestPass`
- `selectQuestions`(D6-7 부족 시 동작)
- `allocateComposite`: **D6-10 (c) + 주제 3개 이하 규칙**, 최대 잔여법, 동점은 오답률 높은 쪽, 전부 0이면 균등
- `applyStreakDay`, `canBuyProtection`, `restoreStreak`
- `toChosung`(호환용 자모 U+3131~), `normalize`, `judgeChosung`
- `validateGuestNickname`, `dedupeNickname`
- `rankWeakness`, `topicWrongRates`, `weeklyReport`, `historySummary`, `recommendDifficulty`, `validateImport`

수용 기준:
- 커버리지 ≥ 90%(v3의 95%에서 완화)
- 스펙 표 전부 `it.each`
- `Date.now`/`fetch`/`fs` 사용 0건

#### LB — 서버 코어 (D2~D8) [CP 대부분]

**인증**:
- PKCE와 nonce state(서명). 게스트 토큰은 서버에 보관한다.
- 1회용 교환 코드는 60초 TTL로 Redis에 둔다.
- 서명 게스트 토큰(JWT `typ=guest`)을 쓴다.
- OAuth 콜백 URI는 `https://<app>.onrender.com/api/auth/{kakao|naver|google}/callback`이고, 로컬용은 `http://localhost:3000/...`을 함께 등록한다.

**병합(D6-3)**:
1. 트랜잭션 안에서 `mergedUserId`를 설정한다(이미 있으면 409).
2. 원천 4종의 소유권을 이전한다.
3. 계정의 XpLedger는 동결한다.
4. `computeMergeGrant`로 게스트 몫만 지급한다.
5. 파생 데이터를 재생성한다. 스트릭 치즈는 멱등 키로 지급하고, 회수는 없다.
6. 영향받은 주의 스냅샷을 재생성한다(D6-9).

**동시성**:
- `lockAll((userId, dayKey)[])`로 정렬 후 advisory lock을 잡는다. **`pg_advisory_xact_lock`만** 쓴다(PgBouncer 트랜잭션 풀링 호환).
- 결과 기록 트랜잭션은 `P1001`/`P1017`이면 최대 3회 재시도한다(2.3(d) Neon 운영 규칙).
- 세트·대결 결과는 멱등 키를 쓰고, 클라이언트는 `Idempotency-Key` 헤더를 보낸다.

**리포트**(D6까지, [CP]):
- `GET /api/reports/weekly/current`
- `GET /api/reports/weakness`(약점 3가지, `weakTopics`, `insufficientData`, 진단 세트)
- `GET /api/solo/composite/plan`
- 지난주 스냅샷은 **크론 대신 읽을 때 지연 확정**한다(v4 단순화). 결과는 같고 크론 실패 가능성이 없다.

**자산**:
- `POST /api/assets`(인증 필요, 1MB, image/png·jpeg·webp만)
- `GET /api/assets/:key`

**게스트 정리(AC-A3)**: 기동 시와 하루 1회 `setInterval` 정리를 돈다. 무료 인스턴스가 잠들어도 깨어날 때 실행된다.

**스트릭 판정**: 읽기 시 지연 판정과 하루 1회 실행 작업(깨어날 때 포함)을 함께 쓰고, 날짜 키로 멱등이다.
- **보호권 판정 시점 고정(v5)**: 판정이 늦게(지연) 실행되더라도, "전날 활동 없음"의 판정은 **그 다음 날 00:00 KST 시점의 보유 상태**로 한다.
- 보유 보호권 수는 CheeseLedger의 구매·사용 기록을 경계 시각까지 누적해 계산한다. 그래서 00:00 이후에 산 보호권은 소급 적용되지 않는다. 이 경우 끊긴 스트릭은 100치즈 복구로만 되살릴 수 있다.

**[L] 범위(D7~D8)**: 친구, 캐릭터·치즈 구매, 기록 삭제·탈퇴, 신고·보정 API, 퀘스트, 전체 기록.

#### LC — 실시간 (D2~D6) [CP]

- 상태 머신: `lobby → question → reveal(3s) → … → finished`.
- **펜스**: 버전 CAS와 리스(10초, 3초마다 갱신)를 쓴다. 송신은 `emitIfOwner`를 거친다.
- **SIGTERM**: 리스를 반납하고 소켓을 끊는다. 기동 시와 2초 주기로 방을 회수하고, 마감이 지났으면 즉시 전이한다.
- **방 규칙**:
  - 대기실 방장 위임
  - 시작 시 원자적 재확인
  - 공개 시점 검증
  - 초성 '전원 제출' 정의
  - near 결과는 제출자에게만 보냄
  - 마감 이후 제출은 `late`로 거부
- **재접속**: `room:resume`을 쓴다. 게스트 좌석은 게스트 토큰으로 인증한다.
- **결과 기록**: BattleResult·SolveLog·XP·오답노트·스트릭을 한 트랜잭션에서 기록하고, 멱등 키는 roomSessionId + participantId다.
- **방 TTL**: 대기실 30분 해산. 종료 후 1시간 보관(한 판 더 대비).

#### LD — 클라이언트 (D2~D11)

| 순서 | 목업 | 파일 | 구분 / 목표일 |
|---|---|---|---|
| 1 | p1 토큰·폰트·버튼 | `src/theme/*`, `src/components/Button.tsx` | [CP] D2 |
| 2 | p2 로그인 | `app/(auth)/login.tsx`, `app/auth/callback.tsx`, `src/lib/pkce.ts` | [CP] D3 |
| 3 | 하단 탭 | `app/(tabs)/_layout.tsx` | [CP] D2 |
| 4 | p9 방 만들기 | `app/battle/create.tsx` | [CP] D3 |
| 5 | 초대 착지 + 인앱 탈출 | `app/join/[code].tsx`, `src/lib/inAppBrowser.ts` | [CP] D4 |
| 6 | p10 대기실 | `app/room/[code]/lobby.tsx` | [CP] D4 |
| 7 | p8 대결 진행(IME 가드, 포기 버튼) | `app/room/[code]/play.tsx`, `ChosungInput.tsx` | [CP] D5 |
| 8 | p11 결과(게스트 저장 버튼, D6-6 문구) | `app/room/[code]/result.tsx` | [CP] D5 |
| 9 | p12 주간 리포트(이번 주·약점·데이터 부족) | `app/(tabs)/report/index.tsx` | [CP] D6 |
| 10 | p5 홈 / p3 빈 홈 | `app/(tabs)/home/index.tsx` | [CP] D6 |
| 11 | 솔로 풀이·결과(종합 세트) | `app/solo/*` | [CP] D7 |
| 12 | 오답노트 | `app/profile/wrong-notes.tsx` | [CP] D7 |
| 13 | p4 주제 고르기 | `app/topics/select.tsx` | [L] D8 — E2E의 회원 A 주제는 시드가 설정 |
| 14 | p6 주제 레벨 / p7 새 주제 시작 | `app/topics/[topicId]/*` | [L] D8 |
| 15 | p13 프로필 / p14 프로필 편집(사진 3출처, bytea 업로드) | `app/(tabs)/profile/index.tsx`, `app/profile/edit.tsx` | [L] D8 |
| 16 | p15 캐릭터 꾸미기 | `app/profile/character.tsx`, `CharacterLayers.tsx` | [L] D9 |
| 17 | p16 친구 프로필·친구 목록 | `app/friends/*` | [L] D9 |
| 18 | 주제 관리·계정 관리(기록 삭제·탈퇴) | `app/profile/{topics,account}.tsx` | [L] D9 |

- 목업 충실도(D2 기본값): 구조·색상 토큰·폰트·주요 컴포넌트. 시각 검토는 p8·p11·p12 3화면이다(v3의 6화면에서 축소, 나머지는 시연 뒤).
- 웹 폰트는 시연 동안 원본 폰트를 그대로 쓴다. woff2 서브셋은 시연 뒤로 미룬다. 콜드 스타트 이후 첫 로드가 느린지 D11에 측정하고, 3초를 넘으면 서브셋을 D11에 앞당긴다.

#### LE — 관리자·콘텐츠 (D2~D9)

- **관리자([CP])**:
  - 로그인(`User.isAdmin`)
  - 문제 목록·필터·수정
  - `draft → reviewed` 검수
  - 일괄 승인 조건:
    - 상태가 `reviewed`인 문제만
    - 한 번에 50건 이하
    - 같은 세부 분야
    - `source.title` 있음
    - `source.url`이 있으면 검수자가 링크 확인 체크. GUIDE는 확실하지 않으면 `url: ""`을 허용한다.
    - 가져오기 경고 0
  - JSON 업로드
  - 관리자 웹은 **D5 첫 배포 때 함께 나가야 한다**(검수가 배포 DB에서만 이뤄지므로 [CP])
- **관리자([L], D8~D9)**: 신고 처리, 난이도 보정, Items(이미지 교체 → `Asset` + `Item.imageKey`).
- **콘텐츠 일정**(`content/GUIDE.md` §2와 일치):

  | 차수 | 범위 | 문제 수 | 납품 | 처리 |
  |---|---|---|---|---|
  | 1차 | 과학 ★1~★5 | 150 | D2(10-17) | 로컬 `pnpm import --dry-run`(형식 검사만, DB 반영 없음) → 오류 회신 |
  | 2차 | 상식·역사 ★3~★5 | 208 | D4(10-19) | dry-run |
  | 3차 | 상식·역사 ★1~★2.5 | 92 | D5(10-20) | dry-run |
  | 4차 | 어휘력 ★1~★5 | 150 | D6(10-21) | 배포 DB 반입 |

  - **D5 첫 배포 직후** 1~3차를 배포 DB에 `draft`로 반입한다(`pnpm import --target prod`). 중복 문구 검사가 있어 재반입해도 안전하다.
  - 4차는 D6에 반입한다.
  - **검수·승인은 배포된 관리자 웹에서만, D5~D9, 하루 약 120문제**(600 ÷ 5일). 검수 순서는 1차(과학) → 2차 → 4차(어휘력) → 3차다. E2E와 두 번째 시연 대결에 필요한 순서를 따른다. **D9에 승인을 끝낸다.**
  - 로컬 DB에는 승인 흐름이 없다. 개발은 픽스처로만 한다.
- **비상 픽스처**: 120문제를 D2에 완성한다(에이전트 작성, 검수 후 개발 DB에서 공개). 배포 DB에서는 **D9의 E2E 콘텐츠 전제 조건(4.3 LF)에 미달한 주제만** 그 주제의 픽스처를 검수 후 공개한다. 시연 기본 경로가 아니다.

#### LF — 인프라·시드·QA (D0, D5~D14) [CP]

- **D0**:
  - Render 무료 Web Service, Neon 무료 프로젝트, Render 무료 Key Value를 만든다.
  - hello + WebSocket 에코를 배포한다.
  - 8장 "D0 확인 필요" 항목을 실측하고 기록한다.
  - OAuth 앱 3종을 등록한다(Google 테스트 사용자, 네이버 개발 중 상태의 테스트 ID, 카카오 플랫폼 도메인에 `<app>.onrender.com` 등록).
- **D5**: 전체 이미지 첫 배포.
- **D7**: 배포본 OAuth를 검증한다.
- **D10 Android APK**:
  - EAS 무료 빌드를 쓴다(무료 월 빌드 수·대기열은 D0 확인 필요). 막히면 `npx expo run:android --variant release` 또는 `eas build --local`로 로컬 빌드한다.
  - **서명 키스토어는 D1에 1개만 만들어 고정한다.** EAS 빌드에는 이 키스토어를 업로드하고(`eas credentials`, EAS 자동 생성 키 사용 금지), 로컬 Release 빌드도 같은 키스토어로 서명한다.
  - 키스토어를 하나로 못 맞추게 되면 `assetlinks.json`의 `sha256_cert_fingerprints`에 **사용하는 모든 서명 키의 SHA-256을 나열**한다.
  - D10 검증 때 설치한 APK의 서명 지문(`apksigner verify --print-certs`)이 assetlinks 목록에 있는지 확인한다.
- **iOS(선택)**:
  - `npx expo run:ios --configuration Release --device`로 Xcode Personal Team 서명 후 USB 설치한다. Release 구성이라 JS 번들이 내장되어 Metro 없이 동작한다.
  - 제약: 7일 만료, Associated Domains 없음, 기기당 무료 앱 수 제한(D0 확인 필요).
  - D10 이후에 빌드하고, 만료되면 D13에 재설치한다.
- **시드**:
  - `demo-profile.ts`가 시연 당일 `now` 기준으로 상태를 만든다. 로그는 실제 서비스 메서드를 거친다.
  - 치즈 320 = 스트릭 보상 재계산값(28일 연속이면 최대 90) − 구매 + `seed_adjust`.
- **AC-E2E 합격 기준**(runbook과 `e2e-loop.spec.ts`에 동일하게, v3 수치를 유지):
  - 시드(회원 A, 주제 4개):
    - 이번 주 27문제: 과학 15(물리·화학·생물 각 5, 각 정답 4), 상식·어휘력·역사 각 4
    - 최근 30일 오답률: 과학 20%(20 중 4), 상식 30%(40 중 12), 어휘력 35%(40 중 14), 역사 25%(40 중 10)
  - 대결: 과학, 객관식·OX, 10문제, ★2 이상, 30초. 회원 A는 최소 7문제를 일부러 틀린다.
  - 관측값:
    1. 이번 주 27 → 37. '데이터 부족'에서 약점 3가지로 바뀌고, 약점은 {물리, 화학, 생물}이다.
    2. 과학 이번 주 정답률이 80% → ≤60%다.
    3. 취약 주제가 {어휘력, 상식} → {과학, 어휘력}으로 바뀌고, 종합 배정에서 과학이 2 → 3이다(D6-10 (c)).
    4. A의 XP 이력에 대결 사유 행이 생기고, 오답노트가 7건 이상 늘어난다.
    5. 게스트 B가 로그인하면 B의 SolveLog 10건과 BattleResult 1건이 B 계정으로 옮겨진다.
  - 7오답과 10오답 두 경우 모두 검산했다.
  - **v4 시연 배치**: 회원 A = Android APK(주) 또는 iPhone 무료 프로비저닝 빌드(선택), 게스트 B = iPhone Safari(또는 다른 Android의 Chrome). 이 배치로 "다른 휴대폰 브라우저 게스트"를 그대로 충족한다.
  - **시드의 주제 레벨(v5)**: 회원 A의 4개 주제를 모두 Lv.20~39 구간(★2~3)에 둔다. 과학 Lv.25, 상식 Lv.22, 어휘력 Lv.21, 역사 Lv.24. 종합 세트 출제 난이도가 이 구간으로 정해진다.
  - **E2E 콘텐츠 전제 조건(v5, D9 점검, runbook 체크리스트)** — 배포 DB 공개 문제 기준이다. 기준에 못 미치는 **그 주제만** 비상 픽스처를 검수 후 공개한다. 다른 주제에는 손대지 않는다.
    1. 과학 ★2 이상 공개 문제 ≥ 20(대결 1의 10문제 + 한 판 더 여유)
    2. 4개 주제 각각, A의 레벨 구간(★2~3) 공개 문제 ≥ 10(종합 배정 최대 3문제 + 미정답 우선 여유). **특히 어휘력(4차 납품, D6 반입, 검수 순서 3번째)이 위험하다.**
    3. 대결 2의 조건(상식·역사·과학, ★3 이상, 초성·객관식)에 맞는 공개 문제 ≥ 10. 미달하면 AC-M2 확인 창이 뜨며, 시연에서는 이것도 기능 시연으로 허용한다.
  - **시연 대결 2회(runbook 순서 고정)**:
    1. **대결 1 = E2E 대결**: 위 설정(과학만, 객관식·OX, 10문제, ★2 이상, 30초) 그대로 진행한다. 관측값 1~5를 확인하고, 게스트 B 병합과 종합 세트 배정 확인까지 마친다. 이 수치(4.3 관측값과 D6-10 검산)는 바꾸지 않는다.
    2. **대결 2 = 목업 설정 쇼케이스**: 상식·역사·과학, ★3 이상, 초성·객관식, 10문제로 한다. 문제당 시간과 초성 공개 시점은 `validateRoomSettings`를 통과하는 값(예: 문제당 45초, 초성 공개 30초)으로 정한다. **반드시 대결 1의 관측값 확인을 모두 마친 뒤에 진행한다.** 회원 A가 참가하면 과학·상식·역사 풀이 로그가 늘어 이번 주 풀이 수(관측값 1), 과학 정답률(관측값 2), 30일 주제 오답률과 취약 주제·종합 배정(관측값 3)이 모두 바뀌기 때문이다.
  - runbook에는 "관측값 확인 완료 체크 → 대결 2 시작" 게이트를 둔다. 리허설(D12·D13)에서도 같은 순서로 2회를 모두 돈다.

### 4.4 축소 사다리 (일정이 밀릴 때 위에서부터 자른다)

발동 조건:
- M-A(D5)가 1일 이상 늦으면 1~3단계를 적용한다.
- M-B(D7)가 늦으면 4~7단계를 적용한다.
- D10 Android 빌드가 실패하면 8단계를 적용한다.
- iOS 무료 프로비저닝 빌드가 실패하거나 시간이 없으면 9단계를 적용한다.
- D12 동결 시점에 미완성인 [L] 기능은 자동으로 잘린다.

| 단계 | 자르는 것 | 영향 AC(시연 뒤 완료) |
|---|---|---|
| 1 | p15 캐릭터 꾸미기 UI(기본 외형 고정, API·데이터는 유지) | AC-G8, AC-G9 |
| 2 | 친구 기능 전체(p16, 친구 목록, 초대함). 초대 **링크**는 유지 | AC-A5, AC-A6, AC-A7(초대함 부분) |
| 3 | 관리자 신고·보정·Items 화면(API·CLI로 대체) | AC-C4 일부, AC-C6/C7은 API로만 |
| 4 | 레벨테스트·기초 테스트 UI(p7). API는 유지하고, 새 주제는 Lv.1부터만 | AC-S3, AC-S4(UI) |
| 5 | 전체 기록 탭, 기록 삭제·탈퇴 UI(API는 유지) | AC-D7(UI) |
| 6 | 보호권·복구 UI, 약점 퀘스트 | AC-G7(UI), AC-D5 |
| 7 | p4·p6 다듬기(기본 목록 UI), 시각 검토 3화면 → p11 1화면 | D2 충실도 |
| 8 | **Android APK 빌드 실패 폴백**. ① EAS 무료 빌드 실패나 대기열 초과 → 로컬 Release 빌드(`npx expo run:android --variant release` 또는 `eas build --local`, D1 키스토어로 서명) ② 로컬 빌드도 D11까지 실패 → **최후 수단: 회원 A도 웹(Android Chrome)으로 시연** | ②이면 AC-A8의 "앱으로 열림"과 스펙의 "실기기 앱 설치" 미충족(시연 뒤 보완). AC-E2E 루프 자체는 웹으로 유지 |
| 9 | iOS 무료 프로비저닝 빌드(iOS는 Safari 웹만) | — |
| 10 | 네이버 로그인 실기기 검증(웹 로그인만 확인) | AC-A1 일부 |

**절대 자르지 않는 핵심(AC-E2E 경로)**:
- 방 생성·코드·링크 입장, 서버 권위 점수·타이머, 결과
- 게스트 서명 토큰 + 로그인 + 병합(D6-3)
- SolveLog·BattleResult·XpLedger·오답노트
- 이번 주 리포트·약점·`insufficientData`·`weakTopics`, 종합 세트(D6-10)
- 시드
- 무료 배포 + 워밍업·keepalive
- 게스트 웹, 회원 A의 실기기 접속 경로(APK가 기본, 8단계 ②일 때만 웹)
- 카카오·Google 로그인
- PKCE·nonce state
- CAS 펜스

### 4.5 시연 뒤로 미루는 하드닝 (v2·v3 항목 중)

| 항목 | v3 계획 | v4 처리 | 근거 |
|---|---|---|---|
| Socket.IO Redis adapter + pub/sub 리스 회수 | 포함 | **제거(시연 뒤 재검토)** | 무료 단일 인스턴스, 시연 중 배포 동결, 재접속과 resume으로 보완 |
| 2-인스턴스 배포 겹침 시뮬레이션 | 포함 | **연기** | 위와 같음. 단일 인스턴스 재시작 복구 시뮬레이션만 유지 |
| 병합 속성 테스트 200세트 | 200 | **50세트**(시연 뒤 200) | 실행 시간 단축. 시나리오 종류(대결·솔로 혼합, (a)~(h))는 유지 |
| 부하 스모크 20방 × 8명 | 포함 | **3방 × 8명(D3 시연 목표)** | 시연 규모 |
| D3 성능 목표(p95 < 300ms, REST < 500ms) | 확정 | **시연 목표: 3방 × 8명, 이벤트 p95 < 500ms(배포), 콜드 스타트 제외** | 무료 등급 성능은 D0 측정 후 기록 |
| RTT 리전 비교(싱가포르 vs 도쿄) | W1 측정 | **연기** | 무료 등급 리전 선택지가 제한적. 측정값만 기록 |
| woff2 서브셋 | 포함 | **연기**(D11 측정 결과에 따라 앞당김) | — |
| pnpm 격리 설치 검증 | W1 검증 | **생략**(hoisted 고정) | — |
| 지난주 리포트 확정 크론 | 크론 | **읽을 때 지연 확정** | 무료 인스턴스 슬립 중 크론 누락 방지 |
| 시각 검토 6화면 | 6 | **3화면**(p8·p11·p12) | — |
| 게임 규칙 커버리지 95% | 95% | **90%** | — |

유지하는 하드닝(값싸고 정확성에 직결): CAS 펜스, 마감 경과 즉시 전이, PKCE·nonce, 서명 게스트 토큰, advisory lock 전체 순서, 멱등 키, 병합 세트 단위 재판정, 치즈 멱등 키, 인앱 브라우저 탈출.

---

## 5. 수용 기준 매핑

약어: **U** = `packages/game-rules/test/*.test.ts`, **P** = `apps/server/test/property/*.prop-spec.ts`, **I** = `apps/server/test/integration/*.int-spec.ts`(testcontainers), **S** = `apps/server/test/socket-sim/*.sim-spec.ts`, **E** = `e2e/tests/*.spec.ts`, **M** = `docs/manual-qa-checklist.md`. "사다리" 열은 4.4의 축소 단계이고, "핵심"은 절대 자르지 않는 항목이다.

| AC | 레인·목표일 | 검증 | 사다리 |
|---|---|---|---|
| AC-M1 | LA D4, LC D5 | U `selection.test.ts` + S `room-questions.sim-spec.ts` | 핵심 |
| AC-M2 | LC D5, LD D4 | S `room-shortage.sim-spec.ts`(시작 직전 재확인) + E `room-shortage.spec.ts` | 핵심 |
| AC-M3 | LC D4, LD D4 | S `room-join.sim-spec.ts`(코드·링크·초대함, 9번째·시작 후 거부, 닉네임 접미) + U `room-rules.test.ts`(닉네임 1/2/10/11자) | 핵심(초대함은 2단계) |
| AC-M4 | LC D4 | S `room-start.sim-spec.ts`(준비 조건, 30분 해산) + S `room-host-handoff.sim-spec.ts` | 핵심 |
| AC-M5 | LA D4, LC D5 | U `scoring.test.ts`(초성만 +30, '힌트 없음' 포함) + U `room-rules.test.ts`(공개 ≥ 제한 거부) + S `room-scoring.sim-spec.ts` | 핵심 |
| AC-M6 | LA D3, LC D5, LD D5 | U `chosung.test.ts` + S `room-submit.sim-spec.ts` + Jest `ChosungInput.test.tsx`(IME) | 핵심 |
| AC-M7 | LA D4, LC D5 | U `isQuestionComplete` + S `room-flow.sim-spec.ts`(reveal 3000ms) | 핵심 |
| AC-M8 | LC D6 | S `room-reconnect.sim-spec.ts` + S `room-restart-recovery.sim-spec.ts`(단일 인스턴스 재시작, 리스 회수, 마감 경과 즉시 전이, 비보유 송신 0) + M 비행기 모드 | 핵심 |
| AC-M9 | LA D3 | U `ranking.test.ts` | 핵심 |
| AC-M10 | LC D5, LD D5 | I `room-result.int-spec.ts`(멱등 재처리) + E `guest-battle.spec.ts` | 핵심 |
| AC-M11 | LC D6 | S `room-rematch.sim-spec.ts` | 핵심 |
| AC-S1 | LA D3, LB D7 | U `stage.test.ts` + I `solo-stage.int-spec.ts` | 핵심(API), UI는 D8 |
| AC-S2 | LA D4 | U `selection.test.ts`(Lv.1~99) | 핵심 |
| AC-S3 | LA D4, LB D8, LD D8 | U `placement.test.ts` + I `placement.int-spec.ts` + M | 4 |
| AC-S4 | LA D4, LB D8 | U + I `basic-test.int-spec.ts` | 4 |
| AC-S5 | LB D7, LD D7 | U `xp.test.ts`(노힌트, 가산식) + E `solo-hint.spec.ts` | 핵심 |
| AC-S6 | LA D4 | U `selection.test.ts`(≤2) | 핵심 |
| AC-S7 | LA D4 | U `composite-allocation.test.ts`: (c) + 주제 3개 이하 규칙. 1개(10), 2개(비례), 3개(전체 비례, 역전 없음), 4개(시드 전/후 과학 2→3), 6개, 동점, 0%, 합계 10 | 핵심 |
| AC-S8 | LB D7 | I `topic-level-isolation.int-spec.ts` | 핵심 |
| AC-S9 | LB D6, LD D6/D8 | I `topics.int-spec.ts` + E `home.spec.ts` | 핵심 |
| AC-A1 | LB D3~D7, LF D7 | I `auth.int-spec.ts`(PKCE 불일치, state 위조, 교환 코드 재사용·만료) + M OAuth: 웹 3종 + Android 앱 3종(+선택 iOS 앱) | 핵심(네이버 실기기는 10) |
| AC-A2 | LA D4, LB D6 | I `guest-merge.int-spec.ts` (a)~(e) + P `merge.prop-spec.ts` 50세트 (a)~(c), (f) 세트 단위 제한, (g) 치즈 멱등, (h) 회수 0 + E 원시 guestId 병합 401 | 핵심 |
| AC-A3 | LB D6 | I `guest-merge.int-spec.ts`(409) + I `guest-cleanup.int-spec.ts`(Clock +30일) | 핵심 |
| AC-A4 | LB D7, LD D8 | I `profile.int-spec.ts` + M 사진 3출처(bytea 업로드) | 핵심(API) |
| AC-A5 | LB D8 | I `friends.int-spec.ts` | 2 |
| AC-A6 | LB D8, LD D9 | I `friend-profile.int-spec.ts` + M | 2 |
| AC-A7 | LC D6 | I `invites.int-spec.ts` + M | 링크는 핵심, 초대함은 2 |
| AC-A8 | LF D10, LD D4 | M: Android(APK 설치 → 앱 / 미설치 → 웹), iOS는 **웹만**(Safari), 카카오톡 인앱 → 외부 브라우저 | 핵심 |
| AC-G1 | LA D4, LB D5 | U `xp.test.ts` + I `xp-ledger.int-spec.ts` + I `xp-concurrency.int-spec.ts` | 핵심 |
| AC-G2 | LA D4, LB D7 | U + I `solo-stage.int-spec.ts` | 핵심 |
| AC-G3 | LA D4, LB D7 | U + I `daily-set.int-spec.ts` | 핵심 |
| AC-G4 | LB D7 | I `xp-cap.int-spec.ts` | 핵심 |
| AC-G5 | LA D3 | U `account-level.test.ts` | 핵심 |
| AC-G6 | LA D4, LB D7 | U `streak.test.ts`(30일 이후 보상 없음) + I `streak.int-spec.ts`(KST 경계, 치즈 멱등) | 핵심 |
| AC-G7 | LA D4, LB D8 | U(보호권 50, 최대 2, 자동 사용, 100 복구, **00:00 KST 이후 구매분은 전날 판정에 미적용**) + I `streak-protection.int-spec.ts`(지연 판정을 00:30에 실행했을 때 00:10 구매 보호권이 쓰이지 않고 스트릭이 끊김 → 100치즈 복구 가능) | 6 |
| AC-G8 | LB D8, LD D9 | I `wardrobe.int-spec.ts` + M | 1 |
| AC-G9 | LB D8, LE D9 | I `item-image-swap.int-spec.ts`(Items 업로드 → `imageKey` 변경 → 새 URL) + M(배포본에서 재배포 없이 변경) | 1 |
| AC-D1 | LB D5 | I `solve-log-fields.int-spec.ts`(7개 모드) | 핵심 |
| AC-D2 | LA D4, LB D6 | U `report.test.ts` + I `weekly-report.int-spec.ts`(지연 확정 스냅샷 = 재계산값, 병합·삭제 후 재생성) | 핵심 |
| AC-D3 | LA D4 | U `weakness.test.ts` | 핵심 |
| AC-D4 | LB D6 | I `report-insufficient.int-spec.ts`(29/30) | 핵심 |
| AC-D5 | LB D8 | I `weak-quest.int-spec.ts` | 6 |
| AC-D6 | LB D5 | I `wrong-notes.int-spec.ts` | 핵심 |
| AC-D7 | LB D8 | I `account-deletion.int-spec.ts`(원천 4종·파생·Asset) | 5(UI) |
| AC-D8 | LF D10 | I `seed.int-spec.ts`(재계산값 + `seed_adjust`) | 핵심 |
| AC-C1 | D0(완료, 사용자 작성) | M 문서 검토 + U GUIDE 예제가 `content/schema`·`shared` 스키마 양쪽 통과 | 완료 |
| AC-C2 | LA D3, LE D4 | U `import-validate.test.ts` + I `import.int-spec.ts` | 핵심 |
| AC-C3 | LB D5, LE D5 | I `question-status.int-spec.ts` | 핵심 |
| AC-C4 | LE D5/D9 | I `admin-guard.int-spec.ts` + E `admin.spec.ts` | 목록·승인 핵심, 신고·보정 3 |
| AC-C5 | LA D3 | U `chosung.test.ts` + S | 핵심 |
| AC-C6 | LB D8 | I `issue-reports.int-spec.ts` | 3(UI) |
| AC-C7 | LA D4, LB D8 | U + I `calibration.int-spec.ts` | 3(UI) |
| AC-C8 | LB D6 | I `topics.int-spec.ts` | 핵심 |
| AC-E2E | 전 레인, D7(로컬)·D9(콘텐츠 전제 조건)·D12~D13(배포) | E `e2e-loop.spec.ts`(관측값 1~5, 7오답·10오답, 대결 2는 관측 이후) + M 콘텐츠 전제 조건 체크 + M 실기기 리허설 2회 | 핵심 |

---

## 6. 리스크와 대응

| # | 리스크 | 대응 |
|---|---|---|
| **R1** | **14일 병렬 통합 실패**: 계약 변동, 레인 간 대기 | D1 계약 고정(G1). `schema.prisma`·`shared` 변경은 담당자 1인만. LB·LC는 LA 시그니처 스텁으로, LD는 목 API로 선행 개발. 매일 머지 + CI 필수. D5 M-A에서 세로 관통 통합 |
| **R2** | **OAuth 3종 등록·심사 지연**(onrender.com 서브도메인, 개발 모드 제한) | D0에 등록 시작. 카카오는 플랫폼 도메인 등록, 네이버는 개발 중 상태와 테스트 ID, Google은 테스트 모드와 테스트 사용자를 쓴다. 시연 계정은 전부 사전 등록한다. **Google은 공개 접미사 목록(Public Suffix List)에 오른 `onrender.com`의 서브도메인을 '승인된 도메인'으로 받지 않을 수 있으므로 D0 첫 확인 항목으로 둔다.** 거부되면 Google은 로컬·개발용으로만 남긴다. runbook의 결과 화면 로그인은 **카카오를 첫 번째 버튼·기본 경로**로 두고, AC-A1의 Google 배포 검증은 미충족으로 기록한다(사다리 10단계와 같이 시연 뒤 보완: 도메인 확보) |
| **R3** | **콘텐츠 600문제 검수 병목**(배포 DB, D5~D9) | GUIDE §2 차수별 납품(D2/D4/D5/D6). 도착 즉시 dry-run으로 형식 오류를 회신. 검수는 배포 관리자 웹에서 하루 약 120문제, E2E 우선 순서로. D9 콘텐츠 전제 조건 점검 후 미달 주제만 픽스처 공개 |
| R4 | **무료 등급 제약**(슬립·콜드 스타트, 월 사용 한도, 메모리, Neon 자동 중지·연결 끊김, Key Value 비영속) | D0 실측. 워밍업 30분 전(Redis 재시작 감지 포함) + keepalive 4분 이하 주기(D12~D14). Neon pooled URL + `connect_timeout`, 결과 기록 재시도, xact lock만 사용. 재접속 백오프 상한 > 콜드 스타트. 시연 당일 배포 동결. CI 사전 빌드 폴백은 D4에 검증 |
| R5 | **카카오·네이버 Expo 웹 미지원** | 표준 OAuth2 웹 플로우(서버 중계)만 사용 |
| R6 | **카카오톡 등 인앱 브라우저** | UA 감지 → iOS `kakaotalk://web/openExternal?url=`, Android `intent://…#Intent;scheme=https;S.browser_fallback_url=…;end`(package 미지정). 게스트 토큰은 외부 브라우저 저장소에 생성. Google `disallowed_useragent` 회피. 폴백은 SMS 링크·QR |
| R7 | **iOS 제약**(유료 계정 없음) | iOS = Safari 웹(AC-A8 iOS는 웹만). 선택 빌드는 무료 프로비저닝 7일 만료 → D10 이후 빌드, D13 재설치. 앱 측 회원 A는 Android APK가 주 경로 |
| R8 | **Android 딥링크 검증**(스토어 없음) | D1에 키스토어 고정, assetlinks SHA-256. App Links 검증 실패 시 웹 착지의 "앱에서 열기"(`zuirak://join/{code}`) 버튼 |
| R9 | **Socket.IO 재접속**(앱 백그라운드, 배포 재시작) | 네이티브 websocket 전용, AppState 재연결 + `room:resume`, 좌석 유지 |
| R10 | **타이머 드리프트** | 서버 수신 시각, `serverNow` 오프셋, `late` 거부, 마감 경과 즉시 전이 |
| R11 | **병합 정확성** | 지급 불변, 합친 이력 재판정, 날짜별 lock, 속성 테스트 50세트 |
| R12 | **폰트 라이선스** | D0 확인, 불허 시 D7 대체 |
| R13 | **저별점 문제 반복**(Lv.1~19) | D8 기본값: 감수(시연 영향 작음) |
| R14 | **KST 경계** | `time/kst.ts` 단일 출처, 경계 테스트 |

**상위 일정 리스크 3가지**: R1(병렬 통합), R2(OAuth 등록·검증), R3(콘텐츠 검수).

---

## 7. 검증 단계

| 층 | 명령 | 통과 기준 | 시점 |
|---|---|---|---|
| 정적 | `pnpm turbo run lint typecheck` | 오류 0 | 매 머지 |
| 단위 | `pnpm --filter @zuirak/game-rules test --coverage` | 통과, ≥ 90% | D4~ |
| 단위 | `pnpm --filter @zuirak/shared test`, `pnpm --filter mobile test` | 통과(스키마 동치, ChosungInput IME) | D1~ |
| 속성 | `pnpm --filter server test:prop` | 50세트 통과 | D6~ |
| 통합 | `pnpm --filter server test:int` | 5장 I 전부(사다리로 자른 항목 제외) | D5~ |
| 소켓 | `pnpm --filter server test:sim` | 5장 S 전부, 3회 반복 flaky 0 | D5~ |
| 부하 | `pnpm --filter server sim:load -- --rooms 3 --players 8 --base https://<app>.onrender.com` | p95 < 500ms, 오류 0 | D11 |
| 웹 E2E | `pnpm e2e` | guest-battle, e2e-loop, home, admin | D5~ |
| 배포 스모크 | `pnpm e2e:deployed -- --base https://<app>.onrender.com` | 헬스, SPA 폴백(`/join/1234`), assetlinks content-type, 게스트 입장, 자산 캐시 헤더 | D7~ |
| 수동 | `docs/manual-qa-checklist.md` | OAuth(웹 3, Android 3, 선택 iOS 앱), 딥링크(Android 설치/미설치, iOS 웹), 카카오톡 인앱, 재접속, 콜드 스타트 후 첫 로드, 화면 진입 | D11, D12, D13 |
| 시각 | p8·p11·p12 vs `mockup.pdf` | visual-verdict 통과 | D11 |

---

## 8. 사용자 결정 결과와 남은 확인 항목

### 8.1 확정된 결정

| ID | 결정 |
|---|---|
| D1(대체) | **무료 등급만**: Render 무료 Web Service(`*.onrender.com`) + Neon 무료 Postgres + Render 무료 Key Value. 이미지는 PostgreSQL bytea. 도메인 구입 없음. R2 없음 |
| D2 | 구조·색상 토큰·폰트·주요 컴포넌트. 시각 검토는 3화면 |
| D3 | **시연 목표**: 3방 × 8명, 이벤트 p95 < 500ms(배포, 콜드 스타트 제외). 원래 목표(20 × 8, p95 < 300ms)는 시연 뒤로 |
| D4 | **시연 2026-10-29(D14)**, 기능 동결 D12, 리허설 D12~D13 |
| D5 | **Apple 유료 계정 없음, TestFlight 없음.** iOS는 Safari 웹(+선택: 무료 프로비저닝 USB 설치). Android는 APK. AC-A8 iOS는 웹만 |
| D6-1~D6-9 | v3 기본값 그대로 채택(아래 요약) |
| D6-10 | **(c) + 주제 3개 이하 규칙 채택(스펙 변경 승인)** |
| D7 | 폰트 불허 시 Pretendard + OFL 둥근 제목체 |
| D8 | 역삼각형 유지, 저별점 반복·감쇠 감수 |

**D6 요약**:
- D6-1: +30은 초성 문제에만 준다. '힌트 없음'이어도 적용한다.
- D6-2: 보너스는 가산식(1 + 0.2 + 0.5)이고, 취약 주제와 복습은 중첩하지 않는다. 노힌트는 초성 문제에만 해당한다.
- D6-3: 병합 시 계정 XP는 동결하고, 게스트 몫은 합친 이력으로 재판정한 뒤 날짜별 남은 상한 안에서 준다.
- D6-4: 대결 XP는 합계 + 순위 보너스 → 재대결 50% → 상한 순서다.
- D6-5: 취약 주제는 30일 기준이다.
- D6-6: 게스트 결과에는 "최대 N XP" 문구를 쓴다.
- D6-7: 솔로 문제가 부족하면 기존 문제 → ±0.5★ → 차단 순서로 채운다.
- D6-8: 복습 보너스는 복습을 완료하는 그 정답 1회에만 준다.
- D6-9: 이번 주는 재계산, 지난주는 스냅샷이며 병합·삭제 시 스냅샷을 재생성한다.
- D6-10 (c):
  - 상위 2개 주제 합계 5문제, 나머지 5문제. 그룹 안에서는 오답률 비례이고, 주제가 3개 이하면 전체를 비례로 나눈다.
  - 시드 검산 결과 과학 배정이 2 → 3(7오답 2.56, 10오답 2.86)이다.

### 8.2 D0 확인 필요 (수치를 단정하지 않음 — D0에 실측해 runbook에 기록)

| 항목 | 확인 내용 | 결과가 나쁠 때 |
|---|---|---|
| Render 무료 Web Service | WebSocket 지원, 유휴 슬립 시간, 콜드 스타트 시간, 월 무료 사용 시간, 메모리, 배포 시 인스턴스 겹침 여부, Docker 빌드 인자 지원, 빌드 메모리·시간 한도, 리전 선택 | Koyeb 무료(D-free-2) 또는 CI 사전 빌드 |
| Neon 무료 | 저장 용량, 컴퓨트 자동 중지 시간과 재개 지연(→ `connect_timeout` 값), 리전, 연결 수, pooled URL에서 Prisma `pgbouncer=true` 동작 | Render 무료 Postgres(만료 기간 확인 후, 2주 시연이면 만료 전 사용 가능 여부) |
| Render 무료 Key Value | 제공 여부, 메모리 한도, `noeviction` 설정 가능 여부, 재시작 빈도 | Upstash 무료(명령 수 한도 확인, 리스 갱신 주기 10초로 완화) |
| EAS 무료 | 월 빌드 수, 대기열 시간 | 로컬 Release 빌드 |
| Xcode 무료 프로비저닝 | 만료 기간(7일로 알려짐), 기기당 앱 수 | iOS는 Safari 웹만 |
| **OAuth 공급자 (D0 첫 번째 확인)** | **Google이 `<app>.onrender.com`을 승인된 도메인·리다이렉트 URI로 받는지**(공개 접미사 목록 문제), 카카오·네이버의 서브도메인 등록, 테스트 모드 사용자 수, 네이버 개발 중 상태 테스터 수 | Google이 거부하면 카카오를 결과 화면 기본 로그인으로(R2). 그 밖에는 사다리 10단계 |
| 콜드 스타트 시간 | 슬립 후 첫 요청과 첫 WebSocket 연결까지 걸리는 시간 | 재접속 백오프 상한을 측정값 + 15초 이상으로 설정 |
| 폰트 라이선스 | 앱 임베딩·웹폰트 허용 | D7 대체 |

---

## 9. ADR — 쥐락펴락 MVP 아키텍처 결정 (v4 갱신)

- **Decision**:
  - 모노레포: pnpm(hoisted) + Turborepo. Expo 앱(Android APK, 웹 SPA, iOS는 웹 + 선택 무료 프로비저닝), NestJS(REST + Socket.IO), Vite 관리자, 순수 규칙 패키지 `game-rules`, `shared`
  - 데이터: Prisma + **Neon 무료 PostgreSQL**(v5: pooled URL + `pgbouncer=true` + `connect_timeout`, `pg_advisory_xact_lock`만 사용, `P1001`/`P1017` 재시도), **Render 무료 Key Value**
  - 방 권위: **단일 인스턴스 + 버전 CAS 펜스 + 리스**. Redis adapter와 pub/sub는 제외
  - 레인 경계(v5): LC(실시간)는 서버 내부 포트 4종(`XpGrantPort`, `SolveLogWriter`, `WrongNotePort`, `StreakPort`)에만 의존한다. 스키마와 마이그레이션은 LB가 단독 소유한다.
  - 콘텐츠(v5): 검수·승인은 배포 DB에서만 한다(D5~D9). 그 전 납품분은 dry-run 검증만 한다.
  - Android 서명(v5): 키스토어 1개를 D1에 고정해 EAS와 로컬 빌드에 함께 쓴다.
  - 배포: **Render 무료 Web Service 단일 출처 `*.onrender.com`**
  - 이미지: **PostgreSQL bytea + 캐시 헤더**
  - 데이터 원칙: 원천 기록 4종 + append-only XpLedger
  - 인증: 서버 중계 OAuth(PKCE + nonce state + 1회용 교환 코드), 서명 게스트 토큰 병합
  - 종합 배분: D6-10 (c)
  - 실행: **14일, D1 계약 고정 후 6개 병렬 레인**
- **Drivers**: (1) 14일 일정과 병렬 에이전트 실행 (2) 수치 규칙 검증 가능성 (3) 무료 등급 제약 아래 실기기 동작.
- **Alternatives considered**:
  - ORM: Drizzle, TypeORM. 모노레포: Nx
  - 방 권위: 별도 게임 서버, adapter + pub/sub(v3안)
  - 호스팅: Render 유료 + R2(v3안), Koyeb 무료 + Upstash, 노트북 + 임시 터널, Fly.io·AWS
  - 이미지: R2, 영구 디스크
  - 병합: 날짜 전체 재계산
  - 종합 배분: (a), (b)
  - iOS: TestFlight(유료)
  - 일정: 주 단위 10주(v3)
- **Why chosen**:
  - 무료 등급만 쓴다는 사용자 결정 아래, Render 무료는 HTTPS 서브도메인·WebSocket·Docker를 한 곳에서 준다.
  - Neon은 만료 없이 Postgres를 준다.
  - bytea는 업체를 늘리지 않고 AC-G9(재배포 불필요)를 만족한다.
  - 단일 인스턴스와 시연 중 배포 동결 조건에서 adapter의 이득은 작고, 그 비용(구현·2-인스턴스 테스트)은 14일 일정에서 크다. 반면 CAS 펜스는 값싸고 재시작 이중 전이를 막는다.
  - D1 계약 고정과 레인별 디렉터리 소유는 병렬 실행의 통합 비용을 줄인다.
  - (c)는 스펙의 50% 문구를 지키면서 AC-E2E 관측값을 결정적으로 만든다.
- **Consequences**:
  - 콜드 스타트와 슬립이 있어 runbook 워밍업·keepalive에 의존한다.
  - Redis는 비영속이라 재시작 시 진행 중인 방이 사라진다.
  - iOS에 앱 딥링크가 없다(AC-A8 iOS는 웹만).
  - 배포 겹침 중 1~2초 이벤트 공백이 생길 수 있다(재접속으로 보완).
  - 무료 등급 수치는 D0 실측 전까지 불확실하다.
  - 버퍼가 사실상 없어 축소 사다리에 의존한다.
  - (v5) Google이 `onrender.com`을 거부하면 배포 환경의 Google 로그인은 시연 뒤로 미뤄지고, 결과 화면 로그인은 카카오를 기본으로 한다.
  - (v5) 검수가 배포 DB에서만 이뤄지므로 관리자 웹이 D5 첫 배포의 임계 경로가 된다.
  - (v5) 시연은 대결 2회로 하고, 쇼케이스 대결은 E2E 관측 뒤에만 한다.
  - (v5) Android APK가 끝내 실패하면 회원 A도 웹으로 시연한다(사다리 8단계 ②).
  - 병합 후 XP가 "처음부터 계정으로 풀었을 때"와 다를 수 있다(D6-6 문구로 안내).
  - Lv.1~19에서 문제 반복이 생긴다.
- **Follow-ups**:
  - D0: 8.2 실측, OAuth 등록
  - D1: 계약 고정, 키스토어
  - 시연 뒤:
    - adapter + pub/sub와 2-인스턴스 시뮬레이션
    - 속성 테스트 200세트
    - 원래 D3 목표의 부하 테스트
    - woff2 서브셋, RTT 비교
    - 유료 Apple 계정·유니버설 링크·Apple 로그인
    - 사다리로 자른 기능의 완성
    - 저별점 문제 보강

---

## 10. 변경 이력 (v1→v2)

| # | 출처 | 변경 |
|---|---|---|
| 1 | Architect·조정 | 원천 기록을 SolveLog + SetAttempt + BattleResult + CheeseLedger로 확장. 병합 시 4종 모두 이전 |
| 2 | Architect·Critic·조정 | 병합 시맨틱: append-only XpLedger + configVersion, 계정 지급분 동결, 게스트 몫만 합친 이력 감쇠·남은 상한. 테스트를 (a)~(e) + 속성 테스트로 교체. D6-3 |
| 3 | Critic | Socket.IO Redis adapter 제거(확장 대비 목적은 과설계), CAS 펜스 + 리스, noeviction, SIGTERM 반납, 즉시 전이. v3에서 브로드캐스트 전용으로 재도입했다가 **v4에서 다시 제외**(무료 단일 인스턴스) |
| 4 | 조정 | 취약 주제 = 주제 단위, 약점 3가지 = 세부 분야 단위 |
| 5 | MUST 1 | 실시간 리포트·약점 API를 임계 경로로 앞당기고 M2 재정의 |
| 6 | MUST 2 | 파일 저장소 R2(**v4에서 bytea로 대체**) |
| 7 | MUST 3 | D6을 D6-1~D6-9로 확장 |
| 8 | MUST 4 | Expo 웹 single, 라우팅 순서, EXPO_PUBLIC 빌드 인자 |
| 9 | MUST 5 | 인앱 브라우저 탈출, 게스트 토큰을 OAuth 흐름에 연결, SMS/QR 폴백 |
| 10 | MUST 6 | PKCE + 서명 state + 1회용 교환 코드, 서명 게스트 토큰 병합 |
| 11 | MUST 7 | advisory lock + 멱등 키 |
| 12 | MUST 8 | 초성 전원 제출 정의, 공개 시점 검증, 시작 재확인, 방장 위임 |
| 13 | MUST 9 | 별점 분포·구간 커버리지 수치화, D8 |
| 14 | MUST 10 | Apple 결정 시점·범위(**v4: 유료 계정 없음으로 확정**) |
| 15 | MUST 11 | AC-E2E 관측값 수치화 |
| 16 | MUST 12 | 시드 테스트 = 재계산값 + seed_adjust |
| 17 | Planner | D6-10 문제 발견(주제 4개에서 50% = 균등) |
| 18 | SHOULD | 검수 처리량, 추가 테스트, websocket 전송, woff2, React 고정, Prisma 규약, RTT, 픽스처 비상용 등 |

## 11. 변경 이력 (v2→v3)

| # | 출처 | 변경 |
|---|---|---|
| 1 | 조정 | adapter 브로드캐스트 전용 재도입, 리스 상실 시 송신 중단, pub/sub 회수 < 1초(**v4에서 adapter·pub/sub 제외, 송신 중단은 유지**) |
| 2 | 조정 | D6-10을 스펙 변경 결정으로 재작성, (a)(b)(c) 수치 비교, (c) 권장과 주제 3개 이하 규칙 |
| 3 | Architect | 병합 시 세트 단위 제한 재판정 |
| 4 | Architect | 스트릭 치즈 멱등 키, 회수 없음, 속성 테스트 (f)~(h) |
| 5 | Critic 1 | E2E 시드를 과학 3개 세부 분야 각 5문제로 바꿔 약점을 결정화, 수치 재검산 |
| 6 | Critic 2 | `insufficientData`를 weakness 엔드포인트로 이동 |
| 7 | Critic 3 | R2가 두 번째 업체임을 명시(**v4에서 R2 폐기**) |
| 8 | Critic 4 | 주 배분 재검토와 축소 순서(**v4에서 일 단위로 재작성**) |
| 9 | Critic 5 | Android intent에서 package 지정 제거 |
| 10~13 | SHOULD | nonce-only state, lock 전체 순서, R2 커스텀 도메인·CORS(**v4 폐기**), 빌드 인자 확인 |
| 14 | 형식 | ADR 추가, FINAL v3 |

## 12. 변경 이력 (v3→v4)

| # | 출처 | 변경 |
|---|---|---|
| 1 | 사용자 D4 | 시연일 2026-10-29(D14) 확정. 주 단위 10주 일정을 **D0~D14 일 단위 마일스톤**으로 재작성. D12 하드 기능 동결, D12~D13 실기기 리허설 |
| 2 | 사용자(실행 방식) | 단계(Phase)를 **D1 계약 고정(L0) 후 병렬 레인 LA~LF**로 재구성. 레인별 디렉터리 소유와 매일 머지 규칙. LB·LC는 스텁, LD는 목 API로 선행 개발 |
| 3 | 사용자 | **축소 사다리 9단계**와 발동 조건, 절대 자르지 않는 핵심(AC-E2E 경로) 명시. 5장 AC 표에 '사다리' 열 추가 |
| 4 | 사용자 | 시연 뒤로 미루는 하드닝 표(4.5): adapter·pub/sub 제거, 2-인스턴스 시뮬레이션 연기, 속성 테스트 50세트, 부하 3방 × 8명, 커버리지 90%, 시각 검토 3화면, 크론 → 지연 확정 등 |
| 5 | 사용자 D5 | Apple 유료 계정·TestFlight 없음. iOS는 Safari 웹 + 선택 무료 프로비저닝 Release 빌드(7일 만료, D10 이후 빌드, D13 재설치). Android APK(EAS 무료 또는 로컬). AC-A8 iOS는 웹만, 딥링크는 Android·웹에서 검증 |
| 6 | 사용자 D1 | **무료 등급 인프라로 재설계**: Render 무료 Web Service(`*.onrender.com`), Neon 무료 Postgres, Render 무료 Key Value, 이미지 bytea(R2 폐기), 워밍업·keepalive. 불확실한 수치는 모두 "D0 확인 필요"(8.2) |
| 7 | 사용자(인프라) | 방 펜스 재평가: CAS 펜스·리스·송신 중단은 유지(값쌈, 재시작 이중 전이 방지), Redis adapter·pub/sub는 제외(단일 인스턴스 + 시연 중 배포 동결 + resume 보완) |
| 8 | 사용자 D6-10 | (c) + 주제 3개 이하 규칙 채택, 스펙 변경(AC-S7 해석) 승인 반영 |
| 9 | 사용자 D3 | 성능 목표를 시연 규모(3방 × 8명, p95 < 500ms)로 낮추고 원래 목표는 연기 |
| 10 | 사용자(콘텐츠) | GUIDE·스키마·템플릿·topics.json은 D0에 사용자·코디네이터가 작성 완료(AC-C1). 에이전트는 수정하지 않음. 납품 D1~D6, 검수·승인 D9, 비상 픽스처 120문제 D2 |
| 11 | 사용자 D6-1~9, D2/D7/D8 | v3 기본값 확정 |
| 12 | 형식 | ADR 갱신(결정·대안·결과·후속), 상태를 FINAL v4로 변경 |

## 13. 변경 이력 (v4→v5)

| # | 출처 | 변경 |
|---|---|---|
| 1 | Critic 1·GUIDE §2 | 콘텐츠 일정을 GUIDE §2 차수에 맞춤: 1차 과학 D2, 2차 상식·역사 ★3+ D4, 3차 상식·역사 ★1~2.5 D5, 4차 어휘력 D6. D5 전에는 로컬 `import --dry-run`(형식 검사만). **검수·승인은 배포 관리자 웹에서만, D5~D9, 하루 약 120문제**. "D2/D4/D6 주제당 50" 삭제. 관리자 웹을 D5 첫 배포의 임계 경로로. 일괄 승인 조건을 GUIDE의 `source.url: ""` 허용에 맞춤 |
| 2 | Critic 2 | runbook에 시연 대결 2회: 대결 1(E2E, 과학 설정·수치 그대로) → 관측값 확인 게이트 → 대결 2(목업 설정 상식·역사·과학 ★3+ 초성·객관식). 대결 2는 A의 로그를 늘려 관측값 1~3을 모두 바꾸므로 **반드시 뒤에** 둠 |
| 3 | Critic 3 | 축소 사다리에 **8단계 Android APK 빌드 실패 폴백**(EAS → 로컬 Release → 최후 수단: 회원 A도 웹) 신설. iOS는 9단계, 네이버는 10단계로 이동. 핵심 목록을 "회원 A 실기기 접속 경로"로 수정 |
| 4 | Critic 4 | D9 **E2E 콘텐츠 전제 조건** 명시: 과학 ★2+ ≥ 20, 4개 주제 각각 A의 레벨 구간(★2~3) ≥ 10(어휘력이 가장 위험), 대결 2 조건 ≥ 10. 미달 주제만 픽스처 공개. 시드 주제 레벨(Lv.21~25, ★2~3 구간) 고정 |
| 5 | Critic 5 | keepalive를 D12·D13 리허설에도 가동 |
| 6 | Critic 6 | 보호권 판정은 00:00 KST 시점 보유 상태로 지연 판정(사후 구매 미소급). AC-G7에 테스트 1건 추가 |
| 7 | Architect MUST 1 | D1 계약에 서버 내부 포트 4종(`XpGrantPort`, `SolveLogWriter`, `WrongNotePort`, `StreakPort`) 시그니처 추가. LC는 포트에만 의존, D5에 DI로 실구현 연결 |
| 8 | Architect MUST 2 | `schema.prisma` 소유자 표기 오류 수정("L2" → **LB**). 마이그레이션 생성은 LB만 |
| 9 | Architect MUST 3 | Neon 운영 규칙: pooled URL + `pgbouncer=true` + `connect_timeout`, `DIRECT_URL`로 마이그레이션, 결과 기록 트랜잭션 `P1001`/`P1017` 재시도(멱등 키로 안전), keepalive ≤ 4분, `pg_advisory_xact_lock`만 사용(CI grep) |
| 10 | Architect MUST 4 | Android 키스토어 1개를 D1에 고정해 EAS(업로드)와 로컬 빌드에 공용. 불가하면 assetlinks에 모든 SHA-256 나열. D10에 `apksigner`로 지문 대조 |
| 11 | Architect SHOULD | Google의 `onrender.com` 승인 도메인 거부 가능성(공개 접미사 목록)을 D0 첫 확인 항목으로. 폴백은 결과 화면 로그인 카카오 우선 |
| 12 | Architect SHOULD | Socket.IO `reconnectionDelayMax` > 콜드 스타트(측정값 + 15초, 기본 60초), 재시도 무제한 |
| 13 | Architect SHOULD | 워밍업 체크리스트에 Redis 재시작 감지(`boot:sentinel` 키) 추가 |
| 14 | Architect SHOULD | CI 사전 빌드 웹 export 폴백을 D4에 1회 검증(D5 첫 배포 전) |
| 15 | 형식 | ADR의 Decision·Consequences 갱신, 상태를 FINAL v5로 변경 |
