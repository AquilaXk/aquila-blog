import type { Editor as TiptapEditor } from "@tiptap/core"
import { CellSelection, selectedRect, TableMap } from "@tiptap/pm/tables"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import {
  type DraggedTableAxisState,
  type PendingTableAxisDragState,
  type TableAxis,
  type TableAxisDragGhostPosition,
  type TableAxisReorderIndicatorState,
  createDraggedTableAxisState,
  createHiddenTableAxisReorderIndicatorState,
  createPendingTableAxisDragState,
  createTableAxisDragGhostPosition,
  hideTableAxisReorderIndicatorState,
  resolveTableAxisIndexFromPointer,
  resolveTableAxisReorderIndicator,
} from "./tableAxisDragModel"
import type { TableMenuState } from "./tableFloatingUiModel"
import { findActiveRenderedTable } from "./tableRenderedDomModel"
import { buildReorderedSimpleTableNode } from "./tableStructureModel"
import { focusElementWithoutScroll, resolveDocPosSafe, type TableOverlaySelectionRect } from "./useBlockEditorTableOverlayDomAdapter"

type UseBlockEditorTableOverlayAxisDragArgs = {
  cancelTableQuickRailHide: () => void
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  editorRef: MutableRefObject<TiptapEditor | null>
  getCurrentSelectedTableRect: (activeEditor?: TiptapEditor | null) => TableOverlaySelectionRect | null
  isTableStructuralSelection: boolean
  selectionTick: number
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableAffordanceGeometry: Dispatch<SetStateAction<TableAffordanceGeometry>>
  setTableMenuState: Dispatch<SetStateAction<TableMenuState>>
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  viewportRef: RefObject<HTMLDivElement>
}

export const useBlockEditorTableOverlayAxisDrag = ({
  cancelTableQuickRailHide,
  clearStickyTopLevelBlockSelection,
  editor,
  editorRef,
  getCurrentSelectedTableRect,
  isTableStructuralSelection,
  selectionTick,
  setSelectionTick,
  setTableAffordanceGeometry,
  setTableMenuState,
  tableAffordanceGeometryRef,
  viewportRef,
}: UseBlockEditorTableOverlayAxisDragArgs) => {
  const pendingTableAxisDragRef = useRef<PendingTableAxisDragState | null>(null)
  const pendingTableAxisDragCleanupRef = useRef<(() => void) | null>(null)
  const tableAxisDragSuppressClickRef = useRef(false)
  const [draggedTableAxisState, setDraggedTableAxisState] = useState<DraggedTableAxisState>(null)
  const [tableAxisDragGhostPosition, setTableAxisDragGhostPosition] = useState<TableAxisDragGhostPosition>(null)
  const [tableAxisReorderIndicatorState, setTableAxisReorderIndicatorState] =
    useState<TableAxisReorderIndicatorState>(createHiddenTableAxisReorderIndicatorState)

  const selectTableAxisAtIndex = useCallback(
    (activeEditor: TiptapEditor, tablePos: number, axis: "row" | "column", axisIndex: number) => {
      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false

      const map = TableMap.get(tableNode)
      if (axis === "column") {
        if (axisIndex < 0 || axisIndex >= map.width) return false
        const anchorCellPos = tablePos + 1 + map.positionAt(0, axisIndex, tableNode)
        const headCellPos = tablePos + 1 + map.positionAt(map.height - 1, axisIndex, tableNode)
        const anchorResolved = resolveDocPosSafe(activeEditor, anchorCellPos)
        const headResolved = resolveDocPosSafe(activeEditor, headCellPos)
        if (!anchorResolved || !headResolved) return false

        clearStickyTopLevelBlockSelection()
        activeEditor.view.dispatch(
          activeEditor.state.tr.setSelection(CellSelection.colSelection(anchorResolved, headResolved))
        )
        focusElementWithoutScroll(activeEditor.view.dom)
        return true
      }

      if (axisIndex < 0 || axisIndex >= map.height) return false
      const anchorCellPos = tablePos + 1 + map.positionAt(axisIndex, 0, tableNode)
      const headCellPos = tablePos + 1 + map.positionAt(axisIndex, map.width - 1, tableNode)
      const anchorResolved = resolveDocPosSafe(activeEditor, anchorCellPos)
      const headResolved = resolveDocPosSafe(activeEditor, headCellPos)
      if (!anchorResolved || !headResolved) return false

      clearStickyTopLevelBlockSelection()
      activeEditor.view.dispatch(
        activeEditor.state.tr.setSelection(CellSelection.rowSelection(anchorResolved, headResolved))
      )
      focusElementWithoutScroll(activeEditor.view.dom)
      return true
    },
    [clearStickyTopLevelBlockSelection]
  )

  const clearPendingTableAxisDrag = useCallback(() => {
    pendingTableAxisDragRef.current = null
    if (pendingTableAxisDragCleanupRef.current) {
      pendingTableAxisDragCleanupRef.current()
      pendingTableAxisDragCleanupRef.current = null
    }
  }, [])

  const isCurrentTableColumnSelection = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor || columnIndex < 0) return false
      const { selection } = currentEditor.state
      if (!(selection instanceof CellSelection)) return false
      let rect: ReturnType<typeof selectedRect> | null = null
      try {
        rect = selectedRect(currentEditor.state)
      } catch {
        rect = null
      }
      if (!rect) return false
      return rect.left === columnIndex && rect.right === columnIndex + 1 && rect.top === 0 && rect.bottom === rect.map.height
    },
    [editorRef]
  )

  const isCurrentTableRowSelection = useCallback((rowIndex: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor || rowIndex < 0) return false
    const { selection } = currentEditor.state
    if (!(selection instanceof CellSelection)) return false
    let rect: ReturnType<typeof selectedRect> | null = null
    try {
      rect = selectedRect(currentEditor.state)
    } catch {
      rect = null
    }
    if (!rect) return false
    return rect.top === rowIndex && rect.bottom === rowIndex + 1 && rect.left === 0 && rect.right === rect.map.width
  }, [editorRef])

  const selectTableColumnByIndex = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || columnIndex < 0 || columnIndex >= rect.map.width) return false

      return selectTableAxisAtIndex(currentEditor, rect.tableStart - 1, "column", columnIndex)
    },
    [editorRef, getCurrentSelectedTableRect, selectTableAxisAtIndex]
  )

  const selectTableRowByIndex = useCallback(
    (rowIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || rowIndex < 0 || rowIndex >= rect.map.height) return false

      return selectTableAxisAtIndex(currentEditor, rect.tableStart - 1, "row", rowIndex)
    },
    [editorRef, getCurrentSelectedTableRect, selectTableAxisAtIndex]
  )

  const reorderTableAxisAtPosition = useCallback(
    (tablePos: number, axis: "row" | "column", sourceIndex: number, insertionIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false

      const tableNode = currentEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false

      const reorderedTable = buildReorderedSimpleTableNode(tableNode, axis, sourceIndex, insertionIndex)
      if (!reorderedTable) return false

      currentEditor.view.dispatch(
        currentEditor.state.tr.replaceWith(tablePos, tablePos + tableNode.nodeSize, reorderedTable.node)
      )

      const selected = selectTableAxisAtIndex(currentEditor, tablePos, axis, reorderedTable.nextIndex)
      setTableAffordanceGeometry((prev) =>
        axis === "row"
          ? { ...prev, rowIndex: reorderedTable.nextIndex }
          : { ...prev, columnIndex: reorderedTable.nextIndex }
      )
      setSelectionTick((prev) => prev + 1)
      return selected
    },
    [editorRef, selectTableAxisAtIndex, setSelectionTick, setTableAffordanceGeometry]
  )

  const beginTableAxisDragFromPending = useCallback(
    (pending: PendingTableAxisDragState, clientX: number, clientY: number) => {
      const nextDragState = createDraggedTableAxisState(pending)
      tableAxisDragSuppressClickRef.current = true
      const currentEditor = editorRef.current
      if (currentEditor) {
        selectTableAxisAtIndex(currentEditor, pending.tablePos, pending.axis, pending.sourceIndex)
      }
      setTableMenuState(null)
      cancelTableQuickRailHide()
      setDraggedTableAxisState(nextDragState)
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      setTableAxisReorderIndicatorState(
        resolveTableAxisReorderIndicator(renderedTable, pending.axis, pending.sourceIndex, clientX, clientY) ??
          createHiddenTableAxisReorderIndicatorState(pending.axis, pending.sourceIndex)
      )
      setTableAxisDragGhostPosition(createTableAxisDragGhostPosition(pending, clientY))
      return nextDragState
    },
    [cancelTableQuickRailHide, editorRef, selectTableAxisAtIndex, setTableMenuState, tableAffordanceGeometryRef, viewportRef]
  )

  const startPendingTableAxisDrag = useCallback(
    (axis: TableAxis, sourceIndex: number, pointerId: number, clientX: number, clientY: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return

      const tableRect = getCurrentSelectedTableRect(currentEditor)
      const tablePos = tableRect ? Math.max(0, tableRect.tableStart - 1) : null
      if (!tableRect || tablePos === null) return
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      const resolvedSourceIndex = resolveTableAxisIndexFromPointer(renderedTable, axis, clientX, clientY) ?? sourceIndex

      const withinBounds =
        axis === "row"
          ? resolvedSourceIndex >= 0 && resolvedSourceIndex < tableRect.map.height
          : resolvedSourceIndex >= 0 && resolvedSourceIndex < tableRect.map.width
      if (!withinBounds) return

      clearPendingTableAxisDrag()
      tableAxisDragSuppressClickRef.current = false

      pendingTableAxisDragRef.current = createPendingTableAxisDragState(
        axis,
        resolvedSourceIndex,
        pointerId,
        tablePos,
        clientX,
        clientY,
        tableAffordanceGeometryRef.current
      )

      const DRAG_THRESHOLD_PX = 5
      let activeDragState: Exclude<DraggedTableAxisState, null> | null = null

      const handlePendingPointerMove = (moveEvent: PointerEvent) => {
        if (activeDragState) {
          if (moveEvent.pointerId !== activeDragState.pointerId) return
          const activeRenderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
          const nextIndicator = resolveTableAxisReorderIndicator(
            activeRenderedTable,
            activeDragState.axis,
            activeDragState.sourceIndex,
            moveEvent.clientX,
            moveEvent.clientY
          )
          setTableAxisReorderIndicatorState(
            nextIndicator ??
              createHiddenTableAxisReorderIndicatorState(activeDragState.axis, activeDragState.sourceIndex)
          )
          if (activeDragState.axis === "row") {
            setTableAxisDragGhostPosition(createTableAxisDragGhostPosition(activeDragState, moveEvent.clientY))
          }
          return
        }

        const pending = pendingTableAxisDragRef.current
        if (!pending || moveEvent.pointerId !== pending.pointerId) return

        const distance = Math.hypot(moveEvent.clientX - pending.startX, moveEvent.clientY - pending.startY)
        if (distance < DRAG_THRESHOLD_PX) return

        pendingTableAxisDragRef.current = null
        activeDragState = beginTableAxisDragFromPending(pending, moveEvent.clientX, moveEvent.clientY)
      }

      const handlePendingPointerDone = (doneEvent: PointerEvent) => {
        if (activeDragState) {
          if (doneEvent.pointerId !== activeDragState.pointerId) return
          const activeRenderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
          const nextIndicator = resolveTableAxisReorderIndicator(
            activeRenderedTable,
            activeDragState.axis,
            activeDragState.sourceIndex,
            doneEvent.clientX,
            doneEvent.clientY
          )
          if (nextIndicator) {
            reorderTableAxisAtPosition(
              activeDragState.tablePos,
              activeDragState.axis,
              activeDragState.sourceIndex,
              nextIndicator.insertionIndex
            )
          }
          activeDragState = null
          setDraggedTableAxisState(null)
          setTableAxisDragGhostPosition(null)
          setTableAxisReorderIndicatorState(hideTableAxisReorderIndicatorState)
          clearPendingTableAxisDrag()
          return
        }

        const pending = pendingTableAxisDragRef.current
        if (!pending || doneEvent.pointerId !== pending.pointerId) return
        clearPendingTableAxisDrag()
      }

      window.addEventListener("pointermove", handlePendingPointerMove)
      window.addEventListener("pointerup", handlePendingPointerDone)
      window.addEventListener("pointercancel", handlePendingPointerDone)

      pendingTableAxisDragCleanupRef.current = () => {
        window.removeEventListener("pointermove", handlePendingPointerMove)
        window.removeEventListener("pointerup", handlePendingPointerDone)
        window.removeEventListener("pointercancel", handlePendingPointerDone)
      }
    },
    [
      beginTableAxisDragFromPending,
      clearPendingTableAxisDrag,
      editorRef,
      getCurrentSelectedTableRect,
      reorderTableAxisAtPosition,
      tableAffordanceGeometryRef,
      viewportRef,
    ]
  )

  const currentTableAxisSelection = useMemo(() => {
    if (!editor || !isTableStructuralSelection) return null
    void selectionTick
    let rect: ReturnType<typeof selectedRect> | null = null
    try {
      rect = selectedRect(editor.state)
    } catch {
      rect = null
    }
    if (!rect) return null
    if (rect.left === 0 && rect.right === rect.map.width && rect.bottom === rect.top + 1) {
      return { axis: "row" as const, index: rect.top }
    }
    if (rect.top === 0 && rect.bottom === rect.map.height && rect.right === rect.left + 1) {
      return { axis: "column" as const, index: rect.left }
    }
    return null
  }, [editor, isTableStructuralSelection, selectionTick])

  useEffect(() => {
    return () => {
      clearPendingTableAxisDrag()
    }
  }, [clearPendingTableAxisDrag])

  useEffect(() => {
    if (typeof document === "undefined" || !draggedTableAxisState) return
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = draggedTableAxisState.axis === "column" ? "col-resize" : "grabbing"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }, [draggedTableAxisState])

  return {
    beginTableAxisDragFromPending,
    clearPendingTableAxisDrag,
    currentTableAxisSelection,
    draggedTableAxisState,
    isCurrentTableColumnSelection,
    isCurrentTableRowSelection,
    reorderTableAxisAtPosition,
    selectTableAxisAtIndex,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    startPendingTableAxisDrag,
    tableAxisDragGhostPosition,
    tableAxisDragSuppressClickRef,
    tableAxisReorderIndicatorState,
  }
}
