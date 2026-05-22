import type { Editor as TiptapEditor } from "@tiptap/core"
import { Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { CellSelection, selectedRect, TableMap } from "@tiptap/pm/tables"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { getEditableTextPositionForTopLevelBlock, getFirstEditableTextPositionInNode, getTopLevelBlockIndexFromSelection, getTopLevelBlockPosition } from "./blockSelectionModel"
import { type TableAffordanceGeometry, type TableAffordanceVisibility, INITIAL_TABLE_AFFORDANCE_GEOMETRY, INITIAL_TABLE_AFFORDANCE_VISIBILITY, TABLE_ADD_BAR_VIEWPORT_PADDING_PX, TABLE_CELL_MENU_BUTTON_SIZE_PX, TABLE_EDGE_ADD_BUTTON_SIZE_PX, clampViewportPosition, intersectsViewportBounds, resolveDesktopTableRailLayout } from "./tableAffordanceModel"
import { type DraggedTableAxisState, type PendingTableAxisDragState, type TableAxis, type TableAxisDragGhostPosition, type TableAxisReorderIndicatorState, createDraggedTableAxisState, createHiddenTableAxisReorderIndicatorState, createPendingTableAxisDragState, createTableAxisDragGhostPosition, hideTableAxisReorderIndicatorState, resolveTableAxisIndexFromPointer, resolveTableAxisReorderIndicator } from "./tableAxisDragModel"
import { type TableCornerGrowState, type TableCornerGrowStepMetrics, type TableCornerPreviewState, resolveTableCornerGrowStepMetrics, resolveTableCornerGrowStepMetricsFromDataset, resolveTableCornerPreviewState } from "./tableCornerGrowModel"
import { TABLE_OVERFLOW_COACHMARK_DISMISS_MS, createHiddenTableOverflowCoachmarkState, hideTableOverflowCoachmarkState, resolveCompactTableAffordanceKind, resolveTableHandleVisibility, resolveTableMenuFlags, resolveTableMenuState, resolveTableOverflowCoachmarkState, type TableMenuKind, type TableMenuState, type TableOverflowCoachmarkState } from "./tableFloatingUiModel"
import { findActiveRenderedTable, readRenderedColumnWidths, resolveActiveRenderedTableForFloatingUi, resolveTableScopedSelectedCell } from "./tableRenderedDomModel"
import { type TableColumnDragGuideState, type TableColumnRailResizeState, type TableRowResizeState, createHiddenTableColumnDragGuideState, createTableColumnRailResizeState, createTableRowResizeState, hideTableColumnDragGuideState, isRowResizeHandleTarget, resolveTableColumnDragGuideState, resolveTableColumnIndexFromResizeHandleTarget } from "./tableResizeInteractionModel"
import { buildReorderedSimpleTableNode, canShrinkTableAxisAtEnd, collectSimpleTableColumnCells, countShrinkableRenderedTableAxisAtEnd, countShrinkableTableAxisAtEnd, getActiveTableStructureState, isTableSelectionActive } from "./tableStructureModel"
import { TABLE_OVERFLOW_MODE_WIDE, computeNextTableColumnWidthsForResize, didTableColumnResizeHitOverflowPolicy, getTableOverflowMode } from "./tableWidthModel"
import { applyTableColumnWidthsToTransaction, getCurrentEditorReadableWidthPx, hasExplicitColumnWidth, normalizeRenderedTableWidthsToReadableBudget, readColumnWidthFromCell, shouldClampTableWidthBudget } from "./tableWidthRuntime"
import { TABLE_MIN_COLUMN_WIDTH_PX, TABLE_MIN_ROW_HEIGHT_PX } from "src/libs/markdown/tableMetadata"

type UseBlockEditorTableOverlayControllerArgs = {
  clearStickyTopLevelBlockSelection: () => void
  editor: TiptapEditor | null
  editorRef: MutableRefObject<TiptapEditor | null>
  isCoarsePointer: boolean
  selectionTick: number
  setSelectionTick: Dispatch<SetStateAction<number>>
  syncSelectedBlockNodeSurface: (blockIndex: number | null) => void
  viewportRef: RefObject<HTMLDivElement>
}

const DESKTOP_TABLE_RAIL_MEDIA_QUERY = "(max-width: 768px)"
const TABLE_CORNER_BUTTON_SIZE_PX = 22
const TABLE_CORNER_GROW_MOUSE_POINTER_ID = -1
const TABLE_CORNER_DRAG_CLICK_GUARD_PX = 4
const TABLE_COLUMN_GRIP_WIDTH_PX = 40
const TABLE_COLUMN_GRIP_HEIGHT_PX = 22
const TABLE_ROW_GRIP_WIDTH_PX = 22
const TABLE_ROW_GRIP_HEIGHT_PX = 40
const TABLE_AXIS_GRIP_EDGE_INSET_PX = 0
const TABLE_ADD_BAR_THICKNESS_PX = 28
const TABLE_AXIS_RAIL_EDGE_HOTZONE_PX = 18
const TABLE_TRAILING_ADD_EDGE_HOTZONE_PX = 18
const TABLE_EDGE_HANDLE_INSET_PX = 6
const TABLE_CORNER_CLUSTER_GAP_PX = 6
const TABLE_CORNER_CLUSTER_WIDTH_PX =
  TABLE_CORNER_BUTTON_SIZE_PX * 2 + TABLE_CORNER_CLUSTER_GAP_PX
const TABLE_QUICK_RAIL_HIDE_DELAY_MS = 120

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

export const useBlockEditorTableOverlayController = ({
  clearStickyTopLevelBlockSelection,
  editor,
  editorRef,
  isCoarsePointer,
  selectionTick,
  setSelectionTick,
  syncSelectedBlockNodeSurface,
  viewportRef,
}: UseBlockEditorTableOverlayControllerArgs) => {
  const activeTableElementRef = useRef<HTMLTableElement | null>(null)
  const hoveredTableElementRef = useRef<HTMLTableElement | null>(null)
  const tableHoverAnchorLockUntilRef = useRef(0)

  const pendingTableAxisDragRef = useRef<PendingTableAxisDragState | null>(null)
  const pendingTableAxisDragCleanupRef = useRef<(() => void) | null>(null)
  const tableAxisDragSuppressClickRef = useRef(false)

  const tableRowResizeRef = useRef<TableRowResizeState | null>(null)
  const tableColumnRailResizeRef = useRef<TableColumnRailResizeState | null>(null)
  const tableCornerGrowRef = useRef<TableCornerGrowState | null>(null)
  const tableCornerGrowSuppressClickRef = useRef(false)
  const tableQuickRailHideTimerRef = useRef<number | null>(null)
  const tableOverflowCoachmarkHideTimerRef = useRef<number | null>(null)

  const [isNarrowTableViewport, setIsNarrowTableViewport] = useState(false)

  const [tableAffordanceGeometry, setTableAffordanceGeometry] = useState<TableAffordanceGeometry>(
    INITIAL_TABLE_AFFORDANCE_GEOMETRY
  )
  const [tableAffordanceVisibility, setTableAffordanceVisibility] = useState<TableAffordanceVisibility>(
    INITIAL_TABLE_AFFORDANCE_VISIBILITY
  )
  const [tableColumnDragGuideState, setTableColumnDragGuideState] =
    useState<TableColumnDragGuideState>(createHiddenTableColumnDragGuideState)
  const [tableCornerPreviewState, setTableCornerPreviewState] = useState<TableCornerPreviewState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    columnSteps: 0,
    rowSteps: 0,
  })
  const [isTableQuickRailHovered, setIsTableQuickRailHovered] = useState(false)
  const [isTableColumnResizeActive, setIsTableColumnResizeActive] = useState(false)
  const [isTableCornerGrowActive, setIsTableCornerGrowActive] = useState(false)
  const [hoveredTableCellMenuLayout, setHoveredTableCellMenuLayout] = useState<{
    cellMenuLeft: number
    cellMenuTop: number
  } | null>(null)
  const [tableMenuState, setTableMenuState] = useState<TableMenuState>(null)
  const [tableOverflowCoachmarkState, setTableOverflowCoachmarkState] = useState<TableOverflowCoachmarkState>(
    createHiddenTableOverflowCoachmarkState
  )
  const tableAffordanceGeometryRef = useRef(tableAffordanceGeometry)
  const tableAffordanceVisibilityRef = useRef(tableAffordanceVisibility)
  const tableCornerPreviewStateRef = useRef<TableCornerPreviewState>({
    visible: false,
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    columnSteps: 0,
    rowSteps: 0,
  })
  const [draggedTableAxisState, setDraggedTableAxisState] = useState<DraggedTableAxisState>(null)
  const [tableAxisDragGhostPosition, setTableAxisDragGhostPosition] = useState<TableAxisDragGhostPosition>(null)
  const [tableAxisReorderIndicatorState, setTableAxisReorderIndicatorState] =
    useState<TableAxisReorderIndicatorState>(createHiddenTableAxisReorderIndicatorState)

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

  const cancelTableOverflowCoachmarkHide = useCallback(() => {
    if (typeof window === "undefined") return
    if (tableOverflowCoachmarkHideTimerRef.current !== null) {
      window.clearTimeout(tableOverflowCoachmarkHideTimerRef.current)
      tableOverflowCoachmarkHideTimerRef.current = null
    }
  }, [])

  const hideTableOverflowCoachmark = useCallback(() => {
    cancelTableOverflowCoachmarkHide()
    setTableOverflowCoachmarkState(hideTableOverflowCoachmarkState)
  }, [cancelTableOverflowCoachmarkHide])

  const scheduleTableOverflowCoachmarkHide = useCallback(
    (delayMs = TABLE_OVERFLOW_COACHMARK_DISMISS_MS) => {
      if (typeof window === "undefined") return
      cancelTableOverflowCoachmarkHide()
      tableOverflowCoachmarkHideTimerRef.current = window.setTimeout(() => {
        tableOverflowCoachmarkHideTimerRef.current = null
        setTableOverflowCoachmarkState(hideTableOverflowCoachmarkState)
      }, delayMs)
    },
    [cancelTableOverflowCoachmarkHide]
  )
  useEffect(() => () => cancelTableOverflowCoachmarkHide(), [cancelTableOverflowCoachmarkHide])
  const showTableOverflowCoachmark = useCallback(() => {
    if (isCoarsePointer || isNarrowTableViewport || typeof window === "undefined") return
    const renderedTable = resolveActiveRenderedTableForFloatingUi(
      viewportRef.current,
      tableAffordanceGeometryRef.current
    )
    const tableRect = renderedTable?.getBoundingClientRect() ?? null
    setTableOverflowCoachmarkState(
      resolveTableOverflowCoachmarkState({
        tableRect,
        fallbackAnchor: tableAffordanceGeometryRef.current.cornerAnchor,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        cornerButtonSize: TABLE_CORNER_BUTTON_SIZE_PX,
      })
    )
    scheduleTableOverflowCoachmarkHide()
  }, [isCoarsePointer, isNarrowTableViewport, scheduleTableOverflowCoachmarkHide, viewportRef])

  const setViewportRowResizeHot = useCallback((enabled: boolean) => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (enabled) {
      viewport.setAttribute("data-row-resize-hot", "true")
      return
    }
    viewport.removeAttribute("data-row-resize-hot")
  }, [viewportRef])


  const hideTableQuickRailImmediately = useCallback(() => {
    if (tableQuickRailHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(tableQuickRailHideTimerRef.current)
      tableQuickRailHideTimerRef.current = null
    }
    setTableAffordanceVisibility((prev) => (prev.visible ? { ...prev, visible: false } : prev))
  }, [])

  const cancelTableQuickRailHide = useCallback(() => {
    if (tableQuickRailHideTimerRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(tableQuickRailHideTimerRef.current)
      tableQuickRailHideTimerRef.current = null
    }
  }, [])

  const clearWindowTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    selection.removeAllRanges()
  }, [])

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
    [hideTableColumnDragGuide, viewportRef]
  )

  const scheduleTableQuickRailHide = useCallback((delayMs = TABLE_QUICK_RAIL_HIDE_DELAY_MS) => {
    cancelTableQuickRailHide()
    if (typeof window === "undefined") return
    tableQuickRailHideTimerRef.current = window.setTimeout(() => {
      setTableAffordanceVisibility((prev) => (prev.visible ? { ...prev, visible: false } : prev))
      tableQuickRailHideTimerRef.current = null
    }, delayMs)
  }, [cancelTableQuickRailHide])


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


  const getTableCellFromTarget = useCallback((target: EventTarget | null) => {
    const normalizedTarget =
      target instanceof Element ? target : target instanceof Node ? target.parentElement : null
    if (!(normalizedTarget instanceof Element)) return null
    const cell = normalizedTarget.closest("td, th")
    if (!(cell instanceof HTMLTableCellElement)) return null
    return cell
  }, [])

  const getTableCellFromClientPoint = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null) => {
      const targetCell = getTableCellFromTarget(target)
      if (targetCell) return targetCell
      if (typeof document === "undefined") return null

      const pointElement = document.elementFromPoint(clientX, clientY)
      const pointCell = pointElement?.closest("td, th")
      if (pointCell instanceof HTMLTableCellElement) return pointCell

      const normalizedTarget =
        target instanceof Element ? target : target instanceof Node ? target.parentElement : null
      const tableSurfaceElement =
        normalizedTarget?.closest(".aq-table-shell, .tableWrapper, table") ??
        pointElement?.closest(".aq-table-shell, .tableWrapper, table") ??
        null
      const tableElement =
        tableSurfaceElement instanceof HTMLTableElement
          ? tableSurfaceElement
          : (tableSurfaceElement?.querySelector("table") as HTMLTableElement | null)
      if (!tableElement) return null

      const cells = Array.from(tableElement.querySelectorAll("th, td")).filter(
        (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
      )
      return (
        cells.find((cell) => {
          const rect = cell.getBoundingClientRect()
          return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
        }) ?? null
      )
    },
    [getTableCellFromTarget]
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

  const getActiveTableRectFromDom = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null

    const tableElement = findActiveRenderedTable(viewportRef.current, tableAffordanceGeometryRef.current)
    const firstCell = tableElement?.querySelector<HTMLElement>(
      "thead tr:first-of-type > th, thead tr:first-of-type > td, tbody tr:first-of-type > th, tbody tr:first-of-type > td, tr:first-of-type > th, tr:first-of-type > td"
    )
    if (!tableElement || !firstCell) return null

    let domPosition = 0
    try {
      domPosition = activeEditor.view.posAtDOM(firstCell, 0)
    } catch {
      return null
    }

    const resolvedPosition = resolveDocPosSafe(activeEditor, domPosition)
    if (!resolvedPosition) return null

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      if (resolvedPosition.node(depth).type.name !== "table") continue
      const table = resolvedPosition.node(depth)
      const tableStart = resolvedPosition.start(depth)
      return {
        map: TableMap.get(table),
        table,
        tableStart,
      }
    }

    return null
  }, [viewportRef])

  const resolveTableQuickRailAnchorElement = useCallback(() => {
    const viewport = viewportRef.current
    if (!viewport) return null

    const now =
      typeof window !== "undefined" && typeof window.performance !== "undefined"
        ? window.performance.now()
        : Date.now()
    const hoveredTable =
      hoveredTableElementRef.current?.isConnected &&
      viewport.contains(hoveredTableElementRef.current) &&
      now <= tableHoverAnchorLockUntilRef.current
        ? hoveredTableElementRef.current
        : null
    const renderedTable =
      hoveredTable ??
      resolveActiveRenderedTableForFloatingUi(
        viewport,
        tableAffordanceGeometryRef.current,
        activeTableElementRef.current
      )
    const selectedCell = resolveTableScopedSelectedCell(renderedTable)
    if (selectedCell) return selectedCell

    if (!renderedTable) return null

    const rows = Array.from(renderedTable.querySelectorAll("tr")).filter(
      (node): node is HTMLTableRowElement => node instanceof HTMLTableRowElement
    )
    const row = rows[tableAffordanceGeometryRef.current.rowIndex] ?? null
    if (!row) return renderedTable.querySelector("th, td") as HTMLElement | null

    const cells = Array.from(row.children).filter((node): node is HTMLElement => node instanceof HTMLElement)
    return (
      cells[tableAffordanceGeometryRef.current.columnIndex] ??
      (row.querySelector("th, td") as HTMLElement | null) ??
      (renderedTable.querySelector("th, td") as HTMLElement | null)
    )
  }, [viewportRef])

  const syncHoveredTableCellMenuLayout = useCallback((
    tableElement: HTMLTableElement | null,
    preferredCell?: HTMLElement | null
  ) => {
    if (typeof window === "undefined" || !tableElement?.isConnected) {
      setHoveredTableCellMenuLayout(null)
      return
    }
    const anchorCell =
      preferredCell ??
      resolveTableScopedSelectedCell(tableElement) ??
      (tableElement.querySelector("th, td") as HTMLElement | null)
    if (!anchorCell) {
      setHoveredTableCellMenuLayout(null)
      return
    }
    const cellRect = anchorCell.getBoundingClientRect()
    setHoveredTableCellMenuLayout({
      cellMenuLeft: clampViewportPosition(
        Math.round(
          cellRect.left +
            cellRect.width -
            Math.round(TABLE_CELL_MENU_BUTTON_SIZE_PX / 2) -
            TABLE_EDGE_HANDLE_INSET_PX
        ),
        TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
        window.innerWidth,
        TABLE_CELL_MENU_BUTTON_SIZE_PX
      ),
      cellMenuTop: clampViewportPosition(
        Math.round(
          cellRect.top + Math.max(0, cellRect.height / 2 - TABLE_CELL_MENU_BUTTON_SIZE_PX / 2)
        ),
        TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
        window.innerHeight,
        TABLE_CELL_MENU_BUTTON_SIZE_PX
      ),
    })
  }, [])

  const getCurrentSelectedTableRect = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return null
    if (isTableSelectionActive(activeEditor)) {
      try {
        return selectedRect(activeEditor.state)
      } catch {
        return getActiveTableRectFromDom(activeEditor)
      }
    }

    return getActiveTableRectFromDom(activeEditor)
  }, [getActiveTableRectFromDom])

  const resolveTableNodePosition = useCallback((activeEditor: TiptapEditor, tableNode: ProseMirrorNode) => {
    let tablePos: number | null = null
    activeEditor.state.doc.descendants((node: ProseMirrorNode, pos: number) => {
      if (node === tableNode) {
        tablePos = pos
        return false
      }
      return true
    })
    return tablePos
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
    [editorRef, selectTableAxisAtIndex, setSelectionTick]
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
    [cancelTableQuickRailHide, editorRef, selectTableAxisAtIndex, viewportRef]
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
      viewportRef,
    ]
  )

  const focusRenderedTableCell = useCallback((cell: HTMLTableCellElement) => {
    const currentEditor = editorRef.current
    if (!currentEditor) return false

    let domPosition = 0
    try {
      domPosition = currentEditor.view.posAtDOM(cell, 0)
    } catch {
      return false
    }

    const resolvedPosition = resolveDocPosSafe(currentEditor, domPosition)
    if (!resolvedPosition) return false

    for (let depth = resolvedPosition.depth; depth > 0; depth -= 1) {
      const node = resolvedPosition.node(depth)
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") continue

      const cellPosition = resolvedPosition.before(depth)
      const cellNode = currentEditor.state.doc.nodeAt(cellPosition)
      if (!cellNode) return false

      const selectionPos =
        getFirstEditableTextPositionInNode(cellNode, cellPosition) ?? Math.max(1, cellPosition + 1)
      currentEditor.view.dispatch(
        currentEditor.state.tr.setSelection(TextSelection.create(currentEditor.state.doc, selectionPos))
      )
      focusElementWithoutScroll(currentEditor.view.dom)
      return true
    }

    return false
  }, [editorRef])

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
    [editorRef, focusRenderedTableCell, getCurrentSelectedTableRect, selectTableColumnByIndex, selectTableRowByIndex, viewportRef]
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
    [editorRef, focusRenderedTableCell, getCurrentSelectedTableRect, selectTableColumnByIndex, selectTableRowByIndex, viewportRef]
  )

  const growTableFromCorner = useCallback(() => {
    const appendedColumn = appendTableAxisAtEnd("column")
    const appendedRow = appendTableAxisAtEnd("row")
    return appendedColumn || appendedRow
  }, [appendTableAxisAtEnd])

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
        setSelectionTick((prev) => prev + 1)
      }

      return {
        appliedColumnSteps,
        appliedRowSteps,
      }
    },
    [appendTableAxisAtEnd, setSelectionTick, shrinkTableAxisAtEnd]
  )

  const resolveCurrentTableCornerGrowStepMetrics = useCallback(
    () => resolveTableCornerGrowStepMetrics(tableAffordanceGeometryRef.current),
    []
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
    [editorRef, getCurrentSelectedTableRect, resolveCurrentTableCornerGrowStepMetrics, updateTableCornerPreviewState, viewportRef]
  )

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
    [editorRef, getCurrentSelectedTableRect, resolveTableNodePosition, viewportRef]
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
    hideTableOverflowCoachmark,
    editorRef,
    isCurrentTableColumnSelection,
    resizeTableColumnByIndex,
    selectTableColumnByIndex,
    showTableOverflowCoachmark,
    viewportRef,
  ])

  const startTableColumnRailResize = useCallback(
    (pointerId: number, columnIndex: number, clientX: number) => {
      if (!selectTableColumnByIndex(columnIndex)) return
      const resizeContext = getCurrentTableColumnResizeContext(columnIndex)
      if (!resizeContext) return
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
      clearWindowTextSelection,
      getCurrentTableColumnResizeContext,
      selectTableColumnByIndex,
      setColumnResizeUserSelectSuppressed,
      updateTableColumnDragGuideForColumn,
    ]
  )

  const tryStartTableColumnResizeFromDomHandle = useCallback(
    (target: EventTarget | null, pointerId: number, clientX: number) => {
      const columnIndex = resolveTableColumnIndexFromResizeHandleTarget(target)
      if (columnIndex === null) return false
      startTableColumnRailResize(pointerId, columnIndex, clientX)
      return true
    },
    [startTableColumnRailResize]
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

  const syncTableQuickRailFromElement = useCallback((
    element: Element | null,
    hoverClientX?: number,
    hoverClientY?: number
  ) => {
    const tableSurfaceElement = element?.closest(".aq-table-shell, .tableWrapper, table") ?? null
    const tableElement =
      tableSurfaceElement instanceof HTMLTableElement
        ? tableSurfaceElement
        : (tableSurfaceElement?.querySelector("table") as HTMLTableElement | null)
    const tableRect = tableElement?.getBoundingClientRect()
    const hasHoverPoint =
      typeof hoverClientX === "number" &&
      Number.isFinite(hoverClientX) &&
      typeof hoverClientY === "number" &&
      Number.isFinite(hoverClientY)
    if (!tableElement || !tableRect) {
      activeTableElementRef.current = null
      hoveredTableElementRef.current = null
      tableHoverAnchorLockUntilRef.current = 0
      setHoveredTableCellMenuLayout(null)
      hideTableQuickRailImmediately()
      return
    }
    activeTableElementRef.current = tableElement
    if (hasHoverPoint) {
      hoveredTableElementRef.current = tableElement
      tableHoverAnchorLockUntilRef.current =
        (typeof window !== "undefined" && typeof window.performance !== "undefined"
          ? window.performance.now()
          : Date.now()) + 280
    }
    cancelTableQuickRailHide()
    const hoveredCell = element?.closest("th, td") as HTMLElement | null
    const selectedCell = resolveTableScopedSelectedCell(tableElement)
    const activeCell = hoveredCell || selectedCell || (tableElement.querySelector("th, td") as HTMLElement | null)
    const activeCellRect = activeCell?.getBoundingClientRect()
    const activeRow = activeCell?.closest("tr") as HTMLTableRowElement | null
    const activeRowRect = activeRow?.getBoundingClientRect()
    const activeColumnLeft = activeCellRect?.left ?? tableRect.left
    const activeColumnRight = activeCellRect?.right ?? tableRect.right
    const activeRowTopBound = activeRowRect?.top ?? tableRect.top
    const activeRowBottomBound = activeRowRect?.bottom ?? tableRect.bottom
    const visibleLeft = Math.round(tableRect.left)
    const visibleTop = Math.round(tableRect.top)
    const visibleRight = Math.round(tableRect.right)
    const visibleBottom = Math.round(tableRect.bottom)
    const cornerHotzoneWidth = TABLE_CORNER_CLUSTER_WIDTH_PX + TABLE_EDGE_HANDLE_INSET_PX
    const cornerHotzoneHeight = TABLE_CORNER_BUTTON_SIZE_PX + TABLE_EDGE_HANDLE_INSET_PX
    const showCornerControls =
      hasHoverPoint &&
      hoverClientX >= visibleRight - cornerHotzoneWidth &&
      hoverClientX <= visibleRight + TABLE_EDGE_HANDLE_INSET_PX &&
      hoverClientY >= visibleTop - TABLE_EDGE_HANDLE_INSET_PX &&
      hoverClientY <= visibleTop + cornerHotzoneHeight
    const showColumnAddBar =
      hasHoverPoint &&
      !showCornerControls &&
      hoverClientX >= visibleRight - TABLE_TRAILING_ADD_EDGE_HOTZONE_PX &&
      hoverClientX <= visibleRight + TABLE_ADD_BAR_THICKNESS_PX &&
      hoverClientY >= visibleTop &&
      hoverClientY <= visibleBottom
    const showColumnRail =
      hasHoverPoint &&
      Boolean(activeCellRect) &&
      !showCornerControls &&
      hoverClientY >= visibleTop - TABLE_COLUMN_GRIP_HEIGHT_PX &&
      hoverClientY <= visibleTop + TABLE_AXIS_RAIL_EDGE_HOTZONE_PX &&
      hoverClientX >= activeColumnLeft &&
      hoverClientX <= activeColumnRight
    const showRowAddBar =
      hasHoverPoint &&
      hoverClientY >= visibleBottom - TABLE_TRAILING_ADD_EDGE_HOTZONE_PX &&
      hoverClientY <= visibleBottom + TABLE_ADD_BAR_THICKNESS_PX &&
      hoverClientX >= visibleLeft &&
      hoverClientX <= visibleRight
    const showRowRail =
      hasHoverPoint &&
      Boolean(activeRowRect) &&
      hoverClientX >= visibleLeft - TABLE_ROW_GRIP_WIDTH_PX &&
      hoverClientX <= visibleLeft + TABLE_AXIS_RAIL_EDGE_HOTZONE_PX &&
      hoverClientY >= activeRowTopBound &&
      hoverClientY <= activeRowBottomBound
    const showCellMenu =
      hasHoverPoint &&
      Boolean(hoveredCell) &&
      !showColumnRail &&
      !showRowRail &&
      !showColumnAddBar &&
      !showRowAddBar &&
      !showCornerControls
    const activeRowIndex = activeRow
      ? Array.from(tableElement.querySelectorAll("tr")).findIndex((row) => row === activeRow)
      : 0
    const activeColumnIndex = activeCell?.parentElement
      ? Array.from(activeCell.parentElement.children).findIndex((child) => child === activeCell)
      : 0
    if (hasHoverPoint) {
      syncHoveredTableCellMenuLayout(tableElement, activeCell)
    }
    const firstRowCells = Array.from(
      (tableElement.querySelector("thead tr, tbody tr, tr")?.children ?? []) as HTMLCollectionOf<HTMLElement>
    )
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        return {
          left: Math.round(Math.max(0, cellRect.left - tableRect.left)),
          width: Math.round(cellRect.width),
        }
      })
    const tableLeft = Math.round(tableRect.left)
    const tableTop = Math.round(tableRect.top)
    const tableWidth = Math.round(tableRect.width)
    const tableHeight = Math.round(tableRect.height)
    const tableRight = tableLeft + tableWidth
    const tableBottom = tableTop + tableHeight
    const cellLeft = Math.round(activeCellRect?.left ?? tableRect.left + 16)
    const cellTop = Math.round(activeCellRect?.top ?? tableRect.top + 16)
    const cellWidth = Math.round(activeCellRect?.width ?? 120)
    const cellHeight = Math.round(activeCellRect?.height ?? 44)
    const rowTop = Math.round(activeRowRect?.top ?? tableRect.top + 52)
    const rowHeight = Math.round(activeRowRect?.height ?? 44)
    const columnLeft = Math.round(activeCellRect?.left ?? tableRect.left + 72)
    const columnWidth = Math.round(activeCellRect?.width ?? 120)
    const rowHandleAnchor = {
      left: Math.round(tableLeft - Math.round(TABLE_ROW_GRIP_WIDTH_PX / 2) + TABLE_AXIS_GRIP_EDGE_INSET_PX),
      top: Math.round(rowTop + Math.max(0, rowHeight / 2 - TABLE_ROW_GRIP_HEIGHT_PX / 2)),
    }
    const columnHandleAnchor = {
      left: Math.round(columnLeft + Math.max(0, columnWidth / 2 - TABLE_COLUMN_GRIP_WIDTH_PX / 2)),
      top: Math.round(tableTop - Math.round(TABLE_COLUMN_GRIP_HEIGHT_PX / 2) + TABLE_AXIS_GRIP_EDGE_INSET_PX),
    }
    const columnAddAnchor = {
      left:
        typeof window === "undefined"
          ? Math.round(tableRight - Math.round(TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX)
          : clampViewportPosition(
              Math.round(tableRight - Math.round(TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX),
              TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
              window.innerWidth,
              TABLE_EDGE_ADD_BUTTON_SIZE_PX
            ),
      top: Math.round(tableTop + Math.max(0, tableHeight / 2 - TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2)),
    }
    const rowAddAnchor = {
      left: Math.round(tableLeft + Math.max(0, tableWidth / 2 - TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2)),
      top:
        typeof window === "undefined"
          ? Math.round(tableBottom - Math.round(TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX)
          : clampViewportPosition(
              Math.round(tableBottom - Math.round(TABLE_EDGE_ADD_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX),
              TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
              window.innerHeight,
              TABLE_EDGE_ADD_BUTTON_SIZE_PX
            ),
    }
    const cornerAnchor = {
      left: Math.round(tableLeft + Math.max(0, tableWidth - TABLE_CORNER_CLUSTER_WIDTH_PX - TABLE_EDGE_HANDLE_INSET_PX)),
      top: Math.round(tableTop + TABLE_EDGE_HANDLE_INSET_PX),
    }
    const cellMenuAnchor = {
      left:
        typeof window === "undefined"
          ? Math.round(cellLeft + cellWidth - Math.round(TABLE_CELL_MENU_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX)
          : clampViewportPosition(
              Math.round(cellLeft + cellWidth - Math.round(TABLE_CELL_MENU_BUTTON_SIZE_PX / 2) - TABLE_EDGE_HANDLE_INSET_PX),
              TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
              window.innerWidth,
              TABLE_CELL_MENU_BUTTON_SIZE_PX
            ),
      top:
        typeof window === "undefined"
          ? Math.round(cellTop + Math.max(0, cellHeight / 2 - TABLE_CELL_MENU_BUTTON_SIZE_PX / 2))
          : clampViewportPosition(
              Math.round(cellTop + Math.max(0, cellHeight / 2 - TABLE_CELL_MENU_BUTTON_SIZE_PX / 2)),
              TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
              window.innerHeight,
              TABLE_CELL_MENU_BUTTON_SIZE_PX
            ),
    }
    setTableAffordanceGeometry({
      left: rowHandleAnchor.left,
      top: cornerAnchor.top,
      tableLeft,
      tableTop,
      tableRight,
      tableBottom,
      width: tableWidth,
      height: tableHeight,
      surfaceLeft: tableLeft,
      surfaceTop: tableTop,
      surfaceWidth: tableWidth,
      surfaceHeight: tableHeight,
      cellLeft,
      cellTop,
      cellWidth,
      cellHeight,
      rowIndex: activeRowIndex >= 0 ? activeRowIndex : 0,
      rowTop,
      rowHeight,
      columnLeft,
      columnWidth,
      columnIndex: activeColumnIndex >= 0 ? activeColumnIndex : 0,
      rowHandleAnchor,
      columnHandleAnchor,
      rowAddAnchor,
      columnAddAnchor,
      cornerAnchor,
      cellMenuAnchor,
      columnSegments: firstRowCells,
    })
    setTableAffordanceVisibility((prev) => ({
      visible: true,
      showColumnRail: hasHoverPoint ? showColumnRail : prev.showColumnRail,
      showRowRail: hasHoverPoint ? showRowRail : prev.showRowRail,
      showColumnAddBar: hasHoverPoint ? showColumnAddBar : prev.showColumnAddBar,
      showRowAddBar: hasHoverPoint ? showRowAddBar : prev.showRowAddBar,
      showCornerControls: hasHoverPoint ? showCornerControls : prev.showCornerControls,
      showCellMenu: hasHoverPoint ? showCellMenu : prev.showCellMenu,
    }))
  }, [cancelTableQuickRailHide, hideTableQuickRailImmediately, syncHoveredTableCellMenuLayout])

  const stabilizeTableSelectionSurface = useCallback((nextEditor?: TiptapEditor | null) => {
    if (typeof window === "undefined") return

    const run = () => {
      const activeEditor = nextEditor ?? editorRef.current
      if (!activeEditor) return
      normalizeRenderedTableWidthsToReadableBudget(activeEditor)
      const anchorCell = resolveTableQuickRailAnchorElement()
      if (!isTableSelectionActive(activeEditor) && !anchorCell) return
      syncTableQuickRailFromElement(anchorCell)
      setSelectionTick((prev) => prev + 1)
    }

    const schedule = (remainingFrames: number) => {
      run()
      if (remainingFrames <= 1) return
      window.requestAnimationFrame(() => schedule(remainingFrames - 1))
    }

    window.requestAnimationFrame(() => schedule(4))
  }, [editorRef, resolveTableQuickRailAnchorElement, setSelectionTick, syncTableQuickRailFromElement])

  useEffect(() => {
    tableAffordanceGeometryRef.current = tableAffordanceGeometry
  }, [tableAffordanceGeometry])

  useEffect(() => {
    tableAffordanceVisibilityRef.current = tableAffordanceVisibility
  }, [tableAffordanceVisibility])


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

    const handleMouseUp = (event: MouseEvent) => {
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


  const isTableMode = isTableSelectionActive(editor)
  const isTableStructuralSelection = useMemo(() => {
    if (!editor) return false
    void selectionTick
    const { selection } = editor.state
    return selection instanceof CellSelection
  }, [editor, selectionTick])
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
  const {
    tableMenuKind,
    isAnyTableMenuOpen,
    isTableStructureMenuOpen,
    isRowMenuOpen,
    isColumnMenuOpen,
    isCellMenuOpen,
  } = resolveTableMenuFlags(tableMenuState)
  const hasActiveTableCellContext = useMemo(() => {
    if (!editor || isTableStructuralSelection) return false
    void selectionTick
    return Boolean(editor.isActive("tableCell") || editor.isActive("tableHeader"))
  }, [editor, isTableStructuralSelection, selectionTick])
  const shouldPersistTableHandles =
    isTableStructuralSelection || isAnyTableMenuOpen || Boolean(draggedTableAxisState) || isTableCornerGrowActive
  const shouldUseCompactTableAffordance = isCoarsePointer || isNarrowTableViewport
  const shouldShowDesktopTableHandles =
    !shouldUseCompactTableAffordance &&
    (tableAffordanceVisibility.visible || isTableQuickRailHovered || shouldPersistTableHandles || isTableColumnResizeActive)
  const compactTableAffordanceKind = resolveCompactTableAffordanceKind({
    shouldUseCompactTableAffordance,
    currentTableAxisSelection,
    draggedTableAxis: draggedTableAxisState?.axis ?? null,
    isRowMenuOpen,
    isColumnMenuOpen,
    tableAffordanceVisible: tableAffordanceVisibility.visible,
    shouldPersistTableHandles,
    isTableStructureMenuOpen,
    hasActiveTableCellContext,
  })
  const {
    shouldShowColumnRail,
    shouldShowRowRail,
    shouldShowColumnAddBar,
    shouldShowRowAddBar,
  } = resolveTableHandleVisibility({
    compactTableAffordanceKind,
    shouldShowDesktopTableHandles,
    tableAffordanceVisibility,
    currentTableAxisSelection,
    draggedTableAxis: draggedTableAxisState?.axis ?? null,
    isColumnMenuOpen,
    isRowMenuOpen,
  })
  const activeTableStructureState = useMemo(() => {
    void selectionTick
    return getActiveTableStructureState(editor)
  }, [editor, selectionTick])
  useEffect(() => {
    if (activeTableStructureState.overflowMode === TABLE_OVERFLOW_MODE_WIDE || tableMenuState) {
      hideTableOverflowCoachmark()
    }
  }, [activeTableStructureState.overflowMode, hideTableOverflowCoachmark, tableMenuState])
  const canMergeSelectedTableCells = useMemo(() => {
    if (!editor) return false
    void selectionTick
    try {
      return editor.can().chain().focus().mergeCells().run()
    } catch {
      return false
    }
  }, [editor, selectionTick])
  const canSplitSelectedTableCell = useMemo(() => {
    if (!editor) return false
    void selectionTick
    try {
      return editor.can().chain().focus().splitCell().run()
    } catch {
      return false
    }
  }, [editor, selectionTick])

  useEffect(() => {
    const currentEditor = editorRef.current
    if (!currentEditor || !isTableStructuralSelection) return
    const anchorDom = currentEditor.view.domAtPos(currentEditor.state.selection.from).node
    const anchorElement = anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
    if (!anchorElement) return
    syncTableQuickRailFromElement(anchorElement)
  }, [editorRef, isTableStructuralSelection, selectionTick, syncTableQuickRailFromElement])


  const updateActiveTableCellAttrs = useCallback(
    (attrs: Record<string, unknown>) => {
      if (!editor) return
      const entries = Object.entries(attrs)
      if (entries.length === 0) return

      const cellPositions = new Set<number>()
      const { selection } = editor.state

      if (selection instanceof CellSelection) {
        selection.forEachCell((_node, pos) => {
          cellPositions.add(pos)
        })
      } else {
        const collectFromResolvedPos = (resolvedPos: typeof selection.$from) => {
          for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
            const nodeTypeName = resolvedPos.node(depth).type.name
            if (nodeTypeName !== "tableCell" && nodeTypeName !== "tableHeader") continue
            cellPositions.add(resolvedPos.before(depth))
            return
          }
        }

        collectFromResolvedPos(selection.$from)
        collectFromResolvedPos(selection.$to)
      }

      if (cellPositions.size > 0) {
        let transaction = editor.state.tr
        let changed = false

        cellPositions.forEach((cellPos) => {
          const cellNode = transaction.doc.nodeAt(cellPos)
          if (!cellNode) return

          const nextAttrs = { ...(cellNode.attrs || {}) }
          let cellChanged = false
          entries.forEach(([name, value]) => {
            if (nextAttrs[name] === value) return
            nextAttrs[name] = value
            cellChanged = true
          })

          if (!cellChanged) return
          transaction = transaction.setNodeMarkup(cellPos, undefined, nextAttrs, cellNode.marks)
          changed = true
        })

        if (changed) {
          editor.view.dispatch(transaction)
          setSelectionTick((prev) => prev + 1)
        }
        return
      }

      const chain = editor.chain().focus()
      const cellNodeType = editor.isActive("tableHeader") ? "tableHeader" : "tableCell"
      chain.updateAttributes(cellNodeType, attrs).run()
    },
    [editor, setSelectionTick]
  )

  const updateActiveTableOverflowMode = useCallback(
    (activeEditor: TiptapEditor, overflowMode: "normal" | "wide") => {
      const tableRect = getCurrentSelectedTableRect(activeEditor)
      const tablePos = tableRect ? Math.max(0, tableRect.tableStart - 1) : null
      if (!tableRect || tablePos === null) return false

      const tableNode = activeEditor.state.doc.nodeAt(tablePos)
      if (!tableNode || tableNode.type.name !== "table") return false
      if (getTableOverflowMode(tableNode) === overflowMode) return true

      activeEditor.view.dispatch(
        activeEditor.state.tr.setNodeMarkup(tablePos, undefined, {
          ...tableNode.attrs,
          overflowMode,
        })
      )
      setSelectionTick((prev) => prev + 1)
      return true
    },
    [getCurrentSelectedTableRect, setSelectionTick]
  )

  const selectCurrentTableAxis = useCallback(
    (axis: "row" | "column") => {
      if (!editor || !isTableSelectionActive(editor)) return

      let anchorCellPos = -1
      let headCellPos = -1
      try {
        const rect = selectedRect(editor.state)
        if (rect.bottom <= rect.top || rect.right <= rect.left) return
        anchorCellPos = rect.tableStart + rect.map.positionAt(rect.top, rect.left, rect.table)
        headCellPos = rect.tableStart + rect.map.positionAt(rect.bottom - 1, rect.right - 1, rect.table)
      } catch {
        return
      }

      const anchorResolved = resolveDocPosSafe(editor, anchorCellPos)
      const headResolved = resolveDocPosSafe(editor, headCellPos)
      if (!anchorResolved || !headResolved) return

      const selection =
        axis === "row"
          ? CellSelection.rowSelection(anchorResolved, headResolved)
          : CellSelection.colSelection(anchorResolved, headResolved)

      clearStickyTopLevelBlockSelection()
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      focusElementWithoutScroll(editor.view.dom)
    },
    [clearStickyTopLevelBlockSelection, editor]
  )

  const selectActiveTableBlock = useCallback(() => {
    if (!editor) return
    const blockIndex = getTopLevelBlockIndexFromSelection(editor)
    const position = getTopLevelBlockPosition(editor, blockIndex)
    const targetNode = editor.state.doc.nodeAt(position)
    if (!targetNode || targetNode.type.name !== "table") return
    const selection = NodeSelection.create(editor.state.doc, position)
    editor.view.dispatch(editor.state.tr.setSelection(selection))
    focusElementWithoutScroll(editor.view.dom)
  }, [editor])


  const activeTableCellNodeType =
    editor?.isActive("tableHeader") ?? false ? "tableHeader" : "tableCell"
  const activeTableCellAttrs = editor?.getAttributes(activeTableCellNodeType) || {}

  useEffect(() => {
    if (isTableStructuralSelection) return
    setTableMenuState(null)
  }, [isTableStructuralSelection])


  const closeTableMenu = useCallback(() => setTableMenuState(null), [])

  const runTableMenuEditorAction = useCallback(
    (action: (activeEditor: TiptapEditor) => void) => {
      if (!editor) {
        closeTableMenu()
        return
      }

      action(editor)
      closeTableMenu()
      stabilizeTableSelectionSurface(editor)
    },
    [closeTableMenu, editor, stabilizeTableSelectionSurface]
  )

  const openTableMenu = useCallback((kind: TableMenuKind, anchorRect: DOMRect) => {
    cancelTableQuickRailHide()
    setTableMenuState((prev) =>
      resolveTableMenuState(
        prev,
        kind,
        anchorRect,
        typeof window === "undefined"
          ? null
          : {
              width: window.innerWidth,
              height: window.innerHeight,
            }
      )
    )
  }, [cancelTableQuickRailHide])

  const openSelectionAwareTableMenu = useCallback(
    (kind: TableMenuKind, anchorRect: DOMRect) => {
      if (kind === "row") {
        selectCurrentTableAxis("row")
      } else if (kind === "column") {
        selectCurrentTableAxis("column")
      } else {
        selectActiveTableBlock()
      }
      openTableMenu(kind, anchorRect)
    },
    [openTableMenu, selectActiveTableBlock, selectCurrentTableAxis]
  )

  const handleTableColumnRailSegmentClick = useCallback(
    (columnIndex: number, anchorRect: DOMRect) => {
      const selected = selectTableColumnByIndex(columnIndex)
      if (!selected) return
      setTableAffordanceGeometry((prev) => ({ ...prev, columnIndex }))
      openTableMenu("column", anchorRect)
    },
    [openTableMenu, selectTableColumnByIndex]
  )

  const handleTableRowGripClick = useCallback(
    (rowIndex: number, anchorRect: DOMRect) => {
      const selected = selectTableRowByIndex(rowIndex)
      if (!selected) return
      setTableAffordanceGeometry((prev) => ({ ...prev, rowIndex }))
      openTableMenu("row", anchorRect)
    },
    [openTableMenu, selectTableRowByIndex]
  )


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


  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY)
    const sync = () => setIsNarrowTableViewport(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])


  useEffect(() => {
    return () => {
      clearPendingTableAxisDrag()
    }
  }, [clearPendingTableAxisDrag])


  const shouldTrackSelectionLayoutSync =
    tableAffordanceVisibility.visible ||
    isTableQuickRailHovered ||
    tableMenuState !== null ||
    isTableColumnResizeActive ||
    tableColumnDragGuideState.visible ||
    Boolean(draggedTableAxisState) ||
    tableAxisReorderIndicatorState.visible
  const shouldThrottleSelectionLayoutSync =
    !tableAffordanceVisibility.visible &&
    !isTableQuickRailHovered &&
    tableMenuState === null &&
    !isTableColumnResizeActive &&
    !tableColumnDragGuideState.visible &&
    !draggedTableAxisState &&
    !tableAxisReorderIndicatorState.visible
  const shouldSyncSelectionLayoutImmediately = isTableColumnResizeActive || tableColumnDragGuideState.visible || Boolean(draggedTableAxisState) || tableAxisReorderIndicatorState.visible

  useEffect(() => {
    if (typeof window === "undefined" || !shouldTrackSelectionLayoutSync) return
    let rafId: number | null = null
    let timeoutId: number | null = null
    let lastCommittedAt = 0
    const scrollOptions: AddEventListenerOptions = { capture: true, passive: true }
    const resizeOptions: AddEventListenerOptions = { passive: true }
    const minSyncIntervalMs = shouldThrottleSelectionLayoutSync ? 72 : 0
    const sync = () => {
      if (shouldSyncSelectionLayoutImmediately) {
        lastCommittedAt = window.performance.now()
        flushSync(() => setSelectionTick((prev) => prev + 1))
        return
      }
      if (rafId !== null || timeoutId !== null) return
      const now = window.performance.now()
      const remainingDelayMs = minSyncIntervalMs > 0 ? minSyncIntervalMs - (now - lastCommittedAt) : 0
      const schedule = (delayMs: number) => {
        if (delayMs > 0) {
          timeoutId = window.setTimeout(() => {
            timeoutId = null
            schedule(0)
          }, delayMs)
          return
        }
        if (rafId !== null) return
        rafId = window.requestAnimationFrame(() => {
          rafId = null
          lastCommittedAt = window.performance.now()
          setSelectionTick((prev) => prev + 1)
        })
      }
      if (remainingDelayMs > 0) {
        schedule(remainingDelayMs)
        return
      }
      schedule(0)
    }
    window.addEventListener("scroll", sync, scrollOptions)
    window.addEventListener("resize", sync, resizeOptions)
    return () => {
      window.removeEventListener("scroll", sync, scrollOptions)
      window.removeEventListener("resize", sync, resizeOptions)
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [setSelectionTick, shouldSyncSelectionLayoutImmediately, shouldThrottleSelectionLayoutSync, shouldTrackSelectionLayoutSync])


  useEffect(() => {
    if (!tableAffordanceVisibility.visible && !isTableQuickRailHovered && !tableMenuState) return
    const anchorCell = resolveTableQuickRailAnchorElement()
    const tableElement = anchorCell?.closest("table") as HTMLTableElement | null
    const tableVisible = intersectsViewportBounds(tableElement?.getBoundingClientRect() ?? null)
    const anchorVisible = intersectsViewportBounds(anchorCell?.getBoundingClientRect() ?? null)
    if (!anchorCell || !tableElement || !tableVisible || (!anchorVisible && !isTableQuickRailHovered)) {
      setHoveredTableCellMenuLayout(null)
      setIsTableQuickRailHovered(false)
      if (tableMenuState) {
        setTableMenuState(null)
        hideTableQuickRailImmediately()
      } else if (!isTableColumnResizeActive && !isTableQuickRailHovered) {
        scheduleTableQuickRailHide(0)
      } else {
        hideTableQuickRailImmediately()
      }
      return
    }
    syncTableQuickRailFromElement(anchorCell)
  }, [
    hideTableQuickRailImmediately,
    isTableColumnResizeActive,
    isTableQuickRailHovered,
    resolveTableQuickRailAnchorElement,
    selectionTick,
    scheduleTableQuickRailHide,
    syncTableQuickRailFromElement,
    tableMenuState,
    tableAffordanceVisibility.visible,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || isCoarsePointer || (!tableAffordanceVisibility.visible && !isTableQuickRailHovered)) return
    if (tableColumnRailResizeRef.current || tableRowResizeRef.current) return

    const anchorElement = resolveTableQuickRailAnchorElement()
    const tableElement = anchorElement?.closest("table") as HTMLTableElement | null
    if (!anchorElement || !tableElement) return

    const tableRect = tableElement.getBoundingClientRect()
    const nextWidth = Math.round(tableRect.width)
    const nextSegments = Array.from(
      (tableElement.querySelector("thead tr, tbody tr, tr")?.children ?? []) as HTMLCollectionOf<HTMLElement>
    )
      .filter((child): child is HTMLElement => child instanceof HTMLElement)
      .map((cell) => {
        const cellRect = cell.getBoundingClientRect()
        return {
          left: Math.round(Math.max(0, cellRect.left - tableRect.left)),
          width: Math.round(cellRect.width),
        }
      })

    const segmentsChanged =
      nextSegments.length !== tableAffordanceGeometry.columnSegments.length ||
      nextSegments.some((segment, index) => {
        const prev = tableAffordanceGeometry.columnSegments[index]
        return !prev || Math.abs(prev.left - segment.left) > 2 || Math.abs(prev.width - segment.width) > 2
      })

    if (Math.abs(nextWidth - tableAffordanceGeometry.width) <= 2 && !segmentsChanged) return

    syncTableQuickRailFromElement(anchorElement)
  }, [
    isCoarsePointer,
    isTableQuickRailHovered,
    resolveTableQuickRailAnchorElement,
    selectionTick,
    syncTableQuickRailFromElement,
    tableAffordanceGeometry.columnSegments,
    tableAffordanceVisibility.visible,
    tableAffordanceGeometry.width,
  ])

  useEffect(() => {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return
    if (isCoarsePointer || (!tableAffordanceVisibility.visible && !isTableQuickRailHovered)) return

    const resolveAnchorElement = () => resolveTableQuickRailAnchorElement()

    const initialAnchorElement = resolveAnchorElement()
    const tableElement = initialAnchorElement?.closest("table") as HTMLTableElement | null
    if (!initialAnchorElement || !tableElement) return

    let rafId: number | null = null
    const requestSync = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = null
        syncTableQuickRailFromElement(resolveAnchorElement())
      })
    }

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            requestSync()
          })
        : null

    resizeObserver?.observe(tableElement)
    const firstRow = tableElement.querySelector("thead tr, tbody tr, tr")
    if (firstRow instanceof HTMLElement) {
      resizeObserver?.observe(firstRow)
    }

    const mutationObserver = new MutationObserver(() => {
      requestSync()
    })

    mutationObserver.observe(tableElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["colspan", "rowspan", "style", "class"],
    })

    return () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId)
      }
      resizeObserver?.disconnect()
      mutationObserver.disconnect()
    }
  }, [isCoarsePointer, isTableQuickRailHovered, resolveTableQuickRailAnchorElement, selectionTick, syncTableQuickRailFromElement, tableAffordanceVisibility.visible])


  useEffect(() => {
    if (typeof window === "undefined" || !tableMenuState) return
    const scrollOptions: AddEventListenerOptions = { capture: true, passive: true }
    const resizeOptions: AddEventListenerOptions = { passive: true }
    const closeOnViewportChange = () => {
      setHoveredTableCellMenuLayout(null)
      setIsTableQuickRailHovered(false)
      setTableMenuState(null)
      hideTableQuickRailImmediately()
    }
    window.addEventListener("scroll", closeOnViewportChange, scrollOptions)
    window.addEventListener("resize", closeOnViewportChange, resizeOptions)
    return () => {
      window.removeEventListener("scroll", closeOnViewportChange, scrollOptions)
      window.removeEventListener("resize", closeOnViewportChange, resizeOptions)
    }
  }, [hideTableQuickRailImmediately, tableMenuState])

  useEffect(() => {
    if (typeof window === "undefined" || !tableMenuState) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof PointerEvent) {
        const target = event.target
        if (
          target instanceof Element &&
          (target.closest("[data-table-menu-root='true']") ||
            target.closest("[data-table-axis-rail='true']") ||
            target.closest("[data-table-corner-handle='true']") ||
            target.closest("[data-table-column-rail-track='true']") ||
            target.closest("[data-table-menu-trigger='true']"))
        ) {
          return
        }
      }
      if (event instanceof KeyboardEvent && event.key !== "Escape") return
      setTableMenuState(null)
    }
    window.addEventListener("pointerdown", close)
    window.addEventListener("keydown", close)
    return () => {
      window.removeEventListener("pointerdown", close)
      window.removeEventListener("keydown", close)
    }
  }, [tableMenuState])

  const shouldShowTableCellMenu =
    currentTableAxisSelection === null &&
    !shouldUseCompactTableAffordance &&
    (isCellMenuOpen ||
      (tableAffordanceVisibility.visible &&
        (tableAffordanceVisibility.showCellMenu || hasActiveTableCellContext) &&
        !tableAffordanceVisibility.showColumnRail &&
        !tableAffordanceVisibility.showRowRail &&
        !tableAffordanceVisibility.showColumnAddBar &&
        !tableAffordanceVisibility.showRowAddBar &&
        !tableAffordanceVisibility.showCornerControls))
  const shouldShowCornerControls =
    shouldShowDesktopTableHandles &&
    (tableAffordanceVisibility.showCornerControls ||
      isTableStructureMenuOpen ||
      isTableCornerGrowActive ||
      (isTableStructuralSelection && currentTableAxisSelection === null))
  const shouldShowGrowHandle = shouldShowCornerControls
  const shouldShowStructureMenuButton = compactTableAffordanceKind === "table" || shouldShowCornerControls
  const shouldRenderTableAffordanceOverlay =
    shouldShowDesktopTableHandles ||
    shouldShowRowRail ||
    shouldShowColumnRail ||
    shouldShowRowAddBar ||
    shouldShowColumnAddBar ||
    shouldShowStructureMenuButton ||
    shouldShowTableCellMenu
  const desktopTableRailLayout = useMemo(() => {
    if (typeof window === "undefined") return null
    return resolveDesktopTableRailLayout(tableAffordanceGeometry)
  }, [tableAffordanceGeometry])
  const tableCornerGrowStepMetrics = resolveTableCornerGrowStepMetrics(tableAffordanceGeometry)
  const shouldShowCellMergeSection = canMergeSelectedTableCells || canSplitSelectedTableCell

  useEffect(() => {
    if (shouldShowDesktopTableHandles) return
    hideTableColumnDragGuide()
  }, [hideTableColumnDragGuide, shouldShowDesktopTableHandles])


  const setTableQuickRailHovered = useCallback((hovered: boolean) => {
    setIsTableQuickRailHovered(hovered)
  }, [])

  const clearHoveredTableCellMenuLayout = useCallback(() => {
    setHoveredTableCellMenuLayout(null)
  }, [])

  const clearTrackedTableHover = useCallback(() => {
    hoveredTableElementRef.current = null
    tableHoverAnchorLockUntilRef.current = 0
    setHoveredTableCellMenuLayout(null)
  }, [])

  const syncTrackedHoveredTableCellMenuLayout = useCallback(() => {
    syncHoveredTableCellMenuLayout(hoveredTableElementRef.current ?? activeTableElementRef.current)
  }, [syncHoveredTableCellMenuLayout])

  const isTableRowResizeActive = useCallback(() => Boolean(tableRowResizeRef.current), [])
  const isTableColumnRailResizeActive = useCallback(() => Boolean(tableColumnRailResizeRef.current), [])

  const hasTableStructuralSelection = useCallback((activeEditor?: TiptapEditor | null) => {
    if (!activeEditor) return false
    const selection = activeEditor.state.selection
    return Boolean(
      selection instanceof CellSelection ||
        (selection instanceof NodeSelection && selection.node.type.name === "table")
    )
  }, [])

  const isTopLevelInsertBlockedByTableUi = useCallback(
    () => tableAffordanceVisibilityRef.current.visible || tableMenuState !== null,
    [tableMenuState]
  )

  const handleTableViewportPointerLeave = useCallback(() => {
    setIsTableQuickRailHovered(false)
    if (!shouldPersistTableHandles) {
      scheduleTableQuickRailHide()
    }
    setHoveredTableCellMenuLayout(null)
    if (!tableRowResizeRef.current) {
      setViewportRowResizeHot(false)
    }
  }, [scheduleTableQuickRailHide, setViewportRowResizeHot, shouldPersistTableHandles])

  return {
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
    isTableAffordanceVisible: tableAffordanceVisibility.visible,
    isTableAxisDragActive: Boolean(draggedTableAxisState),
    isTableColumnRailResizeActive,
    isTableMode,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget: isRowResizeHandleTarget,
    isTableStructuralSelection,
    isTopLevelInsertBlockedByTableUi,
    layerProps: {
      activeTableCellAttrs,
      activeTableStructureState,
      appendTableAxisAtEnd,
      canMergeSelectedTableCells,
      canSplitSelectedTableCell,
      cancelTableOverflowCoachmarkHide,
      cancelTableQuickRailHide,
      compactTableAffordanceKind,
      desktopTableRailLayout,
      draggedTableAxisState,
      editor,
      growTableFromCorner,
      handleTableColumnRailSegmentClick,
      handleTableRowGripClick,
      hideTableOverflowCoachmark,
      hoveredTableCellMenuLayout,
      isCurrentTableColumnSelection,
      isCurrentTableRowSelection,
      isTableCornerGrowActive,
      isTableQuickRailHovered,
      openSelectionAwareTableMenu,
      openTableMenu,
      resolveTableCornerGrowStepMetricsFromHandle,
      runTableMenuEditorAction,
      scheduleTableOverflowCoachmarkHide,
      scheduleTableQuickRailHide,
      shouldPersistTableHandles,
      shouldRenderTableAffordanceOverlay,
      shouldShowCellMergeSection,
      shouldShowColumnAddBar,
      shouldShowColumnRail,
      shouldShowDesktopTableHandles,
      shouldShowGrowHandle,
      shouldShowRowAddBar,
      shouldShowRowRail,
      shouldShowStructureMenuButton,
      shouldShowTableCellMenu,
      stabilizeTableSelectionSurface,
      startPendingTableAxisDrag,
      startTableColumnRailResize,
      startTableCornerGrow,
      tableAffordanceGeometry,
      tableAxisDragGhostPosition,
      tableAxisDragSuppressClickRef,
      tableAxisReorderIndicatorState,
      tableColumnDragGuideState,
      tableCornerGrowMousePointerId: TABLE_CORNER_GROW_MOUSE_POINTER_ID,
      tableCornerGrowRef,
      tableCornerGrowStepMetrics,
      tableCornerGrowSuppressClickRef,
      tableCornerPreviewState,
      tableEdgeHandleInsetPx: TABLE_EDGE_HANDLE_INSET_PX,
      tableMenuKind: tableMenuKind ?? tableMenuState?.kind ?? "table",
      tableMenuState,
      tableOverflowCoachmarkState,
      updateActiveTableCellAttrs,
      updateActiveTableOverflowMode,
    },
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
  }
}
