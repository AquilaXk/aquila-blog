import type {
  TableAffordanceVisibility,
  TableOverlayAnchor,
} from "./tableAffordanceModel"
import type { TableAxis, TableAxisSelectionTarget } from "./tableAxisDragModel"

export type TableMenuKind = "row" | "column" | "table" | "cell"

export type TableMenuState =
  | {
      kind: TableMenuKind
      left: number
      top: number
      axisTarget?: TableAxisSelectionTarget
    }
  | null

export type TableOverflowCoachmarkState = {
  visible: boolean
  left: number
  top: number
}

export type CompactTableAffordanceKind = TableAxis | "table" | null

type ViewportSize = {
  width: number
  height: number
}

type TableMenuAnchorRect = Pick<DOMRect, "left" | "bottom">
type TableMenuOptions = {
  axisTarget?: TableAxisSelectionTarget
}

type TableCoachmarkRect = Pick<DOMRect, "right" | "top"> | null

type TableAxisSelectionLike = {
  axis: TableAxis
} | null

export const TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX = 244
export const TABLE_OVERFLOW_COACHMARK_DISMISS_MS = 4200
export const TABLE_MENU_EDGE_PADDING_PX = 16
export const TABLE_MENU_ESTIMATED_WIDTH_PX = 272
export const TABLE_MENU_ESTIMATED_HEIGHT_PX = 420

export const createHiddenTableOverflowCoachmarkState = (): TableOverflowCoachmarkState => ({
  visible: false,
  left: 0,
  top: 0,
})

export const hideTableOverflowCoachmarkState = (
  state: TableOverflowCoachmarkState
): TableOverflowCoachmarkState => (state.visible ? { ...state, visible: false } : state)

export const resolveTableOverflowCoachmarkState = ({
  tableRect,
  fallbackAnchor,
  viewportWidth,
  viewportHeight,
  cornerButtonSize,
}: {
  tableRect: TableCoachmarkRect
  fallbackAnchor: TableOverlayAnchor
  viewportWidth: number
  viewportHeight: number
  cornerButtonSize: number
}): TableOverflowCoachmarkState => {
  const anchorRight = tableRect ? tableRect.right : fallbackAnchor.left + cornerButtonSize
  const anchorTop = tableRect ? tableRect.top : fallbackAnchor.top
  const nextLeft = Math.min(
    Math.max(TABLE_MENU_EDGE_PADDING_PX, Math.round(anchorRight - TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX)),
    Math.max(
      TABLE_MENU_EDGE_PADDING_PX,
      viewportWidth - TABLE_OVERFLOW_COACHMARK_ESTIMATED_WIDTH_PX - TABLE_MENU_EDGE_PADDING_PX
    )
  )
  const preferredTop = Math.round(anchorTop - 54)
  const nextTop =
    preferredTop >= TABLE_MENU_EDGE_PADDING_PX
      ? preferredTop
      : Math.min(viewportHeight - 52, Math.round(anchorTop + 12))

  return {
    visible: true,
    left: nextLeft,
    top: Math.max(TABLE_MENU_EDGE_PADDING_PX, nextTop),
  }
}

export const resolveTableMenuState = (
  currentState: TableMenuState,
  kind: TableMenuKind,
  anchorRect: TableMenuAnchorRect,
  viewport: ViewportSize | null,
  options: TableMenuOptions = {}
): TableMenuState => {
  const nextLeft = viewport
    ? Math.min(
        Math.max(TABLE_MENU_EDGE_PADDING_PX, Math.round(anchorRect.left)),
        Math.max(
          TABLE_MENU_EDGE_PADDING_PX,
          viewport.width - TABLE_MENU_ESTIMATED_WIDTH_PX - TABLE_MENU_EDGE_PADDING_PX
        )
      )
    : Math.round(anchorRect.left)
  const nextTop = viewport
    ? Math.min(
        Math.max(TABLE_MENU_EDGE_PADDING_PX, Math.round(anchorRect.bottom + 8)),
        Math.max(
          TABLE_MENU_EDGE_PADDING_PX,
          viewport.height - TABLE_MENU_ESTIMATED_HEIGHT_PX - TABLE_MENU_EDGE_PADDING_PX
        )
      )
    : Math.round(anchorRect.bottom + 8)

  return currentState && currentState.kind === kind
    ? null
    : {
        kind,
        left: nextLeft,
        top: nextTop,
        axisTarget: options.axisTarget,
      }
}

export const resolveTableMenuFlags = (state: TableMenuState) => {
  const tableMenuKind = state?.kind ?? null

  return {
    tableMenuKind,
    isAnyTableMenuOpen: tableMenuKind !== null,
    isTableStructureMenuOpen: tableMenuKind === "table",
    isRowMenuOpen: tableMenuKind === "row",
    isColumnMenuOpen: tableMenuKind === "column",
    isCellMenuOpen: tableMenuKind === "cell",
  }
}

export const resolveCompactTableAffordanceKind = ({
  shouldUseCompactTableAffordance,
  currentTableAxisSelection,
  draggedTableAxis,
  isRowMenuOpen,
  isColumnMenuOpen,
  tableAffordanceVisible,
  shouldPersistTableHandles,
  isTableStructureMenuOpen,
  hasActiveTableCellContext,
}: {
  shouldUseCompactTableAffordance: boolean
  currentTableAxisSelection: TableAxisSelectionLike
  draggedTableAxis: TableAxis | null
  isRowMenuOpen: boolean
  isColumnMenuOpen: boolean
  tableAffordanceVisible: boolean
  shouldPersistTableHandles: boolean
  isTableStructureMenuOpen: boolean
  hasActiveTableCellContext: boolean
}): CompactTableAffordanceKind => {
  if (!shouldUseCompactTableAffordance) return null
  if (currentTableAxisSelection?.axis === "row" || draggedTableAxis === "row" || isRowMenuOpen) return "row"
  if (currentTableAxisSelection?.axis === "column" || draggedTableAxis === "column" || isColumnMenuOpen) {
    return "column"
  }
  if (tableAffordanceVisible || shouldPersistTableHandles || isTableStructureMenuOpen || hasActiveTableCellContext) {
    return "table"
  }
  return null
}

export const resolveTableHandleVisibility = ({
  compactTableAffordanceKind,
  shouldShowDesktopTableHandles,
  tableAffordanceVisibility,
  currentTableAxisSelection,
  draggedTableAxis,
  isColumnMenuOpen,
  isRowMenuOpen,
}: {
  compactTableAffordanceKind: CompactTableAffordanceKind
  shouldShowDesktopTableHandles: boolean
  tableAffordanceVisibility: TableAffordanceVisibility
  currentTableAxisSelection: TableAxisSelectionLike
  draggedTableAxis: TableAxis | null
  isColumnMenuOpen: boolean
  isRowMenuOpen: boolean
}) => ({
  shouldShowColumnRail:
    compactTableAffordanceKind === "column" ||
    (shouldShowDesktopTableHandles &&
      (tableAffordanceVisibility.showColumnRail ||
        currentTableAxisSelection?.axis === "column" ||
        draggedTableAxis === "column" ||
        isColumnMenuOpen)),
  shouldShowRowRail:
    compactTableAffordanceKind === "row" ||
    (shouldShowDesktopTableHandles &&
      (tableAffordanceVisibility.showRowRail ||
        currentTableAxisSelection?.axis === "row" ||
        draggedTableAxis === "row" ||
        isRowMenuOpen)),
  shouldShowColumnAddBar:
    shouldShowDesktopTableHandles && (tableAffordanceVisibility.showColumnAddBar || isColumnMenuOpen),
  shouldShowRowAddBar:
    shouldShowDesktopTableHandles && (tableAffordanceVisibility.showRowAddBar || isRowMenuOpen),
})
