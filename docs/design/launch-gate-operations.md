# Launch Gate Operations

이 문서는 `aquila-blog` 출시 승인 직전에 확인할 launch gate의 단일 운영 기준이다. Gate는 `main` 대상 PR 기준으로 판정하며, 승인자는 evidence가 없는 항목을 통과로 처리하지 않는다.

## Scope

- Issue: #958
- 적용 대상: release readiness, GitHub Actions CI/CD, 홈서버 배포, QA, monitoring, legal/public pages
- 기본 흐름: issue 확인 -> work branch -> PR -> CI/security -> code review -> merge -> post-merge CI/CD 확인

## Gate Decision

| 판정 | 조건 | 후속 조치 |
| --- | --- | --- |
| `pass` | 필수 evidence가 있고 blocker가 없다 | PR merge 가능 |
| `block` | P0/P1 launch-blocking 항목이 실패했거나 evidence가 없다 | 기존 issue/PR에서 수정 후 재검증 |
| `defer` | 출시 차단이 아닌 P2 이하 항목이고 추적 issue가 있다 | launch note에 issue 번호와 사유 기록 |

`defer`는 사용자 영향, 보안, 배포/복구, 법적 고지, 데이터 손실 가능성이 없는 항목에만 허용한다.

## Required Evidence

| Gate | Evidence | Pass 기준 | Block 기준 |
| --- | --- | --- | --- |
| P0/P1 issue 상태 | GitHub issue list와 release PR 관련 issue 링크 | P0는 모두 closed, P1 launch-blocking은 closed. P1을 defer하려면 먼저 non-blocking으로 재분류하고 추적 issue와 사유를 기록 | P0 open, P1 launch-blocking open, non-blocking 재분류 없는 P1 defer |
| CI | PR checks와 main merge 후 CI run | backend/frontend CI가 success | required check failure 또는 stale run |
| Security | Security workflow, CodeQL result, dependency-check run/artifact | CodeQL success와 backend dependency-check 실제 run 또는 artifact evidence 확인. dependency-check skip은 pass가 아니며 block 또는 명시적 defer 필요 | CodeQL/dependency check failure, dependency-check skip 사유 미기록 |
| Code review | CodeRabbit review 또는 Codex CLI fallback PR review | unresolved thread와 requested changes 없음 | review 미실행, unresolved actionable thread, requested changes |
| Deploy workflow | `Deploy to Home Server` workflow run | main merge 후 workflow가 success 또는 docs-only skip 사유 확인 | deploy 대상 변경인데 deploy/live verify 미실행 또는 failure |
| Sitemap/metadata/404/structured data | frontend smoke, sitemap E2E, live URL 확인 결과 | sitemap, metadata, canonical, 404, JSON-LD 계약 통과 | public discovery 또는 canonical/404 계약 실패 |
| Upload architecture | 관련 issue/PR 또는 design evidence | 현재 출시 범위에서 upload blocking 없음 | upload 경로가 launch path인데 검증 누락 |
| Blue/green rollback | deploy workflow log 또는 rollback script evidence | green health check 실패 시 rollback 경로 확인 가능 | rollback script 부재, rollback 후 health 미확인 |
| Worker rollback | worker 관련 issue/PR 또는 out-of-scope 기록 | worker 변경 없음 또는 rollback 절차 확인 | worker 변경이 있는데 rollback evidence 없음 |
| Backup/restore drill | backup metadata, restore drill issue/PR/run | restore drill evidence 연결 또는 launch-blocker defer 불가 사유 해소 | backup/restore evidence 없음 |
| Alert receiver | Prometheus/Grafana alert rule과 수신 채널 evidence | alert rule과 수신 채널이 존재하고 테스트 evidence 연결 | 운영 alert 수신 경로 없음 |
| Live E2E account cleanup | live E2E run artifact 또는 cleanup log | 테스트 계정/데이터 cleanup 결과 확인 | live E2E가 계정/데이터를 남김 |
| Mobile/keyboard/200% zoom QA | `docs/design/release-ui-qa-matrix.md` run table과 artifact | matrix pass run 연결 | 핵심 viewport 또는 keyboard/zoom failure |
| Privacy/terms/contact | public URL 또는 PR evidence | privacy, terms, contact 접근 가능 | 법적/연락처 페이지 미공개 |

## Evidence Collection

Merge 전 PR 본문 또는 review note에는 다음 항목을 남긴다.

- 관련 issue: #958 및 launch blocker issue 목록
- PR checks: CI, Security, CodeRabbit 또는 Codex CLI fallback review 결과
- 배포 영향: docs-only, frontend, backend, deploy 중 하나로 분류
- post-merge 확인: main CI run, deploy workflow run, live verification run 또는 skip 사유
- QA evidence: release UI QA matrix 문서 또는 Actions artifact
- legal evidence: privacy, terms, contact URL 확인 결과

## Current Baseline Links

- Release UI QA matrix: `docs/design/release-ui-qa-matrix.md`
- CI workflow: `.github/workflows/ci.yml`
- Security workflow: `.github/workflows/security.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Blue/green deploy script: `deploy/homeserver/blue_green_deploy.sh`
- Rollback script: `deploy/homeserver/rollback_last_deploy.sh`
- Backup script: `deploy/homeserver/create_external_backup.sh`
- Public edge probe: `deploy/homeserver/monitoring/public-edge-probe.mjs`
- Alert examples: `deploy/homeserver/monitoring/prometheus-task-alerts.example.yml`

## PR Checklist

Before merge:

- [ ] #958 또는 관련 launch gate issue가 PR에 연결되어 있다.
- [ ] P0/P1 launch-blocking issue 상태를 확인했다.
- [ ] CI와 Security checks가 success다.
- [ ] CodeRabbit review 또는 Codex CLI fallback review가 PR review로 남아 있다.
- [ ] unresolved review thread와 requested changes가 없다.
- [ ] 배포 영향 범위를 `docs-only`, `frontend`, `backend`, `deploy` 중 하나로 기록했다.
- [ ] 필요한 QA/legal/monitoring evidence가 PR 본문 또는 연결 문서에 있다.

After merge:

- [ ] main CI status를 확인했다.
- [ ] `Deploy to Home Server` workflow status를 확인했다.
- [ ] deploy 대상 변경이면 live E2E 또는 live probe 결과를 확인했다.
- [ ] docs-only 변경이면 deploy skip 또는 no-op 사유를 기록했다.
- [ ] launch gate issue를 closed 상태로 확인했다.
