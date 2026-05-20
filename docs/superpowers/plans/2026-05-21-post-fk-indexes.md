# post FK 기반 정리 쿼리 인덱스 보강

## 문제
- prod DB에서 hard-delete/post cleanup 경로가 사용하는 `post_comment.post_id`, `post_comment.parent_comment_id`, `post_like.post_id`, `post_write_request_idempotency.post_id/created_at` 조회를 받치는 선두 인덱스가 부족하다.

## issue
- `#287`

## pr
- `#294 https://github.com/AquilaXk/aquila-blog/pull/294`

## repro
- Supabase prod schema에서 `post_comment.post_id`, `post_comment.parent_comment_id`, `post_like.post_id`가 FK 선두 인덱스 없이 남아 있고, `post_write_request_idempotency.created_at < ? order by created_at` cleanup query가 pg_stat_statements에 반복 집계된다.

## done_when
- post hard-delete/cleanup 관련 인덱스가 repeatable migration과 model AfterDDL에 함께 반영되고, 계약 테스트와 CI가 통과한 뒤 PR이 merge된다.

## allow
- `back/src/main/kotlin/com/back/boundedContexts/post/model/**`
- `back/src/main/resources/db/migration/R__operational_indexes.sql`
- `back/src/test/kotlin/com/back/boundedContexts/post/**`
- `docs/superpowers/plans/2026-05-21-post-fk-indexes.md`

## deny
- `front/**`
- `back/src/main/kotlin/com/back/global/**`
- `back/src/main/resources/db/migration/V*.sql`
- `infra/**`

## verify
- `back/gradlew -p back test --tests com.back.boundedContexts.post.model.PostOperationalIndexContractTest`
- `back/gradlew -p back ktlintCheck`
- `back/gradlew -p back ciFastCheck --rerun-tasks`
- GitHub PR CI checks

## commit_plan
1. `perf(post): FK 정리 인덱스 보강`
   - post hard-delete와 idempotency cleanup 쿼리 인덱스를 한 기능 단위로 보강한다.
