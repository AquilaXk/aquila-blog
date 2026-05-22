
import type { JSONContent } from "@tiptap/core"
import { parseStandaloneMarkdownImageLine } from "src/libs/markdown/rendering"
import type { MarkdownTableLayout } from "src/libs/markdown/tableMetadata"
import {
  CALL_OUT_KIND_MAP,
  EMPTY_DOC,
  type BlockEditorDoc,
  type BookmarkBlockAttrs,
  type CalloutBlockInput,
  type ChecklistBlockItem,
  type EmbedBlockAttrs,
  type FileBlockAttrs,
} from "./serializationTypes"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createBulletListNode,
  createChecklistNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createMermaidNode,
  createOrderedListNode,
  createParagraphNode,
  createRawBlockNode,
  createToggleNode,
} from "./serializationNodeFactory"
import {
  createTableNode,
  hasTableAlignmentMarker,
  isLikelyTableRow,
  isTableSeparatorLine,
  parseMarkdownTableLayoutComment,
  parseTableAlignments,
  splitTableCells,
} from "./serializationTableMetadata"

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
