# 패밀리룩 디자인 가이드 (확정)

기준: 메인(`/`)·About(`/about`)이 이미 구현한 에디토리얼 디자인 언어. 모든 페이지는 이 명세를 위반하지 않아야 한다. 상세 배경과 페이지별 진단은 `docs/design/design-family-look-launch-plan.md`(umbrella #1217) 참조.

## 1. 명세표

| 요소 | 규칙 |
| --- | --- |
| 캔버스 | 종이 같은 화이트 캔버스(다크모드 대칭). 유채색 배경 면 사용 금지 |
| 구획 | 카드 박스 대신 1px 헤어라인 + 여백. 섹션 시작은 모노 대문자 라벨 |
| 라벨 | 모노스페이스 대문자 소형 라벨(`FOCUS`, `UPDATED`, `ON THIS PAGE` 계열) |
| 타이포 | 큰 extraBold 한글 헤드라인. 위계는 크기·굵기·회색조로만 |
| 리스트 | 넘버링(01, 02…) + 헤어라인 행 구분의 에디토리얼 리스트 |
| 컨트롤 | 낮은 라운드의 사각 컨트롤, 잉크 블랙/화이트 기본. 필(pill) 버튼 금지 |
| 포인트 컬러 | 절제된 블루 1종 — 링크·현재 위치에만. 면(surface) 채색 금지 |
| 칩 | 얇은 보더 사각 칩 |
| 상태 표현 | 파스텔 배경 박스 대신 텍스트 + 점(dot)/모노 라벨. 이모지 금지 |

## 2. 금지 목록 (AI 대시보드 문법)

- 파스텔 상태 박스(연두/주황/하늘 배경 면)
- KPI 카드 나열, box-in-box(박스 안의 박스)
- 파란 필(pill) 버튼, 카드 그림자 셸
- 이모지 콜아웃/상태 표현(❓👉 등)

예외: 카카오 공식 로그인 버튼(#1208), danger 텍스트.

## 3. 공용 토큰만 사용

색·라운드·구획 값은 하드코딩하지 않고 공용 토큰에서만 가져온다.

- Emotion(styled/css, `theme` 접근 가능): `src/design-system/tokens.ts`의 `semanticColors(theme)` / `editorialLabel` / `designTokens`, 또는 `theme.colors.*`·`theme.publicDesign.*`.
- 인터랙션 primitive·confirm 모달·상태 컴포넌트는 `src/design-system/`(`interactionPrimitives`, `ConfirmDialog`, `StatePresenters`)에서 import한다.
- 전역 CSS 문자열(`<style jsx>` 등 `theme` 미접근): `src/layouts/RootLayout/ThemeProvider/Global`이 문서 전역에 정의하는 `--aq-*` 커스텀 프로퍼티를 쓴다. 라이트/다크가 자동 전환된다.

### 주요 토큰 매핑

| 용도 | Emotion | 전역 CSS 변수 |
| --- | --- | --- |
| 본문 텍스트 | `semanticColors(theme).textPrimary` | `var(--aq-text)` |
| 보조 텍스트 | `textSecondary` | `var(--aq-text-secondary)` |
| 흐린 텍스트 | `textMuted` | `var(--aq-muted)` |
| 캔버스 배경 | `theme.publicDesign.pageBackgroundColor` | `var(--aq-page-bg)` |
| 표면 | `surface` | `var(--aq-surface)` |
| 헤어라인/보더 | `hairline` / `border` | `var(--aq-border)` |
| 포인트(링크·현재 위치) | `accentLink` | `var(--aq-accent-link)` |
| 채운 컨트롤 배경/글자 | `accent` / `accentControlText` | `var(--aq-accent)` / `var(--aq-on-accent)` |
| 상태 dot | `dotAccent`·`dotSuccess`·`dotDanger`·`dotNeutral` | — |
| 모노 대문자 라벨 | `designTokens.editorialLabel` | — |

관리자 영역은 `src/routes/Admin/adminColorTokens.ts`의 `--admin-*` 토큰을 쓰되, 그 값은 위 공용 팔레트에서 파생된다(자체 블루/파스텔 금지).

## 4. 게이트

하드코딩 팔레트 금지. 최종 게이트(전 소유 이슈 완료 후):

```
rg "#0969da|#0a58ca|#174ea6|#005fc4|#7cc4ff|#12b886|#087f5b" front/src
```

무결과여야 한다(`#0969da|#174ea6`만 검사하면 인증 팔레트를 놓친다).
