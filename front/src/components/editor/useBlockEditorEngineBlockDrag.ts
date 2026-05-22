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
import {
  moveNestedListItemToInsertionIndex,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import type { BlockEditorDoc } from "./serialization"
import type { TopLevelBlockHandleState } from "./blockSelectionModel"
import {
  type DraggedBlockState,
  type DropIndicatorState,
  type PendingBlockDragState,
  createBlockDragPreview,
  createDraggedBlockState,
  createDropIndicatorState,
  createPendingBlockDragState,
  hideDropIndicatorState,
  resolveBlockDropIndicatorByClientY,
} from "./blockDragModel"
import {
  type DraggedNestedListItemState,
  type NestedListItemDropIndicatorState,
  type PendingNestedListItemHandleDragState,
  createDraggedNestedListItemState,
  createNestedListItemDragPreview,
  createNestedListItemDropIndicatorState,
  createPendingNestedListItemHandleDragState,
  hideNestedListItemDropIndicatorState,
  isNestedListItemContextInDraggedList,
} from "./nestedListItemDragModel"
import {
  type NestedListItemContext,
  type NestedListItemDropIndicatorGeometry,
  getListItemNameFromContext,
  isSameNestedListItemContext,
  sameListPath,
  selectNestedListItemNode,
  selectNestedListItemTextAnchor,
} from "./nestedListItemModel"
import type { BlockEditorBlockMenuState } from "./BlockEditorEngine.layers"
import { useBlockEditorEngineBlockMenu } from "./useBlockEditorEngineBlockMenu"

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
  findNestedListItemContextFromTarget: (target: EventTarget | null) => NestedListItemContext | null
  flushPendingMarkdownCommit: () => void
  getTopLevelBlockElementByIndex: (blockIndex: number) => HTMLElement | null
  getTopLevelBlockElements: () => HTMLElement[]
  hoveredListItemContext: NestedListItemContext | null
  isTableStructuralSelection: boolean
  mutateTopLevelBlocks: (mutator: (doc: BlockEditorDoc) => BlockEditorDoc, focusIndex?: number | null) => void
  pendingBlockDragCleanupRef: MutableRefObject<(() => void) | null>
  pendingBlockDragRef: MutableRefObject<PendingBlockDragState | null>
  pendingNestedListItemHandleDragCleanupRef: MutableRefObject<(() => void) | null>
  pendingNestedListItemHandleDragRef: MutableRefObject<PendingNestedListItemHandleDragState | null>
  promoteTopLevelBlockSelection: (blockIndex: number) => boolean
  resolveEffectiveSelectedListItemContext: (editor?: TiptapEditor | null) => NestedListItemContext | null
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
  }, [pendingNestedListItemHandleDragCleanupRef, pendingNestedListItemHandleDragRef])

  const clearBlockDragVisualState = useCallback(() => {
    setDraggedBlockState(null)
    setDragGhostPosition(null)
    setDropIndicatorState(hideDropIndicatorState)
  }, [setDragGhostPosition, setDraggedBlockState, setDropIndicatorState])

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
    [clearBlockDragVisualState, getTopLevelBlockElements, setDragGhostPosition, setDraggedBlockState, setDropIndicatorState]
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
  }, [draggedBlockState, editorRef, getTopLevelBlockElements, mutateTopLevelBlocks, setDragGhostPosition, setDraggedBlockState, setDropIndicatorState])

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
    return () => {
      clearPendingBlockDrag()
    }
  }, [clearPendingBlockDrag])

  const handleViewportDragStart = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const listItemContext = findNestedListItemContextFromTarget(event.target)
      if (!listItemContext) return

      const currentEditor = editorRef.current ?? editor
      if (currentEditor) {
        const currentSelectedListItemContext = resolveEffectiveSelectedListItemContext(currentEditor)
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
      clearNativeTextSelection,
      editor,
      editorRef,
      findNestedListItemContextFromTarget,
      resolveEffectiveSelectedListItemContext,
      resolveNestedListItemDropIndicatorByClientY,
      setDraggedNestedListItemState,
      setNestedListItemDropIndicatorState,
      setSelectedListItemContext,
    ]
  )

  const handleViewportDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
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
    [draggedNestedListItemState, findNestedListItemContextFromTarget, resolveNestedListItemDropIndicatorByClientY, setNestedListItemDropIndicatorState]
  )

  const clearNestedListItemDragState = useCallback(() => {
    setDraggedNestedListItemState(null)
    setDragGhostPosition(null)
    setNestedListItemDropIndicatorState(hideNestedListItemDropIndicatorState)
  }, [setDragGhostPosition, setDraggedNestedListItemState, setNestedListItemDropIndicatorState])

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
      editorRef,
      resolveBlockHandleListItemContext,
      selectedListItemContextRef,
      setHoveredListItemContext,
      setSelectedListItemContext,
      setSelectionTick,
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
      clearNativeTextSelection,
      clearNestedListItemDragState,
      clearPendingNestedListItemHandleDrag,
      clearStickyTopLevelBlockSelection,
      editor,
      editorRef,
      flushPendingMarkdownCommit,
      mutateTopLevelBlocks,
      pendingNestedListItemHandleDragCleanupRef,
      pendingNestedListItemHandleDragRef,
      resolveNestedListItemContextByIndices,
      resolveNestedListItemDropIndicatorByClientY,
      setDragGhostPosition,
      setDraggedNestedListItemState,
      setNestedListItemDropIndicatorState,
    ]
  )

  const handleViewportDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
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

  const handleBlockHandleRailPointerEnter = useCallback(() => {
    cancelHoveredBlockClear()
    if (blockHandleState.kind === "top-level") {
      setHoveredBlockIndex(blockHandleState.blockIndex)
    }
  }, [blockHandleState.blockIndex, blockHandleState.kind, cancelHoveredBlockClear, setHoveredBlockIndex])

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

  const handleBlockMenuPointerLeave = useCallback(() => scheduleHoveredBlockClear(), [scheduleHoveredBlockClear])

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
