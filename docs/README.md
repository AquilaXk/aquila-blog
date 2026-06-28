# Aquila Blog Docs

Aquila Blog의 설계, 운영, 품질, 성능, 법무 문서를 모아 둔 문서 허브입니다.

## Entry Points

| Area | Document | Description |
| --- | --- | --- |
| Frontend | [front/README.md](../front/README.md) | Frontend routes, scripts, environment variables, UI quality checks |
| Backend | [back/README.md](../back/README.md) | Backend architecture, API modules, quality checks, OpenAPI flow |
| Performance | [perf/k6/README.md](../perf/k6/README.md) | Read-path load and chaos scenarios |
| Deployment | [deploy/homeserver/HARDENING.md](../deploy/homeserver/HARDENING.md) | Home server hardening checklist |
| Legacy Infra | [infra/README.md](../infra/README.md) | Legacy cloud infra experiment; current production uses homeserver deploy |

## Design Notes

| Document | Description |
| --- | --- |
| [Task Delivery Guarantees](design/task-delivery-guarantees.md) | Durable task queue delivery, retry, idempotency, DLQ replay contract |
| [Cache Consistency Contract](design/cache-consistency-contract.md) | Public read cache, ETag, invalidation, CDN cache tag contract |
| [Cloud Multipart State Machine](design/cloud-multipart-state-machine.md) | Multipart upload session transitions and recovery rules |
| [Profile Workspace Persistence](design/profile-workspace-persistence.md) | Profile workspace draft and published persistence rules |
| [Release UI QA Matrix](design/release-ui-qa-matrix.md) | Release UI quality checklist |
| [Security CSP Rollout](design/security-csp-rollout.md) | CSP rollout notes |
| [Launch Gate Operations](design/launch-gate-operations.md) | Launch readiness and operations checks |
| [Privacy Launch Gate Checklist](design/privacy-launch-gate-checklist.md) | Privacy launch checklist |
| [Code Comment Policy](design/code-comment-policy.md) | Code comment policy |

## Legal / Privacy Runbooks

| Document | Description |
| --- | --- |
| [Account Deletion Runbook](legal/account-deletion-runbook.md) | Account deletion process |
| [Backup Restore Privacy Runbook](legal/backup-restore-privacy-runbook.md) | Backup and restore privacy checks |
| [Data Subject Request Runbook](legal/data-subject-request-runbook.md) | Data subject request handling |
| [Policy Change Runbook](legal/policy-change-runbook.md) | Policy change process |
| [Privacy Incident Runbook](legal/privacy-incident-runbook.md) | Privacy incident response |
| [Privacy Tabletop Exercise Template](legal/privacy-tabletop-exercise-template.md) | Tabletop exercise template |
| [Vendor Onboarding Runbook](legal/vendor-onboarding-runbook.md) | Vendor onboarding checks |
