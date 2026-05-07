import type { JSONContent } from "@tiptap/core"
import {
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_WIDE_COLUMN_MIN_WIDTH_PX,
  TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX,
} from "src/libs/markdown/tableMetadata"
import type { BlockEditorDoc } from "./serialization"

export const TABLE_OVERFLOW_MODE_WIDE = "wide"
export const TABLE_WIDTH_BUDGET_META_KEY = "aq-table-width-budget-normalized"

export const getTableOverflowMode = (
  tableNode: { attrs?: Record<string, unknown> } | null | undefined
) => tableNode?.attrs?.overflowMode === TABLE_OVERFLOW_MODE_WIDE ? TABLE_OVERFLOW_MODE_WIDE : "normal"

const readSimpleTableColumnCount = (tableNode: JSONContent): number => {
  const rows = Array.isArray(tableNode.content) ? tableNode.content : []
  return rows.reduce((max, row) => {
    const cells = Array.isArray(row.content)
      ? row.content.filter((cell) => cell?.type === "tableCell" || cell?.type === "tableHeader")
      : []
    return Math.max(max, cells.length)
  }, 0)
}

export const shouldPromoteWideTableOverflowMode = (columnCount: number, readableWidthBudget: number) =>
  columnCount > 0 && columnCount * TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX >= readableWidthBudget

export const getPreferredNormalTableTotalWidth = (columnCount: number, readableWidthBudget: number) => {
  const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * Math.max(1, columnCount)
  const preferredBudget = Math.max(
    minBudget,
    Math.round(columnCount * TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX)
  )
  return Math.max(minBudget, Math.min(Math.round(readableWidthBudget), preferredBudget))
}

export const createBalancedTableColumnWidths = (columnCount: number, totalWidth: number) => {
  if (columnCount <= 0) return []

  const safeTotalWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX * columnCount, Math.round(totalWidth))
  const baseColumnWidth = Math.max(
    TABLE_MIN_COLUMN_WIDTH_PX,
    Math.floor(safeTotalWidth / columnCount)
  )
  const lastColumnWidth = safeTotalWidth - baseColumnWidth * (columnCount - 1)

  return Array.from({ length: columnCount }, (_, columnIndex) =>
    columnIndex === columnCount - 1
      ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, lastColumnWidth)
      : baseColumnWidth
  )
}

const promoteTableBlockToWideOverflowMode = (
  tableNode: JSONContent,
  readableWidthBudget: number
): JSONContent => {
  if (tableNode.type !== "table") return tableNode
  if (getTableOverflowMode(tableNode) === TABLE_OVERFLOW_MODE_WIDE) return tableNode

  const rows = Array.isArray(tableNode.content) ? tableNode.content : []
  const columnCount = readSimpleTableColumnCount(tableNode)
  if (!shouldPromoteWideTableOverflowMode(columnCount, readableWidthBudget)) return tableNode

  const nextColumnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    let nextWidth = TABLE_WIDE_COLUMN_MIN_WIDTH_PX
    rows.forEach((row) => {
      const cell = Array.isArray(row.content) ? row.content[columnIndex] : null
      const widthValue = Array.isArray(cell?.attrs?.colwidth) ? cell?.attrs?.colwidth[0] : null
      if (typeof widthValue === "number" && Number.isFinite(widthValue) && widthValue > 0) {
        nextWidth = Math.max(nextWidth, Math.round(widthValue))
      }
    })
    return nextWidth
  })

  let changed = false
  const nextRows = rows.map((row) => {
    if (!Array.isArray(row.content)) return row

    let rowChanged = false
    const nextCells = row.content.map((cell, columnIndex) => {
      if (cell?.type !== "tableCell" && cell?.type !== "tableHeader") return cell

      const nextWidth = nextColumnWidths[columnIndex]
      const currentWidth = Array.isArray(cell.attrs?.colwidth) ? cell.attrs?.colwidth[0] : null
      if (currentWidth === nextWidth) return cell

      rowChanged = true
      changed = true
      return {
        ...cell,
        attrs: {
          ...(cell.attrs || {}),
          colwidth: [nextWidth],
        },
      }
    })

    return rowChanged ? { ...row, content: nextCells } : row
  })

  return {
    ...tableNode,
    attrs: {
      ...(tableNode.attrs || {}),
      overflowMode: TABLE_OVERFLOW_MODE_WIDE,
    },
    ...(changed ? { content: nextRows } : {}),
  }
}

export const promotePastedWideTables = (
  doc: BlockEditorDoc,
  readableWidthBudget: number
): BlockEditorDoc => {
  if (!Array.isArray(doc.content) || doc.content.length === 0) return doc

  let changed = false
  const nextContent = doc.content.map((block) => {
    if (!block || block.type !== "table") return block
    const nextBlock = promoteTableBlockToWideOverflowMode(block, readableWidthBudget)
    if (nextBlock !== block) {
      changed = true
    }
    return nextBlock
  })

  return changed ? { ...doc, content: nextContent } : doc
}

export const shrinkTableColumnWidthsToFit = (widths: number[], budget: number) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  let overflow = nextWidths.reduce((sum, width) => sum + width, 0) - budget

  while (overflow > 0) {
    const shrinkableColumns = nextWidths
      .map((width, index) => ({ index, capacity: width - TABLE_MIN_COLUMN_WIDTH_PX, width }))
      .filter((column) => column.capacity > 0)
      .sort((left, right) => right.width - left.width)

    if (shrinkableColumns.length === 0) break

    let changed = false
    const targetShare = Math.max(1, Math.ceil(overflow / shrinkableColumns.length))
    for (const column of shrinkableColumns) {
      if (overflow <= 0) break
      const shrinkBy = Math.min(column.capacity, targetShare, overflow)
      if (shrinkBy <= 0) continue
      nextWidths[column.index] -= shrinkBy
      overflow -= shrinkBy
      changed = true
    }

    if (!changed) break
  }

  return nextWidths
}

export const expandTableColumnWidthsToFit = (widths: number[], budget: number) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  let remaining = Math.max(0, budget - nextWidths.reduce((sum, width) => sum + width, 0))

  while (remaining > 0) {
    const targetShare = Math.max(1, Math.floor(remaining / nextWidths.length) || 1)
    nextWidths.forEach((_, index) => {
      if (remaining <= 0) return
      const addBy = index === nextWidths.length - 1 ? remaining : Math.min(targetShare, remaining)
      nextWidths[index] += addBy
      remaining -= addBy
    })
  }

  return nextWidths
}

export const isLegacyCollapsedTableWidthState = (widths: number[]) => {
  if (widths.length <= 1) return false
  return widths.every((width) => width <= TABLE_MIN_COLUMN_WIDTH_PX + 2)
}

export const isLegacyFullWidthInitializedTableState = (
  widths: number[],
  readableWidthBudget: number
) => {
  if (widths.length <= 1) return false

  const totalWidth = widths.reduce((sum, width) => sum + width, 0)
  const maxBudget = Math.max(TABLE_MIN_COLUMN_WIDTH_PX * widths.length, Math.round(readableWidthBudget))
  const preferredWidth = getPreferredNormalTableTotalWidth(widths.length, maxBudget)
  if (totalWidth <= preferredWidth + widths.length * 2) return false
  if (Math.abs(totalWidth - maxBudget) > widths.length * 4) return false

  const minWidth = Math.min(...widths)
  const maxWidth = Math.max(...widths)
  return maxWidth - minWidth <= 2
}

export const computeNextTableColumnWidthsForResize = (
  widths: number[],
  activeColumnIndex: number,
  deltaPx: number,
  shouldClampToBudget: boolean,
  overflowMode: string,
  budget: number
) => {
  const nextWidths = widths.map((width) => Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(width)))
  const activeIndex = Math.max(0, Math.min(activeColumnIndex, nextWidths.length - 1))
  if (!nextWidths.length) {
    return {
      widths: nextWidths,
      wasClamped: false,
    }
  }

  const proposedWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, Math.round(nextWidths[activeIndex] + deltaPx))
  if (!shouldClampToBudget || overflowMode === TABLE_OVERFLOW_MODE_WIDE) {
    nextWidths[activeIndex] = proposedWidth
    return {
      widths: nextWidths,
      wasClamped: false,
    }
  }

  const minBudget = TABLE_MIN_COLUMN_WIDTH_PX * nextWidths.length
  const safeBudget = Math.max(minBudget, Math.round(budget))
  const otherColumnsWidth = nextWidths.reduce(
    (sum, width, index) => (index === activeIndex ? sum : sum + width),
    0
  )
  const maxActiveWidth = Math.max(TABLE_MIN_COLUMN_WIDTH_PX, safeBudget - otherColumnsWidth)
  const nextActiveWidth = Math.min(proposedWidth, maxActiveWidth)
  nextWidths[activeIndex] = nextActiveWidth
  return {
    widths: nextWidths,
    wasClamped: proposedWidth >= maxActiveWidth,
  }
}

export const didTableColumnResizeHitOverflowPolicy = (
  requestedDeltaPx: number,
  resizeResult: { appliedDelta?: number; wasClamped?: boolean } | null | undefined
) => {
  if (requestedDeltaPx <= 0) return false
  if (!resizeResult) return false
  if (resizeResult.wasClamped) return true
  const appliedDelta = typeof resizeResult.appliedDelta === "number" ? resizeResult.appliedDelta : requestedDeltaPx
  return requestedDeltaPx - appliedDelta >= 2
}
