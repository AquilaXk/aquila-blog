# Agent Context

이 문서는 구현 작업 전에 가장 먼저 읽는 최소 컨텍스트 문서다.

목표는 `docs/` 전체를 훑지 않고도, 어떤 문서를 추가로 읽어야 하는지 빠르게 결정하는 것이다.

## 기본 규칙

- 항상 이 문서를 먼저 읽는다.
- 저장소 루트 `AGENTS.md`가 있으면 그 규칙도 함께 따른다.
- 그 다음에는 현재 작업과 직접 관련된 compact guide 1개만 먼저 읽는다.
- 막힐 때만 full guide 1개를 추가로 읽는다.
- `AGENT-CONTEXT + compact 1개 + 필요 시 full 1개`를 기본 상한으로 삼는다.
- 관련 없는 `design/` 문서를 한 번에 여러 개 읽지 않는다.
- 설명/보고는 가능하면 `문서 기준 적용 + 이번 변경 차이점만 짧게`로 끝낸다.
- 작업 중간 보고는 정말 필요한 경우만 한 줄로 한다.
- `무엇을 읽었는지`보다 `무엇을 바꿨는지`를 중심으로 말한다.
- 원인 분석, 선택지 비교, 트레이드오프는 리스크가 있거나 판단이 필요할 때만 확장한다.

## 스레드 기준

- 새 작업은 가능하면 주제별 새 스레드에서 시작한다.
- 한 스레드에 큰 주제를 계속 누적하지 않는다.
- 오래된 스레드가 길어지면 새 스레드로 끊는다.

## 작업 라우팅

| 작업 유형 | 먼저 볼 문서 | 필요할 때만 추가로 볼 문서 |
| --- | --- | --- |
| 프론트 화면/UX | `design/Frontend-Working-Guide.compact.md` | `design/Frontend-Working-Guide.md`, `design/Frontend-Performance-Guide.md` |
| 프론트 성능/하이드레이션 | `design/Frontend-Performance-Guide.md` | `design/Frontend-Working-Guide.md` |
| 로그인/회원/인증 | `design/Backend-Auth-Member-Guide.compact.md` | `design/Backend-Auth-Member-Guide.md`, `design/Signup-Verification-Working-Guide.md` |
| 이메일 인증 회원가입 | `design/Signup-Verification-Working-Guide.md` | `design/Backend-Auth-Member-Guide.md` |
| 전체 구조/리팩터링 | `design/System-Architecture.md` | `design/package-structure.md`, `design/Domain-Design.md` |
| 인프라/배포/OAuth 프록시 | `design/Infrastructure-Architecture.md` | `design/DevOps.md`, `design/Git-Workflow.md` |
| 좋아요/조회수/동시성 | `troubleshooting/post-like-hit-concurrency.md` | `design/System-Architecture.md` |

## 현재 프론트 핵심 사실

- 프론트는 `Next.js Pages Router` 기반이다.
- 상세 canonical 경로는 `/posts/[id]`이고, legacy `/:slug`는 redirect 역할이다.
- 관리자 경로는 아래 네 개다.
  - `/admin`
  - `/admin/profile`
  - `/admin/posts/new`
  - `/admin/tools`
- 관리자 서브페이지에는 페이지 내부 로그아웃 버튼을 두지 않는다. 로그아웃은 상단 네비 하나만 둔다.
- 관리자 상세 편집 진입은 `/admin/posts/new?postId={id}`를 사용한다.

## 현재 UI 핵심 사실

- 댓글은 카드 중첩형이 아니라 평평한 리스트형이다.
- 답글은 깊이에 상관없이 화면에서 한 단계 들여쓰기만 유지한다.
- 메인 피드 필터 바는 viewport가 아니라 중앙 컬럼 실제 폭 기준으로 반응한다.
- 카테고리 드롭다운은 아래 정책을 유지한다.
  - `min-width >= trigger`
  - `panel = fixed portal anchored to trigger`
  - `width = viewport-safe fixed width with multiline labels`
  - `max-width = viewport-safe width`
- 중간 폭에서는 필터를 억지로 100% 폭으로 늘리지 않는다.
- 반복 노출 아이콘은 가능한 한 로컬 SVG를 사용한다.
- 반복 노출 프로필 이미지는 `ProfileImage` 공통 컴포넌트에서 preload/eager로 다룬다.

## 현재 본문 렌더링 핵심 사실

- `<aside>...</aside>`는 콜아웃으로 변환한다.
- marker 매핑:
  - `ℹ️ -> Information`
  - `💡 -> Tip`
  - `⚠️ -> Warning`
  - `📋 -> 개요`
  - `✅ -> 정답`
  - `📚 -> 정리`
- marker 다음 첫 번째 `**제목**` 또는 heading은 콜아웃 헤더 제목으로 승격한다.
- 코드블럭은 IDE형 패널이다.
  - 상단 chrome
  - 언어 라벨
  - 줄번호 gutter
  - 하단 우측 복사 액션
- Java/Kotlin Prism 하이라이팅은 `clike` 선행 로더가 필요하다.
- Mermaid는 기본 테마를 쓰지 않고 프로젝트 톤에 맞춘 커스텀 테마를 사용한다.

## 현재 인증/상태 핵심 사실

- SSR에서 `auth/me`를 hydrate한 페이지는 클라이언트 진입 직후 동일 요청을 바로 다시 보내지 않는다.
- `next` 파라미터는 항상 정규화한다.
- `/_next/data/...json` 같은 내부 데이터 경로를 그대로 넘기지 않는다.
- 관리자 SSR 페이지는 `initialMember`를 첫 로딩에만 사용하고, 이후에는 클라이언트 세션 상태를 우선한다.

## 문서를 추가/수정할 때 기준

- 큰 설계 문서를 늘리기 전에, 이 문서에 라우팅 규칙 한 줄로 충분한지 먼저 본다.
- 새 기능이 장기적으로 반복될 작업이면 `design/` 아래에 guide를 만든다.
- 새 guide를 만들면 이 문서의 작업 라우팅 표에도 추가한다.
