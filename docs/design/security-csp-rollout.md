# Frontend CSP Rollout

## 목적
- `front/next.config.js`의 `Content-Security-Policy`는 운영 차단 정책으로 유지한다.
- 동일 시안을 `Content-Security-Policy-Report-Only`로도 내려 browser/header evidence를 남긴다.
- 새 외부 script, API, image, iframe, monitoring origin을 추가할 때는 먼저 report-only 위반을 확인한 뒤 차단 정책에 반영한다.

## 현재 정책
- `default-src 'self'`를 기본값으로 둔다.
- `script-src`는 Next.js runtime(`'self'`), document inline script **sha256 hash**, Vercel Analytics/Toolbar, Google Analytics script source만 허용한다. **`'unsafe-inline'`은 사용하지 않는다** (HR-56: silent fallback 재도입 금지).
- document inline script 본문과 hash 계약은 `front/src/libs/security/documentInlineScripts.js` + `contentSecurityPolicy.js`가 owner다.
- `style-src`는 Emotion/Next.js inline style 운용을 위해 `'unsafe-inline'`을 **유지**한다.
- `img-src`, `connect-src`, `font-src`, `media-src`, `frame-src`는 현재 운영 image domain, same-origin API proxy, Vercel telemetry, Google Analytics, monitoring embed origin을 명시한다.
- `img-src`의 `http:`/`https:` scheme source는 현재 markdown image와 unfurl thumbnail 입력 계약이 외부 image URL을 허용하기 때문에 유지한다. 별도 image proxy 또는 domain validation으로 좁히는 변경은 content validation 이슈로 분리한다.
- `connect-src`의 `http://localhost:8080`, `http://127.0.0.1:8080`은 `NEXT_PUBLIC_BACKEND_URL`이 없을 때 쓰는 local backend fallback을 위해 development build에서만 포함한다.
- per-request nonce + 전면 dynamic rendering은 SSG 비용이 커서 이번 전환에서는 hash enforce를 선택했다. nonce/`strict-dynamic` 전환이 필요하면 별도 이슈로 SSR 범위를 고정한 뒤 진행한다.

## Monitoring iframe (Caddy)
- Grafana/Uptime 응답에서 CSP를 빈 상태로 strip하지 않는다.
- Caddy가 `Content-Security-Policy: frame-ancestors {$ADMIN_EMBED_ORIGINS}`를 내려 admin UI origin allowlist만 iframe parent로 허용한다.
- `ADMIN_EMBED_ORIGINS`는 space-separated origin 목록이며 `.env.prod` / `.env.caddy.prod`로 materialize한다.

## Report-Only Rollout
1. 새 외부 origin이 필요한 변경은 PR에서 `Content-Security-Policy-Report-Only` 후보값을 PR 본문에 적는다.
2. preview 또는 canary 환경에서 브라우저 console의 CSP violation을 확인한다.
3. violation이 의도된 source라면 `front/src/libs/security/contentSecurityPolicy.js`의 source allowlist에 origin 단위로 추가한다.
4. path, query string, wildcard 최상위 도메인 전체 허용은 피하고, 가능한 한 origin 또는 필요한 하위 도메인만 허용한다.
5. `front/e2e/security-csp-header.spec.ts`에 새 source 계약을 추가한 뒤 차단 정책으로 승격한다.

## Violation Triage
- `script-src`: 새 script host가 필요한지 먼저 확인한다. 새 document inline script는 hash를 `documentInlineScripts.js`에 추가하고 `'unsafe-inline'`로 되돌리지 않는다.
- `connect-src`: API, analytics, SSE/WebSocket endpoint인지 확인하고 credential 전송 범위를 함께 본다.
- `img-src`: 사용자 콘텐츠/프로필/markdown image domain인지 확인하고 `data:`/`blob:` 확장이 필요한지 별도 판단한다.
- `frame-src`: monitoring 또는 Vercel preview tooling처럼 실제 iframe이 필요한 origin만 추가한다.
- `style-src`: Emotion 호환을 위한 `'unsafe-inline'` 유지는 허용한다. 완전 제거는 별도 이슈다.

## 검증
- `PLAYWRIGHT_USE_WEBSERVER=false yarn --cwd front playwright test e2e/security-csp-header.spec.ts --workers=1`
- `yarn --cwd front build`
- 배포 후 실제 페이지에서 browser console CSP violation이 없는지 확인한다.
- Grafana/Uptime 응답에 `frame-ancestors` admin allowlist가 있는지 header dump로 확인한다.
