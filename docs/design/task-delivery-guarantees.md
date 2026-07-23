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
| 운영 API | `back/src/main/kotlin/com/back/global/system/adapter/web/ApiV1AdmSystemController.kt` |
| Post write task | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostWriteSideEffectCommand.kt` |
| Post interaction task | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostInteractionSideEffectCommand.kt` |

## Delivery guarantee

- Queue insert는 `Task.uid` unique constraint와 `TaskFacade.saveTaskIdempotently`로 idempotent insert를 보장한다.
- Scheduler는 `PENDING` + `nextRetryAt <= now` task를 DB lock으로 가져와 `PROCESSING`으로 전이한다.
- Worker는 task마다 `executionLeaseToken`을 발급하고, 완료/실패 전이는 현재 lease가 일치할 때만 반영한다.
- 처리 보장은 at-least-once이다. 동일 task가 timeout, worker crash, stale PROCESSING recovery 뒤 재실행될 수 있으므로 handler는 `TaskExecutionContext.idempotencyKey` 또는 payload UID를 기준으로 idempotent해야 한다.
- Post write/interaction side effect task는 payload UID를 이벤트 UID 또는 command operation UID에서 만든다. 같은 payload UID는 queue에 중복 저장되지 않는다.

## Retry 조건

- Handler 예외 또는 timeout은 `Task.scheduleRetry`로 처리한다.
- retry delay는 handler의 `@Task` annotation에서 지정한 `TaskRetryPolicy`를 사용한다.
- handler 등록이 없으면 즉시 실패 처리된다.
- `retryCount >= maxRetries`가 되면 `FAILED` 상태로 남고 DLQ로 취급한다.
- `PROCESSING`이 `custom.task.processor.processingTimeoutSeconds`보다 오래 유지되면 `recoverStaleProcessingTasks`가 lease를 비우고 retry 또는 FAILED로 이동시킨다.

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
2. FAILED task는 `POST /system/api/v1/adm/tasks/replay-failed`로 재투입한다.
3. replay 요청에서 `taskType`을 지정하면 특정 handler만 재시도한다.
4. `resetRetryCount=true`는 retry count를 0으로 되돌리고, `false`는 `maxRetries - 1` 이하로 보정한다.
5. replay된 task는 `PENDING`, `nextRetryAt=now`, `errorMessage=manual-dlq-replay@...`로 저장된다.

## 운영 확인 지표

- `task.processor.result{status=success|retry|dlq}`
- `task.processor.handler.duration`
- `task.processor.fetch.limit`
- `task.dlq.replay.count`

## 금지 사항

- handler 내부에서 payload UID를 무시하고 non-idempotent external side effect를 직접 수행하면 안 된다.
- timeout 이후 동일 side effect가 다시 실행될 수 있으므로 외부 시스템 호출은 task UID, aggregate ID, event UID 중 하나로 중복 방지되어야 한다.
- `PROCESSING` row를 DB에서 직접 수정해 lease를 우회하지 않는다. 수동 복구는 DLQ replay API 또는 stale recovery 경로를 사용한다.
