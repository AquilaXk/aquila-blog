type ConvertHtmlToMarkdownOptions = {
  toggleTitlePlaceholder?: string
  toggleBodyPlaceholder?: string
}

const DEFAULT_TOGGLE_TITLE_PLACEHOLDER = "토글 제목"
const DEFAULT_TOGGLE_BODY_PLACEHOLDER = "내용을 입력하세요."
const TABLE_MIN_COLUMN_WIDTH_PX = 120
const TABLE_MIN_ROW_HEIGHT_PX = 44
const DEFAULT_CALLOUT_TITLE = "참고"
const EMBEDDED_HTML_BLOCK_PATTERN =
  /<aside\b[^>]*>[\s\S]*?<\/aside>|<details\b[^>]*>[\s\S]*?<\/details>|<table\b[^>]*>[\s\S]*?<\/table>|<blockquote\b[^>]*>[\s\S]*?<\/blockquote>|<pre\b[^>]*>[\s\S]*?<\/pre>|<figure\b[^>]*>[\s\S]*?<\/figure>|<iframe\b[^>]*>[\s\S]*?<\/iframe>|<img\b[^>]*\/?>|<hr\b[^>]*\/?>/gi

const escapeMarkdownByPattern = (value: string, pattern: RegExp) => value.replace(pattern, "\\$&")
const escapeTableCell = (value: string) => escapeMarkdownByPattern(value, /[\\|]/g)
const escapeImageAlt = (value: string) => escapeMarkdownByPattern(value, /[\\\]]/g)
const escapeLinkText = (value: string) => escapeMarkdownByPattern(value, /[\\[\]]/g)
const escapeLinkHref = (value: string) => escapeMarkdownByPattern(value, /[\\)]/g)
const escapeLinkTitle = (value: string) => escapeMarkdownByPattern(value, /[\\"]/g)

const normalizeParagraphSpacing = (value: string) =>
  value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

const normalizeClipboardLineEndings = (value: string) => value.replace(/\r\n?/g, "\n")

const normalizeTableMetricValue = (value: unknown, minimum: number): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.max(minimum, Math.round(value))
}

const normalizeTableMetricList = (
  values: Array<number | null> | null,
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

const serializeTableLayoutComment = (layout?: {
  columnWidths?: Array<number | null>
  rowHeights?: Array<number | null>
} | null) => {
  if (!layout) return ""

  const columnWidths = normalizeTableMetricList(layout.columnWidths || null, TABLE_MIN_COLUMN_WIDTH_PX)
  const rowHeights = normalizeTableMetricList(layout.rowHeights || null, TABLE_MIN_ROW_HEIGHT_PX)
  if (!columnWidths && !rowHeights) return ""

  return `<!-- aq-table ${JSON.stringify({
    ...(columnWidths ? { columnWidths } : {}),
    ...(rowHeights ? { rowHeights } : {}),
  })} -->`
}

const isBlockTag = (tag: string) =>
  [
    "article",
    "aside",
    "blockquote",
    "details",
    "div",
    "figure",
    "figcaption",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul",
  ].includes(tag)

const findClosestElement = (node: Node): HTMLElement | null => {
  if (node.nodeType === Node.ELEMENT_NODE) return node as HTMLElement
  if (node.parentElement) return node.parentElement
  return null
}

const hasBlockChildren = (element: HTMLElement) =>
  Array.from(element.children).some((child) => isBlockTag(child.tagName.toLowerCase()))

const serializeImage = (element: HTMLImageElement) => {
  const src = (element.getAttribute("src") || "").trim()
  if (!src) return ""
  const alt = escapeImageAlt((element.getAttribute("alt") || "").trim())
  const title = (element.getAttribute("title") || "").trim()
  const titleSuffix = title ? ` "${escapeLinkTitle(title)}"` : ""
  return `![${alt}](${escapeLinkHref(src)}${titleSuffix})`
}

export const extractPlainTextFromHtml = (html: string) => {
  if (typeof DOMParser === "undefined") return ""
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")
  return doc.body.textContent?.replace(/\r\n?/g, "\n").trim() || ""
}

const normalizeCalloutLines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

const stripLeadingEmojiOnlyLine = (lines: string[]) => {
  const [firstLine, ...rest] = lines
  if (!firstLine) return lines
  const compact = firstLine.replace(/[\s\uFE0F]/g, "")
  if (/^[\p{Extended_Pictographic}]+$/u.test(compact)) {
    return rest
  }
  return lines
}

const isLikelyShortCalloutTitle = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (trimmed.length > 32) return false
  if (/[.!?]$/.test(trimmed)) return false
  if (trimmed.endsWith("다") || trimmed.endsWith("요")) return false
  return true
}

const serializeCalloutMarkdown = (kind: string, title: string, bodyLines: string[]) => {
  const normalizedTitle = title.trim() || DEFAULT_CALLOUT_TITLE
  const normalizedBodyLines = bodyLines.map((line) => line.trim()).filter(Boolean)
  return [
    `> [!${kind}] ${normalizedTitle}`,
    ...normalizedBodyLines.map((line) => `> ${line}`),
  ].join("\n")
}

export const looksLikeStructuredMarkdownDocument = (value: string) => {
  const normalized = normalizeClipboardLineEndings(value).trim()
  if (!normalized) return false

  const structuredPatterns = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*+]\s+\S/m,
    /^\s*\d+\.\s+\S/m,
    /^\s*>\s*(?:\[![A-Za-z]+\]|\S)/m,
    /^```[\w-]*/m,
    /^:::toggle(?:\s+.*)?$/im,
    /^\s*\|.+\|\s*$/m,
    /^<!--\s*aq-table/m,
    /!\[[^\]]*]\([^)]+\)/,
    /<(?:aside|details|table|blockquote|pre|figure|iframe|img|hr)\b/i,
  ]

  return structuredPatterns.some((pattern) => pattern.test(normalized))
}

export const normalizeStructuredMarkdownClipboard = (
  value: string,
  options: ConvertHtmlToMarkdownOptions = {}
) => {
  const normalized = normalizeClipboardLineEndings(value).trim()
  if (!normalized) return ""

  const convertedHtmlBlocks = normalized.replace(EMBEDDED_HTML_BLOCK_PATTERN, (fragment) => {
    const converted = convertHtmlToMarkdown(fragment, options).trim()
    if (!converted) return fragment
    return `\n\n${converted}\n\n`
  })

  return normalizeParagraphSpacing(convertedHtmlBlocks)
}

export const convertHtmlToMarkdown = (
  html: string,
  options: ConvertHtmlToMarkdownOptions = {}
): string => {
  if (typeof DOMParser === "undefined") return ""

  const toggleTitlePlaceholder =
    options.toggleTitlePlaceholder?.trim() || DEFAULT_TOGGLE_TITLE_PLACEHOLDER
  const toggleBodyPlaceholder = options.toggleBodyPlaceholder?.trim() || DEFAULT_TOGGLE_BODY_PLACEHOLDER

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  const nodeText = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
    if (node.nodeType !== Node.ELEMENT_NODE) return ""
    const element = node as HTMLElement
    return Array.from(element.childNodes).map(nodeText).join("")
  }

  const inlineToMarkdown = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
    if (node.nodeType !== Node.ELEMENT_NODE) return ""

    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()
    const inner = Array.from(element.childNodes).map(inlineToMarkdown).join("")

    if (tag === "strong" || tag === "b") return inner ? `**${inner}**` : ""
    if (tag === "em" || tag === "i") return inner ? `*${inner}*` : ""
    if (tag === "s" || tag === "del" || tag === "strike") return inner ? `~~${inner}~~` : ""
    if (tag === "code" && element.parentElement?.tagName.toLowerCase() !== "pre") return inner ? `\`${inner}\`` : ""
    if (tag === "a") {
      const href = (element.getAttribute("href") || "").trim()
      if (!href) return inner
      return `[${escapeLinkText(inner || href)}](${escapeLinkHref(href)})`
    }
    if (tag === "img") return serializeImage(element as HTMLImageElement)
    if (tag === "br") return "\n"

    return inner
  }

  const listToMarkdown = (element: HTMLElement, ordered: boolean): string => {
    const items = Array.from(element.children).filter(
      (child): child is HTMLLIElement => child.tagName.toLowerCase() === "li"
    )

    return items
      .map((item, index) => {
        const directNodes = Array.from(item.childNodes)
        const checkbox = item.querySelector<HTMLInputElement>(":scope > input[type='checkbox']")
        const hasCheckbox = !!checkbox
        const marker = ordered ? `${index + 1}.` : hasCheckbox ? (checkbox?.checked ? "- [x]" : "- [ ]") : "-"
        const inlineNodes = directNodes.filter((node) => {
          const elementNode = findClosestElement(node)
          if (!elementNode) return true
          if (elementNode === checkbox) return false
          return !["ul", "ol"].includes(elementNode.tagName.toLowerCase())
        })
        const inlineContent =
          inlineNodes
            .map((node) => inlineToMarkdown(node))
            .join("")
            .replace(/\n{2,}/g, "\n")
            .trim() || "내용"
        const nestedLists = Array.from(item.children)
          .filter((child) => ["ul", "ol"].includes(child.tagName.toLowerCase()))
          .map((child) =>
            listToMarkdown(child as HTMLElement, child.tagName.toLowerCase() === "ol")
              .split("\n")
              .map((line) => `  ${line}`)
              .join("\n")
          )
          .filter(Boolean)

        return [`${marker} ${inlineContent}`, ...nestedLists].join("\n")
      })
      .join("\n")
  }

  const tableToMarkdown = (element: HTMLTableElement): string => {
    const rows = Array.from(element.querySelectorAll("tr"))
    if (!rows.length) return ""

    const columnWidths = Array.from(element.querySelectorAll("colgroup > col")).map((col) => {
      const colElement = col as HTMLTableColElement
      const width =
        Number.parseInt(colElement.getAttribute("width") || "", 10) ||
        Number.parseInt(colElement.style.width.replace(/px$/, ""), 10)
      return Number.isFinite(width) && width > 0 ? width : null
    })
    const rowHeights = rows.map((row) => {
      const rowElement = row as HTMLTableRowElement
      const explicitHeight =
        Number.parseInt(rowElement.dataset.rowHeight || "", 10) ||
        Number.parseInt(rowElement.style.height.replace(/px$/, ""), 10)
      return Number.isFinite(explicitHeight) && explicitHeight > 0 ? explicitHeight : null
    })
    const matrix = rows.map((row) =>
      Array.from(row.querySelectorAll("th,td")).map((cell) =>
        escapeTableCell(
          Array.from(cell.childNodes)
            .map((node) => inlineToMarkdown(node))
            .join("")
            .replace(/\n+/g, " ")
            .trim()
        )
      )
    )

    const maxCols = Math.max(...matrix.map((row) => row.length))
    const normalized = matrix.map((row) => {
      const copy = [...row]
      while (copy.length < maxCols) copy.push("")
      return copy
    })

    const [head, ...body] = normalized
    const separator = Array.from({ length: maxCols }, () => "---")
    const metadataComment = serializeTableLayoutComment({ columnWidths, rowHeights })
    const markdownTable = [
      `| ${head.join(" | ")} |`,
      `| ${separator.join(" | ")} |`,
      ...body.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n")

    return metadataComment ? `${metadataComment}\n${markdownTable}` : markdownTable
  }

  const blockToMarkdown = (element: HTMLElement): string => {
    const tag = element.tagName.toLowerCase()

    if (tag === "img") return serializeImage(element as HTMLImageElement)
    if (/^h[1-6]$/.test(tag)) {
      const level = Number.parseInt(tag.replace("h", ""), 10)
      return `${"#".repeat(level)} ${Array.from(element.childNodes).map(inlineToMarkdown).join("").trim()}`
    }
    if (tag === "p") return Array.from(element.childNodes).map(inlineToMarkdown).join("").trim()
    if (tag === "hr") return "---"
    if (tag === "blockquote") {
      const content = Array.from(element.childNodes)
        .map((node) => {
          const childElement = findClosestElement(node)
          if (childElement && isBlockTag(childElement.tagName.toLowerCase()) && childElement !== element) {
            return blockToMarkdown(childElement)
          }
          return inlineToMarkdown(node)
        })
        .join("\n")
        .trim()

      return content
        .split("\n")
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join("\n")
    }
    if (tag === "ul") return listToMarkdown(element, false)
    if (tag === "ol") return listToMarkdown(element, true)
    if (tag === "pre") {
      const codeElement = element.querySelector("code")
      const codeText = (codeElement?.textContent || element.textContent || "").trimEnd()
      const className = codeElement?.className || ""
      const language = (className.match(/language-([a-zA-Z0-9_-]+)/)?.[1] || "").trim()
      return `\`\`\`${language}\n${codeText}\n\`\`\``
    }
    if (tag === "table") return tableToMarkdown(element as HTMLTableElement)
    if (tag === "iframe") {
      const src = (element.getAttribute("src") || "").trim()
      const title = element.getAttribute("title")?.trim() || "임베드"
      if (!src) return ""
      return `:::embed ${src}\n${title}\n:::`
    }
    if (tag === "details") {
      const summary = element.querySelector("summary")
      const title = summary?.textContent?.trim() || toggleTitlePlaceholder
      const body = Array.from(element.childNodes)
        .filter((node) => node !== summary)
        .map((node) => {
          const childElement = findClosestElement(node)
          if (childElement && isBlockTag(childElement.tagName.toLowerCase()) && childElement !== element) {
            return blockToMarkdown(childElement)
          }
          return inlineToMarkdown(node)
        })
        .join("\n")
        .trim() || toggleBodyPlaceholder
      return `:::toggle ${title}\n${body}\n:::`
    }
    if (tag === "aside") {
      let calloutLines = normalizeCalloutLines(
        Array.from(element.childNodes)
          .map((node) => {
            const childElement = findClosestElement(node)
            if (childElement && isBlockTag(childElement.tagName.toLowerCase()) && childElement !== element) {
              return blockToMarkdown(childElement)
            }
            return inlineToMarkdown(node)
          })
          .join("\n")
      )
      calloutLines = stripLeadingEmojiOnlyLine(calloutLines)

      let title = DEFAULT_CALLOUT_TITLE
      let bodyLines = calloutLines
      if (calloutLines.length > 1 && isLikelyShortCalloutTitle(calloutLines[0])) {
        title = calloutLines[0]
        bodyLines = calloutLines.slice(1)
      }

      if (bodyLines.length === 0 && calloutLines.length === 1) {
        bodyLines = [calloutLines[0]]
      }

      return serializeCalloutMarkdown("INFO", title, bodyLines)
    }
    if (tag === "figure") {
      const image = element.querySelector("img")
      if (image) return serializeImage(image)
    }

    const classNames = element.className || ""
    const hasToggleClass = /(^|\s)[a-z0-9_-]*toggle[a-z0-9_-]*(\s|$)/i.test(classNames)
    if (hasToggleClass) {
      const title =
        element.querySelector("summary, [class*='toggle-summary'], [class*='summary']")?.textContent?.trim() ||
        toggleTitlePlaceholder
      const body =
        element.querySelector("[class*='toggle-content'], [class*='content']")?.textContent?.trim() ||
        toggleBodyPlaceholder
      return `:::toggle ${title}\n${body}\n:::`
    }

    const hasCalloutHint = element.hasAttribute("data-callout-type") || /(^|\s).*callout.*(\s|$)/i.test(classNames)
    if (hasCalloutHint) {
      const candidateType = (
        element.getAttribute("data-callout-type") ||
        element.getAttribute("data-callout-kind") ||
        "INFO"
      ).toUpperCase()
      const kind = ["TIP", "INFO", "WARNING", "OUTLINE", "EXAMPLE", "SUMMARY"].includes(candidateType)
        ? candidateType
        : "INFO"
      const bodyLines = Array.from(element.childNodes)
        .map((node) => {
          const childElement = findClosestElement(node)
          if (childElement && isBlockTag(childElement.tagName.toLowerCase()) && childElement !== element) {
            return blockToMarkdown(childElement)
          }
          return inlineToMarkdown(node)
        })
        .join("\n")
      const calloutLines = normalizeCalloutLines(bodyLines)
      const [title = DEFAULT_CALLOUT_TITLE, ...body] = calloutLines
      return serializeCalloutMarkdown(kind, title, body)
    }

    if (["div", "section", "article", "main", "aside", "header", "footer", "nav", "figcaption"].includes(tag)) {
      if (!hasBlockChildren(element)) {
        return Array.from(element.childNodes)
          .map((node) => inlineToMarkdown(node))
          .join("")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\s{2,}/g, " ")
          .trim()
      }

      const sections = Array.from(element.childNodes)
        .map((node) => {
          const childElement = findClosestElement(node)
          if (childElement && isBlockTag(childElement.tagName.toLowerCase()) && childElement !== element) {
            return blockToMarkdown(childElement)
          }
          return inlineToMarkdown(node).trim()
        })
        .filter(Boolean)

      return sections.join("\n\n")
    }

    return Array.from(element.childNodes).map((node) => inlineToMarkdown(node)).join("").trim()
  }

  const lines = Array.from(doc.body.childNodes)
    .map((node) => {
      const element = findClosestElement(node)
      if (element && isBlockTag(element.tagName.toLowerCase()) && element.parentElement === doc.body) {
        return blockToMarkdown(element)
      }
      return inlineToMarkdown(node).trim()
    })
    .map((line) => line.trimEnd())
    .filter(Boolean)

  return normalizeParagraphSpacing(lines.join("\n\n"))
}
