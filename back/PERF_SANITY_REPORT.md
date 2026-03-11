# Performance Sanity Report (PR-5)

## Scope
- Measurement target:
  - `GET /post/api/v1/posts` (list)
  - `GET /post/api/v1/posts/{id}` (detail)
  - `POST /post/api/v1/posts/{id}/comments` (write comment)
  - `POST /post/api/v1/posts/{id}/like` (toggle like)
  - `POST /member/api/v1/auth/login` (auth flow)
- Environment:
  - Spring profile: `test`
  - DB: PostgreSQL (`blog_test`)
  - Hibernate statistics enabled only in test class via:
    - `spring.jpa.properties.hibernate.generate_statistics=true`

## Method
- Added `PerformanceSanityTest`:
  - [PerformanceSanityTest.kt](/Users/aquila/Custom/GitProjects/aquila-blog/back/src/test/kotlin/com/back/perf/PerformanceSanityTest.kt)
- Measurement metric:
  - `SessionFactory.statistics.prepareStatementCount`
- Query count was reset immediately before each measured HTTP request.

## Results
- Captured from test output on 2026-03-11:
  - `auth-login`: 2
  - `post-list`: 14
  - `post-detail`: 3
  - `like-toggle`: 13
  - `comment-write`: 15

## Guardrails
- Current upper bounds in test:
  - `auth-login <= 10`
  - `post-list <= 18`
  - `post-detail <= 12`
  - `like-toggle <= 18`
  - `comment-write <= 20`
- Purpose:
  - Detect accidental query explosion/regression quickly while keeping headroom for small implementation variance.

## Command
```bash
./gradlew test --no-daemon --tests "com.back.perf.PerformanceSanityTest"
```
