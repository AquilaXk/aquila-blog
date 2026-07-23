# Launch Gate Operations

이 문서는 `aquila-blog` 출시 승인 직전에 확인할 launch gate의 단일 운영 기준이다. Gate는 `main` 대상 PR 기준으로 판정하며, 승인자는 evidence가 없는 항목을 통과로 처리하지 않는다.

## Scope

- Issue: #958
- Soft-launch 제품 범위 목표 (Locked — #1127 / epic #1256): 관리자 글 발행 + 비로그인 공개 열람
- Soft-launch freeze 키(이 gate 강제 범위): `CUSTOM__MEMBER__SIGNUP__ENABLED=false`, `CUSTOM__MEMBER__OAUTH_SIGNUP__ENABLED=false`, `NEXT_PUBLIC_SIGNUP_ENABLED=false`, `NEXT_PUBLIC_RUM_SAMPLE_RATE=0`, `CUSTOM__AI__SUMMARY__ENABLED=false` (AI 실키는 SUMMARY, TAG 아님)
- Soft-launch 명시적 예외: 관리자 로그인/발행 필수. 기존 회원 로그인·댓글 쓰기는 5-key freeze 범위 밖(별도 issue)
- Soft-launch freeze 운영 경로: homeserver deploy/env.contract + deploy.yml. Vercel 프로젝트 env는 Soft-launch 운영 SoT가 아니다.
- 적용 대상: release readiness, GitHub Actions CI/CD, 홈서버 배포, QA, monitoring, legal/public pages, privacy launch gate
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
| Backup/restore drill | backup metadata, restore drill issue/PR/run, RPO/RTO artifact | restore drill evidence 연결, RPO/RTO 목표 대비 결과 기록, PostgreSQL/MinIO checksum 검증 | backup/restore evidence 없음, RPO/RTO 결과 누락 |
| Alert receiver | Prometheus/Grafana alert rule과 수신 채널 evidence | alert rule과 수신 채널이 존재하고 테스트 evidence 연결 | 운영 alert 수신 경로 없음 |
| Live E2E account cleanup | live E2E run artifact 또는 cleanup log | 테스트 계정/데이터 cleanup 결과 확인 | live E2E가 계정/데이터를 남김 |
| Mobile/keyboard/200% zoom QA | `docs/design/release-ui-qa-matrix.md` run table과 artifact | matrix pass run 연결 | 핵심 viewport 또는 keyboard/zoom failure |
| Privacy/terms/contact | public URL 또는 PR evidence | privacy, terms, contact 접근 가능 | 법적/연락처 페이지 미공개 |
| Privacy launch gate | `docs/design/privacy-launch-gate-checklist.md`의 matrix와 evidence | 개인정보 필수 출시 전 완료 항목 closed, 공개 정책 gate pass, 법무/운영 owner evidence 존재 | 개인정보 launch-blocking issue open, policy-code drift, 법무/운영 owner evidence 없음 |
| Soft-launch feature freeze | #1127 Locked decision, `deploy/env/env.contract.json`, deploy privacy freeze step, live UI smoke | Soft-launch 범위 문서와 5개 freeze 키가 false/0으로 일치하고 signup/OAuth signup/RUM/AI SUMMARY가 공개되지 않음 | freeze 키 drift, Soft-launch 범위 밖 기능 enable, TAG 키로 SUMMARY를 오인 |

## Evidence Collection

Merge 전 PR 본문 또는 review note에는 다음 항목을 남긴다.

- 관련 issue: #958 및 launch blocker issue 목록
- PR checks: CI, Security, CodeRabbit 또는 Codex CLI fallback review 결과
- 배포 영향: docs-only, frontend, backend, deploy 중 하나로 분류
- post-merge 확인: main CI run, deploy workflow run, live verification run 또는 skip 사유
- QA evidence: release UI QA matrix 문서 또는 Actions artifact
- legal evidence: privacy, terms, contact URL 확인 결과
- privacy evidence: `docs/design/privacy-launch-gate-checklist.md`의 go/no-go 판정과 launch-blocking issue 상태

## Current Baseline Links

- Release UI QA matrix: `docs/design/release-ui-qa-matrix.md`
- Privacy launch gate checklist: `docs/design/privacy-launch-gate-checklist.md`
- CI workflow: `.github/workflows/ci.yml`
- Security workflow: `.github/workflows/security.yml`
- Deploy workflow: `.github/workflows/deploy.yml`
- Blue/green deploy script: `deploy/homeserver/blue_green_deploy.sh`
- Rollback script: `deploy/homeserver/rollback_last_deploy.sh`
- Backup script: `deploy/homeserver/create_external_backup.sh`
- Restore drill script: `deploy/homeserver/restore_external_backup_drill.sh`
- Restore drill workflow: `.github/workflows/backup-restore-drill.yml`
- Public edge probe: `deploy/homeserver/monitoring/public-edge-probe.mjs`
- Alert examples: `deploy/homeserver/monitoring/prometheus-task-alerts.example.yml`

## Backend CI Gate Paths

- PR path: `.github/workflows/backend-ci.yml` → reusable backend quality가 `./gradlew ciFastCheck`만 실행한다. 속도용 의도적 fast path이며, PR green만으로 merge 완료/출시 가능으로 취급하지 않는다.
- main/release path: `.github/workflows/ci.yml`(push to `main`) → 같은 reusable job이 `./gradlew check`를 실행한다. `check`는 `testcontainersTest`를 포함하며 main trunk required gate다.
- PR에서 잡지 못한 Testcontainers 회귀는 main CI 실패로 차단한다. drill 실패나 main full check 실패를 무시하고 배포를 계속하는 우회는 금지다.

## Backup Restore Drill Evidence

- 자동 실행: `.github/workflows/backup-restore-drill.yml`이 monthly `schedule`(`cron: 0 15 1 * *`, UTC)로 매월 1회 실행된다. 실패는 fail-fast이며 skip/ignore로 배포를 우회하지 않는다.
- 수동 실행: 같은 workflow를 `workflow_dispatch`로도 실행할 수 있다.
- 기본 대상: `backup_class=daily`, `backup_set_id`는 비워 두면 최신 daily PostgreSQL backup을 사용한다(schedule도 동일 기본값).
- 통과 증거: workflow artifact `backup-restore-drill` 안의 `restore-drill-summary.md`, `restore-drill-result.env`, `restore-privacy-gate.txt`, `minio-checksums.sha256`.
- main/release 게이트: launch/release 판정 전에 **최근 30일 이내** 성공한 `Backup Restore Drill` run과 artifact 링크를 증거로 남긴다. 최근 성공 artifact가 없으면 go 판정을 하지 않는다.
- DB 검증: 임시 PostgreSQL container에 `dump.sql.enc`를 복호화해 복원하고 `flyway_schema_history`, `post` row count, 최신 public post(`listed = true`) 조회를 확인한다.
- Object 검증: `minio-data.tar.gz.enc`를 복호화한 archive에서 운영 object 샘플 1개 이상을 선택해 `sha256sum`을 기록한다.
- Privacy gate: `AQUILA_RESTORE_PRIVACY_GATE_SCRIPT`가 tombstone replay 또는 동등한 삭제 검증을 수행하고 traffic open 전 `status=pass` evidence를 남긴다.
- Key 분리: backup encryption key file은 기본 `${AQUILA_EXTERNAL_STORAGE_ROOT}/backup-encryption.key`이며 `AQUILA_BACKUP_ROOT` 내부에 있으면 gate 실패다.
- RPO/RTO 기준: 기본 RPO target은 1440분, 기본 RTO target은 120분이며, 실제 `RPO_ACTUAL_MINUTES`와 `RTO_ACTUAL_SECONDS`를 artifact에 남긴다.

## PR Checklist

Before merge:

- [ ] #958 또는 관련 launch gate issue가 PR에 연결되어 있다.
- [ ] P0/P1 launch-blocking issue 상태를 확인했다.
- [ ] CI, CodeQL, backend dependency-check run/artifact evidence를 확인했다. dependency-check skip이면 block 또는 명시적 defer note를 기록했다.
- [ ] PR backend green이 `ciFastCheck` fast path임을 인지하고, Testcontainers full 검증은 merge 후 main `check` gate에 의존함을 기록했다.
- [ ] CodeRabbit review 또는 Codex CLI fallback review가 PR review로 남아 있다.
- [ ] unresolved review thread와 requested changes가 없다.
- [ ] 배포 영향 범위를 `docs-only`, `frontend`, `backend`, `deploy` 중 하나로 기록했다.
- [ ] 필요한 QA/legal/monitoring evidence가 PR 본문 또는 연결 문서에 있다.
- [ ] launch/release면 최근 30일 `backup-restore-drill` 성공 artifact 링크가 있다.

After merge:

- [ ] main CI status를 확인했다(`backend-ci` full `check` 포함).
- [ ] `Deploy to Home Server` workflow status를 확인했다.
- [ ] deploy 대상 변경이면 live E2E 또는 live probe 결과를 확인했다.
- [ ] docs-only 변경이면 deploy skip 또는 no-op 사유를 기록했다.
- [ ] launch gate issue를 closed 상태로 확인했다.
