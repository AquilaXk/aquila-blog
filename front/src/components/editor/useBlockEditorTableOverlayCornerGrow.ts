import type { Editor as TiptapEditor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import type { TableAxisSelectionTarget } from "./tableAxisDragModel"
import { getFirstEditableTextPositionInNode } from "./blockSelectionModel"
import {
  type TableCornerGrowState,
  type TableCornerGrowStepMetrics,
  type TableCornerPreviewState,
  resolveTableCornerGrowStepMetrics,
  resolveTableCornerGrowStepMetricsFromDataset,
  resolveTableCornerPreviewState,
} from "./tableCornerGrowModel"
import { findActiveRenderedTable } from "./tableRenderedDomModel"
import {
  canShrinkTableAxisAtEnd,
  countShrinkableRenderedTableAxisAtEnd,
  countShrinkableTableAxisAtEnd,
} from "./tableStructureModel"
import { clearTableStructuralSelectionOwner } from "./tableTextSelectionModel"
import { markNextTableCellPointerCaretCollapse } from "./tableTextCaretModel"
import type { TableOverlaySelectionRect } from "./useBlockEditorTableOverlayDomAdapter"

type UseBlockEditorTableOverlayCornerGrowArgs = {
  editorRef: MutableRefObject<TiptapEditor | null>
  focusRenderedTableCell: (cell: HTMLTableCellElement) => boolean
  getCurrentSelectedTableRect: (activeEditor?: TiptapEditor | null) => TableOverlaySelectionRect | null
  selectTableColumnByIndex: (columnIndex: number) => TableAxisSelectionTarget | false
  selectTableRowByIndex: (rowIndex: number) => TableAxisSelectionTarget | false
  setSelectionTick: Dispatch<SetStateAction<number>>
  tableAffordanceGeometry: TableAffordanceGeometry
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  viewportRef: RefObject<HTMLDivElement>
}

const TABLE_CORNER_GROW_MOUSE_POINTER_ID = -1
const TABLE_CORNER_DRAG_CLICK_GUARD_PX = 4

export const useBlockEditorTableOverlayCornerGrow = ({
  editorRef,
  focusRenderedTableCell,
  getCurrentSelectedTableRect,
  selectTableColumnByIndex,
  selectTableRowByIndex,
  setSelectionTick,
  tableAffordanceGeometry,
  tableAffordanceGeometryRef,
  viewportRef,
}: UseBlockEditorTableOverlayCornerGrowArgs) => {
  const tableCornerGrowRef = useRef<TableCornerGrowState | null>(null)
  const tableCornerGrowSuppressClickRef = useRef(false)
  const tableCornerPreviewStateRef = useRef<TableCornerPreviewState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    columnSteps: 0,
    rowSteps: 0,
  })
  const [tableCornerPreviewState, setTableCornerPreviewState] = useState<TableCornerPreviewState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    columnSteps: 0,
    rowSteps: 0,
  })
  const [isTableCornerGrowActive, setIsTableCornerGrowActive] = useState(false)

  const updateTableCornerPreviewState = useCallback(
    (
      nextState:
        | TableCornerPreviewState
        | ((prev: TableCornerPreviewState) => TableCornerPreviewState)
    ) => {
      setTableCornerPreviewState((prev) => {
        const resolved =
          typeof nextState === "function"
            ? (nextState as (prev: TableCornerPreviewState) => TableCornerPreviewState)(prev)
            : nextState
        tableCornerPreviewStateRef.current = resolved
        return resolved
      })
    },
    []
  )

  const appendTableAxisAtEnd = useCallback(
    (axis: "row" | "column") => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      let rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect) {
        const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
        const fallbackCell = renderedTable?.querySelector<HTMLTableCellElement>(
          "tr:last-child > th:last-child, tr:last-child > td:last-child"
        )
        if (fallbackCell && focusRenderedTableCell(fallbackCell)) {
          rect = getCurrentSelectedTableRect(currentEditor)
        }
      }
      if (!rect) return false

      const selected =
        axis === "column"
          ? selectTableColumnByIndex(rect.map.width - 1)
          : selectTableRowByIndex(rect.map.height - 1)
      if (!selected) return false

      const chain = currentEditor.chain().focus()
      axis === "column" ? chain.addColumnAfter() : chain.addRowAfter()
      return chain.run()
    },
    [editorRef, focusRenderedTableCell, getCurrentSelectedTableRect, selectTableColumnByIndex, selectTableRowByIndex, tableAffordanceGeometryRef, viewportRef]
  )

  const shrinkTableAxisAtEnd = useCallback(
    (axis: "row" | "column") => {
      const currentEditor = editorRef.current
      if (!currentEditor) return false
      let rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect) {
        const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
        const fallbackCell = renderedTable?.querySelector<HTMLTableCellElement>(
          "tr:last-child > th:last-child, tr:last-child > td:last-child"
        )
        if (fallbackCell && focusRenderedTableCell(fallbackCell)) {
          rect = getCurrentSelectedTableRect(currentEditor)
        }
      }
      if (!rect || !canShrinkTableAxisAtEnd(rect.table, axis)) return false

      const trailingIndex = axis === "column" ? rect.map.width - 1 : rect.map.height - 1
      if (trailingIndex < 0) return false

      const selected =
        axis === "column" ? selectTableColumnByIndex(trailingIndex) : selectTableRowByIndex(trailingIndex)
      if (!selected) return false

      const chain = currentEditor.chain().focus()
      axis === "column" ? chain.deleteColumn() : chain.deleteRow()
      return chain.run()
    },
    [editorRef, focusRenderedTableCell, getCurrentSelectedTableRect, selectTableColumnByIndex, selectTableRowByIndex, tableAffordanceGeometryRef, viewportRef]
  )

  const growTableFromCorner = useCallback(() => {
    const appendedColumn = appendTableAxisAtEnd("column")
    const appendedRow = appendTableAxisAtEnd("row")
    return appendedColumn || appendedRow
  }, [appendTableAxisAtEnd])

  const focusTrailingRenderedTableCell = useCallback(() => {
    const currentEditor = editorRef.current
    const rect = currentEditor
      ? getCurrentSelectedTableRect(currentEditor)
      : null
    if (currentEditor && rect && rect.map.width > 0 && rect.map.height > 0) {
      const trailingCellPos =
        rect.tableStart +
        rect.map.positionAt(rect.map.height - 1, rect.map.width - 1, rect.table)
      const trailingCellNode = currentEditor.state.doc.nodeAt(trailingCellPos)
      const selectionPos =
        getFirstEditableTextPositionInNode(trailingCellNode, trailingCellPos) ??
        Math.max(1, trailingCellPos + 1)
      clearTableStructuralSelectionOwner()
      currentEditor.view.dispatch(
        currentEditor.state.tr.setSelection(
          TextSelection.create(currentEditor.state.doc, selectionPos)
        )
      )
      if (currentEditor.view.dom instanceof HTMLElement) {
        currentEditor.view.dom.focus({ preventScroll: true })
      }
      return true
    }

    const renderedTable = findActiveRenderedTable(
      viewportRef.current,
      tableAffordanceGeometryRef.current
    )
    const trailingCell = renderedTable?.querySelector<HTMLTableCellElement>(
      "tr:last-child > th:last-child, tr:last-child > td:last-child"
    )
    if (!trailingCell) return false
    clearTableStructuralSelectionOwner()
    return focusRenderedTableCell(trailingCell)
  }, [
    editorRef,
    focusRenderedTableCell,
    getCurrentSelectedTableRect,
    tableAffordanceGeometryRef,
    viewportRef,
  ])

  const applyTableCornerGrowSteps = useCallback(
    (columnSteps: number, rowSteps: number) => {
      let appliedColumnSteps = 0
      let appliedRowSteps = 0

      while (Math.abs(appliedColumnSteps) < Math.abs(columnSteps)) {
        const direction = columnSteps > 0 ? 1 : -1
        const changed = direction > 0 ? appendTableAxisAtEnd("column") : shrinkTableAxisAtEnd("column")
        if (!changed) break
        appliedColumnSteps += direction
      }

      while (Math.abs(appliedRowSteps) < Math.abs(rowSteps)) {
        const direction = rowSteps > 0 ? 1 : -1
        const changed = direction > 0 ? appendTableAxisAtEnd("row") : shrinkTableAxisAtEnd("row")
        if (!changed) break
        appliedRowSteps += direction
      }

      if (appliedColumnSteps !== 0 || appliedRowSteps !== 0) {
        focusTrailingRenderedTableCell()
        markNextTableCellPointerCaretCollapse()
        setSelectionTick((prev) => prev + 1)
      }

      return {
        appliedColumnSteps,
        appliedRowSteps,
      }
    },
    [
      appendTableAxisAtEnd,
      focusTrailingRenderedTableCell,
      setSelectionTick,
      shrinkTableAxisAtEnd,
    ]
  )

  const resolveCurrentTableCornerGrowStepMetrics = useCallback(
    () => resolveTableCornerGrowStepMetrics(tableAffordanceGeometryRef.current),
    [tableAffordanceGeometryRef]
  )

  const resolveTableCornerGrowStepMetricsFromHandle = useCallback(
    (element: HTMLElement | null) =>
      resolveTableCornerGrowStepMetricsFromDataset(
        element?.dataset,
        resolveCurrentTableCornerGrowStepMetrics()
      ),
    [resolveCurrentTableCornerGrowStepMetrics]
  )

  const stopTableCornerGrow = useCallback(() => {
    tableCornerGrowRef.current = null
    updateTableCornerPreviewState((prev) => (prev.visible ? { ...prev, visible: false, columnSteps: 0, rowSteps: 0 } : prev))
    setIsTableCornerGrowActive(false)
  }, [updateTableCornerPreviewState])

  const startTableCornerGrow = useCallback(
    (
      pointerId: number,
      clientX: number,
      clientY: number,
      stepMetrics?: TableCornerGrowStepMetrics
    ) => {
      const { columnStepPx, rowStepPx } = stepMetrics ?? resolveCurrentTableCornerGrowStepMetrics()
      const currentEditor = editorRef.current
      const rect = currentEditor ? getCurrentSelectedTableRect(currentEditor) : null
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      const maxShrinkColumnSteps = rect
        ? countShrinkableTableAxisAtEnd(rect.table, "column")
        : countShrinkableRenderedTableAxisAtEnd(renderedTable, "column")
      const maxShrinkRowSteps = rect
        ? countShrinkableTableAxisAtEnd(rect.table, "row")
        : countShrinkableRenderedTableAxisAtEnd(renderedTable, "row")
      tableCornerGrowRef.current = {
        pointerId,
        startClientX: clientX,
        startClientY: clientY,
        baseLeft: tableAffordanceGeometryRef.current.tableLeft,
        baseTop: tableAffordanceGeometryRef.current.tableTop,
        baseWidth: tableAffordanceGeometryRef.current.width,
        baseHeight: tableAffordanceGeometryRef.current.height,
        columnStepPx,
        rowStepPx,
        maxShrinkColumnSteps,
        maxShrinkRowSteps,
      }
      tableCornerGrowSuppressClickRef.current = false
      updateTableCornerPreviewState({
        visible: false,
        left: tableAffordanceGeometryRef.current.tableLeft,
        top: tableAffordanceGeometryRef.current.tableTop,
        width: tableAffordanceGeometryRef.current.width,
        height: tableAffordanceGeometryRef.current.height,
        columnSteps: 0,
        rowSteps: 0,
      })
      setIsTableCornerGrowActive(true)
    },
    [editorRef, getCurrentSelectedTableRect, resolveCurrentTableCornerGrowStepMetrics, tableAffordanceGeometryRef, updateTableCornerPreviewState, viewportRef]
  )

  useEffect(() => {
    if (typeof window === "undefined") return

    const updateCornerPreview = (pointerId: number, clientX: number, clientY: number) => {
      const state = tableCornerGrowRef.current
      if (!state || state.pointerId !== pointerId) return

      const totalTravelX = clientX - state.startClientX
      const totalTravelY = clientY - state.startClientY
      if (
        Math.abs(totalTravelX) > TABLE_CORNER_DRAG_CLICK_GUARD_PX ||
        Math.abs(totalTravelY) > TABLE_CORNER_DRAG_CLICK_GUARD_PX
      ) {
        tableCornerGrowSuppressClickRef.current = true
      }
      updateTableCornerPreviewState((prev) => {
        const next = resolveTableCornerPreviewState(state, clientX, clientY)
        if (
          prev.visible === next.visible &&
          prev.left === next.left &&
          prev.top === next.top &&
          prev.width === next.width &&
          prev.height === next.height &&
          prev.columnSteps === next.columnSteps &&
          prev.rowSteps === next.rowSteps
        ) {
          return prev
        }
        return next
      })
    }

    const handlePointerMove = (event: PointerEvent) => {
      updateCornerPreview(event.pointerId, event.clientX, event.clientY)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = tableCornerGrowRef.current
      if (!state || state.pointerId !== event.pointerId) return
      const nextPreview = tableCornerPreviewStateRef.current
      applyTableCornerGrowSteps(nextPreview.columnSteps, nextPreview.rowSteps)
      stopTableCornerGrow()
    }

    const handleMouseMove = (event: MouseEvent) => {
      updateCornerPreview(TABLE_CORNER_GROW_MOUSE_POINTER_ID, event.clientX, event.clientY)
    }

    const handleMouseUp = () => {
      const state = tableCornerGrowRef.current
      if (!state || state.pointerId !== TABLE_CORNER_GROW_MOUSE_POINTER_ID) return
      const nextPreview = tableCornerPreviewStateRef.current
      applyTableCornerGrowSteps(nextPreview.columnSteps, nextPreview.rowSteps)
      stopTableCornerGrow()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
      stopTableCornerGrow()
    }
  }, [applyTableCornerGrowSteps, stopTableCornerGrow, updateTableCornerPreviewState])

  return {
    appendTableAxisAtEnd,
    growTableFromCorner,
    isTableCornerGrowActive,
    resolveTableCornerGrowStepMetricsFromHandle,
    shrinkTableAxisAtEnd,
    startTableCornerGrow,
    tableCornerGrowMousePointerId: TABLE_CORNER_GROW_MOUSE_POINTER_ID,
    tableCornerGrowRef,
    tableCornerGrowStepMetrics: resolveTableCornerGrowStepMetrics(tableAffordanceGeometry),
    tableCornerGrowSuppressClickRef,
    tableCornerPreviewState,
  }
}
