# Auth Brief

- `next` 파라미터는 항상 정규화
- `/_next/data/...json` 경로는 절대 `next`로 넘기지 않음
- SSR에서 `auth/me`를 hydrate한 페이지는 동일 요청 즉시 재실행 최소화
- 관리자 SSR 페이지는 `initialMember`를 첫 로딩에만 사용
- 이후에는 클라이언트 세션 상태를 우선
- 알림 스트림은 SSE heartbeat + 클라이언트 backoff 재연결 + 프록시 `flush_interval -1`을 같이 유지
