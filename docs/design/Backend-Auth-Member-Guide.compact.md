# Backend Auth Member Guide Compact

Last updated: 2026-03-13

## 3줄 요약

- 로그인/회원/인증 작업은 이 문서부터 읽고, 세부 제약이 더 필요할 때만 `Backend-Auth-Member-Guide.md` 본문으로 내려간다.
- 현재 지원 범위는 일반 로그인, 카카오 OAuth, 이메일 인증 회원가입이며, 콜백 URL은 `${custom.site.backUrl}` 기준으로 고정한다.
- 프론트 UX를 바꾸기 전에 "백엔드가 이미 지원하는 것"과 "추가 개발이 필요한 것"을 먼저 구분해야 한다.

## 현재 지원 기능

- 일반 로그인: `POST /member/api/v1/auth/login`
- 로그아웃: `POST /member/api/v1/auth/logout`
- 내 정보 조회: `GET /member/api/v1/auth/me`
- 일반 회원가입: `POST /member/api/v1/members`
- 카카오 OAuth 시작: `/oauth2/authorization/kakao`
- 이메일 인증 회원가입: 별도 verification flow 지원

## 현재 인증 기준

- 세션 핵심 조회는 `auth/me`
- SSR에서 hydrate된 페이지는 클라이언트 진입 직후 같은 요청을 다시 보내지 않는다
- `next` 파라미터는 반드시 정규화한다
- `/_next/data/...json` 같은 내부 데이터 경로는 로그인 리다이렉트에 쓰지 않는다

## OAuth 핵심 기준

- Kakao callback URL은 `${custom.site.backUrl}/login/oauth2/code/{registrationId}`
- 프록시에서는 `X-Forwarded-Proto=https`를 명시해야 한다
- redirect URI 문제는 프론트보다 프록시/Caddy와 Spring base URL 계산을 먼저 본다

## 관리자/회원 기준

- 관리자 여부는 `isAdmin`
- 관리자 SSR 페이지는 `initialMember`를 첫 로딩 동안만 사용
- 이후에는 클라이언트 세션 상태를 우선한다

## 언제 본문 문서를 더 읽나

- 이메일 인증 회원가입 전체 플로우를 손볼 때
- OAuth callback / 프록시 / 쿠키 정책을 바꿀 때
- 프론트 인증 UX를 크게 재설계할 때

전체 기준 문서: [Backend Auth Member Guide](./Backend-Auth-Member-Guide.md)
추가 흐름 문서: [Signup Verification Working Guide](./Signup-Verification-Working-Guide.md)
