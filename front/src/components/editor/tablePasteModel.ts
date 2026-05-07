const MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN = /^:?-{3,}:?$/
const MARKDOWN_LIST_PREFIX_PATTERN = /^\s*(?:[-+*]|\d+\.)\s+/
const MARKDOWN_BLOCKQUOTE_PREFIX_PATTERN = /^\s*>\s?/

const isMarkdownTableRow = (line: string) => {
  const trimmedLine = line.trim()
  if (!trimmedLine.includes("|")) return false

  const normalizedLine = trimmedLine.startsWith("|") ? trimmedLine.slice(1) : trimmedLine
  const rowWithoutEdgePipes = normalizedLine.endsWith("|") ? normalizedLine.slice(0, -1) : normalizedLine
  return rowWithoutEdgePipes.split("|").length >= 2
}

const normalizeTableContextPasteLine = (line: string) => {
  const trimmedLine = line.trim()
  if (!trimmedLine) return ""

  if (isMarkdownTableRow(trimmedLine)) {
    const cells = trimmedLine
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())
      .filter(Boolean)
      .filter((cell) => !MARKDOWN_TABLE_SEPARATOR_CELL_PATTERN.test(cell))

    return cells.join(" ").trim()
  }

  return trimmedLine
    .replace(MARKDOWN_LIST_PREFIX_PATTERN, "")
    .replace(MARKDOWN_BLOCKQUOTE_PREFIX_PATTERN, "")
    .trim()
}

export const normalizeTableContextPasteText = (...candidates: string[]) => {
  for (const candidate of candidates) {
    if (!candidate.trim()) continue

    const normalized = candidate
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(normalizeTableContextPasteLine)
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    if (normalized) return normalized
  }

  return ""
}
