import type { Editor as TiptapEditor } from "@tiptap/core"
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react"
import { useCallback } from "react"
import {
  TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
  TABLE_CELL_MENU_BUTTON_SIZE_PX,
  TABLE_EDGE_ADD_BUTTON_SIZE_PX,
  clampViewportPosition,
  type TableAffordanceGeometry,
} from "./tableAffordanceModel"
import { resolveTableScopedSelectedCell } from "./tableRenderedDomModel"
import { isTableSelectionActive } from "./tableStructureModel"
import { normalizeRenderedTableWidthsToReadableBudget } from "./tableWidthRuntime"
import {
  TABLE_ADD_BAR_THICKNESS_PX,
  TABLE_AXIS_GRIP_EDGE_INSET_PX,
  TABLE_AXIS_RAIL_EDGE_HOTZONE_PX,
  TABLE_COLUMN_GRIP_HEIGHT_PX,
  TABLE_COLUMN_GRIP_WIDTH_PX,
  TABLE_CORNER_BUTTON_SIZE_PX,
  TABLE_CORNER_CLUSTER_WIDTH_PX,
  TABLE_EDGE_HANDLE_INSET_PX,
  TABLE_ROW_GRIP_HEIGHT_PX,
  TABLE_ROW_GRIP_WIDTH_PX,
  TABLE_TRAILING_ADD_EDGE_HOTZONE_PX,
} from "./useBlockEditorTableOverlayControllerState"
import { resolveTableAxisIndexFromPointer } from "./tableAxisDragModel"

type UseBlockEditorTableOverlayControllerCommandsArgs = {
  activeTableElementRef: MutableRefObject<HTMLTableElement | null>
  cancelTableQuickRailHide: () => void
  editorRef: MutableRefObject<TiptapEditor | null>
  hideTableQuickRailImmediately: () => void
  hoveredTableElementRef: MutableRefObject<HTMLTableElement | null>
  resolveTableQuickRailAnchorElement: () => HTMLElement | null
  setHoveredTableCellMenuLayout: Dispatch<SetStateAction<{ cellMenuLeft: number; cellMenuTop: number } | null>>
  setSelectionTick: Dispatch<SetStateAction<number>>
  setTableAffordanceGeometry: Dispatch<SetStateAction<TableAffordanceGeometry>>
  setTableAffordanceVisibility: Dispatch<SetStateAction<{
    visible: boolean
    showColumnRail: boolean
    showRowRail: boolean
    showColumnAddBar: boolean
    showRowAddBar: boolean
    showCornerControls: boolean
    showCellMenu: boolean
  }>>
  tableHoverAnchorLockUntilRef: MutableRefObject<number>
  viewportRef: RefObject<HTMLDivElement>
}

export const useBlockEditorTableOverlayControllerCommands = ({
  activeTableElementRef,
  cancelTableQuickRailHide,
  editorRef,
  hideTableQuickRailImmediately,
  hoveredTableElementRef,
  resolveTableQuickRailAnchorElement,
  setHoveredTableCellMenuLayout,
  setSelectionTick,
  setTableAffordanceGeometry,
  setTableAffordanceVisibility,
  tableHoverAnchorLockUntilRef,
}: UseBlockEditorTableOverlayControllerCommandsArgs) => {
  const clearWindowTextSelection = useCallback(() => {
    if (typeof window === "undefined") return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    selection.removeAllRanges()
  }, [])

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
  }, [setHoveredTableCellMenuLayout])

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
    const tableRows = Array.from(tableElement.querySelectorAll("tr")).filter(
      (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement && row.cells.length > 0
    )
    const hoveredCellFromPoint: HTMLTableCellElement | null = hasHoverPoint
      ? (() => {
          const pointElement = document.elementFromPoint(hoverClientX as number, hoverClientY as number)
          const pointCell = pointElement?.closest("th, td")
          if (pointCell instanceof HTMLTableCellElement) return pointCell

          const cells = Array.from(tableElement.querySelectorAll("th, td")).filter(
            (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
          )
          return (
            cells.find((cell) => {
              const cellRect = cell.getBoundingClientRect()
              return (
                hoverClientX >= cellRect.left &&
                hoverClientX <= cellRect.right &&
                hoverClientY >= cellRect.top &&
                hoverClientY <= cellRect.bottom
              )
            }) ?? null
          )
        })()
      : null
    const hoveredCell = element?.closest("th, td") as HTMLTableCellElement | null
    const hoveredColumnIndex = hasHoverPoint
      ? resolveTableAxisIndexFromPointer(tableElement, "column", hoverClientX as number, hoverClientY as number)
      : null
    const hoveredRowIndex = hasHoverPoint
      ? resolveTableAxisIndexFromPointer(tableElement, "row", hoverClientX as number, hoverClientY as number)
      : null
    const hoveredCellFromSelectedRect: HTMLTableCellElement | null = hasHoverPoint && hoveredRowIndex !== null
      ? tableRows[hoveredRowIndex]?.querySelector("th, td") ?? null
      : null
    const selectedCell = resolveTableScopedSelectedCell(tableElement)
    const selectedRow = selectedCell?.closest("tr")
    const fallbackRow = tableRows[hoveredRowIndex ?? 0] ?? tableRows[0] ?? selectedRow ?? null
    const activeCellFromColumnIndex =
      typeof hoveredColumnIndex === "number" && fallbackRow
        ? Array.from(fallbackRow.children).find((cell, index): cell is HTMLTableCellElement => index === hoveredColumnIndex && cell instanceof HTMLTableCellElement)
        : null
    const activeCell: HTMLTableCellElement | null = hoveredCell ??
      hoveredCellFromPoint ??
      activeCellFromColumnIndex ??
      hoveredCellFromSelectedRect ??
      (selectedCell as HTMLTableCellElement | null) ??
      (tableElement.querySelector("th, td") as HTMLTableCellElement | null)
    const activeCellRect = activeCell?.getBoundingClientRect()
    const activeRow =
      activeCell?.closest("tr") ??
      tableRows[hoveredRowIndex ?? 0] ??
      (selectedRow instanceof HTMLTableRowElement ? selectedRow : null)
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
    const activeRowIndex = typeof hoveredRowIndex === "number"
      ? hoveredRowIndex
      : activeRow
      ? Array.from(tableElement.querySelectorAll("tr")).findIndex((row) => row === activeRow)
      : 0
    const activeColumnIndex = typeof hoveredColumnIndex === "number"
      ? hoveredColumnIndex
      : activeCell?.parentElement
      ? Array.from(activeCell.parentElement.children).findIndex((child) => child === activeCell)
      : 0
    if (hasHoverPoint) syncHoveredTableCellMenuLayout(tableElement, activeCell)
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
  }, [
    activeTableElementRef,
    cancelTableQuickRailHide,
    hideTableQuickRailImmediately,
    hoveredTableElementRef,
    setHoveredTableCellMenuLayout,
    setTableAffordanceGeometry,
    setTableAffordanceVisibility,
    syncHoveredTableCellMenuLayout,
    tableHoverAnchorLockUntilRef,
  ])

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

  return {
    clearWindowTextSelection,
    stabilizeTableSelectionSurface,
    syncHoveredTableCellMenuLayout,
    syncTableQuickRailFromElement,
  }
}
