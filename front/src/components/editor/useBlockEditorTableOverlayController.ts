import type { Editor as TiptapEditor } from "@tiptap/core"
import { NodeSelection } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { type TableAffordanceGeometry, type TableAffordanceVisibility, INITIAL_TABLE_AFFORDANCE_GEOMETRY, INITIAL_TABLE_AFFORDANCE_VISIBILITY, TABLE_ADD_BAR_VIEWPORT_PADDING_PX, TABLE_CELL_MENU_BUTTON_SIZE_PX, TABLE_EDGE_ADD_BUTTON_SIZE_PX, clampViewportPosition, intersectsViewportBounds, resolveDesktopTableRailLayout } from "./tableAffordanceModel"
import { resolveCompactTableAffordanceKind, resolveTableHandleVisibility, resolveTableMenuFlags, type TableMenuState } from "./tableFloatingUiModel"
import { findActiveRenderedTable, resolveTableScopedSelectedCell } from "./tableRenderedDomModel"
import { getActiveTableStructureState, isTableSelectionActive } from "./tableStructureModel"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"
import { normalizeRenderedTableWidthsToReadableBudget } from "./tableWidthRuntime"
import { useBlockEditorTableOverlayAxisDrag } from "./useBlockEditorTableOverlayAxisDrag"
import { useBlockEditorTableOverlayCornerGrow } from "./useBlockEditorTableOverlayCornerGrow"
import { useBlockEditorTableOverlayDomAdapter } from "./useBlockEditorTableOverlayDomAdapter"
import { useBlockEditorTableOverlayInteractionHandlers } from "./useBlockEditorTableOverlayInteractionHandlers"
import { useBlockEditorTableOverlayMenu } from "./useBlockEditorTableOverlayMenu"
import { useBlockEditorTableOverlayResize } from "./useBlockEditorTableOverlayResize"
import { useBlockEditorTableOverlayUiTimers } from "./useBlockEditorTableOverlayUiTimers"
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
  const [isNarrowTableViewport, setIsNarrowTableViewport] = useState(false)
  const [tableAffordanceGeometry, setTableAffordanceGeometry] = useState<TableAffordanceGeometry>(
    INITIAL_TABLE_AFFORDANCE_GEOMETRY
  )
  const [tableAffordanceVisibility, setTableAffordanceVisibility] = useState<TableAffordanceVisibility>(
    INITIAL_TABLE_AFFORDANCE_VISIBILITY
  )
  const [isTableQuickRailHovered, setIsTableQuickRailHovered] = useState(false)
  const [hoveredTableCellMenuLayout, setHoveredTableCellMenuLayout] = useState<{
    cellMenuLeft: number
    cellMenuTop: number
  } | null>(null)
  const [tableMenuState, setTableMenuState] = useState<TableMenuState>(null)
  const tableAffordanceGeometryRef = useRef(tableAffordanceGeometry)
  const tableAffordanceVisibilityRef = useRef(tableAffordanceVisibility)
  const isTableMode = isTableSelectionActive(editor)
  const isTableStructuralSelection = useMemo(() => {
    if (!editor) return false
    void selectionTick
    const { selection } = editor.state
    return selection instanceof CellSelection
  }, [editor, selectionTick])
  const {
    focusRenderedTableCell,
    getCurrentSelectedTableRect,
    getTableCellFromClientPoint,
    resolveTableNodePosition,
    resolveTableQuickRailAnchorElement,
  } = useBlockEditorTableOverlayDomAdapter({
    activeTableElementRef,
    editorRef,
    hoveredTableElementRef,
    tableAffordanceGeometryRef,
    tableHoverAnchorLockUntilRef,
    viewportRef,
  })
  const {
    cancelTableOverflowCoachmarkHide,
    cancelTableQuickRailHide,
    hideTableOverflowCoachmark,
    hideTableQuickRailImmediately,
    scheduleTableOverflowCoachmarkHide,
    scheduleTableQuickRailHide,
    showTableOverflowCoachmark,
    tableOverflowCoachmarkState,
  } = useBlockEditorTableOverlayUiTimers({
    cornerButtonSize: TABLE_CORNER_BUTTON_SIZE_PX,
    isCoarsePointer,
    isNarrowTableViewport,
    setTableAffordanceVisibility,
    tableAffordanceGeometryRef,
    viewportRef,
  })
  const setViewportRowResizeHot = useCallback((enabled: boolean) => {
    const viewport = viewportRef.current
    if (!viewport) return
    if (enabled) {
      viewport.setAttribute("data-row-resize-hot", "true")
      return
    }
    viewport.removeAttribute("data-row-resize-hot")
  }, [viewportRef])
  const {
    currentTableAxisSelection,
    draggedTableAxisState,
    isCurrentTableColumnSelection,
    isCurrentTableRowSelection,
    selectTableAxisAtIndex,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    startPendingTableAxisDrag,
    tableAxisDragGhostPosition,
    tableAxisDragSuppressClickRef,
    tableAxisReorderIndicatorState,
  } = useBlockEditorTableOverlayAxisDrag({
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
  })
  const clearWindowTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    selection.removeAllRanges()
  }, [])
  const {
    hideTableColumnDragGuide,
    isTableColumnRailResizeActive,
    isTableColumnResizeActive,
    isTableRowResizeActive,
    isTableRowResizeHandleTarget,
    resizeFirstTableColumnBy,
    resizeFirstTableRowBy,
    startTableColumnRailResize,
    startTableRowResize,
    tableColumnDragGuideState,
    tableColumnRailResizeRef,
    tableRowResizeRef,
    tryStartTableColumnResizeFromDomHandle,
  } = useBlockEditorTableOverlayResize({
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
  })
  const {
    appendTableAxisAtEnd,
    growTableFromCorner,
    isTableCornerGrowActive,
    resolveTableCornerGrowStepMetricsFromHandle,
    startTableCornerGrow,
    tableCornerGrowMousePointerId,
    tableCornerGrowRef,
    tableCornerGrowStepMetrics,
    tableCornerGrowSuppressClickRef,
    tableCornerPreviewState,
  } = useBlockEditorTableOverlayCornerGrow({
    editorRef,
    focusRenderedTableCell,
    getCurrentSelectedTableRect,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    setSelectionTick,
    tableAffordanceGeometry,
    tableAffordanceGeometryRef,
    viewportRef,
  })
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
  useEffect(() => {
    const currentEditor = editorRef.current
    if (!currentEditor || !isTableStructuralSelection) return
    const anchorDom = currentEditor.view.domAtPos(currentEditor.state.selection.from).node
    const anchorElement = anchorDom instanceof Element ? anchorDom : anchorDom.parentElement
    if (!anchorElement) return
    syncTableQuickRailFromElement(anchorElement)
  }, [editorRef, isTableStructuralSelection, selectionTick, syncTableQuickRailFromElement])
  const {
    activeTableCellAttrs,
    canMergeSelectedTableCells,
    canSplitSelectedTableCell,
    openSelectionAwareTableMenu,
    openTableMenu,
    runTableMenuEditorAction,
    selectCurrentTableAxis,
    updateActiveTableCellAttrs,
    updateActiveTableOverflowMode,
  } = useBlockEditorTableOverlayMenu({
    cancelTableQuickRailHide,
    clearStickyTopLevelBlockSelection,
    editor,
    getCurrentSelectedTableRect,
    isTableStructuralSelection,
    setSelectionTick,
    setTableMenuState,
    stabilizeTableSelectionSurface,
    tableMenuState,
  })
  useEffect(() => {
    if (typeof window === "undefined") return
    const mediaQuery = window.matchMedia(DESKTOP_TABLE_RAIL_MEDIA_QUERY)
    const sync = () => setIsNarrowTableViewport(mediaQuery.matches)
    sync()
    mediaQuery.addEventListener?.("change", sync)
    return () => mediaQuery.removeEventListener?.("change", sync)
  }, [])
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
    tableColumnRailResizeRef,
    tableRowResizeRef,
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
  const shouldShowCellMergeSection = canMergeSelectedTableCells || canSplitSelectedTableCell
  const {
    clearHoveredTableCellMenuLayout,
    clearTrackedTableHover,
    handleTableColumnRailSegmentClick,
    handleTableRowGripClick,
    handleTableViewportPointerLeave,
    setTableQuickRailHovered,
    syncTrackedHoveredTableCellMenuLayout,
  } = useBlockEditorTableOverlayInteractionHandlers({
    activeTableElementRef,
    hoveredTableElementRef,
    openTableMenu,
    scheduleTableQuickRailHide,
    selectTableColumnByIndex,
    selectTableRowByIndex,
    setHoveredTableCellMenuLayout,
    setIsTableQuickRailHovered,
    setTableAffordanceGeometry,
    setViewportRowResizeHot,
    shouldPersistTableHandles,
    syncHoveredTableCellMenuLayout,
    tableHoverAnchorLockUntilRef,
    tableRowResizeRef,
  })
  useEffect(() => {
    if (shouldShowDesktopTableHandles) return
    hideTableColumnDragGuide()
  }, [hideTableColumnDragGuide, shouldShowDesktopTableHandles])
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
    isTableRowResizeHandleTarget,
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
      tableCornerGrowMousePointerId,
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
