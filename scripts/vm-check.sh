#!/usr/bin/env bash
# 학교 클라우드 VM이 쥐락펴락을 돌릴 수 있는지 점검한다 (읽기만 하고 아무것도 바꾸지 않는다).
# 사용: bash scripts/vm-check.sh [DB 호스트 이름(선택)]
#   DB 호스트는 Neon 연결 문자열의 @ 뒤 ~ / 앞 부분(예: ep-xxx.ap-southeast-1.aws.neon.tech). 비밀번호는 넣지 않는다.
# 결과를 그대로 복사해 알려줘도 된다(비밀 값은 출력하지 않는다).
set -u
DB_HOST="${1:-}"
ok()   { printf '  [ OK ] %s\n' "$*"; }
warn() { printf '  [확인] %s\n' "$*"; }
bad()  { printf '  [문제] %s\n' "$*"; }

echo "== 기본 정보"
echo "  CPU 구조: $(uname -m)   (x86_64 이면 GitHub 자동 빌드 이미지를 그대로 쓴다. aarch64 면 알려 주세요)"
echo "  OS: $(. /etc/os-release 2>/dev/null && echo "$PRETTY_NAME")"
echo "  CPU 코어: $(nproc)   메모리: $(free -h | awk '/^Mem:/{print $2" (사용 가능 "$7")"}')   스왑: $(free -h | awk '/^Swap:/{print $2}')"
echo "  디스크(/): $(df -h / | awk 'NR==2{print $2" 중 "$4" 남음"}')"
echo "  사용자: $(id -un)   시각: $(date '+%Y-%m-%d %H:%M:%S %Z')"

echo "== 관리자 권한(sudo)"
if sudo -n true 2>/dev/null; then ok "비밀번호 없이 sudo 가능"; else warn "sudo 가 막혀 있거나 비밀번호가 필요해요 (Docker 설치에 필요)"; fi

echo "== Docker"
if command -v docker >/dev/null 2>&1; then
  ok "docker: $(docker --version 2>&1)"
  if docker info >/dev/null 2>&1; then ok "docker 사용 가능(권한 OK)"; else warn "docker 는 있으나 이 사용자는 못 써요 → sudo usermod -aG docker \$USER 후 다시 접속"; fi
  if docker compose version >/dev/null 2>&1; then ok "docker compose: $(docker compose version --short 2>&1)"; else warn "docker compose 없음 (docker-compose-v2 설치 필요)"; fi
else
  warn "docker 가 설치돼 있지 않아요 (docs/vm-deploy.md 4단계)"
fi

echo "== 바깥 인터넷 (서버가 직접 접속하는 곳)"
check_url() { # 이름 URL
  local code; code=$(curl -s -o /dev/null -m 8 -w '%{http_code}' "$2" 2>/dev/null || echo 000)
  if [ "$code" != "000" ]; then ok "$1 접속 가능 (HTTP $code)"; else bad "$1 접속 불가 ($2)"; fi
}
check_url "카카오 로그인(kauth.kakao.com)" "https://kauth.kakao.com"
check_url "카카오 API(kapi.kakao.com)" "https://kapi.kakao.com"
check_url "GitHub(코드·이미지 받기)" "https://github.com"
check_url "GitHub 이미지 저장소(ghcr.io)" "https://ghcr.io/v2/"
check_url "Docker 이미지 저장소(registry-1.docker.io, redis 이미지용)" "https://registry-1.docker.io/v2/"
if [ -n "$DB_HOST" ]; then
  if (exec 3<>"/dev/tcp/$DB_HOST/5432") 2>/dev/null; then ok "DB($DB_HOST:5432) 접속 가능"; else bad "DB($DB_HOST:5432) 접속 불가 → VM 안에 Postgres 를 둬야 해요(docs/vm-deploy.md 5단계 B)"; fi
else
  warn "DB 호스트를 넘기지 않아 DB 접속은 건너뜀 (bash scripts/vm-check.sh <호스트>)"
fi

echo "== 이미 쓰고 있는 포트"
(ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | awk 'NR>1{print "  "$4}' | sort -u | head -15

echo "== 끝. 위 내용을 그대로 복사해서 알려 주세요."
