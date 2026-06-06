import type { Editor as TiptapEditor } from "@tiptap/core"
import type { MouseEventHandler, MutableRefObject, RefObject } from "react"
import type { TableAffordanceGeometry } from "./tableAffordanceModel"
import type {
  DraggedTableAxisState,
  TableAxis,
  TableAxisDragGhostPosition,
  TableAxisReorderIndicatorState,
  TableAxisSelectionState,
  TableAxisSelectionTarget,
} from "./tableAxisDragModel"
import type {
  TableCornerGrowStepMetrics,
  TableCornerPreviewState,
} from "./tableCornerGrowModel"
import type {
  CompactTableAffordanceKind,
  TableMenuKind,
  TableMenuState,
  TableOverflowCoachmarkState,
} from "./tableFloatingUiModel"
import type { TableColumnDragGuideState } from "./tableResizeInteractionModel"
import { TABLE_OVERFLOW_MODE_WIDE } from "./tableWidthModel"

export type TableRailLayout = {
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

export type ActiveTableCellAttrs = {
  textAlign?: "left" | "center" | "right" | null
  backgroundColor?: string | null
}

export type ActiveTableStructureState = {
  hasHeaderRow: boolean
  hasHeaderColumn: boolean
  overflowMode: string | null
}

export type ToolbarMouseDownHandler = MouseEventHandler<HTMLElement>

export type BlockEditorTableOverlayLayerProps = {
  activeTableCellAttrs: ActiveTableCellAttrs
  activeTableStructureState: ActiveTableStructureState
  appendTableAxisAtEnd: (axis: TableAxis) => void
  canMergeSelectedTableCells: boolean
  canSplitSelectedTableCell: boolean
  cancelTableOverflowCoachmarkHide: () => void
  cancelTableQuickRailHide: () => void
  compactTableAffordanceKind: CompactTableAffordanceKind
  currentTableAxisSelection: TableAxisSelectionState | null
  desktopTableRailLayout: TableRailLayout | null
  draggedTableAxisState: DraggedTableAxisState
  editor: TiptapEditor | null
  growTableFromCorner: () => void
  handleTableColumnRailSegmentClick: (
    columnIndex: number,
    anchorRect: DOMRect
  ) => boolean
  handleTableRowGripClick: (rowIndex: number, anchorRect: DOMRect) => boolean
  handleToolbarButtonMouseDown: ToolbarMouseDownHandler
  hideTableOverflowCoachmark: () => void
  hoveredTableCellMenuLayout: Pick<
    TableRailLayout,
    "cellMenuLeft" | "cellMenuTop"
  > | null
  isCurrentTableColumnSelection: (columnIndex: number) => boolean
  isCurrentTableRowSelection: (rowIndex: number) => boolean
  isTableCornerGrowActive: boolean
  isTableQuickRailHovered: boolean
  normalizeTableColorInputValue: (value: unknown) => string
  openSelectionAwareTableMenu: (
    kind: TableMenuKind,
    anchorRect: DOMRect
  ) => void
  openTableMenu: (kind: TableMenuKind, anchorRect: DOMRect) => void
  resolveTableCornerGrowStepMetricsFromHandle: (
    handle: HTMLElement
  ) => TableCornerGrowStepMetrics
  runTableMenuEditorAction: (
    action: (activeEditor: TiptapEditor) => void
  ) => void
  scheduleTableOverflowCoachmarkHide: (delayMs?: number) => void
  scheduleTableQuickRailHide: (delayMs?: number) => void
  selectTableAxisAtIndex: (
    activeEditor: TiptapEditor,
    tablePos: number,
    axis: TableAxis,
    axisIndex: number,
    options?: { clearNativeText?: boolean }
  ) => boolean
  selectTableColumnByIndex: (
    columnIndex: number,
    options?: { clearNativeText?: boolean }
  ) => TableAxisSelectionTarget | false
  selectTableRowByIndex: (
    rowIndex: number,
    options?: { clearNativeText?: boolean }
  ) => TableAxisSelectionTarget | false
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
    clientY: number,
    completeClickWithoutDrag?: () => boolean
  ) => void
  startTableColumnRailResize: (
    pointerId: number,
    columnIndex: number,
    clientX: number
  ) => void
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
  deleteActiveTable: (activeEditor: TiptapEditor) => boolean
  updateActiveTableCellAttrs: (attrs: Partial<ActiveTableCellAttrs>) => void
  updateActiveTableOverflowMode: (
    activeEditor: TiptapEditor,
    overflowMode: "normal" | typeof TABLE_OVERFLOW_MODE_WIDE
  ) => boolean
}
