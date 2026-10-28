# 학교 클라우드 VM 배포 (동아 클라우드 `cloud.dauai.org`)

Render 와 같은 서비스를 학교 VM 에도 올린다. 시연 전까지는 **Render 를 끄지 않고 백업으로 둔다**. 학교 안내서(`DHub_Getting_Started.pdf`, 저장소에는 올리지 않음)의 흐름을 따른다.

구성: VM 한 대에 `앱`(API·웹·관리자·실시간 대결을 한 포트 3000) + `Redis`(대결 방 상태). DB 는 지금 쓰는 Neon 을 그대로 쓴다(막히면 5단계 B).
이미지는 VM 에서 만들지 않고 GitHub Actions 가 만든다(앱 빌드가 메모리를 많이 써서 VM 에서 만들면 죽을 수 있다).

## 1. VM 만들기 (cloud.dauai.org > VM > VM 생성)
| 항목 | 선택 |
|---|---|
| 클러스터 노드 | 자동 |
| VM 이름 | **한 번 정하면 바꾸기 어려운 값.** 주소(학교 안내서 예: `https://VM-ID.apps.dauai.org/`, 정확한 모양은 VM 상세보기에 나온다)에 들어가고, 카카오 설정과 iPhone 앱에 박힌다. 짧은 영어 소문자(예: `zuirock`) |
| 운영체제 | Ubuntu |
| 메모리 | 8GB (4GB 로도 돌지만 Docker·로그·갑작스러운 접속 증가에 여유가 없다) |
| GPU | 없음 |
| 스토리지 | 32GB |
생성에 몇 분 걸린다. 끝나면 VM 상세보기에서 **키 받기**(`.key` 파일)로 접속 키를 받는다. 이 키는 비밀번호와 같다: 메신저·GitHub·대화창에 올리지 않는다.

## 2. VS Code 로 접속 (학교 안내서 8~12쪽)
1. VS Code 확장에서 **Remote - SSH** 설치
2. 받은 키를 `~/.ssh/` 로 옮기고(맥), 키 파일 권한을 `chmod 600 ~/.ssh/<키 파일>`로 줄인다
3. VM 상세보기의 `~/.ssh/config` 내용을 `~/.ssh/config` 에 붙여 넣고 저장
4. VS Code 왼쪽 아래 `><` 아이콘 > Connect to Host > 내 VM 선택 > OS 는 Linux
5. 열린 VS Code 창에서 **터미널**(메뉴 Terminal > New Terminal)을 연다. 이후 명령은 모두 이 터미널(=VM)에서 입력한다

## 3. VM 점검 (결과를 알려 주세요)
```sh
git clone -b feat/zuirock-mvp https://github.com/gymdong/zuirock.git
cd zuirock
bash scripts/vm-check.sh <Neon 호스트>
```
- `<Neon 호스트>` = Neon 연결 문자열에서 `@` 뒤 `/` 앞 부분(`ep-…neon.tech`). 비밀번호는 넣지 않는다
- 출력 전체를 복사해서 알려 주세요(비밀 값은 출력되지 않는다). `[문제]`가 있으면 그에 맞춰 단계를 바꾼다

### 3-1. WebSocket 통과 시험 (가장 중요)
우리 대결은 WebSocket 만 쓴다. 학교 프록시가 막으면 로그인·솔로는 되는데 **대결만 안 된다.** 서비스를 올리기 전에 먼저 본다.
1. VM 터미널: `python3 scripts/vm-ws-test.py 3000` (켜 둔 채로 둔다)
2. VM 상세보기 **포트 칸에 3000 입력 후 저장** (아직 아무것도 안 올렸어도 된다)
3. 내 Mac 터미널(저장소 폴더): `node scripts/ws-check.mjs wss://<VM 주소>`
   - `WebSocket OK` → 통과. VM 터미널에서 Ctrl-C 로 시험 서버를 끈다
   - `FAIL` → 알려 주세요. 프록시 쪽 설정(운영자 문의)이나 대안을 정한다
   - 브라우저에서 `https://<VM 주소>` 를 열면 `http ok (...)` 가 보이는 것도 확인(HTTPS 가 열린다는 뜻)

## 4. Docker 설치 (점검에서 `docker 없음`일 때만)
```sh
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```
터미널을 닫았다 다시 열고 `docker compose version` 이 나오면 된다. `docker-compose-v2` 를 못 찾으면 알려 주세요(다른 설치 방법이 있다).

## 5. 환경 변수 파일 만들기
```sh
cd ~/zuirock/infra/vm
cp .env.example .env
```
VS Code 에서 `infra/vm/.env` 를 열어 채운다. **비밀 값은 대화창에 붙여 넣지 말고 이 파일에만 둔다.**
- `PUBLIC_ORIGIN` = VM 의 실제 주소(`https://…apps.dauai.org`, 끝에 `/` 없이)
- **A. 지금 Neon DB 를 그대로 쓸 때(권장)**: Neon 대시보드 > Connect 에서 `DATABASE_URL`(pooled)과 `DIRECT_URL`(direct)을 복사해 붙여 넣는다. 문제·회원·관리자 계정이 그대로 있다
- **B. VM 안에 Postgres 를 둘 때**(점검에서 DB 접속이 `[문제]`일 때): `POSTGRES_PASSWORD` 를 정하고 `DATABASE_URL=DIRECT_URL=postgresql://zuirock:<비밀번호>@postgres:5432/zuirock`. 실행은 `docker compose --profile local-db up -d`. 데이터가 비어서 시작하므로 문제 JSON 을 관리자 화면에서 다시 올려야 한다(`content/incoming/*.json`)
- `JWT_SECRET`, `STATE_SECRET`, `GUEST_TOKEN_SECRET`: 터미널에서 `openssl rand -base64 32` 를 세 번 실행해 각각 붙여 넣는다. (Render 와 **같은 DB 를 같이 쓰는 동안** 한쪽에서 만든 로그인이 다른 쪽에서도 되게 하려면 Render 의 값과 같게 해야 한다. 같게 할 필요가 없으면 새로 만들어도 된다 — 다만 회원이 두 곳에서 다시 로그인해야 한다)
- `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET`: Render 대시보드 > zuirock > Environment 에서 값을 복사해 붙여 넣는다

## 6. 이미지 만들기 (GitHub 에서)
`vm-image` 워크플로는 `feat/zuirock-mvp` 브랜치에만 있어서 GitHub Actions 화면의 왼쪽 목록에는 안 보일 수 있다(수동 실행 워크플로는 기본 브랜치 `main` 의 파일만 목록에 나온다). 둘 중 하나로 실행한다.
- **Claude 에게 요청(권장)**: "VM 주소는 https://…apps.dauai.org 야, 이미지 만들어 줘"라고 하면 Claude 가 아래 명령을 대신 실행하고 끝날 때까지 확인한다
- **직접**(터미널, 저장소 폴더에서, `gh` 로그인 필요): `gh workflow run vm-image.yml --ref feat/zuirock-mvp -f public_origin=https://<VM 주소>` 그다음 `gh run watch` 로 진행을 본다

5~10분 걸린다. 처음 한 번만: https://github.com/gymdong?tab=packages 에서 `zuirock` 패키지 > Package settings > **Change visibility > Public**. (이미지에는 비밀 값이 없다. 공개로 해 두면 VM 에서 로그인 없이 받을 수 있다)
주소가 바뀌면 이미지를 다시 만들어야 한다(주소가 앱 화면에 박혀 있다).

## 7. 실행
```sh
cd ~/zuirock/infra/vm
docker compose pull
docker compose up -d          # B 방식이면: docker compose --profile local-db up -d
docker compose ps             # app, redis 가 healthy 이면 성공
docker compose logs -f app    # 로그 보기 (Ctrl-C 로 빠져나옴, 앱은 계속 돈다)
```
- VM 상세보기 **포트 칸이 3000 으로 등록**돼 있는지 확인(3-1 에서 이미 했다면 그대로)
- 브라우저에서 `https://<VM 주소>/api/health` → `{"status":"ok"...}`
- `restart: unless-stopped` 라서 VM 이 다시 켜져도 자동으로 올라온다

## 8. 카카오 로그인 연결
카카오 개발자 콘솔 > 내 애플리케이션 > 카카오 로그인 > **Redirect URI** 에 추가(기존 Render 주소는 지우지 않는다):
`https://<VM 주소>/api/auth/kakao/callback`

## 9. 확인표
- [ ] 브라우저로 VM 주소를 열면 로그인 화면이 나온다
- [ ] 카카오 로그인이 된다
- [ ] 방을 만들어 두 기기(또는 브라우저 두 개)가 같은 방에 들어가 대결이 끝까지 된다 (WebSocket)
- [ ] 관리자(`/admin/`)에 들어가진다
- [ ] 재시작: `docker compose restart` 후에도 로그인이 유지되고 서비스가 올라온다

## 10. iPhone 앱
서버 주소는 앱을 만들 때 박힌다. 새 VM 을 쓰려면 `docs/ios-build.md` 1절의 `PUBLIC_ORIGIN` 을 **VM 주소**로 바꿔 다시 빌드·설치한다(11/2 재설치 때 한 번에). 카카오 로그인은 8단계가 끝나야 된다.

## 11. 운영 중 자주 쓰는 명령
| 하고 싶은 일 | 명령(`~/zuirock/infra/vm` 에서) |
|---|---|
| 새 코드 반영 | 6단계로 이미지를 다시 만들고 `docker compose pull && docker compose up -d` |
| 재시작 | `docker compose restart app` |
| 끄기 | `docker compose down` (Redis 데이터는 남는다. 지우려면 `down -v`) |
| 최근 로그 | `docker compose logs --tail 100 app` |
| 디스크 정리 | `docker image prune -f` |
| 메모리 확인 | `free -h`, `docker stats --no-stream` |

## 막혔을 때
- **브라우저에 502/연결 거부**: `docker compose ps` 로 app 이 살아 있는지, `docker compose logs --tail 50 app` 로 오류 확인. 포트 칸이 3000 인지 확인
- **로그인 화면은 뜨는데 카카오 로그인이 실패**: 8단계 Redirect URI 철자 확인(끝에 `/` 없음)
- **대결 방에 못 들어감/계속 연결 중**: 3-1 시험을 다시 해 본다. `WebSocket OK` 인데도 안 되면 `docker compose logs app` 를 알려 주세요
- **앱이 시작하다 죽음(`DIRECT_URL is not set` 등)**: `.env` 에서 빈 값 확인
- **Neon 접속 오류**: Neon 은 쓰지 않으면 잠들 수 있다. 대시보드에서 DB 가 Active 인지 확인
