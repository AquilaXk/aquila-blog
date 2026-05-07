export const TABLE_ADD_BAR_VIEWPORT_PADDING_PX = 8
export const TABLE_EDGE_ADD_BUTTON_SIZE_PX = 24
export const TABLE_CELL_MENU_BUTTON_SIZE_PX = 22

export type TableOverlayAnchor = {
  left: number
  top: number
}

export type TableAffordanceGeometry = {
  left: number
  top: number
  tableLeft: number
  tableTop: number
  tableRight: number
  tableBottom: number
  width: number
  height: number
  surfaceLeft: number
  surfaceTop: number
  surfaceWidth: number
  surfaceHeight: number
  cellLeft: number
  cellTop: number
  cellWidth: number
  cellHeight: number
  rowIndex: number
  rowTop: number
  rowHeight: number
  columnLeft: number
  columnWidth: number
  columnIndex: number
  rowHandleAnchor: TableOverlayAnchor
  columnHandleAnchor: TableOverlayAnchor
  rowAddAnchor: TableOverlayAnchor
  columnAddAnchor: TableOverlayAnchor
  cornerAnchor: TableOverlayAnchor
  cellMenuAnchor: TableOverlayAnchor
  columnSegments: Array<{
    left: number
    width: number
  }>
}

export type TableAffordanceVisibility = {
  visible: boolean
  showColumnRail: boolean
  showRowRail: boolean
  showColumnAddBar: boolean
  showRowAddBar: boolean
  showCornerControls: boolean
  showCellMenu: boolean
}

export const INITIAL_TABLE_AFFORDANCE_GEOMETRY: TableAffordanceGeometry = {
  left: 0,
  top: 0,
  tableLeft: 0,
  tableTop: 0,
  tableRight: 0,
  tableBottom: 0,
  width: 0,
  height: 0,
  surfaceLeft: 0,
  surfaceTop: 0,
  surfaceWidth: 0,
  surfaceHeight: 0,
  cellLeft: 0,
  cellTop: 0,
  cellWidth: 0,
  cellHeight: 0,
  rowIndex: 0,
  rowTop: 0,
  rowHeight: 0,
  columnLeft: 0,
  columnWidth: 0,
  columnIndex: 0,
  rowHandleAnchor: { left: 0, top: 0 },
  columnHandleAnchor: { left: 0, top: 0 },
  rowAddAnchor: { left: 0, top: 0 },
  columnAddAnchor: { left: 0, top: 0 },
  cornerAnchor: { left: 0, top: 0 },
  cellMenuAnchor: { left: 0, top: 0 },
  columnSegments: [],
}

export const INITIAL_TABLE_AFFORDANCE_VISIBILITY: TableAffordanceVisibility = {
  visible: false,
  showColumnRail: false,
  showRowRail: false,
  showColumnAddBar: false,
  showRowAddBar: false,
  showCornerControls: false,
  showCellMenu: false,
}

export const clampViewportPosition = (
  value: number,
  edgePadding: number,
  viewportSize: number,
  itemSize: number
) => {
  const max = Math.max(edgePadding, viewportSize - itemSize - edgePadding)
  return Math.min(Math.max(value, edgePadding), max)
}

export const intersectsViewportBounds = (
  rect: DOMRect | null | undefined,
  edgePadding = TABLE_ADD_BAR_VIEWPORT_PADDING_PX
) => {
  if (!rect) return false
  if (typeof window === "undefined") return true
  return (
    rect.right >= edgePadding &&
    rect.bottom >= edgePadding &&
    rect.left <= window.innerWidth - edgePadding &&
    rect.top <= window.innerHeight - edgePadding
  )
}

export const resolveDesktopTableRailLayout = (
  state: TableAffordanceGeometry
) => {
  const columnGripTop = Math.round(state.columnHandleAnchor.top)
  const cornerTop = Math.round(state.cornerAnchor.top)
  const cornerLeft = Math.round(state.cornerAnchor.left)
  const columnGripLeft = Math.round(state.columnHandleAnchor.left)
  const columnAddBarLeft =
    typeof window === "undefined"
      ? Math.round(state.columnAddAnchor.left)
      : clampViewportPosition(
          Math.round(state.columnAddAnchor.left),
          TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
          window.innerWidth,
          TABLE_EDGE_ADD_BUTTON_SIZE_PX
        )
  const columnAddBarTop = Math.round(state.columnAddAnchor.top)
  const rowGripTop = Math.round(state.rowHandleAnchor.top)
  const rowGripLeft = Math.round(state.rowHandleAnchor.left)
  const rowAddBarLeft = Math.round(state.rowAddAnchor.left)
  const rowAddBarTop =
    typeof window === "undefined"
      ? Math.round(state.rowAddAnchor.top)
      : clampViewportPosition(
          Math.round(state.rowAddAnchor.top),
          TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
          window.innerHeight,
          TABLE_EDGE_ADD_BUTTON_SIZE_PX
        )

  const cellMenuLeft =
    typeof window === "undefined"
      ? Math.round(state.cellMenuAnchor.left)
      : clampViewportPosition(
          Math.round(state.cellMenuAnchor.left),
          TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
          window.innerWidth,
          TABLE_CELL_MENU_BUTTON_SIZE_PX
        )
  const cellMenuTop =
    typeof window === "undefined"
      ? Math.round(state.cellMenuAnchor.top)
      : clampViewportPosition(
          Math.round(state.cellMenuAnchor.top),
          TABLE_ADD_BAR_VIEWPORT_PADDING_PX,
          window.innerHeight,
          TABLE_CELL_MENU_BUTTON_SIZE_PX
        )

  return {
    cornerLeft,
    cornerTop,
    columnGripLeft,
    columnGripTop,
    columnAddBarLeft,
    columnAddBarTop,
    rowGripLeft,
    rowGripTop,
    rowAddBarLeft,
    rowAddBarTop,
    cellMenuLeft,
    cellMenuTop,
  }
}
