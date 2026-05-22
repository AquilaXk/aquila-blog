import type { Editor as TiptapEditor } from "@tiptap/core"
import { useEditor } from "@tiptap/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  deleteTopLevelBlockAt,
} from "./blockDocumentOps"
import {
  createFileBlockNode,
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
  type BlockEditorDoc,
} from "./serialization"
import {
  convertHtmlToMarkdown,
  extractPlainTextFromHtml,
  looksLikeStructuredMarkdownDocument,
  normalizeStructuredMarkdownClipboard,
} from "src/libs/markdown/htmlToMarkdown"
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
import {
  TABLE_OVERFLOW_MODE_WIDE,
  TABLE_WIDTH_BUDGET_META_KEY,
  promotePastedWideTables,
} from "./tableWidthModel"
import {
  getCurrentEditorReadableWidthPx,
  normalizeRenderedTableWidthsToReadableBudget,
  normalizeTableWidthsToReadableBudget,
  promoteLargeTablesToWideOverflowMode,
  rebalanceStructurallyChangedNormalTableWidths,
  syncRenderedTableOverflowModes,
} from "./tableWidthRuntime"
import {
  isTableSelectionActive,
} from "./tableStructureModel"
import { normalizeTableContextPasteText } from "./tablePasteModel"
import {
  getTopLevelBlockIndexFromSelection,
  isTabBlockSelectionEligible,
  type BlockSelectionOverlayState,
  type TopLevelBlockHandleState,
} from "./blockSelectionModel"
import {
  type DraggedBlockState,
  type DropIndicatorState,
  type PendingBlockDragState,
  createHiddenDropIndicatorState,
} from "./blockDragModel"
import {
  type NestedListItemContext,
} from "./nestedListItemModel"
import {
  type DraggedNestedListItemState,
  type NestedListItemDropIndicatorState,
  type PendingNestedListItemHandleDragState,
  createHiddenNestedListItemDropIndicatorState,
} from "./nestedListItemDragModel"
import { useBlockEditorMarkdownCommit } from "./useBlockEditorMarkdownCommit"
import {
  runBlockToolbarCommand,
} from "./blockToolbarModel"
import {
  runInlineMarkCommand,
} from "./inlineToolbarModel"
import {
  useFloatingBubbleState,
} from "./useFloatingBubbleState"
import { recordEditorCommitDurationForRuntimeGuard } from "./editorRuntimeGuardModel"
import type {
  BlockEditorBlockMenuState,
  BlockEditorSlashMenuState,
} from "./BlockEditorEngine.layers"
import { useBlockEditorTableOverlayController } from "./useBlockEditorTableOverlayController"
import { useBlockEditorEngineBlockDrag } from "./useBlockEditorEngineBlockDrag"
import { useBlockEditorEngineBlockSelectionUi } from "./useBlockEditorEngineBlockSelectionUi"
import {
  downgradeDisabledFeatureNodes,
  isPrimaryModifierPressed,
  normalizeTableColorInputValue,
  useBlockEditorEngineDocumentOps,
} from "./useBlockEditorEngineDocumentOps"
import { useBlockEditorEngineInsertActions } from "./useBlockEditorEngineInsertActions"
import { useBlockEditorEngineSelectionEffects } from "./useBlockEditorEngineSelectionEffects"
import { useBlockEditorEngineSelectionTools } from "./useBlockEditorEngineSelectionTools"
import { useBlockEditorEngineSlashMenu } from "./useBlockEditorEngineSlashMenu"

const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse)"

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
  const isWriterSurface = typeof className === "string" && className.includes("aq-block-editor--writer-surface")
  const imageFileInputRef = useRef<HTMLInputElement>(null)
  const attachmentFileInputRef = useRef<HTMLInputElement>(null)
  const inlineColorMenuRef = useRef<HTMLDetailsElement>(null)
  const bubbleTextStyleMenuRef = useRef<HTMLDetailsElement>(null)
  const bubbleInlineColorMenuRef = useRef<HTMLDetailsElement>(null)
  const slashMenuRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const blockHandleRailRef = useRef<HTMLDivElement>(null)
  const pendingBlockDragRef = useRef<PendingBlockDragState | null>(null)
  const pendingBlockDragCleanupRef = useRef<(() => void) | null>(null)
  const pendingNestedListItemHandleDragRef = useRef<PendingNestedListItemHandleDragState | null>(null)
  const pendingNestedListItemHandleDragCleanupRef = useRef<(() => void) | null>(null)
  const skipNextPointerDownSelectionClearRef = useRef(false)
  const pendingImageInsertIndexRef = useRef<number | null>(null)
  const pendingAttachmentInsertIndexRef = useRef<number | null>(null)
  const tableViewportBudgetNormalizeFrameRef = useRef<number | null>(null)
  const editorRef = useRef<TiptapEditor | null>(null)
  const hoveredBlockClearTimerRef = useRef<number | null>(null)
  const mouseTextSelectionInProgressRef = useRef(false)
  const syncBubbleOnMouseUpRef = useRef(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const [slashMenuState, setSlashMenuState] = useState<BlockEditorSlashMenuState>(null)
  const [recentSlashItemIds, setRecentSlashItemIds] = useState<string[]>([])
  const [isSlashImeComposing, setIsSlashImeComposing] = useState(false)
  const [slashInteractionMode, setSlashInteractionMode] = useState<"keyboard" | "pointer">("keyboard")
  const slashPointerResumeAtRef = useRef(0)
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false)
  const [isInlineColorMenuOpen, setIsInlineColorMenuOpen] = useState(false)
  const [isBubbleTextStyleMenuOpen, setIsBubbleTextStyleMenuOpen] = useState(false)
  const [isBubbleInlineColorMenuOpen, setIsBubbleInlineColorMenuOpen] = useState(false)
  const [blockMenuState, setBlockMenuState] = useState<BlockEditorBlockMenuState>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null)
  const [hoveredListItemContext, setHoveredListItemContext] = useState<NestedListItemContext | null>(null)
  const [selectedListItemContext, setSelectedListItemContext] = useState<NestedListItemContext | null>(null)
  const selectedListItemContextRef = useRef<NestedListItemContext | null>(null)
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null)
  const [clickedBlockIndex, setClickedBlockIndex] = useState<number | null>(null)
  const [selectedBlockNodeIndex, setSelectedBlockNodeIndex] = useState<number | null>(null)
  const [textSelectionBlockIndex, setTextSelectionBlockIndex] = useState<number | null>(null)
  const selectedBlockNodeIndexRef = useRef<number | null>(null)
  const keyboardBlockSelectionStickyRef = useRef(false)
  const [blockHandleState, setBlockHandleState] = useState<TopLevelBlockHandleState>({
    visible: false,
    kind: "top-level",
    blockIndex: 0,
    listPath: [],
    itemIndex: null,
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
  })
  const [blockSelectionOverlayState, setBlockSelectionOverlayState] = useState<BlockSelectionOverlayState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  const {
    bubbleState,
    setBubbleState,
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    scheduleBubbleHide,
  } = useFloatingBubbleState()
  const [draggedBlockState, setDraggedBlockState] = useState<DraggedBlockState>(null)
  const [dragGhostPosition, setDragGhostPosition] = useState<{ x: number; y: number } | null>(null)
  const [dropIndicatorState, setDropIndicatorState] = useState<DropIndicatorState>(createHiddenDropIndicatorState)
  const [draggedNestedListItemState, setDraggedNestedListItemState] = useState<DraggedNestedListItemState>(null)
  const [nestedListItemDropIndicatorState, setNestedListItemDropIndicatorState] =
    useState<NestedListItemDropIndicatorState>(createHiddenNestedListItemDropIndicatorState)
  const [selectionTick, setSelectionTick] = useState(0)

  const selectionUiSignatureRef = useRef("")
  const blockSelectionLayoutRectCacheRef = useRef(new Map<number, { element: HTMLElement; rect: DOMRect }>())
  const blockHandleRailMetricsRef = useRef({ width: 54, height: 40 })

  useEffect(() => {
    const railElement = blockHandleRailRef.current
    if (!railElement || typeof ResizeObserver === "undefined") return

    const syncRailMetrics = () => {
      blockHandleRailMetricsRef.current = {
        width: railElement.offsetWidth || 54,
        height: railElement.offsetHeight || 40,
      }
    }

    syncRailMetrics()
    const observer = new ResizeObserver(syncRailMetrics)
    observer.observe(railElement)
    return () => observer.disconnect()
  }, [])

  const cancelHoveredBlockClear = useCallback(() => {
    if (hoveredBlockClearTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(hoveredBlockClearTimerRef.current)
      hoveredBlockClearTimerRef.current = null
    }
  }, [])

  const scheduleHoveredBlockClear = useCallback(() => {
    cancelHoveredBlockClear()
    if (typeof window === "undefined") return
    hoveredBlockClearTimerRef.current = window.setTimeout(() => {
      setHoveredBlockIndex(null)
      setHoveredListItemContext(null)
      hoveredBlockClearTimerRef.current = null
    }, 260)
  }, [cancelHoveredBlockClear])

  const cancelScheduledTableViewportBudgetNormalize = useCallback(() => {
    if (tableViewportBudgetNormalizeFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(tableViewportBudgetNormalizeFrameRef.current)
      tableViewportBudgetNormalizeFrameRef.current = null
    }
  }, [])

  const scheduleTableViewportBudgetNormalize = useCallback(
    (nextEditor: TiptapEditor) => {
      if (typeof window === "undefined") return
      cancelScheduledTableViewportBudgetNormalize()
      tableViewportBudgetNormalizeFrameRef.current = window.requestAnimationFrame(() => {
        tableViewportBudgetNormalizeFrameRef.current = null
        const targetEditor = editorRef.current ?? nextEditor
        syncRenderedTableOverflowModes(targetEditor)
        normalizeRenderedTableWidthsToReadableBudget(targetEditor)
      })
    },
    [cancelScheduledTableViewportBudgetNormalize]
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
  const initialDocRef = useRef(restoreEditorDocCodeBlocksFromMarkdown(value, downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)).doc)
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
    clearNativeTextSelection, clearStickyTopLevelBlockSelection, findNestedListItemContextByClientPosition,
    findNestedListItemContextFromTarget, findTopLevelBlockIndexByClientPosition, findTopLevelBlockIndexFromTarget,
    getNodeSelectedNestedListItemContext, getSelectionAnchorNestedListItemContext, isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture, isTopLevelBlockHandleEligible, promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction, resolveEffectiveSelectedListItemContext, resolveNestedListItemContextByIndices,
    resolveNestedListItemDropIndicatorByClientY,
  } = useBlockEditorEngineSelectionTools({
    clearSelectedBlockNodeIndex: setSelectedBlockNodeIndex, editorRef, getContentRoot, getTopLevelBlockElementByIndex,
    getTopLevelBlockElements, keyboardBlockSelectionStickyRef, selectedBlockNodeIndexRef, selectedListItemContext,
    selectedListItemContextRef, setClickedBlockIndex, setSelectedBlockIndex, setSelectedListItemContext,
    setSelectionTick, setTextSelectionBlockIndex, syncSelectedBlockNodeSurface, viewportRef,
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
      emptyHistoryStateRef.current = captureEmptyEditorHistoryState(createdEditor)
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
      if (rebalanceStructurallyChangedNormalTableWidths(nextEditor, transaction.before)) {
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
      handleScrollToSelection: (view) => shouldSuppressStickySelectionScrollToSelection(view, selectedBlockNodeIndexRef.current, keyboardBlockSelectionStickyRef.current),
      attributes: {
        class: "aq-block-editor__content",
        "data-testid": "block-editor-prosemirror",
      },
      handleKeyDown: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        if (event.defaultPrevented) return false
        const normalizedKey = event.key.toLowerCase()
        const hasPrimaryModifier = isPrimaryModifierPressed(event)
        const selection = currentEditor.state.selection as typeof currentEditor.state.selection & {
          node?: { isBlock?: boolean }
        }
        const isTopLevelBlockNodeSelection = Boolean(
          selection.$from.depth === 0 && selection.node?.isBlock
        )

        if (
          !hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          event.key === "Tab" &&
          !isTopLevelBlockNodeSelection
        ) {
          const targetBlockIndex =
            hoveredBlockIndex ??
            findTopLevelBlockIndexFromTarget(event.target) ??
            getTopLevelBlockIndexFromSelection(currentEditor)
          if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return false
          event.preventDefault()
          return promoteTopLevelBlockSelection(targetBlockIndex)
        }

        if (
          !hasPrimaryModifier &&
          !event.altKey &&
          !event.shiftKey &&
          (event.key === "Backspace" || event.key === "Delete") &&
          (isTopLevelBlockNodeSelection || selectedBlockNodeIndexRef.current !== null)
        ) {
          event.preventDefault()
          const blockIndex = selectedBlockNodeIndexRef.current ?? getTopLevelBlockIndexFromSelection(currentEditor)
          const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
          const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
          mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
          setBlockMenuState(null)
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "b") {
          event.preventDefault()
          runInlineMarkCommand(currentEditor, "bold")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "i") {
          event.preventDefault()
          runInlineMarkCommand(currentEditor, "italic")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "k") {
          event.preventDefault()
          openLinkPrompt()
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "m") {
          event.preventDefault()
          insertInlineFormula()
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "m") {
          event.preventDefault()
          insertFormulaBlock()
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "2") {
          event.preventDefault()
          runBlockToolbarCommand(currentEditor, "heading-2")
          return true
        }

        if (hasPrimaryModifier && event.altKey && !event.shiftKey && normalizedKey === "3") {
          event.preventDefault()
          runBlockToolbarCommand(currentEditor, "heading-3")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "7") {
          event.preventDefault()
          runBlockToolbarCommand(currentEditor, "ordered-list")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "8") {
          event.preventDefault()
          runBlockToolbarCommand(currentEditor, "bullet-list")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "9") {
          event.preventDefault()
          runBlockToolbarCommand(currentEditor, "quote")
          return true
        }

        if (hasPrimaryModifier && !event.altKey && !event.shiftKey && normalizedKey === "z") {
          event.preventDefault()
          // Guard against OS key repeat causing multiple undo steps in one press.
          if (event.repeat) return true
          if (currentEditor.can().chain().focus().undo().run()) {
            currentEditor.chain().focus().undo().run()
          }
          return true
        }

        if (hasPrimaryModifier && !event.altKey && event.shiftKey && normalizedKey === "z") {
          event.preventDefault()
          if (event.repeat) return true
          if (currentEditor.can().chain().focus().redo().run()) {
            currentEditor.chain().focus().redo().run()
          }
          return true
        }

        if (selectedBlockNodeIndexRef.current !== null) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }

        return false
      },
      handlePaste: (_, event) => {
        const currentEditor = editorRef.current
        if (!currentEditor) return false
        const isTableContextPaste = isTableSelectionActive(currentEditor)

        const clipboardFiles = Array.from(event.clipboardData?.files || [])
        const imageFile = clipboardFiles.find((file) => file.type.startsWith("image/"))
        if (imageFile && !isTableContextPaste) {
          event.preventDefault()
          void (async () => {
            const imageAttrs = await onUploadImage(imageFile)
            currentEditor
              .chain()
              .focus()
              .insertContent([
                {
                  type: "resizableImage",
                  attrs: {
                    src: imageAttrs.src,
                    alt: imageAttrs.alt || "",
                    title: imageAttrs.title || "",
                    widthPx: imageAttrs.widthPx ?? null,
                    align: imageAttrs.align || "center",
                  },
                },
                { type: "paragraph" },
              ])
              .run()
          })()
          return true
        }

        const attachmentFile = clipboardFiles.find((file) => !file.type.startsWith("image/"))
        if (attachmentFile && onUploadFile && !isTableContextPaste) {
          event.preventDefault()
          void (async () => {
            const fileAttrs = await onUploadFile(attachmentFile)
            insertDocContent(
              {
                type: "doc",
                content: [createFileBlockNode(fileAttrs), { type: "paragraph" }],
              },
              isSelectionInEmptyParagraph()
            )
          })()
          return true
        }

        const plainText = event.clipboardData?.getData("text/plain") || ""
        const html = event.clipboardData?.getData("text/html") || ""
        const trimmedPlainText = plainText.trim()
        const normalizedPlainText = normalizeStructuredMarkdownClipboard(plainText)
        const normalizedHtmlMarkdown = html ? convertHtmlToMarkdown(html) : ""
        const extractedPlainTextFromHtml = html ? extractPlainTextFromHtml(html) : ""
        const calloutPasteText = plainText || extractedPlainTextFromHtml

        if (calloutPasteText && replaceEmptyCalloutBodyWithPlainText(calloutPasteText)) {
          event.preventDefault()
          return true
        }

        if (isTableContextPaste) {
          const normalizedTablePasteText = normalizeTableContextPasteText(
            normalizedHtmlMarkdown,
            normalizedPlainText,
            extractedPlainTextFromHtml,
            plainText
          )
          if (normalizedTablePasteText) {
            event.preventDefault()
            currentEditor.chain().focus().insertContent(normalizedTablePasteText).run()
            return true
          }
        }

        if (
          isSelectionInEmptyParagraph() &&
          trimmedPlainText &&
          !trimmedPlainText.includes("\n") &&
          isHttpUrl(trimmedPlainText)
        ) {
          event.preventDefault()
          void insertCardBlockFromUrl(trimmedPlainText)
          return true
        }

        if (html && normalizedHtmlMarkdown) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedHtmlMarkdown),
            enableMermaidBlocks
          )
          const readableWidthBudget = getCurrentEditorReadableWidthPx(currentEditor) - 2
          return insertDocContent(
            promotePastedWideTables(parsedDoc, readableWidthBudget),
            isSelectionInEmptyParagraph()
          )
        }

        if (normalizedPlainText && looksLikeStructuredMarkdownDocument(normalizedPlainText)) {
          event.preventDefault()
          const parsedDoc = downgradeDisabledFeatureNodes(
            parseMarkdownToEditorDoc(normalizedPlainText),
            enableMermaidBlocks
          )
          const readableWidthBudget = getCurrentEditorReadableWidthPx(currentEditor) - 2
          return insertDocContent(
            promotePastedWideTables(parsedDoc, readableWidthBudget),
            isSelectionInEmptyParagraph()
          )
        }

        if (html && !plainText.trim()) {
          const extracted = extractedPlainTextFromHtml
          if (extracted) {
            event.preventDefault()
            currentEditor.chain().focus().insertContent(extracted).run()
            return true
          }
        }

        return false
      },
    },
    onUpdate: ({ editor: nextEditor }) => {
      const commitStartedAt = typeof window !== "undefined" ? performance.now() : 0
      scheduleMarkdownCommit(nextEditor)
      if (typeof window !== "undefined") {
        recordEditorCommitDurationForRuntimeGuard(performance.now() - commitStartedAt)
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
    [editor]
  )

  const insertActions = useBlockEditorEngineInsertActions({
    attachmentFileInputRef, closeSlashMenu, createInitialTableNode, disabled, editor, editorRef,
    enableMermaidBlocks, focusNearestInsertedCalloutBody, imageFileInputRef, insertBlocksAtIndex,
    insertDocContent, isSelectionInEmptyParagraph, isTableMode, isTopLevelInsertBlockedByTableUi,
    mutateTopLevelBlocks, onQaActionsReady, onUploadFile, onUploadImage, pendingAttachmentInsertIndexRef,
    pendingImageInsertIndexRef, resizeFirstTableColumnBy, resizeFirstTableRowBy, selectCurrentTableAxis,
    selectTableColumnByIndex, selectionTick, setIsBubbleInlineColorMenuOpen, setIsBubbleTextStyleMenuOpen,
    setIsInlineColorMenuOpen, setIsToolbarMoreOpen, updateActiveTableCellAttrs,
  })
  const { blockInsertCatalog, insertCardBlockFromUrl, insertInlineFormula, insertFormulaBlock, isHttpUrl, openLinkPrompt } = insertActions

  const slashMenu = useBlockEditorEngineSlashMenu({
    blockInsertCatalog, closeSlashMenu, editor, editorRef, isSlashImeComposing, isSlashMenuOpen,
    recentSlashItemIds, selectedSlashIndex, setIsSlashMenuOpen, setRecentSlashItemIds, setSelectedSlashIndex,
    setSlashInteractionMode, setSlashMenuState, setSlashQuery, slashMenuRef, slashMenuState,
    slashPointerResumeAtRef, slashQuery, transformCurrentParagraphViaSlash,
  })
  const { applyResolvedSlashMenuState, resolveSlashMenuState, syncSlashMenuWhileComposing } = slashMenu

  useEffect(() => {
    if (typeof window === "undefined" || !isInlineColorMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return
        setIsInlineColorMenuOpen(false)
        return
      }

      const target = event.target
      if (
        inlineColorMenuRef.current &&
        target instanceof Node &&
        inlineColorMenuRef.current.contains(target)
      ) {
        return
      }

      setIsInlineColorMenuOpen(false)
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu)
    }
  }, [isInlineColorMenuOpen])

  useEffect(() => {
    if (typeof window === "undefined") return
    if (!isBubbleTextStyleMenuOpen && !isBubbleInlineColorMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return
        setIsBubbleTextStyleMenuOpen(false)
        setIsBubbleInlineColorMenuOpen(false)
        return
      }

      const target = event.target
      if (
        (bubbleTextStyleMenuRef.current && target instanceof Node && bubbleTextStyleMenuRef.current.contains(target)) ||
        (bubbleInlineColorMenuRef.current && target instanceof Node && bubbleInlineColorMenuRef.current.contains(target))
      ) {
        return
      }

      setIsBubbleTextStyleMenuOpen(false)
      setIsBubbleInlineColorMenuOpen(false)
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu)
    }
  }, [isBubbleInlineColorMenuOpen, isBubbleTextStyleMenuOpen])

  useEffect(() => {
    if (bubbleState.visible && bubbleState.mode === "text") return
    setIsBubbleTextStyleMenuOpen(false)
    setIsBubbleInlineColorMenuOpen(false)
  }, [bubbleState.mode, bubbleState.visible])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(BLOCK_HANDLE_MEDIA_QUERY)
    const sync = () => setIsCoarsePointer(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  const blockSelectionUi = useBlockEditorEngineBlockSelectionUi({
    blockHandleRailMetricsRef, blockHandleState, blockSelectionLayoutRectCacheRef, cancelHoveredBlockClear,
    cancelTableQuickRailHide, clearNativeTextSelection, clearStickyTopLevelBlockSelection, clearTrackedTableHover,
    clickedBlockIndex,
    currentTableAxisSelection, draggedBlockState, dropIndicatorState, editor, editorRef,
    findNestedListItemContextByClientPosition, findNestedListItemContextFromTarget, findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget, focusRenderedTableCell, getContentRoot, getTableCellFromClientPoint,
    getTopLevelBlockElementByIndex, getTopLevelBlockElements, handleTableViewportPointerLeave, hasTableStructuralSelection,
    hideTableQuickRailImmediately, hoveredBlockIndex, hoveredListItemContext, isCoarsePointer, isOuterBlockSelectionGesture,
    isOuterListItemSelectionGesture, isTableAffordanceVisible, isTableAxisDragActive, isTableColumnRailResizeActive,
    isTableRowResizeActive, isTableRowResizeHandleTarget, isTableStructuralSelection, isTopLevelBlockHandleEligible,
    isWriterSurface, keyboardBlockSelectionStickyRef, mutateTopLevelBlocks, promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction, resolveEffectiveSelectedListItemContext, scheduleHoveredBlockClear, scheduleTableQuickRailHide,
    selectedBlockIndex, selectedBlockNodeIndex, selectedBlockNodeIndexRef, selectionTick, setBlockHandleState,
    setBlockMenuState, setBlockSelectionOverlayState, setClickedBlockIndex, setHoveredBlockIndex, setHoveredListItemContext,
    setSelectedBlockNodeIndex, setSelectedListItemContext, setSelectionTick, setTableQuickRailHovered, setViewportRowResizeHot,
    shouldPersistTableHandles, skipNextPointerDownSelectionClearRef, slashMenuState, startTableRowResize,
    syncSelectedBlockNodeSurface, syncTableQuickRailFromElement, syncTrackedHoveredTableCellMenuLayout, tableMenuState,
    textSelectionBlockIndex, viewportRef,
  })

  const blockDrag = useBlockEditorEngineBlockDrag({
    blockHandleState, blockMenuState, cancelHoveredBlockClear, clearNativeTextSelection, clearStickyTopLevelBlockSelection,
    draggedBlockState, draggedNestedListItemState, editor, editorRef, findNestedListItemContextFromTarget,
    flushPendingMarkdownCommit, getTopLevelBlockElementByIndex, getTopLevelBlockElements, hoveredListItemContext,
    isTableStructuralSelection, mutateTopLevelBlocks, pendingBlockDragCleanupRef, pendingBlockDragRef, pendingNestedListItemHandleDragCleanupRef,
    pendingNestedListItemHandleDragRef, promoteTopLevelBlockSelection, resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextByIndices, resolveNestedListItemDropIndicatorByClientY, scheduleHoveredBlockClear,
    selectedListItemContextRef, setBlockMenuState, setDragGhostPosition, setDraggedBlockState, setDraggedNestedListItemState,
    setDropIndicatorState, setHoveredBlockIndex, setHoveredListItemContext, setNestedListItemDropIndicatorState,
    setSelectedListItemContext, setSelectionTick,
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
    [disabled, editor]
  )

  const handleEditorViewportCompositionStart = useCallback(() => {
    setIsSlashImeComposing(true)
  }, [])

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
  }, [applyResolvedSlashMenuState, resolveSlashMenuState])

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
    handleEditorViewportCompositionEnd, handleEditorViewportCompositionStart, handleEditorViewportCompositionUpdate,
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
    setIsBubbleInlineColorMenuOpen, setIsBubbleTextStyleMenuOpen, setIsInlineColorMenuOpen,
    setIsPreviewOpen, setIsToolbarMoreOpen,
    slashInteractionMode,
    slashMenuRef,
    slashMenuState,
    slashQuery,
    tableOverlayLayerProps,
    viewportRef,
  }
}
