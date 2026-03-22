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
- 카드 타이포:
  - 제목 줄간: `FEED_CARD_TITLE_LINE_HEIGHT`
  - 요약 줄간: `FEED_CARD_SUMMARY_LINE_HEIGHT`
  - 요약 줄 수: `FEED_CARD_SUMMARY_LINES`
  - 메타 폰트: `FEED_CARD_META_FONT_SIZE_REM`

## 적용 원칙
- 새 UI는 하드코딩된 숫자보다 토큰 사용을 우선한다.
- 카드/버튼/필드는 `theme.variables.ui.*` 또는 `@shared/ui-tokens`로만 크기/반경을 지정한다.
- 데스크톱과 모바일(iPhone 15 Pro) 모두에서 같은 토큰이 자연스럽게 동작해야 한다.

## 검증 루틴
- `yarn test:e2e:smoke`
- `yarn test:e2e:perf`
- `yarn test:e2e:a11y`
- 모바일 overflow 관련 회귀는 `front/e2e/mobile-layout.spec.ts` 기준으로 확인한다.

