# Backend Posts Brief

- 좋아요는 멱등 경로 우선: `PUT like`, `DELETE like`
- 조회수는 dedupe 적용, Redis 실패 시 fallback 필요
- 동일 사용자 중복 like row는 unique constraint 기준으로 보호
- 테스트는 동시성/멱등성 시나리오를 우선 확인
