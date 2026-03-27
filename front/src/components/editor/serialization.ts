import type { JSONContent } from "@tiptap/core"
import {
  clampImageWidthPx,
  normalizeImageAlign,
  parseStandaloneMarkdownImageLine,
  serializeStandaloneMarkdownImageLine,
} from "src/libs/markdown/rendering"

export type BlockEditorDoc = JSONContent

export type ImageBlockAttrs = {
  src: string
  alt?: string
  title?: string
  widthPx?: number | null
  align?: "left" | "center" | "wide" | "full"
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

const isToggleStart = (line: string) => /^:::toggle\b/i.test(line.trim())

const isCalloutStart = (line: string) => /^\s*>\s*\[![A-Z]+\]/.test(line)

const isTableSeparatorLine = (line: string) =>
  /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line)

const isLikelyTableRow = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

const splitTableCells = (line: string) => {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
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

const buildInlineContent = (text: string): JSONContent[] => {
  if (!text) return []

  const nodes: JSONContent[] = []
  let index = 0

  while (index < text.length) {
    const nextPatterns = [
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
        name: "italic",
        match: text.slice(index).match(/^\*([^*]+)\*/),
      },
    ].filter((entry) => entry.match)

    if (nextPatterns.length === 0) {
      pushPlainText(nodes, text.slice(index))
      break
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

    if (nextPattern.name === "link") {
      nodes.push(
        buildTextNode(first, [
          {
            type: "link",
            attrs: {
              href: second,
            },
          },
        ])
      )
    } else if (nextPattern.name === "bold") {
      nodes.push(buildTextNode(first, [{ type: "bold" }]))
    } else if (nextPattern.name === "italic") {
      nodes.push(buildTextNode(first, [{ type: "italic" }]))
    } else if (nextPattern.name === "strike") {
      nodes.push(buildTextNode(first, [{ type: "strike" }]))
    } else if (nextPattern.name === "code") {
      nodes.push(buildTextNode(first, [{ type: "code" }]))
    }

    index += full.length
  }

  return nodes.length > 0 ? nodes : [{ type: "text", text }]
}

const buildParagraphNode = (text: string): JSONContent => ({
  type: "paragraph",
  content: buildInlineContent(text),
})

const collectUntil = (
  lines: string[],
  startIndex: number,
  predicate: (line: string) => boolean
) => {
  const collected: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    collected.push(line)
    index += 1
    if (predicate(line)) break
  }

  return { lines: collected, nextIndex: index }
}

const toRawBlockNode = (markdown: string, reason: string): JSONContent => ({
  type: "rawMarkdownBlock",
  attrs: {
    markdown,
    reason,
  },
})

const isSupportedBlockStart = (line: string, nextLine?: string) =>
  isBlankLine(line) ||
  Boolean(isFenceStart(line)) ||
  Boolean(isHeadingLine(line)) ||
  isDividerLine(line) ||
  Boolean(parseStandaloneMarkdownImageLine(line)) ||
  Boolean(isBulletListItem(line)) ||
  Boolean(isOrderedListItem(line)) ||
  Boolean(isBlockquoteLine(line)) ||
  (isLikelyTableRow(line) && Boolean(nextLine && isTableSeparatorLine(nextLine))) ||
  isToggleStart(line) ||
  isCalloutStart(line)

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

const createListNode = (
  type: "bulletList" | "orderedList",
  items: string[],
  start?: number
): JSONContent => ({
  type,
  ...(type === "orderedList" && start && start > 1 ? { attrs: { start } } : {}),
  content: items.map((item) => ({
    type: "listItem",
    content: [buildParagraphNode(item.trim())],
  })),
})

const createTableNode = (rows: string[][]): JSONContent => {
  const [headerRow, ...bodyRows] = rows

  return {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: headerRow.map((cell) => ({
          type: "tableHeader",
          content: [buildParagraphNode(cell)],
        })),
      },
      ...bodyRows.map((row) => ({
        type: "tableRow",
        content: row.map((cell) => ({
          type: "tableCell",
          content: [buildParagraphNode(cell)],
        })),
      })),
    ],
  }
}

export const parseMarkdownToEditorDoc = (markdown: string): BlockEditorDoc => {
  const normalizedMarkdown = markdown.replace(/\r\n?/g, "\n").trim()
  if (!normalizedMarkdown) return EMPTY_DOC

  const lines = normalizedMarkdown.split("\n")
  const content: JSONContent[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const nextLine = lines[index + 1]

    if (isBlankLine(line)) {
      index += 1
      continue
    }

    const fence = isFenceStart(line)
    if (fence) {
      const collected = [line]
      let pointer = index + 1

      while (pointer < lines.length) {
        collected.push(lines[pointer])
        if (isFenceEnd(lines[pointer], fence.marker, fence.fence.length)) {
          pointer += 1
          break
        }
        pointer += 1
      }

      const markdownBlock = collected.join("\n")
      const language = fence.info.split(/\s+/)[0]?.trim() || ""

      if (language.toLowerCase() === "mermaid") {
        content.push(toRawBlockNode(markdownBlock, "unsupported-mermaid"))
      } else {
        const codeContent = collected.slice(1, -1).join("\n")
        content.push({
          type: "codeBlock",
          attrs: {
            language: language || null,
          },
          content: codeContent ? [{ type: "text", text: codeContent }] : [],
        })
      }

      index = pointer
      continue
    }

    if (isToggleStart(line)) {
      const collected = collectUntil(lines, index, (candidate) => candidate.trim() === ":::")
      content.push(toRawBlockNode(collected.lines.join("\n"), "unsupported-toggle"))
      index = collected.nextIndex
      continue
    }

    if (isCalloutStart(line)) {
      const collected = collectUntil(lines, index, (candidate) => {
        const nextCandidate = lines[lines.indexOf(candidate) + 1]
        return !nextCandidate || (!nextCandidate.trim().startsWith(">") && !isBlankLine(nextCandidate))
      })
      content.push(toRawBlockNode(collected.lines.join("\n"), "unsupported-callout"))
      index = collected.nextIndex
      continue
    }

    if (isDividerLine(line)) {
      content.push({ type: "horizontalRule" })
      index += 1
      continue
    }

    const image = parseStandaloneMarkdownImageLine(line)
    if (image) {
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
      content.push({
        type: "heading",
        attrs: { level: heading.level },
        content: buildInlineContent(heading.text),
      })
      index += 1
      continue
    }

    if (isLikelyTableRow(line) && nextLine && isTableSeparatorLine(nextLine)) {
      const rows: string[][] = [splitTableCells(line)]
      let pointer = index + 2

      while (pointer < lines.length && isLikelyTableRow(lines[pointer])) {
        rows.push(splitTableCells(lines[pointer]))
        pointer += 1
      }

      content.push(createTableNode(rows))
      index = pointer
      continue
    }

    const bulletItem = isBulletListItem(line)
    if (bulletItem !== null) {
      const items: string[] = []
      let pointer = index
      while (pointer < lines.length) {
        const itemText = isBulletListItem(lines[pointer])
        if (itemText === null) break
        items.push(itemText)
        pointer += 1
      }
      content.push(createListNode("bulletList", items))
      index = pointer
      continue
    }

    const orderedItem = isOrderedListItem(line)
    if (orderedItem) {
      const items: string[] = []
      const start = orderedItem.order
      let pointer = index
      while (pointer < lines.length) {
        const item = isOrderedListItem(lines[pointer])
        if (!item) break
        items.push(item.text)
        pointer += 1
      }
      content.push(createListNode("orderedList", items, start))
      index = pointer
      continue
    }

    const quoteLine = isBlockquoteLine(line)
    if (quoteLine !== null) {
      const items: string[] = []
      let pointer = index
      while (pointer < lines.length) {
        const blockquoteText = isBlockquoteLine(lines[pointer])
        if (blockquoteText === null) break
        items.push(blockquoteText)
        pointer += 1
      }
      content.push({
        type: "blockquote",
        content: [buildParagraphNode(items.join(" ").replace(/\s+/g, " ").trim())],
      })
      index = pointer
      continue
    }

    const paragraph = collectParagraphLines(lines, index)
    content.push(buildParagraphNode(paragraph.text))
    index = paragraph.nextIndex
  }

  return {
    type: "doc",
    content: content.length > 0 ? content : [{ type: "paragraph" }],
  }
}

const escapePipeText = (text: string) => text.replace(/\|/g, "\\|")

const serializeTextNode = (node: JSONContent) => {
  if (node.type !== "text") return ""
  const rawText = node.text || ""
  const marks = node.marks || []
  const linkMark = marks.find((mark) => mark.type === "link" && mark.attrs?.href)
  const otherMarks = marks.filter((mark) => mark !== linkMark)

  let text = rawText

  for (const mark of otherMarks) {
    if (mark.type === "bold") text = `**${text}**`
    if (mark.type === "italic") text = `*${text}*`
    if (mark.type === "strike") text = `~~${text}~~`
    if (mark.type === "code") text = `\`${text}\``
  }

  if (linkMark?.attrs?.href) {
    return `[${text}](${linkMark.attrs.href})`
  }

  return text
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

const serializeTable = (node: JSONContent) => {
  const rows = node.content || []
  if (rows.length === 0) return ""

  const serializedRows = rows.map((row) =>
    (row.content || []).map((cell) => serializeParagraphLikeNode(cell.content?.[0] || cell)).map(escapePipeText)
  )
  const header = serializedRows[0]
  const separator = header.map(() => "---")
  const body = serializedRows.slice(1)

  return [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n")
}

export const serializeNode = (node: JSONContent): string => {
  switch (node.type) {
    case "doc":
      return (node.content || []).map((child) => serializeNode(child)).filter(Boolean).join("\n\n")
    case "paragraph":
      return serializeParagraphLikeNode(node)
    case "text":
      return serializeTextNode(node)
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level || 1))} ${serializeParagraphLikeNode(node)}`
    case "bulletList":
    case "orderedList":
      return serializeList(node)
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
