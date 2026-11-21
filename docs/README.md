# Aquila Blog Docs

Aquila Blog의 git tracked user-facing 문서를 모아 둔 문서 허브입니다.

Agent-only 작업 메모와 로컬 상태 파일은 `.gitignore` 대상이므로 이 문서의 주요 문서 목록에 넣지 않습니다.

## Entry Points

| Area | Document | Description |
| --- | --- | --- |
| Web | [AquilaXk/aquila-blog-web](https://github.com/AquilaXk/aquila-blog-web) | Web source, routes, UI quality checks, and image production |
| Backend | [back/README.md](../back/README.md) | Backend architecture, API modules, quality checks, OpenAPI flow |
| Performance | [perf/k6/README.md](../perf/k6/README.md) | Read-path load and chaos scenarios |
| Deployment | [deploy/homeserver/HARDENING.md](../deploy/homeserver/HARDENING.md) | Home server hardening checklist |

## Tracked Design Notes

| Document | Description |
| --- | --- |
| [Task Delivery Guarantees](design/task-delivery-guarantees.md) | Durable task queue delivery, retry, idempotency, DLQ replay contract |
| [Cache Consistency Contract](design/cache-consistency-contract.md) | Public read cache, ETag, invalidation, CDN cache tag contract |
| [Cloud Multipart State Machine](design/cloud-multipart-state-machine.md) | Multipart upload session transitions and recovery rules |
| [Profile Workspace Persistence](design/profile-workspace-persistence.md) | Profile workspace draft and published persistence rules |
| [Release UI QA Matrix](https://github.com/AquilaXk/aquila-blog-web/blob/main/docs/design/release-ui-qa-matrix.md) | Web-owned release UI quality checklist |
| [Security CSP Rollout](https://github.com/AquilaXk/aquila-blog-web/blob/main/docs/design/security-csp-rollout.md) | Web-owned CSP rollout notes |
| [Launch Gate Operations](design/launch-gate-operations.md) | Launch readiness and operations checks |
| [Code Comment Policy](design/code-comment-policy.md) | Code comment policy |

## Tracked Ops Runbooks

| Document | Description |
| --- | --- |
| [Cloud Transfer Limits and Recovery](ops/cloud-transfer-limits-and-recovery.md) | Edge/Caddy/Spring size limits, Cloudflare ToS risk, upload/playback recovery commands |
| [Backup Restore Runbook](ops/backup-restore-runbook.md) | Isolated encrypted backup restore and traffic-open procedure |
| [Security Incident Runbook](ops/security-incident-runbook.md) | Generic security incident response |
| [Security Incident Exercise Template](ops/security-incident-exercise-template.md) | Incident exercise record template |
