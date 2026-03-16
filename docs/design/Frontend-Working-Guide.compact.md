# Frontend Working Guide Compact

Last updated: 2026-03-13

> AI 기본 진입점이 아니다. 에이전트는 먼저 `docs/AGENT-CONTEXT.md`와 `docs/agent/frontend-ui.md`를 읽고, 막힐 때만 이 문서를 연다.

## 3줄 요약

- 프론트 화면/UX 작업은 이 문서부터 읽고, 더 깊은 기준이 필요할 때만 `Frontend-Working-Guide.md` 본문으로 내려간다.
- 현재 핵심 기준은 `Pages Router`, 관리자 4개 경로, 평평한 댓글 구조, 중앙 컬럼 기준 피드 필터다.
- 상용 서비스 패턴 우선, 중복 설명 금지, 깊은 카드 중첩 금지, 페이지 내부 중복 로그아웃 금지가 기본 원칙이다.

## 먼저 알아야 할 사실

- canonical 상세 경로: `/posts/[id]`
- legacy 상세 경로: `/:slug` -> redirect only
- 관리자 경로:
  - `/admin`
  - `/admin/profile`
  - `/admin/posts/new`
  - `/admin/tools`
- 관리자 서브페이지에는 페이지 내부 로그아웃 버튼을 두지 않는다.
- 관리자 상세 편집 진입은 `/admin/posts/new?postId={id}`를 사용한다.

## 화면별 작업 기준

### 홈 피드
- 검색은 즉시 노출
- 카테고리 + 정렬은 compact filter bar 유지
- 반응형 기준은 viewport가 아니라 중앙 컬럼 실제 폭
- 카테고리 드롭다운은 부모 안 absolute보다 `portal + fixed panel`을 우선

### 상세 페이지
- 제목 -> 메타 -> 본문 -> 댓글 순서 유지
- 댓글은 카드 중첩형이 아니라 평평한 리스트형
- 답글은 깊이에 상관없이 화면에서 한 칸 들여쓰기만 유지
- 관리자 전용 수정/삭제는 헤더 메타에만 작게 노출

### 관리자
- `/admin`은 허브
- `/admin/profile`은 프로필 수정
- `/admin/posts/new`는 글 작업실
- `/admin/posts/new` 목록은 `활성 글`/`삭제 글` 탭 분리, 삭제 글 탭에서 복구/영구삭제 제공
- `/admin/tools`는 운영 도구

## UI 원칙 체크리스트

- 이 변경이 상용 서비스 패턴과 크게 어긋나지 않는가?
- 설명 문구 없이도 행동이 자연스럽게 보이는가?
- 카드 안 카드, 깊은 테두리 중첩, 과한 들여쓰기가 없는가?
- 로컬 SVG와 공통 컴포넌트를 우선 사용했는가?
- 페이지 내부 중복 인증/로그아웃 UI를 만들지 않았는가?

## 언제 본문 문서를 더 읽나

- 댓글 구조를 크게 바꾸는 경우
- 메인 피드 필터/프로필 카드/에디터 UX를 재설계하는 경우
- SSR hydrate, 본문 렌더링, callout/code block 규칙까지 건드리는 경우

전체 기준 문서: [Frontend Working Guide](./Frontend-Working-Guide.md)
