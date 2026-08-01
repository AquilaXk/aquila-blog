# Editor Split Sync #1475 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 글 작성·수정 Split 모드에서 작성 본문과 프리뷰 본문의 시작선 및 현재 문서 위치를 일치시키고, 상단 bar와 3열 frame 경계를 같은 레이아웃 계약으로 정렬한다.

**Architecture:** Split 모드에서는 최종 공개용 제목·요약 헤더를 본문 스크롤 흐름에서 제외하고, 작성 textarea와 preview Markdown root가 동일한 body inset을 사용한다. 스크롤 동기화는 Markdown heading의 source line 위치와 preview DOM heading 위치를 앵커로 연결해 구간별 보간하고, 앵커가 없는 문서는 body-relative progress로 fallback한다. 프로그램적 스크롤은 owner ref로 반대 방향 이벤트 재진입을 차단한다.

**Tech Stack:** Next.js, React, TypeScript, Emotion styled components, Playwright.

## Global Constraints

- 정본 이슈는 #1475이며 PR 본문은 `Closes #1475`로 연결한다.
- `/editor/new`와 `/editor/[id]`가 같은 `MarkdownEditor` 계약을 사용해야 한다.
- Split 모드에서는 본문 대 본문 비교를 우선하고, Preview 단독 모드에서는 `Public preview` 제목·요약 헤더를 유지한다.
- 기존 preview native wheel scroll 및 끝단 page scroll-chain 계약을 유지한다.
- Markdown 저장 포맷, 공개 상세 렌더러, backend API는 변경하지 않는다.
- 새 런타임 dependency를 추가하지 않는다.

---

### Task 1: 회귀 테스트를 올바른 사용자 계약으로 교체

**Files:**
- Modify: `front/e2e/editor-authoring-markdown-editor.spec.ts`

**Interfaces:**
- Consumes: 기존 authenticated editor fixture와 `markdown-editor-*` test id.
- Produces: Split body origin, Preview-only header, heading identity 기반 양방향 sync, topbar/frame boundary 계약.

- [ ] **Step 1: 기존 잘못된 시작선 assertion을 RED 테스트로 교체**

  `previewStartTop > writeStartTop + 160`을 제거하고 Split에서 첫 Markdown block과 textarea 첫 line의 Y 차이가 12px 이하이며 `Public preview`가 Split flow에 없음을 검증한다.

- [ ] **Step 2: Preview-only 헤더 보존 RED 테스트 추가**

  Preview 탭으로 전환한 후 `Public preview`, 제목, 요약이 보이는지 검증한다.

- [ ] **Step 3: heading identity 기반 양방향 sync RED 테스트 추가**

  64개 section fixture에서 write source의 `Section 16/32/48` 위치로 이동한 뒤 같은 heading이 preview viewport 상단 25% 구간에 오는지 검증하고, preview `Section 48`을 기준 위치로 이동한 뒤 textarea source line이 허용 오차 안에 오는지 검증한다.

- [ ] **Step 4: topbar/frame desktop boundary RED 테스트 추가**

  1440px 이상에서 topbar의 첫 번째/세 번째 column 경계와 outline/writing/inspector 경계가 2px 이내인지 `getBoundingClientRect()`로 검증한다.

- [ ] **Step 5: 대상 테스트를 실행해 기존 구현에서 의도대로 실패하는지 확인**

  ```bash
  yarn --cwd front playwright:preflight
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/editor-authoring-markdown-editor.spec.ts --grep "split body origin|heading identity|topbar frame" --workers=1
  ```

  Expected: body origin, semantic sync, column boundary 중 하나 이상이 현재 구현 때문에 FAIL.

### Task 2: Split 전용 preview chrome 및 body inset 정렬

**Files:**
- Modify: `front/src/components/markdown-editor/MarkdownEditor.styles.ts`

**Interfaces:**
- Consumes: `EditorBody[data-mode="split"]`, `PreviewHeader`, `PreviewArticle`.
- Produces: Split에서는 헤더가 layout/접근성 tree에 나타나지 않고 Preview-only에서는 유지되는 CSS 계약.

- [ ] **Step 1: Split에서 PreviewHeader를 제거하고 동일 body inset 적용**

  `EditorBody[data-mode="split"]` 하위 `PreviewHeader`를 `display: none` 처리하고 `PreviewArticle`의 desktop padding을 textarea와 동일한 `30px 32px`로 맞춘다. Preview-only와 모바일 Preview의 기존 full-preview padding은 유지한다.

- [ ] **Step 2: 시작선·Preview-only RED 테스트를 GREEN으로 전환**

  Task 1의 body origin 및 Preview-only 테스트를 재실행한다.

### Task 3: heading anchor 기반 scroll mapping 구현

**Files:**
- Create: `front/src/components/markdown-editor/markdownEditorScrollSyncModel.ts`
- Modify: `front/src/components/markdown-editor/useMarkdownEditorScrollSync.ts`
- Test: `front/e2e/editor-authoring-markdown-editor.spec.ts`

**Interfaces:**
- Produces:
  - `collectMarkdownHeadingAnchors(markdown: string): MarkdownSourceAnchor[]`
  - `collectPreviewHeadingAnchors(preview: HTMLElement): PreviewAnchor[]`
  - `mapScrollFocusBetweenAnchors(sourceFocus: number, sourceAnchors: ScrollAnchor[], targetAnchors: ScrollAnchor[], sourceRange: ScrollRange, targetRange: ScrollRange): number`
- The hook reads `textarea.value` and `.aq-markdown` DOM directly; `MarkdownEditor` props do not change.

- [ ] **Step 1: source/preview anchor model 작성**

  fenced code 안의 `#`는 heading으로 취급하지 않고 ATX heading line index와 normalized text를 수집한다. Preview heading은 `.aq-markdown h1,h2,h3,h4,h5,h6`를 DOM 순서대로 수집하고 동일 텍스트·level의 다음 unmatched source anchor와 결합한다.

- [ ] **Step 2: 구간별 보간과 fallback 구현**

  source viewport의 25% 지점을 focus로 삼고 앞·뒤 matched anchor 사이에서 선형 보간한다. 첫 anchor 전·마지막 anchor 후 및 anchor 없는 문서는 Markdown body start/end를 기준으로 progress fallback한다.

- [ ] **Step 3: 양방향 이벤트 feedback 차단**

  `programmaticScrollOwnerRef`와 다음 animation frame까지 유지되는 release guard를 사용해 write가 설정한 preview scroll event가 write를 다시 덮어쓰지 않게 한다.

- [ ] **Step 4: heading identity 테스트를 GREEN으로 전환**

  상·중·하단과 역방향 mapping assertion을 통과시킨다.

- [ ] **Step 5: 기존 wheel 계약 회귀 실행**

  ```bash
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/editor-authoring-markdown-editor.spec.ts --grep "분할 미리보기 wheel" --workers=1
  ```

### Task 4: topbar와 frame grid 계약 통일

**Files:**
- Modify: `front/src/routes/Admin/EditorStudioDedicatedEditorSurface.tsx`
- Modify: `front/src/routes/Admin/EditorStudioDedicatedEditorSurfaceParts.tsx`

**Interfaces:**
- Produces: `--editor-outline-width`, `--editor-inspector-width` CSS custom property 기반 desktop grid.

- [ ] **Step 1: 측정 가능한 test id 추가**

  topbar에 `data-testid="editor-studio-topbar"`, outline/inspector에 기존 접근성 selector를 유지한다.

- [ ] **Step 2: desktop column token 공용화**

  root에서 outline 220px, inspector 300px를 정의하고 topbar/frame 모두 `var(--editor-outline-width) minmax(0, 1fr) var(--editor-inspector-width)`를 사용한다. 1100px 이하 tier는 기존 inspector bottom-row 구조를 유지하되 같은 breakpoint에서 topbar도 전환한다.

- [ ] **Step 3: boundary RED 테스트를 GREEN으로 전환**

  1440/1512/1920 중 fixture viewport에서 2px 허용 오차를 만족시킨다.

### Task 5: 전체 검증, 리뷰, 발행

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: targeted test 2회 연속 실행**

  ```bash
  yarn --cwd front playwright:preflight
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/editor-authoring-markdown-editor.spec.ts --workers=1
  PLAYWRIGHT_BASE_URL=http://127.0.0.1:3100 yarn --cwd front playwright test e2e/editor-authoring-markdown-editor.spec.ts --workers=1
  ```

- [ ] **Step 2: build와 bundle gate 실행**

  ```bash
  yarn --cwd front build
  node front/scripts/check-bundle-size.mjs
  ```

- [ ] **Step 3: smoke 검증**

  ```bash
  yarn --cwd front test:e2e:smoke
  ```

- [ ] **Step 4: diff 자체 리뷰**

  공개 상세·저장/API 변경이 없는지, DOM query가 editor preview 범위로 제한되는지, scroll handler가 불필요한 React state update를 만들지 않는지 확인한다.

- [ ] **Step 5: commit 및 draft PR 생성**

  Branch: `agent/fix-editor-split-sync-1475`

  PR title: `[Fix] 글쓰기 Split 작성·프리뷰 위치 동기화 복구`

  PR body에 root cause, 변경 내용, 검증 결과, `Closes #1475`를 포함한다.
