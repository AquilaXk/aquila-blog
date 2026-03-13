# Infra OAuth Brief

- 외부 백엔드 canonical URL은 `custom.site.backUrl`
- OAuth redirect URI는 `${custom.site.backUrl}/login/oauth2/code/{registrationId}`
- 프록시는 HTTPS forwarded headers를 보존해야 함
- Caddy/프록시 문제는 host보다 scheme(`https`) 전달을 먼저 의심
