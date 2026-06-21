# Frontend CSP Rollout

## 목적
- `front/next.config.js`의 `Content-Security-Policy`는 운영 차단 정책으로 유지한다.
- 새 외부 script, API, image, iframe, monitoring origin을 추가할 때는 먼저 report-only로 위반 로그를 확인한 뒤 차단 정책에 반영한다.

## 현재 정책
- `default-src 'self'`를 기본값으로 둔다.
- `script-src`는 Next.js runtime, 현재 inline bootstrap, Vercel Analytics/Toolbar, Google Analytics script source만 허용한다.
- `style-src`는 Emotion/Next.js inline style 운용을 위해 `'unsafe-inline'`을 유지한다.
- `img-src`, `connect-src`, `font-src`, `media-src`, `frame-src`는 현재 운영 image domain, same-origin API proxy, Vercel telemetry, Google Analytics, monitoring embed origin을 명시한다.
- nonce 기반 `script-src`는 Next.js proxy 동적 렌더링 전환이 필요하므로 이번 변경에서는 적용하지 않는다. nonce 전환 시 `script-src 'nonce-<value>' 'strict-dynamic'`과 `style-src 'nonce-<value>'`를 별도 이슈로 검증한다.

## Report-Only Rollout
1. 새 외부 origin이 필요한 변경은 PR에서 `Content-Security-Policy-Report-Only` 후보값을 PR 본문에 적는다.
2. preview 또는 canary 환경에서 브라우저 console의 CSP violation을 확인한다.
3. violation이 의도된 source라면 `front/next.config.js`의 source allowlist에 origin 단위로 추가한다.
4. path, query string, wildcard 최상위 도메인 전체 허용은 피하고, 가능한 한 origin 또는 필요한 하위 도메인만 허용한다.
5. `front/e2e/security-csp-header.spec.ts`에 새 source 계약을 추가한 뒤 차단 정책으로 승격한다.

## Violation Triage
- `script-src`: 새 script host가 필요한지 먼저 확인한다. inline script 증가는 nonce/hash 전환 대상인지 분리한다.
- `connect-src`: API, analytics, SSE/WebSocket endpoint인지 확인하고 credential 전송 범위를 함께 본다.
- `img-src`: 사용자 콘텐츠/프로필/markdown image domain인지 확인하고 `data:`/`blob:` 확장이 필요한지 별도 판단한다.
- `frame-src`: monitoring 또는 Vercel preview tooling처럼 실제 iframe이 필요한 origin만 추가한다.
- `style-src`: 새 inline style 요구는 component library/runtime 제약인지 확인하고 가능한 경우 CSS 파일 또는 nonce 전환 이슈로 분리한다.

## 검증
- `PLAYWRIGHT_USE_WEBSERVER=false yarn --cwd front playwright test e2e/security-csp-header.spec.ts --workers=1`
- `yarn --cwd front build`
- 배포 후 실제 페이지에서 browser console CSP violation이 없는지 확인한다.
