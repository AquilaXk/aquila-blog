# task 진단 쿼리 인덱스와 호출 주기 최적화

## 문제
- live DB에서 task 진단/스케줄러 count 쿼리가 수백만 회 반복되고, `task_type/status/next_retry_at/modified_at` 조합과 `PROCESSING modified_at` 조회를 받치는 인덱스가 부족하다.

## issue
- `#286`

## pr
- `#293 https://github.com/AquilaXk/aquila-blog/pull/293`

## repro
- Supabase `pg_stat_statements`에서 `task_type + status` count 계열 쿼리와 `status + modified_at` 계열 쿼리가 hot query로 반복 집계된다.

## done_when
- task 진단/스케줄러 쿼리 패턴을 받치는 operational index와 AfterDDL 계약이 일치하고, 진단 캐시 기본값이 30초로 늘어나 CI가 통과한 뒤 PR이 merge된다.

## allow
- `back/src/main/kotlin/com/back/global/task/**`
- `back/src/main/resources/application.yaml`
- `back/src/main/resources/db/migration/R__operational_indexes.sql`
- `back/src/test/kotlin/com/back/global/task/**`
- `docs/superpowers/plans/2026-05-21-task-diagnostic-indexes.md`

## deny
- `front/**`
- `back/src/main/kotlin/com/back/boundedContexts/**`
- `back/src/main/resources/db/migration/V*.sql`
- `infra/**`

## verify
- `back/gradlew -p back test --tests com.back.global.task.application.TaskQueueDiagnosticsServiceTest`
- `back/gradlew -p back ktlintCheck`
- `back/gradlew -p back ciFastCheck --rerun-tasks`
- GitHub PR CI checks

## commit_plan
1. `perf(task): 진단 쿼리 인덱스 보강`
   - task 진단 호출 주기와 task 조회 인덱스 계약을 한 기능 단위로 보강한다.
