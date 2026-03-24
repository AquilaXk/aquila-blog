# Frontend UI Tokens (Feed/Detail Baseline)

## 목적
- 화면마다 다른 임의 수치를 줄이고, 카드/검색/태그/상세의 밀도와 상호작용을 같은 규격으로 유지한다.

## 단일 소스
- 글로벌 토큰: `front/src/styles/variables.ts`
- 공유 토큰 패키지: `front/packages/shared-ui-tokens/src/index.js`

## 현재 강제 규격
- 모바일 터치 타깃 최소: `MOBILE_TOUCH_TARGET_MIN_PX=34`
- 피드 검색 필드 높이: `FEED_SEARCH_FIELD_MIN_HEIGHT_PX=36`
- 태그 칩 간격: `FEED_CHIP_GAP_PX=6`
- 태그 레일 전환/대표 노출:
  - `FEED_TAG_RAIL_CHIP_MAX_PX=1200`
  - `FEED_TAG_RAIL_DESKTOP_MIN_PX=1201`
  - `FEED_TAG_RAIL_WIDTH_PX=184`
  - `FEED_TAG_REPRESENTATIVE_CHIP_LIMIT=6`
  - `FEED_TAG_REPRESENTATIVE_DESKTOP_LIMIT=10`
- 카드 타이포:
  - 제목 줄간: `FEED_CARD_TITLE_LINE_HEIGHT`
  - 요약 줄간: `FEED_CARD_SUMMARY_LINE_HEIGHT`
  - 요약 줄 수: `FEED_CARD_SUMMARY_LINES`
  - 메타 폰트: `FEED_CARD_META_FONT_SIZE_REM`

## 라이트 모드 기준
- page background: `#f5f7fa`
- surface(gray1): `#ffffff`
- elevated(gray2): `#fbfcfe`
- border(gray5~6): `#dfe5ec` ~ `#d0d8e2`
- secondary text(gray10): `#5b6472`
- primary text(gray12): `#111827`
- body glow는 light mode에서 `opacity <= 0.05`로 유지한다.

## 상세 레일/TOC 토큰성 규약
- sticky top 기준은 고정 rem이 아니라 `--app-header-height + 16px`를 사용한다.
- 상세 좌/우 레일은 JS 하이브리드 sticky(absolute↔fixed↔absolute)로 동작한다.
- TOC active는 heading top 단순 비교가 아니라 intersection ratio 기반이다.

## 적용 원칙
- 새 UI는 하드코딩된 숫자보다 토큰 사용을 우선한다.
- 카드/버튼/필드는 `theme.variables.ui.*` 또는 `@shared/ui-tokens`로만 크기/반경을 지정한다.
- 데스크톱과 모바일(iPhone 15 Pro) 모두에서 같은 토큰이 자연스럽게 동작해야 한다.

## 검증 루틴
- `yarn test:e2e:smoke`
- `yarn test:e2e:perf`
- `yarn test:e2e:a11y`
- 모바일 overflow 관련 회귀는 `front/e2e/mobile-layout.spec.ts` 기준으로 확인한다.
