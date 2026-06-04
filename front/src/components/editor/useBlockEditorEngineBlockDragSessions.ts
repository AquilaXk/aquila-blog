import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect, useRef } from "react"
import type { Dispatch, DragEvent as ReactDragEvent, MutableRefObject, RefObject, SetStateAction } from "react"
import {
  moveNestedListItemToInsertionIndex,
  moveTopLevelBlockToInsertionIndex,
} from "./blockDocumentOps"
import type { BlockEditorDoc } from "./serialization"
import {
  type DraggedBlockState,
  type DropIndicatorState,
  type PendingBlockDragState,
  createDraggedBlockState,
  createDropIndicatorState,
  hideDropIndicatorState,
  preserveTopLevelBlockDragScroll,
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
  isSameNestedListItemContext,
  selectNestedListItemNode,
  sameListPath,
} from "./nestedListItemModel"

type SetState<T> = Dispatch<SetStateAction<T>>
type BlockDragCommittedPointerEvent = PointerEvent & { __aqBlockDragCommitted?: boolean }

type UseBlockEditorEngineBlockDragSessionsArgs = {
  clearNativeTextSelection: () => void
  clearPendingNestedListItemHandleDrag: () => void
  clearStickyTopLevelBlockSelection: () => void
  draggedBlockState: DraggedBlockState
  draggedNestedListItemState: DraggedNestedListItemState
  editor: TiptapEditor | null
  editorRef: RefObject<TiptapEditor | null>
  findNestedListItemContextFromTarget: (target: EventTarget | null) => NestedListItemContext | null
  flushPendingMarkdownCommit: () => void
  getTopLevelBlockElements: () => HTMLElement[]
  mutateTopLevelBlocks: (mutator: (doc: BlockEditorDoc) => BlockEditorDoc, focusIndex?: number | null) => void
  pendingNestedListItemHandleDragCleanupRef: MutableRefObject<(() => void) | null>
  pendingNestedListItemHandleDragRef: MutableRefObject<PendingNestedListItemHandleDragState | null>
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
  setDragGhostPosition: SetState<{ x: number; y: number } | null>
  setDraggedBlockState: SetState<DraggedBlockState>
  setDraggedNestedListItemState: SetState<DraggedNestedListItemState>
  setDropIndicatorState: SetState<DropIndicatorState>
  setNestedListItemDropIndicatorState: SetState<NestedListItemDropIndicatorState>
  setSelectedListItemContext: SetState<NestedListItemContext | null>
}

export const useBlockEditorEngineBlockDragSessions = ({
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
}: UseBlockEditorEngineBlockDragSessionsArgs) => {
  const topLevelBlockEarlyPointerDoneCleanupRef = useRef<(() => void) | null>(null)

  const clearBlockDragVisualState = useCallback(() => {
    setDraggedBlockState(null)
    setDragGhostPosition(null)
    setDropIndicatorState(hideDropIndicatorState)
  }, [setDragGhostPosition, setDraggedBlockState, setDropIndicatorState])

  const cleanupTopLevelBlockEarlyPointerDone = useCallback(() => {
    const cleanup = topLevelBlockEarlyPointerDoneCleanupRef.current
    if (!cleanup) return
    topLevelBlockEarlyPointerDoneCleanupRef.current = null
    cleanup()
  }, [])

  const commitTopLevelBlockDrag = useCallback(
    (sourceIndex: number, clientY: number) => {
      const nextIndicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), clientY)
      const contentLength = ((editorRef.current?.getJSON() as BlockEditorDoc)?.content?.length ?? 0)
      const normalizedInsertionIndex = Math.max(0, Math.min(nextIndicator.insertionIndex, contentLength))
      mutateTopLevelBlocks(
        (doc) => moveTopLevelBlockToInsertionIndex(doc, sourceIndex, normalizedInsertionIndex),
        null
      )
    },
    [editorRef, getTopLevelBlockElements, mutateTopLevelBlocks]
  )

  const beginBlockDragFromPending = useCallback(
    (pending: PendingBlockDragState, clientX: number, clientY: number) => {
      cleanupTopLevelBlockEarlyPointerDone()
      clearStickyTopLevelBlockSelection()
      clearNativeTextSelection()
      preserveTopLevelBlockDragScroll()
      const indicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), clientY)
      setDraggedBlockState(createDraggedBlockState(pending))
      setDragGhostPosition({ x: clientX, y: clientY })
      setDropIndicatorState(createDropIndicatorState(indicator))

      let earlyPointerDoneTimeout: number | null = null
      const cleanupEarlyPointerDone = () => {
        window.removeEventListener("pointerup", handleEarlyPointerDone, true)
        window.removeEventListener("pointercancel", handleEarlyPointerDone, true)
        if (earlyPointerDoneTimeout !== null) {
          window.clearTimeout(earlyPointerDoneTimeout)
          earlyPointerDoneTimeout = null
        }
        if (topLevelBlockEarlyPointerDoneCleanupRef.current === cleanupEarlyPointerDone) {
          topLevelBlockEarlyPointerDoneCleanupRef.current = null
        }
      }
      const handleEarlyPointerDone = (event: PointerEvent) => {
        if (event.pointerId !== pending.pointerId) return
        if (event.type === "pointercancel") {
          clearBlockDragVisualState()
          cleanupEarlyPointerDone()
          return
        }
        const committedEvent = event as BlockDragCommittedPointerEvent
        committedEvent.__aqBlockDragCommitted = true
        commitTopLevelBlockDrag(pending.sourceIndex, event.clientY)
        clearBlockDragVisualState()
        cleanupEarlyPointerDone()
      }

      window.addEventListener("pointerup", handleEarlyPointerDone, true)
      window.addEventListener("pointercancel", handleEarlyPointerDone, true)
      topLevelBlockEarlyPointerDoneCleanupRef.current = cleanupEarlyPointerDone
      earlyPointerDoneTimeout = window.setTimeout(cleanupEarlyPointerDone, 1500)
    },
    [
      clearNativeTextSelection,
      clearStickyTopLevelBlockSelection,
      cleanupTopLevelBlockEarlyPointerDone,
      clearBlockDragVisualState,
      commitTopLevelBlockDrag,
      getTopLevelBlockElements,
      setDragGhostPosition,
      setDraggedBlockState,
      setDropIndicatorState,
    ]
  )

  useEffect(() => {
    if (typeof window === "undefined" || !draggedBlockState) return
    const activeDraggedBlockState = draggedBlockState

    let cleanedUp = false
    let scheduledBlurCancelTimeout: number | null = null
    function cleanupListeners() {
      if (cleanedUp) return
      cleanedUp = true
      cleanupTopLevelBlockEarlyPointerDone()
      clearScheduledBlurCancel()
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerCancel)
      window.removeEventListener("blur", handleBlurCancelDragSession, true)
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("wheel", cancelDragSession, true)
      document.removeEventListener("visibilitychange", handleVisibilityChange, true)
    }

    function cancelDragSession() {
      clearBlockDragVisualState()
      cleanupListeners()
    }
    function clearScheduledBlurCancel() {
      if (scheduledBlurCancelTimeout === null) return
      window.clearTimeout(scheduledBlurCancelTimeout)
      scheduledBlurCancelTimeout = null
    }
    function scheduleBlurCancel() {
      clearScheduledBlurCancel()
      scheduledBlurCancelTimeout = window.setTimeout(() => {
        scheduledBlurCancelTimeout = null
        cancelDragSession()
      }, 1500)
    }
    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== activeDraggedBlockState.pointerId) return
      clearScheduledBlurCancel()
      const nextIndicator = resolveBlockDropIndicatorByClientY(getTopLevelBlockElements(), event.clientY)
      setDropIndicatorState(createDropIndicatorState(nextIndicator))
      setDragGhostPosition({ x: event.clientX, y: event.clientY })
    }
    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== activeDraggedBlockState.pointerId) return
      clearScheduledBlurCancel()
      if ((event as BlockDragCommittedPointerEvent).__aqBlockDragCommitted) {
        clearBlockDragVisualState()
        cleanupListeners()
        return
      }

      commitTopLevelBlockDrag(activeDraggedBlockState.sourceIndex, event.clientY)

      clearBlockDragVisualState()
      cleanupListeners()
    }
    function handlePointerCancel(event: PointerEvent) {
      if (event.pointerId !== activeDraggedBlockState.pointerId) return
      cancelDragSession()
    }
    function handleBlurCancelDragSession() {
      scheduleBlurCancel()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      cancelDragSession()
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") cancelDragSession()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerCancel)
    window.addEventListener("blur", handleBlurCancelDragSession, true)
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("wheel", cancelDragSession, { capture: true, passive: true })
    document.addEventListener("visibilitychange", handleVisibilityChange, true)
    return () => {
      cleanupListeners()
    }
  }, [cleanupTopLevelBlockEarlyPointerDone, clearBlockDragVisualState, commitTopLevelBlockDrag, draggedBlockState, getTopLevelBlockElements, setDragGhostPosition, setDropIndicatorState])

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

  const handleViewportDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
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
    [draggedNestedListItemState, findNestedListItemContextFromTarget, resolveNestedListItemDropIndicatorByClientY, setNestedListItemDropIndicatorState]
  )

  const clearNestedListItemDragState = useCallback(() => {
    setDraggedNestedListItemState(null)
    setDragGhostPosition(null)
    setNestedListItemDropIndicatorState(hideNestedListItemDropIndicatorState)
  }, [setDragGhostPosition, setDraggedNestedListItemState, setNestedListItemDropIndicatorState])

  const cancelNestedListItemDragSession = useCallback(() => {
    const pending = pendingNestedListItemHandleDragRef.current
    if (pending?.context.listItemElement.isConnected) pending.context.listItemElement.setAttribute("draggable", "true")
    clearNestedListItemDragState()
    clearPendingNestedListItemHandleDrag()
  }, [clearNestedListItemDragState, clearPendingNestedListItemHandleDrag, pendingNestedListItemHandleDragRef])

  useEffect(() => {
    if (typeof window === "undefined" || !draggedNestedListItemState) return
    let scheduledBlurCancelTimeout: number | null = null

    const clearScheduledBlurCancel = () => {
      if (scheduledBlurCancelTimeout === null) return
      window.clearTimeout(scheduledBlurCancelTimeout)
      scheduledBlurCancelTimeout = null
    }
    const handleBlurCancelDragSession = () => {
      clearScheduledBlurCancel()
      scheduledBlurCancelTimeout = window.setTimeout(() => {
        scheduledBlurCancelTimeout = null
        cancelNestedListItemDragSession()
      }, 1500)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      clearScheduledBlurCancel()
      cancelNestedListItemDragSession()
    }
    const handleVisibilityChange = () => {
      clearScheduledBlurCancel()
      if (document.visibilityState === "hidden") cancelNestedListItemDragSession()
    }

    window.addEventListener("blur", handleBlurCancelDragSession, true)
    window.addEventListener("keydown", handleKeyDown, true)
    window.addEventListener("wheel", cancelNestedListItemDragSession, { capture: true, passive: true })
    document.addEventListener("visibilitychange", handleVisibilityChange, true)
    return () => {
      clearScheduledBlurCancel()
      window.removeEventListener("blur", handleBlurCancelDragSession, true)
      window.removeEventListener("keydown", handleKeyDown, true)
      window.removeEventListener("wheel", cancelNestedListItemDragSession, true)
      document.removeEventListener("visibilitychange", handleVisibilityChange, true)
    }
  }, [cancelNestedListItemDragSession, draggedNestedListItemState])

  const beginPendingNestedListItemHandleDrag = useCallback(
    (pointerId: number, startX: number, startY: number, context: NestedListItemContext) => {
      clearPendingNestedListItemHandleDrag()
      flushPendingMarkdownCommit()
      const sourceElement = context.listItemElement
      if (sourceElement.isConnected) sourceElement.setAttribute("draggable", "false")
      const preview = createNestedListItemDragPreview(sourceElement, window.innerWidth)
      pendingNestedListItemHandleDragRef.current = createPendingNestedListItemHandleDragState(pointerId, startX, startY, context, preview)
      clearStickyTopLevelBlockSelection()
      const currentEditor = editorRef.current ?? editor
      if (currentEditor) {
        selectNestedListItemNode(currentEditor, context)
        clearNativeTextSelection()
      }

      let scheduledPendingBlurCancelTimeout: number | null = null
      const clearScheduledPendingBlurCancel = () => {
        if (scheduledPendingBlurCancelTimeout === null) return
        window.clearTimeout(scheduledPendingBlurCancelTimeout)
        scheduledPendingBlurCancelTimeout = null
      }
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const pending = pendingNestedListItemHandleDragRef.current
        if (!pending || moveEvent.pointerId !== pending.pointerId) return
        clearScheduledPendingBlurCancel()
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

        setDragGhostPosition({ x: moveEvent.clientX, y: moveEvent.clientY })

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
        clearScheduledPendingBlurCancel()
        if (doneEvent.type === "pointercancel") return cancelNestedListItemDragSession()
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
        const indicator = resolveNestedListItemDropIndicatorByClientY(activeListContext.listElement, doneEvent.clientY)
        pending.targetListBlockIndex = activeListContext.listBlockIndex
        pending.targetListPath = [...activeListContext.listPath]
        pending.insertionIndex = indicator.insertionIndex

        if (
          pending.targetListBlockIndex === pending.context.listBlockIndex &&
          pending.targetListPath &&
          sameListPath(pending.targetListPath, pending.context.listPath) &&
          pending.insertionIndex !== null
        ) {
          mutateTopLevelBlocks(
            (doc) =>
              moveNestedListItemToInsertionIndex(
                doc,
                pending.context.listBlockIndex,
                pending.context.listPath,
                pending.context.itemIndex,
                pending.insertionIndex!
              ),
            pending.context.listBlockIndex
          )
        }
        clearNestedListItemDragState()
        clearPendingNestedListItemHandleDrag()
      }
      const handleCancelPendingDragSession = () => {
        clearScheduledPendingBlurCancel()
        cancelNestedListItemDragSession()
      }
      const handlePendingBlurCancel = () => {
        clearScheduledPendingBlurCancel()
        scheduledPendingBlurCancelTimeout = window.setTimeout(() => {
          scheduledPendingBlurCancelTimeout = null
          cancelNestedListItemDragSession()
        }, 1500)
      }
      const handlePendingKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") handleCancelPendingDragSession()
      }
      const handlePendingVisibilityChange = () => {
        if (document.visibilityState === "hidden") handleCancelPendingDragSession()
      }

      window.addEventListener("pointermove", handlePointerMove)
      window.addEventListener("pointerup", handlePointerDone)
      window.addEventListener("pointercancel", handlePointerDone)
      window.addEventListener("blur", handlePendingBlurCancel, true)
      window.addEventListener("keydown", handlePendingKeyDown, true)
      window.addEventListener("wheel", handleCancelPendingDragSession, { capture: true, passive: true })
      document.addEventListener("visibilitychange", handlePendingVisibilityChange, true)

      pendingNestedListItemHandleDragCleanupRef.current = () => {
        clearScheduledPendingBlurCancel()
        window.removeEventListener("pointermove", handlePointerMove)
        window.removeEventListener("pointerup", handlePointerDone)
        window.removeEventListener("pointercancel", handlePointerDone)
        window.removeEventListener("blur", handlePendingBlurCancel, true)
        window.removeEventListener("keydown", handlePendingKeyDown, true)
        window.removeEventListener("wheel", handleCancelPendingDragSession, true)
        document.removeEventListener("visibilitychange", handlePendingVisibilityChange, true)
      }
    },
    [
      cancelNestedListItemDragSession,
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
    cancelNestedListItemDragSession()
  }, [cancelNestedListItemDragSession])

  return {
    beginBlockDragFromPending,
    beginPendingNestedListItemHandleDrag,
    clearNestedListItemDragState,
    handleViewportDragEnd,
    handleViewportDragOver,
    handleViewportDragStart,
    handleViewportDrop,
  }
}
