# Frontend Working Guide

프론트엔드 SSR/CSR 공통 운영 규칙. 화면별 세부 가이드는 관련 design 문서를 따른다.

## SSR 에러 처리

JSON을 소비하는 SSR 데이터 로딩은 `serverApiFetchJson`을 사용한다.
성공 시 파싱된 JSON을 반환하고, 실패 시 공용 `ApiError`(status/body/`userMessage` 규칙 동일)를 throw한다.
raw `serverApiFetch`는 스트리밍·특수 Response 소비에만 남긴다.

공개 ISR(홈/글 상세)처럼 request cookie 전달이 필요 없는 정적 경로는 `apiFetch`를 계속 쓸 수 있다.
이 경우에도 실패 타입은 동일한 `ApiError`/`ApiNetworkError`/`ApiTimeoutError`다.

### Decision tree

| 페이지 유형 | 실패 시 동작 |
|---|---|
| 공개 GSP/ISR (홈, 글 상세) | degraded shell + 클라이언트 재fetch + `revalidate: 30` |
| admin GSSP | 401/403 → 로그인 redirect(또는 auth cookie 있을 때 fallback guard). 그 외(5xx/network/timeout) → throw하여 Next 500 (`destination: null` 금지). `timed()`로 bootstrap을 감싼 경우에도 `!ok`면 즉시 rethrow해 fallback으로 삼키지 않는다 |
| RSS/feed | 503 + `console.error` |

### 구현 위치

- `front/src/libs/server/backend.ts` — `serverApiFetch` / `serverApiFetchJson`
- `front/src/libs/server/adminPage.ts` — `readAdminProtectedBootstrap`
- `front/src/pages/feed.tsx` — RSS 503 경로
- `front/src/pages/index.tsx`, `front/src/libs/server/postDetailPage.ts` — 공개 degraded shell
