import type { Editor as TiptapEditor } from "@tiptap/core"
import { useEditor } from "@tiptap/react"
import { useCallback, useMemo, useRef } from "react"
import {
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
} from "./serialization"
import {
  captureEmptyEditorHistoryState,
  type EditorHistorySnapshot,
} from "./editorHistoryModel"
import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import { shouldSuppressStickySelectionScrollToSelection } from "./editorScrollSelectionGuard"
import {
  type BlockInsertCatalogItem,
  createWriterEditorExtensions,
} from "./writerEditorPreset"
import { TABLE_WIDTH_BUDGET_META_KEY } from "./tableWidthModel"
import {
  normalizeRenderedTableWidthsToReadableBudget,
  normalizeTableWidthsToReadableBudget,
  promoteLargeTablesToWideOverflowMode,
  rebalanceStructurallyChangedNormalTableWidths,
  syncRenderedTableOverflowModes,
} from "./tableWidthRuntime"
import { useBlockEditorMarkdownCommit } from "./useBlockEditorMarkdownCommit"
import { recordEditorCommitDurationForRuntimeGuard } from "./editorRuntimeGuardModel"
import { useBlockEditorTableOverlayController } from "./useBlockEditorTableOverlayController"
import { useBlockEditorEngineBlockDrag } from "./useBlockEditorEngineBlockDrag"
import { useBlockEditorEngineBlockSelectionUi } from "./useBlockEditorEngineBlockSelectionUi"
import {
  downgradeDisabledFeatureNodes,
  normalizeTableColorInputValue,
  useBlockEditorEngineDocumentOps,
} from "./useBlockEditorEngineDocumentOps"
import {
  handleBlockEditorEngineKeyDown,
  handleBlockEditorEnginePaste,
} from "./useBlockEditorEngineControllerEditorHandlers"
import { useBlockEditorEngineControllerState } from "./useBlockEditorEngineControllerState"
import { useBlockEditorEngineInsertActions } from "./useBlockEditorEngineInsertActions"
import { useBlockEditorEngineSelectionEffects } from "./useBlockEditorEngineSelectionEffects"
import { useBlockEditorEngineSelectionTools } from "./useBlockEditorEngineSelectionTools"
import { useBlockEditorEngineSlashMenu } from "./useBlockEditorEngineSlashMenu"

export const useBlockEditorEngineController = ({
  value,
  onChange,
  onUploadImage,
  onUploadFile,
  disabled = false,
  className,
  preview,
  enableMermaidBlocks = false,
  onQaActionsReady,
}: BlockEditorEngineProps) => {
  const isWriterSurface =
    typeof className === "string" &&
    className.includes("aq-block-editor--writer-surface")
  const {
    attachmentFileInputRef,
    blockHandleRailMetricsRef,
    blockHandleRailRef,
    blockHandleState,
    blockMenuState,
    blockSelectionLayoutRectCacheRef,
    blockSelectionOverlayState,
    bubbleInlineColorMenuRef,
    bubbleState,
    bubbleTextStyleMenuRef,
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    cancelHoveredBlockClear,
    clickedBlockIndex,
    dragGhostPosition,
    draggedBlockState,
    draggedNestedListItemState,
    dropIndicatorState,
    editorRef,
    hoveredBlockIndex,
    hoveredListItemContext,
    imageFileInputRef,
    inlineColorMenuRef,
    isBubbleInlineColorMenuOpen,
    isBubbleTextStyleMenuOpen,
    isCoarsePointer,
    isInlineColorMenuOpen,
    isPreviewOpen,
    isSlashImeComposing,
    isSlashMenuOpen,
    isToolbarMoreOpen,
    keyboardBlockSelectionStickyRef,
    mouseTextSelectionInProgressRef,
    nestedListItemDropIndicatorState,
    pendingAttachmentInsertIndexRef,
    pendingBlockDragCleanupRef,
    pendingBlockDragRef,
    pendingImageInsertIndexRef,
    pendingNestedListItemHandleDragCleanupRef,
    pendingNestedListItemHandleDragRef,
    recentSlashItemIds,
    scheduleBubbleHide,
    scheduleHoveredBlockClear,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectedBlockNodeIndexRef,
    selectedListItemContext,
    selectedListItemContextRef,
    selectedSlashIndex,
    selectionTick,
    selectionUiSignatureRef,
    setBlockHandleState,
    setBlockMenuState,
    setBlockSelectionOverlayState,
    setBubbleState,
    setClickedBlockIndex,
    setDragGhostPosition,
    setDraggedBlockState,
    setDraggedNestedListItemState,
    setDropIndicatorState,
    setHoveredBlockIndex,
    setHoveredListItemContext,
    setIsBubbleInlineColorMenuOpen,
    setIsBubbleTextStyleMenuOpen,
    setIsInlineColorMenuOpen,
    setIsPreviewOpen,
    setIsSlashImeComposing,
    setIsSlashMenuOpen,
    setIsToolbarMoreOpen,
    setNestedListItemDropIndicatorState,
    setRecentSlashItemIds,
    setSelectedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    setSelectedSlashIndex,
    setSelectionTick,
    setSlashInteractionMode,
    setSlashMenuState,
    setSlashQuery,
    setTextSelectionBlockIndex,
    skipNextPointerDownSelectionClearRef,
    slashInteractionMode,
    slashMenuRef,
    slashMenuState,
    slashPointerResumeAtRef,
    slashQuery,
    syncBubbleOnMouseUpRef,
    tableViewportBudgetNormalizeFrameRef,
    textSelectionBlockIndex,
    viewportRef,
  } = useBlockEditorEngineControllerState()

  const cancelScheduledTableViewportBudgetNormalize = useCallback(() => {
    if (
      tableViewportBudgetNormalizeFrameRef.current !== null &&
      typeof window !== "undefined"
    ) {
      window.cancelAnimationFrame(tableViewportBudgetNormalizeFrameRef.current)
      tableViewportBudgetNormalizeFrameRef.current = null
    }
  }, [tableViewportBudgetNormalizeFrameRef])

  const scheduleTableViewportBudgetNormalize = useCallback(
    (nextEditor: TiptapEditor) => {
      if (typeof window === "undefined") return
      cancelScheduledTableViewportBudgetNormalize()
      tableViewportBudgetNormalizeFrameRef.current =
        window.requestAnimationFrame(() => {
          tableViewportBudgetNormalizeFrameRef.current = null
          const targetEditor = editorRef.current ?? nextEditor
          syncRenderedTableOverflowModes(targetEditor)
          normalizeRenderedTableWidthsToReadableBudget(targetEditor)
        })
    },
    [
      cancelScheduledTableViewportBudgetNormalize,
      editorRef,
      tableViewportBudgetNormalizeFrameRef,
    ]
  )

  const {
    cancelPendingMarkdownCommit,
    discardPendingMarkdownCommit,
    flushEditorOnDestroy,
    flushPendingMarkdownCommit,
    hasExternalMarkdownChanged,
    markCommittedDoc,
    scheduleMarkdownCommit,
    syncSerializedDoc,
  } = useBlockEditorMarkdownCommit({ value, onChange })
  const initialDocRef = useRef(
    restoreEditorDocCodeBlocksFromMarkdown(
      value,
      downgradeDisabledFeatureNodes(
        parseMarkdownToEditorDoc(value),
        enableMermaidBlocks
      )
    ).doc
  )
  const emptyHistoryStateRef = useRef<EditorHistorySnapshot | null>(null)

  const {
    createInitialTableNode,
    focusNearestInsertedCalloutBody,
    focusTopLevelBlock,
    getContentRoot,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    insertBlocksAtIndex,
    insertDocContent,
    isSelectionInEmptyParagraph,
    mutateTopLevelBlocks,
    replaceEditorDocFromExternalValue,
    replaceEmptyCalloutBodyWithPlainText,
    syncSelectedBlockNodeSurface,
    transformCurrentParagraphViaSlash,
  } = useBlockEditorEngineDocumentOps({
    discardPendingMarkdownCommit,
    editorRef,
    emptyHistoryStateRef,
    enableMermaidBlocks,
    markCommittedDoc,
    syncSerializedDoc,
    viewportRef,
  })

  const {
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    findNestedListItemContextByClientPosition,
    findNestedListItemContextFromTarget,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    isTopLevelBlockHandleEligible,
    promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction,
    resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextByIndices,
    resolveNestedListItemDropIndicatorByClientY,
  } = useBlockEditorEngineSelectionTools({
    clearSelectedBlockNodeIndex: setSelectedBlockNodeIndex,
    editorRef,
    getContentRoot,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    keyboardBlockSelectionStickyRef,
    selectedBlockNodeIndexRef,
    selectedListItemContext,
    selectedListItemContextRef,
    setClickedBlockIndex,
    setSelectedBlockIndex,
    setSelectedListItemContext,
    setSelectionTick,
    setTextSelectionBlockIndex,
    syncSelectedBlockNodeSurface,
    viewportRef,
  })

  const editorExtensions = useMemo(
    () => createWriterEditorExtensions({ enableMermaidBlocks }),
    [enableMermaidBlocks]
  )

  const editor = useEditor({
    immediatelyRender: false,
    extensions: editorExtensions,
    content: initialDocRef.current,
    // Keep editor initialization deterministic so table nodeView/plugin path
    // does not diverge by first-render loading state.
    editable: true,
    onCreate: ({ editor: createdEditor }) => {
      editorRef.current = createdEditor
      emptyHistoryStateRef.current =
        captureEmptyEditorHistoryState(createdEditor)
      createdEditor.setEditable(!disabled)
      promoteLargeTablesToWideOverflowMode(createdEditor)
      scheduleTableViewportBudgetNormalize(createdEditor)
    },
    onTransaction: ({ editor: nextEditor, transaction }) => {
      if (!transaction.docChanged) return
      if (transaction.getMeta(TABLE_WIDTH_BUDGET_META_KEY)) return
      if (promoteLargeTablesToWideOverflowMode(nextEditor)) {
        scheduleTableViewportBudgetNormalize(nextEditor)
        return
      }
      if (
        rebalanceStructurallyChangedNormalTableWidths(
          nextEditor,
          transaction.before
        )
      ) {
        scheduleTableViewportBudgetNormalize(nextEditor)
        return
      }
      normalizeTableWidthsToReadableBudget(nextEditor)
      scheduleTableViewportBudgetNormalize(nextEditor)
    },
    onDestroy: () => {
      cancelScheduledTableViewportBudgetNormalize()
      flushEditorOnDestroy(editorRef.current)
      editorRef.current = null
    },
    editorProps: {
      handleScrollToSelection: (view) =>
        shouldSuppressStickySelectionScrollToSelection(
          view,
          selectedBlockNodeIndexRef.current,
          keyboardBlockSelectionStickyRef.current
        ),
      attributes: {
        class: "aq-block-editor__content",
        "data-testid": "block-editor-prosemirror",
      },
      handleKeyDown: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        return handleBlockEditorEngineKeyDown({
          currentEditor,
          event,
          findTopLevelBlockIndexFromTarget,
          hoveredBlockIndex,
          insertFormulaBlock,
          insertInlineFormula,
          keyboardBlockSelectionStickyRef,
          mutateTopLevelBlocks,
          openLinkPrompt,
          promoteTopLevelBlockSelection,
          selectedBlockNodeIndexRef,
          setBlockMenuState,
          setSelectedBlockNodeIndex,
          syncSelectedBlockNodeSurface,
        })
      },
      handlePaste: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        return handleBlockEditorEnginePaste({
          currentEditor,
          enableMermaidBlocks,
          event,
          insertCardBlockFromUrl,
          insertDocContent,
          isHttpUrl,
          isSelectionInEmptyParagraph,
          onUploadFile,
          onUploadImage,
          replaceEmptyCalloutBodyWithPlainText,
        })
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const commitStartedAt =
        typeof window !== "undefined" ? performance.now() : 0
      scheduleMarkdownCommit(nextEditor)
      if (typeof window !== "undefined") {
        recordEditorCommitDurationForRuntimeGuard(
          performance.now() - commitStartedAt
        )
      }
    },
  })

  const tableOverlayController = useBlockEditorTableOverlayController({
    clearStickyTopLevelBlockSelection,
    editor,
    editorRef,
    isCoarsePointer,
    selectionTick,
    setSelectionTick,
    syncSelectedBlockNodeSurface,
    viewportRef,
  })
  const {
    cancelTableQuickRailHide,
    clearHoveredTableCellMenuLayout,
    clearTrackedTableHover,
    clearWindowTextSelection,
    currentTableAxisSelection,
    focusRenderedTableCell,
    getTableCellFromClientPoint,
    handleTableViewportPointerLeave,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    isTableAffordanceVisible,
    isTableAxisDragActive,
    isTableColumnRailResizeActive,
    isTableMode,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget,
    isTableStructuralSelection,
    isTopLevelInsertBlockedByTableUi,
    layerProps: tableOverlayLayerProps,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    scheduleTableQuickRailHide,
    selectCurrentTableAxis,
    selectTableColumnByIndex,
    setTableQuickRailHovered,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    startTableRowResize,
    syncTableQuickRailFromElement,
    syncTrackedHoveredTableCellMenuLayout,
    tableMenuState,
    tryStartTableColumnResizeFromDomHandle,
    updateActiveTableCellAttrs,
  } = tableOverlayController

  useBlockEditorEngineSelectionEffects({
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    cancelHoveredBlockClear,
    cancelPendingMarkdownCommit,
    cancelTableQuickRailHide,
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    clearWindowTextSelection,
    discardPendingMarkdownCommit,
    disabled,
    editor,
    editorRef,
    enableMermaidBlocks,
    findNestedListItemContextFromTarget,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    flushPendingMarkdownCommit,
    getContentRoot,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    hasExternalMarkdownChanged,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    hoveredBlockIndex,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    isTableColumnRailResizeActive,
    keyboardBlockSelectionStickyRef,
    mouseTextSelectionInProgressRef,
    promoteTopLevelBlockSelection,
    replaceEditorDocFromExternalValue,
    resolveActiveListItemInteraction,
    resolveEffectiveSelectedListItemContext,
    scheduleBubbleHide,
    scheduleTableQuickRailHide,
    selectedBlockNodeIndex,
    selectedBlockNodeIndexRef,
    selectedListItemContext,
    selectionTick,
    selectionUiSignatureRef,
    setBubbleState,
    setClickedBlockIndex,
    setSelectedBlockIndex,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    setSelectionTick,
    setTextSelectionBlockIndex,
    skipNextPointerDownSelectionClearRef,
    slashMenuState,
    syncBubbleOnMouseUpRef,
    syncSelectedBlockNodeSurface,
    syncTableQuickRailFromElement,
    tableMenuState,
    tryStartTableColumnResizeFromDomHandle,
    value,
  })

  const closeSlashMenu = useCallback(
    (restoreFocus = false) => {
      setIsSlashMenuOpen(false)
      setSlashQuery("")
      setSelectedSlashIndex(0)
      setSlashMenuState(null)

      if (restoreFocus) {
        requestAnimationFrame(() => {
          editor?.chain().focus().run()
        })
      }
    },
    [
      editor,
      setIsSlashMenuOpen,
      setSelectedSlashIndex,
      setSlashMenuState,
      setSlashQuery,
    ]
  )

  const insertActions = useBlockEditorEngineInsertActions({
    attachmentFileInputRef,
    closeSlashMenu,
    createInitialTableNode,
    disabled,
    editor,
    editorRef,
    enableMermaidBlocks,
    focusNearestInsertedCalloutBody,
    imageFileInputRef,
    insertBlocksAtIndex,
    insertDocContent,
    isSelectionInEmptyParagraph,
    isTableMode,
    isTopLevelInsertBlockedByTableUi,
    mutateTopLevelBlocks,
    onQaActionsReady,
    onUploadFile,
    onUploadImage,
    pendingAttachmentInsertIndexRef,
    pendingImageInsertIndexRef,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    selectCurrentTableAxis,
    selectTableColumnByIndex,
    selectionTick,
    setIsBubbleInlineColorMenuOpen,
    setIsBubbleTextStyleMenuOpen,
    setIsInlineColorMenuOpen,
    setIsToolbarMoreOpen,
    updateActiveTableCellAttrs,
  })
  const {
    blockInsertCatalog,
    insertCardBlockFromUrl,
    insertInlineFormula,
    insertFormulaBlock,
    isHttpUrl,
    openLinkPrompt,
  } = insertActions

  const slashMenu = useBlockEditorEngineSlashMenu({
    blockInsertCatalog,
    closeSlashMenu,
    editor,
    editorRef,
    isSlashImeComposing,
    isSlashMenuOpen,
    recentSlashItemIds,
    selectedSlashIndex,
    setIsSlashMenuOpen,
    setRecentSlashItemIds,
    setSelectedSlashIndex,
    setSlashInteractionMode,
    setSlashMenuState,
    setSlashQuery,
    slashMenuRef,
    slashMenuState,
    slashPointerResumeAtRef,
    slashQuery,
    transformCurrentParagraphViaSlash,
  })
  const {
    applyResolvedSlashMenuState,
    resolveSlashMenuState,
    syncSlashMenuWhileComposing,
  } = slashMenu

  const blockSelectionUi = useBlockEditorEngineBlockSelectionUi({
    blockHandleRailMetricsRef,
    blockHandleState,
    blockSelectionLayoutRectCacheRef,
    cancelHoveredBlockClear,
    cancelTableQuickRailHide,
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    clearTrackedTableHover,
    clickedBlockIndex,
    currentTableAxisSelection,
    draggedBlockState,
    dropIndicatorState,
    editor,
    editorRef,
    findNestedListItemContextByClientPosition,
    findNestedListItemContextFromTarget,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    focusRenderedTableCell,
    getContentRoot,
    getTableCellFromClientPoint,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    handleTableViewportPointerLeave,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    hoveredBlockIndex,
    hoveredListItemContext,
    isCoarsePointer,
    isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture,
    isTableAffordanceVisible,
    isTableAxisDragActive,
    isTableColumnRailResizeActive,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget,
    isTableStructuralSelection,
    isTopLevelBlockHandleEligible,
    isWriterSurface,
    keyboardBlockSelectionStickyRef,
    mutateTopLevelBlocks,
    promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction,
    resolveEffectiveSelectedListItemContext,
    scheduleHoveredBlockClear,
    scheduleTableQuickRailHide,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectedBlockNodeIndexRef,
    selectionTick,
    setBlockHandleState,
    setBlockMenuState,
    setBlockSelectionOverlayState,
    setClickedBlockIndex,
    setHoveredBlockIndex,
    setHoveredListItemContext,
    setSelectedBlockNodeIndex,
    setSelectedListItemContext,
    setSelectionTick,
    setTableQuickRailHovered,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    skipNextPointerDownSelectionClearRef,
    slashMenuState,
    startTableRowResize,
    syncSelectedBlockNodeSurface,
    syncTableQuickRailFromElement,
    syncTrackedHoveredTableCellMenuLayout,
    tableMenuState,
    textSelectionBlockIndex,
    viewportRef,
  })

  const blockDrag = useBlockEditorEngineBlockDrag({
    blockHandleState,
    blockMenuState,
    cancelHoveredBlockClear,
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    draggedBlockState,
    draggedNestedListItemState,
    editor,
    editorRef,
    findNestedListItemContextFromTarget,
    flushPendingMarkdownCommit,
    getTopLevelBlockElementByIndex,
    getTopLevelBlockElements,
    hoveredListItemContext,
    isTableStructuralSelection,
    mutateTopLevelBlocks,
    pendingBlockDragCleanupRef,
    pendingBlockDragRef,
    pendingNestedListItemHandleDragCleanupRef,
    pendingNestedListItemHandleDragRef,
    promoteTopLevelBlockSelection,
    resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextByIndices,
    resolveNestedListItemDropIndicatorByClientY,
    scheduleHoveredBlockClear,
    selectedListItemContextRef,
    setBlockMenuState,
    setDragGhostPosition,
    setDraggedBlockState,
    setDraggedNestedListItemState,
    setDropIndicatorState,
    setHoveredBlockIndex,
    setHoveredListItemContext,
    setNestedListItemDropIndicatorState,
    setSelectedListItemContext,
    setSelectionTick,
  })

  const isSlashActionDisabled = useCallback(
    (action: BlockInsertCatalogItem) =>
      Boolean(
        disabled ||
          action.disabled ||
          (((editorRef.current ?? editor)?.isActive("tableCell") ||
            (editorRef.current ?? editor)?.isActive("tableHeader")) &&
            action.section === "structure")
      ),
    [disabled, editor, editorRef]
  )

  const handleEditorViewportCompositionStart = useCallback(() => {
    setIsSlashImeComposing(true)
  }, [setIsSlashImeComposing])

  const handleEditorViewportCompositionUpdate = useCallback(() => {
    requestAnimationFrame(() => {
      syncSlashMenuWhileComposing()
    })
  }, [syncSlashMenuWhileComposing])

  const handleEditorViewportCompositionEnd = useCallback(() => {
    setIsSlashImeComposing(false)
    requestAnimationFrame(() => {
      applyResolvedSlashMenuState(resolveSlashMenuState())
    })
  }, [
    applyResolvedSlashMenuState,
    resolveSlashMenuState,
    setIsSlashImeComposing,
  ])

  return {
    ...insertActions,
    ...slashMenu,
    ...blockSelectionUi,
    ...blockDrag,
    attachmentFileInputRef,
    blockHandleRailRef,
    blockHandleState,
    blockMenuState,
    blockSelectionOverlayState,
    bubbleInlineColorMenuRef,
    bubbleState,
    bubbleTextStyleMenuRef,
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    disabled,
    dragGhostPosition,
    draggedBlockState,
    draggedNestedListItemState,
    dropIndicatorState,
    editor,
    handleEditorViewportCompositionEnd,
    handleEditorViewportCompositionStart,
    handleEditorViewportCompositionUpdate,
    imageFileInputRef,
    inlineColorMenuRef,
    isBubbleInlineColorMenuOpen,
    isBubbleTextStyleMenuOpen,
    isCoarsePointer,
    isInlineColorMenuOpen,
    isPreviewOpen,
    isSlashActionDisabled,
    isSlashMenuOpen,
    isToolbarMoreOpen,
    nestedListItemDropIndicatorState,
    normalizeTableColorInputValue,
    preview,
    scheduleBubbleHide,
    selectedListItemContext,
    selectedSlashIndex,
    setIsBubbleInlineColorMenuOpen,
    setIsBubbleTextStyleMenuOpen,
    setIsInlineColorMenuOpen,
    setIsPreviewOpen,
    setIsToolbarMoreOpen,
    slashInteractionMode,
    slashMenuRef,
    slashMenuState,
    slashQuery,
    tableOverlayLayerProps,
    viewportRef,
  }
}
