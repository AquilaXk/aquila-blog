# Editor Split Body Scroll Sync Implementation Plan

> Issue: #1475  
> Base: `main` at `e18be51fd6eb6284077ff7f1283b761833521cf8`

## Goal

글 작성·수정 Split 모드에서 Markdown source의 현재 heading/본문 위치와 공개 프리뷰의 대응 heading/본문 위치를 같은 viewport 구간에 유지한다. Preview-only 모드의 `Public preview` 제목·요약 헤더와 기존 wheel page-chain 계약은 유지한다.

## Root cause

- 작성부는 본문 source만 스크롤하지만 프리뷰는 공개 제목·요약 헤더와 렌더 본문을 같은 scroll container에 둔다.
- 기존 hook은 서로 다른 높이 분포를 전체 `scrollTop / scrollMax` 비율 하나로 연결한다.
- 기존 E2E는 프리뷰 본문이 작성부보다 160px 이상 아래에서 시작하는 상태를 정상으로 고정한다.

## Architecture

1. `markdownEditorScrollSyncModel.ts`
   - fenced code 내부를 제외한 ATX heading line을 추출한다.
   - source/target heading anchor 사이의 scrollTop을 국소 선형 보간한다.
   - 중복·역전된 측정치를 단조 증가 anchor로 정규화한다.
2. `useMarkdownEditorScrollSync.ts`
   - textarea computed style을 복제한 비가시 mirror로 source heading의 실제 wrap-aware Y 좌표를 측정한다.
   - `.aq-markdown` heading DOM과 순서대로 연결하고, body start + heading + document end anchor를 만든다.
   - Split 진입 시 preview-only 헤더 높이를 제외한 본문 시작점으로 정렬한다.
   - Split 종료 후 Preview-only 진입 시 preview scrollTop을 0으로 복원한다.
   - 프로그램적 양방향 scroll event를 소비해 feedback loop를 차단한다.
   - preview content `ResizeObserver`로 이미지·Mermaid·코드 렌더 높이 변경 후 anchor cache를 무효화하고 마지막 사용자 pane 기준으로 재정렬한다.
3. `editor-authoring-markdown-editor.spec.ts`
   - 기존 `previewStartTop > writeStartTop + 160` 계약을 body start 오차 12px 이하로 교체한다.
   - Section 1/16/32/48/64 identity를 기준으로 양방향 viewport 위치를 검증한다.
   - Preview-only 전환 시 공개 헤더가 다시 보이는지 검증한다.

## Files

- Create: `front/src/components/markdown-editor/markdownEditorScrollSyncModel.ts`
- Modify: `front/src/components/markdown-editor/useMarkdownEditorScrollSync.ts`
- Modify: `front/e2e/editor-authoring-markdown-editor.spec.ts`
- Create: `docs/agent/editor-split-scroll-sync-plan-2026-08-01.md`

## Constraints

- Markdown parser, 저장 데이터, backend API는 변경하지 않는다.
- `MarkdownEditor.tsx`, 공개 상세 renderer, wheel remainder/page-chain 정책은 변경하지 않는다.
- horizontal padding과 preview readable width 760px 계약을 유지한다.
- 신규 dependency를 추가하지 않는다.

## TDD and verification

1. RED: pure model import가 없는 상태에서 Node test 실패를 확인한다.
2. GREEN: heading extraction 및 anchor interpolation model test 4건을 통과한다.
3. Browser regression: body start, heading identity 양방향 sync, Preview-only header 복원을 Playwright로 검증한다.
4. Full checks:

```bash
yarn --cwd front playwright:preflight
yarn --cwd front test:e2e:authoring
yarn --cwd front build
yarn --cwd front check:bundle-size
yarn --cwd front test:e2e:smoke
```

핵심 authoring spec은 동일 조건으로 2회 연속 통과를 확인한다.

## Commit

```text
fix(editor): Split 본문 스크롤 동기화 복구
```

PR은 `main` 대상으로 생성하고 본문에 `close #1475`를 포함한다.
