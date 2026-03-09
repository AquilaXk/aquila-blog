# infra (Legacy)

이 디렉터리는 클라우드 인프라 실험용 Terraform 코드입니다.
현재 운영 기준은 홈서버이며, 실제 배포는 아래를 사용합니다.

- `deploy/homeserver/docker-compose.prod.yml`
- `deploy/homeserver/Caddyfile`
- `.github/workflows/deploy.yml`

필요하면 이후 `infra/`는 별도 AWS/OCI 전용 브랜치로 분리하는 것을 권장합니다.
