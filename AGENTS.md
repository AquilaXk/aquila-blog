# AGENTS.md

## Docs-First Rule (Mandatory)

이 저장소에서 작업하는 모든 AI 에이전트는 구현이나 분석 전에 반드시 문서를 먼저 확인해야 한다.

필수 순서:
1. `docs/AGENT-CONTEXT.md` 먼저 읽기
2. 거기서 현재 작업 유형에 맞는 compact guide 1개를 먼저 읽기
3. 막힐 때만 full guide 1개를 추가로 읽기
4. 총 읽는 문서는 `AGENT-CONTEXT + compact 1개 + 필요 시 full 1개`, 최대 3개를 넘기지 않기
5. 코드 작업 진행
6. 작업 결과로 문서 기준이 바뀌었으면 같은 턴에서 docs도 같이 수정

## Thread Discipline (Mandatory)

- 새 작업은 가능하면 주제별 새 스레드에서 시작한다.
- 한 스레드에 `프론트 UI`, `인증`, `배포`, `문서`, `백엔드 구조`처럼 큰 주제를 계속 누적하지 않는다.
- 오래된 스레드가 길어지면 이어붙이지 말고 새 스레드에서 다시 시작한다.

## Required Behavior

- `docs`는 참고 자료가 아니라 작업 기준이다.
- 문서가 현재 코드와 다르면 즉시 수정한다.
- 필요한 문서가 없으면 새로 만든다.
- 설명/보고는 가능한 한 `문서 기준 적용 + 이번 변경 차이점만 짧게`로 한다.
- 작업 중간 보고는 꼭 필요할 때만 한 줄로 한다.
- 중간에 `무엇을 읽었는지`, `무엇을 탐색했는지`를 길게 나열하지 않는다.
- 설명은 `무엇을 봤는지`보다 `무엇을 바꿨는지`를 중심으로 한다.
- 원인 분석, 선택지 비교, 트레이드오프 설명은 실제 리스크가 있을 때만 길게 확장한다.

## Fast Path

- 항상 먼저: `docs/AGENT-CONTEXT.md`
- 프론트 화면/UX: `docs/design/Frontend-Working-Guide.compact.md`
- 프론트 성능: `docs/design/Frontend-Performance-Guide.md`
- 로그인/회원/인증: `docs/design/Backend-Auth-Member-Guide.compact.md`
- 이메일 인증 회원가입: `docs/design/Signup-Verification-Working-Guide.md`
- 전체 구조/리팩터링: `docs/design/System-Architecture.md`
- 인프라/배포/OAuth 프록시: `docs/design/Infrastructure-Architecture.md`
- 좋아요/조회수/동시성: `docs/troubleshooting/post-like-hit-concurrency.md`

## Scope Discipline

- 관련 없는 `docs/design/*.md`를 한 번에 많이 읽지 않는다.
- 먼저 compact 문서가 있으면 compact부터 읽고, 막힐 때만 full guide로 내려간다.
- 긴 문서에는 상단 3줄 요약이 있으므로, 우선 그 요약과 필요한 섹션만 읽는다.
- 작업 중간 메시지는 최소화하고, 결과는 최종 보고에 모아 전달한다.
