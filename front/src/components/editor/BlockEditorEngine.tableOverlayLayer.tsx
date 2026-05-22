import type { Editor as TiptapEditor } from "@tiptap/core"
import type { CSSProperties, MouseEvent as ReactMouseEvent, MouseEventHandler, MutableRefObject, PointerEvent as ReactPointerEvent, RefObject } from "react"
import { createPortal } from "react-dom"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import { TABLE_EDGE_ADD_BUTTON_SIZE_PX } from "./tableAffordanceModel"
import type { DraggedTableAxisState, TableAxis, TableAxisDragGhostPosition, TableAxisReorderIndicatorState } from "./tableAxisDragModel"
import type { TableCornerGrowStepMetrics, TableCornerPreviewState } from "./tableCornerGrowModel"
import type { CompactTableAffordanceKind, TableMenuKind, TableMenuState, TableOverflowCoachmarkState } from "./tableFloatingUiModel"
import type { TableColumnDragGuideState } from "./tableResizeInteractionModel"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"
import {
  FloatingBlockMenuDivider,
  FloatingTableMenu,
  TableAxisRail,
  TableAxisReorderIndicator,
  TableAxisSelectionOutline,
  TableCellMenuButton,
  TableColorInput,
  TableColumnDragGuide,
  TableColumnResizeBoundaryHandle,
  TableCornerGrowButton,
  TableCornerHandle,
  TableCornerPreviewOutline,
  TableHandleButton,
  TableHandleIcon,
  TableMenuCompactAction,
  TableMenuCompactList,
  TableMenuCompactSection,
  TableMenuHeader,
  TableMenuHeaderDescription,
  TableMenuHeaderEyebrow,
  TableMenuHeaderTitle,
  TableMenuHint,
  TableMenuSectionTitle,
  TableMenuSegmentedButton,
  TableMenuSegmentedRow,
  TableOverflowCoachmark,
  TableOverflowCoachmarkAction,
  TableOverflowCoachmarkBody,
  TableOverflowCoachmarkDescription,
  TableOverflowCoachmarkTitle,
  TablePresetSwatch,
  TablePresetSwatches,
  TableQuickRailButton,
  TableRowDragShadow,
  TableTrailingAddBar,
} from "./BlockEditorEngine.styles"

type TableRailLayout = {
  cornerLeft: number
  cornerTop: number
  columnGripLeft: number
  columnGripTop: number
  columnAddBarLeft: number
  columnAddBarTop: number
  rowGripLeft: number
  rowGripTop: number
  rowAddBarLeft: number
  rowAddBarTop: number
  cellMenuLeft: number
  cellMenuTop: number
}

type ActiveTableCellAttrs = {
  textAlign?: "left" | "center" | "right" | null
  backgroundColor?: string | null
}

type ActiveTableStructureState = {
  hasHeaderRow: boolean
  hasHeaderColumn: boolean
  overflowMode: string | null
}

const TABLE_CELL_COLOR_PRESETS = [
  { label: "하늘", value: "#dbeafe" },
  { label: "하늘 진함", value: "#bfdbfe" },
  { label: "민트", value: "#dcfce7" },
  { label: "청록", value: "#ccfbf1" },
  { label: "노랑", value: "#fef3c7" },
  { label: "주황", value: "#fed7aa" },
  { label: "분홍", value: "#fce7f3" },
  { label: "보라", value: "#ede9fe" },
  { label: "회색", value: "#e2e8f0" },
]

type ToolbarMouseDownHandler = MouseEventHandler<HTMLElement>

export const BlockEditorTableOverlayLayer = ({
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
  handleToolbarButtonMouseDown,
  hideTableOverflowCoachmark,
  hoveredTableCellMenuLayout,
  isCurrentTableColumnSelection,
  isCurrentTableRowSelection,
  isTableCornerGrowActive,
  isTableQuickRailHovered,
  normalizeTableColorInputValue,
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
  tableEdgeHandleInsetPx,
  tableMenuKind,
  tableMenuState,
  tableOverflowCoachmarkState,
  updateActiveTableCellAttrs,
  updateActiveTableOverflowMode,
}: {
  activeTableCellAttrs: ActiveTableCellAttrs
  activeTableStructureState: ActiveTableStructureState
  appendTableAxisAtEnd: (axis: TableAxis) => void
  canMergeSelectedTableCells: boolean
  canSplitSelectedTableCell: boolean
  cancelTableOverflowCoachmarkHide: () => void
  cancelTableQuickRailHide: () => void
  compactTableAffordanceKind: CompactTableAffordanceKind
  desktopTableRailLayout: TableRailLayout | null
  draggedTableAxisState: DraggedTableAxisState
  editor: TiptapEditor | null
  growTableFromCorner: () => void
  handleTableColumnRailSegmentClick: (columnIndex: number, anchorRect: DOMRect) => void
  handleTableRowGripClick: (rowIndex: number, anchorRect: DOMRect) => void
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  hideTableOverflowCoachmark: () => void
  hoveredTableCellMenuLayout: Pick<TableRailLayout, "cellMenuLeft" | "cellMenuTop"> | null
  isCurrentTableColumnSelection: (columnIndex: number) => boolean
  isCurrentTableRowSelection: (rowIndex: number) => boolean
  isTableCornerGrowActive: boolean
  isTableQuickRailHovered: boolean
  normalizeTableColorInputValue: (value: unknown) => string
  openSelectionAwareTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  openTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  resolveTableCornerGrowStepMetricsFromHandle: (handle: HTMLElement) => TableCornerGrowStepMetrics
  runTableMenuEditorAction: (action: (activeEditor: TiptapEditor) => void) => void
  scheduleTableOverflowCoachmarkHide: (delayMs?: number) => void
  scheduleTableQuickRailHide: (delayMs?: number) => void
  shouldPersistTableHandles: boolean
  shouldRenderTableAffordanceOverlay: boolean
  shouldShowCellMergeSection: boolean
  shouldShowColumnAddBar: boolean
  shouldShowColumnRail: boolean
  shouldShowDesktopTableHandles: boolean
  shouldShowGrowHandle: boolean
  shouldShowRowAddBar: boolean
  shouldShowRowRail: boolean
  shouldShowStructureMenuButton: boolean
  shouldShowTableCellMenu: boolean
  stabilizeTableSelectionSurface: (activeEditor: TiptapEditor) => void
  startPendingTableAxisDrag: (
    axis: TableAxis,
    axisIndex: number,
    pointerId: number,
    clientX: number,
    clientY: number
  ) => void
  startTableColumnRailResize: (pointerId: number, columnIndex: number, clientX: number) => void
  startTableCornerGrow: (
    pointerId: number,
    clientX: number,
    clientY: number,
    stepMetrics?: TableCornerGrowStepMetrics
  ) => void
  tableAffordanceGeometry: TableAffordanceGeometry
  tableAxisDragGhostPosition: TableAxisDragGhostPosition
  tableAxisDragSuppressClickRef: MutableRefObject<boolean>
  tableAxisReorderIndicatorState: TableAxisReorderIndicatorState
  tableColumnDragGuideState: TableColumnDragGuideState
  tableCornerGrowMousePointerId: number
  tableCornerGrowRef: RefObject<unknown>
  tableCornerGrowStepMetrics: TableCornerGrowStepMetrics
  tableCornerGrowSuppressClickRef: MutableRefObject<boolean>
  tableCornerPreviewState: TableCornerPreviewState
  tableEdgeHandleInsetPx: number
  tableMenuKind: TableMenuKind
  tableMenuState: TableMenuState
  tableOverflowCoachmarkState: TableOverflowCoachmarkState
  updateActiveTableCellAttrs: (attrs: Partial<ActiveTableCellAttrs>) => void
  updateActiveTableOverflowMode: (
    activeEditor: TiptapEditor,
    overflowMode: "normal" | typeof TABLE_OVERFLOW_MODE_WIDE
  ) => boolean
}) => {
  const tableOverlay = (
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
      {shouldShowDesktopTableHandles
        ? !tableColumnDragGuideState.visible
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
                    if (!shouldPersistTableHandles) {
                      scheduleTableQuickRailHide()
                    }
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
                      Math.max(
                        44,
                        tableAffordanceGeometry.height - outerEdgeReservedOffset * (isOuterEdge ? 2 : 0)
                      )
                    )}px`,
                  }}
                />
              )
            })
          : null
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.cornerLeft ??
                  Math.round(tableAffordanceGeometry.cornerAnchor.left)
                }px`,
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.rowGripLeft ??
                  Math.round(tableAffordanceGeometry.rowHandleAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.rowGripTop ??
                  Math.round(tableAffordanceGeometry.rowHandleAnchor.top)
                }px`,
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.columnGripLeft ??
                  Math.round(tableAffordanceGeometry.columnHandleAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.columnGripTop ??
                  Math.round(tableAffordanceGeometry.columnHandleAnchor.top)
                }px`,
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
                  startPendingTableAxisDrag(
                    "column",
                    tableAffordanceGeometry.columnIndex,
                    event.pointerId,
                    event.clientX,
                    event.clientY
                  )
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                appendTableAxisAtEnd("column")
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.columnAddBarLeft ??
                  Math.round(tableAffordanceGeometry.columnAddAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.columnAddBarTop ??
                  Math.round(tableAffordanceGeometry.columnAddAnchor.top)
                }px`,
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                appendTableAxisAtEnd("row")
              }}
              style={{
                left: `${
                  desktopTableRailLayout?.rowAddBarLeft ??
                  Math.round(tableAffordanceGeometry.rowAddAnchor.left)
                }px`,
                top: `${
                  desktopTableRailLayout?.rowAddBarTop ??
                  Math.round(tableAffordanceGeometry.rowAddAnchor.top)
                }px`,
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
                if (!shouldPersistTableHandles) {
                  scheduleTableQuickRailHide()
                }
              }}
              onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
                event.preventDefault()
                event.stopPropagation()
                openTableMenu("cell", event.currentTarget.getBoundingClientRect())
              }}
              style={{
                left: `${
                  (isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuLeft : null) ??
                  desktopTableRailLayout?.cellMenuLeft ??
                  Math.round(tableAffordanceGeometry.cellMenuAnchor.left)
                }px`,
                top: `${
                  (isTableQuickRailHovered ? hoveredTableCellMenuLayout?.cellMenuTop : null) ??
                  desktopTableRailLayout?.cellMenuTop ??
                  Math.round(tableAffordanceGeometry.cellMenuAnchor.top)
                }px`,
              }}
            >
              <TableHandleIcon kind="more" />
            </TableCellMenuButton>
          ) : null}
        </>
      ) : null}
      {tableOverflowCoachmarkState.visible ? (
        <TableOverflowCoachmark
          data-testid="table-overflow-policy-hint"
          style={{
            left: `${tableOverflowCoachmarkState.left}px`,
            top: `${tableOverflowCoachmarkState.top}px`,
          }}
          onPointerEnter={cancelTableOverflowCoachmarkHide}
          onPointerLeave={() => scheduleTableOverflowCoachmarkHide(2400)}
        >
          <TableOverflowCoachmarkBody>
            <TableOverflowCoachmarkTitle>페이지 너비에 맞춤 유지 중</TableOverflowCoachmarkTitle>
            <TableOverflowCoachmarkDescription>
              더 넓게 편집하려면 넓은 표로 전환하세요.
            </TableOverflowCoachmarkDescription>
          </TableOverflowCoachmarkBody>
          <TableOverflowCoachmarkAction
            type="button"
            data-testid="table-overflow-policy-hint-wide-action"
            onMouseDown={handleToolbarButtonMouseDown}
            onClick={() => {
              if (!editor) return
              updateActiveTableOverflowMode(editor, TABLE_OVERFLOW_MODE_WIDE)
              hideTableOverflowCoachmark()
              stabilizeTableSelectionSurface(editor)
            }}
          >
            넓은 표
          </TableOverflowCoachmarkAction>
        </TableOverflowCoachmark>
      ) : null}
      {tableMenuState ? (
        <FloatingTableMenu
          data-table-menu-root="true"
          data-testid={`table-${tableMenuState.kind}-menu`}
          style={{
            left: `${tableMenuState.left}px`,
            top: `${tableMenuState.top}px`,
          }}
        >
          <TableMenuHeader>
            <TableMenuHeaderEyebrow>
              {tableMenuKind === "row"
                ? "Axis"
                : tableMenuKind === "column"
                  ? "Axis"
                  : tableMenuKind === "cell"
                    ? "Cell"
                    : "Table"}
            </TableMenuHeaderEyebrow>
            <TableMenuHeaderTitle>
              {tableMenuKind === "row"
                ? "행 메뉴"
                : tableMenuKind === "column"
                  ? "열 메뉴"
                  : tableMenuKind === "cell"
                    ? "셀 스타일"
                    : "표 구조"}
            </TableMenuHeaderTitle>
            <TableMenuHeaderDescription>
              {tableMenuKind === "row"
                ? "현재 행에만 적용되는 삽입과 헤더 설정"
                : tableMenuKind === "column"
                  ? "현재 열에만 적용되는 삽입과 헤더 설정"
                  : tableMenuKind === "cell"
                    ? "정렬과 배경, 필요할 때만 셀 결합"
                    : "표 수준 폭 정책과 삭제만 유지"}
            </TableMenuHeaderDescription>
          </TableMenuHeader>
          {tableMenuKind === "cell" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>정렬</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="3">
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "left"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "left" })}
                  >
                    좌측
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "center"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "center" })}
                  >
                    가운데
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.textAlign === "right"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ textAlign: "right" })}
                  >
                    우측
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
              </TableMenuCompactSection>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>배경</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="2">
                  <TableMenuSegmentedButton
                    type="button"
                    data-active={activeTableCellAttrs.backgroundColor === "#f8fafc"}
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ backgroundColor: "#f8fafc" })}
                  >
                    기본
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    onMouseDown={handleToolbarButtonMouseDown}
                    onClick={() => updateActiveTableCellAttrs({ backgroundColor: null })}
                  >
                    배경 해제
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
                <TablePresetSwatches aria-label="표 셀 배경 preset">
                  {TABLE_CELL_COLOR_PRESETS.map((preset) => (
                    <TablePresetSwatch
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      aria-label={`${preset.label} 배경`}
                      data-active={activeTableCellAttrs.backgroundColor === preset.value}
                      style={{ "--table-swatch-color": preset.value } as CSSProperties}
                      onClick={() => updateActiveTableCellAttrs({ backgroundColor: preset.value })}
                    />
                  ))}
                  <TableColorInput
                    type="color"
                    aria-label="표 셀 배경색 선택"
                    value={normalizeTableColorInputValue(activeTableCellAttrs.backgroundColor)}
                    onChange={(event) =>
                      updateActiveTableCellAttrs({ backgroundColor: event.currentTarget.value })
                    }
                  />
                </TablePresetSwatches>
              </TableMenuCompactSection>
              {shouldShowCellMergeSection ? (
                <>
                  <FloatingBlockMenuDivider />
                  <TableMenuCompactSection>
                    <TableMenuSectionTitle>셀 구조</TableMenuSectionTitle>
                    <TableMenuCompactList>
                      {canMergeSelectedTableCells ? (
                        <TableMenuCompactAction
                          type="button"
                          onClick={() =>
                            runTableMenuEditorAction((activeEditor) => {
                              activeEditor.chain().focus().mergeCells().run()
                            })
                          }
                        >
                          셀 병합
                        </TableMenuCompactAction>
                      ) : null}
                      {canSplitSelectedTableCell ? (
                        <TableMenuCompactAction
                          type="button"
                          onClick={() =>
                            runTableMenuEditorAction((activeEditor) => {
                              activeEditor.chain().focus().splitCell().run()
                            })
                          }
                        >
                          셀 분리
                        </TableMenuCompactAction>
                      ) : null}
                    </TableMenuCompactList>
                  </TableMenuCompactSection>
                </>
              ) : null}
            </>
          ) : tableMenuKind === "row" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>행 액션</TableMenuSectionTitle>
                <TableMenuCompactList>
                  <TableMenuCompactAction
                    type="button"
                    data-active={activeTableStructureState.hasHeaderRow}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderRow().run()
                      })
                    }
                  >
                    제목 행
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowBefore().run()
                      })
                    }
                  >
                    위에 행 추가
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addRowAfter().run()
                      })
                    }
                  >
                    아래에 행 추가
                  </TableMenuCompactAction>
                </TableMenuCompactList>
              </TableMenuCompactSection>
              <TableMenuHint>행 핸들을 드래그해 순서를 바꿀 수 있습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteRow().run()
                    })
                  }
                >
                  행 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          ) : tableMenuKind === "column" ? (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>열 액션</TableMenuSectionTitle>
                <TableMenuCompactList>
                  <TableMenuCompactAction
                    type="button"
                    data-active={activeTableStructureState.hasHeaderColumn}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().toggleHeaderColumn().run()
                      })
                    }
                  >
                    제목 열
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnBefore().run()
                      })
                    }
                  >
                    왼쪽 열 추가
                  </TableMenuCompactAction>
                  <TableMenuCompactAction
                    type="button"
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        activeEditor.chain().focus().addColumnAfter().run()
                      })
                    }
                  >
                    오른쪽 열 추가
                  </TableMenuCompactAction>
                </TableMenuCompactList>
              </TableMenuCompactSection>
              <TableMenuHint>열 핸들을 드래그해 순서를 바꿀 수 있습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteColumn().run()
                    })
                  }
                >
                  열 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          ) : (
            <>
              <TableMenuCompactSection>
                <TableMenuSectionTitle>폭</TableMenuSectionTitle>
                <TableMenuSegmentedRow data-columns="2">
                  <TableMenuSegmentedButton
                    type="button"
                    data-testid="table-overflow-mode-normal"
                    data-active={activeTableStructureState.overflowMode !== TABLE_OVERFLOW_MODE_WIDE}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        updateActiveTableOverflowMode(activeEditor, "normal")
                      })
                    }
                  >
                    페이지 너비에 맞춤
                  </TableMenuSegmentedButton>
                  <TableMenuSegmentedButton
                    type="button"
                    data-testid="table-overflow-mode-wide"
                    data-active={activeTableStructureState.overflowMode === TABLE_OVERFLOW_MODE_WIDE}
                    onClick={() =>
                      runTableMenuEditorAction((activeEditor) => {
                        updateActiveTableOverflowMode(activeEditor, TABLE_OVERFLOW_MODE_WIDE)
                      })
                    }
                  >
                    넓은 표
                  </TableMenuSegmentedButton>
                </TableMenuSegmentedRow>
              </TableMenuCompactSection>
              <TableMenuHint>제목 행/열 토글은 행 메뉴와 열 메뉴에서 분리했습니다.</TableMenuHint>
              <FloatingBlockMenuDivider />
              <TableMenuCompactList>
                <TableMenuCompactAction
                  type="button"
                  data-variant="danger"
                  onClick={() =>
                    runTableMenuEditorAction((activeEditor) => {
                      activeEditor.chain().focus().deleteTable().run()
                    })
                  }
                >
                  표 삭제
                </TableMenuCompactAction>
              </TableMenuCompactList>
            </>
          )}
        </FloatingTableMenu>
      ) : null}
    </>
  )

  return typeof document !== "undefined" ? createPortal(tableOverlay, document.body) : tableOverlay
}
