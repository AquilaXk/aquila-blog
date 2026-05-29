export type TableRowResizeState = {
  row: HTMLTableRowElement
  cells: HTMLTableCellElement[]
  startY: number
  startHeight: number
}

export type TableColumnRailResizeState = {
  pointerId: number
  columnIndex: number
  startClientX: number
  baseWidths: number[]
  budget: number
  overflowMode: string
}

export type TableColumnDragGuideState = {
  visible: boolean
  left: number
  top: number
  height: number
}

export const TABLE_ROW_RESIZE_EDGE_PX = 6
export const TABLE_COLUMN_RESIZE_GUARD_PX = 12

export const createHiddenTableColumnDragGuideState = (): TableColumnDragGuideState => ({
  visible: false,
  left: 0,
  top: 0,
  height: 0,
})

export const hideTableColumnDragGuideState = (
  state: TableColumnDragGuideState
): TableColumnDragGuideState => (state.visible ? { ...state, visible: false } : state)

export const createTableRowResizeState = (
  cell: HTMLTableCellElement,
  startY: number
): TableRowResizeState | null => {
  const row = cell.parentElement
  if (!(row instanceof HTMLTableRowElement)) return null

  const cells = Array.from(row.cells)
  if (cells.length === 0) return null

  return {
    row,
    cells,
    startY,
    startHeight: row.getBoundingClientRect().height,
  }
}

export const createTableColumnRailResizeState = (
  pointerId: number,
  columnIndex: number,
  startClientX: number,
  baseWidths: number[],
  budget: number,
  overflowMode: string
): TableColumnRailResizeState => ({
  pointerId,
  columnIndex,
  startClientX,
  baseWidths,
  budget,
  overflowMode,
})

export const isRowResizeHandleTarget = (
  cell: HTMLTableCellElement | null,
  clientX: number,
  clientY: number
) => {
  if (!cell) return false

  const rect = cell.getBoundingClientRect()
  const distanceToBottom = rect.bottom - clientY
  const distanceToRight = rect.right - clientX
  return (
    distanceToBottom >= -1 &&
    distanceToBottom <= TABLE_ROW_RESIZE_EDGE_PX &&
    distanceToRight > TABLE_COLUMN_RESIZE_GUARD_PX
  )
}

export const resolveTableColumnDragGuideState = (
  tableElement: HTMLTableElement | null | undefined,
  columnIndex: number
): TableColumnDragGuideState | null => {
  const headerRow = tableElement?.querySelector("thead tr, tbody tr, tr")
  if (!tableElement || !headerRow) return null

  const cells = Array.from(headerRow.children).filter(
    (node): node is HTMLElement => node instanceof HTMLElement
  )
  if (columnIndex < 0 || columnIndex >= cells.length) return null

  const tableRect = tableElement.getBoundingClientRect()
  const cellRect = cells[columnIndex].getBoundingClientRect()
  return {
    visible: true,
    left: Math.round(Math.min(tableRect.right, cellRect.right)),
    top: Math.round(tableRect.top),
    height: Math.round(tableRect.height),
  }
}

export const resolveTableColumnIndexFromResizeHandleTarget = (
  target: EventTarget | null
) => {
  if (!(target instanceof Element)) return null

  const handleElement =
    target.closest(".column-resize-handle") ??
    target.closest("[data-testid^='table-column-resize-boundary-']")
  if (!(handleElement instanceof HTMLElement)) return null

  const handleTestId = handleElement.getAttribute("data-testid")
  if (handleTestId?.startsWith("table-column-resize-boundary-")) {
    const parsedIndex = Number(handleTestId.replace("table-column-resize-boundary-", ""))
    return Number.isInteger(parsedIndex) && parsedIndex >= 0 ? parsedIndex : null
  }

  const cell = handleElement.closest("th, td")
  if (!(cell instanceof HTMLElement) || !(cell.parentElement instanceof HTMLTableRowElement)) {
    return null
  }

  const columnIndex = Array.from(cell.parentElement.children).findIndex((candidate) => candidate === cell)
  return columnIndex >= 0 ? columnIndex : null
}
