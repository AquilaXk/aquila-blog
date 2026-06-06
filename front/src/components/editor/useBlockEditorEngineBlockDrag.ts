import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect } from "react"
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react"
import type { BlockEditorDoc } from "./serialization"
import type { TopLevelBlockHandleState } from "./blockSelectionModel"
import {
  type DraggedBlockState,
  type DropIndicatorState,
  type PendingBlockDragState,
  createBlockDragPreview,
  createPendingBlockDragState,
} from "./blockDragModel"
import {
  type DraggedNestedListItemState,
  type NestedListItemDropIndicatorState,
  type PendingNestedListItemHandleDragState,
} from "./nestedListItemDragModel"
import {
  type NestedListItemContext,
  type NestedListItemDropIndicatorGeometry,
  getListItemNameFromContext,
  sameListPath,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import type { BlockEditorBlockMenuState } from "./BlockEditorEngine.layers"
import { clearTableTextSelectionForStructuralSelection } from "./tableTextSelectionModel"
import { useBlockEditorEngineBlockMenu } from "./useBlockEditorEngineBlockMenu"
import { useBlockEditorEngineBlockDragSessions } from "./useBlockEditorEngineBlockDragSessions"

type SetState<T> = Dispatch<SetStateAction<T>>

type UseBlockEditorEngineBlockDragArgs = {
  blockHandleState: TopLevelBlockHandleState
  blockMenuState: BlockEditorBlockMenuState
  cancelHoveredBlockClear: () => void
  clearNativeTextSelection: () => void
  clearStickyTopLevelBlockSelection: () => void
  draggedBlockState: DraggedBlockState
  draggedNestedListItemState: DraggedNestedListItemState
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  findNestedListItemContextFromTarget: (
    target: EventTarget | null
  ) => NestedListItemContext | null
  flushPendingMarkdownCommit: () => void
  getTopLevelBlockElementByIndex: (blockIndex: number) => HTMLElement | null
  getTopLevelBlockElements: () => HTMLElement[]
  hoveredListItemContext: NestedListItemContext | null
  isTableStructuralSelection: boolean
  mutateTopLevelBlocks: (
    mutator: (doc: BlockEditorDoc) => BlockEditorDoc,
    focusIndex?: number | null
  ) => void
  pendingBlockDragCleanupRef: MutableRefObject<(() => void) | null>
  pendingBlockDragRef: MutableRefObject<PendingBlockDragState | null>
  pendingNestedListItemHandleDragCleanupRef: MutableRefObject<
    (() => void) | null
  >
  pendingNestedListItemHandleDragRef: MutableRefObject<PendingNestedListItemHandleDragState | null>
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  resolveEffectiveSelectedListItemContext: (
    editor?: TiptapEditor | null
  ) => NestedListItemContext | null
  resolveNestedListItemContextByIndices: (
    listBlockIndex: number,
    listPath: number[],
    itemIndex: number
  ) => NestedListItemContext | null
  resolveNestedListItemDropIndicatorByClientY: (
    listElement: HTMLElement,
    clientY: number
  ) => NestedListItemDropIndicatorGeometry
  scheduleHoveredBlockClear: () => void
  selectedListItemContextRef: MutableRefObject<NestedListItemContext | null>
  setBlockMenuState: SetState<BlockEditorBlockMenuState>
  setDragGhostPosition: SetState<{ x: number; y: number } | null>
  setDraggedBlockState: SetState<DraggedBlockState>
  setDraggedNestedListItemState: SetState<DraggedNestedListItemState>
  setDropIndicatorState: SetState<DropIndicatorState>
  setHoveredBlockIndex: SetState<number | null>
  setHoveredListItemContext: SetState<NestedListItemContext | null>
  setNestedListItemDropIndicatorState: SetState<NestedListItemDropIndicatorState>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
  setSelectionTick: SetState<number>
}

export const useBlockEditorEngineBlockDrag = ({
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
}: UseBlockEditorEngineBlockDragArgs) => {
  const {
    closeBlockMenus,
    deleteBlock,
    duplicateBlock,
    moveBlockByStep,
    openBlockMenu,
  } = useBlockEditorEngineBlockMenu({
    blockMenuState,
    editorRef,
    isTableStructuralSelection,
    mutateTopLevelBlocks,
    setBlockMenuState,
  })

  const clearPendingBlockDrag = useCallback(() => {
    pendingBlockDragRef.current = null
    if (pendingBlockDragCleanupRef.current) {
      pendingBlockDragCleanupRef.current()
      pendingBlockDragCleanupRef.current = null
    }
  }, [pendingBlockDragCleanupRef, pendingBlockDragRef])

  const clearPendingNestedListItemHandleDrag = useCallback(() => {
    pendingNestedListItemHandleDragRef.current = null
    if (pendingNestedListItemHandleDragCleanupRef.current) {
      pendingNestedListItemHandleDragCleanupRef.current()
      pendingNestedListItemHandleDragCleanupRef.current = null
    }
  }, [
    pendingNestedListItemHandleDragCleanupRef,
    pendingNestedListItemHandleDragRef,
  ])

  useEffect(() => {
    return () => {
      clearPendingBlockDrag()
    }
  }, [clearPendingBlockDrag])

  const {
    beginBlockDragFromPending,
    beginPendingNestedListItemHandleDrag,
    handleViewportDragEnd,
    handleViewportDragOver,
    handleViewportDragStart,
    handleViewportDrop,
  } = useBlockEditorEngineBlockDragSessions({
    clearNativeTextSelection,
    clearPendingNestedListItemHandleDrag,
    clearStickyTopLevelBlockSelection,
    draggedBlockState,
    draggedNestedListItemState,
    editor,
    editorRef,
    findNestedListItemContextFromTarget,
    flushPendingMarkdownCommit,
    getTopLevelBlockElements,
    mutateTopLevelBlocks,
    pendingNestedListItemHandleDragCleanupRef,
    pendingNestedListItemHandleDragRef,
    resolveEffectiveSelectedListItemContext,
    resolveNestedListItemContextByIndices,
    resolveNestedListItemDropIndicatorByClientY,
    setDragGhostPosition,
    setDraggedBlockState,
    setDraggedNestedListItemState,
    setDropIndicatorState,
    setNestedListItemDropIndicatorState,
    setSelectedListItemContext,
  })

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

    const currentHandleListItemContext =
      resolveNestedListItemContextFromBlockHandleState()
    if (currentHandleListItemContext) {
      return currentHandleListItemContext
    }

    const effectiveSelectedListItemContext =
      resolveEffectiveSelectedListItemContext(editor)
    const matchingSelectedListItemContext =
      effectiveSelectedListItemContext &&
      effectiveSelectedListItemContext.listBlockIndex ===
        blockHandleState.blockIndex &&
      effectiveSelectedListItemContext.itemIndex ===
        blockHandleState.itemIndex &&
      sameListPath(
        effectiveSelectedListItemContext.listPath,
        blockHandleState.listPath
      )
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
      const activeListItemName = getListItemNameFromContext(
        currentHandleListItemContext
      )
      if (
        !currentEditor ||
        !currentHandleListItemContext ||
        !activeListItemName
      ) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      clearStickyTopLevelBlockSelection()
      setHoveredListItemContext(currentHandleListItemContext)
      selectedListItemContextRef.current = currentHandleListItemContext
      setSelectedListItemContext(currentHandleListItemContext)
      selectNestedListItemTextAnchor(
        currentEditor,
        currentHandleListItemContext
      )
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
      editorRef,
      resolveBlockHandleListItemContext,
      selectedListItemContextRef,
      setHoveredListItemContext,
      setSelectedListItemContext,
      setSelectionTick,
    ]
  )

  const handleBlockHandleRailPointerEnter = useCallback(() => {
    cancelHoveredBlockClear()
    if (blockHandleState.kind === "top-level") {
      setHoveredBlockIndex(blockHandleState.blockIndex)
    }
  }, [
    blockHandleState.blockIndex,
    blockHandleState.kind,
    cancelHoveredBlockClear,
    setHoveredBlockIndex,
  ])

  const handleBlockHandleRailPointerLeave = useCallback(
    () => scheduleHoveredBlockClear(),
    [scheduleHoveredBlockClear]
  )

  const handleBlockHandleAddClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      openBlockMenu(
        blockHandleState.blockIndex,
        event.currentTarget.getBoundingClientRect()
      )
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
          (hoveredListItemContext?.listItemElement?.isConnected
            ? hoveredListItemContext
            : null) ??
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
      clearTableTextSelectionForStructuralSelection()
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
      selectedListItemContextRef,
      setHoveredListItemContext,
      setSelectedListItemContext,
    ]
  )

  const handleBlockDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return
      event.stopPropagation()
      if (blockHandleState.kind === "list-item") {
        const currentHandleListItemContext =
          (hoveredListItemContext?.listItemElement?.isConnected
            ? hoveredListItemContext
            : null) ??
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
      clearTableTextSelectionForStructuralSelection()
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

        clearPendingBlockDrag()
        beginBlockDragFromPending(pending, moveEvent.clientX, moveEvent.clientY)
      }

      const handlePendingPointerDone = (doneEvent: PointerEvent) => {
        const pending = pendingBlockDragRef.current
        if (!pending || doneEvent.pointerId !== pending.pointerId) return
        const shouldSelectReleasedBlock = doneEvent.type === "pointerup"
        clearPendingBlockDrag()
        if (shouldSelectReleasedBlock) {
          clearTableTextSelectionForStructuralSelection()
          promoteTopLevelBlockSelection(pending.sourceIndex)
        }
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
      pendingBlockDragCleanupRef,
      pendingBlockDragRef,
      promoteTopLevelBlockSelection,
      resolveBlockHandleListItemContext,
      resolveEffectiveSelectedListItemContext,
      selectedListItemContextRef,
      setHoveredListItemContext,
      setSelectedListItemContext,
    ]
  )

  const handleBlockMenuPointerEnter = useCallback(() => {
    if (!blockMenuState) return
    cancelHoveredBlockClear()
    setHoveredBlockIndex(blockMenuState.blockIndex)
  }, [blockMenuState, cancelHoveredBlockClear, setHoveredBlockIndex])

  const handleBlockMenuPointerLeave = useCallback(
    () => scheduleHoveredBlockClear(),
    [scheduleHoveredBlockClear]
  )

  return {
    closeBlockMenus,
    deleteBlock,
    duplicateBlock,
    handleBlockDragHandleClick,
    handleBlockDragHandleMouseDown,
    handleBlockDragHandlePointerDown,
    handleBlockHandleAddClick,
    handleBlockHandleKeyDown,
    handleBlockHandleRailPointerEnter,
    handleBlockHandleRailPointerLeave,
    handleBlockMenuPointerEnter,
    handleBlockMenuPointerLeave,
    handleViewportDragEnd,
    handleViewportDragOver,
    handleViewportDragStart,
    handleViewportDrop,
    moveBlockByStep,
  }
}
