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
- `SSH 외부포트` -> 홈서버 `22` (외부포트 변경 권장)

### 3.2 DNS

- `api.example.com` -> 집 공인 IP 또는 DDNS
- `www.example.com` -> Vercel 프로젝트에 연결

주의:
- TLS 인증서 발급은 Caddy가 80/443 접근 가능해야 정상 동작합니다.

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
3. SSH로 홈서버 접속
4. `git pull --ff-only`
5. 필요 시 `.env.prod` 갱신
6. `./deploy/homeserver/blue_green_deploy.sh` 실행

### 7.2 GitHub Actions 시크릿

`Repository -> Settings -> Secrets and variables -> Actions`

필수:

- `HOME_HOST`: 공인 IP 또는 DDNS
- `HOME_SSH_USER`: 서버 사용자
- `HOME_SSH_PRIVATE_KEY`: 배포용 개인키
- `HOME_APP_DIR`: 예) `/home/aquila/app`

선택:

- `HOME_SSH_PORT`: 기본 `22`
- `HOME_KNOWN_HOSTS`: `ssh-keyscan -H <HOME_HOST>` 결과
- `HOME_SERVER_ENV`: `.env.prod` 전체 멀티라인 값

`HOME_SERVER_ENV`를 사용하면 배포 시 `.env.prod`를 자동 동기화할 수 있습니다.

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
7. `.active_backend` 상태 파일 갱신
8. 이전 active backend 정지

### 8.3 헬스체크 튜닝 변수

스크립트는 다음 환경변수를 지원합니다.

- `HEALTHCHECK_PATH` (기본 `/`)
- `HEALTHCHECK_RETRIES` (기본 `45`)
- `HEALTHCHECK_INTERVAL_SECONDS` (기본 `2`)

기본값 기준 최대 대기 시간은 약 90초입니다.

### 8.4 왜 다운타임이 줄어드는가

- 기존 active는 유지한 채 새 색상을 먼저 올립니다.
- 새 색상 준비 완료 후에만 라우팅을 바꾸므로 요청 끊김 구간이 짧습니다.
- 장애가 나면 전환 이전 단계에서 실패하므로 트래픽이 기존 색상에 남습니다.

---

## 9. 롤백 방법

### 9.1 가장 빠른 롤백

실패 직후 `main`을 이전 정상 커밋으로 되돌리고 push:

```bash
git revert <bad_commit_sha>
git push origin main
```

새 워크플로가 실행되면서 반대 색상에 이전 버전이 올라가고, 다시 전환됩니다.

### 9.2 서버에서 즉시 수동 전환

긴급 시 서버에서 스크립트를 다시 1회 실행하면 반대 색상으로 다시 스위치합니다.

```bash
cd ~/app
./deploy/homeserver/blue_green_deploy.sh
```

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

- DB dump 백업 자동화
- 볼륨 백업 정책 수립
- SSH 키/시크릿 회전
- 장애 복구 리허설

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

- `HOME_SSH_PRIVATE_KEY` 줄바꿈 손상 여부 확인
- `HOME_KNOWN_HOSTS` 재생성
- 서버 하드닝 적용 시 포트/유저가 시크릿과 일치하는지 확인

### 12.3 API 502/504

```bash
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs caddy
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_blue
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_green
```

추가 점검:

- `deploy/homeserver/Caddyfile` upstream이 의도한 색상을 가리키는지
- `.active_backend` 값이 실제 의도와 맞는지

### 12.4 헬스체크 타임아웃

- 앱 기동 시간이 긴 경우 재시도 증가

```bash
HEALTHCHECK_RETRIES=90 HEALTHCHECK_INTERVAL_SECONDS=2 ./deploy/homeserver/blue_green_deploy.sh
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
