export const TABLE_MIN_COLUMN_WIDTH_PX = 120
export const TABLE_MIN_ROW_HEIGHT_PX = 44

export type MarkdownTableLayout = {
  columnWidths?: Array<number | null>
  rowHeights?: Array<number | null>
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

export const normalizeMarkdownTableLayout = (
  layout?: MarkdownTableLayout | null
): MarkdownTableLayout | null => {
  if (!layout) return null

  const columnWidths = normalizeTableMetricList(layout.columnWidths, TABLE_MIN_COLUMN_WIDTH_PX)
  const rowHeights = normalizeTableMetricList(layout.rowHeights, TABLE_MIN_ROW_HEIGHT_PX)

  if (!columnWidths && !rowHeights) return null

  return {
    ...(columnWidths ? { columnWidths } : {}),
    ...(rowHeights ? { rowHeights } : {}),
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
