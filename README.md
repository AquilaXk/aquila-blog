# Aquila Blog 홈서버 운영 가이드 (처음 구축 -> 무중단 배포)

이 문서는 현재 저장소 구성을 기준으로, 안 쓰는 노트북(또는 미니PC)을 홈서버로 구성하고 `Vercel(Front) + Home Server(Back/DB/Redis/Caddy) + GitHub Actions(CI/CD)` 형태로 운영하는 전체 과정을 설명합니다.

핵심 목표는 다음 2가지입니다.
- `main` 브랜치 push 시 자동 배포
- Blue/Green 전환으로 API 다운타임 최소화

---

## 0. 이 프로젝트의 실제 운영 구성

### 0.1 아키텍처

- Front: `front/` -> Vercel 배포
- Back/API: `back/` -> 홈서버 Docker Compose
- DB/Redis: 홈서버 Docker Compose 내부 네트워크
- Reverse Proxy + TLS: Caddy
- CI/CD: GitHub Actions가 홈서버에 SSH 접속해서 배포

요약 흐름:

1. 개발자가 `main`에 push
2. GitHub Actions `test` 잡 실행
3. 테스트 성공 시 `deploy` 잡 실행
4. 홈서버에서 `deploy/homeserver/blue_green_deploy.sh` 실행
5. 비활성 색상 backend 기동 -> 헬스체크 통과 -> Caddy upstream 전환 -> 이전 색상 종료

### 0.2 관련 파일

- 배포 워크플로: `.github/workflows/deploy.yml`
- 홈서버 Compose: `deploy/homeserver/docker-compose.prod.yml`
- Caddy 설정: `deploy/homeserver/Caddyfile`
- 배포 스크립트: `deploy/homeserver/blue_green_deploy.sh`
- 운영 환경 변수 예시: `deploy/homeserver/.env.prod.example`
- 보안 하드닝: `deploy/homeserver/HARDENING.md`

---

## 1. 사전 준비

### 1.1 준비물 체크리스트

- Ubuntu Server 24.04 LTS 설치된 장비 1대
- 도메인 1개 (예: `example.com`)
- GitHub 저장소 접근 권한
- 공유기 포트포워딩 설정 권한
- Vercel 계정

### 1.2 권장 네이밍

- Front 도메인: `www.example.com`
- API 도메인: `api.example.com`
- 서버 앱 경로: `/home/<user>/app`

---

## 2. 홈서버 기본 세팅

Ubuntu 기준:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git docker.io docker-compose-plugin curl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

재로그인 후 확인:

```bash
docker --version
docker compose version
```

---

## 3. 네트워크 및 DNS

### 3.1 공유기 포트포워딩

- `80` -> 홈서버 `80`
- `443` -> 홈서버 `443`
- `SSH 외부포트` -> 홈서버 `22` (외부포트 변경 권장, `Tailscale` 사용 시 생략 가능)

Cloudflare Tunnel을 사용하면 `80/443` 포트포워딩 없이도 public HTTPS 운영이 가능합니다.

### 3.2 DNS

- `api.example.com` -> 집 공인 IP 또는 DDNS
- `www.example.com` -> Vercel 프로젝트에 연결

주의:
- TLS 인증서 발급은 Caddy가 80/443 접근 가능해야 정상 동작합니다.
  - 단, Cloudflare Tunnel 모드에서는 Caddy가 직접 인증서를 발급하지 않으므로 이 제약이 사라집니다.

### 3.3 Cloudflare Tunnel 모드 (권장)

1. Cloudflare Zero Trust에서 Tunnel 생성
2. Public Hostname 추가
   - Hostname: `api.example.com`
   - Service: `http://caddy:80`
3. 발급된 Tunnel token을 `.env.prod`의 `CF_TUNNEL_TOKEN`에 설정
4. 배포 시 `cloudflared` 컨테이너가 자동 기동되어 외부 트래픽을 Caddy로 전달

---

## 4. 서버에 프로젝트 배치

```bash
mkdir -p ~/app
cd ~/app
git clone <YOUR_REPO_URL> .
cp deploy/homeserver/.env.prod.example deploy/homeserver/.env.prod
```

### 4.1 `.env.prod` 필수 값

아래 값은 반드시 수정하세요.

- `API_DOMAIN`
- `CADDY_EMAIL`
- `PROD___SPRING__DATASOURCE__PASSWORD`
- `PROD___SPRING__DATA__REDIS__PASSWORD`
- `CUSTOM_PROD_COOKIEDOMAIN`
- `CUSTOM_PROD_FRONTURL`
- `CUSTOM_PROD_BACKURL`

Cloudflare Tunnel 모드 사용 시 추가:

- `CF_TUNNEL_TOKEN`

권장 추가:

- `CUSTOM__JWT__SECRET_KEY`를 충분히 긴 랜덤 문자열로 설정
- `CUSTOM__SYSTEM_MEMBER_API_KEY` 변경

---

## 5. 보안 하드닝 (강력 권장)

문서: `deploy/homeserver/HARDENING.md`

실행:

```bash
cd ~/app
sudo ./deploy/homeserver/hardening/setup_hardening.sh 22 <your_linux_user>
```

적용 내용:

- SSH root 로그인 차단
- SSH 비밀번호 로그인 차단 (키 로그인만 허용)
- `AllowUsers` 제한
- UFW 최소 포트 허용
- fail2ban 적용

검증:

```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
sudo sshd -t
```

중요:
- SSH 포트를 바꿨다면 GitHub Actions 시크릿 `HOME_SSH_PORT`도 반드시 같은 값으로 맞춰야 합니다.

---

## 6. 1회 수동 배포로 동작 확인

최초 1회는 CI/CD 전에 직접 실행해서 상태를 확인합니다.

```bash
cd ~/app
./deploy/homeserver/blue_green_deploy.sh
```

확인:

```bash
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps
curl -I https://api.example.com
```

정상 시 기대:
- Caddy, db_1, redis_1, back_blue/back_green 중 1개 색상 active
- `curl -I`가 2xx/3xx/4xx 응답 (TLS handshake 포함)

---

## 7. GitHub Actions CI/CD 연결

### 7.1 워크플로 개요

`.github/workflows/deploy.yml`는 다음 순서로 동작합니다.

1. `test` 잡
2. backend 테스트 성공 시 `deploy` 잡
3. (권장) Tailscale 네트워크 연결 후 SSH로 홈서버 접속
4. `git pull --ff-only`
5. 필요 시 `.env.prod` 갱신
6. `./deploy/homeserver/blue_green_deploy.sh` 실행

### 7.2 GitHub Actions 시크릿

`Repository -> Settings -> Secrets and variables -> Actions`

필수:

- `HOME_SSH_HOST`: 홈서버 주소(공인 IP/DDNS 또는 Tailscale IP/호스트명)
- `HOME_SSH_USER`: 서버 사용자
- `HOME_SSH_KEY`: 배포용 개인키
- `HOME_APP_DIR`: 예) `/home/aquila/app`
- `TS_AUTHKEY`: Tailscale auth key (권장)

선택:

- `HOME_SSH_PORT`: 기본 `22`
- `HOME_KNOWN_HOSTS`: `ssh-keyscan -p <HOME_SSH_PORT> -H <HOME_SSH_HOST>` 결과
- `HOME_SERVER_ENV`: `.env.prod` 전체 멀티라인 값
- `HOME_HEALTHCHECK_URL` (선택): 모니터링 워크플로 헬스체크 URL (기본 `https://api.aquilaxk.site/actuator/health`)
- `HOME_ALERT_WEBHOOK_URL` (선택): 장애 알림 Webhook URL

`HOME_SERVER_ENV`를 사용하면 배포 시 `.env.prod`를 자동 동기화할 수 있습니다.

호환용(구 이름):

- `HOME_HOST`: `HOME_SSH_HOST`를 대체하는 구 이름
- `HOME_SSH_PRIVATE_KEY`: `HOME_SSH_KEY`를 대체하는 구 이름
- `HOME_TAILSCALE_HOST` 또는 `HOME_TS_HOST`: Tailscale 호스트를 별도로 분리해 쓰고 싶을 때

주의(중요):

- 워크플로의 실제 host 우선순위는 `HOME_TAILSCALE_HOST -> HOME_TS_HOST -> HOME_SSH_HOST -> HOME_HOST` 입니다.
- 과거 시크릿 값이 남아 있으면 의도와 다른 host로 접속을 시도할 수 있으므로, 사용하지 않는 host 시크릿은 비우거나 삭제하세요.
- `HOME_APP_DIR`는 서버에 실제로 존재하는 Git 저장소 경로여야 합니다. (예: `/home/aquila/app`)
- `HOME_APP_DIR` 시크릿 값에는 따옴표/개행/앞뒤 공백을 넣지 마세요.

### 7.3 Tailscale 기반 배포(포트포워딩 문제 우회)

공유기/회선 환경에서 SSH 인바운드가 불안정하면 Tailscale 경로를 권장합니다.

홈서버:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
tailscale ip -4
```

GitHub 시크릿:

- `TS_AUTHKEY` 추가
- `HOME_SSH_HOST`에 홈서버의 Tailscale IP(또는 MagicDNS 호스트명) 입력

이 경우 `HOME_SSH_PORT`는 기본 `22`를 사용하면 됩니다.

---

## 8. Blue/Green 무중단 배포 동작 원리

### 8.1 서비스 구성

`deploy/homeserver/docker-compose.prod.yml` 기준:

- `back_blue`
- `back_green`
- `caddy`
- `db_1`
- `redis_1`

### 8.2 전환 알고리즘 (`blue_green_deploy.sh`)

스크립트는 아래 순서를 따릅니다.

1. 현재 active backend 판별 (`Caddyfile` 또는 `.active_backend`)
2. 다음 배포 대상 색상 결정
3. `db_1`, `redis_1`, `caddy` 기동 보장
4. 비활성 색상 backend 빌드 및 기동
5. Docker 네트워크 내부 HTTP 헬스체크 수행
6. 헬스체크 성공 시 Caddy upstream 변경 후 reload
7. Caddy 경유 health 검증 실패 시 즉시 upstream 롤백
8. `.active_backend` 상태 파일 갱신
9. 이전 active backend 정지

### 8.3 헬스체크 튜닝 변수

스크립트는 다음 환경변수를 지원합니다.

- `HEALTHCHECK_PATH` (기본 `/`)
- `HEALTHCHECK_RETRIES` (기본 `120`)
- `HEALTHCHECK_INTERVAL_SECONDS` (기본 `2`)
- `CADDY_SWITCH_VERIFY_RETRIES` (기본 `15`)

기본값 기준 backend 대기 시간은 약 240초입니다.

### 8.4 왜 다운타임이 줄어드는가

- 기존 active는 유지한 채 새 색상을 먼저 올립니다.
- 새 색상 준비 완료 후에만 라우팅을 바꾸므로 요청 끊김 구간이 짧습니다.
- 장애가 나면 전환 이전 단계에서 실패하므로 트래픽이 기존 색상에 남습니다.

---

## 9. 롤백 방법

### 9.1 자동 롤백(기본)

`deploy.yml`은 서버 배포 전에 `deploy/homeserver/.deploy-backups/<timestamp>` 백업을 만들고,
배포 실패 시 같은 백업으로 자동 롤백을 시도합니다.

백업 스크립트:

```bash
./deploy/homeserver/create_deploy_backup.sh
```

롤백 스크립트:

```bash
./deploy/homeserver/rollback_last_deploy.sh
```

### 9.2 Git 기반 롤백

실패 직후 `main`을 이전 정상 커밋으로 되돌리고 push:

```bash
git revert <bad_commit_sha>
git push origin main
```

새 워크플로가 실행되면서 반대 색상에 이전 버전이 올라가고, 다시 전환됩니다.

### 9.3 릴리즈 포인트 롤백

배포 성공 시 GitHub Release(`deploy-<run_id>-<sha7>`)가 자동 생성됩니다.
문제 발생 시 해당 Release의 커밋 기준으로 `revert` 또는 `cherry-pick`해 복구할 수 있습니다.

---

## 10. DB 마이그레이션 규칙 (Expand/Contract)

Blue/Green 무중단에서 DB 변경은 반드시 하위 호환이어야 합니다.

현재 `back/src/main/resources/application-prod.yaml`의 JPA 설정은 `ddl-auto: update` 입니다.
이는 간단한 변경에는 편하지만, 무중단 관점에서는 위험할 수 있습니다.

권장 원칙:

1. Expand
- 컬럼/테이블/인덱스 추가
- 구버전/신버전이 동시에 읽고 쓸 수 있게 유지

2. Migrate
- 애플리케이션을 새 스키마 사용 코드로 배포
- 필요 시 백필 배치 수행

3. Contract
- 구버전 트래픽 0 확인 후 구 스키마 제거

예시 (`nickname` -> `display_name`):

1. `display_name` 추가
2. 코드에서 두 컬럼 모두 처리
3. 데이터 백필
4. 구버전 제거 확인
5. `nickname` 제거

금지 사항:

- 배포와 동시에 컬럼 rename/drop
- 구버전 코드가 참조하는 제약/컬럼 즉시 삭제

---

## 11. 운영 체크리스트

### 11.1 매 배포 전

- `main` 기준 CI 성공 여부 확인
- `.env.prod` 변경 여부 확인
- DB 변경 포함 여부 확인

### 11.2 매 배포 후

- `/` 헬스체크 응답 확인
- 핵심 API 1~2개 수동 호출
- Caddy/backend 로그 확인

### 11.3 정기 작업

- `.deploy-backups` 보관 주기 관리 (예: 7~30일)
- 볼륨 백업 정책 수립
- SSH 키/시크릿 회전
- 장애 복구 리허설
- 모니터링 워크플로(`Monitor Home Server`) 실패 알림 확인

---

## 12. 트러블슈팅

### 12.1 인증서 발급 실패

- DNS A 레코드가 정확한지 확인
- 80/443 포트포워딩 확인
- Caddy 로그 확인

```bash
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs caddy
```

### 12.2 배포 SSH 실패

- `HOME_SSH_KEY`(또는 `HOME_SSH_PRIVATE_KEY`) 줄바꿈 손상 여부 확인
- `HOME_KNOWN_HOSTS` 재생성
- 서버 하드닝 적용 시 포트/유저가 시크릿과 일치하는지 확인
- 포트포워딩이 불안정하면 `TS_AUTHKEY` + Tailscale 경로로 전환

추가 점검(권장):

- 서버 SSH 리슨 확인: `ss -lntp | grep ':22'`
- 서버 SSH 서비스 확인: `sudo systemctl status ssh --no-pager`
- UFW 확인: `sudo ufw status verbose`
- Tailscale 경로로 SSH를 사용할 때는 `sudo ufw allow in on tailscale0 to any port 22 proto tcp` 규칙을 추가하면 문제를 줄일 수 있습니다.

### 12.3 Tailscale `no matching peer` 오류

증상:

- 워크플로 로그에 `tailscale ping ...` 실패
- `no matching peer`

원인:

- GitHub Runner와 홈서버가 서로 다른 Tailnet에 연결됨

해결:

1. 홈서버를 Actions가 사용하는 동일 Tailnet으로 재로그인
2. 홈서버 Tailscale IP 재확인 (`tailscale ip -4`)
3. 시크릿 `HOME_TAILSCALE_HOST`(또는 `HOME_SSH_HOST`)를 새 IP로 갱신

### 12.4 Tailscale SSH `additional check`로 배포 멈춤

증상:

- `Tailscale SSH requires an additional check`
- 브라우저 승인 URL 출력 후 CI 정지

원인:

- Tailnet SSH policy의 `check`(추가 인증) 규칙 때문에 non-interactive CI SSH가 차단됨

해결(권장):

- 홈서버에서 OpenSSH(22)만 사용하도록 Tailscale SSH 비활성화

```bash
sudo tailscale up --ssh=false
```

대안:

- Tailnet ACL/SSH 정책에서 CI 경로의 `check` 요구를 제거

### 12.5 Tailscale ping은 되는데 `direct connection not established`로 실패

증상:

- `tailscale ping -c 3 <HOME_HOST>` 결과에 `pong ... via DERP(...)` 출력
- 마지막에 `direct connection not established`
- 진단 스텝이 `exit code 1`로 실패

원인:

- GitHub Hosted Runner 네트워크 특성상 direct UDP 경로가 자주 성립하지 않음
- DERP 릴레이 경유 자체는 정상 통신인데, `tailscale ping`은 direct 미성립 시 실패 코드를 반환할 수 있음

해결:

- 워크플로에서 `tailscale ping`은 soft-fail 처리
- 최종 성공/실패 기준은 TCP SSH 연결 테스트(`nc -zv` 또는 `/dev/tcp`)로 판정
- 현재 저장소의 `.github/workflows/deploy.yml`에 이미 반영됨

### 12.6 `cd: $HOME_APP_DIR: No such file or directory`

원인:

- `HOME_APP_DIR` 시크릿 경로가 서버 실제 경로와 다름

해결:

1. 서버에서 실제 Git 저장소 경로 확인
2. `HOME_APP_DIR`를 그 경로로 수정 (예: `/home/aquila/app`)
3. 경로 존재 확인

```bash
ls -ld /home/aquila/app
ls -la /home/aquila/app/.git
```

### 12.7 `Cannot connect to the Docker daemon`

증상:

- `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`

원인:

- Docker 데몬 미기동 또는 배포 사용자의 Docker 그룹 권한 누락

해결:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker <deploy_user>
```

그 다음 SSH 세션을 완전히 끊고 재접속 후 확인:

```bash
docker ps
docker compose version
```

### 12.8 API 502/504

```bash
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs caddy
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_blue
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_green
```

추가 점검:

- `deploy/homeserver/Caddyfile` upstream이 의도한 색상을 가리키는지
- `.active_backend` 값이 실제 의도와 맞는지

### 12.9 헬스체크 타임아웃

- 앱 기동 시간이 긴 경우 재시도 증가

```bash
HEALTHCHECK_RETRIES=90 HEALTHCHECK_INTERVAL_SECONDS=2 ./deploy/homeserver/blue_green_deploy.sh
```

### 12.10 Caddy 업스트림 DNS 조회 실패 (`lookup back-blue ...`)

증상:

- `caddy switch verify pending ... status=502` 반복
- Caddy 로그에 `lookup back-blue on 127.0.0.11:53` 오류

원인:

- Caddy upstream 호스트명과 Docker Compose 서비스 DNS 이름이 불일치하거나, 하이픈 별칭 해석이 불안정한 경우

해결:

- upstream을 Compose 서비스명(`back_blue`/`back_green`)과 동일하게 사용
- 배포 스크립트/`Caddyfile`도 같은 표기(`back_blue`/`back_green`)로 통일

점검 명령:

```bash
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps
grep -n "reverse_proxy" deploy/homeserver/Caddyfile
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml exec -T caddy sh -lc "grep -n 'reverse_proxy' /etc/caddy/Caddyfile"
```

---

## 13. 프론트엔드 배포

프론트는 Vercel에서 별도 배포됩니다.

- `front/`를 Vercel 프로젝트와 연결
- 환경변수에서 backend API URL을 `https://api.example.com`으로 설정
- 도메인 `www.example.com` 연결

백엔드 배포와 프론트 배포는 독립적으로 진행됩니다.

---

## 14. 빠른 실행 요약

처음 구축할 때 최소 순서:

1. 서버 Docker 설치
2. 포트포워딩 + DNS 설정
3. 레포 clone + `.env.prod` 작성
4. 하드닝 적용
5. 서버에서 `./deploy/homeserver/blue_green_deploy.sh` 수동 실행
6. GitHub Actions 시크릿 등록
7. `main` push로 자동 배포 검증
8. DB 변경은 expand/contract 원칙으로만 진행

이 순서를 지키면, 현재 저장소 기준으로 홈서버 운영과 Blue/Green 무중단 배포를 안정적으로 시작할 수 있습니다.
