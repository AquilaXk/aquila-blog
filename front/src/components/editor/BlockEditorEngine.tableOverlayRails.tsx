import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react"
import { TABLE_EDGE_ADD_BUTTON_SIZE_PX, type TableAffordanceGeometry } from "./tableAffordanceModel"
import type { BlockEditorTableOverlayLayerProps } from "./BlockEditorEngine.tableOverlayTypes"
import type { TableAxis, TableAxisSelectionState } from "./tableAxisDragModel"
import {
  TableAxisRail,
  TableAxisReorderIndicator,
  TableAxisSelectionOutline,
  TableCellMenuButton,
  TableColumnDragGuide,
  TableColumnResizeBoundaryHandle,
  TableCornerGrowButton,
  TableCornerHandle,
  TableCornerPreviewOutline,
  TableHandleButton,
  TableHandleIcon,
  TableQuickRailButton,
  TableRowDragShadow,
  TableTrailingAddBar,
} from "./BlockEditorEngine.styles"

const resolveShiftRangeAnchorIndex = (
  axis: TableAxis,
  currentSelection: TableAxisSelectionState | null,
  fallbackIndex: number,
  shiftKey: boolean
) => (shiftKey && currentSelection?.axis === axis ? currentSelection.anchorIndex : fallbackIndex)

const resolveColumnSelectionOutline = (
  geometry: TableAffordanceGeometry,
  selection: TableAxisSelectionState | null
) => {
  const startIndex = selection?.axis === "column" ? selection.fromIndex : geometry.columnIndex
  const endIndex = selection?.axis === "column" ? selection.toIndex : startIndex
  const firstSegment = geometry.columnSegments[startIndex]
  const lastSegment = geometry.columnSegments[endIndex]
  const fallbackLeft = geometry.columnLeft - geometry.tableLeft
  const left = firstSegment?.left ?? fallbackLeft
  const right = lastSegment ? lastSegment.left + lastSegment.width : left + geometry.columnWidth
  return {
    left: Math.round(geometry.tableLeft + left),
    top: Math.round(geometry.tableTop),
    width: Math.round(Math.max(1, right - left)),
    height: Math.round(geometry.height),
  }
}

const resolveRowSelectionOutline = (
  geometry: TableAffordanceGeometry,
  selection: TableAxisSelectionState | null
) => {
  const startIndex = selection?.axis === "row" ? selection.fromIndex : geometry.rowIndex
  const endIndex = selection?.axis === "row" ? selection.toIndex : startIndex
  const firstSegment = geometry.rowSegments[startIndex]
  const lastSegment = geometry.rowSegments[endIndex]
  const fallbackTop = geometry.rowTop - geometry.tableTop
  const top = firstSegment?.top ?? fallbackTop
  const bottom = lastSegment ? lastSegment.top + lastSegment.height : top + geometry.rowHeight
  return {
    left: Math.round(geometry.tableLeft),
    top: Math.round(geometry.tableTop + top),
    width: Math.round(geometry.width),
    height: Math.round(Math.max(1, bottom - top)),
  }
}

const TABLE_AXIS_RANGE_TRACK_THICKNESS_PX = 56
const TABLE_AXIS_RANGE_TRACK_INSET_PX = 16

const resolveAxisIndexFromPointer = (
  axis: TableAxis,
  geometry: TableAffordanceGeometry,
  clientX: number,
  clientY: number
) => {
  const fallbackIndex = axis === "row" ? geometry.rowIndex : geometry.columnIndex
  const segments =
    axis === "row"
      ? geometry.rowSegments.map((segment) => ({
          size: segment.height,
          start: segment.top,
        }))
      : geometry.columnSegments.map((segment) => ({
          size: segment.width,
          start: segment.left,
        }))
  const pointerOffset =
    axis === "row" ? clientY - geometry.tableTop : clientX - geometry.tableLeft
  if (!segments.length) return fallbackIndex
  const matchedIndex = segments.findIndex(
    (segment) =>
      pointerOffset >= segment.start && pointerOffset <= segment.start + segment.size
  )
  if (matchedIndex >= 0) return matchedIndex
  return segments.reduce(
    (nearest, segment, index) => {
      const center = segment.start + segment.size / 2
      const distance = Math.abs(pointerOffset - center)
      return distance < nearest.distance ? { distance, index } : nearest
    },
    { distance: Number.POSITIVE_INFINITY, index: fallbackIndex }
  ).index
}

export const BlockEditorTableOverlayRails = ({
  appendTableAxisAtEnd,
  cancelTableQuickRailHide,
  compactTableAffordanceKind,
  currentTableAxisSelection,
  desktopTableRailLayout,
  draggedTableAxisState,
  growTableFromCorner,
  handleTableColumnRailSegmentClick,
  handleTableRowGripClick,
  handleToolbarButtonMouseDown,
  hoveredTableCellMenuLayout,
  isCurrentTableColumnSelection,
  isCurrentTableRowSelection,
  isTableCornerGrowActive,
  isTableQuickRailHovered,
  openSelectionAwareTableMenu,
  openTableMenu,
  resolveTableCornerGrowStepMetricsFromHandle,
  scheduleTableQuickRailHide,
  shouldPersistTableHandles,
  shouldRenderTableAffordanceOverlay,
  shouldShowColumnAddBar,
  shouldShowColumnRail,
  shouldShowDesktopTableHandles,
  shouldShowGrowHandle,
  shouldShowRowAddBar,
  shouldShowRowRail,
  shouldShowStructureMenuButton,
  shouldShowTableCellMenu,
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
  tableEdgeHandleInsetPx,
  tableMenuState,
}: BlockEditorTableOverlayLayerProps) => {
  const [isShiftRangeTrackActive, setIsShiftRangeTrackActive] = useState(false)
  const shiftRangeTrackActiveRef = useRef(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return
      shiftRangeTrackActiveRef.current = true
      setIsShiftRangeTrackActive(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return
      shiftRangeTrackActiveRef.current = false
      setIsShiftRangeTrackActive(false)
    }
    const handleBlur = () => {
      shiftRangeTrackActiveRef.current = false
      setIsShiftRangeTrackActive(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    document.addEventListener("keyup", handleKeyUp)
    window.addEventListener("blur", handleBlur)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.removeEventListener("keyup", handleKeyUp)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])
  const isShiftRangeEventActive = (shiftKey: boolean) =>
    shiftKey || isShiftRangeTrackActive || shiftRangeTrackActiveRef.current

  return (
  <>
    {draggedTableAxisState?.axis === "row" && tableAxisDragGhostPosition ? (
      <TableRowDragShadow
        aria-hidden="true"
        data-testid="table-row-drag-shadow"
        style={{
          left: `${Math.round(draggedTableAxisState.previewLeft)}px`,
          top: `${Math.round(tableAxisDragGhostPosition.y)}px`,
          width: `${Math.round(draggedTableAxisState.previewWidth)}px`,
          height: `${Math.round(draggedTableAxisState.previewHeight)}px`,
        }}
      />
    ) : null}
    {tableAxisReorderIndicatorState.visible ? (
      <TableAxisReorderIndicator
        aria-hidden="true"
        data-axis={tableAxisReorderIndicatorState.axis}
        data-testid={
          tableAxisReorderIndicatorState.axis === "row"
            ? "table-row-reorder-indicator"
            : "table-column-reorder-indicator"
        }
        style={{
          left: `${tableAxisReorderIndicatorState.left}px`,
          top: `${tableAxisReorderIndicatorState.top}px`,
          width: `${Math.max(2, tableAxisReorderIndicatorState.width)}px`,
          height: `${Math.max(2, tableAxisReorderIndicatorState.height)}px`,
        }}
      />
    ) : null}
    {tableColumnDragGuideState.visible ? (
      <TableColumnDragGuide
        data-testid="table-column-drag-guide"
        style={{
          left: `${tableColumnDragGuideState.left}px`,
          top: `${tableColumnDragGuideState.top}px`,
          height: `${tableColumnDragGuideState.height}px`,
        }}
      />
    ) : null}
    {tableCornerPreviewState.visible ? (
      <TableCornerPreviewOutline
        aria-hidden="true"
        data-testid="table-corner-preview-outline"
        style={{
          left: `${Math.round(tableCornerPreviewState.left)}px`,
          top: `${Math.round(tableCornerPreviewState.top)}px`,
          width: `${Math.round(tableCornerPreviewState.width)}px`,
          height: `${Math.round(tableCornerPreviewState.height)}px`,
        }}
      />
    ) : null}
    {shouldShowDesktopTableHandles && !tableColumnDragGuideState.visible
      ? tableAffordanceGeometry.columnSegments.map((segment, index) => {
          const isOuterEdge = index === tableAffordanceGeometry.columnSegments.length - 1
          const outerEdgeReservedOffset = isOuterEdge
            ? TABLE_EDGE_ADD_BUTTON_SIZE_PX + tableEdgeHandleInsetPx
            : 0
          return (
            <TableColumnResizeBoundaryHandle
              key={`table-column-boundary-${index}`}
              type="button"
              data-testid={`table-column-resize-boundary-${index}`}
              data-edge={isOuterEdge ? "outer" : "inner"}
              aria-label={`열 ${index + 1} 경계 조절`}
              onPointerEnter={cancelTableQuickRailHide}
              onPointerLeave={() => {
                if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
              }}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                startTableColumnRailResize(event.pointerId, index, event.clientX)
              }}
              style={{
                left: `${Math.round(tableAffordanceGeometry.tableLeft + segment.left + segment.width)}px`,
                top: `${Math.round(tableAffordanceGeometry.tableTop + outerEdgeReservedOffset)}px`,
                height: `${Math.round(
                  Math.max(44, tableAffordanceGeometry.height - outerEdgeReservedOffset * (isOuterEdge ? 2 : 0))
                )}px`,
              }}
            />
          )
        })
      : null}
    {shouldRenderTableAffordanceOverlay ? (
      <>
        {tableMenuState?.kind === "column" ? (
          <TableAxisSelectionOutline
            data-axis="column"
            data-from-index={currentTableAxisSelection?.axis === "column" ? currentTableAxisSelection.fromIndex : undefined}
            data-to-index={currentTableAxisSelection?.axis === "column" ? currentTableAxisSelection.toIndex : undefined}
            data-testid="table-column-selection-outline"
            style={{
              left: `${resolveColumnSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).left}px`,
              top: `${resolveColumnSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).top}px`,
              width: `${resolveColumnSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).width}px`,
              height: `${resolveColumnSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).height}px`,
            }}
          />
        ) : null}
        {tableMenuState?.kind === "row" ? (
          <TableAxisSelectionOutline
            data-axis="row"
            data-from-index={currentTableAxisSelection?.axis === "row" ? currentTableAxisSelection.fromIndex : undefined}
            data-to-index={currentTableAxisSelection?.axis === "row" ? currentTableAxisSelection.toIndex : undefined}
            data-testid="table-row-selection-outline"
            style={{
              left: `${resolveRowSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).left}px`,
              top: `${resolveRowSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).top}px`,
              width: `${resolveRowSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).width}px`,
              height: `${resolveRowSelectionOutline(tableAffordanceGeometry, currentTableAxisSelection).height}px`,
            }}
          />
        ) : null}
        {tableMenuState?.kind === "row" && currentTableAxisSelection?.axis === "row" ? (
          <div
            aria-hidden="true"
            data-axis="row"
            data-range-anchor-index={currentTableAxisSelection.anchorIndex}
            data-table-axis-rail="true"
            data-table-affordance="row-range-track"
            data-testid="table-row-range-track"
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (event.button !== 0 || !isShiftRangeEventActive(event.shiftKey)) return
              event.preventDefault()
              event.stopPropagation()
              const rowIndex = resolveAxisIndexFromPointer(
                "row",
                tableAffordanceGeometry,
                event.clientX,
                event.clientY
              )
              const rangeAnchorIndex = Number.parseInt(
                event.currentTarget.getAttribute("data-range-anchor-index") ?? "",
                10
              )
              const anchorRect = event.currentTarget.getBoundingClientRect()
              startPendingTableAxisDrag(
                "row",
                rowIndex,
                event.pointerId,
                event.clientX,
                event.clientY,
                (selectionOptions) => handleTableRowGripClick(rowIndex, anchorRect, selectionOptions),
                { rangeAnchorIndex: Number.isFinite(rangeAnchorIndex) ? rangeAnchorIndex : undefined }
              )
            }}
            style={{
              cursor: "default",
              height: `${Math.round(tableAffordanceGeometry.height)}px`,
              left: `${Math.round(tableAffordanceGeometry.tableLeft - TABLE_AXIS_RANGE_TRACK_THICKNESS_PX)}px`,
              pointerEvents: isShiftRangeTrackActive ? "auto" : "none",
              position: "fixed",
              top: `${Math.round(tableAffordanceGeometry.tableTop)}px`,
              width: `${TABLE_AXIS_RANGE_TRACK_THICKNESS_PX + TABLE_AXIS_RANGE_TRACK_INSET_PX}px`,
              zIndex: 59,
            }}
          />
        ) : null}
        {tableMenuState?.kind === "column" && currentTableAxisSelection?.axis === "column" ? (
          <div
            aria-hidden="true"
            data-axis="column"
            data-range-anchor-index={currentTableAxisSelection.anchorIndex}
            data-table-axis-rail="true"
            data-table-affordance="column-range-track"
            data-testid="table-column-range-track"
            onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => {
              if (event.button !== 0 || !isShiftRangeEventActive(event.shiftKey)) return
              event.preventDefault()
              event.stopPropagation()
              const columnIndex = resolveAxisIndexFromPointer(
                "column",
                tableAffordanceGeometry,
                event.clientX,
                event.clientY
              )
              const rangeAnchorIndex = Number.parseInt(
                event.currentTarget.getAttribute("data-range-anchor-index") ?? "",
                10
              )
              const anchorRect = event.currentTarget.getBoundingClientRect()
              startPendingTableAxisDrag(
                "column",
                columnIndex,
                event.pointerId,
                event.clientX,
                event.clientY,
                (selectionOptions) =>
                  handleTableColumnRailSegmentClick(columnIndex, anchorRect, selectionOptions),
                { rangeAnchorIndex: Number.isFinite(rangeAnchorIndex) ? rangeAnchorIndex : undefined }
              )
            }}
            style={{
              cursor: "default",
              height: `${TABLE_AXIS_RANGE_TRACK_THICKNESS_PX + TABLE_AXIS_RANGE_TRACK_INSET_PX}px`,
              left: `${Math.round(tableAffordanceGeometry.tableLeft)}px`,
              pointerEvents: isShiftRangeTrackActive ? "auto" : "none",
              position: "fixed",
              top: `${Math.round(tableAffordanceGeometry.tableTop - TABLE_AXIS_RANGE_TRACK_THICKNESS_PX)}px`,
              width: `${Math.round(tableAffordanceGeometry.width)}px`,
              zIndex: 59,
            }}
          />
        ) : null}
        {shouldShowStructureMenuButton || shouldShowGrowHandle ? (
          <TableCornerHandle
            data-table-corner-handle="true"
            data-testid="table-corner-handle"
            data-compact={compactTableAffordanceKind === "table"}
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            style={{
              left: `${desktopTableRailLayout?.cornerLeft ?? Math.round(tableAffordanceGeometry.cornerAnchor.left)}px`,
              top: `${desktopTableRailLayout?.cornerTop ?? Math.round(tableAffordanceGeometry.cornerAnchor.top)}px`,
            }}
          >
            {shouldShowGrowHandle ? (
              <TableCornerGrowButton
                type="button"
                title="표 크기 조절"
                aria-label="표 크기 조절"
                data-testid="table-corner-grow-handle"
                data-table-affordance="grow-handle"
                data-table-menu-trigger="true"
                data-active={isTableCornerGrowActive}
                data-column-step={tableCornerGrowStepMetrics.columnStepPx}
                data-row-step={tableCornerGrowStepMetrics.rowStepPx}
                onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  try {
                    event.currentTarget.setPointerCapture(event.pointerId)
                  } catch {}
                  startTableCornerGrow(
                    event.pointerId,
                    event.clientX,
                    event.clientY,
                    resolveTableCornerGrowStepMetricsFromHandle(event.currentTarget)
                  )
                }}
                onMouseDown={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  if (tableCornerGrowRef.current) return
                  startTableCornerGrow(
                    tableCornerGrowMousePointerId,
                    event.clientX,
                    event.clientY,
                    resolveTableCornerGrowStepMetricsFromHandle(event.currentTarget)
                  )
                }}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  if (tableCornerGrowSuppressClickRef.current) {
                    tableCornerGrowSuppressClickRef.current = false
                    return
                  }
                  growTableFromCorner()
                }}
              >
                <TableHandleIcon kind="grow" />
              </TableCornerGrowButton>
            ) : null}
            {shouldShowStructureMenuButton ? (
              <TableHandleButton
                type="button"
                title="표 구조 메뉴"
                aria-label="표 구조 메뉴"
                data-testid="table-structure-menu-button"
                data-table-affordance="structure-menu"
                data-table-menu-trigger="true"
                data-compact={compactTableAffordanceKind === "table"}
                onMouseDown={handleToolbarButtonMouseDown}
                onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                  event.preventDefault()
                  event.stopPropagation()
                  openSelectionAwareTableMenu("table", event.currentTarget.getBoundingClientRect())
                }}
              >
                <TableHandleIcon kind="more" />
              </TableHandleButton>
            ) : null}
          </TableCornerHandle>
        ) : null}
        {shouldShowRowRail ? (
          <TableAxisRail
            data-table-axis-rail="true"
            data-testid="table-row-rail"
            data-axis="row"
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            style={{
              left: `${desktopTableRailLayout?.rowGripLeft ?? Math.round(tableAffordanceGeometry.rowHandleAnchor.left)}px`,
              top: `${desktopTableRailLayout?.rowGripTop ?? Math.round(tableAffordanceGeometry.rowHandleAnchor.top)}px`,
            }}
          >
            <TableQuickRailButton
              type="button"
              data-axis="row"
              data-axis-index={tableAffordanceGeometry.rowIndex}
              data-table-affordance="row-handle"
              data-active={isCurrentTableRowSelection(tableAffordanceGeometry.rowIndex)}
              data-compact={compactTableAffordanceKind === "row"}
              title="행 메뉴"
              aria-label="행 메뉴"
              onMouseDown={handleToolbarButtonMouseDown}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                const shouldExtendRange = isShiftRangeEventActive(event.shiftKey)
                const anchorRect = event.currentTarget.getBoundingClientRect()
                startPendingTableAxisDrag(
                  "row",
                  tableAffordanceGeometry.rowIndex,
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                  (selectionOptions) =>
                    handleTableRowGripClick(tableAffordanceGeometry.rowIndex, anchorRect, selectionOptions),
                  { extendRange: shouldExtendRange }
                )
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                if (tableAxisDragSuppressClickRef.current) {
                  tableAxisDragSuppressClickRef.current = false
                  return
                }
                handleTableRowGripClick(tableAffordanceGeometry.rowIndex, event.currentTarget.getBoundingClientRect(), {
                  rangeAnchorIndex: resolveShiftRangeAnchorIndex(
                    "row",
                    currentTableAxisSelection,
                    tableAffordanceGeometry.rowIndex,
                    isShiftRangeEventActive(event.shiftKey)
                  ),
                })
              }}
            >
              <TableHandleIcon kind="grip" />
            </TableQuickRailButton>
          </TableAxisRail>
        ) : null}
        {shouldShowColumnRail ? (
          <TableAxisRail
            data-table-axis-rail="true"
            data-testid="table-column-rail"
            data-axis="column"
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            style={{
              left: `${desktopTableRailLayout?.columnGripLeft ?? Math.round(tableAffordanceGeometry.columnHandleAnchor.left)}px`,
              top: `${desktopTableRailLayout?.columnGripTop ?? Math.round(tableAffordanceGeometry.columnHandleAnchor.top)}px`,
            }}
          >
            <TableQuickRailButton
              type="button"
              data-axis="column"
              data-axis-index={tableAffordanceGeometry.columnIndex}
              data-table-affordance="column-handle"
              data-active={isCurrentTableColumnSelection(tableAffordanceGeometry.columnIndex)}
              data-compact={compactTableAffordanceKind === "column"}
              title="열 메뉴"
              aria-label="열 메뉴"
              onMouseDown={handleToolbarButtonMouseDown}
              onPointerDown={(event: ReactPointerEvent<HTMLButtonElement>) => {
                if (event.button !== 0) return
                event.preventDefault()
                event.stopPropagation()
                const shouldExtendRange = isShiftRangeEventActive(event.shiftKey)
                const anchorRect = event.currentTarget.getBoundingClientRect()
                startPendingTableAxisDrag(
                  "column",
                  tableAffordanceGeometry.columnIndex,
                  event.pointerId,
                  event.clientX,
                  event.clientY,
                  (selectionOptions) =>
                    handleTableColumnRailSegmentClick(tableAffordanceGeometry.columnIndex, anchorRect, selectionOptions),
                  { extendRange: shouldExtendRange }
                )
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                if (tableAxisDragSuppressClickRef.current) {
                  tableAxisDragSuppressClickRef.current = false
                  return
                }
                handleTableColumnRailSegmentClick(
                  tableAffordanceGeometry.columnIndex,
                  event.currentTarget.getBoundingClientRect(),
                  {
                    rangeAnchorIndex: resolveShiftRangeAnchorIndex(
                      "column",
                      currentTableAxisSelection,
                      tableAffordanceGeometry.columnIndex,
                      isShiftRangeEventActive(event.shiftKey)
                    ),
                  }
                )
              }}
            >
              <TableHandleIcon kind="grip" />
            </TableQuickRailButton>
          </TableAxisRail>
        ) : null}
        {shouldShowColumnAddBar ? (
          <TableTrailingAddBar
            type="button"
            data-table-axis-rail="true"
            data-testid="table-column-add-bar"
            data-table-affordance="column-add"
            data-axis="column"
            title="열 추가"
            aria-label="열 추가"
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.preventDefault()
              event.stopPropagation()
              appendTableAxisAtEnd("column")
            }}
            style={{
              left: `${desktopTableRailLayout?.columnAddBarLeft ?? Math.round(tableAffordanceGeometry.columnAddAnchor.left)}px`,
              top: `${desktopTableRailLayout?.columnAddBarTop ?? Math.round(tableAffordanceGeometry.columnAddAnchor.top)}px`,
            }}
          >
            <TableHandleIcon kind="plus" />
          </TableTrailingAddBar>
        ) : null}
        {shouldShowRowAddBar ? (
          <TableTrailingAddBar
            type="button"
            data-table-axis-rail="true"
            data-testid="table-row-add-bar"
            data-table-affordance="row-add"
            data-axis="row"
            title="행 추가"
            aria-label="행 추가"
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.preventDefault()
              event.stopPropagation()
              appendTableAxisAtEnd("row")
            }}
            style={{
              left: `${desktopTableRailLayout?.rowAddBarLeft ?? Math.round(tableAffordanceGeometry.rowAddAnchor.left)}px`,
              top: `${desktopTableRailLayout?.rowAddBarTop ?? Math.round(tableAffordanceGeometry.rowAddAnchor.top)}px`,
            }}
          >
            <TableHandleIcon kind="plus" />
          </TableTrailingAddBar>
        ) : null}
        {shouldShowTableCellMenu ? (
          <TableCellMenuButton
            type="button"
            data-testid="table-cell-menu-button"
            data-table-affordance="cell-menu"
            data-table-menu-trigger="true"
            title="셀 스타일"
            aria-label="셀 스타일"
            onMouseDown={handleToolbarButtonMouseDown}
            onPointerEnter={cancelTableQuickRailHide}
            onPointerLeave={() => {
              if (!shouldPersistTableHandles) scheduleTableQuickRailHide()
            }}
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.preventDefault()
              event.stopPropagation()
              openTableMenu("cell", event.currentTarget.getBoundingClientRect())
            }}
            style={{
              left: `${(isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuLeft : null) ??
                desktopTableRailLayout?.cellMenuLeft ??
                Math.round(tableAffordanceGeometry.cellMenuAnchor.left)}px`,
              top: `${(isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuTop : null) ??
                desktopTableRailLayout?.cellMenuTop ??
                Math.round(tableAffordanceGeometry.cellMenuAnchor.top)}px`,
            }}
          >
            <TableHandleIcon kind="more" />
          </TableCellMenuButton>
        ) : null}
      </>
    ) : null}
  </>
  )
}
