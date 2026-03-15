# Frontend Performance Brief

- 기본 전략: static shell + 작은 client islands
- shared hot path에서는 `react-icons` 대신 로컬 SVG 우선
- 반복 프로필 이미지는 `ProfileImage` 공통 컴포넌트 사용
- SSR hydrate 된 세션/프로필은 클라이언트 진입 직후 재요청 최소화
- 무거운 상호작용은 `next/dynamic` 또는 viewport 지연 로드 우선
- 운영 환경에서는 `NEXT_PUBLIC_BACKEND_URL`을 필수로 명시하고 API URL 추측 fallback을 두지 않는다
