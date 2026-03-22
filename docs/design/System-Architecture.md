# System Architecture

Last updated: 2026-03-22

## 3줄 요약

- 프로젝트 전체 구조를 빠르게 파악할 때 이 문서를 먼저 읽는다.
- 현재 시스템은 `Vercel front + Spring Boot back + PostgreSQL/Redis/MinIO + Kakao OAuth` 조합이다.
- 세부 구현을 바꿀 때는 이 문서를 기준으로 역할 경계를 보고, 필요하면 도메인/패키지 문서로 내려간다.

## 이 문서가 보여주는 것

이 문서는 사용자 요청이 어떤 경로로 흐르고, 프론트/백엔드/스토리지/외부 연동이 어떤 기준으로 역할을 나눴는지를 한눈에 보여준다.

## 전체 그림

현재 프로젝트는 "콘텐츠/인증/운영은 자체 백엔드", "사용자 화면은 Next.js SSR + 짧은 CDN 캐시"로 분리된 블로그 시스템이다.

```mermaid
flowchart TD
    U["사용자 브라우저"] --> F["Next.js Frontend (Vercel)"]
    F --> B["Spring Boot Backend"]
    B --> P["PostgreSQL"]
    B --> R["Redis"]
    B --> M["MinIO"]
    B --> K["Kakao OAuth"]
    B --> S["SSE notification stream"]
    B --> RV["Next revalidate API (optional hook)"]
```

## 시스템 인터페이스 표

| 구간 | 프로토콜 | 주요 엔드포인트/설정 | 비고 |
| --- | --- | --- | --- |
| Browser -> Front | HTTPS | `www.<domain>` | Vercel |
| Front -> Back | HTTPS/HTTP | `BACKEND_INTERNAL_URL`, `NEXT_PUBLIC_BACKEND_URL` | SSR/브라우저 분리 |
| Back -> DB | JDBC | `spring.datasource.url` | PostgreSQL |
| Back -> Redis | TCP | `spring.data.redis.*` | session/cache/lock |
| Back -> MinIO | S3 API | `CUSTOM_STORAGE_*` | 게시글/프로필 이미지 |
| Back -> Browser | SSE | `/member/api/v1/notifications/stream` | 댓글/답글 알림 push |
| Back -> Front revalidate | HTTP POST | `/api/revalidate` | 선택적 cache invalidation hook |

## 읽기 흐름

1. 프론트가 게시글 목록/상세를 백엔드에서 조회한다.
2. 목록 DTO는 제목/요약/공개 상태 중심으로 받는다.
3. 상세 DTO는 Markdown 본문 전체를 받는다.
4. 프론트는 본문에서 태그/카테고리 메타데이터를 추가 파싱한다.
5. 상세 화면은 custom renderer로 코드블럭, 머메이드, 콜아웃, 테이블을 렌더링한다.
6. 메인 페이지(`/`)와 About 페이지(`/about`)는 `getServerSideProps` + 짧은 CDN 캐시를 사용하고, 관리자 프로필은 SSR 초기값을 먼저 사용한다.

## 쓰기 흐름

1. 관리자 로그인
2. `/admin`은 허브 역할만 담당하고, 실제 글 작성/수정은 `/admin/posts/new`에서 처리한다.
3. 백엔드가 게시글 저장
4. 필요 시 이미지 업로드는 MinIO에 저장하고, 이미지 조회는 백엔드가 전체 바이트를 메모리에 올리지 않고 스트리밍으로 전달한다.
5. 백엔드는 필요 시 프론트 revalidate task를 큐에 적재하고, task worker가 비차단성으로 revalidate hook을 호출한다.
6. 메인 페이지는 SSR + 짧은 CDN 캐시 만료 또는 revalidate task 처리 결과를 통해 새 데이터 기준으로 갱신된다.

쓰기 안전장치:

- `POST /post/api/v1/posts`는 `Idempotency-Key` 헤더를 지원한다.
- 동일 작성자 + 동일 키 재시도는 중복 글을 만들지 않고 기존 결과를 재사용한다.
- `PUT /post/api/v1/posts/{id}`는 `version`(낙관적 락)으로 동시 수정 충돌을 막고, 충돌 시 `409-1`을 반환한다.

```mermaid
sequenceDiagram
    participant Admin
    participant Front
    participant Back
    participant MinIO
    participant Revalidate
    Admin->>Front: 글 작성
    Front->>Back: POST /post/api/v1/posts
    opt 이미지 포함
        Front->>Back: POST /post/api/v1/posts/images
        Back->>MinIO: upload
    end
    opt cache invalidation task
        Back->>Back: enqueue revalidate task
        Back->>Revalidate: POST /api/revalidate
    end
    Back-->>Front: 글 저장 응답
    Front-->>Admin: 발행 결과 표시
```

## 인증 흐름

지원 방식:

- 일반 아이디/비밀번호 로그인
- 카카오 OAuth 로그인

공통 특징:

- 인증 결과는 쿠키(`apiKey`, `accessToken`)로 내려간다.
- 프론트는 `credentials: include`로 API를 호출한다.
- 로그인 상태 확인은 `/member/api/v1/auth/me`
- 관리자 표시 여부는 `me.isAdmin` 값으로 제어

## 주요 사용자 여정

| 여정 | 시작점 | 핵심 API | 결과 |
| --- | --- | --- | --- |
| 공개 글 탐색 | `/` | `/post/api/v1/posts` | 목록/검색/필터 |
| 글 상세 조회 | `/posts/:id` | `/post/api/v1/posts/{id}` | Markdown 렌더 |
| 댓글/답글 알림 | 임의 페이지 | `/member/api/v1/notifications/*`, SSE stream | 헤더 알림벨 |
| 로그인 | `/login` | `/member/api/v1/auth/login` | 쿠키 발급 |
| 회원가입 | `/signup`, `/signup/verify` | `/member/api/v1/members`, `/member/api/v1/signup/*` | 일반 가입 + 이메일 인증 가입, 메일 발송은 task queue |
| 관리자 작성 | `/admin/posts/new` | `/post/api/v1/posts`(Idempotency-Key), `/post/api/v1/adm/posts` | 발행/검색/수정 |
| 관리자 AI 태그 추천 | `/admin/posts/new` | `/api/post/recommend-tags` -> `/post/api/v1/adm/posts/recommend-tags` | 제목/본문 기반 태그 추천 + fallback |

추가 규칙:

- 기존 `/:slug` 경로는 legacy 링크 호환을 위해 유지하지만, 실제 렌더는 `/posts/:id` canonical 경로로 리다이렉트한다.
- 인증 세션은 SSR auth 스냅샷(`authMeProbe`)을 우선 사용해 비로그인 상태에서 `/auth/me` 재검증 호출을 줄인다.

## 관리자 구조

관리자 페이지는 한 화면 집중형 구조에서 역할별 화면으로 분리됐다.

- `/admin`
  허브, 빠른 이동, 현재 계정 요약
- `/admin/profile`
  관리자 프로필 이미지/역할/소개 관리
- `/admin/posts/new`
  글 작성/수정/삭제, 관리자용 전체 글 검색
- `/admin/tools`
  댓글 점검, 시스템 상태 조회, 회원가입 메일 진단

## 설정 경계

Frontend:

- `BACKEND_INTERNAL_URL`
  서버 사이드 빌드/SSR 전용
- `NEXT_PUBLIC_BACKEND_URL`
  브라우저 런타임 전용

Backend:

- `CUSTOM__ADMIN__USERNAME`
- `CUSTOM__ADMIN__PASSWORD`
- `CUSTOM__REVALIDATE__URL`
- `CUSTOM__REVALIDATE__TOKEN`
- `CUSTOM_STORAGE_*`

현재 운영에서 특히 중요한 점:

- 메인 피드는 정적 빌드가 아니라 API/SSR 기반이다.
- `CUSTOM__REVALIDATE__*`는 즉시 반영 시간을 더 줄이기 위한 보조 장치이지, 데이터 정합성의 유일한 경로는 아니다.
- 회원가입 메일 발송과 revalidate는 모두 task queue를 거쳐 write API latency와 분리된다.
- 관리자 프로필 이미지 업로드도 MinIO(`CUSTOM_STORAGE_*`) 의존이다.
- OAuth callback URL은 프록시 추론이 아니라 `${custom.site.backUrl}` 기준으로 고정한다.
- 댓글/답글 알림은 현재 서비스 규모 기준으로 WebSocket 대신 SSE를 사용한다. 댓글 작성은 기존 HTTP 요청을 유지하고, 새 알림만 push 받는다.

## 현재 구조의 장점

- 프론트와 백엔드를 독립 배포할 수 있다.
- 홈서버에서 DB/Redis/MinIO를 직접 제어할 수 있다.
- 관리자 글쓰기와 퍼블릭 읽기 트래픽을 같은 API 계약으로 유지한다.

## 현재 구조의 주의점

- 프론트 일부 파일명과 컴포넌트명은 과거 템플릿 유산이 남아 있다.
- 태그/카테고리 계산이 프론트 파싱에 일부 의존한다.
- 운영 환경변수 실수는 빌드 성공 후 런타임 장애로 이어질 수 있다.
- legacy `/:slug` 라우트는 검색엔진/공유 링크 호환용 redirect 레이어라서, 실제 상세 페이지를 분석할 때는 `/posts/:id` 기준으로 보는 편이 안전하다.
