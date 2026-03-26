# 트러블슈팅 포트폴리오 인덱스

이 폴더는 "문제를 빨리 찾는 사람"이 아니라, **문제의 층위를 분리하고 재발 방지까지 닫는 사람**이라는 인상을 주기 위한 포트폴리오다.

정렬 기준은 **운영 위험도(P0→P2) + 면접 설명 가치 + 재발 방지 설계 밀도**다.

## 추천 읽기 순서

면접관에게 처음 보여주기 좋은 문서는 아래 5개다.

1. [백엔드 테스트 연쇄 실패: OOM(SelectorManager 누적) + ArchitectureGuard 의존 회귀 동시 복구](./18-backend-test-oom-and-architecture-guard-regression.md)
2. [Blue/Green 배포 장애: Caddy upstream 드리프트와 롤백 실패 방어](./07-bluegreen-caddy-drift.md)
3. [라이브 502 반복 + AI 태그 추천 500 + OpenAPI 계약 드리프트 동시 복구](./19-live-origin-502-ai-tag-contract-drift.md)
4. [runtime-split 배포창 연쇄 회귀: 댓글 API·관리자 권한·CI 기준 동시 복구](./20-runtime-split-auth-and-e2e-regression-retrospective.md)
5. [관리자 글 작업실 목록 관리 UX 압축: 제목-상태 분리 과다와 모바일 동선 분산 복구](./22-admin-manage-list-ux-compaction.md)

## P0 (서비스 중단/배포 차단)

1. [운영 부팅 장애: SQL init 오염으로 컨테이너 재시작 루프](./06-prod-startup-sql-init-crash.md)
2. [Blue/Green 배포 장애: Caddy upstream 드리프트와 롤백 실패 방어](./07-bluegreen-caddy-drift.md)
3. [라이브 502 반복 + AI 태그 추천 500 + OpenAPI 계약 드리프트 동시 복구](./19-live-origin-502-ai-tag-contract-drift.md)

## P1 (핵심 기능 실패/신뢰도 하락)

4. [SSE 실시간 알림이 멈추는 장애 복구](./01-sse-notification-freeze.md)
5. [좋아요·조회수 정합성 붕괴: 멱등/동시성 재설계](./02-like-hit-idempotency-concurrency.md)
6. [Mermaid 다이어그램이 코드로 노출되는 렌더 파이프라인 장애](./03-mermaid-rendering-pipeline.md)
7. [관리자 삭제 500 장애: 권한 정책과 API 계약 불일치 정리](./05-admin-delete-permission-500.md)
8. [CI 불안정 장애: Toolchain·메모리·Lint 누적으로 배포 차단](./08-ci-build-instability.md)
9. [보안 게이트 대응: CodeQL SSRF/DOM-XSS 경고를 구조 수정으로 해소](./12-security-codeql-findings.md)
10. [운영 트러블슈팅 종합 회고(2026-03)](./13-operations-troubleshooting-retrospective.md)
11. [런타임 안정화 2차: 5xx 격리·AI 태그 추천 fail-open·CodeQL 경고 동시 대응](./14-runtime-stability-and-ai-summary-hardening.md)
12. [MarkdownRenderer 단일 파일 구조로 회귀가 반복되던 문제를 모듈 분리로 차단](./15-markdown-renderer-modularization.md)
13. [백엔드 테스트 연쇄 실패: OOM(SelectorManager 누적) + ArchitectureGuard 의존 회귀 동시 복구](./18-backend-test-oom-and-architecture-guard-regression.md)
14. [상세 레이아웃/머메이드 클리핑/관리자 작업실 UX 동시 안정화](./19-detail-mermaid-and-admin-workspace-ux-stability.md)
15. [관리자 작업실 UX 회귀 + perf 스냅샷 드리프트 동시 안정화](./20-admin-workspace-ux-and-perf-regression-hardening.md)
16. [runtime-split 배포창 연쇄 회귀: 댓글 API·관리자 권한·CI 기준 동시 복구](./20-runtime-split-auth-and-e2e-regression-retrospective.md)
17. [런타임 경계/CORS/ReDoS/WebMvc 컨텍스트 회귀 동시 정리](./21-runtime-boundary-cors-redos-and-webmvc-context.md)

## P2 (사용성/품질 저하)

18. [코드 하이라이팅 미적용: SSR 기준 렌더 파이프라인 정리](./04-code-highlighting-pipeline.md)
19. [AI 태그 추천 품질 장애: 빈 결과·규칙 기반 반복을 분리 대응](./09-ai-preview-summary-fail-open.md)
20. [메인 피드 병목 장애: 500과 10초 지연을 읽기 경로에서 제거](./10-feed-read-performance-and-500.md)
21. [새로고침 꿈틀거림(CLS) 장애: SSR/CSR 경계 정렬로 안정화](./11-refresh-jitter-hydration.md)
22. [AI 태그 추천 장애: traceId/reason 관측성과 알림 채널 분리](./14-ai-preview-summary-observability-and-notice-scope.md)
23. [Playwright 머메이드 스모크 실패: 코드 결함이 아니라 stale .next 산출물 문제](./16-playwright-mermaid-failure-from-stale-next-build.md)
24. [검색 결과 체감 품질 저하: 제목 > 태그 > 본문 가중치 랭킹 명시 적용](./17-search-ranking-weighted-order.md)
25. [관리자 UI 로컬 검증 복구: live 인증 쿠키 주입 + 프로필 dirty-state false positive + stale `.next` 정리](./19-admin-ui-local-audit-cookie-seeding-and-dirty-guard.md)
26. [관리자 글 작업실 목록 관리 UX 압축: 제목-상태 분리 과다와 모바일 동선 분산 복구](./22-admin-manage-list-ux-compaction.md)
27. [Redis 읽기 캐시 최적화: 상세 분리·네거티브 캐시·무효화 정밀화 동시 적용](./23-redis-read-cache-tiering-and-negative-cache.md)

## 읽는 법

- P0: 실제 운영 사고를 어떻게 차단하고 롤백 안전성을 만들었는지 본다.
- P1: 권한, 렌더링, 테스트, 보안처럼 여러 계층에 걸친 회귀를 어떻게 분리했는지 본다.
- P2: 성능/UX/검증 체계를 어떻게 "좋아 보이는 개선"이 아니라 재현 가능한 품질 기준으로 바꿨는지 본다.

## 운영 규칙

- 새 장애 추가 시 번호를 이어 붙이고, 기존 문서와 중복 원인은 링크로 연결한다.
- 문서마다 `면접에서 30초로 설명하는 요약` 섹션을 유지한다.
- 커밋/로그/테스트 근거가 없는 문장은 제거한다.
- 같은 배포창에서 연쇄로 발생한 회귀는 묶을 수 있지만, 공통 원인과 공통 재발 방지 대책이 없으면 분리한다.
