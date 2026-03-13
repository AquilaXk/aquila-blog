# Frontend Performance Guide

Last updated: 2026-03-13

## 이 문서가 보여주는 것

이 문서는 현재 프론트 구조에서 어디를 정적으로 두고, 어디를 늦게 로드해야 메인 JS 번들과 하이드레이션 비용을 가장 많이 줄일 수 있는지 정리한 작업 기준 문서다.

## 현재 전제

- 프론트는 `Next.js Pages Router` 기반이다.
- App Router처럼 진짜 Server Component / Client Component 경계를 강하게 나누는 구조는 아니다.
- 대신 현재 프로젝트에서는 아래 전략이 가장 현실적이다.

1. SSR로 먼저 HTML을 만든다.
2. 정적 셸은 최대한 얇게 유지한다.
3. 댓글, 인증 모달, 운영 도구처럼 초기 상호작용이 필요 없는 요소는 `next/dynamic` + `ssr: false`로 늦게 불러온다.
4. 본문 렌더러 안의 heavy 라이브러리는 effect 단계에서 필요한 것만 import한다.

## 페이지별 성능 경계

### 메인 피드 (`/`)

정적 영역:

- 프로필 카드
- 소개 카드
- 서비스/연락처 카드
- 기본 글 목록의 SSR HTML

동적 영역:

- 검색 입력
- 카테고리 드롭다운
- 정렬 segmented control
- 태그 필터

현재 기준:

- `Feed` 전체를 하나의 상태 컴포넌트로 두지 않고, 검색/필터 상태는 별도 탐색 영역으로 모은다.
- 이렇게 해야 검색어가 바뀔 때 사이드바 카드와 프로필 카드가 같이 리렌더되지 않는다.

### 상세 페이지 (`/posts/[id]`)

정적 영역:

- 제목
- 작성자 메타
- 본문 HTML

지연 로딩 후보:

- 댓글 입력/수정/답글 UI
- 인증 모달
- 댓글 위젯(giscus/cusdis/utterances 같은 third-party embed)

현재 기준:

- 댓글은 본문 아래에서 스크롤 도달 전까지 꼭 필요하지 않으므로, viewport 진입 시점에 island로 올리는 편이 유리하다.
- 본문 렌더러는 route 자체가 달라 메인 피드 번들에는 들어오지 않더라도, 상세 페이지 내부에서는 `react-markdown`, `prismjs`, `mermaid` 비용을 줄이는 것이 중요하다.

### 관리자 페이지

정적 영역:

- 허브 페이지의 소개/빠른 이동 카드

동적 영역:

- 글 작성 에디터
- 프로필 업로드 폼
- 운영 도구 API 콘솔

원칙:

- `/admin` 허브는 가볍게 유지한다.
- heavy 에디터/운영 도구는 전용 경로(`/admin/posts/new`, `/admin/tools`)로 분리된 상태를 유지한다.

## 현재 프로젝트에서 우선 적용할 원칙

### 1. 모달은 초기 번들에 싣지 않는다

- `AuthEntryModal`처럼 닫힌 상태가 기본인 컴포넌트는 `next/dynamic(..., { ssr: false })`로 로드한다.
- 헤더나 댓글창에서 바로 import하면 메인 번들에 같이 들어간다.
- 모달을 연 뒤에도 로그인, 회원가입, 메일 전송 완료 패널을 한 번에 같은 chunk로 묶지 않는다.
- 셸은 먼저 띄우고, 현재 선택된 view 패널만 동적으로 불러오는 단계적 lazy load가 더 유리하다.

### 2. 본문 하단 인터랙션은 viewport 기준으로 불러온다

- 댓글 섹션처럼 본문을 읽기 전에는 필요 없는 요소는 Intersection Observer 기준으로 불러온다.
- SSR에서는 제목/본문까지만 먼저 보여주고, 하단 인터랙션은 island로 붙인다.

### 3. effect 기반 라이브러리는 "있는 경우에만" import 한다

- `prismjs`, `mermaid`는 본문에 코드블록/머메이드가 없으면 로드하지 않는다.
- 그리고 지원 언어 전체를 한 번에 올리지 말고, 실제 코드블록에 있는 언어만 선택적으로 로드한다.

### 4. 상태는 가장 좁은 경계에 둔다

- 검색어/정렬/카테고리 상태는 피드 전체가 아니라 탐색 영역에만 둔다.
- 이 원칙 하나만 지켜도 static card, profile card, footer까지 같이 리렌더되는 비용을 줄일 수 있다.

### 5. third-party script는 `lazyOnload` 또는 viewport 이후로 미룬다

- Google Analytics처럼 첫 화면 그리기와 상관없는 스크립트는 `next/script`의 `lazyOnload`를 우선 고려한다.
- 댓글 embed는 컴포넌트 마운트 자체를 늦추는 편이 더 효과적이다.

### 6. 아이콘은 가능하면 로컬 SVG로 통일한다

- 메인 헤더, 메인 피드 필터, 프로필/연락처 카드처럼 모든 페이지나 첫 화면에서 자주 보이는 아이콘은 `react-icons`보다 로컬 SVG 컴포넌트를 우선한다.
- 이유는 단순하다. 작은 아이콘 몇 개를 위해 아이콘 패키지 의존성을 shared chunk에 남겨두면, 실제 UI 대비 번들 기여도가 과해진다.
- 가능하면 로그인/회원가입/인증 모달까지 포함해 로컬 SVG로 통일한다. 아이콘 체계가 한 번 정리되면 번들 비용뿐 아니라 일관성 관리도 쉬워진다.

### 7. 메인 피드 필터는 한 덩어리로 하이드레이션하지 않는다

- `SearchInput`, `TagList`, `CategorySelect`, `OrderButtons`는 기능상 서로 연결돼 보여도 초기 중요도는 다르다.
- 검색 입력만 즉시 필요하고, 태그 필터와 드롭다운/정렬 컨트롤은 작은 island로 따로 띄워도 UX 손실이 작다.
- 따라서 메인 피드에서는:
  1. 검색 입력은 즉시 로드
  2. `TagList`는 독립 island
  3. `FeedHeader`는 정적 래퍼 + `CategorySelect` / `OrderButtons` 독립 island
  로 유지하는 편이 메인 JS 번들과 하이드레이션 경계를 줄이기 좋다.

## 현재 코드에서 즉시 의심할 지점

- `src/layouts/RootLayout/Scripts.tsx`
  외부 스크립트 전략
- `src/components/auth/AuthEntryModal.tsx`
  모달 번들 분리 필요 여부
- `src/routes/Feed/index.tsx`
  검색 상태가 정적 카드까지 리렌더시키는지
- `src/routes/Detail/PostDetail/CommentBox/index.tsx`
  댓글 섹션을 즉시 하이드레이션하는지
- `src/routes/Detail/components/NotionRenderer/usePrismEffect.ts`
  코드블록이 없는데도 Prism을 전부 올리는지

## 운영 기준 체크리스트

성능 최적화 후에는 아래를 같이 확인한다.

1. 메인 피드에서 검색어 입력 시 프로필/사이드 카드가 같이 흔들리지 않는지
2. 상세 페이지 첫 진입 시 제목/본문이 먼저 뜨고, 댓글은 아래로 내렸을 때 로드되는지
3. Lighthouse의 `Reduce JavaScript execution time`와 `Total Blocking Time`이 실제로 낮아졌는지
4. Google Analytics, 댓글 위젯, Mermaid/Prism이 기능적으로 깨지지 않는지
5. 동적 로딩한 island가 SEO에 중요한 본문 영역을 숨기지 않는지
