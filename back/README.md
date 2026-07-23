# Aquila Blog Backend

`back/`는 Spring Boot + Kotlin 기반 API 서버입니다.  
게시글/회원/알림/운영 진단 API와 비동기 태스크 처리, 이미지 스토리지 연동을 담당합니다.

## Stack

- Spring Boot 4
- Kotlin
- Spring Data JPA + PostgreSQL
- Redis (락/큐/캐시 보조)
- MinIO (이미지 저장)
- Spring Security + OAuth2 (Kakao)
- SpringDoc OpenAPI

## 아키텍처 요약

- 패키지 기준: `boundedContexts/*`, `global/*`, `standard/*`
- 도메인 경계: `member`, `post`
- 계층 기준: `adapter` / `application` / `domain`
- 비동기 후속 처리: Task Queue + Scheduler (`TaskProcessingScheduledJob`)

주요 문서:

- [`../docs/design/System-Architecture.md`](../docs/design/System-Architecture.md)
- [`../docs/design/package-structure.md`](../docs/design/package-structure.md)
- [`../docs/session-handoff.md`](../docs/session-handoff.md)

## 핵심 기능

### 게시글 읽기/탐색

- `feed/explore/search` 제공
- `page + cursor` 하이브리드 전략
- read-model prewarm + 캐시 정책으로 cold start 완화

### 게시글 쓰기/수정/삭제

- 멱등 키(`Idempotency-Key`) 지원
- 수정 버전 충돌(`409-1`) 처리
- 쓰기 이벤트 기반 후속 작업
  - 검색 인덱스 동기화
  - 검색 엔진 미러링(옵션)
  - read prewarm

### 인증/세션

- 로그인/로그아웃/`auth/me` 제공
- 쿠키 기반 인증(`apiKey`, `accessToken`)
- OAuth2 로그인(Kakao)

#### 인증 흐름

인증 요청 처리는 `CustomAuthenticationFilter`가 담당하고, 토큰 파싱은 `AuthTokenExtractor`, 세션 해석은 `MemberSessionAuthenticationResolver`, access/refresh 경로는 각각 `AccessTokenAuthenticationHandler`와 `RefreshTokenAuthenticationHandler`로 분리되어 있다.

- 필터 대상 경로는 `/member/api/`, `/post/api/`, `/system/api/`, `/ws/`, `/sse/`이며, prod profile에서는 `/swagger-ui/`, `/v3/api-docs`도 보호 대상이다.
- `Authorization` header가 있으면 cookie보다 우선한다. 형식은 `Bearer <accessToken>` 또는 `Bearer <apiKey> <accessToken>`만 허용하고, 형식 오류는 `401-2`로 처리한다.
- header가 없으면 `AuthCookieNames`의 `apiKey`, `accessToken`, `refreshToken`, `sessionKey` cookie를 읽는다.
- `accessToken` 경로가 먼저 실행되고, mutating 요청에서 `apiKey`가 있으면 `ApiKeyAuthorityRefreshHandler`가 apiKey 회원 기준 access token 재발급을 먼저 시도한다.
- access token 경로가 인증을 완료하지 못하면 `RefreshTokenAuthenticationHandler`가 `sessionKey + refreshToken` 회전을 시도한다. 회전 실패나 session key 누락은 auth cookie 만료 후 `401-8`로 닫는다.
- `MemberSessionAuthenticationResolver`는 safe read 요청에서만 짧은 fresh token fallback을 허용한다. cookie `sessionKey`와 payload `sessionKey`가 같고 `custom.auth.session.freshLookupGraceSeconds` 이내일 때만 적용된다.
- 공개 API는 stale 또는 잘못된 인증 정보가 있어도 `SecurityContextHolder.clearContext()` 후 익명 요청으로 계속 처리한다. 보호 API는 `AppException`을 JSON API 응답으로 내리고, 예상 밖 인증 오류는 `401-1`로 변환한다.

### 운영 진단

- `/actuator/health/readiness`
- `/system/api/v1/adm/tasks`
- `/system/api/v1/adm/storage/cleanup`
- `/system/api/v1/adm/mail/signup`

## 게시글 운영 흐름

### 쓰기 후속 작업

게시글 생성, 수정, 삭제의 DB 변경은 `PostApplicationService` 트랜잭션 안에서 처리하고, 캐시 무효화와 첨부파일 retention, 추천 feature store, domain event 발행은 `PostWriteAfterCommitEvent`와 `PostWriteSideEffectCommand`를 통해 commit 이후로 넘긴다.

- `PostWriteSideEffectHandler.handle`은 `@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)`로 실행된다.
- `PostWriteSideEffectCommand`는 `postId`, 이전/현재/삭제 본문, 이전/현재 tag, `PostReadCacheInvalidationScope`, eviction reason, 추천 side effect(`REFRESH` 또는 `EVICT`)만 담는다.
- cache 범위는 boolean 조합 대신 `PostReadCacheInvalidationScope`로 표현한다. 생성/삭제/복구/하드 삭제는 공개 조회 대상 전체를, `DetailOnly`는 상세만, `PublicPostModified`는 공개 여부/제목/본문/tag 영향에 따라 feed/search/tag/detail 대상을 계산한다.
- commit 이후 `PostReadCacheInvalidator.invalidate`가 public read cache를 제거하고, `UploadedFileRetentionService.syncPostContent` 또는 `scheduleDeletedPostAttachments`가 본문 첨부파일 상태를 동기화한다.
- 추천 갱신은 post attr을 다시 hydrate한 뒤 `PostRecommendFeatureStoreService.refresh`를 호출하고, 추천 대상에서 빠지는 경우 `evict`를 호출한다.
- domain event가 있으면 commit 이후 별도 트랜잭션에서 `EventPublisher.publish`를 호출한다.
- 후속 작업은 `PROPAGATION_REQUIRES_NEW` 트랜잭션으로 분리되고 실패 시 warn 로그만 남긴다. 게시글 DB commit 성공을 되돌리지는 않으므로, retention 또는 추천 갱신 실패 로그는 운영 재처리 대상으로 본다.

### 공개 조회 cache 정책

공개 조회 응답은 `ApiV1PostController`가 데이터를 만든 뒤 `PostPublicReadResponseFactory`에 cache header와 ETag 처리를 위임한다.

- `respondWithEtag`는 `PostPublicReadCacheHeaderWriter`로 public `Cache-Control`, `X-Cache-Policy`, `Surrogate-Key`, `Cache-Tag`를 쓰고 weak ETag를 설정한다. `If-None-Match`가 일치하면 `304 Not Modified`를 반환한다.
- public cache header는 `public, max-age=<maxAge>, s-maxage=<sharedMaxAge>, stale-while-revalidate=<swr>, stale-if-error=<sharedMaxAge+swr>` 형식이다.
- `Surrogate-Key`는 공백 구분, `Cache-Tag`는 comma 구분으로 내려간다. token은 lowercase로 정규화하고 `[a-z0-9:_-]` 외 문자는 `-`로 바꾸며 최대 64자로 자른다.
- `respondNoStore`는 `private, no-store, max-age=0`을 적용한다. 로그인 사용자별 `actorHasLiked`, `actorCanModify` 값이 섞이거나 high entropy 검색어처럼 공유 cache 오염 위험이 있는 응답에 사용한다.
- `PostSearchCachePolicyResolver`는 빈 검색어는 `SEARCH_DEFAULT`, 길이 28자 이상 또는 token 4개 이상 또는 높은 unique ratio 검색어는 `SEARCH_NO_STORE`, 길이 16자 이상은 `SEARCH_SHORT`, 나머지는 `SEARCH_DEFAULT`로 분류한다.
- `PostPublicReadCachePolicies`는 feed/explore/detail/bootstrap/tag/search/related author별 TTL을 가진다. 정책 변경 시 ETag seed builder와 cache invalidation scope가 같은 응답 변수를 반영하는지 함께 확인한다.

### Demo seed 점검

- 실행 조건: `local`/`dev`/`test` profile + `custom.bootstrap.seed-demo-data-enabled=true`
- 운영 유사 DB 점검:
  `select id, email, username, role from member where email in ('system@test.com','holding@test.com','admin@test.com','user1@test.com','user2@test.com','user3@test.com');`
  `select id, title, published, listed from post where title in ('제목 1','제목 2','제목 3','비공개 글');`
- 발견 시 외부 접근을 먼저 차단하고, 계정 권한 제거 또는 데이터 삭제 후 seed flag/profile 설정을 재확인한다.

### 업로드 retention 흐름

게시글 이미지와 첨부파일 업로드는 `ApiV1PostImageController`, `PostImageStorageAdapter`, `UploadedFileRetentionService`가 나누어 처리한다.

- `POST /post/api/v1/posts/images`는 이미지 8MB와 storage `maxFileSizeBytes` 중 작은 값을 한도로 검사하고, `UploadImageRequest(inputStream, contentLength, contentType, originalFilename)`로 storage port에 넘긴다.
- `POST /post/api/v1/posts/files`는 첨부파일 10MB와 storage `maxFileSizeBytes` 중 작은 값을 한도로 검사하고, `UploadFileRequest(inputStream, contentLength, contentType, originalFilename)`로 넘긴다.
- 컨트롤러는 `file.bytes`를 사용하지 않는다. `MultipartFile.inputStream`과 `file.size`를 같이 넘기고, `PostImageStorageAdapter.prepareRepeatableUpload`가 실제 read byte 수와 선언된 `contentLength`를 비교한다.
- storage adapter는 input stream을 임시 파일로 복사해 repeatable upload를 만들고, 실제 크기가 설정 한도를 넘거나 `expectedContentLength`와 다르면 `400-1`로 중단한다. 성공/실패 후 임시 파일은 삭제한다.
- 이미지 업로드는 signature 기반 content type 감지를 수행한다. 허용 타입은 `image/jpeg`, `image/png`, `image/gif`, `image/webp`이며 선언 타입과 감지 타입이 명확히 충돌하면 차단한다.
- object key는 빈 값, `..`, `/` 시작, storage `keyPrefix` 밖 경로를 금지한다. 이 검증은 조회, 다운로드, 삭제 경로에 적용된다.
- storage 업로드 성공 후 `UploadedFileRetentionService.registerTempUpload`이 `TEMP` row를 `PROPAGATION_REQUIRES_NEW` 트랜잭션으로 등록한다. `purgeAfter`는 현재 시각 + `tempUploadSeconds`다.
- 게시글 저장/수정 commit 이후 `syncPostContent`가 현재 본문 URL의 object key를 게시글에 attach하고, 이전 본문에서 빠진 key는 `DETACHED_POST_ATTACHMENT`로 삭제 예약한다.
- 게시글 삭제는 `scheduleDeletedPostAttachments`가 본문 key를 `DELETED_POST_ATTACHMENT`로 삭제 예약하고, 복구는 `restoreDeletedPostAttachments`가 `DELETED`가 아닌 추적 row를 다시 attach한다.
- `purgeExpiredFiles`는 `TEMP`와 `PENDING_DELETE` 중 `purgeAfter <= now`인 row를 정리한다. 삭제 전 `isStillReferenced`로 게시글 본문과 member profile 참조를 다시 확인하고, 참조 중이면 active로 복구한다.

## 로컬 실행

```bash
cd back
./gradlew bootRun
```

## 품질 게이트

```bash
cd back
./gradlew ktlintCheck
./gradlew compileKotlin
./gradlew test
```

## 테스트 인프라

- `./gradlew test` 실행 시 `back/testInfra/docker-compose.yml` 기반 Postgres/Redis를 자동 부트스트랩합니다.
- 기본 테스트 포트: Postgres `15432`, Redis `16379`

## OpenAPI

- Swagger UI: `/swagger-ui/index.html`
- 계약 산출: `back/build/openapi/openapi.json` (테스트 기반 export)

프론트 계약 동기화:

```bash
cd front
yarn contracts:check
```

## 배포

- 이미지 빌드/푸시: GHCR
- 홈서버 Blue/Green 배포: `.github/workflows/deploy.yml`
- 운영 체크: `../docs/design/DevOps.md`

## 참고

- 운영 환경값은 GitHub Actions의 `HOME_SERVER_ENV`가 배포 시 `.env.prod`로 주입됩니다.
- 실운영 트리아지는 `../docs/session-handoff.md`를 기준으로 진행합니다.
