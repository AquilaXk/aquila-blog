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
| Storage adapter contract | `back/src/main/kotlin/com/back/global/storage/application/port/output/CloudStoragePort.kt` |

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
- 같은 `sessionId + partNumber`가 이미 저장되어 있고 byte size가 같으면 기존 part 응답을 반환한다.
- `complete`는 모든 part number가 `1..totalParts`로 존재할 때만 `IN_PROGRESS -> COMPLETING -> COMPLETED`로 진행한다.
- `cancel`과 expiry cleanup은 `IN_PROGRESS -> ABORTING -> CANCELLED|EXPIRED` 경로를 사용한다.
- terminal status는 `COMPLETED`, `CANCELLED`, `EXPIRED`, `FAILED`이다.

## Retry 조건

- multipart upload는 client-driven API 흐름이므로 일반 task retry 대상이 아니다.
- part upload 중 remote storage 호출이 실패하면 `UPLOADING_PART -> IN_PROGRESS`로 claim을 풀고 client가 같은 part를 다시 보낼 수 있게 한다.
- part metadata 저장 실패는 remote part가 이미 저장됐을 수 있으므로 session을 `FAILED`로 표시한다.
- complete 실패는 `COMPLETING` 기준 `FAILED`로 표시한다.
- abort 실패는 `ABORTING` 기준 `FAILED`로 표시한다.
- expired session cleanup은 scheduler가 batch로 호출하며 session 단위 실패를 warn log로 격리하고 다음 batch에서 다른 session 처리를 계속한다.

## Idempotency key

- Session identity: `CloudVideoUploadSession.id`.
- Remote object identity: `CloudVideoUploadSession.objectKey`, DB unique column.
- Remote upload identity: `CloudVideoUploadSession.uploadId`.
- Part identity: unique constraint `session_id + part_number` on `CloudVideoUploadPart`.
- Completed file identity: `completedFileId`; complete가 성공하면 같은 session은 terminal status라 재완료되지 않는다.

## 실패 후 수동 복구

1. session status를 DB에서 확인한다: `cloud_video_upload_session.status`, `failure_reason`, `object_key`, `upload_id`, `expires_at`.
2. `FAILED`가 `INITIATING` failure이고 uploadId가 없다면 remote multipart가 생성되지 않았거나 attach 전에 실패한 상태다. client가 새 session을 만들게 한다.
3. `FAILED`가 `UPLOADING_PART` metadata save failure이면 remote part가 있을 수 있다. 같은 objectKey/uploadId를 remote storage에서 abort한 뒤 session을 운영 기록에 남기고 client에게 새 session을 만들게 한다.
4. `FAILED`가 `COMPLETING` failure이면 remote complete 결과가 불명확하다. remote object 존재 여부를 확인하고, object가 존재하면 `CloudFile` row 누락 여부를 점검한다.
5. `FAILED`가 `ABORTING` failure이면 remote multipart upload가 orphan일 수 있다. remote storage에서 uploadId를 abort한 뒤 session을 terminal recovery 대상으로 기록한다.
6. 만료 session은 `CloudVideoUploadSessionCleanupScheduledJob`가 `purgeExpiredSessions`로 처리한다. scheduler가 멈췄다면 worker/admin runtime 상태와 cleanup job log를 먼저 확인한다.

## 금지 사항

- `UPLOADING_PART`, `COMPLETING`, `ABORTING` 상태를 DB에서 직접 `IN_PROGRESS`로 되돌리지 않는다. remote side effect 결과를 먼저 확인해야 한다.
- part metadata를 수동 insert할 때 remote eTag 없이 임의 값을 넣지 않는다.
- `objectKey`를 재사용해 새 session을 만들지 않는다.
