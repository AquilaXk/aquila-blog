# p-14141-1 Home Server Guide

안 쓰는 노트북을 홈서버로 구성해서 `Vercel(Front) + Home Server(Back/DB) + GitHub Actions(CI/CD)`로 운영하는 방법.

## 1. 구성

- Front: `front/` -> Vercel
- Back/API + DB + Redis + Reverse Proxy: 홈서버 Docker Compose
- CI/CD: `main` push 시 GitHub Actions가 홈서버 SSH 배포

사용 파일:
- `deploy/homeserver/docker-compose.prod.yml`
- `deploy/homeserver/Caddyfile`
- `deploy/homeserver/.env.prod.example`
- `.github/workflows/deploy.yml`

## 2. 홈서버 초기 세팅 (노트북)

Ubuntu Server 24.04 LTS 기준.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git docker.io docker-compose-plugin curl
sudo systemctl enable --now docker
sudo usermod -aG docker $USER
```

재로그인 후 Docker 확인:

```bash
docker --version
docker compose version
```

## 3. 포트포워딩/네트워크

공유기에서 홈서버로 포워딩:
- `80` -> `80`
- `443` -> `443`
- `SSH 포트` -> `22` (외부 포트는 변경 권장)

고정 공인 IP가 없으면 DDNS 사용.

## 4. DNS

- `api.yourdomain.com` -> 집 공인 IP(또는 DDNS)
- 프론트 도메인은 Vercel 연결

## 5. 서버 배포 디렉터리 준비

```bash
mkdir -p ~/app
cd ~/app
git clone <YOUR_REPO_URL> .
cp deploy/homeserver/.env.prod.example deploy/homeserver/.env.prod
```

`.env.prod` 필수 수정:
- `API_DOMAIN`
- `CADDY_EMAIL`
- `PROD___SPRING__DATASOURCE__PASSWORD`
- `PROD___SPRING__DATA__REDIS__PASSWORD`
- `CUSTOM_PROD_COOKIEDOMAIN`
- `CUSTOM_PROD_FRONTURL`
- `CUSTOM_PROD_BACKURL`

## 6. 로컬 1회 수동 기동

```bash
cd ~/app
./deploy/homeserver/blue_green_deploy.sh
```

정상 확인:

```bash
docker ps
curl -I https://api.yourdomain.com
```

## 7. GitHub Actions 시크릿 설정

Repository -> Settings -> Secrets and variables -> Actions

필수:
- `HOME_HOST`: 집 공인 IP 또는 DDNS
- `HOME_SSH_USER`: 서버 계정명 (예: `aquila`)
- `HOME_SSH_PRIVATE_KEY`: 배포용 SSH 개인키 전체 내용
- `HOME_APP_DIR`: 서버 앱 경로 (예: `/home/aquila/app`)

선택:
- `HOME_SSH_PORT`: 기본 `22`
- `HOME_KNOWN_HOSTS`: `ssh-keyscan -H <HOME_HOST>` 결과
- `HOME_SERVER_ENV`: `.env.prod` 전체 내용을 멀티라인으로 저장 (권장)

`HOME_SERVER_ENV`를 넣으면 배포 때마다 `.env.prod`를 자동 갱신합니다.

## 8. 자동 배포

`main` 브랜치에 push하면 자동 배포:
1. SSH 접속
2. `git pull`
3. `deploy/homeserver/.env.prod` 갱신(시크릿 사용 시)
4. `./deploy/homeserver/blue_green_deploy.sh` 실행
   - 비활성 색상 백엔드(`back_blue`/`back_green`) 빌드/기동
   - 헬스체크 통과 확인
   - Caddy upstream 전환 + reload
   - 이전 색상 백엔드 정지

## 9. 무중단 배포 포인트

현재 구성은 `back_blue` / `back_green` Blue/Green 방식입니다.

배포 흐름:
1. 현재 활성 색상 반대편에 새 버전 배포
2. 새 버전 헬스체크 성공 확인
3. Caddy upstream을 새 색상으로 전환
4. 이전 색상 정리

주의:
- 헬스체크 경로 기본값은 `/` 이며, 필요 시 서버 환경변수 `HEALTHCHECK_PATH`로 변경 가능
- 헬스체크는 `1xx~4xx`를 정상 응답으로 취급합니다(애플리케이션 보호 정책상 `401/403`이어도 프로세스 기동은 정상으로 간주)
- 완전 무중단을 위해서는 DB 스키마 변경도 backward-compatible 해야 합니다.

## 10. DB 마이그레이션 규칙 (Expand/Contract)

무중단 배포에서는 DB 변경을 한 번에 끝내지 말고 2단계 이상으로 나눕니다.

1) Expand 단계
- 새 컬럼/새 테이블/새 인덱스 추가
- 기존 코드와 새 코드가 동시에 동작 가능하도록 유지
- 절대 기존 컬럼 즉시 삭제/이름변경 금지

2) 애플리케이션 전환
- 새 버전을 Blue/Green으로 배포
- 읽기/쓰기 경로를 점진적으로 새 스키마로 이동

3) Contract 단계
- 구버전 트래픽이 완전히 제거된 뒤
- 더 이상 사용하지 않는 컬럼/인덱스/제약을 정리

예시:
- `nickname` -> `display_name` 변경 시
1. `display_name` 추가 (expand)
2. 코드에서 둘 다 읽고 새 컬럼에도 쓰기
3. 데이터 백필
4. 구버전 제거 후 `nickname` 삭제 (contract)

## 11. 보안 체크리스트

1. SSH 비밀번호 로그인 비활성화 (키 기반만)
2. UFW 허용 포트 최소화 (`22`, `80`, `443`)
3. DB(5432), Redis(6379)는 외부 미노출 유지
4. 정기 백업 (DB 덤프 + 디스크 백업)

## 12. 트러블슈팅

1. 인증서 발급 실패
- 도메인이 홈 공인 IP를 정확히 가리키는지 확인
- 80/443 포워딩 확인

2. GitHub Actions SSH 실패
- `HOME_SSH_PRIVATE_KEY` 줄바꿈 손상 확인
- `HOME_KNOWN_HOSTS` 재등록

3. API 502
- `docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs caddy`
- `docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_blue`
- `docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml logs back_green`

## 13. 보안 하드닝 (SSH/UFW/fail2ban)

하드닝 문서: `deploy/homeserver/HARDENING.md`

실행:

```bash
cd ~/app
sudo ./deploy/homeserver/hardening/setup_hardening.sh 22 <your_linux_user>
```

적용 후 GitHub Actions도 일치시켜야 함:
- SSH 포트를 바꿨다면 `HOME_SSH_PORT` 시크릿도 같은 값으로 변경
- SSH 사용자 제한(`AllowUsers`)을 썼으므로 `HOME_SSH_USER`가 같은 사용자여야 함
