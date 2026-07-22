# infra (Legacy quarantine)

이 디렉터리의 Terraform은 **운영 경로가 아니다**.

## Sole production path

- Homeserver Cloudflare Tunnel + Caddy bind `127.0.0.1`
- `deploy/homeserver/docker-compose.prod.yml`
- `deploy/homeserver/caddy/Caddyfile`
- `.github/workflows/deploy.yml`

## Quarantine

- Legacy/실험용 Terraform 코드는 `infra/legacy/` 아래에만 둔다.
- `infra/legacy/`에 대한 `terraform apply`는 금지한다. CI guard가 world-open(`0.0.0.0/0`) 인바운드 규칙을 레포 전역에서 감시한다.
- 신규 공개 인바운드 prod 경로를 Terraform으로 재도입하지 않는다.

## Guard

```bash
bash tools/guards/check-terraform-no-world-open-sg.sh
```
