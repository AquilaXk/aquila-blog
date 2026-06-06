import type { Editor as TiptapEditor } from "@tiptap/core"
import { Fragment, Node as ProseMirrorNode } from "@tiptap/pm/model"
import { NodeSelection, TextSelection } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"

import { getTableOverflowMode } from "./tableWidthModel"

export type TableAxis = "row" | "column"

export type TableColumnCellRef = {
  pos: number
  node: ProseMirrorNode
}

export type ActiveTableStructureState = {
  hasHeaderColumn: boolean
  hasHeaderRow: boolean
  overflowMode: string
}

const TABLE_CONTEXT_NODE_NAMES = new Set([
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
])

export const hasTableContextInResolvedPos = (resolvedPos: {
  depth: number
  node: (depth: number) => { type: { name: string } }
}) => {
  for (let depth = resolvedPos.depth; depth >= 0; depth -= 1) {
    if (TABLE_CONTEXT_NODE_NAMES.has(resolvedPos.node(depth).type.name)) {
      return true
    }
  }
  return false
}

export const createSafeTextSelectionOutsideTable = (
  doc: ProseMirrorNode,
  pos: number,
  bias = -1
) => {
  const maxPos = doc.content.size
  const startPos = Math.max(0, Math.min(pos, maxPos))
  const scan = (step: 1 | -1) => {
    for (
      let nextPos = startPos;
      nextPos >= 0 && nextPos <= maxPos;
      nextPos += step
    ) {
      const $pos = doc.resolve(nextPos)
      if ($pos.parent.inlineContent && !hasTableContextInResolvedPos($pos)) {
        return TextSelection.create(doc, nextPos)
      }
    }
    return null
  }
  return scan(bias < 0 ? -1 : 1) ?? scan(bias < 0 ? 1 : -1)
}

export const isTableSelectionActive = (editor?: TiptapEditor | null) => {
  if (!editor) return false
  const { selection } = editor.state
  if (selection instanceof CellSelection) return true
  if (
    selection instanceof NodeSelection &&
    selection.node.type.name === "table"
  )
    return true
  if (
    editor.isActive("table") ||
    editor.isActive("tableRow") ||
    editor.isActive("tableCell") ||
    editor.isActive("tableHeader")
  ) {
    return true
  }

  return (
    hasTableContextInResolvedPos(selection.$from) ||
    hasTableContextInResolvedPos(selection.$to)
  )
}

export const getActiveTableStructureState = (
  editor?: TiptapEditor | null,
  tablePos?: number | null
): ActiveTableStructureState => {
  if (!editor) {
    return {
      hasHeaderRow: false,
      hasHeaderColumn: false,
      overflowMode: "normal",
    }
  }

  const { selection } = editor.state
  const targetedTableNode =
    typeof tablePos === "number" ? editor.state.doc.nodeAt(tablePos) : null
  const tableNode =
    targetedTableNode?.type.name === "table"
      ? targetedTableNode
      : selection instanceof NodeSelection &&
        selection.node.type.name === "table"
      ? selection.node
      : (() => {
          for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
            const node = selection.$from.node(depth)
            if (node.type.name === "table") return node
          }
          for (let depth = selection.$to.depth; depth >= 0; depth -= 1) {
            const node = selection.$to.node(depth)
            if (node.type.name === "table") return node
          }
          return null
        })()

  if (
    !tableNode ||
    tableNode.type.name !== "table" ||
    tableNode.childCount === 0
  ) {
    return {
      hasHeaderRow: false,
      hasHeaderColumn: false,
      overflowMode: "normal",
    }
  }

  const rows = Array.from({ length: tableNode.childCount }, (_, rowIndex) =>
    tableNode.child(rowIndex)
  )
  const firstRow = rows[0]
  const hasHeaderRow =
    firstRow?.childCount > 0 &&
    Array.from({ length: firstRow.childCount }, (_, columnIndex) =>
      firstRow.child(columnIndex)
    ).every((cell) => cell.type.name === "tableHeader")
  const hasHeaderColumn =
    rows.length > 0 &&
    rows.every(
      (row) => row.childCount > 0 && row.child(0)?.type.name === "tableHeader"
    )

  return {
    hasHeaderRow,
    hasHeaderColumn,
    overflowMode: getTableOverflowMode(tableNode),
  }
}

const isTableCellNode = (node: ProseMirrorNode | null | undefined) =>
  Boolean(
    node && (node.type.name === "tableCell" || node.type.name === "tableHeader")
  )

const isVisuallyEmptyTableCellContent = (
  node: ProseMirrorNode | null | undefined
): boolean => {
  if (!node) return true
  if (node.isText) return node.textContent.trim().length === 0
  if (node.isLeaf) return false

  for (let childIndex = 0; childIndex < node.childCount; childIndex += 1) {
    if (!isVisuallyEmptyTableCellContent(node.child(childIndex))) {
      return false
    }
  }

  return true
}

export const canShrinkTableAxisAtEnd = (
  tableNode: ProseMirrorNode,
  axis: TableAxis
): boolean => {
  const rowCount = tableNode.childCount
  if (rowCount === 0) return false

  const firstRow = tableNode.firstChild
  if (!firstRow) return false
  const columnCount = firstRow.childCount
  if (columnCount === 0) return false

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = tableNode.child(rowIndex)
    if (row.childCount !== columnCount) return false
    for (let columnIndex = 0; columnIndex < row.childCount; columnIndex += 1) {
      const cell = row.child(columnIndex)
      if (!isTableCellNode(cell)) return false
      const colspan =
        typeof cell.attrs?.colspan === "number" ? cell.attrs.colspan : 1
      const rowspan =
        typeof cell.attrs?.rowspan === "number" ? cell.attrs.rowspan : 1
      if (colspan > 1 || rowspan > 1) return false
    }
  }

  if (axis === "row") {
    if (rowCount <= 1) return false
    const trailingRow = tableNode.child(rowCount - 1)
    for (
      let columnIndex = 0;
      columnIndex < trailingRow.childCount;
      columnIndex += 1
    ) {
      if (!isVisuallyEmptyTableCellContent(trailingRow.child(columnIndex))) {
        return false
      }
    }
    return true
  }

  if (columnCount <= 1) return false
  const trailingColumnIndex = columnCount - 1
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = tableNode.child(rowIndex)
    if (!isVisuallyEmptyTableCellContent(row.child(trailingColumnIndex))) {
      return false
    }
  }
  return true
}

export const countShrinkableTableAxisAtEnd = (
  tableNode: ProseMirrorNode,
  axis: TableAxis
): number => {
  const rowCount = tableNode.childCount
  if (rowCount === 0) return 0

  const firstRow = tableNode.firstChild
  if (!firstRow) return 0
  const columnCount = firstRow.childCount
  if (columnCount === 0) return 0

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const row = tableNode.child(rowIndex)
    if (row.childCount !== columnCount) return 0
    for (let columnIndex = 0; columnIndex < row.childCount; columnIndex += 1) {
      const cell = row.child(columnIndex)
      if (!isTableCellNode(cell)) return 0
      const colspan =
        typeof cell.attrs?.colspan === "number" ? cell.attrs.colspan : 1
      const rowspan =
        typeof cell.attrs?.rowspan === "number" ? cell.attrs.rowspan : 1
      if (colspan > 1 || rowspan > 1) return 0
    }
  }

  if (axis === "row") {
    let shrinkableRows = 0
    for (let rowIndex = rowCount - 1; rowIndex >= 1; rowIndex -= 1) {
      const trailingRow = tableNode.child(rowIndex)
      let empty = true
      for (
        let columnIndex = 0;
        columnIndex < trailingRow.childCount;
        columnIndex += 1
      ) {
        if (!isVisuallyEmptyTableCellContent(trailingRow.child(columnIndex))) {
          empty = false
          break
        }
      }
      if (!empty) break
      shrinkableRows += 1
    }
    return shrinkableRows
  }

  let shrinkableColumns = 0
  for (let columnIndex = columnCount - 1; columnIndex >= 1; columnIndex -= 1) {
    let empty = true
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const row = tableNode.child(rowIndex)
      if (!isVisuallyEmptyTableCellContent(row.child(columnIndex))) {
        empty = false
        break
      }
    }
    if (!empty) break
    shrinkableColumns += 1
  }
  return shrinkableColumns
}

const isVisuallyEmptyRenderedTableCell = (
  cell: HTMLTableCellElement | null | undefined
) => {
  if (!cell) return true
  if (
    cell.querySelector("img, video, svg, canvas, iframe, object, embed, table")
  )
    return false
  return cell.textContent?.trim().length ? false : true
}

export const countShrinkableRenderedTableAxisAtEnd = (
  tableElement: HTMLTableElement | null,
  axis: TableAxis
): number => {
  if (!tableElement) return 0
  const rows = Array.from(tableElement.querySelectorAll("tr")).filter(
    (row): row is HTMLTableRowElement => row instanceof HTMLTableRowElement
  )
  if (rows.length === 0) return 0
  const columnCount = rows[0]?.cells.length ?? 0
  if (columnCount === 0) return 0

  for (const row of rows) {
    if (row.cells.length !== columnCount) return 0
    for (const cell of Array.from(row.cells)) {
      const colspan = Number(cell.getAttribute("colspan") || "1")
      const rowspan = Number(cell.getAttribute("rowspan") || "1")
      if (colspan > 1 || rowspan > 1) return 0
    }
  }

  if (axis === "row") {
    let shrinkableRows = 0
    for (let rowIndex = rows.length - 1; rowIndex >= 1; rowIndex -= 1) {
      const row = rows[rowIndex]
      if (
        Array.from(row.cells).some(
          (cell) => !isVisuallyEmptyRenderedTableCell(cell)
        )
      )
        break
      shrinkableRows += 1
    }
    return shrinkableRows
  }

  let shrinkableColumns = 0
  for (let columnIndex = columnCount - 1; columnIndex >= 1; columnIndex -= 1) {
    let empty = true
    for (const row of rows) {
      if (!isVisuallyEmptyRenderedTableCell(row.cells[columnIndex] ?? null)) {
        empty = false
        break
      }
    }
    if (!empty) break
    shrinkableColumns += 1
  }
  return shrinkableColumns
}

export const collectSimpleTableColumnCells = (
  tableNode: ProseMirrorNode,
  tablePos: number
) => {
  const columns: TableColumnCellRef[][] = []
  let hasMergedCell = false

  tableNode.forEach((rowNode, rowOffset) => {
    if (rowNode.type?.name !== "tableRow") return
    const rowPos = tablePos + 1 + rowOffset
    let columnIndex = 0

    rowNode.forEach((cellNode, cellOffset) => {
      const colspan = Math.max(1, Number(cellNode.attrs?.colspan ?? 1) || 1)
      const rowspan = Math.max(1, Number(cellNode.attrs?.rowspan ?? 1) || 1)
      if (colspan !== 1 || rowspan !== 1) {
        hasMergedCell = true
        return
      }

      const cellPos = rowPos + 1 + cellOffset
      columns[columnIndex] ||= []
      columns[columnIndex].push({ pos: cellPos, node: cellNode })
      columnIndex += 1
    })
  })

  return hasMergedCell ? null : columns
}

const moveItemToInsertionIndex = <T>(
  items: T[],
  sourceIndex: number,
  insertionIndex: number
) => {
  if (sourceIndex < 0 || sourceIndex >= items.length) {
    return { changed: false, items, nextIndex: sourceIndex }
  }

  const boundedInsertionIndex = Math.max(
    0,
    Math.min(insertionIndex, items.length)
  )
  if (
    boundedInsertionIndex === sourceIndex ||
    boundedInsertionIndex === sourceIndex + 1
  ) {
    return { changed: false, items, nextIndex: sourceIndex }
  }

  const nextItems = items.slice()
  const [movedItem] = nextItems.splice(sourceIndex, 1)
  if (typeof movedItem === "undefined") {
    return { changed: false, items, nextIndex: sourceIndex }
  }

  const nextIndex =
    boundedInsertionIndex > sourceIndex
      ? boundedInsertionIndex - 1
      : boundedInsertionIndex
  nextItems.splice(nextIndex, 0, movedItem)

  return {
    changed: true,
    items: nextItems,
    nextIndex,
  }
}

export const buildReorderedSimpleTableNode = (
  tableNode: ProseMirrorNode,
  axis: TableAxis,
  sourceIndex: number,
  insertionIndex: number
) => {
  const rowNodes: ProseMirrorNode[] = []
  tableNode.forEach((rowNode) => {
    if (rowNode.type.name === "tableRow") {
      rowNodes.push(rowNode)
    }
  })

  if (rowNodes.length === 0) return null

  if (axis === "row") {
    const movedRows = moveItemToInsertionIndex(
      rowNodes,
      sourceIndex,
      insertionIndex
    )
    if (!movedRows.changed) return null
    return {
      node: tableNode.type.create(
        tableNode.attrs,
        Fragment.fromArray(movedRows.items),
        tableNode.marks
      ),
      nextIndex: movedRows.nextIndex,
    }
  }

  if (!collectSimpleTableColumnCells(tableNode, 0)) {
    return null
  }

  const firstRowCells: ProseMirrorNode[] = []
  rowNodes[0]?.forEach((cellNode) => {
    firstRowCells.push(cellNode)
  })
  const movedColumns = moveItemToInsertionIndex(
    firstRowCells,
    sourceIndex,
    insertionIndex
  )
  if (!movedColumns.changed) return null

  const nextRows = rowNodes.map((rowNode) => {
    const cells: ProseMirrorNode[] = []
    rowNode.forEach((cellNode) => {
      cells.push(cellNode)
    })
    if (cells.length !== firstRowCells.length) {
      return rowNode
    }
    const movedCells = moveItemToInsertionIndex(
      cells,
      sourceIndex,
      insertionIndex
    )
    return rowNode.type.create(
      rowNode.attrs,
      Fragment.fromArray(movedCells.items),
      rowNode.marks
    )
  })

  return {
    node: tableNode.type.create(
      tableNode.attrs,
      Fragment.fromArray(nextRows),
      tableNode.marks
    ),
    nextIndex: movedColumns.nextIndex,
  }
}
