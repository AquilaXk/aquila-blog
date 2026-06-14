export const TABLE_MIN_COLUMN_WIDTH_PX = 44
export const TABLE_MIN_ROW_HEIGHT_PX = 44
export const TABLE_WIDE_COLUMN_MIN_WIDTH_PX = 180
export const TABLE_WIDE_PROMOTION_COLUMN_BUDGET_PX = 180

export type MarkdownTableCellAlignment = "left" | "center" | "right"
export type MarkdownTableOverflowMode = "normal" | "wide"

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
  overflowMode?: MarkdownTableOverflowMode
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
  const overflowMode =
    layout.overflowMode === "wide" || layout.overflowMode === "normal"
      ? layout.overflowMode
      : undefined
  const columnWidths = normalizeTableMetricList(layout.columnWidths, TABLE_MIN_COLUMN_WIDTH_PX)
  const rowHeights = normalizeTableMetricList(layout.rowHeights, TABLE_MIN_ROW_HEIGHT_PX)
  const columnAlignments = normalizeTableAlignmentList(layout.columnAlignments)
  const cells = normalizeTableCellMatrix(layout.cells)

  if (
    headerRow === undefined &&
    headerColumn === undefined &&
    overflowMode === undefined &&
    !columnWidths &&
    !rowHeights &&
    !columnAlignments &&
    !cells
  ) {
    return null
  }

  return {
    ...(headerRow !== undefined ? { headerRow } : {}),
    ...(headerColumn !== undefined ? { headerColumn } : {}),
    ...(overflowMode !== undefined ? { overflowMode } : {}),
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
  layouts: Array<MarkdownTableLayout | null>
}

const isIndentedCodeLine = (line: string) => /^(?: {4}|\t)/.test(line)

const countUnescapedPipeDelimiters = (line: string) => {
  let count = 0

  for (let index = 0; index < line.length; index += 1) {
    if (isUnescapedPipeAt(line, index)) count += 1
  }

  return count
}

const isUnescapedPipeAt = (line: string, index: number) => {
  if (line[index] !== "|") return false

  let slashCount = 0
  for (let slashIndex = index - 1; slashIndex >= 0 && line[slashIndex] === "\\"; slashIndex -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 0
}

const countGfmTableCells = (line: string) => {
  const trimmed = line.trim()
  const delimiterCount = countUnescapedPipeDelimiters(trimmed)
  if (delimiterCount < 1) return 0

  const hasLeadingPipe = isUnescapedPipeAt(trimmed, 0)
  const hasTrailingPipe = isUnescapedPipeAt(trimmed, trimmed.length - 1)
  return delimiterCount + 1 - (hasLeadingPipe ? 1 : 0) - (hasTrailingPipe ? 1 : 0)
}

const isTableSeparatorLine = (line: string) =>
  !isIndentedCodeLine(line) &&
  /^\s*\|?(?:\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?\s*$/.test(line)

const isLikelyTableRow = (line: string) => {
  if (isIndentedCodeLine(line) || countGfmTableCells(line) < 2) return false
  const trimmed = line.trim()
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

const isLikelyGfmTable = (headerLine: string, separatorLine: string) => {
  if (!isLikelyTableRow(headerLine) || !isTableSeparatorLine(separatorLine)) return false
  return countGfmTableCells(headerLine) === countGfmTableCells(separatorLine)
}

export const extractMarkdownTableLayouts = (
  markdown: string
): ExtractedTableLayouts => {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const cleanedLines: string[] = []
  const layouts: Array<MarkdownTableLayout | null> = []
  const tableHeaderLinesWithExplicitLayout = new Set<number>()
  let inFencedCodeBlock = false

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] || ""
    const trimmedLine = line.trim()

    if (/^(```|~~~)/.test(trimmedLine)) {
      inFencedCodeBlock = !inFencedCodeBlock
      cleanedLines.push(line)
      continue
    }

    if (inFencedCodeBlock) {
      cleanedLines.push(line)
      continue
    }

    const layout = parseMarkdownTableLayoutComment(line)

    if (
      layout &&
      isLikelyGfmTable(lines[index + 1] || "", lines[index + 2] || "")
    ) {
      layouts.push(layout)
      tableHeaderLinesWithExplicitLayout.add(index + 1)
      continue
    }

    if (
      !tableHeaderLinesWithExplicitLayout.has(index) &&
      isLikelyGfmTable(line, lines[index + 1] || "")
    ) {
      layouts.push(null)
    }

    cleanedLines.push(line)
  }

  return {
    cleanedMarkdown: cleanedLines.join("\n"),
    layouts,
  }
}
