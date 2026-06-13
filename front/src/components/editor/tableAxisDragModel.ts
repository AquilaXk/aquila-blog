import type { TableAffordanceGeometry } from "./tableAffordanceModel"

export type TableAxis = "row" | "column"

export type PendingTableAxisDragState = {
  axis: TableAxis
  sourceIndex: number
  rangeAnchorIndex: number
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
      rangeAnchorIndex: number
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

export type TableAxisSelectionState = {
  axis: TableAxis
  anchorIndex: number
  fromIndex: number
  index: number
  toIndex: number
}

export type TableAxisSelectionTarget = TableAxisSelectionState & {
  tablePos: number
}

export const resolveSyncedTableAxisGeometryFromDom = (
  previous: TableAffordanceGeometry,
  tableElement: Element,
  selection: TableAxisSelectionState
): TableAffordanceGeometry | null => {
  const tableRect = tableElement.getBoundingClientRect()
  if (tableRect.width <= 0 || tableRect.height <= 0) return null
  const rows = Array.from(tableElement.querySelectorAll("tr")).filter(
    (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement && row.cells.length > 0
  )
  if (selection.axis === "row" && (selection.index < 0 || selection.index >= rows.length)) return null
  const selectedRowIndex =
    selection.axis === "row"
      ? Math.max(0, Math.min(selection.index, rows.length - 1))
      : 0
  const selectedRow = rows[selectedRowIndex] ?? rows[0] ?? null
  const firstRowCells = Array.from(rows[0]?.cells ?? []).filter(
    (cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement
  )
  if (selection.axis === "column" && (selection.index < 0 || selection.index >= firstRowCells.length)) return null
  const selectedCell =
    selection.axis === "column" ? firstRowCells[selection.index] ?? null : selectedRow?.cells[0] ?? null
  const rowRect = selectedRow?.getBoundingClientRect()
  const cellRect = selectedCell?.getBoundingClientRect()
  const tableLeft = Math.round(tableRect.left), tableTop = Math.round(tableRect.top)
  const deltaLeft = tableLeft - previous.tableLeft, deltaTop = tableTop - previous.tableTop
  const rowTop = Math.round(rowRect?.top ?? previous.rowTop + deltaTop)
  const columnLeft = Math.round(cellRect?.left ?? previous.columnLeft + deltaLeft)
  const moveAnchor = (anchor: { left: number; top: number }) => ({ left: Math.round(anchor.left + deltaLeft), top: Math.round(anchor.top + deltaTop) })
  return {
    ...previous,
    left: Math.round(previous.left + deltaLeft),
    top: Math.round(previous.top + deltaTop),
    tableLeft,
    tableTop,
    tableRight: Math.round(tableRect.right),
    tableBottom: Math.round(tableRect.bottom),
    width: Math.round(tableRect.width),
    height: Math.round(tableRect.height),
    surfaceLeft: tableLeft,
    surfaceTop: tableTop,
    surfaceWidth: Math.round(tableRect.width),
    surfaceHeight: Math.round(tableRect.height),
    cellLeft: Math.round(cellRect?.left ?? previous.cellLeft + deltaLeft),
    cellTop: Math.round(cellRect?.top ?? previous.cellTop + deltaTop),
    cellWidth: Math.round(cellRect?.width ?? previous.cellWidth),
    cellHeight: Math.round(cellRect?.height ?? previous.cellHeight),
    rowIndex: selection.axis === "row" ? selection.index : previous.rowIndex,
    rowTop,
    rowHeight: Math.round(rowRect?.height ?? previous.rowHeight),
    columnLeft,
    columnWidth: Math.round(cellRect?.width ?? previous.columnWidth),
    columnIndex: selection.axis === "column" ? selection.index : previous.columnIndex,
    rowHandleAnchor: moveAnchor(previous.rowHandleAnchor),
    columnHandleAnchor: moveAnchor(previous.columnHandleAnchor),
    rowAddAnchor: moveAnchor(previous.rowAddAnchor),
    columnAddAnchor: moveAnchor(previous.columnAddAnchor),
    cornerAnchor: moveAnchor(previous.cornerAnchor),
    cellMenuAnchor: moveAnchor(previous.cellMenuAnchor),
    rowSegments: rows.map((row) => {
      const rect = row.getBoundingClientRect()
      return { height: Math.round(rect.height), top: Math.round(Math.max(0, rect.top - tableRect.top)) }
    }),
    columnSegments: firstRowCells.map((cell) => {
      const rect = cell.getBoundingClientRect()
      return { left: Math.round(Math.max(0, rect.left - tableRect.left)), width: Math.round(rect.width) }
    }),
  }
}

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
  rangeAnchorIndex: number,
  pointerId: number,
  tablePos: number,
  startX: number,
  startY: number,
  geometry: TableAffordanceGeometry
): PendingTableAxisDragState => ({
  axis,
  sourceIndex,
  rangeAnchorIndex,
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
  rangeAnchorIndex: pending.rangeAnchorIndex,
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
