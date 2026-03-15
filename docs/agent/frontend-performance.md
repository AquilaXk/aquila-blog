# Frontend Performance Brief

- 기본 전략: static shell + 작은 client islands
- Pages Router + Emotion 조합에서는 `_document.tsx`에서 critical CSS를 SSR로 선주입하고, `_app.tsx`는 `CacheProvider`를 고정한다.
- 웹폰트는 `body className`(next/font)로 SSR 시점부터 적용해 새로고침 시 텍스트 reflow(꿈틀)를 줄인다.
- shared hot path에서는 `react-icons` 대신 로컬 SVG 우선
- 반복 프로필 이미지는 `ProfileImage` 공통 컴포넌트 사용
- SSR hydrate 된 세션/프로필은 클라이언트 진입 직후 재요청 최소화
- 무거운 상호작용은 `next/dynamic` 또는 viewport 지연 로드 우선
- 운영 환경에서는 `NEXT_PUBLIC_BACKEND_URL`을 필수로 명시하고 API URL 추측 fallback을 두지 않는다
