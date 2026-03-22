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

### AI 기능

- 관리자 글쓰기에서 `AI 태그 추천` 지원
- 엔드포인트: `POST /post/api/v1/adm/posts/recommend-tags`
- 응답: `tags`, `provider`, `model`, `reason`, `traceId`, `degraded`
- AI 실패 시 규칙 기반 fallback 유지

### 인증/세션

- 로그인/로그아웃/`auth/me` 제공
- 쿠키 기반 인증(`apiKey`, `accessToken`)
- OAuth2 로그인(Kakao)

### 운영 진단

- `/actuator/health/readiness`
- `/system/api/v1/adm/tasks`
- `/system/api/v1/adm/storage/cleanup`
- `/system/api/v1/adm/mail/signup`

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
