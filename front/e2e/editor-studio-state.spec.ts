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
import { restoreEditorDocCodeBlocksFromMarkdown } from "src/components/editor/serialization"

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

  test("editor studio와 BlockEditorEngine은 v2 단일 경로와 단일 작성 모드 계약을 유지한다", () => {
    const editorStudioPageSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/EditorStudioPage.tsx"), "utf8")
    const editorStudioControllerSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceController.tsx"),
      "utf8"
    )
    const editorStudioRootPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"
    )
    expect(existsSync(editorStudioRootPath)).toBe(true)
    const editorStudioSource = existsSync(editorStudioRootPath)
      ? readFileSync(editorStudioRootPath, "utf8")
      : editorStudioControllerSource
    const editorStudioRootViewPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx"
    )
    expect(existsSync(editorStudioRootViewPath)).toBe(true)
    const editorStudioRootViewSource = existsSync(editorStudioRootViewPath)
      ? readFileSync(editorStudioRootViewPath, "utf8")
      : ""
    const editorStudioRuntimePath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioWorkspaceControllerRuntime.ts"
    )
    expect(existsSync(editorStudioRuntimePath)).toBe(true)
    const editorStudioRuntimeSource = existsSync(editorStudioRuntimePath)
      ? readFileSync(editorStudioRuntimePath, "utf8")
      : ""
    const editorStudioPresentationSource = `${editorStudioSource}\n${editorStudioRootViewSource}\n${editorStudioRuntimeSource}`
    const dedicatedEditorSurfacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioDedicatedEditorSurface.tsx"
    )
    expect(existsSync(dedicatedEditorSurfacePath)).toBe(true)
    const dedicatedEditorSurfaceSource = existsSync(dedicatedEditorSurfacePath)
      ? readFileSync(dedicatedEditorSurfacePath, "utf8")
      : ""
    const dedicatedEditorSurfacePartsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioDedicatedEditorSurfaceParts.tsx"
    )
    expect(existsSync(dedicatedEditorSurfacePartsPath)).toBe(true)
    const dedicatedEditorSurfacePartsSource = existsSync(dedicatedEditorSurfacePartsPath)
      ? readFileSync(dedicatedEditorSurfacePartsPath, "utf8")
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
    const editorStudioAdminPostFlowPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioAdminPostFlow.ts"
    )
    expect(existsSync(editorStudioAdminPostFlowPath)).toBe(true)
    const editorStudioAdminPostFlowSource = existsSync(editorStudioAdminPostFlowPath)
      ? readFileSync(editorStudioAdminPostFlowPath, "utf8")
      : ""
    const editorStudioUtilityCommandsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioUtilityCommands.ts"
    )
    expect(existsSync(editorStudioUtilityCommandsPath)).toBe(true)
    const editorStudioUtilityCommandsSource = existsSync(editorStudioUtilityCommandsPath)
      ? readFileSync(editorStudioUtilityCommandsPath, "utf8")
      : ""
    const editorStudioProfileCommandsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioProfileCommands.ts"
    )
    expect(existsSync(editorStudioProfileCommandsPath)).toBe(true)
    const editorStudioProfileCommandsSource = existsSync(editorStudioProfileCommandsPath)
      ? readFileSync(editorStudioProfileCommandsPath, "utf8")
      : ""
    const editorStudioMetaCatalogPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioMetaCatalog.ts"
    )
    expect(existsSync(editorStudioMetaCatalogPath)).toBe(true)
    const editorStudioMetaCatalogSource = existsSync(editorStudioMetaCatalogPath)
      ? readFileSync(editorStudioMetaCatalogPath, "utf8")
      : ""
    const editorStudioPublishModalFlowPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioPublishModalFlow.ts"
    )
    expect(existsSync(editorStudioPublishModalFlowPath)).toBe(true)
    const editorStudioPublishModalFlowSource = existsSync(editorStudioPublishModalFlowPath)
      ? readFileSync(editorStudioPublishModalFlowPath, "utf8")
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
    const editorStudioPostListPanelPartsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioPostListPanelParts.tsx"
    )
    expect(existsSync(editorStudioPostListPanelPartsPath)).toBe(true)
    const editorStudioPostListPanelPartsSource = existsSync(editorStudioPostListPanelPartsPath)
      ? readFileSync(editorStudioPostListPanelPartsPath, "utf8")
      : ""
    const editorStudioContentWorkspacePath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioContentWorkspace.tsx"
    )
    expect(existsSync(editorStudioContentWorkspacePath)).toBe(true)
    const editorStudioContentWorkspaceSource = existsSync(editorStudioContentWorkspacePath)
      ? readFileSync(editorStudioContentWorkspacePath, "utf8")
      : ""
    const useEditorStudioListConditionsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/useEditorStudioListConditions.ts"
    )
    expect(existsSync(useEditorStudioListConditionsPath)).toBe(true)
    const useEditorStudioListConditionsSource = existsSync(useEditorStudioListConditionsPath)
      ? readFileSync(useEditorStudioListConditionsPath, "utf8")
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
    const editorStudioComposeWritingSurfacePartsPath = path.resolve(
      __dirname,
      "../src/routes/Admin/EditorStudioComposeWritingSurfaceParts.tsx"
    )
    expect(existsSync(editorStudioComposeWritingSurfacePartsPath)).toBe(true)
    const editorStudioComposeWritingSurfacePartsSource = existsSync(editorStudioComposeWritingSurfacePartsPath)
      ? readFileSync(editorStudioComposeWritingSurfacePartsPath, "utf8")
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
    const blockEditorEngineControllerPath = path.resolve(
      __dirname,
      "../src/components/editor/useBlockEditorEngineController.ts"
    )
    expect(existsSync(blockEditorEngineControllerPath)).toBe(true)
    const blockEditorEngineControllerSource = existsSync(blockEditorEngineControllerPath)
      ? readFileSync(blockEditorEngineControllerPath, "utf8")
      : ""
    const blockEditorEngineInsertActionsSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorEngineInsertActions.ts"),
      "utf8"
    )
    const blockEditorEngineSlashMenuSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorEngineSlashMenu.ts"),
      "utf8"
    )
    const blockEditorEngineBlockSelectionUiSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorEngineBlockSelectionUi.ts"),
      "utf8"
    )
    const blockEditorEngineBlockDragSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorEngineBlockDrag.ts"),
      "utf8"
    )
    const blockEditorEngineStylesPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.styles.tsx"
    )
    expect(existsSync(blockEditorEngineStylesPath)).toBe(true)
    const blockEditorEngineStylesSource = existsSync(blockEditorEngineStylesPath)
      ? readFileSync(blockEditorEngineStylesPath, "utf8")
      : ""
    const blockEditorToolbarStylesPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.toolbarStyles.tsx"
    )
    expect(existsSync(blockEditorToolbarStylesPath)).toBe(true)
    const blockEditorToolbarStylesSource = existsSync(blockEditorToolbarStylesPath)
      ? readFileSync(blockEditorToolbarStylesPath, "utf8")
      : ""
    const blockEditorEditorSurfaceStylesPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.editorSurfaceStyles.tsx"
    )
    expect(existsSync(blockEditorEditorSurfaceStylesPath)).toBe(true)
    const blockEditorEditorSurfaceStylesSource = existsSync(blockEditorEditorSurfaceStylesPath)
      ? readFileSync(blockEditorEditorSurfaceStylesPath, "utf8")
      : ""
    const blockEditorTableStylesPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.tableStyles.tsx"
    )
    expect(existsSync(blockEditorTableStylesPath)).toBe(true)
    const blockEditorTableStylesSource = existsSync(blockEditorTableStylesPath)
      ? readFileSync(blockEditorTableStylesPath, "utf8")
      : ""
    const blockEditorBlockStylesPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.blockStyles.tsx"
    )
    expect(existsSync(blockEditorBlockStylesPath)).toBe(true)
    const blockEditorBlockStylesSource = existsSync(blockEditorBlockStylesPath)
      ? readFileSync(blockEditorBlockStylesPath, "utf8")
      : ""
    const blockEditorEngineLayersPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.layers.tsx"
    )
    expect(existsSync(blockEditorEngineLayersPath)).toBe(true)
    const blockEditorEngineLayersSource = existsSync(blockEditorEngineLayersPath)
      ? readFileSync(blockEditorEngineLayersPath, "utf8")
      : ""
    const blockEditorViewportLayerPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.viewportLayer.tsx"
    )
    expect(existsSync(blockEditorViewportLayerPath)).toBe(true)
    const blockEditorViewportLayerSource = existsSync(blockEditorViewportLayerPath)
      ? readFileSync(blockEditorViewportLayerPath, "utf8")
      : ""
    const blockEditorTableOverlayLayerPath = path.resolve(
      __dirname,
      "../src/components/editor/BlockEditorEngine.tableOverlayLayer.tsx"
    )
    expect(existsSync(blockEditorTableOverlayLayerPath)).toBe(true)
    const blockEditorTableOverlayLayerSource = existsSync(blockEditorTableOverlayLayerPath)
      ? readFileSync(blockEditorTableOverlayLayerPath, "utf8")
      : ""
    const blockEditorTableOverlayControllerPath = path.resolve(
      __dirname,
      "../src/components/editor/useBlockEditorTableOverlayController.ts"
    )
    expect(existsSync(blockEditorTableOverlayControllerPath)).toBe(true)
    const blockEditorTableOverlayControllerSource = existsSync(blockEditorTableOverlayControllerPath)
      ? readFileSync(blockEditorTableOverlayControllerPath, "utf8")
      : ""
    const editorExtensionsPath = path.resolve(__dirname, "../src/components/editor/extensions.tsx")
    const editorExtensionsSource = readFileSync(editorExtensionsPath, "utf8")
    const codeBlockNodeViewPath = path.resolve(__dirname, "../src/components/editor/codeBlockNodeView.tsx")
    expect(existsSync(codeBlockNodeViewPath)).toBe(true)
    const codeBlockNodeViewSource = existsSync(codeBlockNodeViewPath)
      ? readFileSync(codeBlockNodeViewPath, "utf8")
      : ""
    const mermaidNodeViewPath = path.resolve(__dirname, "../src/components/editor/mermaidNodeView.tsx")
    expect(existsSync(mermaidNodeViewPath)).toBe(true)
    const mermaidNodeViewSource = existsSync(mermaidNodeViewPath)
      ? readFileSync(mermaidNodeViewPath, "utf8")
      : ""
    const editorNodeViewSharedPath = path.resolve(__dirname, "../src/components/editor/editorNodeViewShared.ts")
    expect(existsSync(editorNodeViewSharedPath)).toBe(true)
    const editorNodeViewSharedSource = existsSync(editorNodeViewSharedPath)
      ? readFileSync(editorNodeViewSharedPath, "utf8")
      : ""
    const calloutNodeViewPath = path.resolve(__dirname, "../src/components/editor/calloutNodeView.tsx")
    expect(existsSync(calloutNodeViewPath)).toBe(true)
    const calloutNodeViewSource = existsSync(calloutNodeViewPath)
      ? readFileSync(calloutNodeViewPath, "utf8")
      : ""
    const toggleNodeViewPath = path.resolve(__dirname, "../src/components/editor/toggleNodeView.tsx")
    expect(existsSync(toggleNodeViewPath)).toBe(true)
    const toggleNodeViewSource = existsSync(toggleNodeViewPath)
      ? readFileSync(toggleNodeViewPath, "utf8")
      : ""
    const linkCardNodeViewsPath = path.resolve(__dirname, "../src/components/editor/linkCardNodeViews.tsx")
    expect(existsSync(linkCardNodeViewsPath)).toBe(true)
    const linkCardNodeViewsSource = existsSync(linkCardNodeViewsPath)
      ? readFileSync(linkCardNodeViewsPath, "utf8")
      : ""
    const formulaNodeViewsPath = path.resolve(__dirname, "../src/components/editor/formulaNodeViews.tsx")
    expect(existsSync(formulaNodeViewsPath)).toBe(true)
    const formulaNodeViewsSource = existsSync(formulaNodeViewsPath)
      ? readFileSync(formulaNodeViewsPath, "utf8")
      : ""
    const rawMarkdownNodeViewPath = path.resolve(__dirname, "../src/components/editor/rawMarkdownNodeView.tsx")
    expect(existsSync(rawMarkdownNodeViewPath)).toBe(true)
    const rawMarkdownNodeViewSource = existsSync(rawMarkdownNodeViewPath)
      ? readFileSync(rawMarkdownNodeViewPath, "utf8")
      : ""
    const resizableImageNodeViewPath = path.resolve(__dirname, "../src/components/editor/resizableImageNodeView.tsx")
    expect(existsSync(resizableImageNodeViewPath)).toBe(true)
    const resizableImageNodeViewSource = existsSync(resizableImageNodeViewPath)
      ? readFileSync(resizableImageNodeViewPath, "utf8")
      : ""
    const serializationPath = path.resolve(__dirname, "../src/components/editor/serialization.ts")
    const serializationSource = readFileSync(serializationPath, "utf8")
    const serializationTypesPath = path.resolve(__dirname, "../src/components/editor/serializationTypes.ts")
    expect(existsSync(serializationTypesPath)).toBe(true)
    const serializationTypesSource = existsSync(serializationTypesPath)
      ? readFileSync(serializationTypesPath, "utf8")
      : ""
    const serializationNodeFactoryPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationNodeFactory.ts"
    )
    expect(existsSync(serializationNodeFactoryPath)).toBe(true)
    const serializationNodeFactorySource = existsSync(serializationNodeFactoryPath)
      ? readFileSync(serializationNodeFactoryPath, "utf8")
      : ""
    const serializationMarkdownExportPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationMarkdownExport.ts"
    )
    expect(existsSync(serializationMarkdownExportPath)).toBe(true)
    const serializationMarkdownExportSource = existsSync(serializationMarkdownExportPath)
      ? readFileSync(serializationMarkdownExportPath, "utf8")
      : ""
    const serializationHtmlImportPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationHtmlImport.ts"
    )
    expect(existsSync(serializationHtmlImportPath)).toBe(true)
    const serializationHtmlImportSource = existsSync(serializationHtmlImportPath)
      ? readFileSync(serializationHtmlImportPath, "utf8")
      : ""
    const serializationTableMetadataPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationTableMetadata.ts"
    )
    expect(existsSync(serializationTableMetadataPath)).toBe(true)
    const serializationTableMetadataSource = existsSync(serializationTableMetadataPath)
      ? readFileSync(serializationTableMetadataPath, "utf8")
      : ""
    const serializationInlineNormalizationPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationInlineNormalization.ts"
    )
    expect(existsSync(serializationInlineNormalizationPath)).toBe(true)
    const serializationInlineNormalizationSource = existsSync(serializationInlineNormalizationPath)
      ? readFileSync(serializationInlineNormalizationPath, "utf8")
      : ""
    const serializationLegacyRepairPath = path.resolve(
      __dirname,
      "../src/components/editor/serializationLegacyRepair.ts"
    )
    expect(existsSync(serializationLegacyRepairPath)).toBe(true)
    const serializationLegacyRepairSource = existsSync(serializationLegacyRepairPath)
      ? readFileSync(serializationLegacyRepairPath, "utf8")
      : ""
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
    const blockToolbarModelPath = path.resolve(__dirname, "../src/components/editor/blockToolbarModel.ts")
    expect(existsSync(blockToolbarModelPath)).toBe(true)
    const blockToolbarModelSource = existsSync(blockToolbarModelPath)
      ? readFileSync(blockToolbarModelPath, "utf8")
      : ""
    const inlineToolbarModelPath = path.resolve(__dirname, "../src/components/editor/inlineToolbarModel.ts")
    expect(existsSync(inlineToolbarModelPath)).toBe(true)
    const inlineToolbarModelSource = existsSync(inlineToolbarModelPath) ? readFileSync(inlineToolbarModelPath, "utf8") : ""
    const floatingBubbleStatePath = path.resolve(__dirname, "../src/components/editor/useFloatingBubbleState.ts")
    expect(existsSync(floatingBubbleStatePath)).toBe(true)
    const floatingBubbleStateSource = existsSync(floatingBubbleStatePath) ? readFileSync(floatingBubbleStatePath, "utf8") : ""
    const writerEditorHostSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/WriterEditorHost.tsx"), "utf8")
    const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")
    const dedicatedEditorRootStyle = dedicatedEditorSurfacePartsSource.match(
      /export const EditorStudioRoot = styled\.main`([\s\S]*?)`\n\nexport const EditorStudioLoadingState/
    )?.[1] ?? ""
    const dedicatedEditorFrameStyle = dedicatedEditorSurfacePartsSource.match(
      /export const EditorStudioFrame = styled\.div`([\s\S]*?)`\n\nexport const EditorStudioWritingColumn/
    )?.[1] ?? ""
    const dedicatedEditorTopBarStyle = dedicatedEditorSurfacePartsSource.match(
      /export const EditorStudioDedicatedTopBar = styled\.div`([\s\S]*?)`\n\nexport const EditorExitAction/
    )?.[1] ?? ""
    const blockEditorShellStyle = blockEditorToolbarStylesSource.match(
      /export const Shell = styled\.div`([\s\S]*?)`\n\nexport const Toolbar/
    )?.[1] ?? ""
    const toolbarStyle = blockEditorToolbarStylesSource.match(
      /export const Toolbar = styled\.div`([\s\S]*?)`\n\nexport const ToolbarActions/
    )?.[1] ?? ""
    const toolbarActionsStyle = blockEditorToolbarStylesSource.match(
      /export const ToolbarActions = styled\.div`([\s\S]*?)`\n\nexport const ToolbarGroup/
    )?.[1] ?? ""
    const quickInsertActionsStyle = blockEditorBlockStylesSource.match(
      /export const QuickInsertActions = styled\.div`([\s\S]*?)`\n\nexport const QuickInsertButton/
    )?.[1] ?? ""
    const quickInsertButtonStyle = blockEditorBlockStylesSource.match(
      /export const QuickInsertButton = styled\.button`([\s\S]*?)`\s*$/
    )?.[1] ?? ""

    expect(editorStudioSource).not.toContain("BLOCK_EDITOR_V2_ENABLED")
    expect(editorStudioSource).not.toContain("EditorStudioLegacyToolbar")
    expect(editorStudioSource).not.toContain("RawMarkdownTextarea")
    expect(editorStudioPresentationSource).toContain('import { EditorStudioWorkspaceControllerRootView } from "./EditorStudioWorkspaceControllerRootView"')
    expect(editorStudioRootViewSource).toContain("const isCompactSplitPreview = false")
    expect(editorStudioRootViewSource).toContain("EditorStudioDedicatedEditorSurface")
    expect(editorStudioSource).not.toContain("const EditorStudioRoot")
    expect(dedicatedEditorRootStyle).toContain("width: 100vw;")
    expect(dedicatedEditorRootStyle).toContain("margin-left: calc(50% - 50vw);")
    expect(dedicatedEditorRootStyle).toContain("margin-right: calc(50% - 50vw);")
    expect(dedicatedEditorRootStyle).not.toContain("width: min(100%, 1600px);")
    expect(dedicatedEditorRootStyle).not.toContain("margin: 0 auto;")
    expect(dedicatedEditorTopBarStyle).toContain("width: min(100%, 1600px);")
    expect(dedicatedEditorTopBarStyle).toContain("margin: 0 auto;")
    expect(dedicatedEditorFrameStyle).toContain("width: min(100%, 1600px);")
    expect(dedicatedEditorFrameStyle).toContain("margin: 0 auto;")
    expect(rootLayoutSource).toContain('const isDedicatedEditorRoute = pathname === "/editor/[id]" || pathname === "/editor/new"')
    expect(rootLayoutSource).toContain("<StyledMain $fullBleed={isDedicatedEditorRoute}>")
    expect(rootLayoutSource).toContain("$fullBleed?: boolean")
    expect(blockEditorShellStyle).toContain("min-width: 0;")
    expect(blockEditorShellStyle).toContain("max-width: 100%;")
    expect(toolbarStyle).toContain("width: 100%;")
    expect(toolbarStyle).toContain("max-width: 100%;")
    expect(toolbarStyle).toContain("overflow-x: clip;")
    expect(toolbarActionsStyle).toContain("flex: 1 1 100%;")
    expect(toolbarActionsStyle).toContain("width: 100%;")
    expect(toolbarActionsStyle).toContain("max-width: 100%;")
    expect(quickInsertActionsStyle).toContain("min-width: 0;")
    expect(quickInsertActionsStyle).toContain("max-width: 100%;")
    expect(quickInsertButtonStyle).toContain("white-space: nowrap;")
    expect(dedicatedEditorSurfacePartsSource).toContain("grid-template-columns: minmax(0, 1fr);")
    expect(dedicatedEditorSurfaceSource).toContain('data-testid="editor-studio-frame"')
    expect(editorStudioRootViewSource).toContain('import { WriterEditorHost } from "./WriterEditorHost"')
    expect(editorStudioRootViewSource.match(/<WriterEditorHost/g)?.length).toBe(2)
    expect(editorStudioRootViewSource).not.toContain("<LazyBlockEditorShell")
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
    expect(dedicatedEditorSurfacePartsSource).toContain("export const EditorExitAction = styled.button`")
    expect(dedicatedEditorSurfacePartsSource).toContain("min-height: 42px;")
    expect(dedicatedEditorSurfacePartsSource).toContain("export const EditorStudioFrame = styled.div`")
    expect(dedicatedEditorSurfacePartsSource).toContain("export const EditorStudioWritingColumn = styled.section<{ $compact?: boolean }>`")
    expect(editorStudioSource).not.toContain("type EditorMode =")
    expect(editorStudioSource).not.toContain("type PublishActionType =")
    expect(editorStudioSource).not.toContain("type PostVisibility =")
    expect(editorStudioSource).not.toContain("const visibilityLabel =")
    expect(editorStudioSource).not.toContain("const deferredContentMetrics = useMemo(() => {")
    expect(editorStudioSource).not.toContain("const publishActionTitle =")
    expect(editorStudioSource).not.toContain("const publishActionButtonText =")
    expect(editorStudioSource).not.toContain("const publishActionTriggerDisabled =")
    expect(editorStudioSource).not.toContain("const mobilePrimaryActionLabel =")
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioThumbnailPreview } from "./useEditorStudioThumbnailPreview"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioThumbnailControls } from "./useEditorStudioThumbnailControls"')
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
    expect(editorStudioPresentationSource).toContain('} from "./EditorStudioThumbnailPanels"')
    expect(editorStudioSource).not.toContain("const thumbnailEditorPanel = useMemo")
    expect(editorStudioSource).not.toContain("const previewMetaEditorPanel = useMemo")
    expect(editorStudioPublishModalSource).toContain("export const EditorStudioPublishModal =")
    expect(editorStudioPresentationSource).toContain('import { EditorStudioPublishModal } from "./EditorStudioPublishModal"')
    expect(editorStudioPresentationSource.match(/<EditorStudioPublishModal/g)?.length).toBe(2)
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
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioContentWorkspace } from "./EditorStudioContentWorkspace"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioContentWorkspace/g)?.length).toBe(1)
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
    expect(editorStudioPresentationSource).toContain("const handleSelectedPostIdChange = useCallback")
    expect(editorStudioPresentationSource).toContain("onPostIdChange={handleSelectedPostIdChange}")
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
    expect(editorStudioPresentationSource).toContain("const handleContinueSelectedPostEditing = useCallback")
    expect(editorStudioPresentationSource).toContain("onContinueEditing={handleContinueSelectedPostEditing}")
    expect(editorStudioPresentationSource).toContain("onCreateNewPost={handleCreateNewPostFromSelectedPanel}")
    expect(editorStudioPresentationSource).toContain("onDeletePost={handleDeleteSelectedPost}")
    expect(editorStudioSelectedPostPanelSource).not.toContain("openPublishModal")
    expect(editorStudioSelectedPostPanelSource).not.toContain("switchToCreateMode")
    expect(editorStudioSelectedPostPanelSource).not.toContain("openDeleteConfirm")
    expect(editorStudioSelectedPostPanelSource).not.toContain("apiFetch(")
    expect(editorStudioSelectedPostPanelSource).not.toContain("run(")
    expect(editorStudioLegacyProfileSectionSource).toContain("export const EditorStudioLegacyProfileSection =")
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioLegacyProfileSection } from "./EditorStudioLegacyProfileSection"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioLegacyProfileSection/g)?.length).toBe(1)
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
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioLegacyUtilityPanel } from "./EditorStudioLegacyUtilityPanel"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioLegacyUtilityPanel/g)?.length).toBe(1)
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
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioResultLogPanel } from "./EditorStudioResultLogPanel"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioResultLogPanel/g)?.length).toBe(2)
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
    expect(editorStudioPostListPanelPartsSource).toContain("관리자 글 리스트")
    expect(editorStudioPostListPanelPartsSource).toContain("삭제 글 리스트")
    expect(editorStudioPostListPanelPartsSource).toContain("현재 목록 전체 선택")
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
    expect(useEditorStudioListConditionsSource).toContain("export const useEditorStudioListConditions =")
    expect(useEditorStudioListConditionsSource).toContain("export const LIST_SORT_OPTIONS =")
    expect(useEditorStudioListConditionsSource).toContain("export type PostListScope =")
    expect(useEditorStudioListConditionsSource).toContain("export type ListQuickPreset =")
    expect(editorStudioPresentationSource).toContain('} from "./useEditorStudioListConditions"')
    expect(editorStudioPresentationSource).toContain("useEditorStudioListConditions()")
    expect(editorStudioSource).not.toContain("const sanitizeNumberInput =")
    expect(editorStudioSource).not.toContain("const applyListQuickPreset = useCallback")
    expect(editorStudioSource).not.toContain("LIST_CONDITION_STORAGE_KEY")
    expect(editorStudioSource).not.toContain("localStorage.getItem(LIST_CONDITION_STORAGE_KEY)")
    expect(editorStudioSource).not.toContain("localStorage.setItem(LIST_CONDITION_STORAGE_KEY")
    expect(useEditorStudioListConditionsSource).not.toContain("apiFetch(")
    expect(useEditorStudioListConditionsSource).not.toContain("run(")
    expect(useEditorStudioListConditionsSource).not.toContain("loadAdminPosts")
    expect(useEditorStudioListConditionsSource).not.toContain("openDeleteConfirm")
    expect(useEditorStudioListConditionsSource).not.toContain("deletePostsFromList")
    expect(editorStudioDeleteConfirmDialogSource).toContain("export const EditorStudioDeleteConfirmDialog =")
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioDeleteConfirmDialog } from "./EditorStudioDeleteConfirmDialog"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioDeleteConfirmDialog/g)?.length).toBe(1)
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
    expect(editorStudioPresentationSource).toContain(
      'import { EditorStudioComposeWorkspace } from "./EditorStudioComposeWorkspace"'
    )
    expect(editorStudioPresentationSource.match(/<EditorStudioComposeWorkspace/g)?.length).toBe(1)
    expect(editorStudioPresentationSource).toContain("composeCallToActionLabel={composeCallToActionLabel}")
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
    expect(editorStudioComposeWritingSurfacePartsSource).toContain("export const EditorStudioComposeMainColumn = styled.div`")
    expect(editorStudioComposeWritingSurfacePartsSource).toContain("export const TitleInput = styled.textarea`")
    expect(editorStudioComposeWritingSurfacePartsSource).toContain("export const EditorStudioComposeFooterBar = styled.div`")
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
    expect(editorStudioPresentationSource).toContain('} from "./editorStudioMetaModel"')
    expect(editorStudioStorageModelSource).toContain("export const TAG_CATALOG_STORAGE_KEY =")
    expect(editorStudioStorageModelSource).toContain("export const CATEGORY_CATALOG_STORAGE_KEY =")
    expect(editorStudioStorageModelSource).toContain("export const readStoredCatalog =")
    expect(editorStudioStorageModelSource).toContain("export const persistCatalog =")
    expect(editorStudioStorageModelSource).toContain("export const readLocalDraft =")
    expect(editorStudioStorageModelSource).toContain("export const persistLocalDraft =")
    expect(editorStudioStorageModelSource).toContain("export const removeLocalDraft =")
    expect(editorStudioPresentationSource).toContain('} from "./editorStudioStorageModel"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioAdminPostFlow } from "./useEditorStudioAdminPostFlow"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioUtilityCommands } from "./useEditorStudioUtilityCommands"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioProfileCommands } from "./useEditorStudioProfileCommands"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioMetaCatalog } from "./useEditorStudioMetaCatalog"')
    expect(editorStudioPresentationSource).toContain('import { useEditorStudioPublishModalFlow } from "./useEditorStudioPublishModalFlow"')
    expect(editorStudioPageSource).toContain('import { EditorStudioWorkspaceController } from "./EditorStudioWorkspaceController"')
    expect(editorStudioPageSource.split("\n").length).toBeLessThanOrEqual(1500)
    expect(editorStudioControllerSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(editorStudioSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(editorStudioRootViewSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(editorStudioControllerSource).toContain('from "./EditorStudioWorkspaceControllerRoot"')
    expect(editorStudioSource).not.toContain("const loadAdminPosts = useCallback(")
    expect(editorStudioSource).not.toContain("const deletePostsFromList = async")
    expect(editorStudioSource).not.toContain("const restoreDeletedPostFromList = useCallback(")
    expect(editorStudioSource).not.toContain("const hardDeleteDeletedPostFromList = useCallback(")
    expect(editorStudioSource).not.toContain("const handleListComments = () =>")
    expect(editorStudioSource).not.toContain("const handleUploadMemberProfileImage = async")
    expect(editorStudioSource).not.toContain("const refreshEditorMetaCatalog = useCallback(")
    expect(editorStudioSource).not.toContain("const handleRecommendTags = useCallback(")
    expect(editorStudioSource).not.toContain("const openPublishModal = useCallback(")
    expect(editorStudioAdminPostFlowSource).toContain("export const useEditorStudioAdminPostFlow =")
    expect(editorStudioAdminPostFlowSource).toContain("loadAdminPosts")
    expect(editorStudioAdminPostFlowSource).toContain("deletePostsFromList")
    expect(editorStudioAdminPostFlowSource).toContain("restoreDeletedPostFromList")
    expect(editorStudioAdminPostFlowSource).toContain("hardDeleteDeletedPostFromList")
    expect(editorStudioUtilityCommandsSource).toContain("export const useEditorStudioUtilityCommands =")
    expect(editorStudioUtilityCommandsSource).toContain("handleListComments")
    expect(editorStudioUtilityCommandsSource).toContain("handleReadSystemHealth")
    expect(editorStudioProfileCommandsSource).toContain("export const useEditorStudioProfileCommands =")
    expect(editorStudioProfileCommandsSource).toContain("handleUploadMemberProfileImage")
    expect(editorStudioProfileCommandsSource).toContain("handleUpdateMemberProfileCard")
    expect(editorStudioMetaCatalogSource).toContain("export const useEditorStudioMetaCatalog =")
    expect(editorStudioMetaCatalogSource).toContain("refreshEditorMetaCatalog")
    expect(editorStudioMetaCatalogSource).toContain("handleRecommendTags")
    expect(editorStudioPublishModalFlowSource).toContain("export const useEditorStudioPublishModalFlow =")
    expect(editorStudioPublishModalFlowSource).toContain("openPublishModal")
    expect(editorStudioPublishModalFlowSource).toContain("handleConfirmPublish")
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
    expect(blockEditorEngineSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorEngineStylesSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorEngineLayersSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorToolbarStylesSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorEditorSurfaceStylesSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorTableStylesSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorBlockStylesSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorViewportLayerSource.split("\n").length).toBeLessThanOrEqual(1000)
    expect(blockEditorEngineSource).toContain('from "./useBlockEditorEngineController"')
    expect(blockEditorEngineControllerSource).toContain("export const useBlockEditorEngineController =")
    expect(blockEditorEngineSource).toContain('} from "./BlockEditorEngine.styles"')
    expect(blockEditorEngineSource).toContain('} from "./BlockEditorEngine.layers"')
    expect(blockEditorEngineSource).toContain('} from "./BlockEditorEngine.tableOverlayLayer"')
    expect(blockEditorEngineStylesSource).toContain('from "./BlockEditorEngine.toolbarStyles"')
    expect(blockEditorEngineStylesSource).toContain('from "./BlockEditorEngine.editorSurfaceStyles"')
    expect(blockEditorEngineStylesSource).toContain('from "./BlockEditorEngine.tableStyles"')
    expect(blockEditorEngineStylesSource).toContain('from "./BlockEditorEngine.blockStyles"')
    expect(blockEditorEngineLayersSource).toContain('from "./BlockEditorEngine.viewportLayer"')
    expect(blockEditorViewportLayerSource).toContain("export const BlockEditorViewportLayer =")
    expect(blockEditorEngineControllerSource).toContain('} from "./useBlockEditorTableOverlayController"')
    expect(blockEditorTableOverlayLayerSource).toContain("export const BlockEditorTableOverlayLayer =")
    expect(blockEditorTableOverlayControllerSource).toContain("export const useBlockEditorTableOverlayController =")
    expect(editorExtensionsSource).toContain('from "./codeBlockNodeView"')
    expect(editorExtensionsSource).toContain('from "./mermaidNodeView"')
    expect(editorExtensionsSource.split("\n").length).toBeLessThanOrEqual(2400)
    expect(editorExtensionsSource).not.toContain("const CodeBlockView =")
    expect(editorExtensionsSource).not.toContain("const MermaidBlockView =")
    expect(editorExtensionsSource).not.toContain("const CodeLanguagePopover = styled.div`")
    expect(editorExtensionsSource).not.toContain("const MermaidPreviewCard = styled.div`")
    expect(codeBlockNodeViewSource).toContain("export const CodeBlockView =")
    expect(codeBlockNodeViewSource).toContain("export const CodeBlockEditorStyles =")
    expect(mermaidNodeViewSource).toContain("export const MermaidBlockView =")
    expect(mermaidNodeViewSource).toContain("export const MermaidEditorStyles =")
    expect(editorExtensionsSource).toContain('from "./calloutNodeView"')
    expect(editorExtensionsSource).toContain('from "./toggleNodeView"')
    expect(editorExtensionsSource).toContain('from "./linkCardNodeViews"')
    expect(editorExtensionsSource).toContain('from "./formulaNodeViews"')
    expect(editorExtensionsSource).toContain('from "./rawMarkdownNodeView"')
    expect(editorExtensionsSource).toContain('from "./resizableImageNodeView"')
    expect(editorExtensionsSource.split("\n").length).toBeLessThanOrEqual(900)
    expect(editorExtensionsSource).not.toContain("const CalloutBlockView =")
    expect(editorExtensionsSource).not.toContain("const ToggleBlockView =")
    expect(editorExtensionsSource).not.toContain("const LinkCardEditorView =")
    expect(editorExtensionsSource).not.toContain("const FormulaBlockView =")
    expect(editorExtensionsSource).not.toContain("const InlineFormulaView =")
    expect(editorExtensionsSource).not.toContain("const RawMarkdownBlockView =")
    expect(editorExtensionsSource).not.toContain("const ResizableImageView =")
    expect(editorExtensionsSource).not.toContain("const CalloutEditorWrapper = styled")
    expect(editorExtensionsSource).not.toContain("const ImageBlockWrapper = styled")
    expect(editorNodeViewSharedSource).toContain("export const selectDomTextContents =")
    expect(editorNodeViewSharedSource).toContain("export const useAutosizeTextarea =")
    expect(editorNodeViewSharedSource).toContain("export const useDebouncedAttributeCommit =")
    expect(calloutNodeViewSource).toContain("export const CalloutBlockView =")
    expect(calloutNodeViewSource).toContain("export const CalloutNodeViewStyles =")
    expect(toggleNodeViewSource).toContain("export const ToggleBlockView =")
    expect(toggleNodeViewSource).toContain("export const ToggleNodeViewStyles =")
    expect(linkCardNodeViewsSource).toContain("export const BookmarkBlock =")
    expect(linkCardNodeViewsSource).toContain("export const EmbedBlock =")
    expect(linkCardNodeViewsSource).toContain("export const FileBlock =")
    expect(linkCardNodeViewsSource).toContain("export const LinkCardNodeViewStyles =")
    expect(formulaNodeViewsSource).toContain("export const FormulaBlockView =")
    expect(formulaNodeViewsSource).toContain("export const InlineFormulaView =")
    expect(formulaNodeViewsSource).toContain("export const FormulaNodeViewStyles =")
    expect(rawMarkdownNodeViewSource).toContain("export const RawMarkdownBlockView =")
    expect(rawMarkdownNodeViewSource).toContain("export const RawMarkdownNodeViewStyles =")
    expect(resizableImageNodeViewSource).toContain("export const ResizableImageView =")
    expect(resizableImageNodeViewSource).toContain("export const ResizableImageNodeViewStyles =")
    expect(serializationSource).toContain('from "./serializationTypes"')
    expect(serializationSource).toContain('from "./serializationNodeFactory"')
    expect(serializationSource).toContain('from "./serializationMarkdownExport"')
    expect(serializationSource).toContain('from "./serializationHtmlImport"')
    expect(serializationSource).toContain('from "./serializationTableMetadata"')
    expect(serializationSource).toContain('from "./serializationInlineNormalization"')
    expect(serializationSource).toContain('from "./serializationLegacyRepair"')
    expect(serializationSource.split("\n").length).toBeLessThanOrEqual(700)
    expect(serializationSource).not.toContain("export const parseMarkdownToEditorDoc =")
    expect(serializationSource).not.toContain("export const serializeNode =")
    expect(serializationSource).not.toContain("const buildInlineContent =")
    expect(serializationSource).not.toContain("const normalizeTableRows =")
    expect(serializationSource).not.toContain("const restoreEditorDocCodeBlocksFromMarkdown =")
    expect(serializationTypesSource).toContain("export type BlockEditorDoc =")
    expect(serializationNodeFactorySource).toContain("export const createParagraphNode =")
    expect(serializationHtmlImportSource).toContain("export const parseMarkdownToEditorDoc =")
    expect(serializationHtmlImportSource).toContain("export const createCalloutNode =")
    expect(serializationMarkdownExportSource).toContain("export const serializeNode =")
    expect(serializationMarkdownExportSource).toContain("export const serializeEditorDocToMarkdown =")
    expect(serializationTableMetadataSource).toContain("export const createTableNode =")
    expect(serializationTableMetadataSource).toContain("export const serializeTable =")
    expect(serializationInlineNormalizationSource).toContain("export const buildInlineContent =")
    expect(serializationInlineNormalizationSource).toContain("export const serializeParagraphLikeNode =")
    expect(serializationLegacyRepairSource).toContain("export const restoreEditorDocCodeBlocksFromMarkdown =")
    expect(serializationLegacyRepairSource).toContain("export const detectUnsupportedMarkdownBlocks =")
    expect(blockEditorEngineLayersSource).toContain("export const BlockEditorToolbarLayer =")
    expect(blockEditorEngineLayersSource).toContain("export const BlockEditorQuickInsertLayer =")
    expect(blockEditorEngineLayersSource).toContain("export const BlockEditorSlashMenuLayer =")
    expect(blockEditorEngineLayersSource).toContain("BlockEditorFloatingBubbleLayer,")
    expect(blockEditorEngineLayersSource).toContain("BlockEditorBlockHandleLayer,")
    expect(blockEditorViewportLayerSource).toContain("export const BlockEditorFloatingBubbleLayer =")
    expect(blockEditorViewportLayerSource).toContain("export const BlockEditorBlockHandleLayer =")
    expect(blockEditorEngineLayersSource).toContain('data-testid="slash-menu"')
    expect(blockEditorViewportLayerSource).toContain('data-testid="editor-text-bubble-toolbar"')
    expect(blockEditorViewportLayerSource).toContain('"block-drag-handle"')
    expect(blockEditorEngineLayersSource).not.toContain("export const BlockEditorTableOverlayLayer =")
    expect(blockEditorEngineSource).not.toContain("<ToolbarActions>")
    expect(blockEditorEngineSource).not.toContain("<QuickInsertBar")
    expect(blockEditorEngineSource).not.toContain("<SlashMenu")
    expect(blockEditorEngineSource).not.toContain("<FloatingBubbleToolbar")
    expect(blockEditorEngineSource).not.toContain("<BlockHandleRail")
    expect(blockEditorEngineSource).not.toContain("<FloatingBlockMenu")
    expect(blockEditorEngineSource).not.toContain("const Shell = styled.div`")
    expect(blockEditorEngineSource).not.toContain("const Toolbar = styled.div`")
    expect(blockEditorEngineSource).not.toContain("const EditorViewport = styled.div`")
    expect(blockEditorEngineSource).not.toContain("const QuickInsertBar = styled.div`")
    expect(blockEditorBlockStylesSource).toContain("export const QuickInsertBar = styled.div`")
    expect(blockEditorEngineSource).not.toContain("Markdown 편집")
    expect(blockEditorEngineSource).not.toContain('label: "원문 블록"')
    expect(blockEditorEngineSource).not.toContain("buildStructuredInsertContent")
    expect(blockEditorEngineSource).not.toContain("insertRawMarkdownBlock")
    expect(blockEditorEngineSource).not.toContain("슬래시(`/`)나 `+` 없이도 자주 쓰는 블록을 바로 넣을 수 있습니다.")
    expect(blockEditorEditorSurfaceStylesSource).toContain(".aq-block-editor__content blockquote {")
    expect(blockEditorEditorSurfaceStylesSource).toContain("border-left: 4px solid")
    expect(blockEditorEditorSurfaceStylesSource).toContain("border-radius: 0;")
    expect(blockEditorEngineControllerSource).toContain('from "./blockSelectionModel"')
    expect(blockEditorEngineControllerSource).toContain('from "./nestedListItemModel"')
    expect(blockEditorEngineControllerSource).toContain('from "./useBlockEditorMarkdownCommit"')
    expect(blockEditorEngineSlashMenuSource).toContain('from "./slashMenuModel"')
    expect(blockEditorEngineControllerSource).toContain('from "./blockToolbarModel"')
    expect(blockEditorEngineControllerSource).toContain('from "./inlineToolbarModel"')
    expect(blockEditorEngineControllerSource).toContain('from "./useFloatingBubbleState"')
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
    expect(blockToolbarModelSource).toContain("export type BlockToolbarCommandId =")
    expect(blockToolbarModelSource).toContain("export const BLOCK_TOOLBAR_COMMANDS")
    expect(blockToolbarModelSource).toContain("export const BLOCK_INSERT_ACTIVE_NODE_NAMES")
    expect(blockToolbarModelSource).toContain("export const isBlockToolbarCommandActive")
    expect(blockToolbarModelSource).toContain("export const isToolbarBlockInsertActive")
    expect(blockToolbarModelSource).toContain("export const runBlockToolbarCommand")
    expect(inlineToolbarModelSource).toContain("export type InlineTextStyleOption =")
    expect(inlineToolbarModelSource).toContain("export type InlineMarkCommandId =")
    expect(inlineToolbarModelSource).toContain("export const INLINE_TEXT_STYLE_OPTIONS")
    expect(inlineToolbarModelSource).toContain("export const INLINE_MARK_COMMANDS")
    expect(inlineToolbarModelSource).toContain("export const getActiveInlineColor")
    expect(inlineToolbarModelSource).toContain("export const isInlineMarkCommandActive")
    expect(inlineToolbarModelSource).toContain("export const getActiveInlineTextStyleOption")
    expect(inlineToolbarModelSource).toContain("export const runInlineMarkCommand")
    expect(inlineToolbarModelSource).toContain("export const runInlineCode")
    expect(inlineToolbarModelSource).toContain("export const runInlineColor")
    expect(inlineToolbarModelSource).toContain("export const runInlineTextStyle")
    expect(blockEditorEngineInsertActionsSource).toContain('runInlineMarkCommand(editor, "bold")')
    expect(blockEditorEngineInsertActionsSource).toContain('runInlineMarkCommand(editor, "italic")')
    expect(blockEditorEngineInsertActionsSource).toContain('runInlineMarkCommand(editor, "strike")')
    expect(blockEditorEngineControllerSource).toContain('runBlockToolbarCommand(currentEditor, "heading-2")')
    expect(blockEditorEngineControllerSource).toContain('runBlockToolbarCommand(currentEditor, "heading-3")')
    expect(blockEditorEngineControllerSource).toContain('runBlockToolbarCommand(currentEditor, "ordered-list")')
    expect(blockEditorEngineControllerSource).toContain('runBlockToolbarCommand(currentEditor, "bullet-list")')
    expect(blockEditorEngineControllerSource).toContain('runBlockToolbarCommand(currentEditor, "quote")')
    expect(blockEditorEngineInsertActionsSource).toContain('runBlockToolbarCommand(editor, "heading-1")')
    expect(blockEditorEngineInsertActionsSource).toContain('runBlockToolbarCommand(editor, "bullet-list")')
    expect(blockEditorEngineInsertActionsSource).toContain("isToolbarBlockInsertActive(editor, item.id)")
    expect(blockEditorEngineInsertActionsSource).toContain("runInlineCode(editor)")
    expect(blockEditorEngineInsertActionsSource).toContain("runInlineColor(editor, color)")
    expect(blockEditorEngineSource).not.toContain("toggleBold().run()")
    expect(blockEditorEngineSource).not.toContain("toggleItalic().run()")
    expect(blockEditorEngineSource).not.toContain("toggleStrike().run()")
    expect(blockEditorEngineSource).not.toContain("toggleCode().run()")
    expect(blockEditorEngineSource).not.toContain("toggleHeading(")
    expect(blockEditorEngineSource).not.toContain("toggleBulletList().run()")
    expect(blockEditorEngineSource).not.toContain("toggleOrderedList().run()")
    expect(blockEditorEngineSource).not.toContain("toggleTaskList().run()")
    expect(blockEditorEngineSource).not.toContain("toggleBlockquote().run()")
    expect(blockEditorEngineSource).not.toContain('isActive("bold")')
    expect(blockEditorEngineSource).not.toContain('isActive("italic")')
    expect(blockEditorEngineSource).not.toContain('isActive("strike")')
    expect(blockEditorEngineSource).not.toContain('isActive("code")')
    expect(blockEditorEngineSource).not.toContain('isActive("heading"')
    expect(blockEditorEngineSource).not.toContain('isActive("bulletList")')
    expect(blockEditorEngineSource).not.toContain('isActive("orderedList")')
    expect(blockEditorEngineSource).not.toContain('isActive("taskList")')
    expect(blockEditorEngineSource).not.toContain('isActive("blockquote")')
    expect(blockEditorEngineSource).not.toContain('item.id === "ordered-list"')
    expect(blockEditorEngineSource).not.toContain('item.id === "checklist"')
    expect(blockEditorEngineSource).not.toContain('setMark("inlineColor"')
    expect(blockEditorEngineSource).not.toContain('unsetMark("inlineColor"')
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
    expect(blockEditorEngineSource).not.toMatch(/const\s+getTopLevelBlockIndexFromSelection\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+getTopLevelBlockPosition\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+getFirstEditableTextPositionInNode\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+getEditableTextPositionForTopLevelBlock\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+selectTopLevelBlockNode\s*=/)
    expect(blockEditorEngineSource).not.toMatch(/const\s+isTabBlockSelectionEligible\s*=/)
    expect(blockEditorEngineBlockSelectionUiSource).toContain('from "./blockHandleLayoutModel"')
    expect(blockEditorEngineBlockDragSource).toContain('from "./blockDragModel"')
    expect(blockEditorTableOverlayControllerSource).toContain('from "./useBlockEditorTableOverlayAxisDrag"')
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
    expect(blockSelectionModelSource).toContain("export const getTopLevelBlockIndexFromSelection")
    expect(blockSelectionModelSource).toContain("export const getTopLevelBlockPosition")
    expect(blockSelectionModelSource).toContain("export const getFirstEditableTextPositionInNode")
    expect(blockSelectionModelSource).toContain("export const getEditableTextPositionForTopLevelBlock")
    expect(blockSelectionModelSource).toContain("export const selectTopLevelBlockNode")
    expect(blockSelectionModelSource).toContain("export const isTabBlockSelectionEligible")
    expect(blockEditorEngineSource.split("\n").length).toBeLessThan(10480)
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
    const selectionRuleMatch = blockEditorEditorSurfaceStylesSource.match(/\.aq-block-editor__content ::selection\s*\{([^}]*)\}/)
    expect(selectionRuleMatch?.[1]).toBeTruthy()
    expect(selectionRuleMatch?.[1]).not.toMatch(/\bcolor\s*:/)
  })

  test("editor studio는 SSR 관리자 스냅샷을 hydration auth race 동안 유지한다", () => {
    const editorStudioSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
      "utf8"
    )
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

  test("contentHtml fallback은 두 줄짜리 빈 fenced code body도 pretty-code 원문으로 복구한다", () => {
    const staleContent = [
      "수정 대상 코드입니다.",
      "",
      "```ts",
      "```",
      "",
      "다음 문단입니다.",
    ].join("\n")
    const prettyCodeHtml = [
      '<div class="aq-code-block">',
      '<pre class="aq-code aq-pretty-pre">',
      '<code class="language-ts" data-raw-code="const answer = 42;&#10;return answer">',
      '</code>',
      '</pre>',
      '</div>',
    ].join("")

    expect(resolveEditorMetaSnapshot(staleContent, prettyCodeHtml).body).toContain(
      ["```ts", "const answer = 42;", "return answer", "```"].join("\n")
    )
  })

  test("초기 editor doc의 빈 코드블럭은 source markdown의 non-empty fence로 복구한다", () => {
    const sourceMarkdown = [
      "코드 본문 보존 대상입니다.",
      "",
      "```text",
      "로그인 -> 세션 생성 -> 이후 요청에서 세션 확인",
      "```",
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    return new Token(access, refresh);",
      "}",
      "```",
    ].join("\n")
    const staleDoc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "코드 본문 보존 대상입니다." }],
        },
        { type: "codeBlock", attrs: { language: "text" }, content: [] },
        { type: "codeBlock", attrs: { language: "java" }, content: [] },
      ],
    }

    const restored = restoreEditorDocCodeBlocksFromMarkdown(sourceMarkdown, staleDoc)

    expect(restored.changed).toBe(true)
    expect(restored.doc.content?.[1]?.content?.[0]?.text).toBe("로그인 -> 세션 생성 -> 이후 요청에서 세션 확인")
    expect(restored.doc.content?.[2]?.content?.[0]?.text).toContain("return new Token(access, refresh);")
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
    const editorStudioSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
      "utf8"
    )
    const editorStudioRuntimeSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioWorkspaceControllerRuntime.ts"),
      "utf8"
    )
    const revalidateApiSource = readFileSync(path.resolve(__dirname, "../src/pages/api/revalidate.ts"), "utf8")

    expect(editorStudioSource).toContain('import { useEditorStudioWorkspaceControllerRuntime } from "./useEditorStudioWorkspaceControllerRuntime"')
    expect(editorStudioRuntimeSource).toContain("await invalidatePublicPostReadCaches(queryClient, resolvedPostId || undefined)")
    expect(editorStudioRuntimeSource).toContain('const revalidateResponse = await fetch("/api/revalidate", {')
    expect(editorStudioRuntimeSource).toContain("paths: [toCanonicalPostPath(resolvedPostId)]")
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
    const blockEditorEngineControllerSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorEngineController.ts"),
      "utf8"
    )
    const blockEditorEngineStylesSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.styles.tsx"),
      "utf8"
    )
    const blockEditorEditorSurfaceStylesSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.editorSurfaceStyles.tsx"),
      "utf8"
    )
    const blockEditorTableStylesSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tableStyles.tsx"),
      "utf8"
    )
    const blockEditorEngineLayersSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.layers.tsx"),
      "utf8"
    )
    const blockEditorTableOverlayLayerSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/BlockEditorEngine.tableOverlayLayer.tsx"),
      "utf8"
    )
    const blockEditorTableOverlayControllerSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayController.ts"),
      "utf8"
    )
    const blockEditorTableOverlayDomAdapterSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayDomAdapter.ts"),
      "utf8"
    )
    const blockEditorTableOverlayAxisDragSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayAxisDrag.ts"),
      "utf8"
    )
    const blockEditorTableOverlayResizeSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayResize.ts"),
      "utf8"
    )
    const blockEditorTableOverlayCornerGrowSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayCornerGrow.ts"),
      "utf8"
    )
    const blockEditorTableOverlayMenuSource = readFileSync(
      path.resolve(__dirname, "../src/components/editor/useBlockEditorTableOverlayMenu.ts"),
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
    const tableWidthRuntimeModelPath = path.resolve(
      __dirname,
      "../src/components/editor/tableWidthRuntime.ts"
    )
    expect(existsSync(tableWidthRuntimeModelPath)).toBe(true)
    const tableWidthRuntimeSource = existsSync(tableWidthRuntimeModelPath)
      ? readFileSync(tableWidthRuntimeModelPath, "utf8")
      : ""
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
    const editorStudioRootSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
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
    const markdownRendererRootTableStylesSource = readFileSync(
      path.resolve(
        __dirname,
        "../src/libs/markdown/components/MarkdownRendererRootTableToggleStyles.ts"
      ),
      "utf8"
    )
    const markdownRendererSource = readFileSync(
      path.resolve(__dirname, "../src/libs/markdown/MarkdownRenderer.tsx"),
      "utf8"
    )
    const markdownTableRendererSource = readFileSync(
      path.resolve(__dirname, "../src/libs/markdown/MarkdownRendererTable.tsx"),
      "utf8"
    )

    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-column-drag-guide"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid={`table-column-resize-boundary-${index}`}')
    expect(blockEditorTableOverlayControllerSource).toContain('from "./useBlockEditorTableOverlayResize"')
    expect(blockEditorTableOverlayResizeSource).toContain('} from "./tableResizeInteractionModel"')
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
    expect(blockEditorTableOverlayControllerSource).toContain('} from "./tableFloatingUiModel"')
    expect(blockEditorTableOverlayDomAdapterSource).toContain("const getActiveTableRectFromDom = useCallback(")
    expect(blockEditorTableOverlayLayerSource).toContain('import { createPortal } from "react-dom"')
    expect(blockEditorTableOverlayLayerSource).toContain("const tableOverlay = (")
    expect(blockEditorTableOverlayLayerSource).toContain("createPortal(tableOverlay, document.body)")
    expect(blockEditorTableOverlayControllerSource).toContain("const TABLE_EDGE_HANDLE_INSET_PX = 6")
    expect(tableAffordanceModelSource).toContain("export const TABLE_EDGE_ADD_BUTTON_SIZE_PX = 24")
    expect(tableAffordanceModelSource).toContain("export const TABLE_CELL_MENU_BUTTON_SIZE_PX = 22")
    expect(tableAffordanceModelSource).toContain("export const TABLE_ADD_BAR_VIEWPORT_PADDING_PX = 8")
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-corner-grow-handle"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-corner-preview-outline"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-structure-menu-button"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-cell-menu-button"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-overflow-mode-normal"')
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-overflow-mode-wide"')
    expect(tableWidthModelSource).toContain('export const TABLE_OVERFLOW_MODE_WIDE = "wide"')
    expect(tableWidthModelSource).toContain("export const getTableOverflowMode = (")
    expect(tableWidthModelSource).toContain("export const shouldPromoteWideTableOverflowMode = (")
    expect(tableWidthModelSource).toContain("export const promotePastedWideTables = (")
    expect(tableWidthModelSource).toContain("export const computeNextTableColumnWidthsForResize = (")
    expect(tableWidthModelSource).toContain("export const didTableColumnResizeHitOverflowPolicy = (")
    expect(blockEditorEngineControllerSource).toContain('} from "./tableWidthModel"')
    expect(blockEditorEngineControllerSource).toContain('} from "./tableWidthRuntime"')
    expect(tableWidthRuntimeSource).toContain("export type TableWidthSnapshot = {")
    expect(tableWidthRuntimeSource).toContain("export const getCurrentEditorReadableWidthPx = (")
    expect(tableWidthRuntimeSource).toContain("export const rebalanceStructurallyChangedNormalTableWidths = (")
    expect(tableWidthRuntimeSource).toContain("export const normalizeTableWidthsToReadableBudget = (")
    expect(tableWidthRuntimeSource).toContain("export const promoteLargeTablesToWideOverflowMode = (")
    expect(tableWidthRuntimeSource).toContain("export const syncRenderedTableOverflowModes = (")
    expect(tableWidthRuntimeSource).toContain("export const normalizeRenderedTableWidthsToReadableBudget = (")
    expect(blockEditorEngineSource).not.toContain("const TABLE_OVERFLOW_MODE_WIDE =")
    expect(blockEditorEngineSource).not.toContain("const getTableOverflowMode =")
    expect(blockEditorEngineSource).not.toContain("const shouldPromoteWideTableOverflowMode =")
    expect(blockEditorEngineSource).not.toContain("const computeNextTableColumnWidthsForResize = (")
    expect(blockEditorEngineSource).not.toContain("const didTableColumnResizeHitOverflowPolicy = (")
    expect(blockEditorEngineSource).not.toContain("const getCurrentEditorReadableWidthPx =")
    expect(blockEditorEngineSource).not.toContain("const readColumnWidthFromCell =")
    expect(blockEditorEngineSource).not.toContain("const collectTableWidthSnapshots =")
    expect(blockEditorEngineSource).not.toContain("const normalizeTableWidthsToReadableBudget =")
    expect(blockEditorEngineSource).not.toContain("const promoteLargeTablesToWideOverflowMode =")
    expect(blockEditorEngineSource).not.toContain("const normalizeRenderedTableWidthsToReadableBudget =")
    expect(blockEditorEngineSource.split("\n").length).toBeLessThan(10750)
    expect(tableStructureModelSource).toContain("export const collectSimpleTableColumnCells = (")
    expect(tableStructureModelSource).toContain("export const buildReorderedSimpleTableNode = (")
    expect(tableStructureModelSource).toContain("export const canShrinkTableAxisAtEnd = (")
    expect(tableStructureModelSource).toContain("export const countShrinkableTableAxisAtEnd = (")
    expect(tableStructureModelSource).toContain("export const countShrinkableRenderedTableAxisAtEnd = (")
    expect(tableStructureModelSource).toContain("export const hasTableContextInResolvedPos = (")
    expect(tableStructureModelSource).toContain("export const isTableSelectionActive = (")
    expect(tableStructureModelSource).toContain("export const getActiveTableStructureState = (")
    expect(blockEditorEngineControllerSource).toContain('} from "./tableStructureModel"')
    expect(blockEditorEngineSource).not.toContain("const collectSimpleTableColumnCells = (")
    expect(blockEditorEngineSource).not.toContain("const buildReorderedSimpleTableNode = (")
    expect(blockEditorEngineSource).not.toContain("const canShrinkTableAxisAtEnd = (")
    expect(blockEditorEngineSource).not.toContain("const countShrinkableTableAxisAtEnd = (")
    expect(blockEditorEngineSource).not.toContain("const countShrinkableRenderedTableAxisAtEnd = (")
    expect(blockEditorEngineSource).not.toContain("const TABLE_CONTEXT_NODE_NAMES =")
    expect(blockEditorEngineSource).not.toContain("const hasTableContextInResolvedPos =")
    expect(blockEditorEngineSource).not.toContain("const isTableSelectionActive =")
    expect(blockEditorEngineSource).not.toContain("const getActiveTableStructureState =")
    expect(blockEditorEngineSource.split("\n").length).toBeLessThan(10600)
    expect(tablePasteModelSource).toContain("export const normalizeTableContextPasteText = (")
    expect(tablePasteModelSource).toContain("const normalizeTableContextPasteLine = (")
    expect(tablePasteModelSource).toContain("const isMarkdownTableRow = (")
    expect(blockEditorEngineControllerSource).toContain('from "./tablePasteModel"')
    expect(blockEditorEngineSource).not.toContain("const normalizeTableContextPasteText = (")
    expect(blockEditorEngineSource).not.toContain("const normalizeTableContextPasteLine = (")
    expect(blockEditorEngineSource).not.toContain("const isMarkdownTableRow = (")
    expect(tableRenderedDomModelSource).toContain("export const findActiveRenderedTable = (")
    expect(tableRenderedDomModelSource).toContain("export const resolveTableScopedSelectedCell = (")
    expect(tableRenderedDomModelSource).toContain("export const resolveActiveRenderedTableForFloatingUi = (")
    expect(tableRenderedDomModelSource).toContain("export const readRenderedColumnWidths = (")
    expect(blockEditorTableOverlayControllerSource).toContain('} from "./tableRenderedDomModel"')
    expect(blockEditorEngineSource).not.toContain("const findActiveRenderedTable = (")
    expect(blockEditorEngineSource).not.toContain("const resolveTableScopedSelectedCell = (")
    expect(blockEditorEngineSource).not.toContain("const resolveActiveRenderedTableForFloatingUi = (")
    expect(blockEditorEngineSource).not.toContain("const readRenderedColumnWidths = (")
    expect(blockEditorTableOverlayLayerSource).toContain('data-testid="table-row-drag-shadow"')
    expect(blockEditorTableOverlayLayerSource).toContain('"table-row-reorder-indicator"')
    expect(blockEditorTableOverlayLayerSource).toContain('"table-column-reorder-indicator"')
    expect(blockEditorTableStylesSource).toContain('const TableCellMenuButton = styled(TableHandleButton)`')
    expect(blockEditorTableOverlayMenuSource).toContain("const updateActiveTableOverflowMode = useCallback(")
    expect(blockEditorTableOverlayAxisDragSource).toContain("const reorderTableAxisAtPosition = useCallback(")
    expect(tableCornerGrowModelSource).toContain("export type TableCornerGrowState = {")
    expect(tableCornerGrowModelSource).toContain("export type TableCornerPreviewState = {")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerPreviewState = (")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerGrowStepMetrics = (")
    expect(tableCornerGrowModelSource).toContain("export const resolveTableCornerGrowStepMetricsFromDataset = (")
    expect(blockEditorTableOverlayControllerSource).toContain('from "./useBlockEditorTableOverlayCornerGrow"')
    expect(blockEditorTableOverlayCornerGrowSource).toContain('} from "./tableCornerGrowModel"')
    expect(blockEditorEngineSource).not.toContain("type TableCornerGrowState = {")
    expect(blockEditorEngineSource).not.toContain("type TableCornerPreviewState = {")
    expect(blockEditorEngineSource).not.toContain("const resolveTableCornerPreviewState = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const getTableCornerGrowStepMetrics = useCallback(")
    expect(blockEditorEngineSource).not.toContain("const getTableCornerGrowStepMetricsFromHandle = useCallback(")
    expect(blockEditorTableOverlayCornerGrowSource).toContain("const applyTableCornerGrowSteps = useCallback(")
    expect(blockEditorTableOverlayCornerGrowSource).toContain("const shrinkTableAxisAtEnd = useCallback(")
    expect(blockEditorTableOverlayAxisDragSource).toContain("const beginTableAxisDragFromPending = useCallback(")
    expect(blockEditorTableOverlayAxisDragSource).toContain("const startPendingTableAxisDrag = useCallback(")
    expect(blockEditorTableOverlayAxisDragSource).toContain("const selectTableAxisAtIndex = useCallback(")
    expect(tableStructureModelSource).toContain('overflowMode: getTableOverflowMode(tableNode)')
    expect(tableWidthModelSource).toContain("const maxActiveWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, safeBudget - otherColumnsWidth)")
    expect(blockEditorTableOverlayCornerGrowSource).toContain("const tableCornerGrowSuppressClickRef = useRef(false)")
    expect(blockEditorTableStylesSource).toContain('"grip" | "grow"')
    expect(blockEditorTableOverlayControllerSource).toContain("isCellMenuOpen,")
    expect(markdownRendererSource).toContain("MarkdownTableRenderer")
    expect(markdownTableRendererSource).toContain("const explicitTableWidth = useMemo(")
    expect(markdownTableRendererSource).toContain("minWidth: `${explicitTableWidth}px`")
    expect(markdownRendererRootSource).toContain("markdownRendererRootTableToggleStyles")
    expect(markdownRendererRootTableStylesSource).toContain("width: auto;")
    expect(markdownRendererRootTableStylesSource).toContain("max-width: none;")
    expect(blockEditorTableOverlayControllerSource).toContain("isRowMenuOpen,")
    expect(blockEditorTableOverlayControllerSource).toContain("isColumnMenuOpen,")
    expect(blockEditorTableOverlayLayerSource).toContain("activeTableStructureState.hasHeaderRow")
    expect(blockEditorTableOverlayLayerSource).toContain("activeTableStructureState.hasHeaderColumn")
    expect(blockEditorTableOverlayCornerGrowSource).toContain("tableCornerGrowStepMetrics: resolveTableCornerGrowStepMetrics(tableAffordanceGeometry)")
    expect(blockEditorTableOverlayLayerSource).toContain("data-column-step={tableCornerGrowStepMetrics.columnStepPx}")
    expect(blockEditorTableOverlayLayerSource).toContain("data-row-step={tableCornerGrowStepMetrics.rowStepPx}")
    expect(blockEditorTableOverlayLayerSource).toContain('aria-label="표 구조 메뉴"')
    expect(blockEditorTableOverlayLayerSource).toContain("페이지 너비에 맞춤")
    expect(blockEditorTableOverlayLayerSource).toContain("넓은 표")
    expect(blockEditorTableOverlayLayerSource).toContain("제목 행")
    expect(blockEditorTableOverlayLayerSource).toContain("제목 열")
    expect(tableAffordanceModelSource).toContain("export type TableAffordanceGeometry = {")
    expect(tableAffordanceModelSource).toContain("export type TableAffordanceVisibility = {")
    expect(tableAffordanceModelSource).toContain("export const INITIAL_TABLE_AFFORDANCE_GEOMETRY: TableAffordanceGeometry = {")
    expect(tableAffordanceModelSource).toContain("export const INITIAL_TABLE_AFFORDANCE_VISIBILITY: TableAffordanceVisibility = {")
    expect(tableAffordanceModelSource).toContain("export const resolveDesktopTableRailLayout = (")
    expect(blockEditorTableOverlayControllerSource).toContain('} from "./tableAffordanceModel"')
    expect(blockEditorEngineSource).not.toContain("type TableAffordanceGeometry = {")
    expect(blockEditorEngineSource).not.toContain("type TableAffordanceVisibility = {")
    expect(blockEditorEngineSource).not.toContain("const INITIAL_TABLE_AFFORDANCE_GEOMETRY: TableAffordanceGeometry = {")
    expect(blockEditorEngineSource).not.toContain("const INITIAL_TABLE_AFFORDANCE_VISIBILITY: TableAffordanceVisibility = {")
    expect(blockEditorTableOverlayControllerSource).toContain("const [tableAffordanceGeometry, setTableAffordanceGeometry] = useState<TableAffordanceGeometry>(")
    expect(blockEditorTableOverlayControllerSource).toContain(
      "const [tableAffordanceVisibility, setTableAffordanceVisibility] = useState<TableAffordanceVisibility>("
    )
    expect(blockEditorTableOverlayControllerSource).toContain("const tableAffordanceVisibilityRef = useRef(tableAffordanceVisibility)")
    expect(blockEditorEngineSource).not.toContain("type TableQuickRailState =")
    expect(blockEditorTableOverlayControllerSource).toContain("isTableStructureMenuOpen,")
    expect(blockEditorTableOverlayControllerSource).toContain("shouldShowColumnAddBar,")
    expect(blockEditorTableOverlayControllerSource).toContain("shouldShowRowAddBar,")
    expect(blockEditorTableOverlayDomAdapterSource).toContain(
      "findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)"
    )
    expect(blockEditorEditorSurfaceStylesSource).toContain("display: none !important;")
    expect(editorStudioRootSource).toContain('import { useEditorStudioPersistence } from "./useEditorStudioPersistence"')
    expect(editorStudioPersistenceSource).toContain("const currentPostContent = postContentLiveRef.current")
    expect(
      markdownRendererRootTableStylesSource.match(/table-layout: fixed;/g)?.length ?? 0
    ).toBeGreaterThanOrEqual(2)
    expect(markdownRendererRootTableStylesSource).not.toContain("table-layout: auto;")
  })

  test("table overlay controller는 책임별 module과 1000 line budget을 유지한다", () => {
    const controllerPath = path.resolve(
      __dirname,
      "../src/components/editor/useBlockEditorTableOverlayController.ts"
    )
    const controllerSource = readFileSync(controllerPath, "utf8")
    const moduleContracts = [
      {
        importPath: "./useBlockEditorTableOverlayDomAdapter",
        path: "../src/components/editor/useBlockEditorTableOverlayDomAdapter.ts",
        forbiddenInline: [
          "const focusElementWithoutScroll =",
          "const resolveDocPosSafe =",
          "const getTableCellFromTarget = useCallback(",
          "const getTableCellFromClientPoint = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorTableOverlayAxisDrag",
        path: "../src/components/editor/useBlockEditorTableOverlayAxisDrag.ts",
        forbiddenInline: [
          "const selectTableAxisAtIndex = useCallback(",
          "const clearPendingTableAxisDrag = useCallback(",
          "const beginTableAxisDragFromPending = useCallback(",
          "const startPendingTableAxisDrag = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorTableOverlayResize",
        path: "../src/components/editor/useBlockEditorTableOverlayResize.ts",
        forbiddenInline: [
          "const startTableRowResize = useCallback(",
          "const commitTableRowHeight = useCallback(",
          "const resizeTableColumnByIndex = useCallback(",
          "const startTableColumnRailResize = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorTableOverlayCornerGrow",
        path: "../src/components/editor/useBlockEditorTableOverlayCornerGrow.ts",
        forbiddenInline: [
          "const appendTableAxisAtEnd = useCallback(",
          "const shrinkTableAxisAtEnd = useCallback(",
          "const applyTableCornerGrowSteps = useCallback(",
          "const startTableCornerGrow = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorTableOverlayMenu",
        path: "../src/components/editor/useBlockEditorTableOverlayMenu.ts",
        forbiddenInline: [
          "const updateActiveTableCellAttrs = useCallback(",
          "const updateActiveTableOverflowMode = useCallback(",
          "const openSelectionAwareTableMenu = useCallback(",
          "const runTableMenuEditorAction = useCallback(",
        ],
      },
    ]

    expect(controllerSource.split("\n").length).toBeLessThanOrEqual(1000)
    moduleContracts.forEach((contract) => {
      expect(existsSync(path.resolve(__dirname, contract.path))).toBe(true)
      expect(controllerSource).toContain(`from "${contract.importPath}"`)
      contract.forbiddenInline.forEach((snippet) => {
        expect(controllerSource).not.toContain(snippet)
      })
    })
  })

  test("engine controller는 책임별 module과 1000 line budget을 유지한다", () => {
    const controllerPath = path.resolve(
      __dirname,
      "../src/components/editor/useBlockEditorEngineController.ts"
    )
    const controllerSource = readFileSync(controllerPath, "utf8")
    const moduleContracts = [
      {
        importPath: "./useBlockEditorEngineDocumentOps",
        path: "../src/components/editor/useBlockEditorEngineDocumentOps.ts",
        forbiddenInline: [
          "const insertDocContent = useCallback(",
          "const mutateTopLevelBlocks = useCallback(",
          "const transformCurrentParagraphViaSlash = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorEngineInsertActions",
        path: "../src/components/editor/useBlockEditorEngineInsertActions.ts",
        forbiddenInline: [
          "const insertCalloutBlock = useCallback(",
          "const blockInsertCatalog = useMemo<BlockInsertCatalogItem[]>",
          "const handleImageInputChange = async",
        ],
      },
      {
        importPath: "./useBlockEditorEngineSlashMenu",
        path: "../src/components/editor/useBlockEditorEngineSlashMenu.ts",
        forbiddenInline: [
          "const resolveSlashMenuState = useCallback(",
          "const handleSlashMenuKeyboard = useCallback(",
          "const stopSlashKeyboardEvent =",
        ],
      },
      {
        importPath: "./useBlockEditorEngineSelectionEffects",
        path: "../src/components/editor/useBlockEditorEngineSelectionEffects.ts",
        forbiddenInline: [
          "const syncBubble = () =>",
          "const handleDocumentSelectionChange = () =>",
          "const handleKeyDownCapture = (event: KeyboardEvent) =>",
        ],
      },
      {
        importPath: "./useBlockEditorEngineSelectionTools",
        path: "../src/components/editor/useBlockEditorEngineSelectionTools.ts",
        forbiddenInline: [
          "const findTopLevelBlockIndexFromTarget = useCallback(",
          "const resolveEffectiveSelectedListItemContext = useCallback(",
          "const clearNativeTextSelection = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorEngineBlockSelectionUi",
        path: "../src/components/editor/useBlockEditorEngineBlockSelectionUi.ts",
        forbiddenInline: [
          "const syncViewportHoverState = useCallback(",
          "useBlockSelectionLayoutEffect(() =>",
          "const handleViewportPointerMove = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorEngineBlockDrag",
        path: "../src/components/editor/useBlockEditorEngineBlockDrag.ts",
        forbiddenInline: [
          "const beginBlockDragFromPending = useCallback(",
          "const beginPendingNestedListItemHandleDrag = useCallback(",
          "const handleViewportDragOver = useCallback(",
        ],
      },
      {
        importPath: "./useBlockEditorEngineBlockMenu",
        path: "../src/components/editor/useBlockEditorEngineBlockMenu.ts",
        forbiddenInline: [
          "const moveBlockByStep = useCallback(",
          "const handleBlockHandleKeyDown = useCallback(",
          "const handleBlockDragHandlePointerDown = useCallback(",
        ],
      },
    ]

    expect(controllerSource.split("\n").length).toBeLessThanOrEqual(1000)
    moduleContracts.forEach((contract) => {
      const modulePath = path.resolve(__dirname, contract.path)
      expect(existsSync(modulePath)).toBe(true)
      const moduleSource = readFileSync(modulePath, "utf8")
      expect(moduleSource.split("\n").length, `${contract.path} should stay under 1000 lines`).toBeLessThanOrEqual(1000)
      const ownerPath =
        contract.importPath === "./useBlockEditorEngineBlockMenu"
          ? "../src/components/editor/useBlockEditorEngineBlockDrag.ts"
          : "../src/components/editor/useBlockEditorEngineController.ts"
      const ownerSource = readFileSync(path.resolve(__dirname, ownerPath), "utf8")
      expect(ownerSource).toContain(`from "${contract.importPath}"`)
      contract.forbiddenInline.forEach((snippet) => {
        expect(controllerSource).not.toContain(snippet)
      })
    })
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
    const editorStudioSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
      "utf8"
    )
    const editorStudioDraftLifecycleSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioDraftLifecycle.ts"),
      "utf8"
    )
    const editorStudioRoutingSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioRouting.ts"),
      "utf8"
    )
    const editorStudioRootViewSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx"),
      "utf8"
    )
    const editorStudioBootstrapSource = `${editorStudioSource}\n${editorStudioRootViewSource}`

    expect(editorStudioBootstrapSource).toContain("const isDedicatedNewEditorRoute = isDedicatedEditorRoute && router.pathname === EDITOR_NEW_ROUTE_PATH")
    expect(editorStudioBootstrapSource).toContain("const [isNewEditorBootstrapPending, setIsNewEditorBootstrapPending] = useState(isDedicatedNewEditorRoute)")
    expect(editorStudioDraftLifecycleSource).toContain("if (options?.redirectToEditor && tempPost.id) {")
    expect(editorStudioDraftLifecycleSource).toContain("await replaceRoute(router, destination)")
    expect(editorStudioRoutingSource).toContain("setIsNewEditorBootstrapPending(true)")
    expect(editorStudioBootstrapSource).toContain("(isNewEditorBootstrapPending || loadingKey === \"postTemp\")")
  })

  test("썸네일 편집 패널은 클립보드 이미지 붙여넣기 업로드 계약을 유지한다", () => {
    const editorStudioSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRoot.tsx"),
      "utf8"
    )
    const editorStudioThumbnailPanelsSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioThumbnailPanels.tsx"),
      "utf8"
    )
    const editorStudioPersistenceSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/useEditorStudioPersistence.ts"),
      "utf8"
    )
    const editorStudioModelSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRootModel.ts"),
      "utf8"
    )
    const editorStudioRootViewSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Admin/EditorStudioWorkspaceControllerRootView.tsx"),
      "utf8"
    )

    expect(editorStudioSource).toContain('from "./EditorStudioWorkspaceControllerRootModel"')
    expect(editorStudioModelSource).toContain("const extractImageFileFromClipboard = (clipboardData: DataTransfer | null): File | null => {")
    expect(editorStudioRootViewSource).toContain("onThumbnailPaste={handleThumbnailPaste}")
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

  test("editor studio workspace panel props는 하위 view contract로 분리된다", () => {
    const routeAdminDir = path.resolve(__dirname, "../src/routes/Admin")
    const targetFiles = [
      "EditorStudioPostListPanel.tsx",
      "EditorStudioPublishModal.tsx",
      "EditorStudioComposeWritingSurface.tsx",
      "EditorStudioDedicatedEditorSurface.tsx",
    ]
    const partFiles = [
      "EditorStudioPostListPanelParts.tsx",
      "EditorStudioPostListPanelStyles.tsx",
      "EditorStudioPostListActionStyles.tsx",
      "EditorStudioPublishModalParts.tsx",
      "EditorStudioPublishModalStyles.tsx",
      "EditorStudioComposeWritingSurfaceParts.tsx",
      "EditorStudioDedicatedEditorSurfaceParts.tsx",
    ]

    for (const partFile of partFiles) {
      expect(existsSync(path.join(routeAdminDir, partFile)), `${partFile} should own extracted panel views`).toBe(true)
    }

    for (const targetFile of targetFiles) {
      const source = readFileSync(path.join(routeAdminDir, targetFile), "utf8")
      expect(source.split("\n").length, `${targetFile} should stay under the panel root budget`).toBeLessThanOrEqual(600)
      expect(source).not.toContain("apiFetch(")
      expect(source).not.toContain("run(")
      expect(source).not.toContain("setPost")
      expect(source).not.toContain("WriterEditorHost")
    }

    for (const partFile of partFiles) {
      const source = readFileSync(path.join(routeAdminDir, partFile), "utf8")
      expect(source.split("\n").length, `${partFile} should stay under the companion budget`).toBeLessThanOrEqual(600)
    }

    const postListSource = readFileSync(path.join(routeAdminDir, "EditorStudioPostListPanel.tsx"), "utf8")
    const postListPartsSource = readFileSync(path.join(routeAdminDir, "EditorStudioPostListPanelParts.tsx"), "utf8")
    expect(postListSource).toContain('from "./EditorStudioPostListPanelParts"')
    expect(postListPartsSource).toContain("export const EditorStudioPostListTable =")
    expect(postListPartsSource).toContain("export const EditorStudioPostListMobileCards =")

    const publishModalSource = readFileSync(path.join(routeAdminDir, "EditorStudioPublishModal.tsx"), "utf8")
    const publishModalPartsSource = readFileSync(path.join(routeAdminDir, "EditorStudioPublishModalParts.tsx"), "utf8")
    expect(publishModalSource).toContain('from "./EditorStudioPublishModalParts"')
    expect(publishModalPartsSource).toContain("export const EditorStudioPublishVisibilitySection =")
    expect(publishModalPartsSource).toContain("export const EditorStudioPublishPreviewCard =")
    expect(publishModalPartsSource).toContain("export const EditorStudioPublishCardSettings =")

    const composeSurfaceSource = readFileSync(path.join(routeAdminDir, "EditorStudioComposeWritingSurface.tsx"), "utf8")
    const composeSurfacePartsSource = readFileSync(
      path.join(routeAdminDir, "EditorStudioComposeWritingSurfaceParts.tsx"),
      "utf8"
    )
    expect(composeSurfaceSource).toContain('from "./EditorStudioComposeWritingSurfaceParts"')
    expect(composeSurfacePartsSource).toContain("export const EditorStudioComposeHeaderSection =")
    expect(composeSurfacePartsSource).toContain("export const EditorStudioComposeMetadataSection =")
    expect(composeSurfacePartsSource).toContain("export const EditorStudioComposeBodySection =")
    expect(composeSurfacePartsSource).toContain("export const EditorStudioComposeFooterBar =")

    const dedicatedSurfaceSource = readFileSync(path.join(routeAdminDir, "EditorStudioDedicatedEditorSurface.tsx"), "utf8")
    const dedicatedSurfacePartsSource = readFileSync(
      path.join(routeAdminDir, "EditorStudioDedicatedEditorSurfaceParts.tsx"),
      "utf8"
    )
    expect(dedicatedSurfaceSource).toContain('from "./EditorStudioDedicatedEditorSurfaceParts"')
    expect(dedicatedSurfacePartsSource).toContain("export const EditorStudioDedicatedTopBar =")
    expect(dedicatedSurfacePartsSource).toContain("export const EditorStudioDedicatedMetaSection =")
    expect(dedicatedSurfacePartsSource).toContain("export const EditorStudioDedicatedCanvasSection =")
  })
})
