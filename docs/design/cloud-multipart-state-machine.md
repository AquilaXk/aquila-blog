# Cloud Multipart Upload State Machine

## 목적

클라우드 동영상 multipart upload session의 상태 전이, retry 기준, idempotency key, 장애 후 수동 복구 절차를 정의한다.

## 구현 근거

| 책임 | 구현 |
| --- | --- |
| 상태 모델 | `back/src/main/kotlin/com/back/boundedContexts/cloud/model/CloudVideoUploadSession.kt` |
| 상태 전이 서비스 | `back/src/main/kotlin/com/back/boundedContexts/cloud/application/service/CloudVideoUploadSessionService.kt` |
| Session repository port | `back/src/main/kotlin/com/back/boundedContexts/cloud/application/port/output/CloudVideoUploadSessionRepositoryPort.kt` |
| Part repository port | `back/src/main/kotlin/com/back/boundedContexts/cloud/application/port/output/CloudVideoUploadSessionRepositoryPort.kt` |
| Cleanup scheduler | `back/src/main/kotlin/com/back/boundedContexts/cloud/adapter/scheduler/CloudVideoUploadSessionCleanupScheduledJob.kt` |
| cloud_file reconcile | `CloudFileReconcileService` + ShedLock `CloudFileReconcileScheduledJob` + `CloudFileReconcileMetricsBinder` |
| Storage adapter contract | `back/src/main/kotlin/com/back/global/storage/application/port/output/CloudStoragePort.kt` (`head`, `listObjects`) |

## 상태

| 상태 | 의미 |
| --- | --- |
| `INITIATING` | DB session row는 생성됐고 remote multipart upload init을 진행 중이다. |
| `IN_PROGRESS` | uploadId가 연결됐고 part upload/complete/cancel 요청을 받을 수 있다. |
| `UPLOADING_PART` | 특정 part를 remote storage에 업로드 중이다. |
| `COMPLETING` | 모든 part metadata가 있고 remote complete 호출 중이다. |
| `ABORTING` | cancel/expire 보상으로 remote multipart abort 호출 중이다. |
| `COMPLETED` | remote complete가 끝났고 `CloudFile` row가 생성됐다. |
| `CANCELLED` | 사용자가 취소했고 part metadata가 삭제됐다. |
| `EXPIRED` | 만료 cleanup이 abort와 part metadata 삭제를 끝냈다. |
| `FAILED` | initiate/part metadata/complete/abort 중 복구 불가능한 예외가 기록됐다. |

## 전이 계약

- `createSession`은 `INITIATING` row를 먼저 저장한 뒤 remote `initiateMultipartUpload`을 호출한다.
- uploadId attach는 `INITIATING -> IN_PROGRESS` compare-and-set 전이다.
- `uploadPart`는 `IN_PROGRESS -> UPLOADING_PART -> IN_PROGRESS`로 claim을 잡고 해제한다.
- part 업로드 성공 시 `expiresAt`을 sliding 연장한다(`now + cloudVideoResumableExpiresSeconds`, 기본 24h).
  절대 상한은 `createdAt + cloudVideoResumableAbsoluteMaxSeconds`(기본 7d)이며,
  MinIO `MINIO_API_STALE_UPLOADS_EXPIRY`(8d) − margin(1d) 이하여야 한다.
- 같은 `sessionId + partNumber`가 이미 저장되어 있고 byte size와 `partSha256`이 같으면 기존 part 응답을 반환한다.
  byte size 또는 SHA-256이 다르면 409로 거절한다(조용한 무시 금지).
- `complete`는 모든 part number가 `1..totalParts`로 존재할 때만 `IN_PROGRESS -> COMPLETING -> COMPLETED`로 진행한다.
- `complete` 승격 시 HeadObject `contentLength == session.byteSize`를 재확인하고,
  part SHA-256들로 composite checksum(`sha256-composite:<hex>-<N>`)을 `CloudFile.checksumSha256`에 저장한다.
  크기 불일치면 객체를 삭제한 뒤 session을 `FAILED`로 둔다.
- `complete`는 이미 `COMPLETED`인 session에 대해 같은 `CloudFile` 결과를 멱등 반환한다(`sessionId`가 idempotency key).
- `COMPLETING` session에 대한 `complete` 재호출은 허용된다. HeadObject 커밋 판정 후 메타데이터 저장만 승계하거나, 미커밋이면 remote complete를 다시 시도한다.
- `cancel`과 expiry cleanup은 `IN_PROGRESS -> ABORTING -> CANCELLED|EXPIRED` 경로를 사용한다.
- terminal status는 `COMPLETED`, `CANCELLED`, `EXPIRED`, `FAILED`이다.

## Retry 조건

- multipart upload는 client-driven API 흐름이므로 일반 task retry 대상이 아니다.
- part upload 중 remote storage 호출이 실패하면 `UPLOADING_PART -> IN_PROGRESS`로 claim을 풀고 client가 같은 part를 다시 보낼 수 있게 한다.
- part metadata 저장 실패는 remote part가 이미 저장됐을 수 있으므로 session을 `FAILED`로 표시한다.
- remote complete 호출이 실패하면 즉시 `FAILED`로 보내지 않고 HeadObject로 커밋 여부를 먼저 판정한다.
  - `objectKey` 존재 AND `contentLength == session.byteSize`이면 storage 커밋으로 보고 메타데이터 저장으로 승계한다(`NoSuchUpload` 포함).
  - 미커밋이면 `COMPLETING` 기준 `FAILED`로 표시한다.
- remote complete가 성공한 뒤 `CloudFile` 저장 또는 session `COMPLETED` 저장이 실패하면 row를 `COMPLETING`에 유지한다(`FAILED`로 잠그지 않음). client는 같은 session id로 `complete`를 재호출해 메타데이터 저장에 수렴한다.
- abort 실패는 `ABORTING` 기준 `FAILED`로 표시한다.
- expired session cleanup은 scheduler가 batch로 호출하며 session 단위 실패를 warn log로 격리하고 다음 batch에서 다른 session 처리를 계속한다.

## Stale 중간상태 자동 회수

프로세스 크래시/재시작으로 `INITIATING`, `UPLOADING_PART`, `COMPLETING`, `ABORTING`에 고착된 세션은
`CloudVideoUploadSessionCleanupScheduledJob`가 `purgeStaleIntermediateSessions`로 회수한다.
판정은 `expiresAt`이 아니라 `modifiedAt` 기준 상태별 유예다.

| 상태 | 기본 유예 (`modifiedAt`) | 설정 키 |
| --- | --- | --- |
| `INITIATING` | 15분 | `custom.storage.cloudVideoResumableStaleInitiatingGraceSeconds` |
| `COMPLETING`, `ABORTING` | 30분 | `custom.storage.cloudVideoResumableStaleCompletingGraceSeconds` |
| `UPLOADING_PART` | 60분 | `custom.storage.cloudVideoResumableStaleUploadingPartGraceSeconds` |

회수 전이:

1. repository `findStaleIntermediate`로 후보를 고른다.
2. 일반 경로: CAS `expected -> ABORTING` → `abortMultipartUpload`(`NoSuchUpload`/404는 성공) → part row 삭제 → `FAILED`.
3. `INITIATING`이고 `uploadId`가 없으면 abort를 생략하고 바로 `FAILED`.
4. `COMPLETING`은 abort 전에 HeadObject 커밋 판정을 한다.
   - `objectKey` 존재 AND `contentLength == session.byteSize`이면 abort하지 않고 `CloudFile` 저장 후 `COMPLETED`.
   - 미커밋이면 일반 abort 경로로 `FAILED`.
5. 만료 `IN_PROGRESS` 정리는 기존 `purgeExpiredSessions`(`EXPIRED`)와 분리된다.

스토리지 측 incomplete multipart는 MinIO `MINIO_API_STALE_UPLOADS_EXPIRY`(운영 명시값 8d) /
`MINIO_API_STALE_UPLOADS_CLEANUP_INTERVAL`(6h)로 정리한다. 앱 세션 절대 상한(7d, #1229)보다
길어야 진행 중 part가 먼저 지워지지 않는다.

## Idempotency key

- Session identity: `CloudVideoUploadSession.id` — 같은 session의 `complete` 재호출은 항상 같은 `CloudFile`로 수렴한다.
- Remote object identity: `CloudVideoUploadSession.objectKey`, DB unique column.
- Remote upload identity: `CloudVideoUploadSession.uploadId`.
- Part identity: unique constraint `session_id + part_number` on `CloudVideoUploadPart`.
- Completed file identity: `completedFileId`; 이미 `COMPLETED`면 remote complete를 다시 호출하지 않고 기존 파일을 반환한다.
- Storage commit detector: `CloudMultipartCommitDetector`(`HeadObject` + `contentLength == byteSize`). stale `COMPLETING` 회수와 complete retry가 공유한다.

## cloud_file ↔ storage reconcile

- `CloudFileReconcileService`가 `cloud/` prefix `listObjects`와 active `cloud_file` 행을 양방향 대사한다.
- 고아 객체(스토리지 O, 메타 X): 진행 중(non-terminal) session `objectKey`와 최근 생성 객체(기본 24h grace)는 제외한다.
- 고아 메타(메타 O, 객체 X): inventory가 truncate되지 않았을 때만 판정한다.
- 기본은 dry-run(감지·메트릭만). `custom.storage.cloudReconcileRepairEnabled=true`일 때만 고아 객체 삭제/고아 메타 soft-delete를 수행하며, 고아 객체 수가 safety threshold를 넘으면 삭제를 막는다.
- 주기 실행: `CloudFileReconcileScheduledJob`가 ShedLock(`cloudFileReconcile`)으로 `reconcile()`을 호출한다(기본 `custom.storage.cloudReconcileFixedDelayMs=3600000`).
- 메트릭: `storage.cloud_file.reconcile.*` (`CloudFileReconcileMetricsBinder`가 `diagnose()` 스냅샷을 갱신).

## 실패 후 수동 복구

실행 명령 단위 운영 절차(한도 표·`mc ls --incomplete`·token 삭제 SQL)는
[`docs/ops/cloud-transfer-limits-and-recovery.md`](../ops/cloud-transfer-limits-and-recovery.md)를 따른다.

1. session status를 DB에서 확인한다: `cloud_video_upload_session.status`, `failure_reason`, `object_key`, `upload_id`, `expires_at`.
2. `FAILED`가 `INITIATING` failure이고 uploadId가 없다면 remote multipart가 생성되지 않았거나 attach 전에 실패한 상태다. client가 새 session을 만들게 한다.
3. `FAILED`가 `UPLOADING_PART` metadata save failure이면 remote part가 있을 수 있다. 같은 objectKey/uploadId를 remote storage에서 abort한 뒤 session을 운영 기록에 남기고 client에게 새 session을 만들게 한다.
4. `FAILED`가 `COMPLETING` failure이면 remote complete 결과가 불명확하다. remote object 존재 여부를 확인하고, object가 존재하면 `CloudFile` row 누락 여부를 점검한다.
5. `COMPLETING` 상태가 요청 timeout/retry window를 지나 계속 남아 있으면 remote complete 성공 후 DB 저장이 실패한 stuck completion으로 분류한다. 자동 회수는 HeadObject 커밋 판정 후 `CloudFile`/session을 `COMPLETED`로 맞추거나, 미커밋이면 abort 후 `FAILED`로 종결한다. 그래도 불일치가 남으면 remote object와 `CloudFile` row, `completedFileId`를 대조하고 운영 기록을 남긴다.
6. `FAILED`가 `ABORTING` failure이면 remote multipart upload가 orphan일 수 있다. remote storage에서 uploadId를 abort한 뒤 session을 terminal recovery 대상으로 기록한다.
7. 만료 `IN_PROGRESS` session은 `purgeExpiredSessions`로, stale 중간상태 session은 `purgeStaleIntermediateSessions`로 처리한다. scheduler가 멈췄다면 worker/admin runtime 상태와 cleanup job log를 먼저 확인한다.

## 금지 사항

- `UPLOADING_PART`, `COMPLETING`, `ABORTING` 상태를 DB에서 직접 `IN_PROGRESS`로 되돌리지 않는다. remote side effect 결과를 먼저 확인해야 한다.
- part metadata를 수동 insert할 때 remote eTag 없이 임의 값을 넣지 않는다.
- `objectKey`를 재사용해 새 session을 만들지 않는다.
