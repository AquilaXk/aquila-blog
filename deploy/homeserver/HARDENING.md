# Home Server Hardening

## 대상

- Ubuntu 서버
- SSH 키 로그인 이미 정상 동작 중인 상태

## 적용 전 필수 확인

1. 현재 SSH 키 접속이 되는지 확인
2. 서버 콘솔(물리 접근 또는 원격 콘솔) 준비
3. GitHub `HOME_SSH_PORT` 변경 필요 여부 확인
4. Cloudflare Tunnel public hostname이 API/Grafana/monitoring 도메인을 Caddy origin으로 라우팅하는지 확인

## 실행

```bash
cd ~/app
sudo ./deploy/homeserver/hardening/setup_hardening.sh 22 <your_linux_user>
```

- 첫 번째 인자: SSH 포트 (기본 22)
- 두 번째 인자: SSH 로그인 사용자

## 적용 내용

- SSH: root 로그인 차단, 비밀번호 로그인 차단, 키 로그인만 허용
- SSH: `AllowUsers <your_linux_user>` 제한
- UFW: 인바운드 `SSH`만 허용하고, public `80/443` ingress는 열지 않음
- HTTP(S): `cloudflared egress`가 Docker 네트워크의 Caddy로 접근하며, host `80/443`은 compose에서 loopback 바인딩으로만 노출
- fail2ban: sshd 브루트포스 차단

## 변경 파일(서버)

- `/etc/ssh/sshd_config.d/99-hardening.conf`
- `/etc/fail2ban/jail.d/sshd.local`

## 검증

```bash
sudo ufw status verbose
sudo fail2ban-client status sshd
sudo sshd -t
docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml ps caddy cloudflared
ss -tulpen | grep -E '127\.0\.0\.1:(80|443)\b'
curl -sS -o /dev/null -w '%{http_code}\n' https://<api_domain>/actuator/health
```

## Redis 영속 계약 (#1129)

- 운영 `redis_1`은 `appendonly yes` + named volume `redis_data:/data`를 사용한다. ephemeral 계약으로 바꾸지 않는다.
- 회원 로그인 세션 Source of Truth는 DB다. Redis는 cache / rate-limit / ShedLock 상태를 담으며, 컨테이너 recreate 후에도 AOF가 volume에 남아야 한다.
- recreate 생존 검증(운영 또는 staging):

```bash
# 예시: redis-cli로 키를 쓴 뒤 force-recreate 후 키가 남아 있는지 확인
# --env-file은 compose 치환용이라 셸에 export되지 않으므로, .env.prod에서 비밀번호를 읽어 전달한다.
set -a
# shellcheck disable=SC1091
source deploy/homeserver/.env.prod
set +a
COMPOSE=(docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml)
"${COMPOSE[@]}" exec redis_1 redis-cli -a "${PROD___SPRING__DATA__REDIS__PASSWORD}" SET aquila:redis:persist-smoke 1 EX 3600
"${COMPOSE[@]}" up -d --force-recreate redis_1
# AOF 로드가 끝날 때까지 준비 상태를 기다린 뒤 GET한다.
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec redis_1 redis-cli -a "${PROD___SPRING__DATA__REDIS__PASSWORD}" PING | grep -q PONG; then
    break
  fi
  sleep 1
done
"${COMPOSE[@]}" exec redis_1 redis-cli -a "${PROD___SPRING__DATA__REDIS__PASSWORD}" GET aquila:redis:persist-smoke
```

## 롤백

서버 콘솔에서:

```bash
sudo rm -f /etc/ssh/sshd_config.d/99-hardening.conf
sudo rm -f /etc/fail2ban/jail.d/sshd.local
sudo systemctl restart ssh
sudo systemctl restart fail2ban
sudo ufw --force disable
```
