# 쥐락펴락 시연 runbook

권위 문서는 `.omc/plans/zuirak-mvp-plan.md`(v5)이다. 이름은 `zuirock`, 주소는 `PUBLIC_ORIGIN` 하나다(코드에 쓰지 않는다). 비밀 값(연결 문자열·키)은 **Render Environment 화면과 로컬 `.env`(git 제외)에만** 넣고, 채팅·문서·커밋에는 쓰지 않는다.

## 1. D0 체크리스트 (사용자 작업)

순서대로 진행하고 각 칸에 체크한다.

### 1-1. Neon (Postgres)
- [ ] Neon 프로젝트 생성. **리전은 Render 웹 서비스와 같은 지역**(예: Singapore)으로 한다.
- [ ] Connection Details에서 **Connection pooling 켠 값**을 복사한다 → `DATABASE_URL`.
  - 호스트에 `-pooler`가 들어 있어야 한다. 끝에 `&pgbouncer=true&connect_timeout=15`를 붙인다.
  - 형태: `postgresql://<user>:<password>@<endpoint>-pooler.<region>.aws.neon.tech/<db>?sslmode=require&pgbouncer=true&connect_timeout=15`
- [ ] **Connection pooling 끈 값**(호스트에 `-pooler` 없음)을 복사한다 → `DIRECT_URL`.
  - 형태: `postgresql://<user>:<password>@<endpoint>.<region>.aws.neon.tech/<db>?sslmode=require&connect_timeout=15`
- [ ] 두 값을 Render Environment(1-3)와 로컬 `.env`에만 붙여 넣는다.

### 1-2. Render Key Value (Redis)
- [ ] Key Value 인스턴스 생성(Free, 웹 서비스와 같은 리전).
- [ ] Maxmemory policy에서 `noeviction`을 고를 수 있으면 고른다. 못 고르면 4절 표에 "불가"로 기록한다.
- [ ] **Internal** URL(`redis://red-...:6379`)을 복사한다 → 웹 서비스의 `REDIS_URL`.

### 1-3. Render Web Service
- [ ] New > Web Service > 이 저장소 연결, Language `Docker`, Dockerfile Path `./infra/Dockerfile`, Docker Context `.`, Instance Type `Free`, Health Check Path `/api/health`. (또는 `infra/render.yaml` Blueprint 사용)
- [ ] 서비스 생성 후 **실제 주소**(`https://<name>.onrender.com`, 접미사가 붙을 수 있음)를 확인한다.
- [ ] Environment에 아래 표의 값을 모두 넣는다. `PUBLIC_ORIGIN`은 실제 주소로 바꾼 뒤 **재배포**한다(Expo 웹 빌드에 구워진다. Render가 Docker 빌드 인자를 환경 변수에서 받는지는 4절에서 확인).
- [ ] 비밀 키 3종(`JWT_SECRET`, `STATE_SECRET`, `GUEST_TOKEN_SECRET`)은 각각 서로 다른 임의 32바이트 이상: 로컬에서 `openssl rand -base64 48`.

| 변수 | 위치 | 설명 |
|---|---|---|
| `PUBLIC_ORIGIN` | Render(빌드·런타임), `.env` | 실제 배포 주소. OAuth redirect URI의 기준 |
| `NODE_ENV` | Render | `production` |
| `DATABASE_URL` | Render, `.env` | Neon pooled (1-1) |
| `DIRECT_URL` | Render, `.env` | Neon direct. 컨테이너 시작 시 `prisma migrate deploy`가 이 값을 쓴다 |
| `REDIS_URL` | Render, `.env` | Key Value Internal URL (로컬은 `redis://localhost:6379`) |
| `JWT_SECRET` `STATE_SECRET` `GUEST_TOKEN_SECRET` | Render, `.env` | 임의 32바이트 이상 |
| `KAKAO_CLIENT_ID` `KAKAO_CLIENT_SECRET` | Render, `.env` | 카카오 REST API 키 / Client Secret |
| `NAVER_CLIENT_ID` `NAVER_CLIENT_SECRET` | Render, `.env` | 네이버 |
| `GOOGLE_CLIENT_ID` `GOOGLE_CLIENT_SECRET` | Render, `.env` | Google |
| `ANDROID_CERT_SHA256` | Render | APK 서명 지문(쉼표로 여러 개). `/.well-known/assetlinks.json`에 들어간다 |
| `ANDROID_PACKAGE` | Render | 기본 `com.zuirock.app` |
| `CHARACTER_BODY_ASSET_KEY` | Render | 캐릭터 몸 이미지 Asset 키. 배포 DB에 `pnpm sync:items`(아래 1-5)를 돌리면 출력된다 |
| `PORT` | Render가 주입 | 직접 넣지 않는다 |

### 1-4. OAuth 앱 등록 (카카오 먼저)
Redirect URI는 `${PUBLIC_ORIGIN}/api/auth/{kakao|naver|google}/callback`이다. 예: `https://zuirock.onrender.com/api/auth/kakao/callback`.

1. **카카오(가장 먼저, 기본 로그인)**: Kakao Developers > 앱 생성 > 플랫폼 > Web 사이트 도메인에 `PUBLIC_ORIGIN` 등록 > 카카오 로그인 활성화 > Redirect URI 등록 > 동의항목(닉네임, 프로필 사진) > 보안에서 Client Secret 발급. REST API 키 → `KAKAO_CLIENT_ID`.
2. **네이버**: 네이버 개발자센터 > 애플리케이션 등록 > 서비스 URL `PUBLIC_ORIGIN`, Callback URL 위 경로. 개발 중 상태면 테스트 ID(멤버 관리)에 시연 계정을 추가한다.
3. **Google**: Cloud Console > OAuth 동의 화면(테스트, 테스트 사용자에 시연 계정 추가) > 사용자 인증 정보 > 웹 애플리케이션 > 승인된 JavaScript 원본 `PUBLIC_ORIGIN`, 승인된 리디렉션 URI 위 경로. **`onrender.com`을 받아 주는지가 D0 첫 번째 확인 항목이다.** 거부되면 4절에 기록하고 카카오를 기본 로그인으로 둔다(AC-A1은 "Google 미충족"으로 기록).
- [ ] 세 공급자 모두 `PUBLIC_ORIGIN`을 바꾸면 도메인과 redirect URI를 다시 등록한다.

### 1-5. 첫 배포 확인
- [ ] 배포 로그에서 `prisma migrate deploy` 성공과 `listening on :...` 확인.
- [ ] `curl -s -o /dev/null -w '%{http_code}\n' $PUBLIC_ORIGIN/api/health?deep=1` → `200`.
- [ ] `pnpm keepalive`가 로컬에서 도는지 확인(`PUBLIC_ORIGIN`은 `.env`).
- [ ] 아이템 이미지·캐릭터 몸 이미지 올리기: 로컬 `.env`의 `DATABASE_URL`/`DIRECT_URL`을 **배포 Neon 값**으로 둔 채 `pnpm --filter @zuirock/server build && pnpm sync:items`. 출력된 `CHARACTER_BODY_ASSET_KEY=...` 값을 Render Environment에 넣고 재배포한다(실제 몸 이미지는 `content/items/images/body.png`로 두면 그것이 올라간다).

### 1-6. 로컬 E2E 한 번에 (`pnpm e2e:local`)
깨끗한 체크아웃에서 `pnpm i` 후 Docker만 켜 두고 실행한다. `.env`가 필요 없다.
```sh
pnpm exec playwright install chromium webkit   # 처음 한 번
pnpm e2e:local                                  # 마지막 줄: [e2e:local] PASS 또는 FAIL
E2E_SKIP_BUILD=1 pnpm e2e:local                 # 빌드 결과(.e2e/static, dist)를 재사용
```
순서: `docker compose up` > DB `zuirock_lf` 생성·마이그레이션(다른 이름의 DB는 거부) > 공유 패키지·서버·Expo 웹·관리자 빌드(`.e2e/static/{web,admin}`) > 포트 3004 서버 기동(개발용 임시 비밀 키, `DEV_LOGIN=1`, `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:3004`) > `/api/health?deep=1` 대기 > `seed:reset --dev-questions` > `seed:verify` > Playwright(7오답·10오답 대결, 게스트 UI 대결, 스모크) > 서버 종료.

## 2. 시연 30분 전 워밍업

1. [ ] 노트북에서 `pnpm keepalive` 시작(종료는 Ctrl-C). D12·D13 리허설과 D14 시연 내내 켜 둔다. 주기 4분 이하로 Render 슬립과 Neon 자동 중지를 함께 막는다.
2. [ ] `curl $PUBLIC_ORIGIN/api/health?deep=1`이 DB·Redis 모두 ok. 슬립에서 깨우는 첫 요청 소요 시간을 4절 "콜드 스타트"에 기록.
3. [ ] **Redis 재시작 감지**: 서버는 기동 시 Redis에 `boot:sentinel` 키를 만든다. 워밍업 때 이 키가 없으면 Redis가 재시작된 것이다(진행 중인 방·OAuth nonce 소실). 키 확인은 깊은 헬스 응답의 sentinel 필드(서버 구현에 따름) 또는 Render Key Value 대시보드의 Connect > redis-cli에서 `EXISTS boot:sentinel`. 없으면 방을 새로 만들고 로그인을 다시 확인한다.
4. [ ] 회원 A 시드 상태 재생성: 로컬 DB는 `pnpm seed:reset`(1초 안팎), 서버 기동 후 `pnpm seed:verify`가 `seed verify: OK`를 출력해야 한다. 배포 DB에 넣을 때는 `.env`의 DB URL을 배포 값으로 바꾸고 `node --env-file=.env scripts/seed/insert.ts --reset`(검수된 공개 문제가 있어야 하며 `--dev-questions`는 붙이지 않는다). 5절 수치 확인.
5. [ ] 콘텐츠 전제 조건(6절) 재확인.
6. [ ] 기기: 회원 A = Android(APK 설치됨), 게스트 B = iPhone Safari. 둘 다 같은 `PUBLIC_ORIGIN`으로 첫 화면이 열리는지 확인.
7. [ ] 카카오 로그인 1회 시도(콜드 스타트·nonce 확인).

## 3. 시연 순서 (고정, 리허설도 동일)

### 대결 1 = E2E 대결
설정: 과학만, 객관식·OX, 10문제, ★2 이상, 문제당 30초. 회원 A는 최소 7문제를 일부러 틀린다. 게스트 B(Safari)가 코드·링크로 입장한다.

### 게이트
**관측값 1~5를 모두 확인하고 아래에 체크하기 전에는 대결 2를 시작하지 않는다.** 대결 2에 A가 참가하면 이번 주 풀이 수, 과학 정답률, 30일 오답률, 취약 주제, 종합 배정이 모두 바뀌어 관측값이 오염된다.

- [ ] 관측값 1~5 확인 완료 (7절 표)
- [ ] 게스트 B 병합, 종합 세트 배정(과학 2 → 3) 확인 완료
- [ ] → 대결 2 시작

### 대결 2 = 목업 설정 쇼케이스
상식·역사·과학, ★3 이상, 초성·객관식, 10문제. 문제당 45초, 초성 공개 30초(`validateRoomSettings` 통과 값). 조건에 맞는 공개 문제가 10개 미만이면 AC-M2 확인 창이 뜬다. 시연에서는 이것도 기능 시연으로 허용한다.

## 4. D0 확인 필요 항목 (실측 기록)

날짜·측정자·방법을 함께 적는다. 비워 둔 칸을 채운다.

| 항목 | 확인 내용 | 실측값 | 결과가 나쁠 때 |
|---|---|---|---|
| Render Web | WebSocket 지원 | | Koyeb 무료 또는 CI 사전 빌드 |
| | 유휴 슬립 시간 | | |
| | 콜드 스타트 시간(첫 HTTP) | | |
| | 월 무료 사용 시간 | | |
| | 메모리 | | |
| | 배포 시 인스턴스 겹침 | | |
| | Docker 빌드 인자(`PUBLIC_ORIGIN`) 지원 | | 환경 변수가 ARG로 전달 안 되면 Dockerfile 기본값을 실제 주소로 바꿔 커밋 |
| | 빌드 메모리·시간 한도 | | |
| | 리전 | | |
| Neon | 저장 용량 | | Render 무료 Postgres |
| | 자동 중지 시간 / 재개 지연(→ `connect_timeout`) | | |
| | 리전 | | |
| | 연결 수 | | |
| | pooled URL + Prisma `pgbouncer=true` 동작 | | |
| Render Key Value | 제공 여부 / 메모리 한도 | | Upstash(리스 갱신 10초로 완화) |
| | `noeviction` 설정 가능 | | |
| | 재시작 빈도 | | |
| EAS 무료 | 월 빌드 수 / 대기열 시간 | | 로컬 Release 빌드 |
| Xcode 무료 프로비저닝 | 만료 기간 / 기기당 앱 수 | | iOS는 Safari만 |
| **OAuth(첫 번째)** | Google이 `onrender.com`을 승인 도메인·redirect로 받는가 | | 카카오를 기본 로그인으로 |
| | 카카오·네이버 서브도메인 등록 | | |
| | Google 테스트 사용자 수 / 네이버 개발 중 테스터 수 | | |
| 콜드 스타트 | 슬립 후 첫 요청, 첫 WebSocket 연결까지 | | 재접속 백오프 상한 = 측정값 + 15초 이상 |
| 폰트 라이선스 | 앱 임베딩·웹폰트 허용 | | D7 대체 |

## 5. 시드 (회원 A, 주제 4개)

`scripts/seed/demo-profile.ts`가 당일 `now` 기준으로 만든다(데이터 생성 로직과 숫자 검증 테스트 포함. DB 반영은 pass 2).

| 주제 | 이번 주 문제 수 | 이번 주 정답 | 최근 30일 오답률 | 레벨 |
|---|---|---|---|---|
| 과학 | 15 (물리·화학·생물 각 5, 지구 0) | 각 5문제 중 4 정답 → 12/15 = 80% | 20% (20 중 4) | Lv.25 |
| 상식 | 4 | | 30% (40 중 12) | Lv.22 |
| 어휘력 | 4 | | 35% (40 중 14) | Lv.21 |
| 역사 | 4 | | 25% (40 중 10) | Lv.24 |

- 이번 주 합계 27문제. 스트릭 28일 연속. 치즈 목표 320 = 스트릭 보상 재계산값(28일이면 최대 90) − 구매 + `seed_adjust`.
- 취약 주제(대결 전): {어휘력, 상식}. 종합 세트 배정에서 과학 2.

## 6. E2E 콘텐츠 전제 조건 (D9 점검, 배포 DB 공개 문제 기준)

기준 미달 주제만 비상 픽스처를 검수 후 공개한다. 다른 주제는 건드리지 않는다. 공개 문제 수 리포트(주제별·별점별)를 아래에 기록한다.

- [ ] 과학 ★2 이상 공개 문제 ≥ 20 (실측: ____)
- [ ] 4개 주제 각각 A의 레벨 구간(★2~3) 공개 문제 ≥ 10: 과학 ____ / 상식 ____ / 어휘력 ____ / 역사 ____ (**어휘력이 가장 위험**: 4차 납품, 검수 3번째)
- [ ] 대결 2 조건(상식·역사·과학, ★3 이상, 초성·객관식) 공개 문제 ≥ 10 (실측: ____). 미달이면 AC-M2 확인 창을 기능 시연으로 사용.

## 7. AC-E2E 관측값 (대결 1 직후)

| # | 관측 | 전 | 후 | 확인 |
|---|---|---|---|---|
| 1 | 이번 주 풀이 수, 리포트 상태 | 27, '데이터 부족' | 37, 약점 3가지(모두 과학 소분야, 각 5문제 이상). 과학은 물리·화학·생물·지구 4개라 대결 문제가 무작위로 뽑히므로 3가지의 정확한 구성은 달라질 수 있다(시드는 물리·화학·생물에만 풀이를 넣고 지구는 0). 지구가 5문제 이상 나오면 후보가 된다 | [ ] |
| 2 | 과학 이번 주 정답률 | 80% | ≤ 60% | [ ] |
| 3 | 취약 주제 / 종합 배정 | {어휘력, 상식} / 과학 2 | {과학, 어휘력} / 과학 3 | [ ] |
| 4 | XP 이력에 대결 사유 행, 오답노트 | | 행 생성, 7건 이상 증가 | [ ] |
| 5 | 게스트 B 로그인 후 | B의 SolveLog 10건, BattleResult 1건 | B 계정으로 이동 | [ ] |

7오답, 10오답 두 경우 모두 검산됨(계획 §4.3). 자동 검증: 로컬 서버를 띄우고 `pnpm e2e`가 시드를 새로 만든 뒤 7오답·10오답 대결을 각각 돌려 관측값 1~5를 확인한다(소켓 클라이언트 2명 + 게스트 UI 대결 1건, 모두 통과 확인).

로컬 개발 격리: 이 레인은 DB `zuirock_lf`, 서버 포트 3004를 쓴다(`docs/contracts.md` 레인별 규칙). 개발 로그인(`DEV_LOGIN=1`)은 `NODE_ENV=production`에서 404다.

## 8. 폴백

- **Google 거부(onrender.com)**: 카카오를 기본 로그인으로(이미 1순위). AC-A1 "Google 미충족" 기록, 시연은 카카오로 진행.
- **네이버 실기기 검증 불가**: 웹 로그인만 확인(축소 사다리 10).
- **APK 실패 사다리**: ① EAS 무료 빌드 실패·대기열 초과 → 로컬 `npx expo run:android --variant release` 또는 `eas build --local`(D1 키스토어 `scripts/make-keystore.sh`로 서명, 같은 키스토어만 사용) ② D11까지 로컬도 실패 → 회원 A도 Android Chrome 웹으로 시연(AC-A8 "앱으로 열림"은 시연 뒤 보완). 서명 지문이 `assetlinks.json`에 있는지 `apksigner verify --print-certs`로 확인.
- **iOS 앱 빌드 실패**: Safari 웹만 사용(선택 항목). 무료 프로비저닝은 7일 만료이므로 D13 재설치.
- **Render 슬립/콜드 스타트**: keepalive가 꺼졌으면 워밍업 3절 순서로 깨우고 1분 대기. 첫 WebSocket 연결 실패 시 재접속.
- **Neon 자동 중지**: 첫 쿼리가 느릴 수 있다(`connect_timeout=15`). `P1001/P1017` 결과 기록은 서버가 3회 재시도. 워밍업에서 deep 헬스로 깨운다.
- **Redis 재시작**: 방·OAuth nonce 소실 → 방을 새로 만들고 로그인 다시 확인.
- **비상 로컬 시연**: 노트북 + 임시 터널은 OAuth 콜백이 깨지므로 게스트 대결만 가능. 최후 수단.
