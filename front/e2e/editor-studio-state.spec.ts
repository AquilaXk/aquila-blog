import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { getServerSideProps as getEditPageServerSideProps } from "src/pages/editor/[id]"
import { getServerSideProps as getNewPageServerSideProps } from "src/pages/editor/new"
import {
  deriveEditorPersistenceState,
  isPublishActionDisabled,
} from "src/routes/Admin/editorStudioState"
import { getEditorStudioPageProps } from "src/routes/Admin/EditorStudioPage"
import { buildPreviewSummaryFromMarkdown, normalizeCardSummary, normalizePersistedSummary } from "src/libs/postSummary"

test.describe("editor studio state", () => {
  test("기존 글은 서버 baseline과 같으면 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:1",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "",
      loadingKey: "",
    })

    expect(state.text).toBe("저장됨")
    expect(state.tone).toBe("success")
    expect(state.isPersistedEditBaseline).toBe(true)
  })

  test("기존 글을 수정하면 저장되지 않은 변경으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "edit",
      hasSelectedManagedPost: true,
      hasEditorDraftContent: true,
      editorStateFingerprint: "server:2",
      serverBaselineFingerprint: "server:1",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("저장되지 않은 변경")
    expect(state.tone).toBe("idle")
    expect(state.isPersistedEditBaseline).toBe(false)
  })

  test("새 글은 local draft와 같으면 자동 저장됨으로 본다", () => {
    const state = deriveEditorPersistenceState({
      editorMode: "create",
      hasSelectedManagedPost: false,
      hasEditorDraftContent: true,
      editorStateFingerprint: "local:1",
      serverBaselineFingerprint: "",
      localDraftFingerprint: "local:1",
      localDraftSavedAt: "2026-03-28T10:00:00",
      loadingKey: "",
    })

    expect(state.text).toBe("자동 저장됨")
    expect(state.tone).toBe("success")
    expect(state.isAutoSavedCreateDraft).toBe(true)
  })

  test("수정 반영 버튼은 edit mode + not loading + 최소 유효성일 때만 활성이다", () => {
    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(false)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "create",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "modifyPost",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: false,
        hasPlaceholderIssue: false,
      })
    ).toBe(true)

    expect(
      isPublishActionDisabled({
        publishActionType: "modify",
        editorMode: "edit",
        loadingKey: "",
        hasEditorMinimumFields: true,
        hasPlaceholderIssue: true,
      })
    ).toBe(true)
  })

  test("새 글/수정 전용 라우트는 동일한 EditorStudioPage와 SSR props를 공유한다", () => {
    expect(getNewPageServerSideProps).toBe(getEditorStudioPageProps)
    expect(getEditPageServerSideProps).toBe(getEditorStudioPageProps)

    const editorNewSource = readFileSync(path.resolve(__dirname, "../src/pages/editor/new.tsx"), "utf8")
    const editorEditSource = readFileSync(path.resolve(__dirname, "../src/pages/editor/[id].tsx"), "utf8")

    expect(editorNewSource).toContain("import { EditorStudioPage, getEditorStudioPageProps }")
    expect(editorEditSource).toContain("import { EditorStudioPage, getEditorStudioPageProps }")
    expect(editorNewSource).toContain("const EditorNewPage: NextPage<AdminPageProps> = (props) => <EditorStudioPage {...props} />")
    expect(editorEditSource).toContain("const EditorPostPage: NextPage<AdminPageProps> = (props) => <EditorStudioPage {...props} />")
  })

  test("editor studio는 v2 단일 경로와 단일 작성 모드 계약을 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const blockEditorShellSource = readFileSync(path.resolve(__dirname, "../src/components/editor/BlockEditorShell.tsx"), "utf8")
    const blockEditorEngineSource = readFileSync(path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tsx"), "utf8")
    const blockSelectionModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/blockSelectionModel.ts"),
      "utf8"
    )
    const writerEditorHostSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/WriterEditorHost.tsx"), "utf8")

    expect(editorStudioSource).not.toContain("BLOCK_EDITOR_V2_ENABLED")
    expect(editorStudioSource).not.toContain("EditorStudioLegacyToolbar")
    expect(editorStudioSource).not.toContain("RawMarkdownTextarea")
    expect(editorStudioSource).toContain("const isCompactSplitPreview = false")
    expect(editorStudioSource).toContain("width: min(100%, 1600px);")
    expect(editorStudioSource).toContain("grid-template-columns: minmax(0, 1fr);")
    expect(editorStudioSource).toContain('import { WriterEditorHost } from "./WriterEditorHost"')
    expect(editorStudioSource.match(/<WriterEditorHost/g)?.length).toBe(2)
    expect(editorStudioSource).not.toContain("<LazyBlockEditorShell")
    expect(editorStudioSource).not.toContain("EditorStudioPreviewColumn")
    expect(editorStudioSource).not.toContain('data-testid="editor-preview-body"')
    expect(editorStudioSource).not.toContain("LazyMarkdownRenderer")
    expect(editorStudioSource).not.toContain("공개 결과 미리보기")
    expect(editorStudioSource).not.toContain("실제 보기")
    expect(editorStudioSource).not.toContain("--editor-split-pane-width")
    expect(editorStudioSource).not.toContain('? "112rem" : "1600px"')
    expect(editorStudioSource).not.toContain("const LIVE_PREVIEW_RENDER_WIDTHS: Record<PreviewViewportMode, number> = {")
    expect(editorStudioSource).not.toContain('aria-label="미리보기 기기 폭"')
    expect(editorStudioSource).not.toContain('zoom: var(--preview-scale, 1);')
    expect(editorStudioSource).not.toContain("--preview-scale")
    expect(editorStudioSource).toContain("const EditorExitAction = styled.button`")
    expect(editorStudioSource).toContain("min-height: 42px;")
    expect(editorStudioSource).toContain("const EditorStudioFrame = styled.div`")
    expect(editorStudioSource).toContain("const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`")
    expect(writerEditorHostSource).toContain('dynamic(() => import("src/components/editor/BlockEditorShell")')
    expect(writerEditorHostSource).toContain("<Profiler")
    expect(writerEditorHostSource).toContain("<LazyBlockEditorShell")

    expect(blockEditorShellSource).toContain('import BlockEditorEngine from "./BlockEditorEngine"')
    expect(blockEditorShellSource).toContain('import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"')
    expect(blockEditorShellSource).toContain("const BlockEditorShell = (props: BlockEditorEngineProps) => <BlockEditorEngine {...props} />")
    expect(blockEditorEngineSource).not.toContain("Markdown 편집")
    expect(blockEditorEngineSource).not.toContain('label: "원문 블록"')
    expect(blockEditorEngineSource).not.toContain("buildStructuredInsertContent")
    expect(blockEditorEngineSource).not.toContain("insertRawMarkdownBlock")
    expect(blockEditorEngineSource).toContain("const QuickInsertBar = styled.div`")
    expect(blockEditorEngineSource).not.toContain("슬래시(`/`)나 `+` 없이도 자주 쓰는 블록을 바로 넣을 수 있습니다.")
    expect(blockEditorEngineSource).toContain(".aq-block-editor__content blockquote {")
    expect(blockEditorEngineSource).toContain("border-left: 4px solid")
    expect(blockEditorEngineSource).toContain("border-radius: 0;")
    expect(blockEditorEngineSource).toContain('from "./blockSelectionModel"')
    expect(blockEditorEngineSource).toContain('from "./useBlockEditorMarkdownCommit"')
    expect(blockEditorEngineSource).not.toContain("const normalizeMarkdown =")
    expect(blockEditorEngineSource).not.toContain("markdownCommitTimerRef")
    expect(blockEditorEngineSource).not.toContain("markdownCommitIdleHandleRef")
    expect(blockEditorEngineSource).not.toContain("markdownCommitMaxWaitTimerRef")
    expect(blockEditorEngineSource).not.toContain("pendingCommitEditorRef")
    expect(blockEditorEngineSource).not.toContain("lastCommittedMarkdownRef")
    expect(blockEditorEngineSource).not.toMatch(/const\s+isStableBlockHandleState\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+isStableBlockSelectionOverlayState\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+resolveOuterBlockSelectionGesture\s*=/)
    expect(blockSelectionModelSource).toContain("export const resolveOuterBlockSelectionGesture")
    expect(blockSelectionModelSource).toContain("export const resolveOuterListItemSelectionGesture")
    const selectionRuleMatch = blockEditorEngineSource.match(/\.aq-block-editor__content ::selection\s*\{([^}]*)\}/)
    expect(selectionRuleMatch?.[1]).toBeTruthy()
    expect(selectionRuleMatch?.[1]).not.toMatch(/\bcolor\s*:/)
  })

  test("editor studio는 SSR 관리자 스냅샷을 hydration auth race 동안 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const editorStudioRoutingSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"),
      "utf8"
    )
    const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")

    expect(editorStudioSource).toContain("const sessionMember = me || initialMember")
    expect(editorStudioSource).toContain('import { useEditorStudioRouting } from "./useEditorStudioRouting"')
    expect(editorStudioRoutingSource).toContain("if (!sessionMember) {")
    expect(editorStudioRoutingSource).toContain("if (!router.isReady || !isDedicatedEditorRoute || !sessionMember?.isAdmin) return")
    expect(navBarSource).toContain('router.pathname.startsWith("/editor")')
  })

  test("summary sentinel placeholder는 저장값으로 재사용하지 않고 본문 기준 요약으로 되돌린다", () => {
    const content =
      "## Stateless란 무엇인가?\n\nStateless는 서버가 요청 사이 사용자 상태를 저장하지 않고, 요청만으로 인증·인가 판단에 필요한 정보를 처리하는 방식이다."

    expect(normalizePersistedSummary("요약을 생성할 수 없습니다.")).toBe("")
    expect(normalizeCardSummary("요약을 생성할 수 없습니다.", { fallback: "" })).toBe("")
    expect(buildPreviewSummaryFromMarkdown(content, 150, "")).toContain(
      "Stateless는 서버가 요청 사이 사용자 상태를 저장하지 않고"
    )

    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    expect(editorStudioSource).toContain('buildPreviewSummaryFromMarkdown(content, maxLength, "")')
    expect(editorStudioSource).toContain("summary: normalizePersistedSummary(parsed.summary)")
    expect(editorStudioSource).toContain("const normalizedSummary = normalizePersistedSummary(options?.summary)")
  })

  test("dedicated editor 나가기는 returnTo 복귀를 replace로 처리해 editor history 엔트리를 남기지 않는다", () => {
    const editorStudioRoutingSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"),
      "utf8"
    )

    expect(editorStudioRoutingSource).toContain("const handleExitDedicatedEditor = useCallback(() => {")
    expect(editorStudioRoutingSource).toContain("void replaceRoute(router, dedicatedEditorReturnRoute)")
    expect(editorStudioRoutingSource).not.toContain("void pushRoute(router, dedicatedEditorReturnRoute)")
  })

  test("공개 글 저장 후 상세 재검증은 client cache eviction과 서버 revalidate를 함께 수행한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const revalidateApiSource = readFileSync(path.resolve(__dirname, "../src/pages/api/revalidate.ts"), "utf8")

    expect(editorStudioSource).toContain("await invalidatePublicPostReadCaches(queryClient, resolvedPostId || undefined)")
    expect(editorStudioSource).toContain('const revalidateResponse = await fetch("/api/revalidate", {')
    expect(editorStudioSource).toContain("paths: [toCanonicalPostPath(resolvedPostId)]")
    expect(revalidateApiSource).toContain('import { invalidatePublicPostReadCaches } from "src/apis/backend/posts"')
    expect(revalidateApiSource).toContain('import { fetchServerAdminSession } from "src/libs/server/authSession"')
    expect(revalidateApiSource).toContain("await invalidatePublicPostReadCaches()")
    expect(revalidateApiSource).toContain("Invalid token or admin session required")
  })

  test("table resize metadata와 상세 렌더 계약은 colgroup width와 drag guide를 유지한다", () => {
    const blockEditorEngineSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tsx"),
      "utf8"
    )
    const tableAffordanceModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tableAffordanceModel.ts"),
      "utf8"
    )
    const tableWidthModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tableWidthModel.ts"),
      "utf8"
    )
    const tableStructureModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tableStructureModel.ts"),
      "utf8"
    )
    const tablePasteModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tablePasteModel.ts"),
      "utf8"
    )
    const tableRenderedDomModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tableRenderedDomModel.ts"),
      "utf8"
    )
    const tableCornerGrowModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/tableCornerGrowModel.ts"),
      "utf8"
    )
    const editorStudioSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"),
      "utf8"
    )
    const editorStudioPersistenceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioPersistence.ts"),
      "utf8"
    )
    const markdownRendererRootSource = readFileSync(
      path.resolve(__dirname, "../src/libs/markdown/components/MarkdownRendererRoot.tsx"),
      "utf8"
    )
    const markdownRendererSource = readFileSync(
      path.resolve(__dirname, "../src/libs/markdown/MarkdownRenderer.tsx"),
      "utf8"
    )

    expect(blockEditorEngineSource).toContain('data-testid="table-column-drag-guide"')
    expect(blockEditorEngineSource).toContain('data-testid={`table-column-resize-boundary-${index}`}')
    expect(blockEditorEngineSource).toContain("const syncTableColumnDragGuideForColumn = useCallback(")
    expect(blockEditorEngineSource).toContain("const getActiveTableRectFromDom = useCallback(")
    expect(blockEditorEngineSource).toContain('import { createPortal } from "react-dom"')
    expect(blockEditorEngineSource).toContain("const tableOverlayPortal =")
    expect(blockEditorEngineSource).toContain("createPortal(tableOverlay, document.body)")
    expect(blockEditorEngineSource).toContain("const TABLE_EDGE_HANDLE_INSET_PX = 6")
    expect(tableAffordanceModelSource).toContain("export const TABLE_EDGE_ADD_BUTTON_SIZE_PX = 24")
    expect(tableAffordanceModelSource).toContain("export const TABLE_CELL_MENU_BUTTON_SIZE_PX = 22")
    expect(tableAffordanceModelSource).toContain("export const TABLE_ADD_BAR_VIEWPORT_PADDING_PX = 8")
    expect(blockEditorEngineSource).toContain('data-testid="table-corner-grow-handle"')
    expect(blockEditorEngineSource).toContain('data-testid="table-corner-preview-outline"')
    expect(blockEditorEngineSource).toContain('data-testid="table-structure-menu-button"')
    expect(blockEditorEngineSource).toContain('data-testid="table-cell-menu-button"')
    expect(blockEditorEngineSource).toContain('data-testid="table-overflow-mode-normal"')
    expect(blockEditorEngineSource).toContain('data-testid="table-overflow-mode-wide"')
    expect(blockEditorEngineSource).toContain("const promoteLargeTablesToWideOverflowMode = (editor: TiptapEditor) => {")
    expect(tableWidthModelSource).toContain('export const TABLE_OVERFLOW_MODE_WIDE = "wide"')
    expect(tableWidthModelSource).toContain("export const getTableOverflowMode = (")
    expect(tableWidthModelSource).toContain("export const shouldPromoteWideTableOverflowMode = (")
    expect(tableWidthModelSource).toContain("export const promotePastedWideTables = (")
    expect(tableWidthModelSource).toContain("export const computeNextTableColumnWidthsForResize = (")
    expect(tableWidthModelSource).toContain("export const didTableColumnResizeHitOverflowPolicy = (")
    expect(blockEditorEngineSource).toContain('} from "./tableWidthModel"')
    expect(blockEditorEngineSource).not.toContain("const TABLE_OVERFLOW_MODE_WIDE =")
    expect(blockEditorEngineSource).not.toContain("const getTableOverflowMode =")
    expect(blockEditorEngineSource).not.toContain("const shouldPromoteWideTableOverflowMode =")
    expect(blockEditorEngineSource).not.toContain("const computeNextTableColumnWidthsForResize = (")
    expect(blockEditorEngineSource).not.toContain("const didTableColumnResizeHitOverflowPolicy = (")
    expect(tableStructureModelSource).toContain("export const collectSimpleTableColumnCells = (")
    expect(tableStructureModelSource).toContain("export const buildReorderedSimpleTableNode = (")
    expect(tableStructureModelSource).toContain("export const canShrinkTableAxisAtEnd = (")
    expect(tableStructureModelSource).toContain("export const countShrinkableTableAxisAtEnd = (")
    expect(tableStructureModelSource).toContain("export const countShrinkableRenderedTableAxisAtEnd = (")
    expect(blockEditorEngineSource).toContain('} from "./tableStructureModel"')
    expect(blockEditorEngineSource).not.toContain("const collectSimpleTableColumnCells = (")
    expect(blockEditorEngineSource).not.toContain("const buildReorderedSimpleTableNode = (")
    expect(blockEditorEngineSource).not.toContain("const canShrinkTableAxisAtEnd = (")
    expect(blockEditorEngineSource).not.toContain("const countShrinkableTableAxisAtEnd = (")
    expect(blockEditorEngineSource).not.toContain("const countShrinkableRenderedTableAxisAtEnd = (")
    expect(tablePasteModelSource).toContain("export const normalizeTableContextPasteText = (")
    expect(tablePasteModelSource).toContain("const normalizeTableContextPasteLine = (")
    expect(tablePasteModelSource).toContain("const isMarkdownTableRow = (")
    expect(blockEditorEngineSource).toContain('from "./tablePasteModel"')
    expect(blockEditorEngineSource).not.toContain("const normalizeTableContextPasteText = (")
    expect(blockEditorEngineSource).not.toContain("const normalizeTableContextPasteLine = (")
    expect(blockEditorEngineSource).not.toContain("const isMarkdownTableRow = (")
    expect(tableRenderedDomModelSource).toContain("export const findActiveRenderedTable = (")
    expect(tableRenderedDomModelSource).toContain("export const resolveTableScopedSelectedCell = (")
    expect(tableRenderedDomModelSource).toContain("export const resolveActiveRenderedTableForFloatingUi = (")
    expect(tableRenderedDomModelSource).toContain("export const readRenderedColumnWidths = (")
    expect(blockEditorEngineSource).toContain('} from "./tableRenderedDomModel"')
    expect(blockEditorEngineSource).not.toContain("const findActiveRenderedTable = (")
    expect(blockEditorEngineSource).not.toContain("const resolveTableScopedSelectedCell = (")
    expect(blockEditorEngineSource).not.toContain("const resolveActiveRenderedTableForFloatingUi = (")
    expect(blockEditorEngineSource).not.toContain("const readRenderedColumnWidths = (")
    expect(blockEditorEngineSource).toContain('data-testid="table-row-drag-shadow"')
    expect(blockEditorEngineSource).toContain('"table-row-reorder-indicator"')
    expect(blockEditorEngineSource).toContain('"table-column-reorder-indicator"')
    expect(blockEditorEngineSource).toContain('const TableCellMenuButton = styled(TableHandleButton)`')
    expect(blockEditorEngineSource).toContain("const updateActiveTableOverflowMode = useCallback(")
    expect(blockEditorEngineSource).toContain("const reorderTableAxisAtPosition = useCallback(")
    expect(tableCornerGrowModelSource).toContain("export type TableCornerGrowState = {")
    expect(tableCornerGrowModelSource).toContain("export type TableCornerPreviewState = {")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerPreviewState = (")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerGrowStepMetrics = (")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerGrowStepMetricsFromDataset = (")
    expect(blockEditorEngineSource).toContain('} from "./tableCornerGrowModel"')
    expect(blockEditorEngineSource).not.toContain("type TableCornerGrowState = {")
    expect(blockEditorEngineSource).not.toContain("type TableCornerPreviewState = {")
    expect(blockEditorEngineSource).not.toContain("const resolveTableCornerPreviewState = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const getTableCornerGrowStepMetrics = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const getTableCornerGrowStepMetricsFromHandle = useCallback(")
    expect(blockEditorEngineSource).toContain("const applyTableCornerGrowSteps = useCallback(")
    expect(blockEditorEngineSource).toContain("const shrinkTableAxisAtEnd = useCallback(")
    expect(blockEditorEngineSource).toContain("const beginTableAxisDragFromPending = useCallback(")
    expect(blockEditorEngineSource).toContain("const startPendingTableAxisDrag = useCallback(")
    expect(blockEditorEngineSource).toContain("const selectTableAxisAtIndex = useCallback(")
    expect(blockEditorEngineSource).toContain('overflowMode: getTableOverflowMode(tableNode)')
    expect(tableWidthModelSource).toContain("const maxActiveWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, safeBudget - otherColumnsWidth)")
    expect(blockEditorEngineSource).toContain("const tableCornerGrowSuppressClickRef = useRef(false)")
    expect(blockEditorEngineSource).toContain('"grip" | "grow"')
    expect(blockEditorEngineSource).toContain('const isCellMenuOpen = tableMenuKind === "cell"')
    expect(markdownRendererSource).toContain("const explicitTableWidth = useMemo(")
    expect(markdownRendererSource).toContain("minWidth: `${explicitTableWidth}px`")
    expect(markdownRendererRootSource).toContain("width: auto;")
    expect(markdownRendererRootSource).toContain("max-width: none;")
    expect(blockEditorEngineSource).toContain('const isRowMenuOpen = tableMenuKind === "row"')
    expect(blockEditorEngineSource).toContain('const isColumnMenuOpen = tableMenuKind === "column"')
    expect(blockEditorEngineSource).toContain("activeTableStructureState.hasHeaderRow")
    expect(blockEditorEngineSource).toContain("activeTableStructureState.hasHeaderColumn")
    expect(blockEditorEngineSource).toContain("const tableCornerGrowStepMetrics = resolveTableCornerGrowStepMetrics(tableAffordanceGeometry)")
    expect(blockEditorEngineSource).toContain("data-column-step={tableCornerGrowStepMetrics.columnStepPx}")
    expect(blockEditorEngineSource).toContain("data-row-step={tableCornerGrowStepMetrics.rowStepPx}")
    expect(blockEditorEngineSource).toContain('aria-label="표 구조 메뉴"')
    expect(blockEditorEngineSource).toContain("페이지 너비에 맞춤")
    expect(blockEditorEngineSource).toContain("넓은 표")
    expect(blockEditorEngineSource).toContain("제목 행")
    expect(blockEditorEngineSource).toContain("제목 열")
    expect(tableAffordanceModelSource).toContain("export type TableAffordanceGeometry = {")
    expect(tableAffordanceModelSource).toContain("export type TableAffordanceVisibility = {")
    expect(tableAffordanceModelSource).toContain("export const INITIAL_TABLE_AFFORDANCE_GEOMETRY: TableAffordanceGeometry = {")
    expect(tableAffordanceModelSource).toContain("export const INITIAL_TABLE_AFFORDANCE_VISIBILITY: TableAffordanceVisibility = {")
    expect(tableAffordanceModelSource).toContain("export const resolveDesktopTableRailLayout = (")
    expect(blockEditorEngineSource).toContain('} from "./tableAffordanceModel"')
    expect(blockEditorEngineSource).not.toContain("type TableAffordanceGeometry = {")
    expect(blockEditorEngineSource).not.toContain("type TableAffordanceVisibility = {")
    expect(blockEditorEngineSource).not.toContain("const INITIAL_TABLE_AFFORDANCE_GEOMETRY: TableAffordanceGeometry = {")
    expect(blockEditorEngineSource).not.toContain("const INITIAL_TABLE_AFFORDANCE_VISIBILITY: TableAffordanceVisibility = {")
    expect(blockEditorEngineSource).toContain("const [tableAffordanceGeometry, setTableAffordanceGeometry] = useState<TableAffordanceGeometry>(")
    expect(blockEditorEngineSource).toContain(
      "const [tableAffordanceVisibility, setTableAffordanceVisibility] = useState<TableAffordanceVisibility>("
    )
    expect(blockEditorEngineSource).toContain("const tableAffordanceVisibilityRef = useRef(tableAffordanceVisibility)")
    expect(blockEditorEngineSource).not.toContain("type TableQuickRailState =")
    expect(blockEditorEngineSource).toContain('const isTableStructureMenuOpen = tableMenuKind === "table"')
    expect(blockEditorEngineSource).toContain(
      "const shouldShowColumnAddBar ="
    )
    expect(blockEditorEngineSource).toContain(
      "shouldShowDesktopTableHandles && (tableAffordanceVisibility.showColumnAddBar || isColumnMenuOpen)"
    )
    expect(blockEditorEngineSource).toContain(
      "const shouldShowRowAddBar ="
    )
    expect(blockEditorEngineSource).toContain(
      "shouldShowDesktopTableHandles && (tableAffordanceVisibility.showRowAddBar || isRowMenuOpen)"
    )
    expect(blockEditorEngineSource).toContain("findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)")
    expect(blockEditorEngineSource).toContain("display: none !important;")
    expect(editorStudioSource).toContain('import { useEditorStudioPersistence } from "./useEditorStudioPersistence"')
    expect(editorStudioPersistenceSource).toContain("const currentPostContent = postContentLiveRef.current")
    expect(markdownRendererRootSource.match(/table-layout: fixed;/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(markdownRendererRootSource).not.toContain("table-layout: auto;")
  })

  test("editor studio SSR은 작성자 카드에 공개 프로필 snapshot을 먼저 seed한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")

    expect(editorStudioSource).toContain('"/member/api/v1/adm/members/bootstrap"')
    expect(editorStudioSource).toContain("const mergedMember: AuthMember = {")
    expect(editorStudioSource).toContain("profile.profileImageDirectUrl ||")
    expect(editorStudioSource).toContain("profile.profileImageUrl ||")
    expect(editorStudioSource).toContain("props: buildAdminPagePropsFromMember(mergedMember)")
  })

  test("/editor/new는 temp draft bootstrap이 끝날 때까지 loading state를 먼저 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const editorStudioDraftLifecycleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioDraftLifecycle.ts"),
      "utf8"
    )
    const editorStudioRoutingSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"),
      "utf8"
    )

    expect(editorStudioSource).toContain("const isDedicatedNewEditorRoute = isDedicatedEditorRoute && router.pathname === EDITOR_NEW_ROUTE_PATH")
    expect(editorStudioSource).toContain("const [isNewEditorBootstrapPending, setIsNewEditorBootstrapPending] = useState(isDedicatedNewEditorRoute)")
    expect(editorStudioDraftLifecycleSource).toContain("if (options?.redirectToEditor && tempPost.id) {")
    expect(editorStudioDraftLifecycleSource).toContain("await replaceRoute(router, destination)")
    expect(editorStudioRoutingSource).toContain("setIsNewEditorBootstrapPending(true)")
    expect(editorStudioSource).toContain("(isNewEditorBootstrapPending || loadingKey === \"postTemp\")")
  })

  test("썸네일 편집 패널은 클립보드 이미지 붙여넣기 업로드 계약을 유지한다", () => {
    const editorStudioSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const editorStudioPersistenceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioPersistence.ts"),
      "utf8"
    )

    expect(editorStudioSource).toContain("const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {")
    expect(editorStudioSource).toContain("<PreviewEditorSection onPasteCapture={handleThumbnailPaste}>")
    expect(editorStudioSource).toContain("onPaste={handleThumbnailPaste}")
    expect(editorStudioPersistenceSource).toContain("const handleThumbnailPaste = useCallback(")
    expect(editorStudioPersistenceSource).toContain("setThumbnailImageFileName(imageFile.name || \"clipboard-image.png\")")
    expect(editorStudioPersistenceSource).toContain("void handleUploadThumbnailImage(imageFile)")
  })

  test("QA route는 writer/engine surface 계약을 분리 유지한다", () => {
    const qaSource = readFileSync(path.resolve(__dirname, "../src/pages/_qa/block-editor-slash.tsx"), "utf8")
    const qaHarnessSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/QaEditorHarness.tsx"), "utf8")

    expect(qaSource).toContain('surface: "writer" | "engine"')
    expect(qaSource).toContain('rawSurface === "engine" ? "engine" : "writer"')
    expect(qaSource).toContain('if (props.surface === "writer") {')
    expect(qaSource).toContain("return <EditorStudioPage {...props} />")
    expect(qaSource).toContain('import { QaEditorHarness } from "src/routes/Admin/QaEditorHarness"')
    expect(qaSource).toContain("return <QaEditorHarness seedMarkdown={props.seedMarkdown} />")
    expect(qaSource).not.toContain("BlockEditorShell 엔진 QA")
    expect(qaSource).not.toContain('dynamic(() => import("src/components/editor/BlockEditorShell")')
    expect(qaHarnessSource).toContain('import type { BlockEditorQaActions } from "src/components/editor/blockEditorContract"')
    expect(qaHarnessSource).toContain('dynamic(() => import("src/components/editor/BlockEditorShell")')
    expect(qaHarnessSource).toContain("BlockEditorShell 엔진 QA")
    expect(qaHarnessSource).toContain("실제 글쓰기 화면 레이아웃과 제목 입력칸 회귀는")
  })
})
