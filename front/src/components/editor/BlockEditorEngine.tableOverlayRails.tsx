import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react"
import { TABLE_EDGE_ADD_BUTTON_SIZE_PX } from "./tableAffordanceModel"
import type { BlockEditorTableOverlayLayerProps } from "./BlockEditorEngine.tableOverlayTypes"
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

export const BlockEditorTableOverlayRails = ({
  appendTableAxisAtEnd,
  cancelTableQuickRailHide,
  compactTableAffordanceKind,
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
}: BlockEditorTableOverlayLayerProps) => (
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
        {isCurrentTableColumnSelection(tableAffordanceGeometry.columnIndex) ? (
          <TableAxisSelectionOutline
            data-axis="column"
            data-testid="table-column-selection-outline"
            style={{
              left: `${Math.round(tableAffordanceGeometry.columnLeft)}px`,
              top: `${Math.round(tableAffordanceGeometry.tableTop)}px`,
              width: `${Math.round(tableAffordanceGeometry.columnWidth)}px`,
              height: `${Math.round(tableAffordanceGeometry.height)}px`,
            }}
          />
        ) : null}
        {isCurrentTableRowSelection(tableAffordanceGeometry.rowIndex) ? (
          <TableAxisSelectionOutline
            data-axis="row"
            data-testid="table-row-selection-outline"
            style={{
              left: `${Math.round(tableAffordanceGeometry.tableLeft)}px`,
              top: `${Math.round(tableAffordanceGeometry.rowTop)}px`,
              width: `${Math.round(tableAffordanceGeometry.width)}px`,
              height: `${Math.round(tableAffordanceGeometry.rowHeight)}px`,
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
                startPendingTableAxisDrag("row", tableAffordanceGeometry.rowIndex, event.pointerId, event.clientX, event.clientY)
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                if (tableAxisDragSuppressClickRef.current) {
                  tableAxisDragSuppressClickRef.current = false
                  return
                }
                handleTableRowGripClick(tableAffordanceGeometry.rowIndex, event.currentTarget.getBoundingClientRect())
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
                startPendingTableAxisDrag("column", tableAffordanceGeometry.columnIndex, event.pointerId, event.clientX, event.clientY)
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                if (tableAxisDragSuppressClickRef.current) {
                  tableAxisDragSuppressClickRef.current = false
                  return
                }
                handleTableColumnRailSegmentClick(tableAffordanceGeometry.columnIndex, event.currentTarget.getBoundingClientRect())
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
