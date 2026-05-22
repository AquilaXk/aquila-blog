import type { Editor as TiptapEditor } from "@tiptap/core"
import { useCallback, useEffect } from "react"
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
  const clearBlockDragVisualState = useCallback(() => {
    setDraggedBlockState(null)
    setDragGhostPosition(null)
    setDropIndicatorState(hideDropIndicatorState)
  }, [setDragGhostPosition, setDraggedBlockState, setDropIndicatorState])

  const beginBlockDragFromPending = useCallback(
    (pending: PendingBlockDragState, clientX: number, clientY: number) => {
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
