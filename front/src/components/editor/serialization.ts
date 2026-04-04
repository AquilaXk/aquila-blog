import type { JSONContent } from "@tiptap/core"
import type { CalloutKind } from "src/libs/markdown/rendering"
import {
  clampImageWidthPx,
  normalizeImageAlign,
  parseStandaloneMarkdownImageLine,
  serializeStandaloneMarkdownImageLine,
} from "src/libs/markdown/rendering"
import {
  parseMarkdownTableLayoutComment,
  serializeMarkdownTableLayoutComment,
  TABLE_MIN_COLUMN_WIDTH_PX,
  TABLE_MIN_ROW_HEIGHT_PX,
  type MarkdownTableCellAlignment,
  type MarkdownTableCellLayout,
  type MarkdownTableLayout,
} from "src/libs/markdown/tableMetadata"
import { normalizeInlineColorToken } from "src/libs/markdown/inlineColor"

export type BlockEditorDoc = JSONContent

export type ImageBlockAttrs = {
  src: string
  alt?: string
  title?: string
  widthPx?: number | null
  align?: "left" | "center" | "wide" | "full"
}

export type MermaidBlockAttrs = {
  source: string
}

export type CalloutBlockAttrs = {
  kind: CalloutKind
  title: string
  label?: string | null
}

export type CalloutBlockInput = CalloutBlockAttrs & {
  body?: string
  content?: JSONContent[]
}

export type ToggleBlockAttrs = {
  title: string
  body: string
}

export type ChecklistBlockItem = {
  checked: boolean
  text: string
}

export type ChecklistBlockAttrs = {
  items: ChecklistBlockItem[]
}

export type BookmarkBlockAttrs = {
  url: string
  title: string
  description?: string
  siteName?: string
  provider?: string
  thumbnailUrl?: string
}

export type EmbedBlockAttrs = {
  url: string
  title: string
  caption?: string
  siteName?: string
  provider?: string
  thumbnailUrl?: string
  embedUrl?: string
}

export type FileBlockAttrs = {
  url: string
  name: string
  description?: string
  mimeType?: string
  sizeBytes?: number | null
}

export type FormulaBlockAttrs = {
  formula: string
}

export type InlineFormulaAttrs = {
  formula: string
}

export type RawMarkdownBlockPayload = {
  markdown: string
  reason: string
}

export type UnsupportedBlock = RawMarkdownBlockPayload

type EditorTextMark = {
  type: string
  attrs?: Record<string, string>
}

type EditorTextNode = {
  type: "text"
  text: string
  marks?: EditorTextMark[]
}

const EMPTY_DOC: BlockEditorDoc = {
  type: "doc",
  content: [{ type: "paragraph" }],
}

const CALL_OUT_KIND_MAP: Record<string, CalloutKind> = {
  TIP: "tip",
  INFO: "info",
  NOTE: "info",
  WARNING: "warning",
  CAUTION: "warning",
  OUTLINE: "outline",
  EXAMPLE: "example",
  SUMMARY: "summary",
  IMPORTANT: "summary",
}

const CALL_OUT_KIND_LABELS: Record<CalloutKind, string> = {
  tip: "TIP",
  info: "INFO",
  warning: "WARNING",
  outline: "OUTLINE",
  example: "EXAMPLE",
  summary: "SUMMARY",
}

const CUSTOM_DIRECTIVE_PATTERN =
  /^:::(bookmark|embed|file)(?:\s+(\S+))?\s*$/i
const CARD_METADATA_COMMENT_PATTERN =
  /^\s*<!--\s*aq-(bookmark|embed|file)\s+(\{[\s\S]*\})\s*-->\s*$/

const FORMULA_BLOCK_START_PATTERN = /^\s*\$\$\s*$/
const SINGLE_LINE_FORMULA_BLOCK_PATTERN = /^\s*\$\$\s*(.+?)\s*\$\$\s*$/

const isBlankLine = (line: string) => line.trim().length === 0

const isFenceStart = (line: string) => {
  const trimmed = line.trim()
  const match = trimmed.match(/^([`~]{3,})(.*)$/)
  if (!match) return null

  const fence = match[1]
  const marker = fence[0]
  const info = (match[2] || "").trim()

  return {
    fence,
    marker,
    info,
  }
}

const isFenceEnd = (line: string, marker: string, length: number) =>
  new RegExp(`^\\s*${marker}{${length},}\\s*$`).test(line)

const isDividerLine = (line: string) => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)

const isHeadingLine = (line: string) => {
  const match = line.match(/^(#{1,6})\s+(.*)$/)
  if (!match) return null
  return { level: match[1].length, text: match[2].trim() }
}

const isBulletListItem = (line: string) => {
  const match = line.match(/^\s*[-*+]\s+(.*)$/)
  return match ? match[1] : null
}

const isTaskListItem = (line: string) => {
  const match = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/)
  if (!match) return null

  return {
    checked: match[1].toLowerCase() === "x",
    text: match[2],
  }
}

const isOrderedListItem = (line: string) => {
  const match = line.match(/^\s*(\d+)\.\s+(.*)$/)
  return match
    ? {
        order: Number.parseInt(match[1], 10) || 1,
        text: match[2],
      }
    : null
}

const isBlockquoteLine = (line: string) => {
  const match = line.match(/^\s*>\s?(.*)$/)
  return match ? match[1] : null
}

const parseToggleStart = (line: string) => {
  const match = line.trim().match(/^:::toggle(?:\s+(.*))?$/i)
  if (!match) return null
  return {
    title: (match[1] || "").trim(),
  }
}

const parseCalloutStart = (line: string) => {
  const match = line.match(/^\s*>\s?(.*)$/)
  if (!match) return null

  const header = (match[1] || "").trim().match(/^\[!([A-Za-z]+)\](?:\s*(.*))?$/)
  if (!header) return null

  const rawLabel = (header[1] || "").toUpperCase()
  const kind = CALL_OUT_KIND_MAP[rawLabel] || "info"

  return {
    kind,
    title: (header[2] || "").trim(),
    label: CALL_OUT_KIND_MAP[rawLabel] ? null : rawLabel,
  }
}

const parseAsideStart = (line: string) => line.match(/^\s*<aside(?:\s+[^>]*)?>(.*)$/i)

const parseSingleLineFormulaBlock = (line: string) => {
  const match = line.match(SINGLE_LINE_FORMULA_BLOCK_PATTERN)
  if (!match) return null
  const formula = (match[1] || "").trim()
  return formula ? { formula } : null
}

const isTableSeparatorLine = (line: string) =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

const isLikelyTableRow = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

const splitTableCells = (line: string) => {
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

const hasTableAlignmentMarker = (line: string) =>
  splitTableCells(line).some((cell) => {
    const compact = cell.replace(/\s+/g, "")
    return /^:?-{3,}:?$/.test(compact) && (compact.startsWith(":") || compact.endsWith(":"))
  })

const parseTableAlignments = (
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

const normalizeTableRows = (rows: string[][]) => {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0)
  if (columnCount === 0) return rows

  return rows.map((row) => {
    if (row.length >= columnCount) return row
    return [...row, ...Array.from({ length: columnCount - row.length }, () => "")]
  })
}

const buildTextNode = (text: string, marks?: EditorTextMark[]): EditorTextNode => ({
  type: "text",
  text,
  ...(marks && marks.length > 0 ? { marks } : {}),
})

const pushPlainText = (nodes: JSONContent[], text: string) => {
  if (!text) return
  nodes.push(buildTextNode(text))
}

const appendMarkToInlineTextNodes = (nodes: JSONContent[], mark: EditorTextMark) =>
  nodes.map((node) => {
    if (node.type !== "text") return node

    const marks = Array.isArray(node.marks) ? [...node.marks, mark] : [mark]
    return {
      ...node,
      marks,
    }
  })

const sanitizeCardMetadata = (
  kind: "bookmark" | "embed" | "file",
  payload: unknown
): Partial<BookmarkBlockAttrs & EmbedBlockAttrs & FileBlockAttrs> => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {}

  const source = payload as Record<string, unknown>
  if (kind === "file") {
    const mimeType = typeof source.mimeType === "string" ? source.mimeType.trim() : ""
    const sizeBytes = typeof source.sizeBytes === "number" && Number.isFinite(source.sizeBytes)
      ? Math.max(0, Math.round(source.sizeBytes))
      : null

    return {
      ...(mimeType ? { mimeType } : {}),
      ...(sizeBytes !== null ? { sizeBytes } : {}),
    }
  }

  const siteName = typeof source.siteName === "string" ? source.siteName.trim() : ""
  const provider = typeof source.provider === "string" ? source.provider.trim() : ""
  const thumbnailUrl = typeof source.thumbnailUrl === "string" ? source.thumbnailUrl.trim() : ""
  const embedUrl = kind === "embed" && typeof source.embedUrl === "string" ? source.embedUrl.trim() : ""

  return {
    ...(siteName ? { siteName } : {}),
    ...(provider ? { provider } : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(embedUrl ? { embedUrl } : {}),
  }
}

const parseCardMetadataComment = (line: string) => {
  const match = line.match(CARD_METADATA_COMMENT_PATTERN)
  if (!match) return null

  try {
    const kind = match[1].toLowerCase() as "bookmark" | "embed" | "file"
    const payload = JSON.parse(match[2])
    return {
      kind,
      attrs: sanitizeCardMetadata(kind, payload),
    }
  } catch {
    return null
  }
}

const buildInlineFormulaNode = (formula: string): JSONContent => ({
  type: "inlineFormula",
  attrs: {
    formula: formula.trim(),
  },
})

const matchInlineFormula = (value: string) => {
  if (!value.startsWith("$") || value.startsWith("$$")) return null
  const match = value.match(/^\$((?:\\\$|[^$\n])+?)\$/)
  if (!match) return null

  const formula = String(match[1] || "").trim()
  return formula ? { full: match[0], formula } : null
}

const findNextInlinePatternStart = (value: string) => {
  const candidates = [
    value.indexOf("{{"),
    value.indexOf("["),
    value.indexOf("**"),
    value.indexOf("~~"),
    value.indexOf("`"),
    value.indexOf("$"),
    value.indexOf("*"),
  ].filter((index) => index >= 0)

  if (candidates.length === 0) return -1
  return Math.min(...candidates)
}

const buildInlineContent = (text: string): JSONContent[] => {
  if (!text) return []

  const nodes: JSONContent[] = []
  let index = 0

  while (index < text.length) {
    const nextPatterns = [
      {
        name: "inlineColor",
        match: text.slice(index).match(/^\{\{\s*color\s*:\s*([^|{}]+?)\s*\|\s*([^{}]+?)\s*\}\}/),
      },
      {
        name: "link",
        match: text.slice(index).match(/^\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/),
      },
      {
        name: "bold",
        match: text.slice(index).match(/^\*\*([^*]+)\*\*/),
      },
      {
        name: "strike",
        match: text.slice(index).match(/^~~([^~]+)~~/),
      },
      {
        name: "code",
        match: text.slice(index).match(/^`([^`]+)`/),
      },
      {
        name: "inlineFormula",
        match: (() => {
          const formulaMatch = matchInlineFormula(text.slice(index))
          if (!formulaMatch) return null
          return Object.assign([formulaMatch.full, formulaMatch.formula], {
            index: 0,
            input: text.slice(index),
          }) as RegExpMatchArray
        })(),
      },
      {
        name: "italic",
        match: text.slice(index).match(/^\*([^*]+)\*/),
      },
    ].filter((entry) => entry.match)

    if (nextPatterns.length === 0) {
      const remaining = text.slice(index)
      const nextPatternStart = findNextInlinePatternStart(remaining)
      if (nextPatternStart < 0) {
        pushPlainText(nodes, remaining)
        break
      }
      if (nextPatternStart === 0) {
        pushPlainText(nodes, remaining[0] || "")
        index += 1
        continue
      }
      pushPlainText(nodes, remaining.slice(0, nextPatternStart))
      index += nextPatternStart
      continue
    }

    const nextPattern = nextPatterns.reduce((prev, current) => {
      if (!prev.match) return current
      if (!current.match) return prev
      return current.match.index === 0 ? current : prev
    })

    if (!nextPattern.match) {
      pushPlainText(nodes, text.slice(index))
      break
    }

    if (nextPattern.match.index && nextPattern.match.index > 0) {
      pushPlainText(nodes, text.slice(index, index + nextPattern.match.index))
      index += nextPattern.match.index
      continue
    }

    const [full, first, second] = nextPattern.match

    if (nextPattern.name === "inlineColor") {
      const normalizedColor = normalizeInlineColorToken(first)
      if (!normalizedColor || !second?.trim()) {
        pushPlainText(nodes, full)
      } else {
        nodes.push(
          ...appendMarkToInlineTextNodes(buildInlineContent(second), {
            type: "inlineColor",
            attrs: {
              color: normalizedColor,
            },
          })
        )
      }
    } else if (nextPattern.name === "link") {
      nodes.push(
        ...appendMarkToInlineTextNodes(buildInlineContent(first), {
          type: "link",
          attrs: {
            href: second,
          },
        })
      )
    } else if (nextPattern.name === "bold") {
      nodes.push(buildTextNode(first, [{ type: "bold" }]))
    } else if (nextPattern.name === "italic") {
      nodes.push(buildTextNode(first, [{ type: "italic" }]))
    } else if (nextPattern.name === "strike") {
      nodes.push(buildTextNode(first, [{ type: "strike" }]))
    } else if (nextPattern.name === "code") {
      nodes.push(buildTextNode(first, [{ type: "code" }]))
    } else if (nextPattern.name === "inlineFormula") {
      nodes.push(buildInlineFormulaNode(first))
    }

    index += full.length
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text }]
}

export const createParagraphNode = (text = ""): JSONContent => ({
  type: "paragraph",
  content: buildInlineContent(text),
})

const promoteCalloutTitle = (headerTitle: string, bodyLines: string[]) => {
  if (headerTitle) {
    return {
      title: headerTitle,
      bodyLines,
    }
  }

  const firstBodyLineIndex = bodyLines.findIndex((line) => line.trim().length > 0)
  if (firstBodyLineIndex < 0) {
    return {
      title: "",
      bodyLines,
    }
  }

  const originalLine = bodyLines[firstBodyLineIndex]
  const trimmedLine = originalLine.trim()
  const headingMatch = trimmedLine.match(/^#{1,6}\s+(.+)$/)
  if (headingMatch) {
    return {
      title: (headingMatch[1] || "").trim(),
      bodyLines: bodyLines.filter((_, index) => index !== firstBodyLineIndex),
    }
  }

  const boldMatch = trimmedLine.match(/^(?:[-*+]\s+)?(?:\*\*(.+?)\*\*|__(.+?)__)(.*)$/)
  const promotedTitle = (boldMatch?.[1] || boldMatch?.[2] || "").trim()
  if (!promotedTitle) {
    return {
      title: "",
      bodyLines,
    }
  }

  const remainingLine = (boldMatch?.[3] || "").trim()

  return {
    title: promotedTitle,
    bodyLines: remainingLine
      ? bodyLines.map((line, index) => (index === firstBodyLineIndex ? remainingLine : line))
      : bodyLines.filter((_, index) => index !== firstBodyLineIndex),
  }
}

const collectParagraphLines = (lines: string[], startIndex: number) => {
  const collected: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    const nextLine = lines[index + 1]

    if (isBlankLine(line)) break
    if (collected.length > 0 && isSupportedBlockStart(line, nextLine)) break
    collected.push(line.trim())
    index += 1
  }

  return {
    text: collected.join(" ").replace(/\s+/g, " ").trim(),
    nextIndex: index,
  }
}

export const createRawBlockNode = (markdown: string, reason: string): JSONContent => ({
  type: "rawMarkdownBlock",
  attrs: {
    markdown,
    reason,
  },
})

export const createListNode = (
  type: "bulletList" | "orderedList",
  items: string[],
  start?: number
): JSONContent => ({
  type,
  ...(type === "orderedList" && start && start > 1 ? { attrs: { start } } : {}),
  content: items.map((item) => ({
    type: "listItem",
    content: [createParagraphNode(item.trim())],
  })),
})

export const createHeadingNode = (level: number, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: buildInlineContent(text),
})

export const createBlockquoteNode = (text: string): JSONContent => ({
  type: "blockquote",
  content: [createParagraphNode(text)],
})

export const createCodeBlockNode = (language: string | null, code: string): JSONContent => ({
  type: "codeBlock",
  attrs: {
    language: language?.trim() || null,
  },
  content: code ? [{ type: "text", text: code }] : [],
})

export const createHorizontalRuleNode = (): JSONContent => ({
  type: "horizontalRule",
})

export const createBulletListNode = (items: string[]) => createListNode("bulletList", items)

export const createOrderedListNode = (items: string[], start = 1) => createListNode("orderedList", items, start)

export const createEmptyTableRows = (rowCount = 2, columnCount = 2): string[][] =>
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
            content: [createParagraphNode(cell)],
          },
        ]
      }),
    })),
  }
}

export const createEmptyTableNode = (
  rowCount = 2,
  columnCount = 2,
  layout?: MarkdownTableLayout | null
): JSONContent => createTableNode(createEmptyTableRows(rowCount, columnCount), layout)

export const createMermaidNode = (source: string): JSONContent => ({
  type: "mermaidBlock",
  attrs: {
    source,
  },
})

const createCalloutBodyContent = (body: string): JSONContent[] => {
  const normalized = body.replace(/\r\n?/g, "\n").trim()
  if (!normalized) return [createParagraphNode("")]

  const parsed = parseMarkdownToEditorDoc(normalized)
  const blocks = Array.isArray(parsed.content) ? parsed.content.filter(Boolean) : []
  return blocks.length > 0 ? blocks : [createParagraphNode("")]
}

export const createCalloutNode = (input: CalloutBlockInput): JSONContent => {
  const { body = "", content, ...attrs } = input
  const normalizedContent =
    Array.isArray(content) && content.length > 0 ? content : createCalloutBodyContent(body)

  return {
    type: "calloutBlock",
    attrs,
    content: normalizedContent,
  }
}

export const createToggleNode = (attrs: ToggleBlockAttrs): JSONContent => ({
  type: "toggleBlock",
  attrs,
})

export const createTaskListNode = (items: ChecklistBlockItem[]): JSONContent => ({
  type: "taskList",
  content: items.map((item) => ({
    type: "taskItem",
    attrs: {
      checked: item.checked === true,
    },
    content: [createParagraphNode(String(item.text || "").trim())],
  })),
})

// legacy helper 이름은 유지하되, 현재 문서 모델은 taskList/taskItem을 사용한다.
export const createChecklistNode = (items: ChecklistBlockItem[]): JSONContent => createTaskListNode(items)

export const createBookmarkNode = (attrs: BookmarkBlockAttrs): JSONContent => ({
  type: "bookmarkBlock",
  attrs,
})

export const createEmbedNode = (attrs: EmbedBlockAttrs): JSONContent => ({
  type: "embedBlock",
  attrs,
})

export const createFileBlockNode = (attrs: FileBlockAttrs): JSONContent => ({
  type: "fileBlock",
  attrs,
})

export const createFormulaNode = (attrs: FormulaBlockAttrs): JSONContent => ({
  type: "formulaBlock",
  attrs,
})

export const createInlineFormulaNode = (attrs: InlineFormulaAttrs): JSONContent => ({
  type: "inlineFormula",
  attrs,
})

const isSupportedBlockStart = (line: string, nextLine?: string) =>
  isBlankLine(line) ||
  Boolean(isFenceStart(line)) ||
  Boolean(isHeadingLine(line)) ||
  isDividerLine(line) ||
  Boolean(parseStandaloneMarkdownImageLine(line)) ||
  Boolean(isTaskListItem(line)) ||
  Boolean(isBulletListItem(line)) ||
  Boolean(isOrderedListItem(line)) ||
  Boolean(isBlockquoteLine(line)) ||
  (isLikelyTableRow(line) && Boolean(nextLine && isTableSeparatorLine(nextLine))) ||
  Boolean(parseToggleStart(line)) ||
  Boolean(parseCalloutStart(line)) ||
  Boolean(parseAsideStart(line)) ||
  Boolean(parseCardMetadataComment(line)) ||
  Boolean(line.trim().match(CUSTOM_DIRECTIVE_PATTERN)) ||
  Boolean(parseSingleLineFormulaBlock(line)) ||
  FORMULA_BLOCK_START_PATTERN.test(line.trim())

export const parseMarkdownToEditorDoc = (markdown: string): BlockEditorDoc => {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n").trim()
  if (!normalizedMarkdown) return EMPTY_DOC

  const lines = normalizedMarkdown.split("\n")
  const content: JSONContent[] = []
  let index = 0
  let pendingDirectiveMetadata:
    | {
        kind: "bookmark" | "embed" | "file"
        attrs: Partial<BookmarkBlockAttrs & EmbedBlockAttrs & FileBlockAttrs>
      }
    | null = null

  while (index < lines.length) {
    const line = lines[index]
    const nextLine = lines[index + 1]
    const tableLayout = parseMarkdownTableLayoutComment(line)
    const directiveMetadataComment = parseCardMetadataComment(line)
    const singleLineFormula = parseSingleLineFormulaBlock(line)

    if (isBlankLine(line)) {
      pendingDirectiveMetadata = null
      index += 1
      continue
    }

    if (directiveMetadataComment) {
      pendingDirectiveMetadata = directiveMetadataComment
      index += 1
      continue
    }

    if (singleLineFormula) {
      pendingDirectiveMetadata = null
      content.push(
        createFormulaNode({
          formula: singleLineFormula.formula,
        })
      )
      index += 1
      continue
    }

    const fence = isFenceStart(line)
    if (fence) {
      pendingDirectiveMetadata = null
      const collected = [line]
      let pointer = index + 1
      let closed = false

      while (pointer < lines.length) {
        collected.push(lines[pointer])
        if (isFenceEnd(lines[pointer], fence.marker, fence.fence.length)) {
          pointer += 1
          closed = true
          break
        }
        pointer += 1
      }

      const markdownBlock = collected.join("\n")
      const language = fence.info.split(/\s+/)[0]?.trim() || ""

      if (language.toLowerCase() === "mermaid") {
        if (!closed) {
          content.push(createRawBlockNode(markdownBlock, "unsupported-mermaid"))
        } else {
          const source = collected.slice(1, -1).join("\n").trim()
          content.push(createMermaidNode(source))
        }
      } else if (!closed) {
        content.push(createRawBlockNode(markdownBlock, "manual-raw"))
      } else {
        const codeContent = collected.slice(1, -1).join("\n")
        content.push(createCodeBlockNode(language || null, codeContent))
      }

      index = pointer
      continue
    }

    const toggleStart = parseToggleStart(line)
    if (toggleStart) {
      pendingDirectiveMetadata = null
      const collected = [line]
      const bodyLines: string[] = []
      let pointer = index + 1
      let closed = false

      while (pointer < lines.length) {
        const current = lines[pointer]
        collected.push(current)
        if (current.trim() === ":::") {
          closed = true
          pointer += 1
          break
        }
        bodyLines.push(current)
        pointer += 1
      }

      if (!closed && bodyLines.every((bodyLine) => bodyLine.trim().length === 0)) {
        content.push(
          createToggleNode({
            title: toggleStart.title,
            body: "",
          })
        )
      } else if (!closed) {
        content.push(createRawBlockNode(collected.join("\n"), "unsupported-toggle"))
      } else {
        content.push(
          createToggleNode({
            title: toggleStart.title,
            body: bodyLines.join("\n").trim(),
          })
        )
      }

      index = pointer
      continue
    }

    const asideStart = parseAsideStart(line)
    if (asideStart) {
      pendingDirectiveMetadata = null
      const collected = [line]
      const bodyLines: string[] = []
      let pointer = index + 1
      let closed = false

      const appendAsideContent = (value: string) => {
        if (value.length === 0) return
        bodyLines.push(value)
      }

      const openingTail = asideStart[1] || ""
      if (openingTail.includes("</aside>")) {
        appendAsideContent(openingTail.replace(/<\/aside>\s*$/i, "").trimEnd())
        closed = true
      } else {
        appendAsideContent(openingTail)
      }

      while (!closed && pointer < lines.length) {
        const current = lines[pointer]
        collected.push(current)

        if (/<\/aside>\s*$/i.test(current)) {
          appendAsideContent(current.replace(/<\/aside>\s*$/i, "").trimEnd())
          pointer += 1
          closed = true
          break
        }

        bodyLines.push(current)
        pointer += 1
      }

      if (!closed) {
        content.push(createRawBlockNode(collected.join("\n"), "manual-raw"))
        index = pointer
        continue
      }

      const normalizedBodyLines = bodyLines.map((bodyLine) => bodyLine.trim())
      const firstContentIndex = normalizedBodyLines.findIndex((bodyLine) => bodyLine.length > 0)
      const header =
        firstContentIndex >= 0
          ? normalizedBodyLines[firstContentIndex].match(/^\[!([A-Za-z]+)\](?:\s*(.*))?$/)
          : null

      if (header) {
        const rawLabel = (header[1] || "").toUpperCase()
        const kind = CALL_OUT_KIND_MAP[rawLabel] || "info"
        const promoted = promoteCalloutTitle((header[2] || "").trim(), normalizedBodyLines.slice(firstContentIndex + 1))
        content.push(
          createCalloutNode({
            kind,
            title: promoted.title,
            body: promoted.bodyLines.join("\n").trim(),
            ...(CALL_OUT_KIND_MAP[rawLabel] ? {} : { label: rawLabel }),
          })
        )
      } else {
        content.push(
          createCalloutNode({
            kind: "info",
            title: "",
            body: normalizedBodyLines.join("\n").trim(),
          })
        )
      }

      index = pointer
      continue
    }

    const customDirectiveMatch = line.trim().match(CUSTOM_DIRECTIVE_PATTERN)
    if (customDirectiveMatch) {
      const directive = customDirectiveMatch[1]?.toLowerCase()
      const headerValue = (customDirectiveMatch[2] || "").trim()
      const bodyLines: string[] = []
      let pointer = index + 1
      let closed = false

      while (pointer < lines.length) {
        const current = lines[pointer]
        if (current.trim() === ":::") {
          closed = true
          pointer += 1
          break
        }
        bodyLines.push(current)
        pointer += 1
      }

      if (!closed && bodyLines.every((bodyLine) => bodyLine.trim().length === 0)) {
        const directiveMetadata =
          pendingDirectiveMetadata?.kind === directive
            ? pendingDirectiveMetadata.attrs
            : {}
        pendingDirectiveMetadata = null

        if (directive === "bookmark") {
          content.push(
            createBookmarkNode({
              url: headerValue,
              title: "북마크",
              description: "",
              ...directiveMetadata,
            })
          )
        } else if (directive === "embed") {
          content.push(
            createEmbedNode({
              url: headerValue,
              title: "임베드",
              caption: "",
              ...directiveMetadata,
            })
          )
        } else if (directive === "file") {
          content.push(
            createFileBlockNode({
              url: headerValue,
              name: "파일",
              description: "",
              ...directiveMetadata,
            })
          )
        }

        index = pointer
        continue
      }

      if (!closed) {
        const fallbackMarkdown = lines.slice(index, pointer).join("\n")
        content.push(createRawBlockNode(fallbackMarkdown, "manual-raw"))
        index = pointer
        continue
      }

      const normalizedBodyLines = bodyLines.map((bodyLine) => bodyLine.trimEnd())
      const [firstLine = "", ...restLines] = normalizedBodyLines
      const secondaryText = restLines.join("\n").trim()
      const directiveMetadata =
        pendingDirectiveMetadata?.kind === directive
          ? pendingDirectiveMetadata.attrs
          : {}
      pendingDirectiveMetadata = null

      if (directive === "bookmark") {
        content.push(
          createBookmarkNode({
            url: headerValue,
            title: firstLine.trim() || "북마크",
            description: secondaryText,
            ...directiveMetadata,
          })
        )
      } else if (directive === "embed") {
        content.push(
          createEmbedNode({
            url: headerValue,
            title: firstLine.trim() || "임베드",
            caption: secondaryText,
            ...directiveMetadata,
          })
        )
      } else if (directive === "file") {
        content.push(
          createFileBlockNode({
            url: headerValue,
            name: firstLine.trim() || "파일",
            description: secondaryText,
            ...directiveMetadata,
          })
        )
      }

      index = pointer
      continue
    }

    if (FORMULA_BLOCK_START_PATTERN.test(line.trim())) {
      pendingDirectiveMetadata = null
      const bodyLines: string[] = []
      let pointer = index + 1
      let closed = false

      while (pointer < lines.length) {
        if (FORMULA_BLOCK_START_PATTERN.test(lines[pointer].trim())) {
          closed = true
          pointer += 1
          break
        }
        bodyLines.push(lines[pointer])
        pointer += 1
      }

      if (!closed) {
        content.push(createRawBlockNode(lines.slice(index, pointer).join("\n"), "manual-raw"))
      } else {
        content.push(
          createFormulaNode({
            formula: bodyLines.join("\n").trim(),
          })
        )
      }

      index = pointer
      continue
    }

    const calloutStart = parseCalloutStart(line)
    if (calloutStart) {
      pendingDirectiveMetadata = null
      const collected = [line]
      const bodyLines: string[] = []
      let pointer = index + 1

      while (pointer < lines.length) {
        const current = lines[pointer]
        if (isBlankLine(current)) {
          collected.push(current)
          bodyLines.push("")
          pointer += 1
          continue
        }

        const blockquoteText = isBlockquoteLine(current)
        if (blockquoteText === null) break
        collected.push(current)
        bodyLines.push(blockquoteText)
        pointer += 1
      }

      const promoted = promoteCalloutTitle(calloutStart.title, bodyLines)
      content.push(
        createCalloutNode({
          kind: calloutStart.kind,
          title: promoted.title,
          body: promoted.bodyLines.join("\n").trim(),
          ...(calloutStart.label ? { label: calloutStart.label } : {}),
        })
      )
      index = pointer
      continue
    }

    if (isDividerLine(line)) {
      pendingDirectiveMetadata = null
      content.push(createHorizontalRuleNode())
      index += 1
      continue
    }

    const image = parseStandaloneMarkdownImageLine(line)
    if (image) {
      pendingDirectiveMetadata = null
      content.push({
        type: "resizableImage",
        attrs: {
          src: image.src,
          alt: image.alt || "",
          title: image.title || "",
          widthPx: image.widthPx ?? null,
          align: image.align || "center",
        },
      })
      index += 1
      continue
    }

    const heading = isHeadingLine(line)
    if (heading) {
      pendingDirectiveMetadata = null
      content.push(createHeadingNode(heading.level, heading.text))
      index += 1
      continue
    }

    const tableStartLine =
      tableLayout && isLikelyTableRow(nextLine || "") && isTableSeparatorLine(lines[index + 2] || "")
        ? nextLine || ""
        : line
    const tableSeparatorLine =
      tableLayout && isLikelyTableRow(nextLine || "") && isTableSeparatorLine(lines[index + 2] || "")
        ? lines[index + 2]
        : nextLine
    const tableStartIndex =
      tableLayout && tableStartLine === nextLine ? index + 1 : index

    if (isLikelyTableRow(tableStartLine) && tableSeparatorLine && isTableSeparatorLine(tableSeparatorLine)) {
      pendingDirectiveMetadata = null
      const rows: string[][] = [splitTableCells(tableStartLine)]
      let pointer = tableStartIndex + 2

      while (pointer < lines.length && isLikelyTableRow(lines[pointer])) {
        rows.push(splitTableCells(lines[pointer]))
        pointer += 1
      }

      const layoutWithAlignment: MarkdownTableLayout | null =
        hasTableAlignmentMarker(tableSeparatorLine)
          ? {
              ...(tableLayout || {}),
              columnAlignments: parseTableAlignments(tableSeparatorLine),
            }
          : tableLayout

      content.push(createTableNode(rows, layoutWithAlignment))
      index = pointer
      continue
    }

    const taskListItem = isTaskListItem(line)
    if (taskListItem) {
      pendingDirectiveMetadata = null
      const items: ChecklistBlockItem[] = []
      let pointer = index

      while (pointer < lines.length) {
        const item = isTaskListItem(lines[pointer])
        if (!item) break
        items.push(item)
        pointer += 1
      }

      content.push(createChecklistNode(items))
      index = pointer
      continue
    }

    const bulletItem = isBulletListItem(line)
    if (bulletItem !== null) {
      pendingDirectiveMetadata = null
      const items: string[] = []
      let pointer = index
      while (pointer < lines.length) {
        const itemText = isBulletListItem(lines[pointer])
        if (itemText === null) break
        items.push(itemText)
        pointer += 1
      }
      content.push(createBulletListNode(items))
      index = pointer
      continue
    }

    const orderedItem = isOrderedListItem(line)
    if (orderedItem) {
      pendingDirectiveMetadata = null
      const items: string[] = []
      const start = orderedItem.order
      let pointer = index
      while (pointer < lines.length) {
        const item = isOrderedListItem(lines[pointer])
        if (!item) break
        items.push(item.text)
        pointer += 1
      }
      content.push(createOrderedListNode(items, start))
      index = pointer
      continue
    }

    const quoteLine = isBlockquoteLine(line)
    if (quoteLine !== null) {
      pendingDirectiveMetadata = null
      const items: string[] = []
      let pointer = index
      while (pointer < lines.length) {
        const blockquoteText = isBlockquoteLine(lines[pointer])
        if (blockquoteText === null) break
        items.push(blockquoteText)
        pointer += 1
      }
      content.push(createBlockquoteNode(items.join(" ").replace(/\s+/g, " ").trim()))
      index = pointer
      continue
    }

    const paragraph = collectParagraphLines(lines, index)
    pendingDirectiveMetadata = null
    content.push(createParagraphNode(paragraph.text))
    index = paragraph.nextIndex
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  }
}

const escapePipeText = (text: string) => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")

const serializeTextNode = (node: JSONContent) => {
  if (node.type !== "text") return ""
  const rawText = node.text || ""
  const marks = node.marks || []
  const linkMark = marks.find((mark) => mark.type === "link" && mark.attrs?.href)
  const inlineColorMark = marks.find((mark) => mark.type === "inlineColor" && mark.attrs?.color)
  const otherMarks = marks.filter((mark) => mark !== linkMark && mark !== inlineColorMark)

  let text = rawText

  for (const mark of otherMarks) {
    if (mark.type === "bold") text = `**${text}**`
    if (mark.type === "italic") text = `*${text}*`
    if (mark.type === "strike") text = `~~${text}~~`
    if (mark.type === "code") text = `\`${text}\``
  }

  const normalizedColor = inlineColorMark?.attrs?.color
    ? normalizeInlineColorToken(String(inlineColorMark.attrs.color))
    : null

  if (normalizedColor) {
    text = `{{color:${normalizedColor}|${text}}}`
  }

  if (linkMark?.attrs?.href) {
    return `[${text}](${linkMark.attrs.href})`
  }

  return text
}

const serializeInlineFormulaNode = (node: JSONContent) => {
  const formula = String(node.attrs?.formula || "").trim()
  return formula ? `$${formula}$` : ""
}

const serializeInlineContent = (content?: JSONContent[]) =>
  (content || []).map((node) => serializeNode(node)).join("")

const serializeParagraphLikeNode = (node: JSONContent) => {
  if (!node.content || node.content.length === 0) return ""
  return serializeInlineContent(node.content)
}

const serializeList = (node: JSONContent) => {
  const items = node.content || []
  const orderedStart =
    node.type === "orderedList" ? Number.parseInt(String(node.attrs?.start || 1), 10) || 1 : 1

  return items
    .map((item, index) => {
      const paragraph = item.content?.[0]
      const text = serializeParagraphLikeNode(paragraph || { type: "paragraph", content: [] })
      return node.type === "orderedList" ? `${orderedStart + index}. ${text}` : `- ${text}`
    })
    .join("\n")
}

const serializeTaskList = (node: JSONContent) =>
  (node.content || [])
    .map((item) => {
      const paragraph = item.content?.find((child) => child.type === "paragraph")
      const text = serializeParagraphLikeNode(paragraph || { type: "paragraph", content: [] })
      return `- [${item.attrs?.checked ? "x" : " "}] ${text}`.trimEnd()
    })
    .join("\n")

const serializeChecklistBlock = (attrs: Partial<ChecklistBlockAttrs>) =>
  (attrs.items || [])
    .map((item) => `- [${item.checked ? "x" : " "}] ${String(item.text || "").trim()}`)
    .join("\n")

type TableMatrixEntry = {
  node: JSONContent
  hidden: boolean
  rowIndex: number
  columnIndex: number
}

const buildTableMatrix = (rows: JSONContent[]) => {
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

const serializeTableAlignments = (columnAlignments: Array<MarkdownTableCellAlignment | null>) =>
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

const serializeTable = (node: JSONContent) => {
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
    headerRow,
    headerColumn,
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

const serializeCalloutBlock = (node: JSONContent) => {
  const attrs = (node.attrs || {}) as Partial<CalloutBlockAttrs & { body?: string }>
  const kind = attrs.label?.trim() || (attrs.kind ? CALL_OUT_KIND_LABELS[attrs.kind] : "TIP")
  const title = String(attrs.title || "").trim()
  const header = title ? `> [!${kind}] ${title}` : `> [!${kind}]`
  const serializedBody = (() => {
    const bodyContent = Array.isArray(node.content) ? node.content : []
    if (bodyContent.length > 0) {
      return bodyContent.map((child) => serializeNode(child)).filter(Boolean).join("\n\n").trim()
    }
    return String(attrs.body || "").replace(/\r\n?/g, "\n").trim()
  })()
  const normalizedBodyLines = serializedBody ? serializedBody.split("\n") : []

  return [header, ...normalizedBodyLines.map((line) => (line ? `> ${line}` : ">"))].join("\n")
}

const serializeToggleBlock = (attrs: Partial<ToggleBlockAttrs>) => {
  const title = String(attrs.title || "").trim()
  const body = String(attrs.body || "").trim()
  return [`:::toggle ${title}`.trimEnd(), body, ":::"].filter(Boolean).join("\n")
}

const serializeMermaidBlock = (attrs: Partial<MermaidBlockAttrs>) => {
  const source = String(attrs.source || "").trim()
  return ["```mermaid", source, "```"].join("\n")
}

const serializeDirectiveBlock = (
  name: "bookmark" | "embed" | "file",
  attrs: Partial<BookmarkBlockAttrs & EmbedBlockAttrs & FileBlockAttrs>,
  url: string,
  primaryText: string,
  secondaryText?: string
) => {
  const metadata =
    name === "file"
      ? {
          ...(attrs.mimeType ? { mimeType: attrs.mimeType } : {}),
          ...(typeof attrs.sizeBytes === "number" && Number.isFinite(attrs.sizeBytes)
            ? { sizeBytes: Math.max(0, Math.round(attrs.sizeBytes)) }
            : {}),
        }
      : {
          ...(attrs.siteName ? { siteName: attrs.siteName } : {}),
          ...(attrs.provider ? { provider: attrs.provider } : {}),
          ...(attrs.thumbnailUrl ? { thumbnailUrl: attrs.thumbnailUrl } : {}),
          ...(name === "embed" && attrs.embedUrl ? { embedUrl: attrs.embedUrl } : {}),
        }

  const metadataComment =
    Object.keys(metadata).length > 0 ? `<!-- aq-${name} ${JSON.stringify(metadata)} -->` : ""
  const directiveBody = [`:::${name} ${url}`.trimEnd(), primaryText, secondaryText || "", ":::"]
    .filter((line, index) => index === 0 || line.trim().length > 0 || index === 3)
    .join("\n")

  return metadataComment ? `${metadataComment}\n${directiveBody}` : directiveBody
}

const serializeFormulaBlock = (attrs: Partial<FormulaBlockAttrs>) => {
  const formula = String(attrs.formula || "").trim()
  return ["$$", formula, "$$"].join("\n")
}

export const serializeNode = (node: JSONContent): string => {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((child) => serializeNode(child)).filter(Boolean).join("\n\n")
    case "paragraph":
      return serializeParagraphLikeNode(node)
    case "text":
      return serializeTextNode(node)
    case "inlineFormula":
      return serializeInlineFormulaNode(node)
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level || 1))} ${serializeParagraphLikeNode(node)}`
    case "bulletList":
    case "orderedList":
      return serializeList(node)
    case "taskList":
      return serializeTaskList(node)
    case "checklistBlock":
      return serializeChecklistBlock(node.attrs as ChecklistBlockAttrs)
    case "blockquote": {
      const content = (node.content || []).map((child) => serializeNode(child)).join("\n")
      return content
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    }
    case "codeBlock": {
      const language = (node.attrs?.language as string | null | undefined)?.trim() || ""
      const content = (node.content || []).map((child) => serializeNode(child)).join("")
      return `\`\`\`${language}\n${content}\n\`\`\``
    }
    case "horizontalRule":
      return "---"
    case "table":
      return serializeTable(node)
    case "resizableImage":
    case "image":
      return serializeStandaloneMarkdownImageLine({
        alt: String(node.attrs?.alt || ""),
        src: String(node.attrs?.src || ""),
        title: String(node.attrs?.title || ""),
        widthPx: node.attrs?.widthPx ? clampImageWidthPx(Number(node.attrs.widthPx)) : undefined,
        align: normalizeImageAlign(String(node.attrs?.align || "")),
      })
    case "mermaidBlock":
      return serializeMermaidBlock(node.attrs as MermaidBlockAttrs)
    case "calloutBlock":
      return serializeCalloutBlock(node)
    case "toggleBlock":
      return serializeToggleBlock(node.attrs as ToggleBlockAttrs)
    case "bookmarkBlock":
      return serializeDirectiveBlock(
        "bookmark",
        node.attrs as BookmarkBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.title || ""),
        String(node.attrs?.description || "")
      )
    case "embedBlock":
      return serializeDirectiveBlock(
        "embed",
        node.attrs as EmbedBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.title || ""),
        String(node.attrs?.caption || "")
      )
    case "fileBlock":
      return serializeDirectiveBlock(
        "file",
        node.attrs as FileBlockAttrs,
        String(node.attrs?.url || ""),
        String(node.attrs?.name || ""),
        String(node.attrs?.description || "")
      )
    case "formulaBlock":
      return serializeFormulaBlock(node.attrs as FormulaBlockAttrs)
    case "rawMarkdownBlock":
      return String(node.attrs?.markdown || "")
    default:
      return ""
  }
}

export const serializeEditorDocToMarkdown = (doc: BlockEditorDoc) => {
  const serialized = serializeNode(doc)
  return serialized.replace(/\n{3,}/g, "\n\n").trim()
}

export const detectUnsupportedMarkdownBlocks = (markdown: string): UnsupportedBlock[] => {
  const doc = parseMarkdownToEditorDoc(markdown)
  const unsupported: UnsupportedBlock[] = []

  const visit = (node?: JSONContent) => {
    if (!node) return
    if (node.type === "rawMarkdownBlock") {
      unsupported.push({
        markdown: String(node.attrs?.markdown || ""),
        reason: String(node.attrs?.reason || "unsupported"),
      })
    }
    for (const child of node.content || []) visit(child)
  }

  visit(doc)
  return unsupported
}
