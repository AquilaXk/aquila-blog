# Cache Consistency Contract

## 목적

공개 post read path의 ETag, Redis/local cache, CDN cache tag, 작성자 표시 변경의 일관성 계약을 정의한다.

## 구현 근거

| 책임 | 구현 |
| --- | --- |
| ETag seed | `back/src/main/kotlin/com/back/boundedContexts/post/adapter/web/PostPublicReadEtagSeedBuilder.kt` |
| Cache header | `back/src/main/kotlin/com/back/boundedContexts/post/adapter/web/PostPublicReadCacheHeaderWriter.kt` |
| Cache tag token | `back/src/main/kotlin/com/back/boundedContexts/post/application/support/PostCacheTags.kt` |
| Read cache eviction | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostReadCacheInvalidator.kt` |
| Write side effect | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostWriteSideEffectHandler.kt` |
| Invalidation scope | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostWriteSideEffectCommand.kt` |
| Author update listener | `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostAuthorPublicReadCacheInvalidationListener.kt` |
| Member profile event | `back/src/main/kotlin/com/back/boundedContexts/member/application/event/MemberPublicProfileChangedEvent.kt` |

## Consistency guarantee

- 공개 feed/detail ETag seed는 post modified time, version, count fields, author public representation을 포함한다.
- author representation은 `authorId`, `authorName`, `authorUsername`, profile image URL 계열을 length-prefixed token으로 포함한다.
- post write side effect는 DB commit 이후 task로 실행되어 read cache eviction, CDN purge event, recommendation refresh/evict를 분리 수행한다.
- author nickname/profile image 변경은 `MemberPublicProfileChangedEvent`로 발행되고, post read cache는 `invalidateAuthorRepresentation`으로 clear된다.
- Cache tag는 `PostCacheTags`에서 단일 정의하며 response header와 purge key drift를 줄인다.

## Invalidation scope

| 변경 | Eviction target |
| --- | --- |
| public post create/delete/restore/hard delete | hot read pages, search first page, impacted tag pages, public tags, detail |
| public post title/content/tag/listed visibility 변경 | impact에 따라 hot read pages, search, tag pages, public tags, detail |
| detail-only 변경 | detail snapshot/meta/content/negative cache |
| author public representation 변경 | admin first page, feed, explore, cursor first page, bootstrap, search, public detail snapshot/meta/content clear |
| tag count 변경 | local tag count cache와 `PostQueryCacheNames.TAGS` public key |

## Retry 조건

- post write side effect task는 `post.write.side-effect`이며 `maxRetries=5`, `baseDelaySeconds=10`, `backoffMultiplier=2.0`, `maxDelaySeconds=300`으로 재시도된다.
- cache eviction 자체는 idempotent하므로 같은 task가 여러 번 실행되어도 안전해야 한다.
- author update listener는 transaction after-commit에서 동작하며 eviction 실패를 warn log로 남긴다. listener 실패는 member update transaction을 되돌리지 않는다.

## Idempotency key

- Queue key는 post write side effect payload UID이다.
- CDN/cache purge key는 `PostCacheTags.writeInvalidationTags(postId, beforeTags, afterTags)` 결과와 invalidation scope로 결정된다.
- ETag key는 response body DTO의 public representation으로 계산되며 별도 저장 상태를 만들지 않는다.

## 실패 후 수동 복구

1. post write side effect task가 FAILED이면 `GET /system/api/v1/adm/tasks`에서 `post.write.side-effect` 상태를 확인한다.
2. `POST /system/api/v1/adm/tasks/replay-failed`로 `post.write.side-effect`만 replay한다.
3. author representation stale이 의심되면 해당 member update 이후 post read caches가 clear됐는지 `post.read.cache.evict` metric의 `reason=author-representation`을 확인한다.
4. CDN stale이 의심되면 response의 cache tag와 `PostCacheTags` token이 같은지 확인하고, 해당 post/tag/list/detail tag를 purge한다.
5. Redis 장애 또는 cache miss는 공개 read path가 DB/source fallback을 사용하므로 데이터 정합성보다 응답 지연을 먼저 점검한다.

## 금지 사항

- ETag seed에 포함된 public field를 변경하면서 read cache invalidation 범위를 갱신하지 않으면 안 된다.
- `PostCacheTags` 밖에서 임의 cache tag string을 만들지 않는다.
- author nickname/profile image 변경은 post cache clear와 연결되어야 한다.
