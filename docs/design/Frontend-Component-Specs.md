# Frontend Component Specs

## 목적
- 다크 테마(near-black) 기준으로 UI 토큰을 컴포넌트 규격으로 고정한다.
- 시각 회귀를 Storybook에서 빠르게 확인하고, 릴리스 전 diff 리뷰 기준을 제공한다.

## 기본 토큰
- 배경: `gray1=#0d0f12`, `gray2=#12151a`, `gray3=#171b21`
- 보더: `gray6=#2a3038`
- 텍스트: `gray12=#f3f4f6`, 보조 텍스트 `gray10=#a6adbb`
- 액션: hover는 강한 glow 대신 border/배경의 저강도 변화만 허용

## 컴포넌트 규격
### Rail / TOC
- 파일: `front/src/routes/Detail/PostDetail/index.tsx`
- Rail sticky:
  - CSS fallback + JS hybrid(`absolute → fixed → absolute`)을 함께 사용
  - sticky top은 `--app-header-height + 16px`
  - 본문-레일 간 간격은 viewport tier(1440/1280/1200)로 조절
- TOC:
  - active 항목 판별은 `IntersectionObserver` ratio 기반
  - 클릭 시 `history.replaceState`로 hash 동기화
  - 항목 최소 높이 `35px`

### Feed Search Input
- 파일: `front/src/routes/Feed/SearchInput.tsx`
- 높이: 데스크톱 `36px`, 모바일 `34px`
- 라운드: `theme.variables.ui.button.radius`
- 우측 보조 버튼:
  - 높이 `28px`
  - `<=1200px` 숨김

### Feed Post Card
- 파일: `front/src/routes/Feed/PostList/PostCard.tsx`
- 카드 라운드: `theme.variables.ui.card.radius`
- 본문 패딩: `theme.variables.ui.card.padding`
- 요약 높이: `3.9375rem`(3줄)
- 메타 폰트: `0.75rem`
- 타이포 계층:
  - 제목 `1.08rem/760`
  - 요약 `0.875rem/1.6`
  - 메타 `0.75rem/1.55`
  - 푸터 상단 구분선과 메타 하단 간격을 분리해 읽기 리듬 유지
- Hover:
  - 데스크톱(>1024px)에서만 `translateY`
  - 모바일은 그림자만 유지

## Storybook 회귀 기준
- 스토리:
  - `Feed/SearchInput`
  - `Feed/PostCard`
- 실행:
  - `cd front && yarn storybook`
  - `cd front && yarn storybook:build` (raw build)
  - `cd front && yarn storybook:gate` (CI 게이트와 동일한 검증 래퍼)
  - `cd front && yarn storybook:test`
- 리뷰 포인트:
  - 393x852(iPhone 15 Pro)와 1440x900 기준에서 오버플로우/가독성/상태 대비 확인
  - focus-visible 링, hover 상태, 빈 썸네일 fallback 확인
