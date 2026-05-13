import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { getServerSideProps as getEditPageServerSideProps } from "src/pages/editor/[id]"
import { getServerSideProps as getNewPageServerSideProps } from "src/pages/editor/new"
import {
  deriveEditorPersistenceState,
  isPublishActionDisabled,
} from "src/routes/Admin/editorStudioState"
import { resolveEditorMetaSnapshot, restoreEmptyFencedCodeBlocks } from "src/routes/Admin/editorStudioMetaModel"
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
    const dedicatedEditorSurfacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioDedicatedEditorSurface.tsx"
    )
    expect(existsSync(dedicatedEditorSurfacePath)).toBe(true)
    const dedicatedEditorSurfaceSource = existsSync(dedicatedEditorSurfacePath)
      ? readFileSync(dedicatedEditorSurfacePath, "utf8")
      : ""
    const editorStudioStateSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/editorStudioState.ts"), "utf8")
    const editorStudioMetaModelPath = path.resolve(__dirname, "../src/routes/Admin/editorStudioMetaModel.ts")
    expect(existsSync(editorStudioMetaModelPath)).toBe(true)
    const editorStudioMetaModelSource = existsSync(editorStudioMetaModelPath)
      ? readFileSync(editorStudioMetaModelPath, "utf8")
      : ""
    const editorStudioStorageModelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/editorStudioStorageModel.ts"
    )
    expect(existsSync(editorStudioStorageModelPath)).toBe(true)
    const editorStudioStorageModelSource = existsSync(editorStudioStorageModelPath)
      ? readFileSync(editorStudioStorageModelPath, "utf8")
      : ""
    const editorStudioThumbnailPreviewPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioThumbnailPreview.ts"
    )
    expect(existsSync(editorStudioThumbnailPreviewPath)).toBe(true)
    const editorStudioThumbnailPreviewSource = existsSync(editorStudioThumbnailPreviewPath)
      ? readFileSync(editorStudioThumbnailPreviewPath, "utf8")
      : ""
    const editorStudioThumbnailControlsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioThumbnailControls.ts"
    )
    expect(existsSync(editorStudioThumbnailControlsPath)).toBe(true)
    const editorStudioThumbnailControlsSource = existsSync(editorStudioThumbnailControlsPath)
      ? readFileSync(editorStudioThumbnailControlsPath, "utf8")
      : ""
    const editorStudioThumbnailPanelsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioThumbnailPanels.tsx"
    )
    expect(existsSync(editorStudioThumbnailPanelsPath)).toBe(true)
    const editorStudioThumbnailPanelsSource = existsSync(editorStudioThumbnailPanelsPath)
      ? readFileSync(editorStudioThumbnailPanelsPath, "utf8")
      : ""
    const editorStudioPublishModalPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioPublishModal.tsx"
    )
    expect(existsSync(editorStudioPublishModalPath)).toBe(true)
    const editorStudioPublishModalSource = existsSync(editorStudioPublishModalPath)
      ? readFileSync(editorStudioPublishModalPath, "utf8")
      : ""
    const editorStudioComposeAssistantPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioComposeAssistantPanel.tsx"
    )
    expect(existsSync(editorStudioComposeAssistantPanelPath)).toBe(true)
    const editorStudioComposeAssistantPanelSource = existsSync(editorStudioComposeAssistantPanelPath)
      ? readFileSync(editorStudioComposeAssistantPanelPath, "utf8")
      : ""
    const editorStudioMetadataAssistantPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioMetadataAssistantPanel.tsx"
    )
    expect(existsSync(editorStudioMetadataAssistantPanelPath)).toBe(true)
    const editorStudioMetadataAssistantPanelSource = existsSync(editorStudioMetadataAssistantPanelPath)
      ? readFileSync(editorStudioMetadataAssistantPanelPath, "utf8")
      : ""
    const editorStudioSelectedPostToolsPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioSelectedPostToolsPanel.tsx"
    )
    expect(existsSync(editorStudioSelectedPostToolsPanelPath)).toBe(true)
    const editorStudioSelectedPostToolsPanelSource = existsSync(editorStudioSelectedPostToolsPanelPath)
      ? readFileSync(editorStudioSelectedPostToolsPanelPath, "utf8")
      : ""
    const editorStudioSelectedPostPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioSelectedPostPanel.tsx"
    )
    expect(existsSync(editorStudioSelectedPostPanelPath)).toBe(true)
    const editorStudioSelectedPostPanelSource = existsSync(editorStudioSelectedPostPanelPath)
      ? readFileSync(editorStudioSelectedPostPanelPath, "utf8")
      : ""
    const editorStudioLegacyProfileSectionPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioLegacyProfileSection.tsx"
    )
    expect(existsSync(editorStudioLegacyProfileSectionPath)).toBe(true)
    const editorStudioLegacyProfileSectionSource = existsSync(editorStudioLegacyProfileSectionPath)
      ? readFileSync(editorStudioLegacyProfileSectionPath, "utf8")
      : ""
    const editorStudioLegacyUtilityPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioLegacyUtilityPanel.tsx"
    )
    expect(existsSync(editorStudioLegacyUtilityPanelPath)).toBe(true)
    const editorStudioLegacyUtilityPanelSource = existsSync(editorStudioLegacyUtilityPanelPath)
      ? readFileSync(editorStudioLegacyUtilityPanelPath, "utf8")
      : ""
    const editorStudioResultLogPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioResultLogPanel.tsx"
    )
    expect(existsSync(editorStudioResultLogPanelPath)).toBe(true)
    const editorStudioResultLogPanelSource = existsSync(editorStudioResultLogPanelPath)
      ? readFileSync(editorStudioResultLogPanelPath, "utf8")
      : ""
    const editorStudioPostQueryPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioPostQueryPanel.tsx"
    )
    expect(existsSync(editorStudioPostQueryPanelPath)).toBe(true)
    const editorStudioPostQueryPanelSource = existsSync(editorStudioPostQueryPanelPath)
      ? readFileSync(editorStudioPostQueryPanelPath, "utf8")
      : ""
    const editorStudioPostListPanelPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioPostListPanel.tsx"
    )
    expect(existsSync(editorStudioPostListPanelPath)).toBe(true)
    const editorStudioPostListPanelSource = existsSync(editorStudioPostListPanelPath)
      ? readFileSync(editorStudioPostListPanelPath, "utf8")
      : ""
    const editorStudioContentWorkspacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioContentWorkspace.tsx"
    )
    expect(existsSync(editorStudioContentWorkspacePath)).toBe(true)
    const editorStudioContentWorkspaceSource = existsSync(editorStudioContentWorkspacePath)
      ? readFileSync(editorStudioContentWorkspacePath, "utf8")
      : ""
    const editorStudioMobileStepNavigatorPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioMobileStepNavigator.tsx"
    )
    expect(existsSync(editorStudioMobileStepNavigatorPath)).toBe(true)
    const editorStudioMobileStepNavigatorSource = existsSync(editorStudioMobileStepNavigatorPath)
      ? readFileSync(editorStudioMobileStepNavigatorPath, "utf8")
      : ""
    const editorStudioUndoToastPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioUndoToast.tsx"
    )
    expect(existsSync(editorStudioUndoToastPath)).toBe(true)
    const editorStudioUndoToastSource = existsSync(editorStudioUndoToastPath)
      ? readFileSync(editorStudioUndoToastPath, "utf8")
      : ""
    const editorStudioDeleteConfirmDialogPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioDeleteConfirmDialog.tsx"
    )
    expect(existsSync(editorStudioDeleteConfirmDialogPath)).toBe(true)
    const editorStudioDeleteConfirmDialogSource = existsSync(editorStudioDeleteConfirmDialogPath)
      ? readFileSync(editorStudioDeleteConfirmDialogPath, "utf8")
      : ""
    const editorStudioComposeMobileChromePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioComposeMobileChrome.tsx"
    )
    expect(existsSync(editorStudioComposeMobileChromePath)).toBe(true)
    const editorStudioComposeMobileChromeSource = existsSync(editorStudioComposeMobileChromePath)
      ? readFileSync(editorStudioComposeMobileChromePath, "utf8")
      : ""
    const editorStudioComposeWritingSurfacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioComposeWritingSurface.tsx"
    )
    expect(existsSync(editorStudioComposeWritingSurfacePath)).toBe(true)
    const editorStudioComposeWritingSurfaceSource = existsSync(editorStudioComposeWritingSurfacePath)
      ? readFileSync(editorStudioComposeWritingSurfacePath, "utf8")
      : ""
    const editorStudioComposeWorkspacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioComposeWorkspace.tsx"
    )
    expect(existsSync(editorStudioComposeWorkspacePath)).toBe(true)
    const editorStudioComposeWorkspaceSource = existsSync(editorStudioComposeWorkspacePath)
      ? readFileSync(editorStudioComposeWorkspacePath, "utf8")
      : ""
    const blockEditorShellSource = readFileSync(path.resolve(__dirname, "../src/components/editor/BlockEditorShell.tsx"), "utf8")
    const blockEditorEngineSource = readFileSync(path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tsx"), "utf8")
    const blockSelectionModelSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/blockSelectionModel.ts"),
      "utf8"
    )
    const blockHandleLayoutModelPath = path.resolve(
      __dirname,
      "../src/components/editor/blockHandleLayoutModel.ts"
    )
    expect(existsSync(blockHandleLayoutModelPath)).toBe(true)
    const blockHandleLayoutModelSource = existsSync(blockHandleLayoutModelPath)
      ? readFileSync(blockHandleLayoutModelPath, "utf8")
      : ""
    const blockDragModelPath = path.resolve(__dirname, "../src/components/editor/blockDragModel.ts")
    expect(existsSync(blockDragModelPath)).toBe(true)
    const blockDragModelSource = existsSync(blockDragModelPath) ? readFileSync(blockDragModelPath, "utf8") : ""
    const tableAxisDragModelPath = path.resolve(__dirname, "../src/components/editor/tableAxisDragModel.ts")
    expect(existsSync(tableAxisDragModelPath)).toBe(true)
    const tableAxisDragModelSource = existsSync(tableAxisDragModelPath)
      ? readFileSync(tableAxisDragModelPath, "utf8")
      : ""
    const nestedListItemModelPath = path.resolve(
      __dirname,
      "../src/components/editor/nestedListItemModel.ts"
    )
    expect(existsSync(nestedListItemModelPath)).toBe(true)
    const nestedListItemModelSource = existsSync(nestedListItemModelPath)
      ? readFileSync(nestedListItemModelPath, "utf8")
      : ""
    const nestedListItemDragModelPath = path.resolve(
      __dirname,
      "../src/components/editor/nestedListItemDragModel.ts"
    )
    expect(existsSync(nestedListItemDragModelPath)).toBe(true)
    const nestedListItemDragModelSource = existsSync(nestedListItemDragModelPath)
      ? readFileSync(nestedListItemDragModelPath, "utf8")
      : ""
    const slashMenuModelPath = path.resolve(__dirname, "../src/components/editor/slashMenuModel.ts")
    expect(existsSync(slashMenuModelPath)).toBe(true)
    const slashMenuModelSource = existsSync(slashMenuModelPath) ? readFileSync(slashMenuModelPath, "utf8") : ""
    const inlineToolbarModelPath = path.resolve(__dirname, "../src/components/editor/inlineToolbarModel.ts")
    expect(existsSync(inlineToolbarModelPath)).toBe(true)
    const inlineToolbarModelSource = existsSync(inlineToolbarModelPath) ? readFileSync(inlineToolbarModelPath, "utf8") : ""
    const floatingBubbleStatePath = path.resolve(__dirname, "../src/components/editor/useFloatingBubbleState.ts")
    expect(existsSync(floatingBubbleStatePath)).toBe(true)
    const floatingBubbleStateSource = existsSync(floatingBubbleStatePath) ? readFileSync(floatingBubbleStatePath, "utf8") : ""
    const writerEditorHostSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/WriterEditorHost.tsx"), "utf8")

    expect(editorStudioSource).not.toContain("BLOCK_EDITOR_V2_ENABLED")
    expect(editorStudioSource).not.toContain("EditorStudioLegacyToolbar")
    expect(editorStudioSource).not.toContain("RawMarkdownTextarea")
    expect(editorStudioSource).toContain("const isCompactSplitPreview = false")
    expect(editorStudioSource).toContain("EditorStudioDedicatedEditorSurface")
    expect(editorStudioSource).not.toContain("const EditorStudioRoot")
    expect(dedicatedEditorSurfaceSource).toContain("width: min(100%, 1600px);")
    expect(dedicatedEditorSurfaceSource).toContain("grid-template-columns: minmax(0, 1fr);")
    expect(dedicatedEditorSurfaceSource).toContain('data-testid="editor-studio-frame"')
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
    expect(dedicatedEditorSurfaceSource).toContain("const EditorExitAction = styled.button`")
    expect(dedicatedEditorSurfaceSource).toContain("min-height: 42px;")
    expect(dedicatedEditorSurfaceSource).toContain("const EditorStudioFrame = styled.div`")
    expect(dedicatedEditorSurfaceSource).toContain("const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`")
    expect(editorStudioSource).not.toContain("type EditorMode =")
    expect(editorStudioSource).not.toContain("type PublishActionType =")
    expect(editorStudioSource).not.toContain("type PostVisibility =")
    expect(editorStudioSource).not.toContain("const visibilityLabel =")
    expect(editorStudioSource).not.toContain("const deferredContentMetrics = useMemo(() => {")
    expect(editorStudioSource).not.toContain("const publishActionTitle =")
    expect(editorStudioSource).not.toContain("const publishActionButtonText =")
    expect(editorStudioSource).not.toContain("const publishActionTriggerDisabled =")
    expect(editorStudioSource).not.toContain("const mobilePrimaryActionLabel =")
    expect(editorStudioSource).toContain('import { useEditorStudioThumbnailPreview } from "./useEditorStudioThumbnailPreview"')
    expect(editorStudioSource).toContain('import { useEditorStudioThumbnailControls } from "./useEditorStudioThumbnailControls"')
    expect(editorStudioSource).not.toContain("type ThumbnailSourceSize =")
    expect(editorStudioSource).not.toContain("type ThumbnailTransformState =")
    expect(editorStudioSource).not.toContain("const thumbnailImageFileInputRef = useRef<HTMLInputElement>")
    expect(editorStudioSource).not.toContain("const [thumbnailImageFileName, setThumbnailImageFileName] = useState")
    expect(editorStudioSource).not.toContain("const handleThumbnailUrlModalChange = useCallback")
    expect(editorStudioSource).not.toContain("const applyFirstBodyImageToThumbnail = useCallback")
    expect(editorStudioSource).not.toContain("const resetThumbnailToAutoMode = useCallback")
    expect(editorStudioSource).not.toContain("const openThumbnailFileInput = useCallback")
    expect(editorStudioSource).not.toContain("const DEFAULT_THUMBNAIL_SOURCE_SIZE")
    expect(editorStudioSource).not.toContain("const THUMBNAIL_FRAME_ASPECT_RATIO")
    expect(editorStudioSource).not.toContain("const resolveThumbnailDrawRatios =")
    expect(editorStudioSource).not.toContain("const readThumbnailSourceSizeFromUrl =")
    expect(editorStudioSource).not.toContain("const applyPreviewThumbStyle = useCallback")
    expect(editorStudioSource).not.toContain("const normalizePreviewThumbTransform = useCallback")
    expect(editorStudioSource).not.toContain("const computeAnchoredThumbnailTransform = useCallback")
    expect(editorStudioSource).not.toContain("const computeDraggedThumbnailTransform = useCallback")
    expect(editorStudioSource).not.toContain("const applyCommittedPreviewThumbTransform = useCallback")
    expect(editorStudioThumbnailPreviewSource).toContain("export type ThumbnailTransformState =")
    expect(editorStudioThumbnailPreviewSource).toContain("export const useEditorStudioThumbnailPreview")
    expect(editorStudioThumbnailPreviewSource).toContain("const resolveThumbnailDrawRatios =")
    expect(editorStudioThumbnailPreviewSource).toContain("const readThumbnailSourceSizeFromUrl =")
    expect(editorStudioThumbnailControlsSource).toContain("export type EditorStudioThumbnailControls =")
    expect(editorStudioThumbnailControlsSource).toContain("export const useEditorStudioThumbnailControls")
    expect(editorStudioThumbnailControlsSource).toContain("const handleThumbnailUrlModalChange = useCallback")
    expect(editorStudioThumbnailControlsSource).toContain("const applyFirstBodyImageToThumbnail = useCallback")
    expect(editorStudioThumbnailPanelsSource).toContain("export const EditorStudioThumbnailEditorPanel =")
    expect(editorStudioThumbnailPanelsSource).toContain("export const EditorStudioThumbnailMetaPanel =")
    expect(editorStudioSource).toContain('} from "./EditorStudioThumbnailPanels"')
    expect(editorStudioSource).not.toContain("const thumbnailEditorPanel = useMemo")
    expect(editorStudioSource).not.toContain("const previewMetaEditorPanel = useMemo")
    expect(editorStudioPublishModalSource).toContain("export const EditorStudioPublishModal =")
    expect(editorStudioSource).toContain('import { EditorStudioPublishModal } from "./EditorStudioPublishModal"')
    expect(editorStudioSource.match(/<EditorStudioPublishModal/g)?.length).toBe(2)
    expect(editorStudioSource).not.toContain("<PublishModal")
    expect(editorStudioSource).not.toContain("const PublishModal = styled.div`")
    expect(editorStudioSource).not.toContain("const PublishOverviewGrid = styled.div`")
    expect(editorStudioComposeAssistantPanelSource).toContain("export const EditorStudioComposeAssistantPanel =")
    expect(editorStudioComposeWorkspaceSource).toContain(
      'import { EditorStudioComposeAssistantPanel } from "./EditorStudioComposeAssistantPanel"'
    )
    expect(editorStudioComposeWorkspaceSource.match(/<EditorStudioComposeAssistantPanel/g)?.length).toBe(1)
    expect(editorStudioComposeAssistantPanelSource).toContain("const ComposeAssistantPanel = styled.div`")
    expect(editorStudioComposeAssistantPanelSource).toContain("const PreviewResultCard = styled.article`")
    expect(editorStudioSource).not.toContain("const ComposeAssistantPanel = styled.div`")
    expect(editorStudioSource).not.toContain("const PreviewResultCard = styled.article`")
    expect(editorStudioSource).not.toContain("const PublishSettingsSummary = styled.div`")
    expect(editorStudioMetadataAssistantPanelSource).toContain("export const EditorStudioMetadataAssistantPanel =")
    expect(editorStudioComposeWorkspaceSource).toContain(
      'import { EditorStudioMetadataAssistantPanel } from "./EditorStudioMetadataAssistantPanel"'
    )
    expect(editorStudioComposeWorkspaceSource.match(/<EditorStudioMetadataAssistantPanel/g)?.length).toBe(1)
    expect(editorStudioMetadataAssistantPanelSource).toContain("<strong>태그 정리</strong>")
    expect(editorStudioMetadataAssistantPanelSource).toContain("<strong>보조 작업</strong>")
    expect(editorStudioSource).not.toContain("<strong>태그 정리</strong>")
    expect(editorStudioSource).not.toContain("<strong>보조 작업</strong>")
    expect(editorStudioContentWorkspaceSource).toContain("export const EditorStudioContentWorkspace =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioContentWorkspace } from "./EditorStudioContentWorkspace"'
    )
    expect(editorStudioSource.match(/<EditorStudioContentWorkspace/g)?.length).toBe(1)
    expect(editorStudioSelectedPostToolsPanelSource).toContain("export const EditorStudioSelectedPostToolsPanel =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioSelectedPostToolsPanel } from "./EditorStudioSelectedPostToolsPanel"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioSelectedPostToolsPanel/g)?.length).toBe(1)
    expect(editorStudioSelectedPostToolsPanelSource).toContain("다른 글 직접 불러오기")
    expect(editorStudioSelectedPostToolsPanelSource).toContain("post id 직접 불러오기")
    expect(editorStudioSelectedPostToolsPanelSource).toContain("<strong>{directLoadTitle}</strong>")
    expect(editorStudioSelectedPostToolsPanelSource).toContain("<strong>진단 도구</strong>")
    expect(editorStudioSource).not.toContain("<strong>다른 글 직접 불러오기</strong>")
    expect(editorStudioSource).not.toContain("<strong>post id 직접 불러오기</strong>")
    expect(editorStudioSource).not.toContain("<strong>진단 도구</strong>")
    expect(editorStudioSource).toContain("const handleSelectedPostIdChange = useCallback")
    expect(editorStudioSource).toContain("onPostIdChange={handleSelectedPostIdChange}")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain("apiFetch(")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain("setPostId")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain("setEditorMode")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain("setPostVersion")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain("setIsTempDraftMode")
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain('run("hitPost"')
    expect(editorStudioSelectedPostToolsPanelSource).not.toContain('run("likePost"')
    expect(editorStudioSelectedPostPanelSource).toContain("export const EditorStudioSelectedPostPanel =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioSelectedPostPanel } from "./EditorStudioSelectedPostPanel"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioSelectedPostPanel/g)?.length).toBe(1)
    expect(editorStudioSelectedPostPanelSource).toContain("선택한 글")
    expect(editorStudioSelectedPostPanelSource).toContain("빠른 작업")
    expect(editorStudioSelectedPostPanelSource).toContain("편집 계속")
    expect(editorStudioSelectedPostPanelSource).toContain("새 글 작성")
    expect(editorStudioSelectedPostPanelSource).toContain("글 삭제")
    expect(editorStudioSource).not.toContain("<SelectedPostHeader>")
    expect(editorStudioSource).not.toContain("<SelectedPostStateCard")
    expect(editorStudioSource).not.toContain("const SelectedPostPanel = styled.div`")
    expect(editorStudioSource).not.toContain("const SelectedPostHeader = styled.div`")
    expect(editorStudioSource).not.toContain("const SelectedPostStateCard = styled.div`")
    expect(editorStudioSource).toContain("const handleContinueSelectedPostEditing = useCallback")
    expect(editorStudioSource).toContain("onContinueEditing={handleContinueSelectedPostEditing}")
    expect(editorStudioSource).toContain("onCreateNewPost={handleCreateNewPostFromSelectedPanel}")
    expect(editorStudioSource).toContain("onDeletePost={handleDeleteSelectedPost}")
    expect(editorStudioSelectedPostPanelSource).not.toContain("openPublishModal")
    expect(editorStudioSelectedPostPanelSource).not.toContain("switchToCreateMode")
    expect(editorStudioSelectedPostPanelSource).not.toContain("openDeleteConfirm")
    expect(editorStudioSelectedPostPanelSource).not.toContain("apiFetch(")
    expect(editorStudioSelectedPostPanelSource).not.toContain("run(")
    expect(editorStudioLegacyProfileSectionSource).toContain("export const EditorStudioLegacyProfileSection =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioLegacyProfileSection } from "./EditorStudioLegacyProfileSection"'
    )
    expect(editorStudioSource.match(/<EditorStudioLegacyProfileSection/g)?.length).toBe(1)
    expect(editorStudioLegacyProfileSectionSource).toContain("Profile Studio")
    expect(editorStudioLegacyProfileSectionSource).toContain("프로필 이미지 선택")
    expect(editorStudioLegacyProfileSectionSource).toContain("역할/소개 저장")
    expect(editorStudioSource).not.toContain("<ProfileStudioGrid>")
    expect(editorStudioSource).not.toContain("const ProfileStudioGrid = styled.div`")
    expect(editorStudioSource).not.toContain("const ProfileCardPanel = styled.div`")
    expect(editorStudioSource).not.toContain("const ProfileCurrentGrid = styled.div`")
    expect(editorStudioLegacyProfileSectionSource).not.toContain("apiFetch(")
    expect(editorStudioLegacyProfileSectionSource).not.toContain("run(")
    expect(editorStudioLegacyProfileSectionSource).not.toContain("setProfileRoleInput")
    expect(editorStudioLegacyProfileSectionSource).not.toContain("setProfileBioInput")
    expect(editorStudioLegacyUtilityPanelSource).toContain("export const EditorStudioLegacyUtilityPanel =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioLegacyUtilityPanel } from "./EditorStudioLegacyUtilityPanel"'
    )
    expect(editorStudioSource.match(/<EditorStudioLegacyUtilityPanel/g)?.length).toBe(1)
    expect(editorStudioLegacyUtilityPanelSource).toContain("댓글 테스트 도구")
    expect(editorStudioLegacyUtilityPanelSource).toContain("운영 점검 도구")
    expect(editorStudioSource).not.toContain("<UtilityGrid>")
    expect(editorStudioSource).not.toContain("const UtilityGrid = styled.div`")
    expect(editorStudioLegacyUtilityPanelSource).not.toContain("apiFetch(")
    expect(editorStudioLegacyUtilityPanelSource).not.toContain("run(")
    expect(editorStudioLegacyUtilityPanelSource).not.toContain("setPostId")
    expect(editorStudioLegacyUtilityPanelSource).not.toContain("setCommentId")
    expect(editorStudioLegacyUtilityPanelSource).not.toContain("setCommentContent")
    expect(editorStudioResultLogPanelSource).toContain("export const EditorStudioResultLogPanel =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioResultLogPanel } from "./EditorStudioResultLogPanel"'
    )
    expect(editorStudioSource.match(/<EditorStudioResultLogPanel/g)?.length).toBe(2)
    expect(editorStudioSource).not.toContain("const ResultPanel = styled.pre`")
    expect(editorStudioSource).not.toContain("const DevConsoleSection = styled.section`")
    expect(editorStudioSource).not.toContain("const EditorStudioResultPanel = styled.section`")
    expect(editorStudioPostQueryPanelSource).toContain("export const EditorStudioPostQueryPanel =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioPostQueryPanel } from "./EditorStudioPostQueryPanel"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioPostQueryPanel/g)?.length).toBe(1)
    expect(editorStudioPostQueryPanelSource).toContain("글 목록 조회 조건")
    expect(editorStudioPostQueryPanelSource).toContain("고급 조회 옵션")
    expect(editorStudioSource).not.toContain("<QueryPanel")
    expect(editorStudioSource).not.toContain("const QueryPanel = styled.div`")
    expect(editorStudioPostQueryPanelSource).not.toContain("apiFetch(")
    expect(editorStudioPostQueryPanelSource).not.toContain("run(")
    expect(editorStudioPostQueryPanelSource).not.toContain("setListScope")
    expect(editorStudioPostQueryPanelSource).not.toContain("setListKw")
    expect(editorStudioPostQueryPanelSource).not.toContain("setListPage")
    expect(editorStudioPostQueryPanelSource).not.toContain("setListPageSize")
    expect(editorStudioPostQueryPanelSource).not.toContain("setListSort")
    expect(editorStudioPostListPanelSource).toContain("export const EditorStudioPostListPanel =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioPostListPanel } from "./EditorStudioPostListPanel"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioPostListPanel/g)?.length).toBe(1)
    expect(editorStudioPostListPanelSource).toContain("관리자 글 리스트")
    expect(editorStudioPostListPanelSource).toContain("삭제 글 리스트")
    expect(editorStudioPostListPanelSource).toContain("현재 목록 전체 선택")
    expect(editorStudioSource).not.toContain("<ListPanel")
    expect(editorStudioSource).not.toContain("const ListPanel = styled.div`")
    expect(editorStudioSource).not.toContain("const ListTable = styled.table`")
    expect(editorStudioSource).not.toContain("const MobileListCards = styled.div`")
    expect(editorStudioPostListPanelSource).not.toContain("apiFetch(")
    expect(editorStudioPostListPanelSource).not.toContain("run(")
    expect(editorStudioPostListPanelSource).not.toContain("loadPostForEditor")
    expect(editorStudioPostListPanelSource).not.toContain("restoreDeletedPostFromList")
    expect(editorStudioPostListPanelSource).not.toContain("hardDeleteDeletedPostFromList")
    expect(editorStudioPostListPanelSource).not.toContain("openDeleteConfirm")
    expect(editorStudioPostListPanelSource).not.toContain("setPostId")
    expect(editorStudioMobileStepNavigatorSource).toContain("export const EditorStudioMobileStepNavigator =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioMobileStepNavigator } from "./EditorStudioMobileStepNavigator"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioMobileStepNavigator/g)?.length).toBe(1)
    expect(editorStudioMobileStepNavigatorSource).toContain("모바일 작업 단계")
    expect(editorStudioMobileStepNavigatorSource).toContain("현재 단계:")
    expect(editorStudioSource).not.toContain("<MobileStudioStepper")
    expect(editorStudioSource).not.toContain("<MobileStepGuide")
    expect(editorStudioSource).not.toContain("const MobileStudioStepper = styled.div`")
    expect(editorStudioSource).not.toContain("const MobileStepGuide = styled.section`")
    expect(editorStudioMobileStepNavigatorSource).not.toContain("apiFetch(")
    expect(editorStudioMobileStepNavigatorSource).not.toContain("run(")
    expect(editorStudioMobileStepNavigatorSource).not.toContain("setActiveMobileStudioStep")
    expect(editorStudioUndoToastSource).toContain("export const EditorStudioUndoToast =")
    expect(editorStudioContentWorkspaceSource).toContain(
      'import { EditorStudioUndoToast } from "./EditorStudioUndoToast"'
    )
    expect(editorStudioContentWorkspaceSource.match(/<EditorStudioUndoToast/g)?.length).toBe(1)
    expect(editorStudioUndoToastSource).toContain("실행 취소")
    expect(editorStudioSource).not.toContain("<UndoToast")
    expect(editorStudioSource).not.toContain("const UndoToast = styled.div`")
    expect(editorStudioUndoToastSource).not.toContain("apiFetch(")
    expect(editorStudioUndoToastSource).not.toContain("run(")
    expect(editorStudioUndoToastSource).not.toContain("handleUndoSoftDelete")
    expect(editorStudioSource).not.toContain("<ContentStudioGrid")
    expect(editorStudioSource).not.toContain("<ContentStudioLeft")
    expect(editorStudioSource).not.toContain("const ContentStudioGrid = styled.div`")
    expect(editorStudioSource).not.toContain("const ContentStudioLeft = styled.div`")
    expect(editorStudioSource).not.toContain("const GlobalNoticeBar = styled.div`")
    expect(editorStudioContentWorkspaceSource).toContain("const ContentStudioGrid = styled.div`")
    expect(editorStudioContentWorkspaceSource).toContain("const ContentStudioLeft = styled.div`")
    expect(editorStudioContentWorkspaceSource).toContain("const GlobalNoticeBar = styled.div`")
    expect(editorStudioContentWorkspaceSource).not.toContain("apiFetch(")
    expect(editorStudioContentWorkspaceSource).not.toContain("run(")
    expect(editorStudioContentWorkspaceSource).not.toContain("loadPostForEditor")
    expect(editorStudioContentWorkspaceSource).not.toContain("openDeleteConfirm")
    expect(editorStudioContentWorkspaceSource).not.toContain("setListScope")
    expect(editorStudioContentWorkspaceSource).not.toContain("setSelectedPostIds")
    expect(editorStudioDeleteConfirmDialogSource).toContain("export const EditorStudioDeleteConfirmDialog =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioDeleteConfirmDialog } from "./EditorStudioDeleteConfirmDialog"'
    )
    expect(editorStudioSource.match(/<EditorStudioDeleteConfirmDialog/g)?.length).toBe(1)
    expect(editorStudioDeleteConfirmDialogSource).toContain("글을 삭제할까요?")
    expect(editorStudioDeleteConfirmDialogSource).toContain("삭제 후에는 삭제 글 목록에서 복구할 수 있습니다.")
    expect(editorStudioSource).not.toContain("<ModalBackdrop")
    expect(editorStudioSource).not.toContain("<ConfirmModal")
    expect(editorStudioSource).not.toContain("const ModalBackdrop = styled.div`")
    expect(editorStudioSource).not.toContain("const ConfirmModal = styled.div`")
    expect(editorStudioDeleteConfirmDialogSource).not.toContain("apiFetch(")
    expect(editorStudioDeleteConfirmDialogSource).not.toContain("run(")
    expect(editorStudioDeleteConfirmDialogSource).not.toContain("deletePostsFromList")
    expect(editorStudioDeleteConfirmDialogSource).not.toContain("setDeleteConfirmState")
    expect(editorStudioComposeMobileChromeSource).toContain("export const EditorStudioComposeMobileChrome =")
    expect(editorStudioComposeMobileChromeSource).toContain("const MobileComposeStatusBar = styled.div`")
    expect(editorStudioComposeMobileChromeSource).toContain("const MobilePrimaryActionBar = styled.div`")
    expect(editorStudioSource).not.toContain("<MobileComposeStatusBar")
    expect(editorStudioSource).not.toContain("<MobilePrimaryActionBar")
    expect(editorStudioSource).not.toContain("const MobileComposeStatusBar = styled.div`")
    expect(editorStudioSource).not.toContain("const MobilePrimaryActionBar = styled.div`")
    expect(editorStudioComposeMobileChromeSource).not.toContain("apiFetch(")
    expect(editorStudioComposeMobileChromeSource).not.toContain("run(")
    expect(editorStudioComposeMobileChromeSource).not.toContain("openPublishModal")
    expect(editorStudioComposeMobileChromeSource).not.toContain("setMobileComposeStep")
    expect(editorStudioComposeMobileChromeSource).not.toContain("setPostVisibility")
    expect(editorStudioComposeWritingSurfaceSource).toContain("export const EditorStudioComposeWritingSurface =")
    expect(editorStudioComposeWorkspaceSource).toContain("export const EditorStudioComposeWorkspace =")
    expect(editorStudioSource).toContain(
      'import { EditorStudioComposeWorkspace } from "./EditorStudioComposeWorkspace"'
    )
    expect(editorStudioSource.match(/<EditorStudioComposeWorkspace/g)?.length).toBe(1)
    expect(editorStudioSource).toContain("composeCallToActionLabel={composeCallToActionLabel}")
    expect(editorStudioSource).not.toContain(
      'import { EditorStudioComposeMobileChrome } from "./EditorStudioComposeMobileChrome"'
    )
    expect(editorStudioSource).not.toContain(
      'import { EditorStudioComposeWritingSurface } from "./EditorStudioComposeWritingSurface"'
    )
    expect(editorStudioSource).not.toContain(
      'import { EditorStudioComposeAssistantPanel } from "./EditorStudioComposeAssistantPanel"'
    )
    expect(editorStudioSource).not.toContain(
      'import { EditorStudioMetadataAssistantPanel } from "./EditorStudioMetadataAssistantPanel"'
    )
    expect(editorStudioSource).not.toContain("<EditorStudioComposeMobileChrome")
    expect(editorStudioSource).not.toContain("<EditorStudioComposeWritingSurface")
    expect(editorStudioSource).not.toContain("<EditorStudioComposeAssistantPanel")
    expect(editorStudioSource).not.toContain("<EditorStudioMetadataAssistantPanel")
    expect(editorStudioComposeWorkspaceSource).toContain(
      'import { EditorStudioComposeAssistantPanel } from "./EditorStudioComposeAssistantPanel"'
    )
    expect(editorStudioComposeWorkspaceSource).toContain("EditorStudioComposeMobileChrome")
    expect(editorStudioComposeWorkspaceSource).toContain("EditorStudioComposeWritingSurface")
    expect(editorStudioComposeWorkspaceSource).toContain("EditorStudioMetadataAssistantPanel")
    expect(editorStudioComposeWorkspaceSource).toContain("primaryActionLabel={composeCallToActionLabel}")
    expect(editorStudioComposeWorkspaceSource).toContain("{composeCallToActionLabel}")
    expect(editorStudioComposeWorkspaceSource).toContain("const ComposeSurfaceSection = styled.section`")
    expect(editorStudioComposeWorkspaceSource).toContain("const ComposeStudioLayout = styled.div`")
    expect(editorStudioComposeWorkspaceSource).toContain("const SubActionRow = styled.div`")
    expect(editorStudioComposeWorkspaceSource).toContain("const PrimaryButton = styled(Button)`")
    expect(editorStudioComposeWorkspaceSource).not.toContain("data-mobile-visible={!isCompactMobileLayout}")
    expect(editorStudioComposeWorkspaceSource).not.toContain('[data-mobile-visible="false"]')
    expect(editorStudioComposeWritingSurfaceSource).toContain("const ComposeMainColumn = styled.div`")
    expect(editorStudioComposeWritingSurfaceSource).toContain("const TitleInput = styled.textarea`")
    expect(editorStudioComposeWritingSurfaceSource).toContain("const WriterFooterBar = styled.div`")
    expect(editorStudioSource).not.toContain("const ComposeSurfaceSection = styled")
    expect(editorStudioSource).not.toContain("const ComposeStudioLayout = styled.div`")
    expect(editorStudioSource).not.toContain("const SubActionRow = styled.div`")
    expect(editorStudioSource).not.toContain("const PrimaryButton = styled(Button)`")
    expect(editorStudioSource).not.toContain("const ComposeMainColumn = styled.div`")
    expect(editorStudioSource).not.toContain("const TitleInput = styled.textarea")
    expect(editorStudioSource).not.toContain("const WriterFooterBar = styled.div`")
    expect(editorStudioComposeWorkspaceSource).not.toContain("apiFetch(")
    expect(editorStudioComposeWorkspaceSource).not.toContain("run(")
    expect(editorStudioComposeWorkspaceSource).not.toContain("openPublishModal")
    expect(editorStudioComposeWorkspaceSource).not.toContain("WriterEditorHost")
    expect(editorStudioComposeWorkspaceSource).not.toContain("setPost")
    expect(editorStudioComposeWritingSurfaceSource).not.toContain("apiFetch(")
    expect(editorStudioComposeWritingSurfaceSource).not.toContain("run(")
    expect(editorStudioComposeWritingSurfaceSource).not.toContain("openPublishModal")
    expect(editorStudioComposeWritingSurfaceSource).not.toContain("WriterEditorHost")
    expect(editorStudioComposeWritingSurfaceSource).not.toContain("setPost")
    expect(editorStudioStateSource).toContain("export type PostVisibility =")
    expect(editorStudioStateSource).toContain("export const toVisibility")
    expect(editorStudioStateSource).toContain("export const toFlags")
    expect(editorStudioStateSource).toContain("export const getVisibilityLabel")
    expect(editorStudioStateSource).toContain("export const deriveEditorContentMetrics")
    expect(editorStudioStateSource).toContain("export const deriveComposeViewModel")
    expect(editorStudioStateSource).toContain("export const derivePublishActionViewModel")
    expect(editorStudioMetaModelSource).toContain("export type ParsedEditorMeta =")
    expect(editorStudioMetaModelSource).toContain("export type ResolvedEditorMetaSnapshot =")
    expect(editorStudioMetaModelSource).toContain("export type LocalDraftPayload =")
    expect(editorStudioMetaModelSource).toContain("export const PREVIEW_SUMMARY_MAX_LENGTH = 150")
    expect(editorStudioMetaModelSource).toContain("export const PREVIEW_SUMMARY_MAX_CONTENT_LENGTH = 50_000")
    expect(editorStudioMetaModelSource).toContain("export const dedupeStrings =")
    expect(editorStudioMetaModelSource).toContain("export const extractFirstMarkdownImage =")
    expect(editorStudioMetaModelSource).toContain("export const computeContentFingerprint =")
    expect(editorStudioMetaModelSource).toContain("export const normalizeSafeImageUrl =")
    expect(editorStudioMetaModelSource).toContain("export const normalizeSafePreviewThumbnailUrl =")
    expect(editorStudioMetaModelSource).toContain("export const makePreviewSummary =")
    expect(editorStudioMetaModelSource).toContain("export const normalizeRecommendedTags =")
    expect(editorStudioMetaModelSource).toContain("export const resolveTagRecommendationErrorMessage =")
    expect(editorStudioMetaModelSource).toContain("export const formatTagRecommendationReason =")
    expect(editorStudioMetaModelSource).toContain("export const restoreEmptyFencedCodeBlocks =")
    expect(editorStudioMetaModelSource).toContain("const extractRawCodeFencedBlocksFromHtml =")
    expect(editorStudioMetaModelSource).toContain("restoreEmptyFencedCodeBlocks(parsed.body, recoveredCodeMarkdown)")
    expect(editorStudioMetaModelSource).toContain("export const resolveEditorMetaSnapshot =")
    expect(editorStudioMetaModelSource).toContain("export const buildEditorStateFingerprint =")
    expect(editorStudioMetaModelSource).toContain("export const parseEditorMeta =")
    expect(editorStudioMetaModelSource).toContain("export const composeEditorContent =")
    expect(editorStudioMetaModelSource).toContain("export const buildLocalDraftFingerprint =")
    expect(editorStudioMetaModelSource).toContain("export const detectPublishPlaceholderIssue =")
    expect(editorStudioSource).toContain('} from "./editorStudioMetaModel"')
    expect(editorStudioStorageModelSource).toContain("export const TAG_CATALOG_STORAGE_KEY =")
    expect(editorStudioStorageModelSource).toContain("export const CATEGORY_CATALOG_STORAGE_KEY =")
    expect(editorStudioStorageModelSource).toContain("export const readStoredCatalog =")
    expect(editorStudioStorageModelSource).toContain("export const persistCatalog =")
    expect(editorStudioStorageModelSource).toContain("export const readLocalDraft =")
    expect(editorStudioStorageModelSource).toContain("export const persistLocalDraft =")
    expect(editorStudioStorageModelSource).toContain("export const removeLocalDraft =")
    expect(editorStudioSource).toContain('} from "./editorStudioStorageModel"')
    expect(editorStudioSource).not.toContain("const normalizeMetaItems =")
    expect(editorStudioSource).not.toContain("const extractFirstMarkdownImage =")
    expect(editorStudioSource).not.toContain("const computeContentFingerprint =")
    expect(editorStudioSource).not.toContain("const normalizeSafeImageUrl =")
    expect(editorStudioSource).not.toContain("const normalizeSafePreviewThumbnailUrl =")
    expect(editorStudioSource).not.toContain("const makePreviewSummary =")
    expect(editorStudioSource).not.toContain("const normalizeRecommendedTags =")
    expect(editorStudioSource).not.toContain("const formatTagRecommendationReason =")
    expect(editorStudioSource).not.toContain("const splitFrontmatterBlock =")
    expect(editorStudioSource).not.toContain("const resolveEditorMetaSnapshot =")
    expect(editorStudioSource).not.toContain("const buildEditorStateFingerprint =")
    expect(editorStudioSource).not.toContain("const parseEditorMeta =")
    expect(editorStudioSource).not.toContain("const composeEditorContent =")
    expect(editorStudioSource).not.toContain("const buildLocalDraftFingerprint =")
    expect(editorStudioSource).not.toContain("const detectPublishPlaceholderIssue =")
    expect(editorStudioSource).not.toContain("const TAG_CATALOG_STORAGE_KEY =")
    expect(editorStudioSource).not.toContain("const CATEGORY_CATALOG_STORAGE_KEY =")
    expect(editorStudioSource).not.toContain("const LOCAL_DRAFT_STORAGE_KEY =")
    expect(editorStudioSource).not.toContain("const readStoredCatalog =")
    expect(editorStudioSource).not.toContain("const persistCatalog =")
    expect(editorStudioSource).not.toContain("const readLocalDraft =")
    expect(editorStudioSource).not.toContain("const persistLocalDraft =")
    expect(editorStudioSource).not.toContain("const removeLocalDraft =")
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
    expect(blockEditorEngineSource).toContain('from "./nestedListItemModel"')
    expect(blockEditorEngineSource).toContain('from "./useBlockEditorMarkdownCommit"')
    expect(blockEditorEngineSource).toContain('from "./slashMenuModel"')
    expect(blockEditorEngineSource).toContain('from "./inlineToolbarModel"')
    expect(blockEditorEngineSource).toContain('from "./useFloatingBubbleState"')
    expect(blockEditorEngineSource).not.toContain("type FloatingBubbleState =")
    expect(blockEditorEngineSource).not.toContain("const bubbleHideTimerRef")
    expect(blockEditorEngineSource).not.toContain("const bubbleToolbarHoveredRef = useRef")
    expect(blockEditorEngineSource).not.toContain("const cancelBubbleHide = useCallback")
    expect(blockEditorEngineSource).not.toContain("const scheduleBubbleHide = useCallback")
    expect(blockEditorEngineSource).not.toContain("const nextBubbleState: FloatingBubbleState =")
    expect(blockEditorEngineSource).not.toContain("type InlineTextStyleOption =")
    expect(blockEditorEngineSource).not.toContain("const INLINE_TEXT_STYLE_OPTIONS")
    expect(blockEditorEngineSource).not.toContain("normalizeInlineColorToken")
    expect(blockEditorEngineSource).not.toContain("const normalizeSlashSearchText =")
    expect(blockEditorEngineSource).not.toContain("const compactSlashSearchText =")
    expect(blockEditorEngineSource).not.toContain("const getSlashSearchTerms =")
    expect(blockEditorEngineSource).not.toContain("const getSlashActionGlyph =")
    expect(blockEditorEngineSource).not.toContain("const getSlashMenuContextBonus =")
    expect(blockEditorEngineSource).not.toContain("const getSlashMenuMatchScore =")
    expect(blockEditorEngineSource).not.toContain("type SlashMenuContext =")
    expect(slashMenuModelSource).toContain("export type SlashMenuContext =")
    expect(slashMenuModelSource).toContain("export const normalizeSlashSearchText =")
    expect(slashMenuModelSource).toContain("export const getRankedSlashItems =")
    expect(slashMenuModelSource).toContain("export const buildSlashMenuSections =")
    expect(slashMenuModelSource).toContain("export const getSlashActionGlyph =")
    expect(inlineToolbarModelSource).toContain("export type InlineTextStyleOption =")
    expect(inlineToolbarModelSource).toContain("export const INLINE_TEXT_STYLE_OPTIONS")
    expect(inlineToolbarModelSource).toContain("export const getActiveInlineColor")
    expect(inlineToolbarModelSource).toContain("export const getActiveInlineTextStyleOption")
    expect(inlineToolbarModelSource).toContain("export const runInlineTextStyle")
    expect(floatingBubbleStateSource).toContain("export type FloatingBubbleState =")
    expect(floatingBubbleStateSource).toContain("export const resolveFloatingBubbleStateFromCoords")
    expect(floatingBubbleStateSource).toContain("export const areFloatingBubbleStatesEqual")
    expect(floatingBubbleStateSource).toContain("export const useFloatingBubbleState")
    expect(blockEditorEngineSource).not.toContain("const normalizeMarkdown =")
    expect(blockEditorEngineSource).not.toContain("markdownCommitTimerRef")
    expect(blockEditorEngineSource).not.toContain("markdownCommitIdleHandleRef")
    expect(blockEditorEngineSource).not.toContain("markdownCommitMaxWaitTimerRef")
    expect(blockEditorEngineSource).not.toContain("pendingCommitEditorRef")
    expect(blockEditorEngineSource).not.toContain("lastCommittedMarkdownRef")
    expect(blockEditorEngineSource).not.toMatch(/const\s+isStableBlockHandleState\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+isStableBlockSelectionOverlayState\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+resolveOuterBlockSelectionGesture\s*=/)
    expect(blockEditorEngineSource).toContain('from "./blockHandleLayoutModel"')
    expect(blockEditorEngineSource).toContain('from "./blockDragModel"')
    expect(blockEditorEngineSource).toContain('from "./tableAxisDragModel"')
    expect(blockEditorEngineSource).not.toMatch(/const\s+resolveBlockHandleAnchorTop\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+resolveThinBlockHandleAnchorTop\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+resolveBlockHandleRailLayout\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+shouldCenterBlockHandleForNode\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+shouldUseThinBlockHandleAnchor\s*=/)
    expect(blockEditorEngineSource).not.toContain("type PendingBlockDragState =")
    expect(blockEditorEngineSource).not.toContain("type DraggedBlockState =")
    expect(blockEditorEngineSource).not.toContain("type DropIndicatorState =")
    expect(blockEditorEngineSource).not.toContain("const resolveDropIndicatorByClientY = useCallback(")
    expect(blockEditorEngineSource).not.toContain("sourceElement?.textContent?.trim().slice(0, 100)")
    expect(blockEditorEngineSource).not.toContain("sourceElement?.textContent?.trim().replace(/\\s+/g, \" \").slice(0, 220)")
    expect(blockEditorEngineSource).not.toContain("type PendingTableAxisDragState =")
    expect(blockEditorEngineSource).not.toContain("type DraggedTableAxisState =")
    expect(blockEditorEngineSource).not.toContain("type TableAxisReorderIndicatorState =")
    expect(blockEditorEngineSource).not.toContain("const resolveTableAxisReorderIndicator = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const resolveTableAxisIndexFromPointer = useCallback(")
    expect(blockEditorEngineSource).not.toContain("type NestedListItemContext =")
    expect(blockEditorEngineSource).not.toMatch(/const\s+LIST_ITEM_SELECTOR\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+LIST_CONTAINER_SELECTOR\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+sameListPath\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+selectNestedListItemNode\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+selectNestedListItemTextAnchor\s*=/)
    expect(blockEditorEngineSource).not.toContain("const listItemElement = target.closest(LIST_ITEM_SELECTOR)")
    expect(blockEditorEngineSource).not.toContain("currentListElement.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)")
    expect(blockEditorEngineSource).not.toContain("taskListElement.querySelectorAll(`:scope > ${LIST_ITEM_SELECTOR}`)")
    expect(blockEditorEngineSource).not.toContain("const taskItems = Array.from(")
    expect(blockEditorEngineSource).not.toContain("type PendingNestedListItemHandleDragState =")
    expect(blockEditorEngineSource).not.toContain("type DraggedNestedListItemState =")
    expect(blockEditorEngineSource).not.toContain("type NestedListItemDropIndicatorState =")
    expect(blockEditorEngineSource).not.toContain("sourceElement.textContent?.trim().slice(0, 100)")
    expect(blockEditorEngineSource).not.toContain("sourceElement.textContent?.trim().replace(/\\s+/g, \" \").slice(0, 220)")
    expect(blockSelectionModelSource).toContain("export const resolveOuterBlockSelectionGesture")
    expect(blockSelectionModelSource).toContain("export const resolveOuterListItemSelectionGesture")
    expect(blockHandleLayoutModelSource).toContain("export const resolveBlockHandleAnchorTop")
    expect(blockHandleLayoutModelSource).toContain("export const resolveThinBlockHandleAnchorTop")
    expect(blockHandleLayoutModelSource).toContain("export const resolveBlockHandleRailLayout")
    expect(blockHandleLayoutModelSource).toContain("export const shouldCenterBlockHandleForNode")
    expect(blockHandleLayoutModelSource).toContain("export const shouldUseThinBlockHandleAnchor")
    expect(blockDragModelSource).toContain("export type PendingBlockDragState")
    expect(blockDragModelSource).toContain("export type DraggedBlockState")
    expect(blockDragModelSource).toContain("export type DropIndicatorState")
    expect(blockDragModelSource).toContain("export const createHiddenDropIndicatorState")
    expect(blockDragModelSource).toContain("export const createBlockDragPreview")
    expect(blockDragModelSource).toContain("export const createPendingBlockDragState")
    expect(blockDragModelSource).toContain("export const createDraggedBlockState")
    expect(blockDragModelSource).toContain("export const createDropIndicatorState")
    expect(blockDragModelSource).toContain("export const hideDropIndicatorState")
    expect(blockDragModelSource).toContain("export const resolveBlockDropIndicatorByClientY")
    expect(tableAxisDragModelSource).toContain("export type PendingTableAxisDragState")
    expect(tableAxisDragModelSource).toContain("export type DraggedTableAxisState")
    expect(tableAxisDragModelSource).toContain("export type TableAxisReorderIndicatorState")
    expect(tableAxisDragModelSource).toContain("export const createHiddenTableAxisReorderIndicatorState")
    expect(tableAxisDragModelSource).toContain("export const createPendingTableAxisDragState")
    expect(tableAxisDragModelSource).toContain("export const createDraggedTableAxisState")
    expect(tableAxisDragModelSource).toContain("export const createTableAxisDragGhostPosition")
    expect(tableAxisDragModelSource).toContain("export const hideTableAxisReorderIndicatorState")
    expect(tableAxisDragModelSource).toContain("export const resolveTableAxisReorderIndicator")
    expect(tableAxisDragModelSource).toContain("export const resolveTableAxisIndexFromPointer")
    expect(nestedListItemModelSource).toContain("export type NestedListItemContext =")
    expect(nestedListItemModelSource).toContain("export const LIST_ITEM_SELECTOR")
    expect(nestedListItemModelSource).toContain("export const LIST_CONTAINER_SELECTOR")
    expect(nestedListItemModelSource).toContain("export const sameListPath")
    expect(nestedListItemModelSource).toContain("export const selectNestedListItemNode")
    expect(nestedListItemModelSource).toContain("export const selectNestedListItemTextAnchor")
    expect(nestedListItemModelSource).toContain("export const resolveNestedListItemContextFromTarget")
    expect(nestedListItemModelSource).toContain("export const resolveNestedListItemContextByClientPosition")
    expect(nestedListItemModelSource).toContain("export const resolveNodeSelectedNestedListItemContext")
    expect(nestedListItemModelSource).toContain("export const resolveSelectionAnchorNestedListItemContext")
    expect(nestedListItemModelSource).toContain("export const resolveNestedListItemContextByIndices")
    expect(nestedListItemModelSource).toContain("export const resolveNestedListItemDropIndicator")
    expect(nestedListItemDragModelSource).toContain("export type PendingNestedListItemHandleDragState")
    expect(nestedListItemDragModelSource).toContain("export type DraggedNestedListItemState")
    expect(nestedListItemDragModelSource).toContain("export type NestedListItemDropIndicatorState")
    expect(nestedListItemDragModelSource).toContain("export const createNestedListItemDragPreview")
    expect(nestedListItemDragModelSource).toContain("export const createDraggedNestedListItemState")
    expect(nestedListItemDragModelSource).toContain("export const createNestedListItemDropIndicatorState")
    expect(nestedListItemDragModelSource).toContain("export const hideNestedListItemDropIndicatorState")
    expect(nestedListItemDragModelSource).toContain("export const isNestedListItemContextInDraggedList")
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

    const editorStudioMetaModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/editorStudioMetaModel.ts"),
      "utf8"
    )
    expect(editorStudioMetaModelSource).toContain('buildPreviewSummaryFromMarkdown(content, maxLength, "")')
    expect(editorStudioMetaModelSource).toContain("summary: normalizePersistedSummary(parsed.summary)")
    expect(editorStudioMetaModelSource).toContain("const normalizedSummary = normalizePersistedSummary(options?.summary)")
  })

  test("contentHtml fallback은 빈 fenced code body를 pretty-code 원문으로 복구한다", () => {
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const htmlRecoveredContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "const answer = 42;",
      "return answer",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")

    expect(restoreEmptyFencedCodeBlocks(staleContent, htmlRecoveredContent)).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
  })

  test("contentHtml fallback은 pretty-code raw attribute만 있어도 빈 코드블럭을 복구한다", () => {
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<div class="aq-code-block">',
      '<div class="aq-code-toolbar"><span class="aq-code-language">TS</span></div>',
      '<div class="aq-code-body"><div class="aq-code-shell">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts" data-raw-code="const answer = 42;&#10;return answer">',
      '<span class="token keyword">const</span> answer = 42;',
      '</code>',
      '</pre>',
      '</div></div>',
      '</div>',
    ].join("")

    expect(resolveEditorMetaSnapshot(staleContent, prettyCodeHtml).body).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
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
    const tableResizeInteractionModelPath = path.resolve(
      __dirname,
      "../src/components/editor/tableResizeInteractionModel.ts"
    )
    expect(existsSync(tableResizeInteractionModelPath)).toBe(true)
    const tableResizeInteractionModelSource = existsSync(tableResizeInteractionModelPath)
      ? readFileSync(tableResizeInteractionModelPath, "utf8")
      : ""
    const tableFloatingUiModelPath = path.resolve(
      __dirname,
      "../src/components/editor/tableFloatingUiModel.ts"
    )
    expect(existsSync(tableFloatingUiModelPath)).toBe(true)
    const tableFloatingUiModelSource = existsSync(tableFloatingUiModelPath)
      ? readFileSync(tableFloatingUiModelPath, "utf8")
      : ""
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
    expect(blockEditorEngineSource).toContain('} from "./tableResizeInteractionModel"')
    expect(tableResizeInteractionModelSource).toContain("export type TableRowResizeState = {")
    expect(tableResizeInteractionModelSource).toContain("export type TableColumnRailResizeState = {")
    expect(tableResizeInteractionModelSource).toContain("export type TableColumnDragGuideState = {")
    expect(tableResizeInteractionModelSource).toContain("export const createHiddenTableColumnDragGuideState =")
    expect(tableResizeInteractionModelSource).toContain("export const hideTableColumnDragGuideState =")
    expect(tableResizeInteractionModelSource).toContain("export const createTableRowResizeState =")
    expect(tableResizeInteractionModelSource).toContain("export const createTableColumnRailResizeState =")
    expect(tableResizeInteractionModelSource).toContain("export const isRowResizeHandleTarget =")
    expect(tableResizeInteractionModelSource).toContain("export const resolveTableColumnDragGuideState =")
    expect(tableResizeInteractionModelSource).toContain("export const resolveTableColumnIndexFromResizeHandleTarget =")
    expect(tableFloatingUiModelSource).toContain("export type TableMenuKind =")
    expect(tableFloatingUiModelSource).toContain("export type TableMenuState =")
    expect(tableFloatingUiModelSource).toContain("export type TableOverflowCoachmarkState =")
    expect(tableFloatingUiModelSource).toContain("export const TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX = 244")
    expect(tableFloatingUiModelSource).toContain("export const TABLE_OVERFLOW_COACHMARK_DISMISS_MS = 4200")
    expect(tableFloatingUiModelSource).toContain("export const resolveTableOverflowCoachmarkState =")
    expect(tableFloatingUiModelSource).toContain("export const hideTableOverflowCoachmarkState =")
    expect(tableFloatingUiModelSource).toContain("export const resolveTableMenuState =")
    expect(tableFloatingUiModelSource).toContain("export const resolveTableMenuFlags =")
    expect(tableFloatingUiModelSource).toContain("export const resolveCompactTableAffordanceKind =")
    expect(tableFloatingUiModelSource).toContain("export const resolveTableHandleVisibility =")
    expect(blockEditorEngineSource).not.toContain("type TableRowResizeState = {")
    expect(blockEditorEngineSource).not.toContain("type TableColumnRailResizeState = {")
    expect(blockEditorEngineSource).not.toContain("type TableColumnDragGuideState = {")
    expect(blockEditorEngineSource).not.toContain("type TableMenuKind =")
    expect(blockEditorEngineSource).not.toContain("type TableMenuState =")
    expect(blockEditorEngineSource).not.toContain("type TableOverflowCoachmarkState =")
    expect(blockEditorEngineSource).not.toContain("const TABLE_MENU_EDGE_PADDING_PX =")
    expect(blockEditorEngineSource).not.toContain("const tableMenuKind = tableMenuState?.kind ?? null")
    expect(blockEditorEngineSource).not.toContain("const compactTableAffordanceKind = useMemo(")
    expect(blockEditorEngineSource).not.toContain("const shouldShowColumnRail =")
    expect(blockEditorEngineSource).not.toContain("const shouldShowRowRail =")
    expect(blockEditorEngineSource).not.toContain("const isRowResizeHandleTarget = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const syncTableColumnDragGuideForColumn = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const startTableColumnResizeFromDomHandle = useCallback(")
    expect(blockEditorEngineSource).toContain('} from "./tableFloatingUiModel"')
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
    expect(blockEditorEngineSource).toContain("isCellMenuOpen,")
    expect(markdownRendererSource).toContain("const explicitTableWidth = useMemo(")
    expect(markdownRendererSource).toContain("minWidth: `${explicitTableWidth}px`")
    expect(markdownRendererRootSource).toContain("width: auto;")
    expect(markdownRendererRootSource).toContain("max-width: none;")
    expect(blockEditorEngineSource).toContain("isRowMenuOpen,")
    expect(blockEditorEngineSource).toContain("isColumnMenuOpen,")
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
    expect(blockEditorEngineSource).toContain("isTableStructureMenuOpen,")
    expect(blockEditorEngineSource).toContain("shouldShowColumnAddBar,")
    expect(blockEditorEngineSource).toContain("shouldShowRowAddBar,")
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
    const editorStudioThumbnailPanelsSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioThumbnailPanels.tsx"),
      "utf8"
    )
    const editorStudioPersistenceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioPersistence.ts"),
      "utf8"
    )

    expect(editorStudioSource).toContain("const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {")
    expect(editorStudioSource).toContain("onThumbnailPaste={handleThumbnailPaste}")
    expect(editorStudioThumbnailPanelsSource).toContain("<PreviewEditorSection onPasteCapture={onThumbnailPaste}>")
    expect(editorStudioThumbnailPanelsSource).toContain("onPaste={onThumbnailPaste}")
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
