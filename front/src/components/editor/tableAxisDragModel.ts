import type { TableAffordanceGeometry } from "./tableAffordanceModel"

export type TableAxis = "row" | "column"

export type PendingTableAxisDragState = {
  axis: TableAxis
  sourceIndex: number
  pointerId: number
  tablePos: number
  startX: number
  startY: number
  previewLeft: number
  previewTop: number
  previewWidth: number
  previewHeight: number
}

export type DraggedTableAxisState =
  | {
      axis: TableAxis
      sourceIndex: number
      pointerId: number
      tablePos: number
      previewLeft: number
      previewTop: number
      previewWidth: number
      previewHeight: number
    }
  | null

export type TableAxisReorderIndicatorState = {
  visible: boolean
  axis: TableAxis
  insertionIndex: number
  left: number
  top: number
  width: number
  height: number
}

export type TableAxisDragGhostPosition = {
  x: number
  y: number
} | null

export const createHiddenTableAxisReorderIndicatorState = (
  axis: TableAxis = "row",
  insertionIndex = 0
): TableAxisReorderIndicatorState => ({
  visible: false,
  axis,
  insertionIndex,
  left: 0,
  top: 0,
  width: 0,
  height: 0,
})

export const createPendingTableAxisDragState = (
  axis: TableAxis,
  sourceIndex: number,
  pointerId: number,
  tablePos: number,
  startX: number,
  startY: number,
  geometry: TableAffordanceGeometry
): PendingTableAxisDragState => ({
  axis,
  sourceIndex,
  pointerId,
  tablePos,
  startX,
  startY,
  previewLeft: axis === "row" ? geometry.tableLeft : geometry.columnLeft,
  previewTop: axis === "row" ? geometry.rowTop : geometry.tableTop,
  previewWidth: axis === "row" ? geometry.width : geometry.columnWidth,
  previewHeight: axis === "row" ? geometry.rowHeight : geometry.height,
})

export const createDraggedTableAxisState = (
  pending: PendingTableAxisDragState
): Exclude<DraggedTableAxisState, null> => ({
  axis: pending.axis,
  sourceIndex: pending.sourceIndex,
  pointerId: pending.pointerId,
  tablePos: pending.tablePos,
  previewLeft: pending.previewLeft,
  previewTop: pending.previewTop,
  previewWidth: pending.previewWidth,
  previewHeight: pending.previewHeight,
})

export const createTableAxisDragGhostPosition = (
  dragState: Pick<PendingTableAxisDragState, "axis" | "previewLeft" | "previewHeight">,
  clientY: number
): TableAxisDragGhostPosition =>
  dragState.axis === "row"
    ? {
        x: dragState.previewLeft,
        y: Math.round(clientY - dragState.previewHeight / 2),
      }
    : null

export const hideTableAxisReorderIndicatorState = (
  state: TableAxisReorderIndicatorState
): TableAxisReorderIndicatorState => (state.visible ? { ...state, visible: false } : state)

export const resolveTableAxisReorderIndicator = (
  renderedTable: HTMLTableElement | null | undefined,
  axis: TableAxis,
  sourceIndex: number,
  clientX: number,
  clientY: number
): TableAxisReorderIndicatorState | null => {
  if (!renderedTable) return null

  const tableRect = renderedTable.getBoundingClientRect()
  const rows = Array.from(renderedTable.querySelectorAll("tr")).filter(
    (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement && row.cells.length > 0
  )
  if (rows.length === 0) return null

  if (axis === "row") {
    const boundedSourceIndex = Math.max(0, Math.min(sourceIndex, rows.length - 1))
    let insertionIndex = rows.length
    let top = tableRect.bottom

    rows.forEach((row, rowIndex) => {
      if (insertionIndex !== rows.length) return
      const rowRect = row.getBoundingClientRect()
      if (clientY < rowRect.top + rowRect.height / 2) {
        insertionIndex = rowIndex
        top = rowRect.top
      }
    })

    return {
      visible: true,
      axis,
      insertionIndex,
      left: Math.round(tableRect.left),
      top: Math.round(top),
      width: Math.round(tableRect.width),
      height: Math.max(2, Math.round(Math.min(rows[boundedSourceIndex]?.getBoundingClientRect().height ?? 2, 3))),
    }
  }

  const firstRowCells = Array.from(rows[0].cells).filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
  )
  if (firstRowCells.length === 0) return null

  let insertionIndex = firstRowCells.length
  let left = tableRect.right
  firstRowCells.forEach((cell, columnIndex) => {
    if (insertionIndex !== firstRowCells.length) return
    const cellRect = cell.getBoundingClientRect()
    if (clientX < cellRect.left + cellRect.width / 2) {
      insertionIndex = columnIndex
      left = cellRect.left
    }
  })

  return {
    visible: true,
    axis,
    insertionIndex,
    left: Math.round(left),
    top: Math.round(tableRect.top),
    width: 2,
    height: Math.round(tableRect.height),
  }
}

export const resolveTableAxisIndexFromPointer = (
  renderedTable: HTMLTableElement | null | undefined,
  axis: TableAxis,
  clientX: number,
  clientY: number
) => {
  if (!renderedTable) return null

  const rows = Array.from(renderedTable.querySelectorAll("tr")).filter(
    (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement && row.cells.length > 0
  )
  if (rows.length === 0) return null

  if (axis === "row") {
    const matchedRowIndex = rows.findIndex((row) => {
      const rowRect = row.getBoundingClientRect()
      return clientY >= rowRect.top && clientY <= rowRect.bottom
    })
    if (matchedRowIndex >= 0) return matchedRowIndex

    return rows.reduce((bestIndex, row, rowIndex) => {
      const rowRect = row.getBoundingClientRect()
      const nextDistance = Math.abs(clientY - (rowRect.top + rowRect.height / 2))
      const currentDistance = Math.abs(
        clientY - (rows[bestIndex].getBoundingClientRect().top + rows[bestIndex].getBoundingClientRect().height / 2)
      )
      return nextDistance < currentDistance ? rowIndex : bestIndex
    }, 0)
  }

  const firstRowCells = Array.from(rows[0].cells).filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
  )
  if (firstRowCells.length === 0) return null

  const matchedColumnIndex = firstRowCells.findIndex((cell) => {
    const cellRect = cell.getBoundingClientRect()
    return clientX >= cellRect.left && clientX <= cellRect.right
  })
  if (matchedColumnIndex >= 0) return matchedColumnIndex

  return firstRowCells.reduce((bestIndex, cell, columnIndex) => {
    const cellRect = cell.getBoundingClientRect()
    const nextDistance = Math.abs(clientX - (cellRect.left + cellRect.width / 2))
    const currentRect = firstRowCells[bestIndex].getBoundingClientRect()
    const currentDistance = Math.abs(clientX - (currentRect.left + currentRect.width / 2))
    return nextDistance < currentDistance ? columnIndex : bestIndex
  }, 0)
}
