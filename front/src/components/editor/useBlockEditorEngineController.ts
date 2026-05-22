import type { Editor as TiptapEditor } from "@tiptap/core"
import AppIcon from "src/components/icons/AppIcon"
import { Fragment } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { useEditor } from "@tiptap/react"
import { createElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import type {
  ChangeEvent,
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react"
import { getPreferredCodeLanguage } from "./extensions"
import {
  deleteTopLevelBlockAt,
  duplicateTopLevelBlockAt,
  insertTopLevelBlockAt,
  moveNestedListItemToInsertionIndex,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createCalloutNode,
  createCodeBlockNode,
  DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
  DEFAULT_EMPTY_TABLE_ROW_COUNT,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createInlineFormulaNode,
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createTaskListNode,
  createToggleNode,
  createBulletListNode,
  parseMarkdownToEditorDoc,
  restoreEditorDocCodeBlocksFromMarkdown,
  createEmptyTableNode,
  type BlockEditorDoc,
} from "./serialization"
import {
  type MarkdownTableLayout,
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
} from "src/libs/markdown/tableMetadata"
import {
  convertHtmlToMarkdown,
  extractPlainTextFromHtml,
  looksLikeStructuredMarkdownDocument,
  normalizeStructuredMarkdownClipboard,
} from "src/libs/markdown/htmlToMarkdown"
import { inferCardKindFromUrl, inferLinkProvider, resolveEmbedPreviewUrl } from "src/libs/unfurl/extractMeta"
import {
  captureEmptyEditorHistoryState,
  getEditorUndoDepth,
  resetEditorUndoHistory,
  type EditorHistorySnapshot,
} from "./editorHistoryModel"
import type { BlockEditorChangeMeta, BlockEditorQaActions } from "./blockEditorContract"
import type { BlockEditorEngineProps } from "./blockEditorEngineTypes"
import { refocusEditorForSelectionReveal, shouldSuppressStickySelectionScrollToSelection } from "./editorScrollSelectionGuard"
import {
  type BlockInsertCatalogItem,
  createWriterBlockInsertCatalog,
  createWriterEditorExtensions,
  TABLE_CONTEXT_BLOCKED_INSERT_IDS,
} from "./writerEditorPreset"
import {
  TABLE_OVERFLOW_MODE_WIDE,
  TABLE_WIDTH_BUDGET_META_KEY,
  createBalancedTableColumnWidths,
  getPreferredNormalTableTotalWidth,
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
  BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
  BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX,
  getEditableTextPositionForTopLevelBlock,
  getFirstEditableTextPositionInNode,
  getTopLevelBlockIndexFromSelection,
  getTopLevelBlockPosition,
  isTabBlockSelectionEligible,
  isStableBlockHandleState,
  isStableBlockSelectionOverlayState,
  resolveOuterBlockSelectionGesture,
  resolveOuterListItemSelectionGesture,
  selectTopLevelBlockNode,
  type BlockSelectionOverlayState,
  type BlockSelectionPointerEventLike,
  type TopLevelBlockHandleState,
} from "./blockSelectionModel"
import {
  resolveBlockHandleAnchorTop,
  resolveBlockChromeTop,
  resolveBlockHandleRailLayoutForSurface,
  resolveBlockSelectionOverlayLayout,
  resolveThinBlockHandleAnchorTop,
  preserveWindowScrollForEditorPointerFocus,
  shouldCenterBlockHandleForNode,
  shouldUseThinBlockHandleAnchor,
} from "./blockHandleLayoutModel"
import {
  type DraggedBlockState,
  type DropIndicatorState,
  type PendingBlockDragState,
  createBlockDragPreview,
  createDraggedBlockState,
  createDropIndicatorState,
  createHiddenDropIndicatorState,
  createPendingBlockDragState,
  hideDropIndicatorState,
  resolveBlockDropIndicatorByClientY,
} from "./blockDragModel"
import {
  type NestedListItemContext,
  LIST_ITEM_SELECTOR,
  getActiveListItemName,
  getListItemNameFromContext,
  isSameNestedListItemContext,
  resolveNestedListItemContextByClientPosition,
  resolveNestedListItemContextByIndices as resolveNestedListItemContextFromBlockElement,
  resolveNestedListItemContextFromTarget,
  resolveNestedListItemDropIndicator,
  resolveNodeSelectedNestedListItemContext,
  resolveSelectionAnchorNestedListItemContext,
  sameListPath,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import {
  type DraggedNestedListItemState,
  type NestedListItemDropIndicatorState,
  type PendingNestedListItemHandleDragState,
  createDraggedNestedListItemState,
  createHiddenNestedListItemDropIndicatorState,
  createNestedListItemDragPreview,
  createNestedListItemDropIndicatorState,
  createPendingNestedListItemHandleDragState,
  hideNestedListItemDropIndicatorState,
  isNestedListItemContextInDraggedList,
} from "./nestedListItemDragModel"
import { useBlockEditorMarkdownCommit } from "./useBlockEditorMarkdownCommit"
import {
  buildSlashMenuSections,
  getRankedSlashItems,
  normalizeSlashSearchText,
  type SlashMenuContext,
} from "./slashMenuModel"
import {
  isBlockToolbarCommandActive,
  isToolbarBlockInsertActive,
  runBlockToolbarCommand,
} from "./blockToolbarModel"
import {
  getActiveInlineColor,
  getActiveInlineTextStyleOption,
  isInlineMarkCommandActive,
  isInlineCodeMarkActive,
  runInlineCode,
  runInlineColor,
  runInlineMarkCommand,
  runInlineTextStyle,
  type InlineTextStyleOption,
} from "./inlineToolbarModel"
import {
  areFloatingBubbleStatesEqual,
  hideFloatingBubbleState,
  resolveFloatingBubbleStateFromCoords,
  useFloatingBubbleState,
} from "./useFloatingBubbleState"
import { recordEditorCommitDurationForRuntimeGuard } from "./editorRuntimeGuardModel"
import type {
  BlockEditorBlockMenuState,
  BlockEditorSlashMenuState,
  BlockEditorToolbarAction,
} from "./BlockEditorEngine.layers"
import { useBlockEditorTableOverlayController } from "./useBlockEditorTableOverlayController"

const useBlockSelectionLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect
type SlashKeyboardEventLike = {
  key: string
  shiftKey?: boolean
  isComposing?: boolean
  timeStamp?: number
  preventDefault: () => void
  stopPropagation?: () => void
  nativeEvent?: {
    stopImmediatePropagation?: () => void
  }
}

const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse)"
const SLASH_MENU_RECENT_IDS_STORAGE_KEY = "editor:block-slash-recent:v1"
const SLASH_MENU_MAX_RECENT_ITEMS = 6
const SLASH_MENU_EDGE_PADDING_PX = 16
const SLASH_MENU_VERTICAL_GAP_PX = 12
const SLASH_MENU_ESTIMATED_WIDTH_PX = 608
const SLASH_MENU_ESTIMATED_HEIGHT_PX = 560
const blockHasVisibleContent = (node?: BlockEditorDoc | null): boolean => {
  if (!node) return false

  if (node.type === "text") {
    return Boolean((node as { text?: string }).text?.trim().length)
  }

  if (
    node.type === "resizableImage" ||
    node.type === "calloutBlock" ||
    node.type === "taskList" ||
    node.type === "bookmarkBlock" ||
    node.type === "embedBlock" ||
    node.type === "fileBlock" ||
    node.type === "formulaBlock" ||
    node.type === "toggleBlock" ||
    node.type === "mermaidBlock" ||
    node.type === "rawMarkdownBlock" ||
    node.type === "table" ||
    node.type === "horizontalRule"
  ) {
    return true
  }

  return Array.isArray(node.content) && node.content.some((child) => blockHasVisibleContent(child as BlockEditorDoc))
}

const normalizeTableColorInputValue = (value: unknown) => {
  const normalized = String(value || "").trim()
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#dbeafe"
}

const isPrimaryModifierPressed = (event: ReactKeyboardEvent | globalThis.KeyboardEvent) =>
  event.metaKey || event.ctrlKey

const getActiveSlashRangeFromEditor = (editor: TiptapEditor): { from: number; to: number } | null => {
  const selection = editor.state.selection
  if (!selection.empty) return null

  const parent = selection.$from.parent
  if (parent.type.name !== "paragraph") return null

  const textBeforeCursor = parent.textContent.slice(0, selection.$from.parentOffset)
  const match = /(^|[\s\u00A0])\/([^\n]*)$/.exec(textBeforeCursor)
  if (!match) return null

  const slashOffset = (match.index ?? 0) + match[1].length
  return {
    from: selection.$from.start() + slashOffset,
    to: selection.from,
  }
}

const focusElementWithoutScroll = (element: HTMLElement | null) => {
  if (!element) return
  if (typeof window === "undefined") {
    element.focus()
    return
  }

  const previousScrollX = window.scrollX
  const previousScrollY = window.scrollY
  try {
    element.focus({ preventScroll: true })
  } catch {
    element.focus()
  }
  if (window.scrollX !== previousScrollX || window.scrollY !== previousScrollY) {
    window.scrollTo(previousScrollX, previousScrollY)
  }
}

const resolveDocPosSafe = (editor: TiptapEditor, pos: number) => {
  if (!Number.isFinite(pos)) return null
  const normalizedPos = Math.round(pos)
  const maxPos = editor.state.doc.content.size
  if (normalizedPos < 0 || normalizedPos > maxPos) return null
  try {
    return editor.state.doc.resolve(normalizedPos)
  } catch {
    return null
  }
}

const downgradeDisabledFeatureNodes = (node: BlockEditorDoc, enableMermaidBlocks: boolean): BlockEditorDoc => {
  if (!enableMermaidBlocks && node.type === "mermaidBlock") {
    const source = String(node.attrs?.source || "").trim()
    return {
      type: "rawMarkdownBlock",
      attrs: {
        markdown: ["```mermaid", source, "```"].join("\n"),
        reason: "unsupported-mermaid",
      },
    }
  }

  if (!node.content?.length) return node

  return {
    ...node,
    content: node.content.map((child) => downgradeDisabledFeatureNodes(child as BlockEditorDoc, enableMermaidBlocks)),
  }
}

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

  const isSelectionInEmptyParagraph = useCallback(() => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const { selection } = currentEditor.state
    if (!selection.empty) return false
    const parent = selection.$from.parent
    return parent.type.name === "paragraph" && parent.content.size === 0
  }, [])

  const getEmptyCalloutBodyParagraphRange = useCallback((targetEditor: TiptapEditor) => {
    const { selection } = targetEditor.state
    if (!selection.empty) return null

    const { $from } = selection
    const parent = $from.parent
    let calloutDepth = -1
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      if ($from.node(depth).type.name === "calloutBlock") {
        calloutDepth = depth
        break
      }
    }
    if (calloutDepth < 0) return null

    if (parent.type.name === "paragraph" && parent.content.size === 0) {
      return {
        from: $from.before($from.depth),
        to: $from.after($from.depth),
      }
    }

    const calloutNode = $from.node(calloutDepth)
    const calloutPos = calloutDepth > 0 ? $from.before(calloutDepth) : 0
    let fallbackRange: { from: number; to: number } | null = null
    calloutNode.descendants((node, pos) => {
      if (fallbackRange) return false
      if (node.type.name !== "paragraph" || node.content.size > 0) return true

      const from = calloutPos + pos + 1
      fallbackRange = { from, to: from + node.nodeSize }
      return false
    })

    return fallbackRange
  }, [])

  const replaceEmptyCalloutBodyWithPlainText = useCallback((text: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    const replaceRange = getEmptyCalloutBodyParagraphRange(currentEditor)
    if (!replaceRange) return false

    const normalizedText = text.replace(/\r\n?/g, "\n")
    if (!normalizedText.trim()) return false

    const nextParagraphNodes = normalizedText
      .split("\n")
      .map((line) => currentEditor.state.schema.nodeFromJSON(createParagraphNode(line)))

    if (nextParagraphNodes.length === 0) return false

    let tr = currentEditor.state.tr.replaceWith(
      replaceRange.from,
      replaceRange.to,
      Fragment.fromArray(nextParagraphNodes)
    )

    const lastNodeIndex = nextParagraphNodes.length - 1
    const lastNodeStart = replaceRange.from + nextParagraphNodes
      .slice(0, lastNodeIndex)
      .reduce((sum, node) => sum + node.nodeSize, 0)
    const caretPos = Math.max(
      1,
      Math.min(lastNodeStart + nextParagraphNodes[lastNodeIndex].nodeSize - 1, tr.doc.content.size)
    )
    tr = tr.setSelection(TextSelection.create(tr.doc, caretPos))

    currentEditor.view.dispatch(tr.scrollIntoView())
    currentEditor.view.focus()
    return true
  }, [getEmptyCalloutBodyParagraphRange])

  const insertDocContent = useCallback(
    (doc: BlockEditorDoc, replaceCurrentEmptyParagraph = false) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      if (isTableSelectionActive(currentEditor)) return false
      const nextContent = doc.content?.length ? doc.content : [{ type: "paragraph" }]

      if (replaceCurrentEmptyParagraph && isSelectionInEmptyParagraph()) {
        const { $from } = currentEditor.state.selection
        currentEditor
          .chain()
          .focus()
          .deleteRange({
            from: $from.before($from.depth),
            to: $from.after($from.depth),
          })
          .insertContent(nextContent)
          .run()
        return true
      }

      currentEditor.chain().focus().insertContent(nextContent).run()
      return true
    },
    [isSelectionInEmptyParagraph]
  )

  const getContentRoot = useCallback(() => {
    return viewportRef.current?.querySelector(".aq-block-editor__content") as HTMLElement | null
  }, [])

  const getTopLevelBlockElements = useCallback(() => {
    const root = getContentRoot()
    return root ? Array.from(root.children) as HTMLElement[] : []
  }, [getContentRoot])

  const getTopLevelBlockElementByIndex = useCallback(
    (blockIndex: number) => getTopLevelBlockElements()[blockIndex] ?? null,
    [getTopLevelBlockElements]
  )

  const syncSelectedBlockNodeSurface = useCallback(
    (blockIndex: number | null) => {
      const elements = getTopLevelBlockElements()
      elements.forEach((element, index) => {
        if (blockIndex !== null && index === blockIndex) {
          element.setAttribute("data-block-selected", "true")
        } else {
          element.removeAttribute("data-block-selected")
        }
      })
    },
    [getTopLevelBlockElements]
  )

  useEffect(() => {
    const selectedSurfaceIndex =
      selectedBlockNodeIndex !== null
        ? selectedBlockNodeIndex
        : clickedBlockIndex !== null
          ? clickedBlockIndex
          : null
    syncSelectedBlockNodeSurface(selectedSurfaceIndex)
  }, [
    clickedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    syncSelectedBlockNodeSurface,
  ])

  const clearPendingBlockDrag = useCallback(() => {
    pendingBlockDragRef.current = null
    if (pendingBlockDragCleanupRef.current) {
      pendingBlockDragCleanupRef.current()
      pendingBlockDragCleanupRef.current = null
    }
  }, [])

  const clearPendingNestedListItemHandleDrag = useCallback(() => {
    pendingNestedListItemHandleDragRef.current = null
    if (pendingNestedListItemHandleDragCleanupRef.current) {
      pendingNestedListItemHandleDragCleanupRef.current()
      pendingNestedListItemHandleDragCleanupRef.current = null
    }
  }, [])

  const clearStickyTopLevelBlockSelection = useCallback(() => {
    keyboardBlockSelectionStickyRef.current = false
    selectedBlockNodeIndexRef.current = null
    setClickedBlockIndex(null)
    setSelectedBlockNodeIndex(null)
    setTextSelectionBlockIndex(null)
    syncSelectedBlockNodeSurface(null)
  }, [syncSelectedBlockNodeSurface])

  const clearBlockDragVisualState = useCallback(() => {
    setDraggedBlockState(null)
    setDragGhostPosition(null)
    setDropIndicatorState(hideDropIndicatorState)
  }, [])

  const beginBlockDragFromPending = useCallback(
    (pending: PendingBlockDragState, clientX: number, clientY: number) => {
      const indicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), clientY)
      setDraggedBlockState(createDraggedBlockState(pending))
      setDragGhostPosition({
        x: clientX,
        y: clientY,
      })
      setDropIndicatorState(createDropIndicatorState(indicator))

      let earlyPointerDoneTimeout: number | null = null
      const cleanupEarlyPointerDone = () => {
        window.removeEventListener("pointerup", handleEarlyPointerDone, true)
        window.removeEventListener("pointercancel", handleEarlyPointerDone, true)
        if (earlyPointerDoneTimeout !== null) {
          window.clearTimeout(earlyPointerDoneTimeout)
          earlyPointerDoneTimeout = null
        }
      }
      const handleEarlyPointerDone = (event: PointerEvent) => {
        if (event.pointerId !== pending.pointerId) return
        clearBlockDragVisualState()
        cleanupEarlyPointerDone()
      }

      window.addEventListener("pointerup", handleEarlyPointerDone, true)
      window.addEventListener("pointercancel", handleEarlyPointerDone, true)
      earlyPointerDoneTimeout = window.setTimeout(cleanupEarlyPointerDone, 30000)
    },
    [clearBlockDragVisualState, getTopLevelBlockElements]
  )

  const clearNativeTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const clearRanges = () => {
      const domSelection = window.getSelection()
      if (domSelection?.rangeCount) {
        domSelection.removeAllRanges()
      }
    }

    clearRanges()
    window.requestAnimationFrame(() => {
      clearRanges()
      focusElementWithoutScroll(viewportRef.current)
      window.requestAnimationFrame(() => {
        clearRanges()
      })
    })
  }, [])

  const promoteTopLevelBlockSelection = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      keyboardBlockSelectionStickyRef.current = true
      selectTopLevelBlockNode(currentEditor, blockIndex)
      setClickedBlockIndex(null)
      setSelectedBlockIndex(blockIndex)
      setSelectedBlockNodeIndex(blockIndex)
      setTextSelectionBlockIndex(null)
      syncSelectedBlockNodeSurface(blockIndex)
      setSelectionTick((prev) => prev + 1)
      clearNativeTextSelection()
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          setSelectedBlockNodeIndex(blockIndex)
          syncSelectedBlockNodeSurface(blockIndex)
          setSelectionTick((prev) => prev + 1)
        })
      }
      return true
    },
    [clearNativeTextSelection, syncSelectedBlockNodeSurface]
  )

  const isTopLevelBlockHandleEligible = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false
    const blocks = ((currentEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const block = blocks[blockIndex]
    if (!block) return false
    if (blocks.length > 1) return true
    return blockHasVisibleContent(block)
  }, [])

  const findTopLevelBlockIndexFromTarget = useCallback(
    (target: EventTarget | null) => {
      const root = getContentRoot()
      if (!root) return null

      const normalizedTarget =
        target instanceof Element
          ? target
          : target instanceof Node
            ? target.parentElement
            : null
      if (!(normalizedTarget instanceof Element)) return null

      let element: Element | null = normalizedTarget
      while (element && element.parentElement !== root) {
        element = element.parentElement
      }

      if (!element || element.parentElement !== root) return null
      return getTopLevelBlockElements().indexOf(element as HTMLElement)
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findTopLevelBlockIndexByClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      const elements = getTopLevelBlockElements()
      if (!elements.length) return null

      let bestIndex: number | null = null
      let bestDistance = Number.POSITIVE_INFINITY

      for (let index = 0; index < elements.length; index += 1) {
        const rect = elements[index].getBoundingClientRect()
        const expandedTop = rect.top - 10
        const expandedBottom = rect.bottom + 10
        const expandedLeft = rect.left - 28
        const expandedRight = rect.right + 16
        const inside =
          clientY >= expandedTop &&
          clientY <= expandedBottom &&
          clientX >= expandedLeft &&
          clientX <= expandedRight

        if (inside) {
          return index
        }

        const centerY = rect.top + rect.height / 2
        const distance = Math.abs(clientY - centerY)
        if (distance < bestDistance) {
          bestDistance = distance
          bestIndex = index
        }
      }

      return bestIndex
    },
    [getTopLevelBlockElements]
  )

  const isOuterBlockSelectionGesture = useCallback(
    (event: BlockSelectionPointerEventLike, targetBlockIndex: number | null) => {
      const blockElement = targetBlockIndex !== null ? getTopLevelBlockElementByIndex(targetBlockIndex) : null
      return resolveOuterBlockSelectionGesture(event, blockElement)
    },
    [getTopLevelBlockElementByIndex]
  )

  const isOuterListItemSelectionGesture = useCallback(
    (event: BlockSelectionPointerEventLike, targetListItem: NestedListItemContext | null) => {
      return resolveOuterListItemSelectionGesture(event, targetListItem?.listItemElement ?? null)
    },
    []
  )

  const resolveNestedListBlockIndex = useCallback(
    (blockElement: HTMLElement) => {
      const root = getContentRoot()
      if (!root || blockElement.parentElement !== root) return null
      const index = getTopLevelBlockElements().indexOf(blockElement)
      return index >= 0 ? index : null
    },
    [getContentRoot, getTopLevelBlockElements]
  )

  const findNestedListItemContextFromTarget = useCallback(
    (target: EventTarget | null) => resolveNestedListItemContextFromTarget(target, resolveNestedListBlockIndex),
    [resolveNestedListBlockIndex]
  )

  const findNestedListItemContextByClientPosition = useCallback(
    (clientX: number, clientY: number) => {
      return resolveNestedListItemContextByClientPosition(
        getContentRoot(),
        clientX,
        clientY,
        resolveNestedListBlockIndex,
        {
          leftGutterPx: BLOCK_OUTER_SELECT_LEFT_GUTTER_PX,
          rightPaddingPx: 8,
        }
      )
    },
    [getContentRoot, resolveNestedListBlockIndex]
  )

  const getNodeSelectedNestedListItemContext = useCallback(
    (currentEditor: TiptapEditor) => {
      return resolveNodeSelectedNestedListItemContext(currentEditor, resolveNestedListBlockIndex)
    },
    [resolveNestedListBlockIndex]
  )

  const getSelectionAnchorNestedListItemContext = useCallback(
    (currentEditor: TiptapEditor) => {
      return resolveSelectionAnchorNestedListItemContext(currentEditor, resolveNestedListBlockIndex)
    },
    [resolveNestedListBlockIndex]
  )

  const resolveNestedListItemContextByIndices = useCallback(
    (listBlockIndex: number, listPath: number[], itemIndex: number) => {
      const blockElement = getTopLevelBlockElementByIndex(listBlockIndex)
      return resolveNestedListItemContextFromBlockElement(blockElement, listBlockIndex, listPath, itemIndex)
    },
    [getTopLevelBlockElementByIndex]
  )

  const resolveEffectiveSelectedListItemContext = useCallback(
    (activeEditor?: TiptapEditor | null) => {
      const liveSelectedListItemContext = activeEditor ? getNodeSelectedNestedListItemContext(activeEditor) : null
      if (liveSelectedListItemContext?.listItemElement?.isConnected) {
        return liveSelectedListItemContext
      }
      if (selectedListItemContextRef.current?.listItemElement?.isConnected) {
        return selectedListItemContextRef.current
      }
      if (selectedListItemContext?.listItemElement?.isConnected) {
        return selectedListItemContext
      }
      const persistedSelectedListItemContext =
        selectedListItemContextRef.current ?? selectedListItemContext
      if (!persistedSelectedListItemContext) {
        return null
      }
      return resolveNestedListItemContextByIndices(
        persistedSelectedListItemContext.listBlockIndex,
        persistedSelectedListItemContext.listPath,
        persistedSelectedListItemContext.itemIndex
      )
    },
    [getNodeSelectedNestedListItemContext, resolveNestedListItemContextByIndices, selectedListItemContext]
  )

  const resolveActiveListItemInteraction = useCallback(
    (activeEditor: TiptapEditor) => {
      const activeListItemContext = resolveEffectiveSelectedListItemContext(activeEditor)
      const liveSelectionListItemContext =
        getNodeSelectedNestedListItemContext(activeEditor) ??
        getSelectionAnchorNestedListItemContext(activeEditor)
      const shouldRestoreSelectedListItemContext = Boolean(
        activeListItemContext &&
          (!liveSelectionListItemContext ||
            !isSameNestedListItemContext(liveSelectionListItemContext, activeListItemContext))
      )
      const activeListItemName = shouldRestoreSelectedListItemContext ? null : getActiveListItemName(activeEditor)
      const fallbackListItemName = getListItemNameFromContext(activeListItemContext)
      const listItemName = activeListItemName ?? fallbackListItemName
      return {
        listItemName,
        context: activeListItemContext,
        shouldRestoreNodeSelection: Boolean(
          shouldRestoreSelectedListItemContext && activeListItemContext && listItemName
        ),
      }
    },
    [
      getNodeSelectedNestedListItemContext,
      getSelectionAnchorNestedListItemContext,
      resolveEffectiveSelectedListItemContext,
    ]
  )

  useEffect(() => {
    selectedListItemContextRef.current = selectedListItemContext
  }, [selectedListItemContext])

  const resolveNestedListItemDropIndicatorByClientY = useCallback(
    (listElement: HTMLElement, clientY: number) => resolveNestedListItemDropIndicator(listElement, clientY),
    []
  )

  const focusTopLevelBlock = useCallback((blockIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const textPosition = getEditableTextPositionForTopLevelBlock(currentEditor, blockIndex)
    currentEditor.commands.focus(textPosition ?? getTopLevelBlockPosition(currentEditor, blockIndex))
  }, [])

  const focusNearestInsertedCalloutBody = useCallback((fallbackIndex?: number | null) => {
    if (typeof window === "undefined") return

    const syncFocus = () => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const { doc } = currentEditor.state
      if (doc.childCount === 0) return

      const selectionIndex = getTopLevelBlockIndexFromSelection(currentEditor)
      const candidateIndices = Array.from(
        new Set(
          [selectionIndex - 1, selectionIndex, fallbackIndex, typeof fallbackIndex === "number" ? fallbackIndex + 1 : null]
            .filter((value): value is number => typeof value === "number" && value >= 0 && value < doc.childCount)
        )
      )
      const calloutIndex = candidateIndices.find((index) => doc.child(index)?.type.name === "calloutBlock")
      if (typeof calloutIndex !== "number") return

      focusTopLevelBlock(calloutIndex)
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(syncFocus)
    })
  }, [focusTopLevelBlock])

  const replaceEditorDocFromExternalValue = useCallback((nextDoc: BlockEditorDoc, fallbackEditor?: TiptapEditor | null) => {
    const currentEditor = editorRef.current ?? fallbackEditor
    if (!currentEditor) return

    currentEditor.chain().setMeta("addToHistory", false).setContent(nextDoc, { emitUpdate: false }).run()
    resetEditorUndoHistory(currentEditor, emptyHistoryStateRef.current)
    markCommittedDoc(nextDoc)
  }, [markCommittedDoc])

  const replaceEditorDoc = useCallback(
    (nextDoc: BlockEditorDoc, focusIndex?: number | null) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      discardPendingMarkdownCommit()
      currentEditor.commands.setContent(nextDoc, { emitUpdate: false })
      syncSerializedDoc(nextDoc)

      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          if (typeof focusIndex === "number") {
            focusTopLevelBlock(focusIndex)
          } else {
            currentEditor.commands.focus()
          }
        })
      }
    },
    [discardPendingMarkdownCommit, focusTopLevelBlock, syncSerializedDoc]
  )

  const mutateTopLevelBlocks = useCallback(
    (
      mutator: (doc: BlockEditorDoc) => BlockEditorDoc,
      focusIndex?: number | null
    ) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const nextDoc = mutator(currentEditor.getJSON() as BlockEditorDoc)
      replaceEditorDoc(nextDoc, focusIndex)
    },
    [replaceEditorDoc]
  )

  const replaceCurrentParagraphWithBlocks = useCallback((blocks: BlockEditorDoc[], focusBlockIndex = 0) => {
    const currentEditor = editorRef.current
    if (!currentEditor || blocks.length === 0) return false

    const { selection, schema } = currentEditor.state
    const paragraph = selection.$from.parent
    if (paragraph.type.name !== "paragraph") return false

    const from = selection.$from.before(selection.$from.depth)
    const to = selection.$from.after(selection.$from.depth)
    const nextNodes = blocks.map((block) => schema.nodeFromJSON(block))
    const normalizedFocusBlockIndex = Math.max(0, Math.min(focusBlockIndex, nextNodes.length - 1))
    const focusNode = nextNodes[normalizedFocusBlockIndex]
    const focusNodeStartPos = from + nextNodes
      .slice(0, normalizedFocusBlockIndex)
      .reduce((sum, node) => sum + node.nodeSize, 0)

    let transaction = currentEditor.state.tr.replaceWith(from, to, Fragment.fromArray(nextNodes))

    if (focusNode) {
      const selectionPos =
        getFirstEditableTextPositionInNode(focusNode, focusNodeStartPos) ??
        Math.max(1, focusNodeStartPos + 1)
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionPos))
    }

    currentEditor.view.dispatch(transaction.scrollIntoView())
    currentEditor.view.focus()
    syncSerializedDoc(currentEditor.getJSON() as BlockEditorDoc)
    return true
  }, [syncSerializedDoc])

  const createInitialTableNode = useCallback(() => {
    const readableWidthBudget = Math.max(
      TABLE_MIN_COLUMN_WIDTH_PX * DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      getCurrentEditorReadableWidthPx(editorRef.current) - 2
    )
    const targetInnerWidth = getPreferredNormalTableTotalWidth(
      DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      readableWidthBudget
    )
    const initialLayout: MarkdownTableLayout = {
      overflowMode: "normal",
      columnWidths: createBalancedTableColumnWidths(
        DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
        targetInnerWidth
      ),
    }

    return createEmptyTableNode(
      DEFAULT_EMPTY_TABLE_ROW_COUNT,
      DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
      initialLayout
    )
  }, [])

  const buildSlashWholeParagraphReplacement = useCallback((itemId: string) => {
    switch (itemId) {
      case "paragraph":
        return { blocks: [createParagraphNode("")], focusBlockIndex: 0 }
      case "heading-1":
        return { blocks: [createHeadingNode(1, "")], focusBlockIndex: 0 }
      case "heading-2":
        return { blocks: [createHeadingNode(2, "")], focusBlockIndex: 0 }
      case "heading-3":
        return { blocks: [createHeadingNode(3, "")], focusBlockIndex: 0 }
      case "heading-4":
        return { blocks: [createHeadingNode(4, "")], focusBlockIndex: 0 }
      case "bullet-list":
        return { blocks: [createBulletListNode([""])], focusBlockIndex: 0 }
      case "ordered-list":
        return { blocks: [createOrderedListNode([""])], focusBlockIndex: 0 }
      case "checklist":
        return { blocks: [createTaskListNode([{ checked: false, text: "" }])], focusBlockIndex: 0 }
      case "quote":
        return { blocks: [createBlockquoteNode("")], focusBlockIndex: 0 }
      case "code-block":
        return {
          blocks: [createCodeBlockNode(getPreferredCodeLanguage(), "")],
          focusBlockIndex: 0,
        }
      case "table":
        return {
          blocks: [createInitialTableNode()],
          focusBlockIndex: 0,
        }
      case "callout":
        return {
          blocks: [
            createCalloutNode({
              kind: "tip",
              title: "",
              body: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "toggle":
        return {
          blocks: [
            createToggleNode({
              title: "",
              body: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "bookmark":
        return {
          blocks: [
            createBookmarkNode({
              url: "",
              title: "",
              description: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "embed":
        return {
          blocks: [
            createEmbedNode({
              url: "",
              title: "",
              caption: "",
            }),
          ],
          focusBlockIndex: 0,
        }
      case "formula":
        return {
          blocks: [createFormulaNode({ formula: "" })],
          focusBlockIndex: 0,
        }
      case "divider":
        return {
          blocks: [createHorizontalRuleNode(), createParagraphNode("")],
          focusBlockIndex: 1,
        }
      case "mermaid":
        if (!enableMermaidBlocks) return null
        return {
          blocks: [createMermaidNode("")],
          focusBlockIndex: 0,
        }
      default:
        return null
    }
  }, [createInitialTableNode, enableMermaidBlocks])

  const transformCurrentParagraphViaSlash = useCallback((itemId: string) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    if (TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(itemId) && isTableSelectionActive(currentEditor)) {
      return false
    }

    const { selection } = currentEditor.state
    if (selection.$from.parent.type.name !== "paragraph") return false

    const replacementSpec = buildSlashWholeParagraphReplacement(itemId)
    if (!replacementSpec || replacementSpec.blocks.length === 0) {
      return false
    }

    const { blocks, focusBlockIndex = 0 } = replacementSpec
    const replacementBlockType = blocks[0]?.type ?? ""

    if (["bulletList", "orderedList", "taskList"].includes(replacementBlockType)) {
      const currentBlockIndex = getTopLevelBlockIndexFromSelection(currentEditor)
      const nextSibling =
        currentBlockIndex >= 0 && currentBlockIndex < currentEditor.state.doc.childCount - 1
          ? currentEditor.state.doc.child(currentBlockIndex + 1)
          : null

      if (nextSibling?.type.name === replacementBlockType) {
        return replaceCurrentParagraphWithBlocks([...blocks, createParagraphNode()], focusBlockIndex)
      }
    }

    return replaceCurrentParagraphWithBlocks(blocks, focusBlockIndex)
  }, [buildSlashWholeParagraphReplacement, replaceCurrentParagraphWithBlocks])

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

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setSelectionTick((prev) => prev + 1)
    }

    editor.on("selectionUpdate", handleSelectionUpdate)
    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    const root = getContentRoot()
    if (!root || !editor) return

    const listItems = Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR))
    listItems.forEach((element) => {
      element.removeAttribute("data-block-selected")
      if (element.getAttribute("data-task-item") !== "true") {
        element.removeAttribute("draggable")
      }
    })

    const selectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      selectedNestedListItemContext.listItemElement.setAttribute("data-block-selected", "true")
      selectedNestedListItemContext.listItemElement.setAttribute("draggable", "true")
    }

    return () => {
      listItems.forEach((element) => {
        element.removeAttribute("data-block-selected")
        if (element.getAttribute("data-task-item") !== "true") {
          element.removeAttribute("draggable")
        }
      })
    }
  }, [editor, getContentRoot, resolveEffectiveSelectedListItemContext, selectedListItemContext, selectionTick])

  useEffect(() => {
    selectedBlockNodeIndexRef.current = selectedBlockNodeIndex
  }, [selectedBlockNodeIndex])

  useEffect(() => {
    const root = getContentRoot()
    if (!root) return
    if (selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current) {
      root.setAttribute("data-keyboard-block-selection", "true")
      return
    }
    root.removeAttribute("data-keyboard-block-selection")
  }, [getContentRoot, selectedBlockNodeIndex, selectionTick])

  useEffect(() => {
    if (!editor) return
    let disposed = false

    const notifySelection = () => {
      const selection = editor.state.selection as typeof editor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const hasTextRangeSelection = selection instanceof TextSelection && !selection.empty
      const liveSelectedNestedListItemContext = getNodeSelectedNestedListItemContext(editor)
      const selectionAnchorNestedListItemContext = getSelectionAnchorNestedListItemContext(editor)
      const effectiveSelectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
      const shouldPreserveSelectedListItemContextForAnchorSelection = Boolean(
        hasTextRangeSelection &&
          selectionAnchorNestedListItemContext &&
          effectiveSelectedNestedListItemContext &&
          isSameNestedListItemContext(
            selectionAnchorNestedListItemContext,
            effectiveSelectedNestedListItemContext
          )
      )
      const selectedNestedListItemContext =
        liveSelectedNestedListItemContext?.listItemElement?.isConnected
          ? liveSelectedNestedListItemContext
          : shouldPreserveSelectedListItemContextForAnchorSelection
            ? selectionAnchorNestedListItemContext
            : effectiveSelectedNestedListItemContext
      if (liveSelectedNestedListItemContext?.listItemElement?.isConnected) {
        setSelectedListItemContext(liveSelectedNestedListItemContext)
      } else if (shouldPreserveSelectedListItemContextForAnchorSelection && selectionAnchorNestedListItemContext) {
        setSelectedListItemContext(selectionAnchorNestedListItemContext)
      }
      if (hasTextRangeSelection && keyboardBlockSelectionStickyRef.current) {
        keyboardBlockSelectionStickyRef.current = false
      }
      const nextBlockIndex = getTopLevelBlockIndexFromSelection(editor)
      const isTopLevelBlockNodeSelection = Boolean(
        selection instanceof NodeSelection && selection.$from.depth === 0 && selection.node?.isBlock
      )
      const isNestedListItemNodeSelection = Boolean(selectedNestedListItemContext)
      const inTableContext = isTableSelectionActive(editor) ? 1 : 0
      const selectedNestedListItemSignature = selectedNestedListItemContext
        ? `${selectedNestedListItemContext.listBlockIndex}:${selectedNestedListItemContext.listPath.join(".")}:${selectedNestedListItemContext.itemIndex}`
        : "none"
      const nextSignature = `${nextBlockIndex ?? "none"}:${hasTextRangeSelection ? 1 : 0}:${isTopLevelBlockNodeSelection ? 1 : 0}:${isNestedListItemNodeSelection ? 1 : 0}:${keyboardBlockSelectionStickyRef.current ? 1 : 0}:${inTableContext}:${selectedNestedListItemSignature}`
      if (nextSignature === selectionUiSignatureRef.current) {
        return
      }
      selectionUiSignatureRef.current = nextSignature
      setSelectionTick((prev) => prev + 1)
      setSelectedBlockIndex(nextBlockIndex)
      if (hasTextRangeSelection && !selectedNestedListItemContext) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        setTextSelectionBlockIndex(nextBlockIndex)
        setSelectedListItemContext(null)
        return
      }
      setTextSelectionBlockIndex(null)
      if (isNestedListItemNodeSelection) {
        setClickedBlockIndex(null)
        setSelectedBlockNodeIndex(null)
        if (selectedNestedListItemContext?.listItemElement?.isConnected) {
          setSelectedListItemContext(selectedNestedListItemContext)
        }
        return
      }
      if (isTopLevelBlockNodeSelection) {
        setSelectedListItemContext(null)
        if (keyboardBlockSelectionStickyRef.current) {
          setClickedBlockIndex(null)
          setSelectedBlockNodeIndex(nextBlockIndex)
          return
        }

        // Ignore incidental node selection from content clicks/drags.
        const editablePos = getEditableTextPositionForTopLevelBlock(editor, nextBlockIndex)
        if (editablePos !== null) {
          const nextTextSelection = TextSelection.create(editor.state.doc, editablePos)
          editor.view.dispatch(editor.state.tr.setSelection(nextTextSelection))
        }
        setSelectedBlockNodeIndex(null)
        return
      }
      if (!keyboardBlockSelectionStickyRef.current) {
        setSelectedBlockNodeIndex(null)
      }
    }

    const notifyBlur = () => {
      selectionUiSignatureRef.current = ""
      setSelectionTick((prev) => prev + 1)
      const finalizeBlur = () => {
        if (disposed || editor.isFocused) return
        setClickedBlockIndex(null)
        setSelectedBlockIndex(null)
        setTextSelectionBlockIndex(null)
        if (!keyboardBlockSelectionStickyRef.current) {
          setSelectedBlockNodeIndex(null)
        }
      }
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(finalizeBlur)
        return
      }
      finalizeBlur()
    }

    notifySelection()
    editor.on("selectionUpdate", notifySelection)
    editor.on("focus", notifySelection)
    editor.on("blur", notifyBlur)
    return () => {
      disposed = true
      editor.off("selectionUpdate", notifySelection)
      editor.off("focus", notifySelection)
      editor.off("blur", notifyBlur)
      selectionUiSignatureRef.current = ""
    }
  }, [
    editor,
    getNodeSelectedNestedListItemContext,
    getSelectionAnchorNestedListItemContext,
    resolveEffectiveSelectedListItemContext,
  ])

  useEffect(() => {
    if (!editor) return

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const targetListItemContext = findNestedListItemContextFromTarget(event.target)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const isOuterListItemGesture = isOuterListItemSelectionGesture(event, targetListItemContext)
      const isOuterSelectionGesture = isOuterBlockSelectionGesture(event, targetBlockIndex)
      if (isTableSelectionActive(editor) && !isOuterSelectionGesture && !isOuterListItemGesture) return
      if (!isOuterSelectionGesture && !isOuterListItemGesture) {
        const shouldReleaseStickyBlockSelection =
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !event.shiftKey &&
          keyboardBlockSelectionStickyRef.current &&
          selectedBlockNodeIndexRef.current !== null
        if (shouldReleaseStickyBlockSelection) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }
        return
      }
      if (isOuterListItemGesture && targetListItemContext) {
        event.preventDefault()
        event.stopPropagation()
        skipNextPointerDownSelectionClearRef.current = true
        setClickedBlockIndex(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        setSelectedListItemContext(targetListItemContext)
        selectNestedListItemNode(editor, targetListItemContext)
        clearNativeTextSelection()
        return
      }
      if (targetBlockIndex === null) return
      event.preventDefault()
      event.stopPropagation()
      skipNextPointerDownSelectionClearRef.current = true
      promoteTopLevelBlockSelection(targetBlockIndex)
    }

    const editorDom = editor.view.dom
    editorDom.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    return () => {
      editorDom.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
    }
  }, [
    editor,
    findTopLevelBlockIndexByClientPosition,
    findTopLevelBlockIndexFromTarget,
    isOuterBlockSelectionGesture,
    findNestedListItemContextFromTarget,
    isOuterListItemSelectionGesture,
    clearNativeTextSelection,
    promoteTopLevelBlockSelection,
    syncSelectedBlockNodeSurface,
  ])

  useEffect(() => {
    if (!editor || typeof document === "undefined" || typeof window === "undefined") return

    const handleKeyDownCapture = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
      if (slashMenuState) return

      const currentEditor = editorRef.current
      if (!currentEditor) return
      const activeListItemInteraction = resolveActiveListItemInteraction(currentEditor)
      if (activeListItemInteraction.listItemName) {
        event.preventDefault()
        event.stopPropagation()
        clearStickyTopLevelBlockSelection()
        if (
          activeListItemInteraction.shouldRestoreNodeSelection &&
          activeListItemInteraction.context
        ) {
          selectNestedListItemTextAnchor(currentEditor, activeListItemInteraction.context)
          clearNativeTextSelection()
        }
        const handled = event.shiftKey
          ? currentEditor.commands.liftListItem(activeListItemInteraction.listItemName)
          : currentEditor.commands.sinkListItem(activeListItemInteraction.listItemName)
        if (handled) {
          setSelectionTick((prev) => prev + 1)
        }
        return
      }
      const editorDom = currentEditor.view.dom
      const activeElement = document.activeElement
      const domSelection = window.getSelection()
      const anchorElement =
        domSelection?.anchorNode instanceof Element
          ? domSelection.anchorNode
          : domSelection?.anchorNode?.parentElement ?? null
      const selectionInsideEditor =
        (activeElement instanceof Element && editorDom.contains(activeElement)) ||
        (anchorElement instanceof Element && editorDom.contains(anchorElement))
      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(anchorElement ?? activeElement ?? event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)
      if (!selectionInsideEditor && hoveredBlockIndex === null) return
      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return
      const selection = currentEditor.state.selection as typeof currentEditor.state.selection & {
        node?: { isBlock?: boolean }
      }
      const isTopLevelBlockNodeSelection = Boolean(
        selection.$from.depth === 0 && selection.node?.isBlock
      )
      if (isTopLevelBlockNodeSelection) return

      event.preventDefault()
      event.stopPropagation()
      promoteTopLevelBlockSelection(targetBlockIndex)
    }

    document.addEventListener("keydown", handleKeyDownCapture, true)
    return () => {
      document.removeEventListener("keydown", handleKeyDownCapture, true)
    }
  }, [
    clearNativeTextSelection,
    clearStickyTopLevelBlockSelection,
    editor,
    findTopLevelBlockIndexFromTarget,
    hoveredBlockIndex,
    promoteTopLevelBlockSelection,
    resolveActiveListItemInteraction,
    slashMenuState,
  ])

  useEffect(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor) return
    let rafId: number | null = null

    const syncBubble = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) {
        scheduleBubbleHide()
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      let selection = activeEditor.state.selection
      if (selection.empty && typeof window !== "undefined" && !isTableColumnRailResizeActive()) {
        const domSelection = window.getSelection()
        const range =
          domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
        const commonAncestor =
          range?.commonAncestorContainer instanceof Element
            ? range.commonAncestorContainer
            : range?.commonAncestorContainer?.parentElement ?? null

        if (range && domSelection && !domSelection.isCollapsed && commonAncestor && activeEditor.view.dom.contains(commonAncestor)) {
          const syncPmSelectionFromRange = (from: number, to: number) => {
            if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) return false
            const nextSelection = TextSelection.create(
              activeEditor.state.doc,
              Math.min(from, to),
              Math.max(from, to)
            )
            if (!nextSelection.eq(activeEditor.state.selection)) {
              activeEditor.view.dispatch(activeEditor.state.tr.setSelection(nextSelection))
              selection = activeEditor.state.selection
            }
            return true
          }

          let synced = false
          try {
            const from = activeEditor.view.posAtDOM(range.startContainer, range.startOffset)
            const to = activeEditor.view.posAtDOM(range.endContainer, range.endOffset)
            synced = syncPmSelectionFromRange(from, to)
          } catch {
            synced = false
          }

          if (!synced) {
            const rangeRects = Array.from(range.getClientRects())
            const startRect = rangeRects[0] ?? range.getBoundingClientRect()
            const endRect = rangeRects[rangeRects.length - 1] ?? startRect
            const startCoords = activeEditor.view.posAtCoords({
              left: startRect.left + 1,
              top: startRect.top + startRect.height / 2,
            })
            const endCoords = activeEditor.view.posAtCoords({
              left: Math.max(endRect.left + 1, endRect.right - 1),
              top: endRect.top + endRect.height / 2,
            })
            if (startCoords?.pos && endCoords?.pos) {
              syncPmSelectionFromRange(startCoords.pos, endCoords.pos)
            }
          }
        }
      }

      const isImageNodeSelected = activeEditor.isActive("resizableImage")
      const isTableActive = isTableSelectionActive(activeEditor)
      const isTableStructuralSelection = hasTableStructuralSelection(activeEditor)
      const canShowTextToolbar =
        !selection.empty &&
        !isImageNodeSelected &&
        !activeEditor.isActive("codeBlock") &&
        !activeEditor.isActive("rawMarkdownBlock") &&
        !isTableStructuralSelection

      if (canShowTextToolbar && mouseTextSelectionInProgressRef.current) {
        syncBubbleOnMouseUpRef.current = true
        if (bubbleToolbarHoveredRef.current) return
        setBubbleState((prev) =>
          prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
        )
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      if (!isImageNodeSelected && !canShowTextToolbar && !isTableActive) {
        if (bubbleToolbarHoveredRef.current) return
        scheduleBubbleHide()
        if (!tableMenuState) {
          scheduleTableQuickRailHide()
        }
        return
      }

      if (isTableActive && !canShowTextToolbar) {
        cancelBubbleHide()
        setBubbleState(hideFloatingBubbleState)
        const anchorDom = activeEditor.view.domAtPos(selection.from).node
        const anchorElement =
          anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
        if (isTableStructuralSelection && anchorElement?.closest(".aq-table-shell, .tableWrapper, table")) {
          syncTableQuickRailFromElement(anchorElement)
          return
        }
        if (!tableMenuState) {
          hideTableQuickRailImmediately()
        }
        return
      }

      cancelBubbleHide()
      hideTableQuickRailImmediately()

      const startCoords = activeEditor.view.coordsAtPos(selection.from)
      const endCoords = activeEditor.view.coordsAtPos(isImageNodeSelected ? selection.from : selection.to)
      const nextBubbleState = resolveFloatingBubbleStateFromCoords(
        isImageNodeSelected ? "image" : "text",
        startCoords,
        endCoords
      )
      setBubbleState((prev) =>
        areFloatingBubbleStatesEqual(prev, nextBubbleState) ? prev : nextBubbleState
      )
    }

    const scheduleSyncBubble = () => {
      if (typeof window === "undefined") {
        syncBubble()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncBubble()
      })
    }

    const handleDocumentSelectionChange = () => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (isTableColumnRailResizeActive()) {
        clearWindowTextSelection()
        return
      }
      const selection = window.getSelection()
      const anchorNode = selection?.anchorNode ?? null
      const anchorElement =
        anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null
      if (anchorElement && !activeEditor.view.dom.contains(anchorElement)) return
      scheduleSyncBubble()
    }

    const handleEditorPointerDownCapture = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (!(event.target instanceof Node) || !activeEditor.view.dom.contains(event.target)) return
      preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(activeEditor))
      if (tryStartTableColumnResizeFromDomHandle(event.target, event.pointerId, event.clientX)) {
        event.preventDefault()
        event.stopPropagation()
        event.stopImmediatePropagation?.()
        mouseTextSelectionInProgressRef.current = false
        syncBubbleOnMouseUpRef.current = false
        return
      }
      mouseTextSelectionInProgressRef.current = true
      syncBubbleOnMouseUpRef.current = false
      if (bubbleToolbarHoveredRef.current) return
      setBubbleState((prev) =>
        prev.visible && prev.mode === "text" ? hideFloatingBubbleState(prev) : prev
      )
    }

    const handleEditorMouseDownCapture = (event: MouseEvent) => {
      const activeEditor = editorRef.current ?? currentEditor
      if (!activeEditor) return
      if (!(event.target instanceof Node) || !activeEditor.view.dom.contains(event.target)) return
      if (!(event.target instanceof Element) || !event.target.closest(".column-resize-handle")) return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation?.()
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (!mouseTextSelectionInProgressRef.current) return
      if (event.pointerType && event.pointerType !== "mouse") return
      mouseTextSelectionInProgressRef.current = false
      if (!syncBubbleOnMouseUpRef.current) return
      syncBubbleOnMouseUpRef.current = false
      scheduleSyncBubble()
    }

    scheduleSyncBubble()
    currentEditor.on("selectionUpdate", scheduleSyncBubble)
    currentEditor.on("focus", scheduleSyncBubble)
    document.addEventListener("selectionchange", handleDocumentSelectionChange)
    document.addEventListener("pointerdown", handleEditorPointerDownCapture, true)
    document.addEventListener("mousedown", handleEditorMouseDownCapture, true)
    window.addEventListener("scroll", scheduleSyncBubble, { capture: true, passive: true })
    window.addEventListener("resize", scheduleSyncBubble, { passive: true })
    window.addEventListener("pointerup", handleWindowPointerUp, true)
    window.addEventListener("pointercancel", handleWindowPointerUp, true)
    return () => {
      currentEditor.off("selectionUpdate", scheduleSyncBubble)
      currentEditor.off("focus", scheduleSyncBubble)
      document.removeEventListener("selectionchange", handleDocumentSelectionChange)
      document.removeEventListener("pointerdown", handleEditorPointerDownCapture, true)
      document.removeEventListener("mousedown", handleEditorMouseDownCapture, true)
      window.removeEventListener("scroll", scheduleSyncBubble, true)
      window.removeEventListener("resize", scheduleSyncBubble)
      window.removeEventListener("pointerup", handleWindowPointerUp, true)
      window.removeEventListener("pointercancel", handleWindowPointerUp, true)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
      mouseTextSelectionInProgressRef.current = false
      syncBubbleOnMouseUpRef.current = false
      cancelBubbleHide()
    }
  }, [
    cancelBubbleHide,
    bubbleToolbarHoveredRef,
    clearWindowTextSelection,
    editor,
    hasTableStructuralSelection,
    hideTableQuickRailImmediately,
    isTableColumnRailResizeActive,
    scheduleBubbleHide,
    scheduleTableQuickRailHide,
    setBubbleState,
    tryStartTableColumnResizeFromDomHandle,
    syncTableQuickRailFromElement,
    tableMenuState,
  ])

  useEffect(() => {
    return () => {
      cancelHoveredBlockClear()
      cancelBubbleHide()
      cancelTableQuickRailHide()
    }
  }, [cancelBubbleHide, cancelHoveredBlockClear, cancelTableQuickRailHide])

  useEffect(() => {
    if (!editor || !hasExternalMarkdownChanged(value)) return
    discardPendingMarkdownCommit()
    const nextDoc = restoreEditorDocCodeBlocksFromMarkdown(value, downgradeDisabledFeatureNodes(parseMarkdownToEditorDoc(value), enableMermaidBlocks)).doc
    replaceEditorDocFromExternalValue(nextDoc, editor)
  }, [discardPendingMarkdownCommit, editor, enableMermaidBlocks, hasExternalMarkdownChanged, replaceEditorDocFromExternalValue, value])

  useEffect(() => {
    const restored = editor && value.trim() ? restoreEditorDocCodeBlocksFromMarkdown(value, editor.getJSON() as BlockEditorDoc) : null
    if (!restored?.changed) return
    discardPendingMarkdownCommit()
    replaceEditorDocFromExternalValue(restored.doc, editor!)
  }, [discardPendingMarkdownCommit, editor, replaceEditorDocFromExternalValue, value])

  useEffect(
    () => () => {
      cancelPendingMarkdownCommit()
      flushPendingMarkdownCommit()
    },
    [cancelPendingMarkdownCommit, flushPendingMarkdownCommit]
  )

  useEffect(() => {
    if (!editor) return

    const flushOnBlur = () => {
      cancelPendingMarkdownCommit()
      flushPendingMarkdownCommit()
    }

    editor.on("blur", flushOnBlur)
    return () => {
      editor.off("blur", flushOnBlur)
    }
  }, [cancelPendingMarkdownCommit, editor, flushPendingMarkdownCommit])

  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
  }, [editor])

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

  const withTrailingParagraph = useCallback(
    (blocks: BlockEditorDoc[]): NonNullable<BlockEditorDoc["content"]> => [...blocks, createParagraphNode()],
    []
  )

  const insertBlocksAtCursor = useCallback(
    (blocks: BlockEditorDoc[], replaceCurrentEmptyParagraph = false) => {
      if (!editor) return
      insertDocContent(
        {
          type: "doc",
          content: withTrailingParagraph(blocks),
        },
        replaceCurrentEmptyParagraph
      )
      closeSlashMenu()
    },
    [closeSlashMenu, editor, insertDocContent, withTrailingParagraph]
  )

  const insertBlocksAtCursorExact = useCallback(
    (blocks: BlockEditorDoc[], replaceCurrentEmptyParagraph = false) => {
      if (!editor) return
      insertDocContent(
        {
          type: "doc",
          content: blocks,
        },
        replaceCurrentEmptyParagraph
      )
      closeSlashMenu()
    },
    [closeSlashMenu, editor, insertDocContent]
  )

  const canInsertTopLevelBlockAtSelection = useCallback(() => {
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return false
    if (isTableSelectionActive(activeEditor)) return false
    if (isTopLevelInsertBlockedByTableUi()) return false

    if (typeof window !== "undefined") {
      const selection = window.getSelection()
      const anchorElement =
        selection?.anchorNode instanceof Element
          ? selection.anchorNode
          : selection?.anchorNode?.parentElement
      if (anchorElement?.closest("table, .tableWrapper, .aq-table-shell")) {
        return false
      }
    }

    return true
  }, [editor, isTopLevelInsertBlockedByTableUi])

  const insertMermaidBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    if (!enableMermaidBlocks) return
    insertBlocksAtCursor([createMermaidNode("")], true)
  }, [canInsertTopLevelBlockAtSelection, enableMermaidBlocks, insertBlocksAtCursor])

  const insertCalloutBlock = useCallback(() => {
    const currentEditor = editorRef.current ?? editor
    if (!currentEditor || isTableSelectionActive(currentEditor)) return

    const selectionIndexBeforeInsert = getTopLevelBlockIndexFromSelection(currentEditor)
    insertDocContent(
      {
        type: "doc",
        content: withTrailingParagraph([
          createCalloutNode({
            kind: "tip",
            title: "",
            body: "",
          }),
        ]),
      },
      isSelectionInEmptyParagraph()
    )
    closeSlashMenu()
    focusNearestInsertedCalloutBody(selectionIndexBeforeInsert)
  }, [closeSlashMenu, editor, focusNearestInsertedCalloutBody, insertDocContent, isSelectionInEmptyParagraph, withTrailingParagraph])

  const insertToggleBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createToggleNode({
          title: "",
          body: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertChecklistBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursorExact([createTaskListNode([{ checked: false, text: "" }])], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursorExact])

  const insertBookmarkBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createBookmarkNode({
          url: "",
          title: "",
          description: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertEmbedBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createEmbedNode({
          url: "",
          title: "",
          caption: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertFileBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor(
      [
        createFileBlockNode({
          url: "",
          name: "",
          description: "",
        }),
      ],
      true
    )
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertFormulaBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createFormulaNode({ formula: "" })], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertInlineFormula = useCallback(() => {
    if (!editor) return
    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, " ").trim()
    editor
      .chain()
      .focus()
      .insertContent(createInlineFormulaNode({ formula: selectedText || "x^2" }))
      .run()
  }, [editor])

  const insertTableBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createInitialTableNode()], true)
  }, [canInsertTopLevelBlockAtSelection, createInitialTableNode, insertBlocksAtCursor])

  const canInsertTable = canInsertTopLevelBlockAtSelection()

  const insertCodeBlock = useCallback(() => {
    if (!canInsertTopLevelBlockAtSelection()) return
    insertBlocksAtCursor([createCodeBlockNode(getPreferredCodeLanguage(), "")], true)
  }, [canInsertTopLevelBlockAtSelection, insertBlocksAtCursor])

  const insertBlocksAtIndex = useCallback(
    (insertionIndex: number, blocks: NonNullable<BlockEditorDoc["content"]>, focusIndex = insertionIndex) => {
      mutateTopLevelBlocks((doc) => insertTopLevelBlockAt(doc, insertionIndex, blocks), focusIndex)
    },
    [mutateTopLevelBlocks]
  )

  const isHttpUrl = useCallback((value: string) => {
    try {
      const parsed = new URL(value.trim())
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }, [])

  const fetchUnfurlMetadata = useCallback(async (url: string) => {
    try {
      const response = await fetch(`/api/editor/unfurl?url=${encodeURIComponent(url)}`)
      const payload = await response.json()
      if (!response.ok || !payload?.ok || !payload?.data) return null
      return payload.data as {
        title?: string
        description?: string
        siteName?: string
        provider?: string
        thumbnailUrl?: string
        embedUrl?: string
      }
    } catch {
      return null
    }
  }, [])

  const createCardNodeFromUrl = useCallback(
    async (url: string) => {
      const trimmedUrl = url.trim()
      const cardKind = inferCardKindFromUrl(trimmedUrl)
      const metadata = await fetchUnfurlMetadata(trimmedUrl)
      const fallbackProvider = inferLinkProvider(trimmedUrl)
      const fallbackTitle = (() => {
        try {
          const parsed = new URL(trimmedUrl)
          const lastSegment = parsed.pathname.split("/").filter(Boolean).pop() || ""
          return decodeURIComponent(lastSegment || parsed.hostname.replace(/^www\./i, "")) || trimmedUrl
        } catch {
          return trimmedUrl
        }
      })()

      if (cardKind === "file") {
        return createFileBlockNode({
          url: trimmedUrl,
          name: String(metadata?.title || fallbackTitle || "첨부 파일").trim(),
          description: String(metadata?.description || "").trim(),
        })
      }

      if (cardKind === "embed") {
        return createEmbedNode({
          url: trimmedUrl,
          title: String(metadata?.title || fallbackProvider || "임베드").trim(),
          caption: String(metadata?.description || "").trim(),
          siteName: String(metadata?.siteName || "").trim(),
          provider: String(metadata?.provider || fallbackProvider || "").trim(),
          thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
          embedUrl: String(metadata?.embedUrl || resolveEmbedPreviewUrl(trimmedUrl) || "").trim(),
        })
      }

      return createBookmarkNode({
        url: trimmedUrl,
        title: String(metadata?.title || fallbackTitle || trimmedUrl).trim(),
        description: String(metadata?.description || "").trim(),
        siteName: String(metadata?.siteName || "").trim(),
        provider: String(metadata?.provider || fallbackProvider || "").trim(),
        thumbnailUrl: String(metadata?.thumbnailUrl || "").trim(),
      })
    },
    [fetchUnfurlMetadata]
  )

  const insertCardBlockFromUrl = useCallback(
    async (url: string) => {
      const nextNode = await createCardNodeFromUrl(url)
      return insertDocContent(
        {
          type: "doc",
          content: [nextNode, { type: "paragraph" }],
        },
        isSelectionInEmptyParagraph()
      )
    },
    [createCardNodeFromUrl, insertDocContent, isSelectionInEmptyParagraph]
  )

  const openLinkPrompt = useCallback(() => {
    if (!editor || typeof window === "undefined") return
    const previousHref = String(editor.getAttributes("link").href || "")
    const href = window.prompt("링크 주소를 입력하세요.", previousHref)
    if (href === null) return
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: href.trim() }).run()
  }, [editor])

  const handleToolbarButtonMouseDown = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    event.preventDefault()
  }, [])

  const runBoldAction = useCallback(() => {
    runInlineMarkCommand(editor, "bold")
  }, [editor])

  const runItalicAction = useCallback(() => {
    runInlineMarkCommand(editor, "italic")
  }, [editor])

  const runInlineCodeAction = useCallback(() => {
    runInlineCode(editor)
  }, [editor])

  const runStrikeAction = useCallback(() => {
    runInlineMarkCommand(editor, "strike")
  }, [editor])

  const activeInlineColor = getActiveInlineColor(editor)
  const isInlineCodeActive = isInlineCodeMarkActive(editor)
  const activeInlineTextStyleOption = useMemo(() => {
    void selectionTick
    return getActiveInlineTextStyleOption(editor)
  }, [editor, selectionTick])

  const applyInlineColor = useCallback(
    (color?: string | null) => {
      if (runInlineColor(editor, color)) {
        setIsInlineColorMenuOpen(false)
        setIsBubbleInlineColorMenuOpen(false)
      }
    },
    [editor]
  )

  const applyInlineTextStyle = useCallback(
    (styleId: InlineTextStyleOption["id"]) => {
      if (runInlineTextStyle(editor, styleId)) {
        setIsBubbleTextStyleMenuOpen(false)
      }
    },
    [editor]
  )

  const moveTaskItemInFirstTaskList = useCallback(
    (sourceIndex: number, insertionIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const doc = currentEditor.getJSON() as BlockEditorDoc
      const blocks = Array.isArray(doc.content) ? (doc.content as BlockEditorDoc[]) : []
      const firstListIndex = blocks.findIndex(
        (block) => block?.type === "taskList" || block?.type === "bulletList" || block?.type === "orderedList"
      )
      if (firstListIndex < 0) return

      mutateTopLevelBlocks(
        (nextDoc) =>
          moveNestedListItemToInsertionIndex(nextDoc, firstListIndex, [], sourceIndex, insertionIndex),
        firstListIndex
      )
    },
    [mutateTopLevelBlocks]
  )

  useEffect(() => {
    if (!onQaActionsReady) return

    onQaActionsReady({
      selectTableAxis: (axis) => {
        selectCurrentTableAxis(axis)
      },
      selectTableColumnViaDomFallback: (columnIndex) => {
        const currentEditor = editorRef.current ?? editor
        if (!currentEditor) return
        currentEditor.chain().focus("end").run()
        selectTableColumnByIndex(columnIndex)
      },
      setActiveTableCellAlign: (align) => {
        updateActiveTableCellAttrs({ textAlign: align })
      },
      setActiveTableCellBackground: (color) => {
        updateActiveTableCellAttrs({ backgroundColor: color })
      },
      addTableRowAfter: () => {
        editor?.chain().focus().addRowAfter().run()
      },
      addTableColumnAfter: () => {
        editor?.chain().focus().addColumnAfter().run()
      },
      deleteSelectedTableRow: () => {
        editor?.chain().focus().deleteRow().run()
      },
      deleteSelectedTableColumn: () => {
        editor?.chain().focus().deleteColumn().run()
      },
      resizeFirstTableRow: (deltaPx) => {
        resizeFirstTableRowBy(deltaPx)
      },
      resizeFirstTableColumn: (deltaPx) => {
        resizeFirstTableColumnBy(deltaPx)
      },
      focusDocumentEnd: () => {
        editor?.chain().focus("end").run()
      },
      appendCalloutBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createCalloutNode({
              kind: "tip",
              title: "",
              body: "",
            }),
          ])
        )
      },
      appendFormulaBlock: () => {
        const currentEditor = editorRef.current
        if (!currentEditor) return
        insertBlocksAtIndex(
          currentEditor.state.doc.childCount,
          withTrailingParagraph([
            createFormulaNode({
              formula: "",
            }),
          ])
        )
      },
      moveTaskItemInFirstTaskList: (sourceIndex, insertionIndex) => {
        moveTaskItemInFirstTaskList(sourceIndex, insertionIndex)
      },
      scrollCurrentSelectionIntoView: () => refocusEditorForSelectionReveal(editorRef.current ?? editor),
      getUndoDepth: () => {
        const currentEditor = editorRef.current ?? editor
        return currentEditor ? getEditorUndoDepth(currentEditor) : 0
      },
    })

    return () => {
      onQaActionsReady(null)
    }
  }, [
    editor,
    insertBlocksAtIndex,
    moveTaskItemInFirstTaskList,
    onQaActionsReady,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    selectTableColumnByIndex,
    selectCurrentTableAxis,
    updateActiveTableCellAttrs,
    withTrailingParagraph,
  ])

  const handleImageInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor) return

    const imageAttrs = await onUploadImage(file)
    const pendingInsertIndex = pendingImageInsertIndexRef.current
    pendingImageInsertIndexRef.current = null

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, [
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
      return
    }

    editor
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
  }

  const handleAttachmentInputChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || !editor || !onUploadFile) return

    const fileAttrs = await onUploadFile(file)
    const pendingInsertIndex = pendingAttachmentInsertIndexRef.current
    pendingAttachmentInsertIndexRef.current = null

    if (typeof pendingInsertIndex === "number") {
      insertBlocksAtIndex(pendingInsertIndex, [createFileBlockNode(fileAttrs), { type: "paragraph" }])
      return
    }

    insertBlocksAtCursor([createFileBlockNode(fileAttrs)], true)
  }

  const blockInsertCatalog = useMemo<BlockInsertCatalogItem[]>(
    () =>
      createWriterBlockInsertCatalog({
        attachmentFileInputRef,
        canInsertTable,
        createInitialTableNode,
        enableMermaidBlocks,
        focusEditor,
        imageFileInputRef,
        insertBlocksAtCursor,
        insertBlocksAtCursorExact,
        insertBlocksAtIndex,
        insertBookmarkBlock,
        insertCalloutBlock,
        insertChecklistBlock,
        insertCodeBlock,
        insertEmbedBlock,
        insertFileBlock,
        insertFormulaBlock,
        insertMermaidBlock,
        insertTableBlock,
        insertToggleBlock,
        isTableMode,
        onUploadFile,
        pendingAttachmentInsertIndexRef,
        pendingImageInsertIndexRef,
        withTrailingParagraph,
      }),
    [
      attachmentFileInputRef,
      canInsertTable,
      createInitialTableNode,
      enableMermaidBlocks,
      focusEditor,
      imageFileInputRef,
      insertBlocksAtCursor,
      insertBlocksAtCursorExact,
      insertBlocksAtIndex,
      insertBookmarkBlock,
      insertCalloutBlock,
      insertChecklistBlock,
      insertCodeBlock,
      insertEmbedBlock,
      insertFileBlock,
      insertFormulaBlock,
      insertMermaidBlock,
      insertTableBlock,
      insertToggleBlock,
      isTableMode,
      onUploadFile,
      pendingAttachmentInsertIndexRef,
      pendingImageInsertIndexRef,
      withTrailingParagraph,
    ]
  )

  const toolbarBlockActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.toolbarMore),
    [blockInsertCatalog]
  )

  const quickInsertActions = useMemo(
    () => blockInsertCatalog.filter((item) => item.quickInsert),
    [blockInsertCatalog]
  )

  const hasRenderedTableEditingContext = useMemo(() => {
    if (typeof window === "undefined") return false
    void selectionTick

    const activeElement = document.activeElement instanceof Element ? document.activeElement : null
    if (activeElement?.closest(".aq-block-editor__content td, .aq-block-editor__content th")) {
      return true
    }

    const domSelection = window.getSelection()
    const anchorNode = domSelection?.anchorNode ?? null
    const anchorElement =
      anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement ?? null

    return Boolean(anchorElement?.closest(".aq-block-editor__content td, .aq-block-editor__content th"))
  }, [selectionTick])

  const isQuickInsertActionDisabled = useCallback(
    (action: BlockInsertCatalogItem) =>
      Boolean(
        disabled ||
        action.disabled ||
        ((isTableMode || hasRenderedTableEditingContext) &&
          TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(action.id))
      ),
    [disabled, hasRenderedTableEditingContext, isTableMode]
  )

  const normalizedSlashQuery = normalizeSlashSearchText(slashQuery)

  const getSlashMenuContextFromEditor = useCallback((activeEditor: TiptapEditor | null | undefined): SlashMenuContext => {
    if (!activeEditor) {
      return {
        currentBlockType: null,
        previousBlockType: null,
        atDocumentStart: true,
      }
    }

    const blocks = (((activeEditor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[])
    const currentBlockIndex = Math.max(0, Math.min(getTopLevelBlockIndexFromSelection(activeEditor), blocks.length - 1))

    return {
      currentBlockType: blocks[currentBlockIndex]?.type ?? null,
      previousBlockType: currentBlockIndex > 0 ? blocks[currentBlockIndex - 1]?.type ?? null : null,
      atDocumentStart: currentBlockIndex === 0,
    }
  }, [])

  const rankSlashItems = useCallback(
    (query: string, context: SlashMenuContext) =>
      getRankedSlashItems(blockInsertCatalog, query, recentSlashItemIds, context),
    [blockInsertCatalog, recentSlashItemIds]
  )

  const slashMenuContext = useMemo((): SlashMenuContext => {
    void selectionTick
    return getSlashMenuContextFromEditor(editor)
  }, [editor, getSlashMenuContextFromEditor, selectionTick])

  const rankedSlashItems = useMemo(() => {
    return rankSlashItems(normalizedSlashQuery, slashMenuContext)
  }, [rankSlashItems, normalizedSlashQuery, slashMenuContext])

  const slashSections = useMemo(() => {
    return buildSlashMenuSections(rankedSlashItems, recentSlashItemIds, normalizedSlashQuery)
  }, [normalizedSlashQuery, rankedSlashItems, recentSlashItemIds])

  const flatSlashEntries = useMemo(
    () =>
      slashSections.flatMap((section) =>
        section.items.map((item) => ({
          key: `${section.title}-${item.id}`,
          sectionTitle: section.title,
          item,
        }))
      ),
    [slashSections]
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    try {
      const raw = window.localStorage.getItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const sanitized = parsed.filter((value): value is string => typeof value === "string").slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
      setRecentSlashItemIds(sanitized)
    } catch {
      window.localStorage.removeItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY)
    }
  }, [])

  const executeSlashCatalogAction = useCallback(
    async (item: BlockInsertCatalogItem) => {
      if (!editor || item.disabled) return
      if (isTableSelectionActive(editor) && TABLE_CONTEXT_BLOCKED_INSERT_IDS.has(item.id)) return

      const activeSlashRange = getActiveSlashRangeFromEditor(editor) ?? slashMenuState
      let handledByWholeParagraphReplacement = false
      if (activeSlashRange) {
        const { selection } = editor.state
        const paragraph = selection.$from.parent
        const paragraphContentStart = selection.$from.start()
        const paragraphContentEnd = selection.$from.end()
        const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
        const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
        const textBeforeSlash = paragraph.textContent.slice(0, slashStartOffset)
        const textAfterSlash = paragraph.textContent.slice(slashEndOffset)
        const shouldReplaceWholeParagraph =
          paragraph.type.name === "paragraph" &&
          textBeforeSlash.trim().length === 0 &&
          textAfterSlash.trim().length === 0

        if (shouldReplaceWholeParagraph) {
          handledByWholeParagraphReplacement = transformCurrentParagraphViaSlash(item.id)
        }

        if (!handledByWholeParagraphReplacement) {
          if (shouldReplaceWholeParagraph) {
            editor
              .chain()
              .focus()
              .deleteRange({
                from: paragraphContentStart,
                to: paragraphContentEnd,
              })
              .run()
          } else {
            editor.chain().focus().deleteRange({ from: activeSlashRange.from, to: activeSlashRange.to }).run()
          }
        } else {
          closeSlashMenu()
        }
      }

      setRecentSlashItemIds((prev) => {
        const next = [item.id, ...prev.filter((id) => id !== item.id)].slice(0, SLASH_MENU_MAX_RECENT_ITEMS)
        if (typeof window !== "undefined") {
          window.localStorage.setItem(SLASH_MENU_RECENT_IDS_STORAGE_KEY, JSON.stringify(next))
        }
        return next
      })

      if (!handledByWholeParagraphReplacement) {
        closeSlashMenu()
        await item.insertAtCursor()
      }
    },
    [closeSlashMenu, editor, slashMenuState, transformCurrentParagraphViaSlash]
  )

  const resolveSlashMenuState = useCallback(() => {
    if (!editor || typeof window === "undefined") return null

    const selection = editor.state.selection

    if (!selection.empty || !editor.isFocused) {
      return null
    }
    if (isTableSelectionActive(editor)) {
      return null
    }

    const parent = selection.$from.parent
    if (parent.type.name !== "paragraph") {
      return null
    }

    const activeSlashRange = getActiveSlashRangeFromEditor(editor)
    if (!activeSlashRange) {
      return null
    }
    const paragraphContentStart = selection.$from.start()
    const slashStartOffset = Math.max(0, activeSlashRange.from - paragraphContentStart)
    const slashEndOffset = Math.max(0, activeSlashRange.to - paragraphContentStart)
    const query = parent.textContent.slice(slashStartOffset + 1, slashEndOffset)
    const coords = editor.view.coordsAtPos(selection.from)
    const viewportPadding = SLASH_MENU_EDGE_PADDING_PX
    const estimatedMenuWidth = Math.min(SLASH_MENU_ESTIMATED_WIDTH_PX, window.innerWidth - viewportPadding * 2)
    const estimatedMenuHeight = Math.min(
      SLASH_MENU_ESTIMATED_HEIGHT_PX,
      Math.max(320, window.innerHeight - viewportPadding * 2)
    )
    const spaceBelow = window.innerHeight - coords.bottom - viewportPadding
    const spaceAbove = coords.top - viewportPadding
    const placeAbove = spaceBelow < 280 && spaceAbove > spaceBelow + 48
    const nextLeft = Math.min(
      Math.max(coords.left, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - estimatedMenuWidth - viewportPadding)
    )
    const rawTop = placeAbove
      ? coords.top - estimatedMenuHeight - SLASH_MENU_VERTICAL_GAP_PX
      : coords.bottom + SLASH_MENU_VERTICAL_GAP_PX
    const nextTop = Math.min(rawTop, Math.max(viewportPadding, window.innerHeight - estimatedMenuHeight - viewportPadding))

    return {
      query,
      menuState: {
        left: Math.round(nextLeft),
        top: Math.round(Math.max(viewportPadding, nextTop)),
        from: activeSlashRange.from,
        to: activeSlashRange.to,
        placement: placeAbove ? "top" : "bottom",
      } satisfies Exclude<BlockEditorSlashMenuState, null>,
    }
  }, [editor])

  const applyResolvedSlashMenuState = useCallback(
    (nextSlashState: ReturnType<typeof resolveSlashMenuState>) => {
      if (!nextSlashState) {
        setIsSlashMenuOpen(false)
        setSlashMenuState(null)
        setSlashQuery("")
        setSelectedSlashIndex(0)
        setSlashInteractionMode("keyboard")
        return
      }

      setSlashQuery(nextSlashState.query)
      setIsSlashMenuOpen(true)
      setSlashMenuState(nextSlashState.menuState)
    },
    []
  )

  const syncSlashMenuWhileComposing = useCallback(() => {
    const nextSlashState = resolveSlashMenuState()
    if (!nextSlashState) {
      return
    }

    setSlashQuery(nextSlashState.query)
    setIsSlashMenuOpen(true)
    setSlashMenuState(nextSlashState.menuState)
  }, [resolveSlashMenuState])

  useEffect(() => {
    if (!editor) return
    let rafId: number | null = null

    const syncSlashMenu = () => {
      if (isSlashImeComposing || editor.view.composing) {
        syncSlashMenuWhileComposing()
        return
      }

      applyResolvedSlashMenuState(resolveSlashMenuState())
    }

    const scheduleSyncSlashMenu = () => {
      if (typeof window === "undefined") {
        syncSlashMenu()
        return
      }
      if (rafId !== null) return
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncSlashMenu()
      })
    }

    scheduleSyncSlashMenu()
    editor.on("selectionUpdate", scheduleSyncSlashMenu)
    editor.on("transaction", scheduleSyncSlashMenu)
    editor.on("focus", scheduleSyncSlashMenu)

    return () => {
      editor.off("selectionUpdate", scheduleSyncSlashMenu)
      editor.off("transaction", scheduleSyncSlashMenu)
      editor.off("focus", scheduleSyncSlashMenu)
      if (rafId !== null && typeof window !== "undefined") {
        window.cancelAnimationFrame(rafId)
      }
    }
  }, [applyResolvedSlashMenuState, editor, isSlashImeComposing, resolveSlashMenuState, syncSlashMenuWhileComposing])

  useEffect(() => {
    if (typeof window === "undefined" || !isSlashMenuOpen) return

    const syncSlashMenuPlacement = () => {
      const nextSlashState = resolveSlashMenuState()
      if (!nextSlashState) return
      setSlashQuery(nextSlashState.query)
      setSlashMenuState(nextSlashState.menuState)
    }

    window.addEventListener("resize", syncSlashMenuPlacement)
    window.addEventListener("scroll", syncSlashMenuPlacement, true)

    return () => {
      window.removeEventListener("resize", syncSlashMenuPlacement)
      window.removeEventListener("scroll", syncSlashMenuPlacement, true)
    }
  }, [editor, isSlashImeComposing, isSlashMenuOpen, resolveSlashMenuState])

  const toolbarActions: BlockEditorToolbarAction[] = [
    { id: "heading-1", label: "H1", ariaLabel: "제목 1", run: () => runBlockToolbarCommand(editor, "heading-1"), active: isBlockToolbarCommandActive(editor, "heading-1") },
    { id: "heading-2", label: "H2", ariaLabel: "제목 2", run: () => runBlockToolbarCommand(editor, "heading-2"), active: isBlockToolbarCommandActive(editor, "heading-2") },
    { id: "heading-3", label: "H3", ariaLabel: "제목 3", run: () => runBlockToolbarCommand(editor, "heading-3"), active: isBlockToolbarCommandActive(editor, "heading-3") },
    { id: "heading-4", label: "H4", ariaLabel: "제목 4", run: () => runBlockToolbarCommand(editor, "heading-4"), active: isBlockToolbarCommandActive(editor, "heading-4") },
    { id: "bold", label: "B", ariaLabel: "굵게", run: runBoldAction, active: isInlineMarkCommandActive(editor, "bold") },
    { id: "italic", label: createElement(AppIcon, { name: "italic", "aria-hidden": "true" }), ariaLabel: "기울임", run: runItalicAction, active: isInlineMarkCommandActive(editor, "italic") },
    { id: "bullet-list", label: createElement(AppIcon, { name: "list", "aria-hidden": "true" }), ariaLabel: "목록", run: () => runBlockToolbarCommand(editor, "bullet-list"), active: isBlockToolbarCommandActive(editor, "bullet-list") },
    { id: "quote", label: createElement("span", { "aria-hidden": "true" }, "❞"), ariaLabel: "인용문", run: () => runBlockToolbarCommand(editor, "quote"), active: isBlockToolbarCommandActive(editor, "quote") },
    { id: "link", label: createElement(AppIcon, { name: "link", "aria-hidden": "true" }), ariaLabel: "링크", run: openLinkPrompt, active: editor?.isActive("link") ?? false },
    { id: "inline-code", label: createElement("span", { "aria-hidden": "true" }, "</>"), ariaLabel: "인라인 코드", run: runInlineCodeAction, active: isInlineCodeActive },
    { id: "inline-formula", label: createElement("span", { "aria-hidden": "true" }, "ƒx"), ariaLabel: "인라인 수식", run: insertInlineFormula, active: editor?.isActive("inlineFormula") ?? false },
    { id: "image", label: createElement(AppIcon, { name: "camera", "aria-hidden": "true" }), ariaLabel: "이미지 추가", run: () => imageFileInputRef.current?.click(), active: false },
    { id: "code-block", label: createElement("span", { "aria-hidden": "true" }, "</>"), ariaLabel: "코드 블록", run: insertCodeBlock, active: editor?.isActive("codeBlock") ?? false },
  ]

  const toolbarMoreActions: BlockEditorToolbarAction[] = [
    {
      id: "inline-formula",
      label: "인라인 수식",
      ariaLabel: "인라인 수식",
      run: () => {
        insertInlineFormula()
        setIsToolbarMoreOpen(false)
      },
      active: editor?.isActive("inlineFormula") ?? false,
    },
    ...toolbarBlockActions.map((item) => ({
      id: item.id,
      label: item.label,
      ariaLabel: item.label,
      run: () => {
        void item.insertAtCursor()
        setIsToolbarMoreOpen(false)
      },
      active: isToolbarBlockInsertActive(editor, item.id),
      disabled: item.disabled,
    })),
  ]

  const stopSlashKeyboardEvent = (event: SlashKeyboardEventLike) => {
    event.preventDefault()
    event.stopPropagation?.()

    if ("nativeEvent" in event && event.nativeEvent) {
      event.nativeEvent.stopImmediatePropagation?.()
      return
    }

    ;(event as KeyboardEvent).stopImmediatePropagation?.()
  }

  const resolveSlashExecutionTarget = useCallback(() => {
    const activeEditor = editorRef.current ?? editor
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) return null

    const resolvedSlashState = resolveSlashMenuState()
    const activeSlashRange = resolvedSlashState?.menuState ?? getActiveSlashRangeFromEditor(activeEditor)
    if (!activeSlashRange) return null

    const query = resolvedSlashState?.query ?? ""
    const context = getSlashMenuContextFromEditor(activeEditor)
    const rankedItems = rankSlashItems(query, context)
    if (!rankedItems.length) return null

    const preferredItemId = flatSlashEntries[selectedSlashIndex]?.item.id
    const selectedItem =
      (preferredItemId ? rankedItems.find((item) => item.id === preferredItemId) : null) ??
      rankedItems[0] ??
      null
    if (!selectedItem || selectedItem.disabled) return null
    const insideTableCell = activeEditor.isActive("tableCell") || activeEditor.isActive("tableHeader")
    if (insideTableCell && selectedItem.section === "structure") return null

    return {
      item: selectedItem,
      range: activeSlashRange,
      query,
    }
  }, [
    editor,
    flatSlashEntries,
    getSlashMenuContextFromEditor,
    rankSlashItems,
    resolveSlashMenuState,
    selectedSlashIndex,
  ])

  const handleSlashMenuKeyboard = useCallback((event: SlashKeyboardEventLike) => {
    if (event.isComposing) return

    const liveSlashTarget = resolveSlashExecutionTarget()

    if (event.key === "Enter") {
      if (!liveSlashTarget) return
      stopSlashKeyboardEvent(event)
      queueMicrotask(() => {
        void executeSlashCatalogAction(liveSlashTarget.item)
      })
      return
    }

    if (event.key === "Backspace" && !liveSlashTarget?.query.trim().length && liveSlashTarget && editor) {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      editor.chain().focus().deleteRange({ from: liveSlashTarget.range.from, to: liveSlashTarget.range.to }).run()
      closeSlashMenu()
      return
    }

    if (!isSlashMenuOpen) return

    if (!flatSlashEntries.length && event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
      return
    }

    if (event.key === "ArrowDown" || (event.key === "Tab" && !event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev + 1) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex((prev) => {
        if (!flatSlashEntries.length) return 0
        return (prev - 1 + flatSlashEntries.length) % flatSlashEntries.length
      })
      return
    }

    if (event.key === "Home") {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(0)
      return
    }

    if (event.key === "End") {
      stopSlashKeyboardEvent(event)
      slashPointerResumeAtRef.current = typeof performance !== "undefined" ? performance.now() + 180 : Date.now() + 180
      setSlashInteractionMode("keyboard")
      setSelectedSlashIndex(Math.max(flatSlashEntries.length - 1, 0))
      return
    }

    if (event.key === "Escape") {
      stopSlashKeyboardEvent(event)
      setSlashInteractionMode("keyboard")
      closeSlashMenu(true)
    }
  }, [closeSlashMenu, editor, executeSlashCatalogAction, flatSlashEntries, isSlashMenuOpen, resolveSlashExecutionTarget])

  const handleSlashActionPointerMove = useCallback((flatIndex: number) => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now()
    if (now < slashPointerResumeAtRef.current) return
    setSlashInteractionMode((prev) => (prev === "pointer" ? prev : "pointer"))
    setSelectedSlashIndex((prev) => (prev === flatIndex ? prev : flatIndex))
  }, [])

  const handleSlashMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    handleSlashMenuKeyboard(event)
  }

  useEffect(() => {
    if (!isSlashMenuOpen) return
    setSelectedSlashIndex(0)
  }, [isSlashMenuOpen, slashQuery])

  useEffect(() => {
    if (!flatSlashEntries.length) {
      setSelectedSlashIndex(0)
      return
    }

    setSelectedSlashIndex((prev) => Math.min(prev, flatSlashEntries.length - 1))
  }, [flatSlashEntries])

  useEffect(() => {
    if (!isSlashMenuOpen || !slashMenuRef.current) return
    const activeElement = slashMenuRef.current.querySelector<HTMLButtonElement>("[data-active='true']")
    activeElement?.scrollIntoView({ block: "nearest" })
  }, [isSlashMenuOpen, selectedSlashIndex])

  useEffect(() => {
    if (typeof window === "undefined") return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (!["ArrowDown", "ArrowUp", "Tab", "Home", "End", "Enter", "Escape", "Backspace"].includes(event.key)) return
        const activeEditor = editorRef.current ?? editor
        const hasActiveSlashRange = Boolean(activeEditor && getActiveSlashRangeFromEditor(activeEditor))
        if (!isSlashMenuOpen && !hasActiveSlashRange) return
        handleSlashMenuKeyboard(event)
        return
      }

      if (!isSlashMenuOpen) return

      const target = event.target
      if (slashMenuRef.current && target instanceof Node && slashMenuRef.current.contains(target)) {
        return
      }

      closeSlashMenu()
    }

    window.addEventListener("pointerdown", closeMenu)
    window.addEventListener("keydown", closeMenu, true)

    return () => {
      window.removeEventListener("pointerdown", closeMenu)
      window.removeEventListener("keydown", closeMenu, true)
    }
  }, [closeSlashMenu, editor, handleSlashMenuKeyboard, isSlashMenuOpen])

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

  const closeBlockMenus = useCallback(() => setBlockMenuState(null), [])

  const openBlockMenu = useCallback((blockIndex: number, anchorRect: DOMRect) => {
    if (isTableStructuralSelection) return
    setBlockMenuState((prev) =>
      prev && prev.blockIndex === blockIndex
        ? null
        : {
            blockIndex,
            left: Math.round(anchorRect.left),
            top: Math.round(anchorRect.bottom + 8),
          }
    )
  }, [isTableStructuralSelection])

  const moveBlockByStep = useCallback(
    (blockIndex: number, delta: -1 | 1) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextIndex = Math.max(0, Math.min(blockIndex + delta, Math.max(contentLength - 1, 0)))
      if (nextIndex === blockIndex) return
      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, blockIndex, delta > 0 ? nextIndex + 1 : nextIndex),
        nextIndex
      )
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  const duplicateBlock = useCallback(
    (blockIndex: number) => {
      mutateTopLevelBlocks((doc) => duplicateTopLevelBlockAt(doc, blockIndex), blockIndex + 1)
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  const deleteBlock = useCallback(
    (blockIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return
      const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
      const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
      mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
      closeBlockMenus()
    },
    [closeBlockMenus, mutateTopLevelBlocks]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !draggedBlockState) return

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== draggedBlockState.pointerId) return
      const nextIndicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), event.clientY)
      setDropIndicatorState(createDropIndicatorState(nextIndicator))
      setDragGhostPosition({ x: event.clientX, y: event.clientY })
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== draggedBlockState.pointerId) return

      const nextIndicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), event.clientY)
      const sourceIndex = draggedBlockState.sourceIndex
      const normalizedInsertionIndex =
        nextIndicator.insertionIndex > sourceIndex
          ? nextIndicator.insertionIndex
          : nextIndicator.insertionIndex

      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, sourceIndex, normalizedInsertionIndex),
        Math.max(0, Math.min(nextIndicator.insertionIndex, ((editorRef.current?.getJSON() as BlockEditorDoc)?.content?.length || 1) - 1))
      )

      setDraggedBlockState(null)
      setDragGhostPosition(null)
      setDropIndicatorState(hideDropIndicatorState)
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
    }
  }, [draggedBlockState, getTopLevelBlockElements, mutateTopLevelBlocks])

  useEffect(() => {
    if (typeof document === "undefined" || !draggedBlockState) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = "grabbing"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [draggedBlockState])

  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(BLOCK_HANDLE_MEDIA_QUERY)
    const sync = () => setIsCoarsePointer(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])

  useEffect(() => {
    return () => {
      clearPendingBlockDrag()
    }
  }, [clearPendingBlockDrag])

  useBlockSelectionLayoutEffect(() => {
    if (!editor) return
    const viewportRect = viewportRef.current?.getBoundingClientRect() ?? null
    const handlePositionMode = isCoarsePointer ? "viewport" : "editor-local"
    const rectCache = blockSelectionLayoutRectCacheRef.current
    rectCache.clear()
    const selectedNestedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    const resolveCachedBlockRect = (index: number) => {
      const cached = rectCache.get(index)
      if (cached) return cached
      const element = getTopLevelBlockElementByIndex(index)
      if (!element) return null
      const next = { element, rect: element.getBoundingClientRect() }
      rectCache.set(index, next)
      return next
    }
    if (selectedNestedListItemContext?.listItemElement?.isConnected) {
      const rect = selectedNestedListItemContext.listItemElement.getBoundingClientRect()
      const nextOverlayState: BlockSelectionOverlayState = resolveBlockSelectionOverlayLayout(rect, viewportRect)
      setBlockSelectionOverlayState((prev) =>
        isStableBlockSelectionOverlayState(prev, nextOverlayState) ? prev : nextOverlayState
      )
    } else {
      const overlayIndex =
        selectedBlockNodeIndex !== null
          ? selectedBlockNodeIndex
          : clickedBlockIndex !== null
            ? clickedBlockIndex
            : null
      if (overlayIndex === null) {
        setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      } else {
        const overlayTarget = resolveCachedBlockRect(overlayIndex)
        if (!overlayTarget) {
          setBlockSelectionOverlayState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        } else {
          const { rect } = overlayTarget
          const nextOverlayState: BlockSelectionOverlayState = resolveBlockSelectionOverlayLayout(rect, viewportRect)
          setBlockSelectionOverlayState((prev) =>
            isStableBlockSelectionOverlayState(prev, nextOverlayState) ? prev : nextOverlayState
          )
        }
      }
    }

    const stickySelectionActive =
      !isCoarsePointer && selectedBlockNodeIndex !== null && keyboardBlockSelectionStickyRef.current
    const effectiveSelectedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    const activeListItemContext =
      hoveredListItemContext?.listItemElement?.isConnected
        ? hoveredListItemContext
        : effectiveSelectedListItemContext?.listItemElement?.isConnected
          ? effectiveSelectedListItemContext
          : null
    const blockIndex = activeListItemContext
      ? activeListItemContext.listBlockIndex
      : isCoarsePointer
        ? selectedBlockIndex
        : stickySelectionActive
          ? selectedBlockNodeIndex
          : textSelectionBlockIndex ?? hoveredBlockIndex
    const hideBlockHandle = () =>
      setBlockHandleState((prev) => (prev.visible ? { ...prev, visible: false } : prev))
    const hasOuterBlockSelectionIntent = blockIndex !== null
    if (
      (isTableStructuralSelection && !hasOuterBlockSelectionIntent) ||
      (isTableAffordanceVisible && !hasOuterBlockSelectionIntent) ||
      tableMenuState
    ) {
      hideBlockHandle()
      return
    }
    if (blockIndex === null) {
      hideBlockHandle()
      return
    }
    const { width: railWidth, height: railHeight } = blockHandleRailMetricsRef.current
    if (activeListItemContext?.listItemElement?.isConnected) {
      const rect = activeListItemContext.listItemElement.getBoundingClientRect()
      const railLayout = resolveBlockHandleRailLayoutForSurface(
        rect,
        railWidth,
        railHeight,
        resolveBlockHandleAnchorTop(activeListItemContext.listItemElement, railHeight),
        viewportRect,
        handlePositionMode
      )
      const nextState: TopLevelBlockHandleState = {
        visible: true,
        kind: "list-item",
        blockIndex: activeListItemContext.listBlockIndex,
        listPath: [...activeListItemContext.listPath],
        itemIndex: activeListItemContext.itemIndex,
        left: railLayout.left,
        top: railLayout.top,
        bottom: resolveBlockChromeTop(rect.bottom + 12, viewportRect, handlePositionMode),
        width: rect.width,
      }
      setBlockHandleState((prev) => (isStableBlockHandleState(prev, nextState) ? prev : nextState))
      rectCache.clear()
      return
    }

    const blockTarget = resolveCachedBlockRect(blockIndex)
    const blockElement = blockTarget?.element ?? null
    const canShowHandle = isTopLevelBlockHandleEligible(blockIndex)
    const shouldShow = Boolean(blockElement && canShowHandle && (isCoarsePointer || stickySelectionActive || textSelectionBlockIndex !== null || hoveredBlockIndex !== null))

    if (!shouldShow || !blockElement) {
      hideBlockHandle()
      return
    }

    const rect = blockTarget?.rect ?? blockElement.getBoundingClientRect()
    const blocks = ((editor.getJSON() as BlockEditorDoc).content ?? []) as BlockEditorDoc[]
    const blockNode = blocks[blockIndex]
    const anchoredTop = shouldUseThinBlockHandleAnchor(blockNode)
      ? resolveThinBlockHandleAnchorTop(blockElement, railHeight)
      : shouldCenterBlockHandleForNode(blockNode)
        ? resolveBlockHandleAnchorTop(blockElement, railHeight)
        : rect.top + 6
    const railLayout = resolveBlockHandleRailLayoutForSurface(
      rect,
      railWidth,
      railHeight,
      anchoredTop,
      viewportRect,
      handlePositionMode
    )
    const nextState: TopLevelBlockHandleState = {
      visible: true,
      kind: "top-level",
      blockIndex,
      listPath: [],
      itemIndex: null,
      left: railLayout.left,
      top: railLayout.top,
      bottom: resolveBlockChromeTop(rect.bottom + 12, viewportRect, handlePositionMode),
      width: rect.width,
    }

    setBlockHandleState((prev) => (isStableBlockHandleState(prev, nextState) ? prev : nextState))
    rectCache.clear()
  }, [
    editor,
    clickedBlockIndex,
    getTopLevelBlockElementByIndex,
    hoveredBlockIndex,
    hoveredListItemContext,
    isTableStructuralSelection,
    isCoarsePointer,
    isTopLevelBlockHandleEligible,
    selectedBlockIndex,
    selectedBlockNodeIndex,
    selectionTick,
    tableMenuState,
    isTableAffordanceVisible,
    textSelectionBlockIndex,
    resolveEffectiveSelectedListItemContext,
  ])

  useEffect(() => {
    const elements = getTopLevelBlockElements()
    const root = getContentRoot()
    const listItems = root ? Array.from(root.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR)) : []

    elements.forEach((element, index) => {
      if (hoveredListItemContext) {
        element.removeAttribute("data-block-hovered")
      } else if (index === hoveredBlockIndex && !draggedBlockState) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      if (draggedBlockState && index === draggedBlockState.sourceIndex) {
        element.setAttribute("data-block-dragging", "true")
      } else {
        element.removeAttribute("data-block-dragging")
      }

      element.removeAttribute("data-block-drop-target")
    })

    listItems.forEach((element) => {
      if (
        hoveredListItemContext &&
        !draggedBlockState &&
        isSameNestedListItemContext(hoveredListItemContext, {
          ...hoveredListItemContext,
          listItemElement: element,
          listElement: hoveredListItemContext.listElement,
          listItems: hoveredListItemContext.listItems,
        }) &&
        element === hoveredListItemContext.listItemElement
      ) {
        element.setAttribute("data-block-hovered", "true")
      } else {
        element.removeAttribute("data-block-hovered")
      }

      element.removeAttribute("data-block-dragging")
      element.removeAttribute("data-block-drop-target")
    })

    return () => {
      elements.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
      listItems.forEach((element) => {
        element.removeAttribute("data-block-hovered")
        element.removeAttribute("data-block-dragging")
        element.removeAttribute("data-block-drop-target")
      })
    }
  }, [draggedBlockState, dropIndicatorState.insertionIndex, getContentRoot, getTopLevelBlockElements, hoveredBlockIndex, hoveredListItemContext])

  const syncViewportHoverState = useCallback(
    (targetEvent: EventTarget | null, clientX: number, clientY: number) => {
      cancelHoveredBlockClear()
      const rowResizeState = isTableRowResizeActive()
      const columnResizeState = isTableColumnRailResizeActive()
      if (rowResizeState) {
        setViewportRowResizeHot(true)
        return
      }
      if (columnResizeState) {
        cancelTableQuickRailHide()
        return
      }
      if (isTableAxisDragActive) {
        cancelTableQuickRailHide()
        return
      }
      if (isCoarsePointer) return
      const target =
        targetEvent instanceof Element ? targetEvent : targetEvent instanceof Node ? targetEvent.parentElement : null
      const cell = getTableCellFromClientPoint(clientX, clientY, targetEvent)
      const targetListItemContext =
        findNestedListItemContextFromTarget(targetEvent) ??
        findNestedListItemContextByClientPosition(clientX, clientY)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(targetEvent) ??
        findTopLevelBlockIndexByClientPosition(clientX, clientY)
      const targetBlockElement =
        targetBlockIndex !== null ? getTopLevelBlockElementByIndex(targetBlockIndex) : null
      const targetBlockRect = targetBlockElement?.getBoundingClientRect() ?? null
      const isFarLeftTableBlockGutter = Boolean(
        targetBlockElement?.querySelector(".aq-table-shell, .tableWrapper, table") &&
          targetBlockRect &&
          clientY >= targetBlockRect.top - BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientY <= targetBlockRect.bottom + BLOCK_OUTER_SELECT_VERTICAL_MARGIN_PX &&
          clientX <= targetBlockRect.left - 12
      )
      if (
        target?.closest("[data-table-menu-root='true']") ||
        (target?.closest("[data-table-axis-rail='true']") && !isFarLeftTableBlockGutter) ||
        target?.closest("[data-table-corner-handle='true']") ||
        target?.closest("[data-table-column-rail-track='true']") ||
        target?.closest("[data-table-menu-trigger='true']")
      ) {
        cancelTableQuickRailHide()
        setTableQuickRailHovered(true)
        syncTrackedHoveredTableCellMenuLayout()
        setHoveredListItemContext(null)
        if (isWriterSurface || currentTableAxisSelection !== null) {
          setHoveredBlockIndex(targetBlockIndex)
        }
        return
      }
      if (isFarLeftTableBlockGutter) {
        clearTrackedTableHover()
        setTableQuickRailHovered(false)
        setViewportRowResizeHot(false)
        setHoveredListItemContext(null)
        setHoveredBlockIndex(targetBlockIndex)
        return
      }
      const hoveredTableElement = cell?.closest(".aq-table-shell, .tableWrapper, table") ?? target?.closest(".aq-table-shell, .tableWrapper, table") ?? null
      if (hoveredTableElement) {
        syncTableQuickRailFromElement(cell ?? target ?? hoveredTableElement, clientX, clientY)
        setTableQuickRailHovered(true)
        setViewportRowResizeHot(isTableRowResizeHandleTarget(cell, clientX, clientY))
        setHoveredListItemContext(null)
        setHoveredBlockIndex(isWriterSurface || currentTableAxisSelection !== null ? targetBlockIndex : null)
        if (selectedBlockNodeIndex !== null && !keyboardBlockSelectionStickyRef.current) {
          keyboardBlockSelectionStickyRef.current = false
          setSelectedBlockNodeIndex(null)
          syncSelectedBlockNodeSurface(null)
        }
        return
      } else if (!tableMenuState) {
        clearTrackedTableHover()
        setTableQuickRailHovered(false)
        scheduleTableQuickRailHide()
      }
      if (isTableStructuralSelection) {
        setHoveredListItemContext(null)
        setHoveredBlockIndex(null)
        return
      }
      if (target?.closest("[data-block-handle-rail='true']") || target?.closest("[data-block-menu-root='true']")) {
        if (blockHandleState.visible) {
          if (blockHandleState.kind === "list-item" && hoveredListItemContext) {
            setHoveredListItemContext(hoveredListItemContext)
          }
          setHoveredBlockIndex(blockHandleState.blockIndex)
        }
        return
      }
      setViewportRowResizeHot(isTableRowResizeHandleTarget(cell, clientX, clientY))
      setHoveredListItemContext(targetListItemContext)
      setHoveredBlockIndex(
        findTopLevelBlockIndexByClientPosition(clientX, clientY) ??
          findTopLevelBlockIndexFromTarget(targetEvent)
      )
      if (selectedBlockNodeIndex !== null && !keyboardBlockSelectionStickyRef.current) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
    },
    [
      blockHandleState.blockIndex,
      blockHandleState.kind,
      blockHandleState.visible,
      cancelHoveredBlockClear,
      cancelTableQuickRailHide,
      clearTrackedTableHover,
      findTopLevelBlockIndexByClientPosition,
      findTopLevelBlockIndexFromTarget,
      findNestedListItemContextByClientPosition,
      findNestedListItemContextFromTarget,
      getTableCellFromClientPoint,
      getTopLevelBlockElementByIndex,
      isTableAxisDragActive,
      isTableColumnRailResizeActive,
      isTableRowResizeActive,
      isTableRowResizeHandleTarget,
      currentTableAxisSelection,
      isCoarsePointer,
      isWriterSurface,
      isTableStructuralSelection,
      selectedBlockNodeIndex,
      setTableQuickRailHovered,
      setViewportRowResizeHot,
      hoveredListItemContext,
      syncSelectedBlockNodeSurface,
      syncTrackedHoveredTableCellMenuLayout,
      scheduleTableQuickRailHide,
      syncTableQuickRailFromElement,
      tableMenuState,
    ]
  )

  const handleViewportPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      syncViewportHoverState(event.target, event.clientX, event.clientY)
    },
    [syncViewportHoverState]
  )

  const handleViewportMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      syncViewportHoverState(event.target, event.clientX, event.clientY)
    },
    [syncViewportHoverState]
  )

  const handleViewportPointerLeave = useCallback(() => {
    scheduleHoveredBlockClear()
    handleTableViewportPointerLeave()
  }, [handleTableViewportPointerLeave, scheduleHoveredBlockClear])

  const handleViewportKeyDownCapture = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      if (
        !event.defaultPrevented &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        (event.key === "Backspace" || event.key === "Delete") &&
        selectedBlockNodeIndexRef.current !== null
      ) {
        event.preventDefault()
        event.stopPropagation()
        const blockIndex = selectedBlockNodeIndexRef.current
        const contentLength = (currentEditor.getJSON() as BlockEditorDoc).content?.length ?? 0
        const nextFocusIndex = Math.max(0, Math.min(blockIndex, Math.max(contentLength - 2, 0)))
        mutateTopLevelBlocks((doc) => deleteTopLevelBlockAt(doc, blockIndex), nextFocusIndex)
        setBlockMenuState(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        currentEditor.view.focus()
        return
      }

      if (event.defaultPrevented) return
      if (event.key !== "Tab" || event.metaKey || event.ctrlKey || event.altKey) return
      if (slashMenuState) return
      const activeListItemInteraction = resolveActiveListItemInteraction(currentEditor)
      if (activeListItemInteraction.listItemName) {
        event.preventDefault()
        event.stopPropagation()
        clearStickyTopLevelBlockSelection()
        if (
          activeListItemInteraction.shouldRestoreNodeSelection &&
          activeListItemInteraction.context
        ) {
          selectNestedListItemTextAnchor(currentEditor, activeListItemInteraction.context)
          clearNativeTextSelection()
        }
        const handled = event.shiftKey
          ? currentEditor.commands.liftListItem(activeListItemInteraction.listItemName)
          : currentEditor.commands.sinkListItem(activeListItemInteraction.listItemName)
        if (handled) {
          setSelectionTick((prev) => prev + 1)
        }
        return
      }

      const targetBlockIndex =
        hoveredBlockIndex ??
        findTopLevelBlockIndexFromTarget(event.target) ??
        getTopLevelBlockIndexFromSelection(currentEditor)

      if (!isTabBlockSelectionEligible(currentEditor, targetBlockIndex)) return

      event.preventDefault()
      event.stopPropagation()
      promoteTopLevelBlockSelection(targetBlockIndex)
    },
    [
      clearNativeTextSelection,
      clearStickyTopLevelBlockSelection,
      findTopLevelBlockIndexFromTarget,
      hoveredBlockIndex,
      mutateTopLevelBlocks,
      promoteTopLevelBlockSelection,
      resolveActiveListItemInteraction,
      slashMenuState,
      syncSelectedBlockNodeSurface,
    ]
  )
  const handleViewportPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (skipNextPointerDownSelectionClearRef.current) {
        skipNextPointerDownSelectionClearRef.current = false
        return
      }
      const targetListItemContext = findNestedListItemContextFromTarget(event.target)
      const targetBlockIndex =
        findTopLevelBlockIndexFromTarget(event.target) ??
        findTopLevelBlockIndexByClientPosition(event.clientX, event.clientY)
      const currentEditor = editorRef.current ?? editor
      if (currentEditor) preserveWindowScrollForEditorPointerFocus(event.target, isTableSelectionActive(currentEditor))
      if (
        currentEditor &&
        isOuterListItemSelectionGesture(event, targetListItemContext) &&
        targetListItemContext
      ) {
        event.preventDefault()
        event.stopPropagation()
        setClickedBlockIndex(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        setSelectedListItemContext(targetListItemContext)
        selectNestedListItemNode(currentEditor, targetListItemContext)
        clearNativeTextSelection()
        return
      }
      if (isOuterBlockSelectionGesture(event, targetBlockIndex)) {
        if (targetBlockIndex === null) return
        event.preventDefault()
        event.stopPropagation()
        promoteTopLevelBlockSelection(targetBlockIndex)
        return
      }
      setClickedBlockIndex(null)
      if (selectedBlockNodeIndex !== null) {
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
      }
      if (isCoarsePointer || isTableRowResizeActive() || isTableColumnRailResizeActive()) return
      const cell = getTableCellFromClientPoint(event.clientX, event.clientY, event.target)
      const hasActiveTableStructuralSelection = Boolean(
        currentEditor &&
          hasTableStructuralSelection(currentEditor)
      )
      if (cell) {
        setTableQuickRailHovered(false)
        if (!shouldPersistTableHandles) {
          hideTableQuickRailImmediately()
        }
      }
      if (cell && hasActiveTableStructuralSelection && !isTableRowResizeHandleTarget(cell, event.clientX, event.clientY)) {
        focusRenderedTableCell(cell)
      }
      if (!isTableRowResizeHandleTarget(cell, event.clientX, event.clientY) || !cell) return
      event.preventDefault()
      event.stopPropagation()
      startTableRowResize(cell, event.clientY)
    },
    [
      editor,
      findNestedListItemContextFromTarget,
      findTopLevelBlockIndexFromTarget,
      findTopLevelBlockIndexByClientPosition,
      focusRenderedTableCell,
      getTableCellFromClientPoint,
      hasTableStructuralSelection,
      hideTableQuickRailImmediately,
      isTableColumnRailResizeActive,
      isOuterBlockSelectionGesture,
      isOuterListItemSelectionGesture,
      isCoarsePointer,
      isTableRowResizeActive,
      isTableRowResizeHandleTarget,
      promoteTopLevelBlockSelection,
      selectedBlockNodeIndex,
      setTableQuickRailHovered,
      shouldPersistTableHandles,
      startTableRowResize,
      clearNativeTextSelection,
      syncSelectedBlockNodeSurface,
    ]
  )

  const handleViewportDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const listItemContext = findNestedListItemContextFromTarget(event.target)
      if (!listItemContext) return

      const currentEditor = editorRef.current ?? editor
      if (currentEditor) {
        const currentSelectedListItemContext = resolveEffectiveSelectedListItemContext(currentEditor)
        setClickedBlockIndex(null)
        keyboardBlockSelectionStickyRef.current = false
        setSelectedBlockNodeIndex(null)
        syncSelectedBlockNodeSurface(null)
        setSelectedListItemContext(listItemContext)
        if (
          !currentSelectedListItemContext ||
          !isSameNestedListItemContext(currentSelectedListItemContext, listItemContext)
        ) {
          selectNestedListItemNode(currentEditor, listItemContext)
          clearNativeTextSelection()
        }
      }
      const sourceElement = listItemContext.listItemElement
      const preview = createNestedListItemDragPreview(sourceElement, window.innerWidth)
      setDraggedNestedListItemState(createDraggedNestedListItemState(listItemContext, preview))
      setNestedListItemDropIndicatorState(
        createNestedListItemDropIndicatorState(
          listItemContext,
          resolveNestedListItemDropIndicatorByClientY(listItemContext.listElement, event.clientY)
        )
      )
      event.dataTransfer.effectAllowed = "move"
      event.dataTransfer.setData("text/plain", `list-item:${listItemContext.listBlockIndex}:${listItemContext.itemIndex}`)
    },
    [
      editor,
      findNestedListItemContextFromTarget,
      resolveNestedListItemDropIndicatorByClientY,
      clearNativeTextSelection,
      resolveEffectiveSelectedListItemContext,
      syncSelectedBlockNodeSurface,
    ]
  )

  const handleViewportDragOver = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedNestedListItemState) return
      const taskItemContext = findNestedListItemContextFromTarget(event.target)
      if (!isNestedListItemContextInDraggedList(taskItemContext, draggedNestedListItemState)) {
        return
      }

      event.preventDefault()
      setNestedListItemDropIndicatorState(
        createNestedListItemDropIndicatorState(
          taskItemContext,
          resolveNestedListItemDropIndicatorByClientY(taskItemContext.listElement, event.clientY)
        )
      )
    },
    [draggedNestedListItemState, findNestedListItemContextFromTarget, resolveNestedListItemDropIndicatorByClientY]
  )

  const clearNestedListItemDragState = useCallback(() => {
    setDraggedNestedListItemState(null)
    setDragGhostPosition(null)
    setNestedListItemDropIndicatorState(hideNestedListItemDropIndicatorState)
  }, [])

  const resolveNestedListItemContextFromBlockHandleState = useCallback(() => {
    if (blockHandleState.kind !== "list-item") return null
    if (blockHandleState.itemIndex === null) return null

    return resolveNestedListItemContextByIndices(
      blockHandleState.blockIndex,
      blockHandleState.listPath ?? [],
      blockHandleState.itemIndex
    )
  }, [blockHandleState, resolveNestedListItemContextByIndices])

  const resolveBlockHandleListItemContext = useCallback(() => {
    if (blockHandleState.kind !== "list-item") return null

    const currentHandleListItemContext = resolveNestedListItemContextFromBlockHandleState()
    if (currentHandleListItemContext) {
      return currentHandleListItemContext
    }

    const effectiveSelectedListItemContext = resolveEffectiveSelectedListItemContext(editor)
    const matchingSelectedListItemContext =
      effectiveSelectedListItemContext &&
      effectiveSelectedListItemContext.listBlockIndex === blockHandleState.blockIndex &&
      effectiveSelectedListItemContext.itemIndex === blockHandleState.itemIndex &&
      sameListPath(effectiveSelectedListItemContext.listPath, blockHandleState.listPath)
        ? effectiveSelectedListItemContext
        : null

    if (matchingSelectedListItemContext) {
      return matchingSelectedListItemContext
    }

    const matchingHoveredListItemContext =
      hoveredListItemContext &&
      hoveredListItemContext.listBlockIndex === blockHandleState.blockIndex &&
      hoveredListItemContext.itemIndex === blockHandleState.itemIndex &&
      sameListPath(hoveredListItemContext.listPath, blockHandleState.listPath)
        ? hoveredListItemContext
        : null

    return matchingSelectedListItemContext ?? matchingHoveredListItemContext
  }, [
    blockHandleState,
    editor,
    hoveredListItemContext,
    resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextFromBlockHandleState,
  ])

  const handleBlockHandleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (
        blockHandleState.kind !== "list-item" ||
        event.key !== "Tab" ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      ) {
        return
      }

      const currentEditor = editorRef.current ?? editor
      const currentHandleListItemContext = resolveBlockHandleListItemContext()
      const activeListItemName = getListItemNameFromContext(currentHandleListItemContext)
      if (!currentEditor || !currentHandleListItemContext || !activeListItemName) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      clearStickyTopLevelBlockSelection()
      setHoveredListItemContext(currentHandleListItemContext)
      selectedListItemContextRef.current = currentHandleListItemContext
      setSelectedListItemContext(currentHandleListItemContext)
      selectNestedListItemTextAnchor(currentEditor, currentHandleListItemContext)
      clearNativeTextSelection()

      const handled = event.shiftKey
        ? currentEditor.commands.liftListItem(activeListItemName)
        : currentEditor.commands.sinkListItem(activeListItemName)
      if (handled) {
        setSelectionTick((prev) => prev + 1)
      }
    },
    [
      blockHandleState.kind,
      clearNativeTextSelection,
      clearStickyTopLevelBlockSelection,
      editor,
      resolveBlockHandleListItemContext,
    ]
  )

  const beginPendingNestedListItemHandleDrag = useCallback(
    (pointerId: number, startX: number, startY: number, context: NestedListItemContext) => {
      clearPendingNestedListItemHandleDrag()
      flushPendingMarkdownCommit()
      const sourceElement = context.listItemElement
      if (sourceElement.isConnected) {
        sourceElement.setAttribute("draggable", "false")
      }
      const preview = createNestedListItemDragPreview(sourceElement, window.innerWidth)
      pendingNestedListItemHandleDragRef.current = createPendingNestedListItemHandleDragState(
        pointerId,
        startX,
        startY,
        context,
        preview
      )
      clearStickyTopLevelBlockSelection()
      const currentEditor = editorRef.current ?? editor
      if (currentEditor) {
        selectNestedListItemNode(currentEditor, context)
        clearNativeTextSelection()
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const pending = pendingNestedListItemHandleDragRef.current
        if (!pending || moveEvent.pointerId !== pending.pointerId) return
        const distance = Math.hypot(moveEvent.clientX - pending.startX, moveEvent.clientY - pending.startY)
        if (!pending.started) {
          if (distance < 5) return
          pending.started = true
          setDraggedNestedListItemState(createDraggedNestedListItemState(pending.context, pending))
        }

        const activeListContext =
          resolveNestedListItemContextByIndices(
            pending.context.listBlockIndex,
            pending.context.listPath,
            pending.context.itemIndex
          ) ?? pending.context
        const listRect = activeListContext.listElement.getBoundingClientRect()
        const withinListBounds =
          moveEvent.clientY >= listRect.top - 24 && moveEvent.clientY <= listRect.bottom + 24

        setDragGhostPosition({
          x: moveEvent.clientX,
          y: moveEvent.clientY,
        })

        if (!withinListBounds) {
          pending.targetListBlockIndex = null
          pending.targetListPath = null
          pending.insertionIndex = null
          setNestedListItemDropIndicatorState(hideNestedListItemDropIndicatorState)
          return
        }

        const indicator = resolveNestedListItemDropIndicatorByClientY(activeListContext.listElement, moveEvent.clientY)
        pending.targetListBlockIndex = activeListContext.listBlockIndex
        pending.targetListPath = [...activeListContext.listPath]
        pending.insertionIndex = indicator.insertionIndex
        setNestedListItemDropIndicatorState(createNestedListItemDropIndicatorState(activeListContext, indicator))
      }

      const handlePointerDone = (doneEvent: PointerEvent) => {
        const pending = pendingNestedListItemHandleDragRef.current
        if (!pending || doneEvent.pointerId !== pending.pointerId) return
        if (!pending.started) {
          if (pending.context.listItemElement.isConnected) {
            pending.context.listItemElement.setAttribute("draggable", "true")
          }
          clearPendingNestedListItemHandleDrag()
          return
        }
        if (pending.context.listItemElement.isConnected) {
          pending.context.listItemElement.setAttribute("draggable", "true")
        }

        const activeListContext =
          resolveNestedListItemContextByIndices(
            pending.context.listBlockIndex,
            pending.context.listPath,
            pending.context.itemIndex
          ) ?? pending.context
        const indicator = resolveNestedListItemDropIndicatorByClientY(
          activeListContext.listElement,
          doneEvent.clientY
        )
        pending.targetListBlockIndex = activeListContext.listBlockIndex
        pending.targetListPath = [...activeListContext.listPath]
        pending.insertionIndex = indicator.insertionIndex

        if (
          pending.targetListBlockIndex === pending.context.listBlockIndex &&
          pending.targetListPath &&
          sameListPath(pending.targetListPath, pending.context.listPath) &&
          pending.insertionIndex !== null
        ) {
          const insertionIndex = pending.insertionIndex
          mutateTopLevelBlocks(
            (doc) =>
              moveNestedListItemToInsertionIndex(
                doc,
                pending.context.listBlockIndex,
                pending.context.listPath,
                pending.context.itemIndex,
                insertionIndex
              ),
            pending.context.listBlockIndex
          )
        }
        clearNestedListItemDragState()

        clearPendingNestedListItemHandleDrag()
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerDone)
      window.addEventListener("pointercancel", handlePointerDone)

      pendingNestedListItemHandleDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerDone)
        window.removeEventListener("pointercancel", handlePointerDone)
      }
    },
    [
      clearNestedListItemDragState,
      clearPendingNestedListItemHandleDrag,
      clearStickyTopLevelBlockSelection,
      clearNativeTextSelection,
      editor,
      flushPendingMarkdownCommit,
      mutateTopLevelBlocks,
      resolveNestedListItemContextByIndices,
      resolveNestedListItemDropIndicatorByClientY,
    ]
  )

  const handleViewportDrop = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      if (!draggedNestedListItemState) return
      const taskItemContext = findNestedListItemContextFromTarget(event.target)
      if (!isNestedListItemContextInDraggedList(taskItemContext, draggedNestedListItemState)) {
        clearNestedListItemDragState()
        return
      }

      event.preventDefault()
      const indicator = resolveNestedListItemDropIndicatorByClientY(taskItemContext.listElement, event.clientY)
      mutateTopLevelBlocks(
        (doc) =>
          moveNestedListItemToInsertionIndex(
            doc,
            draggedNestedListItemState.listBlockIndex,
            draggedNestedListItemState.listPath,
            draggedNestedListItemState.sourceItemIndex,
            indicator.insertionIndex
          ),
        draggedNestedListItemState.listBlockIndex
      )
      clearNestedListItemDragState()
    },
    [
      clearNestedListItemDragState,
      draggedNestedListItemState,
      findNestedListItemContextFromTarget,
      mutateTopLevelBlocks,
      resolveNestedListItemDropIndicatorByClientY,
    ]
  )

  const handleViewportDragEnd = useCallback(() => {
    clearNestedListItemDragState()
  }, [clearNestedListItemDragState])

  useEffect(() => {
    if (typeof window === "undefined" || !blockMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (target instanceof Element && target.closest("[data-block-menu-root='true']")) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setBlockMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [blockMenuState])

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

  const handleBlockHandleRailPointerEnter = useCallback(() => {
    cancelHoveredBlockClear()
    if (blockHandleState.kind === "top-level") {
      setHoveredBlockIndex(blockHandleState.blockIndex)
    }
  }, [blockHandleState.blockIndex, blockHandleState.kind, cancelHoveredBlockClear])

  const handleBlockHandleRailPointerLeave = useCallback(() => scheduleHoveredBlockClear(), [scheduleHoveredBlockClear])

  const handleBlockHandleAddClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      openBlockMenu(blockHandleState.blockIndex, event.currentTarget.getBoundingClientRect())
    },
    [blockHandleState.blockIndex, openBlockMenu]
  )

  const handleBlockDragHandleMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      event.preventDefault()
    },
    []
  )

  const handleBlockDragHandleClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      event.stopPropagation()
      clearPendingBlockDrag()
      if (blockHandleState.kind === "list-item" && editor) {
        const currentHandleListItemContext =
          (hoveredListItemContext?.listItemElement?.isConnected ? hoveredListItemContext : null) ??
          resolveBlockHandleListItemContext() ??
          resolveEffectiveSelectedListItemContext(editor)
        if (currentHandleListItemContext) {
          clearStickyTopLevelBlockSelection()
          setHoveredListItemContext(currentHandleListItemContext)
          selectedListItemContextRef.current = currentHandleListItemContext
          setSelectedListItemContext(currentHandleListItemContext)
          selectNestedListItemTextAnchor(editor, currentHandleListItemContext)
          clearNativeTextSelection()
          event.currentTarget.focus({ preventScroll: true })
        }
        return
      }
      promoteTopLevelBlockSelection(blockHandleState.blockIndex)
    },
    [
      blockHandleState.blockIndex,
      blockHandleState.kind,
      clearNativeTextSelection,
      clearPendingBlockDrag,
      clearStickyTopLevelBlockSelection,
      editor,
      hoveredListItemContext,
      promoteTopLevelBlockSelection,
      resolveBlockHandleListItemContext,
      resolveEffectiveSelectedListItemContext,
    ]
  )

  const handleBlockDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      if (blockHandleState.kind === "list-item") {
        const currentHandleListItemContext =
          (hoveredListItemContext?.listItemElement?.isConnected ? hoveredListItemContext : null) ??
          resolveBlockHandleListItemContext() ??
          resolveEffectiveSelectedListItemContext(editor)
        if (editor && currentHandleListItemContext) {
          event.preventDefault()
          clearStickyTopLevelBlockSelection()
          setHoveredListItemContext(currentHandleListItemContext)
          selectedListItemContextRef.current = currentHandleListItemContext
          setSelectedListItemContext(currentHandleListItemContext)
          beginPendingNestedListItemHandleDrag(
            event.pointerId,
            event.clientX,
            event.clientY,
            currentHandleListItemContext
          )
        }
        return
      }
      event.preventDefault()
      const sourceIndex = blockHandleState.blockIndex
      const sourceElement = getTopLevelBlockElementByIndex(sourceIndex)
      const preview = createBlockDragPreview(sourceElement, window.innerWidth)
      const pendingState = createPendingBlockDragState(
        sourceIndex,
        event.pointerId,
        event.clientX,
        event.clientY,
        preview
      )
      clearPendingBlockDrag()
      pendingBlockDragRef.current = pendingState

      const DRAG_THRESHOLD_PX = 5

      const handlePendingPointerMove = (moveEvent: PointerEvent) => {
        const pending = pendingBlockDragRef.current
        if (!pending || moveEvent.pointerId !== pending.pointerId) return

        const distance = Math.hypot(
          moveEvent.clientX - pending.startX,
          moveEvent.clientY - pending.startY
        )
        if (distance < DRAG_THRESHOLD_PX) return

        promoteTopLevelBlockSelection(pending.sourceIndex)
        clearPendingBlockDrag()
        beginBlockDragFromPending(pending, moveEvent.clientX, moveEvent.clientY)
      }

      const handlePendingPointerDone = (doneEvent: PointerEvent) => {
        const pending = pendingBlockDragRef.current
        if (!pending || doneEvent.pointerId !== pending.pointerId) return
        clearPendingBlockDrag()
      }

      window.addEventListener("pointermove", handlePendingPointerMove)
      window.addEventListener("pointerup", handlePendingPointerDone)
      window.addEventListener("pointercancel", handlePendingPointerDone)

      pendingBlockDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", handlePendingPointerMove)
        window.removeEventListener("pointerup", handlePendingPointerDone)
        window.removeEventListener("pointercancel", handlePendingPointerDone)
      }
    },
    [
      beginBlockDragFromPending,
      beginPendingNestedListItemHandleDrag,
      blockHandleState.blockIndex,
      blockHandleState.kind,
      clearPendingBlockDrag,
      clearStickyTopLevelBlockSelection,
      editor,
      getTopLevelBlockElementByIndex,
      hoveredListItemContext,
      promoteTopLevelBlockSelection,
      resolveBlockHandleListItemContext,
      resolveEffectiveSelectedListItemContext,
    ]
  )

  const handleBlockMenuPointerEnter = useCallback(() => {
    if (!blockMenuState) return
    cancelHoveredBlockClear()
    setHoveredBlockIndex(blockMenuState.blockIndex)
  }, [blockMenuState, cancelHoveredBlockClear])

  const handleBlockMenuPointerLeave = useCallback(() => scheduleHoveredBlockClear(), [scheduleHoveredBlockClear])

  return {
    activeInlineColor,
    activeInlineTextStyleOption,
    applyInlineColor,
    applyInlineTextStyle,
    attachmentFileInputRef,
    blockHandleRailRef,
    blockHandleState,
    blockInsertCatalog,
    blockMenuState,
    blockSelectionOverlayState,
    bubbleInlineColorMenuRef,
    bubbleState,
    bubbleTextStyleMenuRef,
    bubbleToolbarHoveredRef,
    cancelBubbleHide,
    closeBlockMenus,
    deleteBlock,
    disabled,
    dragGhostPosition,
    draggedBlockState,
    draggedNestedListItemState,
    dropIndicatorState,
    duplicateBlock,
    editor,
    executeSlashCatalogAction,
    flatSlashEntries,
    handleAttachmentInputChange,
    handleBlockDragHandleClick,
    handleBlockDragHandleMouseDown,
    handleBlockDragHandlePointerDown,
    handleBlockHandleAddClick,
    handleBlockHandleKeyDown,
    handleBlockHandleRailPointerEnter,
    handleBlockHandleRailPointerLeave,
    handleBlockMenuPointerEnter,
    handleBlockMenuPointerLeave,
    handleEditorViewportCompositionEnd,
    handleEditorViewportCompositionStart,
    handleEditorViewportCompositionUpdate,
    handleImageInputChange,
    handleSlashActionPointerMove,
    handleSlashMenuKeyDown,
    handleToolbarButtonMouseDown,
    handleViewportDragEnd,
    handleViewportDragOver,
    handleViewportDragStart,
    handleViewportDrop,
    handleViewportKeyDownCapture,
    handleViewportMouseMove,
    handleViewportPointerDown,
    handleViewportPointerLeave,
    handleViewportPointerMove,
    imageFileInputRef,
    inlineColorMenuRef,
    insertInlineFormula,
    isBubbleInlineColorMenuOpen,
    isBubbleTextStyleMenuOpen,
    isCoarsePointer,
    isInlineCodeActive,
    isInlineColorMenuOpen,
    isPreviewOpen,
    isQuickInsertActionDisabled,
    isSlashActionDisabled,
    isSlashMenuOpen,
    isToolbarMoreOpen,
    moveBlockByStep,
    nestedListItemDropIndicatorState,
    normalizeTableColorInputValue,
    openLinkPrompt,
    preview,
    quickInsertActions,
    runBoldAction,
    runInlineCodeAction,
    runItalicAction,
    runStrikeAction,
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
    slashSections,
    tableOverlayLayerProps,
    toolbarActions,
    toolbarMoreActions,
    viewportRef,
  }
}
