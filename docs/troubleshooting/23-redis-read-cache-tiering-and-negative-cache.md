# Redis 읽기 캐시 최적화: 상세 분리·네거티브 캐시·무효화 정밀화 동시 적용

## 문제 요약 (한 줄 임팩트)
공개 읽기 트래픽에서 상세 DTO 단일 캐시와 광범위 무효화가 겹치며 Redis 메모리 효율과 DB 재조회 부하가 동시에 악화되어, 운영 구간에서 응답 안정성이 흔들릴 위험이 있었다.

## Situation (사용자/운영 증상)

- 사용자 증상
  - 인기 글 상세가 TTL 경계에서 순간적으로 느려지는 구간이 관찰됨.
  - 검색에서 빈 결과/없는 상세 id를 반복 조회할 때 매번 origin 조회가 발생.
- 운영 증상
  - 상세 캐시가 본문 포함 단일 키라 payload가 크고, 구간별 메모리 압박이 큼.
  - 캐시 무효화가 hot key 범위를 넓게 잡아 재가열 비용이 커짐.
  - cache hit/miss/evict 근거가 부족해 튜닝 판단이 경험 의존적이었음.

## Task (복구 목표 + 품질 목표)

- 상세 read 캐시를 메타/본문으로 분리해 메모리 사용량과 재생성 비용을 줄인다.
- 404/빈 검색 반복 요청을 단기 네거티브 캐시로 흡수한다.
- 무효화 범위를 운영 영향 키로 축소하고, 이유(reason) 기반 계측을 붙인다.
- 캐시/지연 지표를 추가해 대시보드 기반으로 운영 판단이 가능하도록 한다.

## Action (가설, 검증, 선택지 비교, 적용)

1. 상세 캐시 2계층 분리
- 가설: 본문을 항상 같은 키에 넣으면 메모리 효율이 나쁘고 무효화 비용이 커진다.
- 적용:
  - `post-detail-public-meta-v1`
  - `post-detail-public-content-v1`
  - 공개 상세 응답은 메타/본문을 합성해 반환.

2. 본문 조건부 캐시
- 가설: 초대형 본문까지 Redis에 동일 정책으로 저장하면 메모리 급증 위험이 커진다.
- 적용:
  - `custom.post.read.detail-content-cache-max-chars` 임계값 도입.
  - `content + contentHtml` 길이 합이 임계값 초과 시 content 캐시 저장 생략.

3. 스탬피드 완화
- 가설: TTL 만료 구간에서 동일 키 동시 재생성이 DB 급증을 유발한다.
- 적용:
  - feed/explore/search/tags: `@Cacheable(sync=true)` 유지.
  - 상세: `withDetailCacheLock`(키 단위 락 + double-check)로 단일 재생성.

4. 네거티브 캐시 도입
- 가설: 404 상세/빈 검색 1페이지 반복 조회는 캐시 없이 그대로 DB/쿼리 비용을 소비한다.
- 적용:
  - `post-detail-public-negative-v1` (404 상세)
  - `post-search-negative-v1` (검색 1페이지 빈 결과)
  - 기본 TTL 20초.

5. 무효화 정밀화 + 운영 계측
- 가설: 무효화 범위 축소와 reason 계측을 같이 붙여야 hit-rate/안정성 개선을 확인할 수 있다.
- 적용:
  - hot evict 대상 축소: pageSize `30/24`, sort `CREATED_AT` 중심.
  - 상세 무효화 시 meta/content/negative 동시 정리.
  - `evictReason`(`write`, `modify`, `soft-delete`, `restore`, `hard-delete`)를 코드 경로별로 명시.

6. 관측 지표 추가
- `post.read.endpoint.duration` (endpoint, status)
- `post.read.cache.result` (cache, result: hit/miss/put/skip_large)
- `post.read.cache.payload.bytes`
- `post.read.cache.payload.max.bytes`
- `post.read.cache.evict` (cache, scope, reason)

## Result (Before/After, 기능/지표 변화)

- Before
  - 상세 캐시가 본문 포함 단일 키 구조.
  - 404/빈 검색 반복 요청이 원본 조회로 직행.
  - 무효화가 넓고 계측이 부족해 운영 판단 근거가 약함.
- After
  - 상세 캐시가 메타/본문/네거티브로 분리되어 메모리·재생성 비용 제어 가능.
  - 반복 miss 요청이 단기 네거티브 캐시로 흡수.
  - 무효화 사유/캐시 결과/지연 지표를 기반으로 운영 튜닝 가능.

## Root Cause (기술 원인 + 프로세스 원인)

- 기술 원인
  - 공개 상세 read 경로가 "단일 캐시 키 + 동일 TTL"에 의존.
  - miss 트래픽(404/빈 검색)에 대한 별도 완충 계층 부재.
  - 무효화 범위가 보수적으로 넓어 재가열 비용을 증폭.
- 프로세스 원인
  - 캐시 정책 변경 시 지표 설계가 후행되어, 품질 판단이 계량 기반으로 닫히지 못함.

## 재발 방지 (자동화/테스트/운영 가드)

- 캐시 키 버전/분리 원칙 고정:
  - DTO/직렬화 정책 변경 시 캐시명 버전 증가.
  - 상세는 메타/본문/네거티브 3키 체계 유지.
- 배포 가드:
  - `ktlintCheck`, `compileKotlin` 선행으로 회귀 차단.
- 운영 가드:
  - `post.read.cache.*`, `post.read.endpoint.duration` 대시보드 고정.
  - 배포 직후 hit/miss/evict reason 변화 관찰.

## Artifacts (커밋, 파일, 로그, 리포트)

- 주요 파일
  - `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostPublicReadQueryService.kt`
  - `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostApplicationService.kt`
  - `back/src/main/kotlin/com/back/boundedContexts/post/application/service/PostQueryCacheNames.kt`
  - `back/src/main/resources/application.yaml`
  - `back/src/main/resources/application-prod.yaml`
  - `docs/agent/backend-posts.md`
- 검증 명령
  - `back/gradlew -p back ktlintCheck`
  - `back/gradlew -p back compileKotlin`

## 면접에서 30초로 설명하는 요약

"공개 읽기 캐시를 단일 키에서 메타/본문/네거티브로 계층화해 Redis 메모리와 origin 부하를 동시에 줄였습니다. 상세 본문은 길이 임계값을 넘으면 캐시를 생략했고, 404·빈 검색은 20초 네거티브 캐시로 흡수했습니다. 무효화는 hot key 중심으로 좁히고 evict reason/latency/cache hit-miss 계측을 붙여, 운영에서 감이 아니라 지표로 튜닝할 수 있게 만들었습니다."
