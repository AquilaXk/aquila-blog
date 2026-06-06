import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useRef, useState } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import type { TableAxisSelectionTarget } from "./tableAxisDragModel"
import { findActiveRenderedTable, readRenderedColumnWidths, resolveActiveRenderedTableForFloatingUi } from "./tableRenderedDomModel"
import {
  type TableColumnDragGuideState,
  type TableColumnRailResizeState,
  type TableRowResizeState,
  createHiddenTableColumnDragGuideState,
  createTableColumnRailResizeState,
  createTableRowResizeState,
  hideTableColumnDragGuideState,
  isRowResizeHandleTarget,
  resolveTableColumnDragGuideState,
  resolveTableColumnIndexFromResizeHandleTarget,
  resolveTableColumnIndexFromBoundaryProbe,
} from "./tableResizeInteractionModel"
import { collectSimpleTableColumnCells } from "./tableStructureModel"
import {
  TABLE_OVERFLOW_MODE_WIDE,
  computeNextTableColumnWidthsForResize,
  didTableColumnResizeHitOverflowPolicy,
  getTableOverflowMode,
} from "./tableWidthModel"
import {
  applyTableColumnWidthsToTransaction,
  getCurrentEditorReadableWidthPx,
  hasExplicitColumnWidth,
  readColumnWidthFromCell,
  shouldClampTableWidthBudget,
} from "./tableWidthRuntime"
import { resolveDocPosSafe, type TableOverlaySelectionRect } from "./useBlockEditorTableOverlayDomAdapter"
import { TABLE_MIN_COLUMN_WIDTH_PX, TABLE_MIN_ROW_HEIGHT_PX } from "src/libs/markdown/tableMetadata"

type UseBlockEditorTableOverlayResizeArgs = {
  activeTableElementRef: MutableRefObject<HTMLTableElement | null>
  clearWindowTextSelection: () => void
  editorRef: MutableRefObject<TiptapEditor | null>
  getCurrentSelectedTableRect: (activeEditor?: TiptapEditor | null) => TableOverlaySelectionRect | null
  hideTableOverflowCoachmark: () => void
  isCurrentTableColumnSelection: (columnIndex: number) => boolean
  resolveTableNodePosition: (activeEditor: TiptapEditor, tableNode: ProseMirrorNode) => number | null
  selectTableColumnByIndex: (columnIndex: number) => TableAxisSelectionTarget | false
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableAffordanceGeometry: Dispatch<SetStateAction<TableAffordanceGeometry>>
  setViewportRowResizeHot: (enabled: boolean) => void
  showTableOverflowCoachmark: () => void
  tableAffordanceGeometryRef: MutableRefObject<TableAffordanceGeometry>
  viewportRef: RefObject<HTMLDivElement>
}

export const useBlockEditorTableOverlayResize = ({
  activeTableElementRef,
  clearWindowTextSelection,
  editorRef,
  getCurrentSelectedTableRect,
  hideTableOverflowCoachmark,
  isCurrentTableColumnSelection,
  resolveTableNodePosition,
  selectTableColumnByIndex,
  setSelectionTick,
  setTableAffordanceGeometry,
  setViewportRowResizeHot,
  showTableOverflowCoachmark,
  tableAffordanceGeometryRef,
  viewportRef,
}: UseBlockEditorTableOverlayResizeArgs) => {
  const tableRowResizeRef = useRef<TableRowResizeState | null>(null)
  const tableColumnRailResizeRef = useRef<TableColumnRailResizeState | null>(null)
  const [tableColumnDragGuideState, setTableColumnDragGuideState] =
    useState<TableColumnDragGuideState>(createHiddenTableColumnDragGuideState)
  const [isTableColumnResizeActive, setIsTableColumnResizeActive] = useState(false)

  const setColumnResizeUserSelectSuppressed = useCallback((suppressed: boolean) => {
    if (typeof document === "undefined") return
    if (suppressed) {
      document.body.style.setProperty("user-select", "none")
      document.body.style.setProperty("-webkit-user-select", "none")
      return
    }
    document.body.style.removeProperty("user-select")
    document.body.style.removeProperty("-webkit-user-select")
  }, [])

  const hideTableColumnDragGuide = useCallback(() => {
    setTableColumnDragGuideState(hideTableColumnDragGuideState)
  }, [])

  const updateTableColumnDragGuideForColumn = useCallback(
    (columnIndex: number) => {
      const viewport = viewportRef.current
      if (!viewport) {
        hideTableColumnDragGuide()
        return
      }

      const tableElement = resolveActiveRenderedTableForFloatingUi(
        viewport,
        tableAffordanceGeometryRef.current,
        activeTableElementRef.current
      )
      const guideState = resolveTableColumnDragGuideState(tableElement, columnIndex)
      if (!guideState) {
        hideTableColumnDragGuide()
        return
      }
      setTableColumnDragGuideState(guideState)
    },
    [activeTableElementRef, hideTableColumnDragGuide, tableAffordanceGeometryRef, viewportRef]
  )

  const stopTableRowResize = useCallback(() => {
    const state = tableRowResizeRef.current
    if (state?.row) {
      state.row.removeAttribute("data-row-resize-active")
      if (!state.row.getAttribute("data-row-height")) {
        state.row.style.removeProperty("height")
      }
      state.cells.forEach((cell) => {
        cell.style.removeProperty("height")
        cell.style.removeProperty("min-height")
      })
    }
    tableRowResizeRef.current = null
    setViewportRowResizeHot(false)
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("cursor")
    }
  }, [setViewportRowResizeHot])

  const startTableRowResize = useCallback(
    (cell: HTMLTableCellElement, clientY: number) => {
      const resizeState = createTableRowResizeState(cell, clientY)
      if (!resizeState) return

      resizeState.row.setAttribute("data-row-resize-active", "true")
      tableRowResizeRef.current = resizeState
      setViewportRowResizeHot(true)
      if (typeof document !== "undefined") {
        document.body.style.cursor = "row-resize"
      }
    },
    [setViewportRowResizeHot]
  )

  const commitTableRowHeight = useCallback((rowElement: HTMLTableRowElement, nextHeight: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(rowElement, 0)
    } catch {
      return
    }
    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name !== "tableRow") continue

      const rowPosition = resolvedPosition.before(depth)
      const rowNode = currentEditor.state.doc.nodeAt(rowPosition)
      if (!rowNode) return

      const normalizedHeight = Math.max(TABLE_MIN_ROW_HEIGHT_PX, nextHeight)
      const transaction = currentEditor.state.tr.setNodeMarkup(rowPosition, undefined, {
        ...rowNode.attrs,
        rowHeightPx: normalizedHeight,
      })
      currentEditor.view.dispatch(transaction)
      return
    }
  }, [editorRef])

  const resizeFirstTableRowBy = useCallback((deltaPx: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const firstTableRow = viewportRef.current?.querySelector(".aq-block-editor__content table tr") as HTMLTableRowElement | null
    if (!firstTableRow) return
    const nextHeight = Math.max(
      TABLE_MIN_ROW_HEIGHT_PX,
      Math.round(firstTableRow.getBoundingClientRect().height + deltaPx)
    )
    commitTableRowHeight(firstTableRow, nextHeight)
  }, [commitTableRowHeight, editorRef, viewportRef])

  const getCurrentTableColumnResizeContext = useCallback(
    (columnIndex: number) => {
      const currentEditor = editorRef.current
      if (!currentEditor) return null
      const rect = getCurrentSelectedTableRect(currentEditor)
      if (!rect || columnIndex < 0 || columnIndex >= rect.map.width) {
        return null
      }

      const tablePos = resolveTableNodePosition(currentEditor, rect.table)
      if (tablePos === null) {
        return null
      }

      const columns = collectSimpleTableColumnCells(rect.table, tablePos)
      if (!columns || columns.length === 0 || columnIndex >= columns.length) {
        return null
      }

      const currentWidths = columns.map((column) => readColumnWidthFromCell(column[0]))
      const renderedTable = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
      const renderedColumnWidths = readRenderedColumnWidths(renderedTable)
      const measuredWidths =
        columns.some((column) => !hasExplicitColumnWidth(column)) &&
        renderedColumnWidths.length === columns.length
          ? renderedColumnWidths
          : currentWidths

      return {
        currentEditor,
        rect,
        columns,
        currentWidths,
        measuredWidths,
      }
    },
    [editorRef, getCurrentSelectedTableRect, resolveTableNodePosition, tableAffordanceGeometryRef, viewportRef]
  )

  const resizeTableColumnByIndex = useCallback(
    (columnIndex: number, deltaPx: number) => {
      if (deltaPx === 0) return { changed: false, appliedDelta: 0 }
      const resizeContext = getCurrentTableColumnResizeContext(columnIndex)
      if (!resizeContext) {
        return { changed: false, appliedDelta: 0 }
      }

      const { currentEditor, rect, columns, currentWidths, measuredWidths } = resizeContext
      const nextWidthsResult = computeNextTableColumnWidthsForResize(
        measuredWidths,
        columnIndex,
        deltaPx,
        shouldClampTableWidthBudget(),
        getTableOverflowMode(rect.table),
        getCurrentEditorReadableWidthPx(currentEditor) - 2
      )

      const applied = applyTableColumnWidthsToTransaction(
        currentEditor.state.tr,
        columns,
        currentWidths,
        nextWidthsResult.widths
      )
      if (!applied.changed) {
        return { changed: false, appliedDelta: 0, wasClamped: nextWidthsResult.wasClamped }
      }
      currentEditor.view.dispatch(applied.transaction)
      setSelectionTick((prev) => prev + 1)
      return {
        changed: true,
        appliedDelta: nextWidthsResult.widths[columnIndex] - measuredWidths[columnIndex],
        wasClamped: nextWidthsResult.wasClamped,
      }
    },
    [getCurrentTableColumnResizeContext, setSelectionTick]
  )

  const resizeTableColumnBySessionDelta = useCallback(
    (
      columnIndex: number,
      baseWidths: number[],
      totalDeltaPx: number,
      overflowMode: string,
      budget: number
    ) => {
      const resizeContext = getCurrentTableColumnResizeContext(columnIndex)
      if (!resizeContext) {
        return { changed: false, appliedDelta: 0 }
      }

      const { currentEditor, columns, currentWidths } = resizeContext
      const nextWidthsResult = computeNextTableColumnWidthsForResize(
        baseWidths,
        columnIndex,
        totalDeltaPx,
        shouldClampTableWidthBudget(),
        overflowMode,
        budget
      )
      const applied = applyTableColumnWidthsToTransaction(
        currentEditor.state.tr,
        columns,
        currentWidths,
        nextWidthsResult.widths
      )
      if (!applied.changed) {
        return { changed: false, appliedDelta: 0, wasClamped: nextWidthsResult.wasClamped }
      }
      currentEditor.view.dispatch(applied.transaction)
      setSelectionTick((prev) => prev + 1)
      return {
        changed: true,
        appliedDelta: nextWidthsResult.widths[columnIndex] - baseWidths[columnIndex],
        wasClamped: nextWidthsResult.wasClamped,
      }
    },
    [getCurrentTableColumnResizeContext, setSelectionTick]
  )

  const resizeFirstTableColumnBy = useCallback((deltaPx: number) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return
    const firstCell = viewportRef.current?.querySelector(".aq-block-editor__content table tr:first-of-type > th, .aq-block-editor__content table tr:first-of-type > td") as HTMLElement | null
    if (!firstCell) return

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(firstCell, 0)
    } catch {
      return
    }
    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue
      const cellPosition = resolvedPosition.before(depth)
      const cellNode = currentEditor.state.doc.nodeAt(cellPosition)
      if (!cellNode) return
      let tableDepth = depth - 1
      while (tableDepth > 0 && resolvedPosition.node(tableDepth).type.name !== "table") {
        tableDepth -= 1
      }

      const tableNode = tableDepth > 0 ? resolvedPosition.node(tableDepth) : null
      const tablePosition = tableDepth > 0 ? resolvedPosition.before(tableDepth) : null
      const columns = tableNode && tablePosition !== null
        ? collectSimpleTableColumnCells(tableNode, tablePosition)
        : null

      if (!columns || columns.length === 0) {
        const currentWidth = Array.isArray(cellNode.attrs?.colwidth) && cellNode.attrs.colwidth[0]
          ? Number(cellNode.attrs.colwidth[0])
          : Math.round(firstCell.getBoundingClientRect().width)
        const nextWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(currentWidth + deltaPx))
        const transaction = currentEditor.state.tr.setNodeMarkup(cellPosition, undefined, {
          ...cellNode.attrs,
          colwidth: [nextWidth],
        })
        currentEditor.view.dispatch(transaction)
        return
      }

      const activeColumnIndex = columns.findIndex((column) =>
        column.some((cell) => cell.pos === cellPosition)
      )
      if (activeColumnIndex === -1) return
      if (!isCurrentTableColumnSelection(activeColumnIndex) && !selectTableColumnByIndex(activeColumnIndex)) {
        return
      }
      const overflowMode = getTableOverflowMode(tableNode)
      const resizeResult = resizeTableColumnByIndex(activeColumnIndex, deltaPx)
      if (
        overflowMode !== TABLE_OVERFLOW_MODE_WIDE &&
        didTableColumnResizeHitOverflowPolicy(deltaPx, resizeResult)
      ) {
        showTableOverflowCoachmark()
      } else if (deltaPx < 0) {
        hideTableOverflowCoachmark()
      }
      return
    }
  }, [
    editorRef,
    hideTableOverflowCoachmark,
    isCurrentTableColumnSelection,
    resizeTableColumnByIndex,
    selectTableColumnByIndex,
    showTableOverflowCoachmark,
    viewportRef,
  ])

  const startTableColumnRailResize = useCallback(
    (pointerId: number, columnIndex: number, clientX: number) => {
      const resizeContext = getCurrentTableColumnResizeContext(columnIndex)
      if (!resizeContext) return

      if (!isCurrentTableColumnSelection(columnIndex) && !selectTableColumnByIndex(columnIndex)) {
        // Fallback: avoid aborting the drag session when selection resolution is
        // temporarily unstable. Resize context is still available from DOM+affordance.
      }

      setIsTableColumnResizeActive(true)
      setTableAffordanceGeometry((prev) => ({ ...prev, columnIndex }))
      clearWindowTextSelection()
      setColumnResizeUserSelectSuppressed(true)
      tableColumnRailResizeRef.current = createTableColumnRailResizeState(
        pointerId,
        columnIndex,
        clientX,
        resizeContext.measuredWidths,
        getCurrentEditorReadableWidthPx(resizeContext.currentEditor) - 2,
        getTableOverflowMode(resizeContext.rect.table)
      )
      if (typeof document !== "undefined") {
        document.body.style.cursor = "col-resize"
      }
      updateTableColumnDragGuideForColumn(columnIndex)
    },
    [
      isCurrentTableColumnSelection,
      clearWindowTextSelection,
      getCurrentTableColumnResizeContext,
      selectTableColumnByIndex,
      setColumnResizeUserSelectSuppressed,
      setTableAffordanceGeometry,
      updateTableColumnDragGuideForColumn,
    ]
  )

  const tryStartTableColumnResizeFromDomHandle = useCallback(
    (target: EventTarget | null, pointerId: number, clientX: number) => {
      const columnIndex = resolveTableColumnIndexFromResizeHandleTarget(target)
      if (columnIndex === null) {
        const fallbackIndex = resolveTableColumnIndexFromBoundaryProbe(
          tableAffordanceGeometryRef.current,
          clientX
        )
        if (fallbackIndex === null) return false
        startTableColumnRailResize(pointerId, fallbackIndex, clientX)
        return true
      }
      startTableColumnRailResize(pointerId, columnIndex, clientX)
      return true
    },
    [startTableColumnRailResize, tableAffordanceGeometryRef]
  )

  const stopTableColumnRailResize = useCallback(() => {
    tableColumnRailResizeRef.current = null
    setIsTableColumnResizeActive(false)
    hideTableColumnDragGuide()
    clearWindowTextSelection()
    setColumnResizeUserSelectSuppressed(false)
    if (typeof document !== "undefined") {
      document.body.style.removeProperty("cursor")
    }
  }, [clearWindowTextSelection, hideTableColumnDragGuide, setColumnResizeUserSelectSuppressed])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handlePointerMove = (event: PointerEvent) => {
      const state = tableRowResizeRef.current
      if (!state) return
      const nextHeight = Math.max(
        TABLE_MIN_ROW_HEIGHT_PX,
        Math.round(state.startHeight + (event.clientY - state.startY))
      )
      state.row.style.height = `${nextHeight}px`
      state.cells.forEach((cell) => {
        cell.style.height = `${nextHeight}px`
        cell.style.minHeight = `${nextHeight}px`
      })
    }

    const handlePointerUp = () => {
      const state = tableRowResizeRef.current
      if (state) {
        const committedHeight = Math.max(
          TABLE_MIN_ROW_HEIGHT_PX,
          Math.round(state.row.getBoundingClientRect().height)
        )
        commitTableRowHeight(state.row, committedHeight)
      }
      stopTableRowResize()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      stopTableRowResize()
    }
  }, [commitTableRowHeight, stopTableRowResize])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handlePointerMove = (event: PointerEvent) => {
      const state = tableColumnRailResizeRef.current
      if (!state || state.pointerId !== event.pointerId) return
      const nextClientX = event.clientX
      const resizeResult = resizeTableColumnBySessionDelta(
        state.columnIndex,
        state.baseWidths,
        nextClientX - state.startClientX,
        state.overflowMode,
        state.budget
      )
      if (
        state.overflowMode !== TABLE_OVERFLOW_MODE_WIDE &&
        didTableColumnResizeHitOverflowPolicy(nextClientX - state.startClientX, resizeResult)
      ) {
        showTableOverflowCoachmark()
      } else if (nextClientX <= state.startClientX) {
        hideTableOverflowCoachmark()
      }
      updateTableColumnDragGuideForColumn(state.columnIndex)
    }

    const handlePointerUp = (event: PointerEvent) => {
      const state = tableColumnRailResizeRef.current
      if (!state || state.pointerId !== event.pointerId) return
      const resizeResult = resizeTableColumnBySessionDelta(
        state.columnIndex,
        state.baseWidths,
        event.clientX - state.startClientX,
        state.overflowMode,
        state.budget
      )
      if (
        state.overflowMode !== TABLE_OVERFLOW_MODE_WIDE &&
        didTableColumnResizeHitOverflowPolicy(event.clientX - state.startClientX, resizeResult)
      ) {
        showTableOverflowCoachmark()
      }
      stopTableColumnRailResize()
    }

    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    window.addEventListener("pointercancel", handlePointerUp)

    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
      window.removeEventListener("pointercancel", handlePointerUp)
      stopTableColumnRailResize()
    }
  }, [
    hideTableOverflowCoachmark,
    resizeTableColumnBySessionDelta,
    showTableOverflowCoachmark,
    stopTableColumnRailResize,
    updateTableColumnDragGuideForColumn,
  ])

  const isTableRowResizeActive = useCallback(() => Boolean(tableRowResizeRef.current), [])
  const isTableColumnRailResizeActive = useCallback(() => Boolean(tableColumnRailResizeRef.current), [])

  return {
    hideTableColumnDragGuide,
    isTableColumnRailResizeActive,
    isTableColumnResizeActive,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget: isRowResizeHandleTarget,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    startTableColumnRailResize,
    startTableRowResize,
    tableColumnDragGuideState,
    tableColumnRailResizeRef,
    tableRowResizeRef,
    tryStartTableColumnResizeFromDomHandle,
    updateTableColumnDragGuideForColumn,
  }
}
