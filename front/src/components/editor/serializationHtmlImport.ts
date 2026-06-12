
import type { JSONContent } from "@tiptap/core"
import { parseStandaloneMarkdownImageLine } from "src/libs/markdown/rendering"
import type { MarkdownTableLayout } from "src/libs/markdown/tableMetadata"
import {
  CALL_OUT_KIND_MAP,
  EMPTY_DOC,
  type BlockEditorDoc,
  type BookmarkBlockAttrs,
  type CalloutBlockInput,
  type EmbedBlockAttrs,
  type FileBlockAttrs,
} from "./serializationTypes"
import {
  createBlockquoteNode,
  createBookmarkNode,
  createCodeBlockNode,
  createEmbedNode,
  createFileBlockNode,
  createFormulaNode,
  createHeadingNode,
  createHorizontalRuleNode,
  createMermaidNode,
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
import {
  CUSTOM_DIRECTIVE_PATTERN,
  FORMULA_BLOCK_START_PATTERN,
  collectParagraphLines,
  isBlankLine,
  isBlockquoteLine,
  isDividerLine,
  isFenceEnd,
  isFenceStart,
  isHeadingLine,
  parseAsideStart,
  parseCalloutStart,
  parseCardMetadataComment,
  parseSingleLineFormulaBlock,
  parseToggleStart,
  promoteCalloutTitle,
} from "./serializationHtmlImportLineParsers"

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

type ParsedMarkdownListLine = {
  indent: number
  kind: "bullet" | "ordered" | "task"
  text: string
  checked?: boolean
  order?: number
}

const getListNodeType = (line: ParsedMarkdownListLine) => {
  if (line.kind === "task") return "taskList"
  if (line.kind === "ordered") return "orderedList"
  return "bulletList"
}

const getListIndent = (rawIndent: string) => rawIndent.replace(/\t/g, "  ").length

const parseMarkdownListLine = (line: string): ParsedMarkdownListLine | null => {
  const task = line.match(/^(\s*)[-*+]\s+\[( |x|X)\]\s+(.*)$/)
  if (task) {
    return {
      indent: getListIndent(task[1] || ""),
      kind: "task",
      checked: (task[2] || "").toLowerCase() === "x",
      text: task[3] || "",
    }
  }

  const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
  if (ordered) {
    return {
      indent: getListIndent(ordered[1] || ""),
      kind: "ordered",
      order: Number.parseInt(ordered[2] || "1", 10) || 1,
      text: ordered[3] || "",
    }
  }

  const bullet = line.match(/^(\s*)[-*+]\s+(.*)$/)
  if (bullet) {
    return {
      indent: getListIndent(bullet[1] || ""),
      kind: "bullet",
      text: bullet[2] || "",
    }
  }

  return null
}

const createListContainer = (line: ParsedMarkdownListLine): JSONContent => {
  const type = getListNodeType(line)
  return {
    type,
    ...(type === "orderedList" && line.order && line.order > 1 ? { attrs: { start: line.order } } : {}),
    content: [],
  }
}

const createListItemFromLine = (line: ParsedMarkdownListLine): JSONContent => ({
  type: line.kind === "task" ? "taskItem" : "listItem",
  ...(line.kind === "task" ? { attrs: { checked: line.checked === true } } : {}),
  content: [createParagraphNode(line.text.trim())],
})

const parseMarkdownListBlock = (
  lines: string[],
  startIndex: number
): { node: JSONContent; nextIndex: number } | null => {
  const firstLine = parseMarkdownListLine(lines[startIndex] || "")
  if (!firstLine) return null

  const parseListAt = (
    index: number,
    expectedType: string,
    expectedIndent: number
  ): { node: JSONContent; nextIndex: number } => {
    const initialLine = parseMarkdownListLine(lines[index] || "") || firstLine
    const node = createListContainer(initialLine)
    let pointer = index

    while (pointer < lines.length) {
      const currentLine = parseMarkdownListLine(lines[pointer] || "")
      if (!currentLine) break
      const currentType = getListNodeType(currentLine)

      if (currentLine.indent < expectedIndent) break
      if (currentLine.indent > expectedIndent) {
        const currentContent = node.content || []
        const lastItem = currentContent[currentContent.length - 1]
        if (!lastItem) break
        const nested = parseListAt(pointer, currentType, currentLine.indent)
        lastItem.content = [...(lastItem.content || []), nested.node]
        pointer = nested.nextIndex
        continue
      }
      if (currentType !== expectedType) break

      node.content = [...(node.content || []), createListItemFromLine(currentLine)]
      pointer += 1
    }

    return { node, nextIndex: pointer }
  }

  return parseListAt(startIndex, getListNodeType(firstLine), firstLine.indent)
}

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

    const markdownList = parseMarkdownListBlock(lines, index)
    if (markdownList) {
      pendingDirectiveMetadata = null
      content.push(markdownList.node)
      index = markdownList.nextIndex
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
