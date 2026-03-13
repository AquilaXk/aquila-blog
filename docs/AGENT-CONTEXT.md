# Agent Context

이 문서는 구현 전 가장 먼저 읽는 최소 라우팅 문서다.

## Default

- 먼저 이 문서 1개만 읽는다.
- 다음은 `docs/agent/*.md` 브리프 1개만 읽는다.
- 그래도 부족할 때만 full guide 1개를 추가한다.
- 기본 상한: 2문서, 최대 상한: 3문서
- `docs/README.md`는 사람용 인덱스이므로 기본 구현 경로에 넣지 않는다.

## Output Rule

- 작업 중간에는 긴 설명 금지
- 최종에는 `무엇을 바꿨는지 + 검증`만 짧게 보고
- `무엇을 읽었는지`, `무엇을 탐색했는지`는 말하지 않음

## Routing

| 작업 | 먼저 읽을 브리프 | 막힐 때만 |
| --- | --- | --- |
| 프론트 화면/UX | `docs/agent/frontend-ui.md` | `docs/design/Frontend-Working-Guide.md` |
| 프론트 성능/하이드레이션 | `docs/agent/frontend-performance.md` | `docs/design/Frontend-Performance-Guide.md` |
| 마크다운/본문 렌더 | `docs/agent/content-rendering.md` | `docs/design/Frontend-Working-Guide.md` |
| 로그인/회원/SSR 세션 | `docs/agent/auth.md` | `docs/design/Backend-Auth-Member-Guide.md` |
| 인프라/배포/OAuth 프록시 | `docs/agent/infra-oauth.md` | `docs/design/Infrastructure-Architecture.md` |
| 게시글 좋아요/조회수 | `docs/agent/backend-posts.md` | `docs/troubleshooting/post-like-hit-concurrency.md` |
