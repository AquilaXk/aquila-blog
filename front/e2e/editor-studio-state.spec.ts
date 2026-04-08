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

  test("table resize metadata와 상세 렌더 계약은 colgroup width와 drag guide를 유지한다", () => {
    const blockEditorEngineSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tsx"),
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

    expect(blockEditorEngineSource).toContain('data-testid="table-column-drag-guide"')
    expect(blockEditorEngineSource).toContain('data-testid={`table-column-resize-boundary-${index}`}')
    expect(blockEditorEngineSource).toContain("const syncTableColumnDragGuideForColumn = useCallback(")
    expect(blockEditorEngineSource).toContain("const getActiveTableRectFromDom = useCallback(")
    expect(blockEditorEngineSource).toContain('import { createPortal } from "react-dom"')
    expect(blockEditorEngineSource).toContain("const tableOverlayPortal =")
    expect(blockEditorEngineSource).toContain("createPortal(tableOverlay, document.body)")
    expect(blockEditorEngineSource).toContain("const TABLE_EDGE_HANDLE_INSET_PX = 6")
    expect(blockEditorEngineSource).toContain("const TABLE_EDGE_ADD_BUTTON_SIZE_PX = 24")
    expect(blockEditorEngineSource).toContain('data-testid="table-corner-grow-handle"')
    expect(blockEditorEngineSource).toContain('data-testid="table-corner-preview-outline"')
    expect(blockEditorEngineSource).toContain('data-testid="table-structure-menu-button"')
    expect(blockEditorEngineSource).toContain('data-testid="table-cell-menu-button"')
    expect(blockEditorEngineSource).toContain('data-testid="table-overflow-mode-normal"')
    expect(blockEditorEngineSource).toContain('data-testid="table-overflow-mode-wide"')
    expect(blockEditorEngineSource).toContain('data-testid="table-row-drag-shadow"')
    expect(blockEditorEngineSource).toContain('"table-row-reorder-indicator"')
    expect(blockEditorEngineSource).toContain('"table-column-reorder-indicator"')
    expect(blockEditorEngineSource).toContain('const TableCellMenuButton = styled(TableHandleButton)`')
    expect(blockEditorEngineSource).toContain("const updateActiveTableOverflowMode = useCallback(")
    expect(blockEditorEngineSource).toContain("const reorderTableAxisAtPosition = useCallback(")
    expect(blockEditorEngineSource).toContain("const getTableCornerGrowStepMetrics = useCallback(")
    expect(blockEditorEngineSource).toContain("type TableCornerPreviewState = {")
    expect(blockEditorEngineSource).toContain("const resolveTableCornerPreviewState = useCallback(")
    expect(blockEditorEngineSource).toContain("const applyTableCornerGrowSteps = useCallback(")
    expect(blockEditorEngineSource).toContain("const canShrinkTableAxisAtEnd = (tableNode: ProseMirrorNode, axis: \"row\" | \"column\"): boolean => {")
    expect(blockEditorEngineSource).toContain("const countShrinkableTableAxisAtEnd = (tableNode: ProseMirrorNode, axis: \"row\" | \"column\"): number => {")
    expect(blockEditorEngineSource).toContain("const countShrinkableRenderedTableAxisAtEnd = (tableElement: HTMLTableElement | null, axis: \"row\" | \"column\"): number => {")
    expect(blockEditorEngineSource).toContain("const shrinkTableAxisAtEnd = useCallback(")
    expect(blockEditorEngineSource).toContain("const beginTableAxisDragFromPending = useCallback(")
    expect(blockEditorEngineSource).toContain("const startPendingTableAxisDrag = useCallback(")
    expect(blockEditorEngineSource).toContain("const selectTableAxisAtIndex = useCallback(")
    expect(blockEditorEngineSource).toContain('overflowMode: getTableOverflowMode(tableNode)')
    expect(blockEditorEngineSource).toContain("const tableCornerGrowSuppressClickRef = useRef(false)")
    expect(blockEditorEngineSource).toContain('"grip" | "grow"')
    expect(blockEditorEngineSource).toContain('tableMenuState.kind === "cell"')
    expect(blockEditorEngineSource).toContain('tableMenuState.kind === "row" ?')
    expect(blockEditorEngineSource).toContain('tableMenuState.kind === "column" ?')
    expect(blockEditorEngineSource).toContain("activeTableStructureState.hasHeaderRow")
    expect(blockEditorEngineSource).toContain("activeTableStructureState.hasHeaderColumn")
    expect(blockEditorEngineSource).toContain("data-column-step={getTableCornerGrowStepMetrics().columnStepPx}")
    expect(blockEditorEngineSource).toContain("data-row-step={getTableCornerGrowStepMetrics().rowStepPx}")
    expect(blockEditorEngineSource).toContain(': "표 구조 메뉴"}')
    expect(blockEditorEngineSource).toContain("페이지 너비에 맞춤")
    expect(blockEditorEngineSource).toContain("넓은 표")
    expect(blockEditorEngineSource).toContain("제목 행")
    expect(blockEditorEngineSource).toContain("제목 열")
    expect(blockEditorEngineSource).toContain("type TableAffordanceGeometry = {")
    expect(blockEditorEngineSource).toContain("type TableAffordanceVisibility = {")
    expect(blockEditorEngineSource).toContain("extractTableAffordanceGeometry(tableQuickRailState)")
    expect(blockEditorEngineSource).toContain("extractTableAffordanceVisibility(tableQuickRailState)")
    expect(blockEditorEngineSource).toContain("const isTableStructureMenuOpen = Boolean(tableMenuState)")
    expect(blockEditorEngineSource).toContain(
      "const shouldShowColumnAddBar = tableAffordanceVisibility.showColumnAddBar || isTableStructureMenuOpen"
    )
    expect(blockEditorEngineSource).toContain(
      "const shouldShowRowAddBar = tableAffordanceVisibility.showRowAddBar || isTableStructureMenuOpen"
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
