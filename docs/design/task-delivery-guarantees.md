# Task Delivery Guarantees

## 목적

이 문서는 backend durable task queue의 전달 보장, retry 기준, idempotency key, 장애 후 수동 복구 절차를 정의한다. 대상 구현은 `back/src/main/kotlin/com/back/global/task/**`와 post side effect task이다.

## 구현 근거

| 책임 | 구현 |
| --- | --- |
| Queue 저장 | `back/src/main/kotlin/com/back/global/task/application/TaskFacade.kt` |
| 상태 모델 | `back/src/main/kotlin/com/back/global/task/model/Task.kt` |
| Scheduler/worker | `back/src/main/kotlin/com/back/global/task/adapter/scheduler/TaskProcessingScheduledJob.kt` |
| Retry policy | `back/src/main/kotlin/com/back/global/task/application/TaskRetryPolicy.kt` |
| Handler context | `back/src/main/kotlin/com/back/global/task/application/TaskExecutionContextHolder.kt` |
| DLQ replay | `back/src/main/kotlin/com/back/global/task/application/TaskDlqReplayService.kt` |
| Retention cleanup | `back/src/main/kotlin/com/back/global/task/application/TaskRetentionService.kt` |
| 운영 API | `back/src/main/kotlin/com/back/global/system/adapter/web/ApiV1AdmSystemController.kt` |
| Post write task | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostWriteSideEffectCommand.kt` |
| Post interaction task | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostInteractionSideEffectCommand.kt` |

## Delivery guarantee

- Queue insert는 `Task.uid` unique constraint와 PostgreSQL `INSERT ... ON CONFLICT (uid) DO NOTHING`으로 원자 멱등성을 보장한다. duplicate는 caller transaction을 rollback-only로 만들거나 handler를 inline 실행하지 않는다.
- 저장 payload는 `schemaVersion`, `taskType`, `sensitivity`, 생성·만료 시각과 payload JSON을 가진 v2 envelope다. migration된 v1은 metadata와 legacy payload fields를 한 object에 둔 flat exact format이며 decode 실패 뒤 다른 version/class를 시도하지 않는다.
- blue-green candidate migration과 active N-1 runtime의 overlap에서는 PostgreSQL insert trigger가 schemaVersion 없는 legacy insert만 flat v1으로 정규화한다. v2 envelope는 변경하지 않고, terminal status trigger는 N-1 worker 전이에도 동일 retention을 적용한다.
- Scheduler는 `PENDING` + `nextRetryAt <= now` task를 DB lock으로 가져와 `PROCESSING`으로 전이한다.
- Worker는 task마다 `executionLeaseToken`을 발급하고, 완료/실패 전이는 현재 lease가 일치할 때만 반영한다.
- 처리 보장은 at-least-once이다. 동일 task가 timeout, worker crash, stale PROCESSING recovery 뒤 재실행될 수 있으므로 handler는 `TaskExecutionContext.idempotencyKey` 또는 payload UID를 기준으로 idempotent해야 한다.
- Post write/interaction side effect task는 payload UID를 이벤트 UID 또는 command operation UID에서 만든다. 같은 payload UID는 queue에 중복 저장되지 않는다.
- Post write task는 본문 대신 image/file object key snapshot만 저장한다. raw payload는 admin 응답, log, metric, CI artifact에 포함하지 않는다.

## Retry 조건

- Handler 예외 또는 timeout은 `Task.scheduleRetry`로 처리한다.
- retry delay는 handler의 `@Task` annotation에서 지정한 `TaskRetryPolicy`를 사용한다.
- handler 등록이 없거나 envelope/payload가 malformed·unknown version·expired면 `QUARANTINED`로 전이하고 payload를 즉시 redact한다. handler, retry, DLQ replay는 실행하지 않는다.
- `retryCount >= maxRetries`가 되면 `FAILED` 상태로 남고 DLQ로 취급한다.
- `PROCESSING`이 `custom.task.processor.processingTimeoutSeconds`보다 오래 유지되면 `recoverStaleProcessingTasks`가 lease를 비우고 retry 또는 FAILED로 이동시킨다.
- ready backlog 조회가 실패하면 현재 poll을 중단한다. 최대 동시성이나 stale 진단값을 정상값으로 사용하지 않는다.
- `custom.task.processor.perTypeMaxConcurrent`의 빈 값 이외 malformed·중복·범위 밖 항목은 startup을 실패시킨다.

## Payload·row retention

- `COMPLETED`: payload 즉시 redact, row 7일 뒤 purge.
- `FAILED`: payload 최대 7일 보존 후 redact하고 row는 30일 뒤 purge. `EXPIRING_SECRET` payload는 자체 expiry가 더 빠르면 그 시각을 상한으로 쓴다.
- `QUARANTINED`: payload 즉시 redact, row 30일 뒤 purge.
- cleanup은 한 transaction에서 설정된 batch 범위와 최대 batch 횟수만 처리한다. `PROCESSING` 또는 execution lease가 있는 row는 redaction·purge하지 않는다.

## Idempotency key

- Queue-level key: `Task.uid`.
- Handler-level key: `TaskExecutionContext.idempotencyKey`, 현재 구현에서는 `taskUid.toString()`.
- Post write side effect:
  - domain event가 있으면 event UID 기반.
  - no-event side effect는 command operation UID 기반.
- Post interaction side effect:
  - domain event와 recommendation refresh가 동시에 필요하면 event publish task와 recommendation refresh task를 분리해 각각 UID를 가진다.

## 실패 후 수동 복구

1. 운영 API `GET /system/api/v1/adm/tasks`로 pending/processing/failed/stale 상태를 확인한다.
2. payload가 아직 redact되지 않은 FAILED task만 `POST /system/api/v1/adm/tasks/replay-failed`로 재투입한다.
3. replay 요청에서 `taskType`을 지정하면 특정 handler만 재시도한다.
4. `resetRetryCount=true`는 retry count를 0으로 되돌리고, `false`는 `maxRetries - 1` 이하로 보정한다.
5. replay된 task는 `PENDING`, `nextRetryAt=now`, `errorMessage=manual-dlq-replay@...`로 저장된다.

## 운영 확인 지표

- `task.queue.enqueue.result{taskType,status=inserted|duplicate}`
- `task.processor.result{taskType,status=success|retry|dlq|quarantine}`
- `task.payload.quarantine{taskType,reason}` (`taskType=unregistered`로 미등록 type cardinality를 닫는다)
- `task.processor.handler.duration{taskType}`
- `task.processor.fetch.limit`
- `task.processor.queue.available` / `task.processor.queue.errors`
- `task.queue.diagnostics.available` / `task.queue.diagnostics.errors` (queue snapshot gauge는 `available=1`일 때만 유효하다)
- `task.retention.action{action=payload_redacted|row_purged}`
- `task.dlq.replay.count`

## 금지 사항

- handler 내부에서 payload UID를 무시하고 non-idempotent external side effect를 직접 수행하면 안 된다.
- timeout 이후 동일 side effect가 다시 실행될 수 있으므로 외부 시스템 호출은 task UID, aggregate ID, event UID 중 하나로 중복 방지되어야 한다.
- `PROCESSING` row를 DB에서 직접 수정해 lease를 우회하지 않는다. 수동 복구는 DLQ replay API 또는 stale recovery 경로를 사용한다.
- queue/diagnostics/handler 장애를 inline 실행, alternate transport/provider, legacy/raw/default decoder, search tag fallback, unknown-event success로 우회하지 않는다.
