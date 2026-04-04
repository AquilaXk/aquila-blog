export const TABLE_MIN_COLUMN_WIDTH_PX = 44
export const TABLE_MIN_ROW_HEIGHT_PX = 44

export type MarkdownTableCellAlignment = "left" | "center" | "right"

export type MarkdownTableCellLayout = {
  align?: MarkdownTableCellAlignment | null
  backgroundColor?: string | null
  header?: boolean
  colspan?: number | null
  rowspan?: number | null
  hidden?: boolean
}

export type MarkdownTableLayout = {
  headerRow?: boolean
  headerColumn?: boolean
  columnWidths?: Array<number | null>
  rowHeights?: Array<number | null>
  columnAlignments?: Array<MarkdownTableCellAlignment | null>
  cells?: Array<Array<MarkdownTableCellLayout | null>>
}

const TABLE_LAYOUT_COMMENT_PATTERN = /^<!--\s*aq-table\s+(\{.*\})\s*-->$/

const normalizeTableMetricValue = (
  value: unknown,
  minimum: number
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.max(minimum, Math.round(value))
}

const normalizeTableMetricList = (
  values: unknown,
  minimum: number
): Array<number | null> | undefined => {
  if (!Array.isArray(values)) return undefined

  const normalized = values.map((value) => normalizeTableMetricValue(value, minimum))
  let lastMeaningfulIndex = -1

  normalized.forEach((value, index) => {
    if (value !== null) {
      lastMeaningfulIndex = index
    }
  })

  if (lastMeaningfulIndex < 0) return undefined
  return normalized.slice(0, lastMeaningfulIndex + 1)
}

const normalizeTableCellAlignment = (
  value: unknown
): MarkdownTableCellAlignment | null => {
  if (value !== "left" && value !== "center" && value !== "right") return null
  return value
}

const normalizeTableAlignmentList = (
  values: unknown
): Array<MarkdownTableCellAlignment | null> | undefined => {
  if (!Array.isArray(values)) return undefined

  const normalized = values.map((value) => normalizeTableCellAlignment(value))
  let lastMeaningfulIndex = -1

  normalized.forEach((value, index) => {
    if (value !== null) {
      lastMeaningfulIndex = index
    }
  })

  if (lastMeaningfulIndex < 0) return undefined
  return normalized.slice(0, lastMeaningfulIndex + 1)
}

const normalizeBackgroundColor = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized
}

const normalizePositiveInteger = (value: unknown): number | null => {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value || ""), 10)
  if (!Number.isFinite(numericValue) || numericValue < 1) return null
  return Math.max(1, Math.round(numericValue))
}

const normalizeTableCellLayout = (
  value: unknown
): MarkdownTableCellLayout | null => {
  if (!value || typeof value !== "object") return null

  const candidate = value as MarkdownTableCellLayout
  const align = normalizeTableCellAlignment(candidate.align)
  const backgroundColor = normalizeBackgroundColor(candidate.backgroundColor)
  const header =
    typeof candidate.header === "boolean"
      ? candidate.header
      : String((candidate as { header?: unknown }).header || "").trim() === "true"
        ? true
        : String((candidate as { header?: unknown }).header || "").trim() === "false"
          ? false
          : undefined
  const colspan = normalizePositiveInteger(candidate.colspan)
  const rowspan = normalizePositiveInteger(candidate.rowspan)
  const hidden = candidate.hidden === true ? true : undefined

  if (!align && !backgroundColor && header === undefined && !colspan && !rowspan && !hidden) {
    return null
  }

  return {
    ...(align ? { align } : {}),
    ...(backgroundColor ? { backgroundColor } : {}),
    ...(header !== undefined ? { header } : {}),
    ...(colspan && colspan > 1 ? { colspan } : {}),
    ...(rowspan && rowspan > 1 ? { rowspan } : {}),
    ...(hidden ? { hidden: true } : {}),
  }
}

const normalizeTableCellMatrix = (
  value: unknown
): Array<Array<MarkdownTableCellLayout | null>> | undefined => {
  if (!Array.isArray(value)) return undefined

  const normalizedRows = value.map((row) => {
    if (!Array.isArray(row)) return []

    const normalized = row.map((cell) => normalizeTableCellLayout(cell))
    let lastMeaningfulIndex = -1

    normalized.forEach((cell, index) => {
      if (cell) {
        lastMeaningfulIndex = index
      }
    })

    return lastMeaningfulIndex < 0 ? [] : normalized.slice(0, lastMeaningfulIndex + 1)
  })

  let lastMeaningfulRowIndex = -1
  normalizedRows.forEach((row, index) => {
    if (row.length > 0) {
      lastMeaningfulRowIndex = index
    }
  })

  if (lastMeaningfulRowIndex < 0) return undefined
  return normalizedRows.slice(0, lastMeaningfulRowIndex + 1)
}

export const normalizeMarkdownTableLayout = (
  layout?: MarkdownTableLayout | null
): MarkdownTableLayout | null => {
  if (!layout) return null

  const headerRow = typeof layout.headerRow === "boolean" ? layout.headerRow : undefined
  const headerColumn = typeof layout.headerColumn === "boolean" ? layout.headerColumn : undefined
  const columnWidths = normalizeTableMetricList(layout.columnWidths, TABLE_MIN_COLUMN_WIDTH_PX)
  const rowHeights = normalizeTableMetricList(layout.rowHeights, TABLE_MIN_ROW_HEIGHT_PX)
  const columnAlignments = normalizeTableAlignmentList(layout.columnAlignments)
  const cells = normalizeTableCellMatrix(layout.cells)

  if (headerRow === undefined && headerColumn === undefined && !columnWidths && !rowHeights && !columnAlignments && !cells) {
    return null
  }

  return {
    ...(headerRow !== undefined ? { headerRow } : {}),
    ...(headerColumn !== undefined ? { headerColumn } : {}),
    ...(columnWidths ? { columnWidths } : {}),
    ...(rowHeights ? { rowHeights } : {}),
    ...(columnAlignments ? { columnAlignments } : {}),
    ...(cells ? { cells } : {}),
  }
}

export const parseMarkdownTableLayoutComment = (
  line: string
): MarkdownTableLayout | null => {
  const match = line.trim().match(TABLE_LAYOUT_COMMENT_PATTERN)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1] || "{}") as MarkdownTableLayout
    return normalizeMarkdownTableLayout(parsed)
  } catch {
    return null
  }
}

export const serializeMarkdownTableLayoutComment = (
  layout?: MarkdownTableLayout | null
): string => {
  const normalized = normalizeMarkdownTableLayout(layout)
  if (!normalized) return ""
  return `<!-- aq-table ${JSON.stringify(normalized)} -->`
}

type ExtractedTableLayouts = {
  cleanedMarkdown: string
  layouts: MarkdownTableLayout[]
}

const isTableSeparatorLine = (line: string) =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

const isLikelyTableRow = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

export const extractMarkdownTableLayouts = (
  markdown: string
): ExtractedTableLayouts => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const cleanedLines: string[] = []
  const layouts: MarkdownTableLayout[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const layout = parseMarkdownTableLayoutComment(lines[index] || "")

    if (
      layout &&
      isLikelyTableRow(lines[index + 1] || "") &&
      isTableSeparatorLine(lines[index + 2] || "")
    ) {
      layouts.push(layout)
      continue
    }

    cleanedLines.push(lines[index])
  }

  return {
    cleanedMarkdown: cleanedLines.join("\n"),
    layouts,
  }
}
