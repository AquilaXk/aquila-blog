# Auth Brief

- `next` 파라미터는 항상 정규화
- `/_next/data/...json` 경로는 절대 `next`로 넘기지 않음
- SSR에서 `auth/me`를 hydrate한 페이지는 동일 요청 즉시 재실행 최소화
- 관리자 SSR 페이지는 `initialMember`를 첫 로딩에만 사용
- 이후에는 클라이언트 세션 상태를 우선
- 알림 스트림은 SSE heartbeat + 클라이언트 backoff 재연결 + 프록시 `flush_interval -1`을 같이 유지
- SSE 이벤트는 `id` + `retry`를 포함하고, 재연결 시 `lastEventId`를 전달해 누락 알림 재전송을 받는다
- SSE가 반복 실패(QUIC/네트워크)하면 클라이언트는 폴링 모드로 자동 폴백해 UI 동작을 우선 보장
- `api`와 `www`가 같은 사이트(`*.domain`)라면 SSE를 우선 사용하고, cross-site 환경에서만 폴링을 기본값으로 둔다
