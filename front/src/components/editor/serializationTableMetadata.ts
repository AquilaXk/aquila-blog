
import type { JSONContent } from "@tiptap/core"
import { normalizeLegacyInlineHtmlSpans } from "src/libs/markdown/inlineHtmlNormalization"
import {
  parseMarkdownTableLayoutComment,
  serializeMarkdownTableLayoutComment,
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  type MarkdownTableCellAlignment,
  type MarkdownTableCellLayout,
  type MarkdownTableLayout,
} from "src/libs/markdown/tableMetadata"
import { createParagraphNode } from "./serializationNodeFactory"
import { serializeParagraphLikeNode } from "./serializationInlineNormalization"
import {
  DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
  DEFAULT_EMPTY_TABLE_ROW_COUNT,
} from "./serializationTypes"

export { parseMarkdownTableLayoutComment }

export const isTableSeparatorLine = (line: string) =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

export const isLikelyTableRow = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

export const splitTableCells = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  const cells: string[] = []
  let current = ""
  let escaped = false

  for (const character of trimmed) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }

    if (character === "\\") {
      escaped = true
      continue
    }

    if (character === "|") {
      cells.push(current.trim())
      current = ""
      continue
    }

    current += character
  }

  if (escaped) {
    current += "\\"
  }

  cells.push(current.trim())
  return cells
}

export const hasTableAlignmentMarker = (line: string) =>
  splitTableCells(line).some((cell) => {
    const compact = cell.replace(/\s+/g, "")
    return /^:?-{3,}:?$/.test(compact) && (compact.startsWith(":") || compact.endsWith(":"))
  })

export const parseTableAlignments = (
  line: string
): Array<MarkdownTableCellAlignment | null> =>
  splitTableCells(line).map((cell) => {
    const compact = cell.replace(/\s+/g, "")
    if (!/^:?-{3,}:?$/.test(compact)) return null
    if (compact.startsWith(":") && compact.endsWith(":")) return "center"
    if (compact.endsWith(":")) return "right"
    if (compact.startsWith(":")) return "left"
    return null
  })

export const normalizeTableRows = (rows: string[][]) => {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (columnCount === 0) return rows

  return rows.map((row) => {
    if (row.length >= columnCount) return row
    return [...row, ...Array.from({ length: columnCount - row.length }, () => "")]
  })
}

export const createEmptyTableRows = (
  rowCount = DEFAULT_EMPTY_TABLE_ROW_COUNT,
  columnCount = DEFAULT_EMPTY_TABLE_COLUMN_COUNT
): string[][] =>
  Array.from({ length: Math.max(1, rowCount) }, () =>
    Array.from({ length: Math.max(1, columnCount) }, () => "")
  )

export const createTableNode = (
  rows: string[][],
  layout?: MarkdownTableLayout | null
): JSONContent => {
  const normalizedRows = normalizeTableRows(rows)
  const rowCount = normalizedRows.length
  const columnCount = normalizedRows.reduce((max, row) => Math.max(max, row.length), 0)
  const headerRowEnabled = layout?.headerRow !== false
  const headerColumnEnabled = layout?.headerColumn === true
  const columnWidths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = layout?.columnWidths?.[columnIndex]
    return typeof width === "number" && Number.isFinite(width) && width > 0
      ? Math.max(TABLE_MIN_COLUMN_WIDTH_PX, width)
      : null
  })
  const rowHeights = Array.from({ length: rowCount }, (_, rowIndex) => {
    const rowHeightPx = layout?.rowHeights?.[rowIndex]
    return typeof rowHeightPx === "number" && Number.isFinite(rowHeightPx) && rowHeightPx > 0
      ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx)
      : null
  })
  const columnAlignments = Array.from({ length: columnCount }, (_, columnIndex) => {
    const align = layout?.columnAlignments?.[columnIndex]
    return align === "left" || align === "center" || align === "right" ? align : null
  })
  const cellLayouts = Array.from({ length: rowCount }, (_, rowIndex) =>
    Array.from({ length: columnCount }, (_, columnIndex) => layout?.cells?.[rowIndex]?.[columnIndex] || null)
  )

  const buildCellAttrs = (
    rowIndex: number,
    columnIndex: number
  ) => {
    const width = columnWidths[columnIndex]
    const cellLayout = cellLayouts[rowIndex]?.[columnIndex] || null
    const align = cellLayout?.align || columnAlignments[columnIndex] || null
    const backgroundColor = cellLayout?.backgroundColor || null
    const colspan = cellLayout?.colspan
    const rowspan = cellLayout?.rowspan

    const attrs: Record<string, unknown> = {}
    if (width) {
      attrs.colwidth = [Math.max(TABLE_MIN_COLUMN_WIDTH_PX, width)]
    }
    if (align) {
      attrs.textAlign = align
    }
    if (backgroundColor) {
      attrs.backgroundColor = backgroundColor
    }
    if (colspan && colspan > 1) {
      attrs.colspan = colspan
    }
    if (rowspan && rowspan > 1) {
      attrs.rowspan = rowspan
    }

    return Object.keys(attrs).length > 0 ? attrs : undefined
  }

  const buildRowAttrs = (rowIndex: number) => {
    const rowHeightPx = rowHeights[rowIndex]
    if (!rowHeightPx) return undefined

    return {
      rowHeightPx: Math.max(TABLE_MIN_ROW_HEIGHT_PX, rowHeightPx),
    }
  }

  return {
    type: "table",
    ...(layout?.overflowMode ? { attrs: { overflowMode: layout.overflowMode } } : {}),
    content: normalizedRows.map((row, rowIndex) => ({
      type: "tableRow",
      ...(buildRowAttrs(rowIndex) ? { attrs: buildRowAttrs(rowIndex) } : {}),
      content: row.flatMap((cell, columnIndex) => {
        const cellLayout = cellLayouts[rowIndex]?.[columnIndex] || null
        if (cellLayout?.hidden) return []

        const defaultIsHeaderCell =
          (headerRowEnabled && rowIndex === 0) || (headerColumnEnabled && columnIndex === 0)
        const isHeaderCell =
          typeof cellLayout?.header === "boolean" ? cellLayout.header : defaultIsHeaderCell
        const cellType = isHeaderCell ? "tableHeader" : "tableCell"
        return [
          {
            type: cellType,
            ...(buildCellAttrs(rowIndex, columnIndex) ? { attrs: buildCellAttrs(rowIndex, columnIndex) } : {}),
            content: [createParagraphNode(normalizeLegacyInlineHtmlSpans(cell))],
          },
        ]
      }),
    })),
  }
}

export const createEmptyTableNode = (
  rowCount = DEFAULT_EMPTY_TABLE_ROW_COUNT,
  columnCount = DEFAULT_EMPTY_TABLE_COLUMN_COUNT,
  layout?: MarkdownTableLayout | null
): JSONContent => createTableNode(createEmptyTableRows(rowCount, columnCount), layout)

export const escapePipeText = (text: string) => text.replace(/\|/g, "\\|")

type TableMatrixEntry = {
  node: JSONContent
  hidden: boolean
  rowIndex: number
  columnIndex: number
}

export const buildTableMatrix = (rows: JSONContent[]) => {
  const matrix: Array<Array<TableMatrixEntry | null>> = []
  let columnCount = 0

  rows.forEach((row, rowIndex) => {
    matrix[rowIndex] ||= []
    let columnCursor = 0

    for (const cell of row.content || []) {
      while (matrix[rowIndex][columnCursor]) {
        columnCursor += 1
      }

      const colspan = Math.max(1, Number.parseInt(String(cell.attrs?.colspan || 1), 10) || 1)
      const rowspan = Math.max(1, Number.parseInt(String(cell.attrs?.rowspan || 1), 10) || 1)

      for (let rowOffset = 0; rowOffset < rowspan; rowOffset += 1) {
        const targetRowIndex = rowIndex + rowOffset
        matrix[targetRowIndex] ||= []
        for (let columnOffset = 0; columnOffset < colspan; columnOffset += 1) {
          const targetColumnIndex = columnCursor + columnOffset
          matrix[targetRowIndex][targetColumnIndex] = {
            node: cell,
            hidden: rowOffset > 0 || columnOffset > 0,
            rowIndex: targetRowIndex,
            columnIndex: targetColumnIndex,
          }
          columnCount = Math.max(columnCount, targetColumnIndex + 1)
        }
      }

      columnCursor += colspan
    }
  })

  const normalizedMatrix = matrix.map((row) =>
    Array.from({ length: columnCount }, (_, columnIndex) => row[columnIndex] || null)
  )

  return {
    matrix: normalizedMatrix,
    columnCount,
  }
}

export const serializeTableAlignments = (columnAlignments: Array<MarkdownTableCellAlignment | null>) =>
  columnAlignments.map((alignment) => {
    switch (alignment) {
      case "left":
        return ":---"
      case "center":
        return ":---:"
      case "right":
        return "---:"
      default:
        return "---"
    }
  })

export const serializeTable = (node: JSONContent) => {
  const rows = node.content || []
  if (rows.length === 0) return ""

  const { matrix, columnCount } = buildTableMatrix(rows)
  if (columnCount === 0 || matrix.length === 0) return ""
  const headerRow =
    matrix[0]?.some((entry) => Boolean(entry && !entry.hidden)) === true &&
    matrix[0].every((entry) => !entry || entry.hidden || entry.node.type === "tableHeader")
  const headerColumn =
    matrix.length > 0 &&
    matrix.every((row) => {
      const firstVisibleEntry = row.find((entry) => entry && !entry.hidden) || null
      return !firstVisibleEntry || firstVisibleEntry.node.type === "tableHeader"
    })

  const cellLayouts: Array<Array<MarkdownTableCellLayout | null>> = matrix.map((row) =>
    row.map((entry) => {
      if (!entry) return null
      if (entry.hidden) return { hidden: true }

      const align =
        entry.node.attrs?.textAlign === "left" ||
        entry.node.attrs?.textAlign === "center" ||
        entry.node.attrs?.textAlign === "right"
          ? (entry.node.attrs.textAlign as MarkdownTableCellAlignment)
          : null
      const backgroundColor =
        typeof entry.node.attrs?.backgroundColor === "string"
          ? String(entry.node.attrs.backgroundColor)
          : null
      const isHeaderCell = entry.node.type === "tableHeader"
      const defaultIsHeaderCell =
        (headerRow && entry.rowIndex === 0) || (headerColumn && entry.columnIndex === 0)
      const header = isHeaderCell === defaultIsHeaderCell ? undefined : isHeaderCell
      const colspan = Math.max(1, Number.parseInt(String(entry.node.attrs?.colspan || 1), 10) || 1)
      const rowspan = Math.max(1, Number.parseInt(String(entry.node.attrs?.rowspan || 1), 10) || 1)

      if (!align && !backgroundColor && header === undefined && colspan === 1 && rowspan === 1) {
        return null
      }

      return {
        ...(align ? { align } : {}),
        ...(backgroundColor ? { backgroundColor } : {}),
        ...(header !== undefined ? { header } : {}),
        ...(colspan > 1 ? { colspan } : {}),
        ...(rowspan > 1 ? { rowspan } : {}),
      }
    })
  )

  const columnAlignments = Array.from({ length: columnCount }, (_, columnIndex) => {
    for (const row of cellLayouts) {
      const cellLayout = row[columnIndex]
      if (cellLayout?.align) return cellLayout.align
    }
    return null
  })

  const layout: MarkdownTableLayout = {
    // Keep metadata minimal: omit default header configuration (row=true, column=false)
    ...(headerRow === false ? { headerRow: false } : {}),
    ...(headerColumn === true ? { headerColumn: true } : {}),
    overflowMode:
      node.attrs?.overflowMode === "wide" || node.attrs?.overflowMode === "normal"
        ? node.attrs.overflowMode
        : undefined,
    columnWidths: Array.from({ length: columnCount }, (_, columnIndex) => {
      for (const row of matrix) {
        const entry = row[columnIndex]
        if (!entry || entry.hidden) continue
        const width =
          Array.isArray(entry.node.attrs?.colwidth) && typeof entry.node.attrs.colwidth[0] === "number"
            ? entry.node.attrs.colwidth[0]
            : null
        if (width) {
          return Math.max(TABLE_MIN_COLUMN_WIDTH_PX, width)
        }
      }
      return null
    }),
    rowHeights: rows.map((row) => {
      const height =
        typeof row.attrs?.rowHeightPx === "number"
          ? row.attrs.rowHeightPx
          : Number.parseInt(String(row.attrs?.rowHeightPx || ""), 10)

      return Number.isFinite(height) && height > 0
        ? Math.max(TABLE_MIN_ROW_HEIGHT_PX, height)
        : null
    }),
    columnAlignments,
    cells: cellLayouts,
  }
  const metadataComment = serializeMarkdownTableLayoutComment(layout)
  const serializedRows = normalizeTableRows(
    matrix.map((row) =>
      row.map((entry) =>
        escapePipeText(entry && !entry.hidden ? serializeParagraphLikeNode(entry.node.content?.[0] || entry.node) : "")
      )
    )
  )
  const header = serializedRows[0]
  const separator = serializeTableAlignments(columnAlignments)
  const body = serializedRows.slice(1)

  const markdownTable = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")

  return metadataComment ? `${metadataComment}\n${markdownTable}` : markdownTable
}
