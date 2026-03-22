# Aquila Blog Frontend

`front/`는 Next.js Pages Router 기반 사용자/관리자 UI 애플리케이션입니다.

## Stack

- Next.js 14 (Pages Router)
- React 18 + TypeScript
- TanStack Query (SSR hydrate + client cache)
- Emotion
- Playwright (smoke/perf/live E2E)

## 주요 화면

- `/` 메인 피드 (feed/explore/search + cursor 기반 무한 스크롤)
- `/posts/[id]` 글 상세
- `/about` 소개 페이지
- `/admin` 운영 허브
- `/admin/profile` 관리자 프로필 관리
- `/admin/posts/new` 글 작성/수정 (AI 태그 추천 포함)
- `/admin/tools` 시스템 운영 도구

## 실행

```bash
cd front
yarn
yarn dev
```

## 필수 환경변수

| 이름 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_BACKEND_URL` | 브라우저 런타임 API base URL |
| `BACKEND_INTERNAL_URL` | SSR/server-side API base URL |

## 선택 환경변수

| 이름 | 용도 |
| --- | --- |
| `NEXT_PUBLIC_UPTIME_KUMA_STATUS_PATH` | 관리자 도구의 상태 페이지 임베드 경로 |
| `UPTIME_KUMA_PROXY_ORIGIN` | `/status/*` rewrite 대상 오리진 |
| `PLAYWRIGHT_BASE_URL` | live E2E 대상 URL |
| `BUNDLE_BUDGET_MARGIN_PERCENT` | 번들 예산 허용 오차(%) |
| `BUNDLE_BUDGET_ENFORCEMENT` | `strict` 또는 `warn` |

## 인증/세션 동작 요약

- 로그인 상태 조회는 `/member/api/v1/auth/me` 기반.
- SSR에서 auth 스냅샷(`authMeProbe`)을 주입하고, 비로그인 확정 상태에서는 클라이언트 재검증 호출을 생략.
- 비로그인 새로고침 시 `auth/me 401` 콘솔 노이즈를 줄이기 위한 억제 로직이 포함되어 있음.

관련 코드:

- `src/hooks/useAuthSession.ts`
- `src/libs/server/authSession.ts`

## OpenAPI 계약 동기화

프론트는 백엔드 OpenAPI 스냅샷을 타입으로 변환해 계약 드리프트를 검증합니다.

```bash
cd front
yarn contracts:fetch
yarn contracts:generate
yarn contracts:check
```

## 검증 명령

```bash
cd front
yarn lint
yarn build
yarn test:e2e:smoke
yarn test:e2e:perf
yarn test:e2e:live
yarn check:bundle-size
```

## 번들 예산

- 경로별 baseline + margin 정책으로 관리합니다.
- 기본 검사 대상 경로: `/`, `/posts/[id]`, `/admin`
- raw/gzip/brotli를 함께 측정하고 리포트를 `test-results/bundle-size`에 생성합니다.

## 문서

- 사람용 인덱스: [`../docs/README.md`](../docs/README.md)
- 프론트 작업 기준: [`../docs/design/Frontend-Working-Guide.md`](../docs/design/Frontend-Working-Guide.md)
- 성능 기준: [`../docs/design/Frontend-Performance-Guide.md`](../docs/design/Frontend-Performance-Guide.md)
