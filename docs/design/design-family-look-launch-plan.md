# 전체 페이지 패밀리룩 출시 기준 100% 계획서

작성일: 2026-07-02
검토 방식: 라이브 사이트(https://www.aquilaxk.site) 데스크톱 1440px / 모바일 390px 실측 스크린샷, 관리자·에디터는 `front/test-results/aquilalog-v4-*-evidence` (2026-06-24 기준) 스크린샷과 코드 리뷰 병행

## 1. 목적과 출시 기준

기술 블로그 웹 출시 기준을 100%로 두고, 메인 페이지(`/`)의 디자인 언어를 기준(패밀리룩)으로 모든 페이지를 정합시킨다.

출시 기준 3원칙:

1. **AI스럽지 않은 디자인** — 템플릿형 SaaS 대시보드 문법(파스텔 상태 박스, KPI 카드 나열, 파란 필 버튼, 이모지 콜아웃)을 제거하고, 블로그 고유의 에디토리얼 인상을 유지한다.
2. **블록에 다 넣지 않는 디자인** — 카드/박스 대신 헤어라인(1px rule)과 여백으로 구획한다. 배경색 면적과 라운드 박스 중첩(box-in-box)을 최소화한다.
3. **이용자가 보기 좋은 UI/UX** — 정보 위계는 타이포 크기·굵기로 만들고, 빈 상태·로딩·오류 상태까지 같은 언어로 다듬는다.

## 2. 기준 디자인 언어 (메인 페이지에서 추출한 패밀리룩 명세)

메인(`/`)과 About(`/about`)이 이미 구현하고 있는 언어를 기준으로 삼는다.

| 요소 | 규칙 |
| --- | --- |
| 캔버스 | 종이 같은 화이트 캔버스(다크모드 대칭), 유채색 배경 면 사용 금지 |
| 구획 | 카드 박스 대신 1px 헤어라인 + 여백. 섹션 시작은 모노 대문자 라벨 |
| 라벨 | 모노스페이스 대문자 소형 라벨 (`FOCUS`, `UPDATED`, `ON THIS PAGE`, `CONTINUE READING` 계열) |
| 타이포 | 큰 extraBold 한글 헤드라인, 위계는 크기·굵기·회색조로만 |
| 리스트 | 넘버링(01, 02…) + 헤어라인 행 구분 + 우측 썸네일의 에디토리얼 리스트 |
| 컨트롤 | 낮은 라운드의 사각 컨트롤, 잉크 블랙/화이트 기본. 필(pill) 버튼 금지 |
| 포인트 컬러 | 절제된 블루 1종 — 링크와 현재 위치 표시에만. 면(surface) 채색 금지 |
| 칩 | 얇은 보더 사각 칩 (메인 태그 칩 스타일) |
| 상태 표현 | 파스텔 배경 박스 대신 텍스트 + 점(dot)/모노 라벨. 이모지 금지 |

코드 기준: 공용 토큰은 `front/src/design-system/tokens.ts`(`semanticColors` L56, `designTokens` L77)·`front/packages/shared-ui-tokens/src/index.js`(+`index.d.ts`, 순수 JS 패키지). 현재 관리자(`front/src/routes/Admin/adminColorTokens.ts`, primary `#0969da`)와 설정(`front/src/routes/Settings/SettingsLayout.tsx`, `#174ea6` 하드코딩), 인증(`front/src/components/auth/`)이 각자 다른 팔레트를 쓰고 있어 디자인 언어가 3갈래로 갈라져 있다.

### 하드코딩 팔레트 실측 인벤토리 (2026-07-04, `rg` 재검증)

`rg "#0969da|#174ea6" front/src` = 13히트 / 8파일. 각 히트의 소유 이슈:

| 파일 | 히트 | 소유 이슈 |
| --- | --- | --- |
| `front/src/routes/Admin/adminColorTokens.ts` | 4 | #1218 |
| `front/src/routes/Settings/SettingsLayout.tsx` · `SettingsAccountPage.tsx` · `SettingsPrivacyPage.tsx` | 각 1 | #1218 (토큰 경유) / #1219 (레이아웃 재설계) |
| `front/src/routes/Admin/EditorStudioComposeWorkspace.tsx:241` · `EditorStudioComposeWritingSurfaceParts.tsx:445` | 각 2 (`#0a58ca` 다크 변형 포함) | #1222 |
| `front/src/libs/markdown/contentTypography.ts:88` · `front/src/libs/markdown/components/MarkdownRendererRootBaseStyles.ts:100` | 각 1 | #1224 |

주의:

- 인증 컴포넌트(`front/src/components/auth/`)는 `#0969da/#174ea6`를 쓰지 않고 자체 hex를 사용한다: `#005fc4`(파란 필 버튼), `#7cc4ff`, `#12b886`/`#087f5b`(초록 파스텔 안내), `#f8fafc`. 따라서 `rg "#0969da|#174ea6"`만으로는 인증 하드코딩이 검출되지 않는다 (#1218·#1219 소유).
- 오류 UI(`front/src/components/error/ErrorFallbackView.tsx` 등)의 그레이 하드코딩(`#d1d5db`, `#f9fafb` 등)은 #1223 소유.
- `adminColorTokens.ts`는 라이트/다크 CSS 변수 세트(`--admin-*`) + 레거시 별칭 export(`adminGold`·`adminTeal`이 실제로는 블루 `#0969da`를 가리킴) 구조. 치환은 2단계 — (1) `--admin-*` 값만 공용 semantic 토큰 파생으로 리맵해 시각 회귀 최소화, (2) 파스텔 accent surface 슬롯(`--admin-surface-accent` 등)은 #1220·#1221에서 사용처 제거 후 슬롯 삭제.

## 3. 페이지별 진단 (출시 기준 100% 대비)

| # | 페이지 | 완성도 | 진단 요약 |
| --- | --- | --- | --- |
| 1 | 메인 `/` | 95% | 기준 그 자체. 모바일 FOCUS/UPDATED/REPOSITORY 3열이 좁아 줄바꿈이 어색한 것 등 미세 마감만 남음 |
| 2 | About `/about` | 95% | 패밀리룩 모범. 미세 마감만 |
| 3 | 글 상세 `/posts/[id]` | 85% | 헤더·메타·TOC는 준수. 댓글 영역이 라운드 박스 2개(로그인 유도, 첫 댓글)로 이탈, 본문 이모지 콜아웃(❓👉)이 AI스러움, mermaid 다이어그램 초기 렌더 공백 확인 필요 |
| 4 | Legal 5종 `/terms` `/privacy` `/cookies` `/legal/*` | 80% | 구조(좌 TOC + 헤어라인)는 준수. 파란 링크·버튼 노출 과다, `legal/history` 우측 파란 텍스트 버튼 나열 정리 필요 |
| 5 | 404 / 500 | 60% | 중앙 정렬 제네릭 레이아웃 + 필 버튼 2개. 패밀리룩 아님. 404(`routes/Error`)와 500(`components/error/ErrorFallbackView`)이 서로 다른 컴포넌트로 갈라져 있고 둘 다 하드코딩 팔레트 사용 |
| 6 | 로그인 `/login` | 40% | "ACCESS PORTAL" 라운드 카드 + 그림자 + 파란 필 버튼 + 라운드 입력 — 전형적 SaaS 카드 로그인으로 완전 이탈. 카카오 버튼은 공식 가이드 유지(#1208) |
| 7 | 회원가입 계열 `/signup` `/signup/verify` `/signup/social/complete` | 40% | 동일 AuthShell 카드 + 초록 파스텔 안내 박스 |
| 8 | 설정 `/settings/account` `/settings/privacy` | 45% | 자체 팔레트(#174ea6)와 라운드 박스 + 그림자. 세 번째 디자인 언어 |
| 9 | 관리자 6종 `/admin` `/admin/dashboard` `/admin/posts` `/admin/cloud` `/admin/profile` `/admin/tools` | 35% | 자체 블루(#0969da) + 파스텔 상태 박스(연두/주황/하늘) + KPI 카드 나열 + 필터 box-in-box. AI 대시보드 문법의 전형. `/admin/tools`는 세로로 늘어난 캡슐 버튼, "데이터 없음" 빈 박스 다수로 완성도 자체가 낮음 |
| 10 | 에디터 3종 `/editor/new` `/editor/[id]` `/editor/preview/[id]` | 70% | 구조는 담백. 파란 발행 버튼, 에디터 프레임 박스, 하단 빨간 알림 박스가 이탈. 툴바를 모노 라벨 + 헤어라인 문법으로 정합 필요 |

참고: `/feed`는 RSS XML 엔드포인트(의도된 동작)로 시각 디자인 대상이 아니다.

## 4. 실행 계획

기반 작업(토큰 통합) → 이탈 폭이 큰 페이지(인증·관리자) → 마감 폴리시 순서로 진행한다.

의존성: P0-1(#1218)이 선행되어야 나머지가 공용 토큰을 참조할 수 있다. 이후 P1-1~P1-4(#1219~#1222)는 화면 영역이 겹치지 않아 병렬 진행 가능하고, P2(#1223~#1225)는 마감 단계다. 단, `AdminSurfacePrimitives.tsx`는 #1220과 #1221이 공유하므로 셸/프리미티브 변경은 두 이슈 간 조율이 필요하다.

### Phase 0 — 기반
- **P0-1. 패밀리룩 가이드 문서화 + 토큰 통합**: 2장의 명세를 `docs/design`에 확정하고, `adminColorTokens.ts`·Settings 하드코딩 팔레트·AuthShell 팔레트를 공용 토큰(`design-system/tokens.ts`, `shared-ui-tokens`) 위로 통합한다. 이후 모든 하위 이슈가 이 토큰만 사용한다.

### Phase 1 — 디자인 언어 이탈 페이지 재설계
- **P1-1. 인증·설정 페이지 에디토리얼 재설계** (로그인/회원가입/인증 대기/소셜 완료/설정 2종): 카드 셸 제거, 헤어라인 구획 + 모노 라벨 + 사각 컨트롤. 카카오 버튼은 공식 디자인 유지.
- **P1-2. 관리자 셸·허브·대시보드 재설계**: 사이드바·상단 검색 셸을 공개 페이지 문법으로, 파스텔 상태 박스·KPI 카드를 헤어라인 테이블/정의 리스트로 치환.
- **P1-3. 관리자 글 관리·클라우드·프로필·운영 도구 정리**: box-in-box 필터 해체, 빈 상태 문법 통일, `/admin/tools` 캡슐 버튼 등 깨진 컴포넌트 수리.
- **P1-4. 에디터 패밀리룩 정합**: 발행 버튼·프레임·알림 박스를 기준 문법으로.

### Phase 2 — 준수 페이지 마감
- **P2-1. 오류 페이지(404/500) 에디토리얼 재설계**: 에디토리얼 타이포 중심으로, 필 버튼 제거.
- **P2-2. 글 상세 댓글·본문 요소 정리**: 댓글 박스 해체, 이모지 콜아웃 스타일 정리, mermaid 초기 렌더 확인.
- **P2-3. 공개 페이지 마감 폴리시**: 메인 모바일 메타 3열, legal 링크·버튼 톤 정리 등 미세 항목 일괄 처리.

## 5. 공통 완료 기준

- [ ] 모든 페이지가 2장의 패밀리룩 명세표를 위반하지 않는다 (파스텔 상태 면, 필 버튼, box-in-box, 카드 그림자 셸, 이모지 상태 표현 없음).
- [ ] 유채색은 절제된 블루 1종(링크·현재 위치)과 위험(danger) 텍스트만 남는다. 예외: 카카오 공식 버튼.
- [ ] 라이트/다크 모드 모두에서 위 기준을 만족한다.
- [ ] 데스크톱 1440px / 모바일 390px에서 깨지는 레이아웃이 없다.
- [ ] 하드코딩 팔레트가 제거되고 공용 토큰만 사용한다. 최종 게이트: `rg "#0969da|#0a58ca|#174ea6|#005fc4|#7cc4ff|#12b886|#087f5b" front/src` 무결과 (2장의 인벤토리 표 전 소유 이슈 완료 후 실행. `#0969da|#174ea6`만 검사하면 인증 팔레트를 놓친다).

## 6. 공통 검증 계획

- `yarn --cwd front build`
- `node front/scripts/check-bundle-size.mjs`
- `yarn --cwd front test:e2e:smoke` — `e2e/smoke*.spec.ts` + `e2e/mobile-layout*.spec.ts` 일괄 실행(preflight·베이스 URL 설정 포함). 개별 스펙은 `yarn --cwd front playwright:preflight` 후 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/<spec>.spec.ts --workers=1`
- 페이지별 데스크톱/모바일 스크린샷을 PR 증거로 첨부

참고: `front/test-results/aquilalog-v4-*-evidence` 디렉터리는 일회성 캡처 산출물로 재생성 스크립트가 저장소에 없다. 증거 스크린샷은 로컬 실행 후 데스크톱 1440px/모바일 390px 수동 캡처(또는 Playwright `page.screenshot`)로 대체하고, 캡처 절차를 PR에 기록한다.
