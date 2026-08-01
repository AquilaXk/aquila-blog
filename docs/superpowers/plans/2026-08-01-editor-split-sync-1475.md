# Editor Split Sync #1475 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 글 작성·수정 Split 모드에서 작성 본문과 프리뷰 본문의 첫 기준선 및 현재 문서 위치를 일치시킨다.

**Architecture:** Split 모드에서는 최종 공개용 제목·요약 헤더를 본문 스크롤 흐름에서 제외하고, 작성 textarea와 preview Markdown root가 동일한 body inset을 사용한다. 스크롤 동기화는 Markdown heading의 source 위치와 preview DOM heading 위치를 안정적인 occurrence key로 연결해 구간별 보간하며, 앵커가 없는 문서는 body-relative progress로 fallback한다. 프로그램적 스크롤은 owner ref로 반대 방향 이벤트 재진입을 차단한다.

**Tech Stack:** Next.js, React, TypeScript, Emotion styled components, Playwright.

## Constraints

- 정본 이슈는 #1475이며 PR은 `Closes #1475`로 연결한다.
- `/editor/new`와 `/editor/[id]`가 공유하는 `MarkdownEditor`에서 해결한다.
- Split은 본문 대 본문 비교를 우선하고 Preview 단독 모드는 `Public preview` 제목·요약 헤더를 유지한다.
- 기존 preview native wheel scroll 및 끝단 page scroll-chain 계약을 유지한다.
- Markdown 저장 포맷, 공개 상세 렌더러, backend API는 변경하지 않는다.
- 새 런타임 dependency를 추가하지 않는다.

---

### Task 1: 잘못된 회귀 계약 교체

**Files:**
- Modify: `front/e2e/editor-authoring-markdown-editor.spec.ts`

- [x] `previewStartTop > writeStartTop + 160`을 제거했다.
- [x] Split 첫 Markdown block과 textarea 첫 line의 Y 차이 ≤ 12px를 검증한다.
- [x] Split에서는 `Public preview`가 숨겨지고 Preview 단독 모드에서는 제목·요약과 함께 보이는지 검증한다.
- [x] Split preview desktop padding을 textarea와 동일한 32px로 고정한다.
- [x] 64개 section fixture에서 Section 32/48 heading identity 기반 양방향 동기화를 검증한다.

### Task 2: Split 전용 preview chrome과 body inset 정렬

**Files:**
- Modify: `front/src/components/markdown-editor/MarkdownEditor.styles.ts`

- [x] Split의 `PreviewHeader`를 layout에서 제외했다.
- [x] Split desktop article padding을 `30px 32px 110px`로 맞췄다.
- [x] Split mobile article padding을 `22px 18px 90px`로 맞췄다.
- [x] Preview 단독 모드의 기존 full-preview padding과 제목·요약 헤더를 유지했다.

### Task 3: heading anchor 기반 scroll mapping

**Files:**
- Create: `front/src/components/markdown-editor/markdownEditorScrollSyncModel.ts`
- Modify: `front/src/components/markdown-editor/useMarkdownEditorScrollSync.ts`
- Create: `front/tests/unit/markdownEditorScrollSyncModel.spec.ts`

**Interfaces:**
- `collectMarkdownHeadings(markdown: string): MarkdownHeading[]`
- `mapScrollFocusBetweenAnchors(args): number`

- [x] fenced code 안의 `#`를 heading에서 제외한다.
- [x] 동일 level/text heading을 occurrence key로 구분한다.
- [x] textarea wrapping을 동일 타이포 hidden mirror로 계측한다.
- [x] preview `.aq-markdown h1..h6` DOM 위치를 계측한다.
- [x] source/preview matched anchor 사이를 국소 보간한다.
- [x] heading이 없거나 매칭되지 않는 구간은 body range progress로 fallback한다.
- [x] programmatic target ref와 RAF release로 양방향 feedback loop를 차단한다.
- [x] content/layout signature cache로 동일 scroll 중 재계측을 피한다.

### Task 4: 검증 및 발행

- [x] 순수 모델 RED를 확인했다: model 파일 부재 상태에서 `ERR_MODULE_NOT_FOUND`.
- [x] 순수 모델 GREEN을 확인했다: 3 tests / 3 pass / 0 fail.
- [x] `main` 대비 변경 파일을 확인했다: 구현·테스트·계획 6개 파일만 변경.
- [x] 기존 1,188줄 authoring E2E의 나머지 wheel/upload/security/codeblock 테스트를 보존했다.
- [x] draft PR #1508을 생성하고 #1475를 연결했다.
- [ ] GitHub Frontend CI에서 `test:unit`, `test:e2e:authoring`, build, bundle-size를 확인한다.
- [ ] Security, SonarCloud, Vercel 상태와 리뷰 코멘트를 확인한다.
- [ ] 필수 검증이 green이면 PR을 ready 상태로 전환한다.
