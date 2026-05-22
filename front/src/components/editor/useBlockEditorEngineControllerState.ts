import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect, useRef, useState } from "react"
import type { BlockSelectionOverlayState, TopLevelBlockHandleState } from "./blockSelectionModel"
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
import {
  type BlockEditorBlockMenuState,
  type BlockEditorSlashMenuState,
} from "./BlockEditorEngine.layers"
import { useFloatingBubbleState } from "./useFloatingBubbleState"

const BLOCK_HANDLE_MEDIA_QUERY = "(pointer: coarse)"

export const useBlockEditorEngineControllerState = () => {
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
  const slashPointerResumeAtRef = useRef(0)
  const selectedListItemContextRef = useRef<NestedListItemContext | null>(null)
  const selectedBlockNodeIndexRef = useRef<number | null>(null)
  const keyboardBlockSelectionStickyRef = useRef(false)
  const selectionUiSignatureRef = useRef("")
  const blockSelectionLayoutRectCacheRef = useRef(new Map<number, { element: HTMLElement; rect: DOMRect }>())
  const blockHandleRailMetricsRef = useRef({ width: 54, height: 40 })
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSlashMenuOpen, setIsSlashMenuOpen] = useState(false)
  const [slashQuery, setSlashQuery] = useState("")
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0)
  const [slashMenuState, setSlashMenuState] = useState<BlockEditorSlashMenuState>(null)
  const [recentSlashItemIds, setRecentSlashItemIds] = useState<string[]>([])
  const [isSlashImeComposing, setIsSlashImeComposing] = useState(false)
  const [slashInteractionMode, setSlashInteractionMode] = useState<"keyboard" | "pointer">("keyboard")
  const [isToolbarMoreOpen, setIsToolbarMoreOpen] = useState(false)
  const [isInlineColorMenuOpen, setIsInlineColorMenuOpen] = useState(false)
  const [isBubbleTextStyleMenuOpen, setIsBubbleTextStyleMenuOpen] = useState(false)
  const [isBubbleInlineColorMenuOpen, setIsBubbleInlineColorMenuOpen] = useState(false)
  const [blockMenuState, setBlockMenuState] = useState<BlockEditorBlockMenuState>(null)
  const [isCoarsePointer, setIsCoarsePointer] = useState(false)
  const [hoveredBlockIndex, setHoveredBlockIndex] = useState<number | null>(null)
  const [hoveredListItemContext, setHoveredListItemContext] = useState<NestedListItemContext | null>(null)
  const [selectedListItemContext, setSelectedListItemContext] = useState<NestedListItemContext | null>(null)
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null)
  const [clickedBlockIndex, setClickedBlockIndex] = useState<number | null>(null)
  const [selectedBlockNodeIndex, setSelectedBlockNodeIndex] = useState<number | null>(null)
  const [textSelectionBlockIndex, setTextSelectionBlockIndex] = useState<number | null>(null)
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

  useEffect(() => {
    if (typeof window === "undefined" || !isInlineColorMenuOpen) return

    const closeMenu = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return
        setIsInlineColorMenuOpen(false)
        return
      }

      const target = event.target
      if (inlineColorMenuRef.current && target instanceof Node && inlineColorMenuRef.current.contains(target)) return
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
      const isTextStyleMenuTarget =
        bubbleTextStyleMenuRef.current && target instanceof Node && bubbleTextStyleMenuRef.current.contains(target)
      const isInlineColorMenuTarget =
        bubbleInlineColorMenuRef.current && target instanceof Node && bubbleInlineColorMenuRef.current.contains(target)
      if (isTextStyleMenuTarget || isInlineColorMenuTarget) return

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

  return {
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
  }
}
