# 쥐락펴락(zuirock) 프로젝트 현황 — 새 세션은 이 문서부터 읽는다

최종 갱신: 2026-10-19 (D5). 기능 동결 10/27(D12), 시연 10/29(D14). 비밀 값은 이 저장소 어디에도 없다.

## 1. 한 줄 요약
교양 지식 솔로 학습(주제 레벨 1~99 스테이지) + 친구와 실시간 퀴즈 대결 모바일 서비스. 모든 풀이는 풀이 로그로 쌓여 XP·스트릭·오답노트·리포트로 돌아온다. 사용자는 **혼자 개발을 지시하는 비개발 PM**이고 한국어로 소통한다. 서비스 이름은 `zuirock`(패키지 `@zuirock/*`), 제품명 "쥐락펴락".

## 2. 지금 배포된 상태 (모두 동작 확인됨)
| 항목 | 값 |
|---|---|
| 웹/서버 | Render 무료 웹 서비스 `zuirock`, 싱가포르. 주소 `https://zuirock.onrender.com` (API·Socket.IO·웹앱·`/admin/` 모두 한 곳) |
| DB | Neon 무료 PostgreSQL, **싱가포르** (미국 동부에서 옮겨 응답이 1.3~1.7초 → 0.2초) |
| Redis | Render 무료 Key Value (방 상태·타이머) |
| 깨우기 | UptimeRobot이 5분마다 `/api/health` 호출(무료 플랜 슬립 방지). `?deep=1`은 DB를 깨우므로 쓰지 않는다 |
| 배포 브랜치 | `feat/zuirock-mvp` (push하면 Render가 자동 배포). 저장소 `github.com/gymdong/zuirock` |
| 로그인 | 카카오 동작 확인. 네이버·Google은 키 미설정(503 "준비 중") — 시연엔 불필요 |
| 문제 | 600개 공개됨(상식·역사·어휘력·과학 각 150, 난이도 ★1~5 0.5단위, 초성60/객관식61/OX29). 파일은 `content/incoming/*_questions.json` |
| 회원 A(시연 계정) | 사용자 본인 카카오 계정(닉네임 김동현, 관리자). 개발용 로그인은 운영에서 404 |
| 환경 변수(Render) | `NODE_ENV=production, PUBLIC_ORIGIN, DATABASE_URL(pooled+pgbouncer), DIRECT_URL, REDIS_URL, JWT_SECRET, STATE_SECRET, GUEST_TOKEN_SECRET, KAKAO_CLIENT_ID/SECRET`, 시연 준비 기간엔 `DEMO_SEED=1`. **`DEV_LOGIN`은 절대 넣지 않는다**. 값은 사용자가 Render 대시보드에만 입력 |
| 시연 데이터 | 관리자 화면 `/admin/` → "시연 데이터" → `초기화` 입력 → 호출한 계정에 시연 상태 적용(약 6초, 확인표 ✓). 리허설 후/시연 직전에 사용. 끝나면 `DEMO_SEED` 제거 |

## 3. 완료된 작업
- 계약·모노레포: pnpm+Turborepo, Prisma 6, NestJS 12 ESM, Expo SDK 57(웹 output "single"), 공용 타입 `packages/shared`
- 규칙 `packages/game-rules`: 점수·XP(일일 상한 3000, 7일 감쇠)·게스트 병합·종합 세트 배분(D6-10 (c))·스트릭·초성 판정·리포트·상자 보상·아이템 도우미 (386 테스트)
- 서버: 인증(카카오 우선, PKCE, 게스트 서명 토큰), 솔로(스테이지/레벨테스트/종합/3분 지식/퀘스트), XP·치즈·스트릭, 리포트·약점, 게스트 병합, 오류 신고, 기록 삭제·탈퇴, 친구, 캐릭터·치즈 구매, **상점·소모 아이템·스테이지 상자·연속학습 달력**, 관리자 API(일괄 공개 `bulk-transition`), 정적 서빙, **시연 시드(`DEMO_SEED`)** (103 테스트)
- 실시간: 방 엔진, 버전 CAS+임대 펜스, 재접속, 결과 기록 재시도, 초대함. **초성 힌트 = 화면의 남은 시간이 N초가 될 때** (D-R2-1), 난이도 0.5단위
- 클라이언트: 목업 16화면 + 상점·연속학습·설정, 대결 연출·카운트다운 타이머·문제 수/난이도 막대·애니메이션, 뒤로가기 정리, **효과음 13개+로비 배경음(직접 합성, 저작권 없음, `docs/audio.md`)**
- 관리자 웹: 문제 업로드·검수·일괄 선택 공개·시연 데이터 페이지·자동 로그인
- 검증: `pnpm e2e:local`(6 passed), 전체 22개 작업 통과, Docker 이미지 기동, 운영 DB 증분 마이그레이션(기존 데이터 보존) 확인

## 4. 남은 일 (우선순위 순) — 일정 10/19→10/29
1. **사용자 피드백 반영**: 배포된 앱을 써 보고 새 피드백이 오면 `docs/feedback-round2.md` 형식(결정·기본값·성공 기준·담당)으로 정리해 레인에 지시. 새 기능은 **10/27 동결 전**까지
2. **문제 검수 계속**: 450개 중 약 44개만 사실 확인함(전부 정확). 관리자 화면에서 연도·수치·순화어·법률 문제를 추가 확인(사용자 작업)
3. **iPhone USB 설치(10/25 이후)**: `docs/ios-build.md`. 사용자가 Xcode에 Apple ID 로그인, iPhone 개발자 모드·USB 신뢰 필요. 7일 만료 → 10/28에 재설치. 앱에서의 카카오 왕복·소리·막대 터치는 **실기기 미확인**
4. **리허설 2회**(10/27·28): `docs/demo-runbook.md`의 순서. 대결 1(과학만, E2E 판정) → 판정 5가지 확인 → 대결 2(상식·역사·과학 쇼케이스). 시연 30분 전 워밍업, UptimeRobot 확인
5. 시연 이후로 미룬 것: 네이버·Google 로그인, 대기실에서 방 설정 변경, 초대 만료 표시·속도 제한, `publishedById` 기록, 관리자 화면 컴포넌트 테스트, 개발용 문제 fixture 정리

## 5. 자르는 순서 (일정이 밀릴 때)
배경음 → 좋은 상자 차등 → 일부 효과음 → 세부 연출 → 상점의 보호권 외 상품 → 친구/초대함 → 캐릭터 UI. **절대 자르지 않는 것**: 방 만들기·게스트 링크·대결·결과·게스트 병합·리포트·약점·종합 세트·시드·배포·카카오 로그인·E2E 경로.

## 6. 결정 사항 (사용자 확정)
- 크로스플랫폼 앱+웹(Expo 한 코드베이스). 시연: 회원=iPhone(USB 설치, 무료 Apple ID), 게스트=다른 기기 브라우저. Android APK·TestFlight는 하지 않음(키스토어는 만들어 둠, 사용 안 함)
- 무료 서비스만 사용. 주제 레벨은 솔로 스테이지로만 오름. 스테이지 XP는 **최초 클리어에만**. 상자도 최초 클리어에만
- 과학 세부 분야: 물리·화학·생물·**지구**. 솔로 아이템은 솔로 한정(쓰면 그 문제 노힌트 보너스 없음)
- 종합 세트: 오답률 상위 2개 주제 50% / 나머지 50%, 각 그룹 안에서 오답률 비례(주제 ≤3개면 전체 오답률 비례)
- 상점 가격(설정 파일): 보호권 50, 첫 글자 공개권 15, 오답 제거권 15. 소모 아이템 99개 상한 초과 시 치즈 15로 전환

## 7. 문서 지도
- `docs/feedback-round2.md` (2차 피드백 요구사항·계약) / `docs/api-admin.md`, `docs/api-economy.md` (API) / `docs/contracts.md` (패키지·레인 규칙) / `docs/demo-runbook.md`, `docs/manual-qa-checklist.md` / `docs/ios-build.md`, `docs/android-build.md` / `docs/navigation.md`, `docs/audio.md`
- `docs/archive/plan-v5.md`(구현 계획, 일정·ADR·AC 매핑), `docs/archive/spec-interview.md`(20라운드 인터뷰 스펙, 성공 기준 AC-*)
- 문제 제작: `content/GUIDE.md`, `content/prompts/claude-question-template.md`(한 주제 한 번에 요청 블록), `content/schema/question.schema.json`(선택 항목 `no` 허용)

## 8. 자주 쓰는 명령 (저장소 루트 `~/dev/zuirock`; `~/Documents/zui`는 이곳을 가리키는 링크)
- 전체 검증: `pnpm turbo run typecheck lint test`
- 로컬 E2E 한 번에(서버 기동·시드·Playwright·정리): `docker compose -f infra/docker-compose.yml up -d --wait` 후 `pnpm e2e:local` (Docker는 이때만 필요, 끝나면 `docker compose down`/Docker Desktop 종료)
- 문제 형식 검사: `pnpm import:questions --dry-run content/incoming`
- 푸시 전: **Docker 이미지 빌드·기동 확인**(`docker build -f infra/Dockerfile -t zuirock:local .`) — 패키지 추가 시 Dockerfile 목록 누락으로 Render 빌드가 깨진 적 있음
- DB 테스트는 각자 `TEST_DATABASE_URL=...zuirock_test_<이름>` 사용(공유하면 교착/401 오류)

## 9. 작업 방식 (에이전트 팀)
- 레인: LA 규칙(`packages/game-rules`), LB 서버 REST(`apps/server/src/modules/*`, prisma 마이그레이션은 LB만), LC 실시간(`modules/rooms`), LD 클라이언트(`apps/mobile`), LE 관리자·콘텐츠(`apps/admin`, import), LF 인프라·시드·QA(`infra`, `e2e`, `scripts/seed`, docs), LG 경제 UI·오디오. 레인은 자기 디렉터리만 수정, 커밋은 리드만
- 의존성 설치는 `.omc/state/pnpm.lock` 디렉터리 잠금 후 한 번에 하나, 필터 설치 뒤에는 루트에서 `pnpm i`
- **사용량 한도가 여러 번 작업을 끊었다.** 동시에 3~4개 레인만 돌리고, 지시에 "토큰 절약"을 넣고, 한도 후 재개 시 로컬 임시 커밋(`wip`)으로 보존한 뒤 이어서 시킨다
- 레인 보고는 그대로 믿지 말고 리드가 테스트·E2E를 직접 다시 돌려 확인한다(이번에도 실서버 연결 확인으로 서버 버그 2건을 찾음)

## 10. 알려진 한계·확인 필요
- 효과음 품질(귀로 확인 필요), 좋은 상자 열기 연출(레벨 5의 배수 첫 클리어 때 확인), iPhone 실기기 동작 전반
- 웹 배경음 `AbortError: play() interrupted` 콘솔 경고(무해)
- `packages/shared` 타입 검사에 `ajv/dist/2020.js` 관련 테스트 전용 오류(빌드 영향 없음, 이전부터 존재)
- 시드 계정의 XP는 0에서 시작(대량 삽입으로 속도 확보). 시연 판정 수치에는 영향 없음
- 무료 플랜 한도(Render 750시간/월, Neon 컴퓨트 시간)를 확인하지 못했다. UptimeRobot은 DB를 깨우지 않는 `/api/health`만 호출
