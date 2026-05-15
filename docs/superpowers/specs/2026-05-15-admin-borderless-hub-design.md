# Admin Borderless Hub Design

## Goal
정리 대상은 `/admin` 허브다. 현재 화면은 큰 둥근 카드와 nested slab가 많아 메인페이지의 절제된 흐름과 분리되어 보인다. 목표는 관리자 허브를 메인페이지처럼 제목, 얇은 구분선, 리스트, 작은 액션 레일 중심으로 읽히게 만드는 것이다.

## Selected Direction
추천 방향은 `borderless operational hub`이다. 큰 카드를 제거하고, 섹션별 외곽 박스 대신 구분선과 밀도 있는 행(row)을 사용한다. 글 작성은 여전히 첫 번째 primary action으로 유지하되, 화면 전체를 hero card로 감싸지 않는다.

비교한 대안은 세 가지다.

- `Minimal patch`: 현재 카드 구조를 유지하고 radius/shadow만 줄인다. 작업은 작지만 사용자가 지적한 블록형 인상이 남는다.
- `Full admin redesign`: `/admin`, `/admin/dashboard`, `/admin/posts`, `/admin/tools`, `/admin/profile`을 한 번에 재정리한다. 일관성은 좋지만 범위와 회귀 위험이 크다.
- `Hub-first borderless`: `/admin` 허브에서 디자인 언어를 먼저 확정하고 공통 primitive는 필요한 만큼만 보정한다. 사용자 불편을 직접 줄이고 후속 확장 기준을 만들 수 있어 이번 작업에 가장 적합하다.

## Layout
`AdminShell`의 좌측 내비와 상단 utility bar는 유지한다. 본문 `AdminHubSurface`만 다음 흐름으로 재구성한다.

1. `Hero rail`: 큰 카드가 아니라 borderless heading rail이다. 좌측은 기존 제목, 우측은 `작성`, `목록` 액션을 작고 명확하게 둔다.
2. `Priority flow`: `지금 할 일`은 2개 큰 카드 대신 가로 행 또는 얇은 panel row로 표현한다. 첫 항목만 primary accent를 갖고, 나머지는 neutral row로 둔다.
3. `Recent work`: 최근 작업 summary와 상태 값은 하나의 큰 card 안의 카드들이 아니라 섹션 안 compact metric row로 둔다.
4. `Support rail`: 우측 `프로필 완성도`, `빠른 이동`, `최근 변경`은 독립 slab card를 줄이고, 제목 + divider + list row 형태로 정리한다.
5. `Profile snapshot`: 공개 노출 상태는 이미지와 텍스트를 한 줄에 가깝게 보여주며, 편집 액션은 작은 text/action row로 유지한다.

## Visual Rules
- 전체 섹션은 `border-bottom`과 spacing으로 구분한다.
- 반복 항목은 `border-radius`를 10~14px 이하로 줄이고 shadow를 쓰지 않는다.
- `background: transparent` 또는 low-contrast surface를 기본으로 한다.
- Blue는 primary action과 focus ring에만 사용한다.
- Grid 디자인의 near-black, operation surface, border token은 유지한다.
- 텍스트는 기존 문구를 가능한 유지하고, 가독성을 위해 hierarchy와 spacing만 조정한다.

## Component Boundaries
- `AdminHubSurface.tsx`가 이번 작업의 중심이다.
- `AdminSurfacePrimitives.tsx`는 공통 focus ring, rail/list primitive가 필요한 경우만 제한적으로 보정한다.
- `AdminShell.tsx`는 허브 본문과 직접 충돌하는 shell card성 styling이 있으면 최소 수정한다. 내비 구조와 라우팅은 바꾸지 않는다.
- 페이지 데이터, bootstrap, auth, profile publish contract는 변경하지 않는다.

## Responsive Behavior
- 1440x900: 좌측 본문 + 우측 support rail 구조를 유지하되, support rail도 card pile이 아니라 list rail처럼 보여야 한다.
- 768x1024: support rail은 본문 아래로 자연스럽게 내려가고, 각 action row가 2열 이하에서 깨지지 않아야 한다.
- 393x852: actions는 세로 row로 쌓이고, 긴 한글 문구가 버튼/행 밖으로 넘치지 않아야 한다.

## Testing
- `admin-hub-state.spec.ts`: 허브가 중복 slab/상태 rail 대신 borderless workflow contract를 쓰는지 source contract를 갱신한다.
- `admin-surface-primitives.spec.ts`: 공통 primitive 변경이 있으면 focus-visible/mobile snap 계약을 유지한다.
- `mobile-layout.spec.ts`: iPhone/iPad width에서 관리자 surface token과 overflow 계약을 확인한다.
- `perf.spec.ts`: admin route refresh/layout guard에 영향을 주지 않는지 확인한다.
- `yarn --cwd front build`를 최종 gate로 실행한다.

## Out Of Scope
- `/admin/profile` 편집 UX 전면 개편
- `/admin/posts` 목록, 검색, 삭제 동작 변경
- `/admin/dashboard` Grafana panel 동작 변경
- 공개 홈/상세 본문 타이포그래피 변경
- backend/API 변경
