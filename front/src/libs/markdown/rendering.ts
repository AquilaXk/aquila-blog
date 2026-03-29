import { ReactElement, ReactNode, isValidElement } from "react"
import { extractMarkdownTableLayouts, type MarkdownTableLayout } from "src/libs/markdown/tableMetadata"
import {
  extractNormalizedMermaidSource,
  normalizeEscapedMarkdownFences,
  normalizeEscapedMermaidFences,
} from "src/libs/markdown/mermaid"

export type CalloutKind = "tip" | "info" | "warning" | "outline" | "example" | "summary"

export type MarkdownSegment =
  | { type: "markdown"; content: string }
  | { type: "toggle"; title: string; content: string }
  | { type: "callout"; kind: CalloutKind; title: string; emoji: string; content: string; label?: string }
  | { type: "bookmark"; url: string; title: string; description?: string }
  | { type: "embed"; url: string; title: string; caption?: string }
  | { type: "file"; url: string; name: string; description?: string }
  | { type: "formula"; formula: string }
  | {
      type: "image"
      alt: string
      src: string
      title: string
      widthPx?: number
      align?: "left" | "center" | "wide" | "full"
    }

export type MarkdownRenderModel = {
  normalizedContent: string
  resolvedContentHtml: string
  renderKey: string
  segments: MarkdownSegment[]
  tableLayouts: MarkdownTableLayout[]
}

export const markdownGuide = `### 작성 가이드
- 코드블록: \`\`\`ts
const x = 1
\`\`\`
- 체크리스트:
  - [ ] 할 일
  - [x] 완료한 일
- 글자색: \`{{color:#60a5fa|강조 텍스트}}\`
- 머메이드: \`\`\`mermaid
graph TD
  A[Start] --> B{Check}
\`\`\`
- 토글:
  :::toggle 토글 제목
  접기/펼치기 본문
  :::
- 북마크:
  :::bookmark https://example.com
  링크 제목
  설명
  :::
- 임베드:
  :::embed https://www.youtube.com/watch?v=dQw4w9WgXcQ
  영상 제목
  캡션
  :::
- 파일:
  :::file https://example.com/files/spec.pdf
  spec.pdf
  첨부 설명
  :::
- 수식:
  $$
  E = mc^2
  $$
- 콜아웃:
  > [!TIP]
  > 내용
  또는
  <aside>
  ℹ️
  내용
  </aside>
  허용 이모지 예시: 💡 ✨ / ℹ️ / ⚠️ 🚨 / 📋 📝 / ✅ / 📚 🧾
  지원 타입: TIP, INFO, WARNING, OUTLINE, EXAMPLE, SUMMARY
- 테이블:
  | name | value |
  | --- | --- |
  | a | 1 |`

const CALLOUT_KIND_MAP: Record<string, CalloutKind> = {
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

const CALLOUT_EMOJI_BY_KIND: Record<CalloutKind, string> = {
  tip: "💡",
  info: "ℹ️",
  warning: "⚠️",
  outline: "📋",
  example: "✅",
  summary: "📚",
}

const CALLOUT_EMOJI_MAP: Array<{ marker: string; kind: CalloutKind }> = [
  { marker: "💡", kind: "tip" },
  { marker: "✨", kind: "tip" },
  { marker: "ℹ️", kind: "info" },
  { marker: "ℹ", kind: "info" },
  { marker: "⚠️", kind: "warning" },
  { marker: "⚠", kind: "warning" },
  { marker: "🚨", kind: "warning" },
  { marker: "❗", kind: "warning" },
  { marker: "⛔", kind: "warning" },
  { marker: "📋", kind: "outline" },
  { marker: "📝", kind: "outline" },
  { marker: "📌", kind: "outline" },
  { marker: "🗒️", kind: "outline" },
  { marker: "✅", kind: "example" },
  { marker: "✔️", kind: "example" },
  { marker: "☑️", kind: "example" },
  { marker: "📚", kind: "summary" },
  { marker: "🧾", kind: "summary" },
]

type ParsedCalloutHeader = {
  kind: CalloutKind
  title: string
  emoji: string
  label?: string
}

const LANGUAGE_LABEL_MAP: Record<string, string> = {
  text: "일반 텍스트",
  js: "JavaScript",
  javascript: "JavaScript",
  ts: "TypeScript",
  typescript: "TypeScript",
  tsx: "TSX",
  jsx: "JSX",
  java: "Java",
  kt: "Kotlin",
  kotlin: "Kotlin",
  py: "Python",
  python: "Python",
  sh: "Shell",
  shell: "Shell",
  bash: "Bash",
  md: "Markdown",
  markdown: "Markdown",
  yml: "YAML",
  yaml: "YAML",
  sql: "SQL",
  json: "JSON",
  html: "HTML",
  xml: "XML",
  css: "CSS",
  scss: "SCSS",
  go: "Go",
  rust: "Rust",
  rs: "Rust",
  mermaid: "Mermaid",
}

const MERMAID_SOURCE_PATTERN =
  /^(%%\{|\s*(?:info|flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|c4Context|C4Context|xychart-beta)\b)/

const HTML_ENTITY_MAP: Record<string, string> = {
  lt: "<",
  gt: ">",
  amp: "&",
  quot: "\"",
  "#39": "'",
  "#x27": "'",
  apos: "'",
}

const HAS_FENCED_CODE_BLOCK_REGEX = /(^|\n)\s*[`~]{3,}[\w-]*[\t ]*\n[\s\S]*?\n[`~]{3,}(?=\n|$)/
const HAS_MERMAID_BLOCK_REGEX = /(^|\n)\s*[`~]{3,}\s*mermaid\b[\t ]*\n[\s\S]*?\n[`~]{3,}(?=\n|$)/i
const STANDALONE_MARKDOWN_IMAGE_REGEX =
  /^!\[([^\]]*)\]\((.+?)(?:\s+"([^"]*)")?\)(?:\s*\{([^}]*)\})?\s*$/

const containsTokenByCharCodes = (text: string, token: number[]) => {
  if (!text || token.length === 0 || text.length < token.length) return false

  outer: for (let i = 0; i <= text.length - token.length; i += 1) {
    for (let j = 0; j < token.length; j += 1) {
      if (text.charCodeAt(i + j) !== token[j]) {
        continue outer
      }
    }
    return true
  }

  return false
}

const hasMermaidConnectorOrKeyword = (source: string) => {
  const normalized = source.toLowerCase()
  if (/\b(subgraph|end)\b/.test(normalized)) return true

  const connectorTokens = [
    [45, 45, 62],
    [61, 61, 62],
    [45, 46, 45, 62],
    [58, 58, 58],
  ]

  return connectorTokens.some((token) => containsTokenByCharCodes(normalized, token))
}

const parseCalloutHeader = (raw: string): ParsedCalloutHeader | null => {
  const line = raw.trim()
  if (!line) return null

  const blockquoteMatch = line.match(/^\[!([A-Za-z]+)\](?:\s*(.*))?$/)
  const rawKind = blockquoteMatch?.[1]?.toUpperCase() || ""
  if (blockquoteMatch) {
    const mappedKind = CALLOUT_KIND_MAP[rawKind] || "info"
    const customTitle = blockquoteMatch?.[2]?.trim() || ""
    return {
      kind: mappedKind,
      title: customTitle,
      emoji: CALLOUT_EMOJI_BY_KIND[mappedKind],
      ...(CALLOUT_KIND_MAP[rawKind] ? {} : { label: rawKind }),
    }
  }

  const emojiMatch = CALLOUT_EMOJI_MAP.find(({ marker }) => line === marker || line.startsWith(`${marker} `))
  if (!emojiMatch) return null

  const inlineTitle = line.slice(emojiMatch.marker.length).trim()
  return {
    kind: emojiMatch.kind,
    title: inlineTitle,
    emoji: CALLOUT_EMOJI_BY_KIND[emojiMatch.kind],
  }
}

const extractPromotedCalloutTitle = (bodyLines: string[]) => {
  const firstBodyLineIndex = bodyLines.findIndex((row) => row.trim().length > 0)
  if (firstBodyLineIndex < 0) {
    return { title: "", bodyLines }
  }

  const originalLine = bodyLines[firstBodyLineIndex]
  const trimmedLine = originalLine.trim()
  const headingMatch = trimmedLine.match(/^#{1,6}\s+(.+)$/)
  if (headingMatch) {
    return {
      title: headingMatch[1]?.trim() || "",
      bodyLines: bodyLines.filter((_, index) => index !== firstBodyLineIndex),
    }
  }

  const boldMatch = trimmedLine.match(/^(?:[-*+]\s+)?(?:\*\*(.+?)\*\*|__(.+?)__)(.*)$/)
  const promotedTitle = (boldMatch?.[1] || boldMatch?.[2] || "").trim()
  if (!promotedTitle) {
    return { title: "", bodyLines }
  }

  const remainingLine = (boldMatch?.[3] || "").trim()

  const resolvedBodyLines = remainingLine
    ? bodyLines.map((line, index) => (index === firstBodyLineIndex ? remainingLine : line))
    : bodyLines.filter((_, index) => index !== firstBodyLineIndex)

  return {
    title: promotedTitle,
    bodyLines: resolvedBodyLines,
  }
}

const buildCalloutSegment = (
  header: ParsedCalloutHeader,
  bodyLines: string[]
): MarkdownSegment => {
  const promoted = extractPromotedCalloutTitle(bodyLines)
  const resolvedTitle = promoted.title || header.title

  return {
    type: "callout",
    kind: header.kind,
    title: resolvedTitle,
    emoji: header.emoji,
    content: promoted.bodyLines.join("\n").trim() || "내용을 입력하세요.",
    ...(header.label ? { label: header.label } : {}),
  }
}

const decodeBasicHtmlEntities = (raw: string) =>
  raw.replace(/&(lt|gt|amp|quot|#39|#x27|apos);/gi, (entity, key: string) => {
    const decoded = HTML_ENTITY_MAP[key.toLowerCase()]
    return decoded ?? entity
  })

const escapeHtml = (raw: string) =>
  raw
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;")

const escapeHtmlAttribute = (raw: string) => escapeHtml(raw).replaceAll("\n", "&#10;")

const BLOCK_BREAK_TAGS = new Set(["p", "div", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6"])

const isAsciiWhitespace = (char: string) => char === " " || char === "\n" || char === "\t" || char === "\r"

const isAsciiAlphaNumeric = (char: string) => {
  const code = char.charCodeAt(0)
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  )
}

const extractPlainTextByHtmlScanner = (rawHtml: string) => {
  let index = 0
  let plainText = ""

  while (index < rawHtml.length) {
    const currentChar = rawHtml[index]
    if (currentChar !== "<") {
      plainText += currentChar
      index += 1
      continue
    }

    const tagEndIndex = rawHtml.indexOf(">", index + 1)
    if (tagEndIndex < 0) {
      plainText += rawHtml.slice(index)
      break
    }

    const rawTagBody = rawHtml.slice(index + 1, tagEndIndex).trim()
    if (rawTagBody.length === 0 || rawTagBody.startsWith("!")) {
      index = tagEndIndex + 1
      continue
    }

    let tagPointer = 0
    let closing = false
    if (rawTagBody[tagPointer] === "/") {
      closing = true
      tagPointer += 1
      while (tagPointer < rawTagBody.length && isAsciiWhitespace(rawTagBody[tagPointer])) {
        tagPointer += 1
      }
    }

    const tagNameStart = tagPointer
    while (tagPointer < rawTagBody.length && isAsciiAlphaNumeric(rawTagBody[tagPointer])) {
      tagPointer += 1
    }
    const tagName = rawTagBody.slice(tagNameStart, tagPointer).toLowerCase()

    if (!closing && BLOCK_BREAK_TAGS.has(tagName)) {
      plainText += "\n"
    }

    index = tagEndIndex + 1
  }

  return plainText
}

const extractPlainTextFromHtml = (rawHtml: string) => {
  if (!rawHtml) return ""
  if (!rawHtml.includes("<")) return decodeBasicHtmlEntities(rawHtml)

  if (typeof window !== "undefined" && typeof window.DOMParser !== "undefined") {
    const parser = new window.DOMParser()
    const doc = parser.parseFromString(rawHtml, "text/html")

    doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"))
    doc.querySelectorAll("p,div,li,tr,h1,h2,h3,h4,h5,h6").forEach((el) => el.append("\n"))

    return decodeBasicHtmlEntities(doc.body.textContent || "")
  }

  return decodeBasicHtmlEntities(extractPlainTextByHtmlScanner(rawHtml))
}

const extractMermaidSource = (rawCode: string) => {
  return extractNormalizedMermaidSource(extractPlainTextFromHtml(rawCode))
}

export const isMermaidSource = (rawCode: string) => {
  const normalized = extractMermaidSource(rawCode).trimStart()
  if (!normalized) return false
  return MERMAID_SOURCE_PATTERN.test(normalized)
}

const normalizeMermaidCodeBlocksInHtml = (html: string) =>
  html.replace(/<pre\b[^>]*>\s*<code\b([^>]*)>([\s\S]*?)<\/code>\s*<\/pre>/gi, (full, rawCodeAttrs, rawCodeBody) => {
    const attrs = String(rawCodeAttrs || "")
    const lowerAttrs = attrs.toLowerCase()
    const hasMermaidClass =
      lowerAttrs.includes("language-mermaid") || lowerAttrs.includes("data-language=\"mermaid\"")
    const source = extractMermaidSource(String(rawCodeBody || ""))
    const looksLikeMermaid = MERMAID_SOURCE_PATTERN.test(source)
    if (!hasMermaidClass && !looksLikeMermaid) return full
    if (!source) return full

    return `<pre class="aq-mermaid" data-aq-mermaid="true" data-mermaid-rendered="pending" data-mermaid-source="${escapeHtmlAttribute(source)}"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`
  })

const normalizeMermaidParagraphsInHtml = (html: string) =>
  html.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (full, rawBody) => {
    const body = String(rawBody || "")
    const normalizedText = normalizeEscapedMermaidFences(extractPlainTextFromHtml(body)).trim()
    if (!normalizedText) return full

    const hasMermaidFence =
      /^`{3,}\s*mermaid\b/i.test(normalizedText) || /^\\`{3,}\s*mermaid\b/i.test(body.trim())
    const source = extractMermaidSource(body)
    const looksLikeMermaid = MERMAID_SOURCE_PATTERN.test(source) && hasMermaidConnectorOrKeyword(source)

    if (!hasMermaidFence && !looksLikeMermaid) return full
    if (!source) return full

    return `<pre class="aq-mermaid" data-aq-mermaid="true" data-mermaid-rendered="pending" data-mermaid-source="${escapeHtmlAttribute(source)}"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`
  })

const normalizeStandaloneMermaidPreBlocksInHtml = (html: string) =>
  html.replace(/<pre\b([^>]*)>([\s\S]*?)<\/pre>/gi, (full, rawPreAttrs, rawBody) => {
    if (/<code\b/i.test(rawBody)) return full

    const attrs = String(rawPreAttrs || "")
    const lowerAttrs = attrs.toLowerCase()
    const hasMermaidHint =
      lowerAttrs.includes("aq-mermaid") ||
      lowerAttrs.includes("language-mermaid") ||
      lowerAttrs.includes("data-language=\"mermaid\"") ||
      lowerAttrs.includes("data-language='mermaid'")

    const source = extractMermaidSource(String(rawBody || ""))
    const looksLikeMermaid = MERMAID_SOURCE_PATTERN.test(source)

    if (!hasMermaidHint && !looksLikeMermaid) return full
    if (!source) return full

    return `<pre class="aq-mermaid" data-aq-mermaid="true" data-mermaid-rendered="pending" data-mermaid-source="${escapeHtmlAttribute(source)}"><code class="language-mermaid">${escapeHtml(source)}</code></pre>`
  })

export const normalizeContentHtmlForMermaid = (rawHtml: string): string =>
  rawHtml
    ? normalizeStandaloneMermaidPreBlocksInHtml(
      normalizeMermaidParagraphsInHtml(normalizeMermaidCodeBlocksInHtml(rawHtml))
    )
    : ""

export const shouldPreferMarkdownPipeline = (markdown: string) => {
  if (!markdown.trim()) return false
  if (HAS_MERMAID_BLOCK_REGEX.test(markdown)) return true
  return HAS_FENCED_CODE_BLOCK_REGEX.test(markdown)
}

const extractTextFromNode = (node: ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(extractTextFromNode).join("")
  if (!isValidElement(node)) return ""
  return extractTextFromNode((node.props as { children?: ReactNode }).children)
}

export const extractCodeMetaFromPreChildren = (children: ReactNode) => {
  const list = Array.isArray(children) ? children : [children]
  const codeElement = list.find(
    (child): child is ReactElement<Record<string, unknown>> =>
      isValidElement(child) && typeof child.type === "string" && child.type.toLowerCase() === "code"
  )

  const codeClassName =
    typeof codeElement?.props.className === "string" ? codeElement.props.className : ""
  const classLanguage =
    codeClassName
      .split(" ")
      .map((token) => token.trim())
      .find((token) => token.startsWith("language-"))
      ?.replace("language-", "")
      .toLowerCase() || ""

  const dataLanguage =
    typeof codeElement?.props["data-language"] === "string"
      ? String(codeElement.props["data-language"]).toLowerCase()
      : ""

  const codeChildren = (codeElement?.props.children as ReactNode | undefined) ?? children
  const rawCode = extractTextFromNode(codeChildren).replace(/\n$/, "")

  return {
    language: dataLanguage || classLanguage || "text",
    rawCode,
  }
}

export const toLanguageLabel = (lang: string) => {
  const normalized = lang.trim().toLowerCase()
  if (!normalized) return "일반 텍스트"
  return LANGUAGE_LABEL_MAP[normalized] || normalized.toUpperCase()
}

export const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const clampImageWidthPx = (value: number) => Math.min(960, Math.max(180, Math.round(value)))

export const normalizeImageAlign = (
  value: string | null | undefined
): "left" | "center" | "wide" | "full" | undefined => {
  if (!value) return undefined

  const normalized = value.trim().toLowerCase()
  if (normalized === "left" || normalized === "center" || normalized === "wide" || normalized === "full") {
    return normalized
  }

  return undefined
}

export type ParsedStandaloneMarkdownImage = {
  alt: string
  src: string
  title: string
  widthPx?: number
  align?: "left" | "center" | "wide" | "full"
}

export const parseStandaloneMarkdownImageLine = (
  line: string
): ParsedStandaloneMarkdownImage | null => {
  const match = line.trim().match(STANDALONE_MARKDOWN_IMAGE_REGEX)
  if (!match) return null

  const alt = match[1] || ""
  const src = (match[2] || "").trim()
  const title = (match[3] || "").trim()
  const metadata = (match[4] || "").trim()
  const widthFromSuffixMatch = metadata.match(/(?:^|\s)width=(\d{2,4})(?:$|\s)/i)
  const alignFromSuffixMatch = metadata.match(/(?:^|\s)align=(left|center|wide|full)(?:$|\s)/i)
  const widthFromSuffix = Number.parseInt(widthFromSuffixMatch?.[1] || "", 10)
  const widthFromTitleMatch = title.match(/(?:^|\s)width=(\d{2,4})(?:$|\s)/i)
  const widthFromTitle = Number.parseInt(widthFromTitleMatch?.[1] || "", 10)
  const resolvedWidth = Number.isFinite(widthFromSuffix)
    ? widthFromSuffix
    : Number.isFinite(widthFromTitle)
      ? widthFromTitle
      : NaN

  if (!src) return null

  return {
    alt,
    src,
    title,
    widthPx: Number.isFinite(resolvedWidth) ? clampImageWidthPx(resolvedWidth) : undefined,
    align: normalizeImageAlign(alignFromSuffixMatch?.[1]),
  }
}

export const serializeStandaloneMarkdownImageLine = ({
  alt,
  src,
  title,
  widthPx,
  align,
}: ParsedStandaloneMarkdownImage) => {
  const trimmedTitle = title.trim().replace(/\s*width=\d{2,4}\s*/gi, " ").replace(/\s+/g, " ").trim()
  const titlePart = trimmedTitle ? ` "${trimmedTitle}"` : ""
  const metadataParts = [
    widthPx ? `width=${clampImageWidthPx(widthPx)}` : "",
    normalizeImageAlign(align) ? `align=${normalizeImageAlign(align)}` : "",
  ].filter(Boolean)
  const metadataPart = metadataParts.length > 0 ? ` {${metadataParts.join(" ")}}` : ""
  return `![${alt}](${src}${titlePart})${metadataPart}`
}

const parseFenceMarker = (line: string): "`" | "~" | null => {
  const match = line.trim().match(/^([`~]{3,})(.*)$/)
  if (!match) return null

  const fence = match[1]
  const marker = fence[0] as "`" | "~"
  if (!fence.split("").every((char) => char === marker)) return null
  return marker
}

const CUSTOM_DIRECTIVE_PATTERN =
  /^:::(bookmark|embed|file)(?:\s+(\S+))?\s*$/i

const FORMULA_BLOCK_START_PATTERN = /^\s*\$\$\s*$/

export const parseMarkdownSegments = (content: string): MarkdownSegment[] => {
  const lines = content.split("\n")
  const segments: MarkdownSegment[] = []
  let markdownBuffer: string[] = []
  let activeFenceMarker: "`" | "~" | null = null

  const flushMarkdown = () => {
    const text = markdownBuffer.join("\n").trim()
    if (text) segments.push({ type: "markdown", content: text })
    markdownBuffer = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMarker = parseFenceMarker(line)

    if (activeFenceMarker) {
      markdownBuffer.push(line)
      if (fenceMarker === activeFenceMarker) {
        activeFenceMarker = null
      }
      i += 1
      continue
    }

    if (fenceMarker) {
      markdownBuffer.push(line)
      activeFenceMarker = fenceMarker
      i += 1
      continue
    }

    const standaloneImage = parseStandaloneMarkdownImageLine(line)
    if (standaloneImage) {
      flushMarkdown()
      segments.push({
        type: "image",
        alt: standaloneImage.alt,
        src: standaloneImage.src,
        title: standaloneImage.title,
        widthPx: standaloneImage.widthPx,
      })
      i += 1
      continue
    }

    const customDirectiveMatch = line.trim().match(CUSTOM_DIRECTIVE_PATTERN)
    if (customDirectiveMatch) {
      const directive = customDirectiveMatch[1]?.toLowerCase()
      const url = (customDirectiveMatch[2] || "").trim()
      const bodyLines: string[] = []
      let closed = false

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() === ":::") {
          const [firstLine = "", ...restLines] = bodyLines
          const secondaryText = restLines.join("\n").trim()
          flushMarkdown()

          if (directive === "bookmark") {
            segments.push({
              type: "bookmark",
              url,
              title: firstLine.trim() || "북마크",
              description: secondaryText,
            })
          } else if (directive === "embed") {
            segments.push({
              type: "embed",
              url,
              title: firstLine.trim() || "임베드",
              caption: secondaryText,
            })
          } else if (directive === "file") {
            segments.push({
              type: "file",
              url,
              name: firstLine.trim() || "파일",
              description: secondaryText,
            })
          }

          i = j
          closed = true
          break
        }
        bodyLines.push(lines[j])
      }

      if (!closed) {
        markdownBuffer.push(line)
        markdownBuffer.push(...bodyLines)
      }

      i += 1
      continue
    }

    if (FORMULA_BLOCK_START_PATTERN.test(line.trim())) {
      const bodyLines: string[] = []
      let closed = false

      for (let j = i + 1; j < lines.length; j += 1) {
        if (FORMULA_BLOCK_START_PATTERN.test(lines[j].trim())) {
          flushMarkdown()
          segments.push({
            type: "formula",
            formula: bodyLines.join("\n").trim(),
          })
          i = j
          closed = true
          break
        }
        bodyLines.push(lines[j])
      }

      if (!closed) {
        markdownBuffer.push(line)
        markdownBuffer.push(...bodyLines)
      }

      i += 1
      continue
    }

    if (line.startsWith(":::toggle")) {
      const title = line.replace(/^:::toggle\s*/, "").trim() || "토글"
      const bodyLines: string[] = []
      let closed = false

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() === ":::") {
          flushMarkdown()
          segments.push({
            type: "toggle",
            title,
            content: bodyLines.join("\n").trim() || "내용을 입력하세요.",
          })
          i = j
          closed = true
          break
        }
        bodyLines.push(lines[j])
      }

      if (!closed) {
        markdownBuffer.push(line)
        markdownBuffer.push(...bodyLines)
      }

      i += 1
      continue
    }

    if (line.trimStart().startsWith(">")) {
      const blockStart = i
      const quoteLines: string[] = []

      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""))
        i += 1
      }

      const firstContentIndex = quoteLines.findIndex((row) => row.trim().length > 0)
      if (firstContentIndex >= 0) {
        const firstLine = quoteLines[firstContentIndex].trim()
        const header = parseCalloutHeader(firstLine)
        if (header) {
          flushMarkdown()
          segments.push(buildCalloutSegment(header, quoteLines.slice(firstContentIndex + 1)))
          continue
        }
      }

      markdownBuffer.push(lines.slice(blockStart, i).join("\n"))
      continue
    }

    if (/^\s*<aside(?:\s+[^>]*)?>/i.test(line)) {
      const originalLines = [line]
      const openingMatch = line.match(/^\s*<aside(?:\s+[^>]*)?>(.*)$/i)
      const bodyLines: string[] = []
      let closed = false

      const appendAsideContent = (value: string) => {
        if (value.length === 0) return
        bodyLines.push(value)
      }

      const openingTail = openingMatch?.[1] ?? ""
      if (openingTail.includes("</aside>")) {
        appendAsideContent(openingTail.replace(/<\/aside>\s*$/i, "").trimEnd())
        closed = true
      } else {
        appendAsideContent(openingTail)
      }

      let j = i + 1
      while (!closed && j < lines.length) {
        const currentLine = lines[j]
        originalLines.push(currentLine)

        if (/<\/aside>\s*$/i.test(currentLine)) {
          appendAsideContent(currentLine.replace(/<\/aside>\s*$/i, "").trimEnd())
          closed = true
          i = j
          break
        }

        bodyLines.push(currentLine)
        j += 1
      }

      if (closed) {
        const normalizedBodyLines = bodyLines
          .map((row) => row.replace(/^\s+|\s+$/g, ""))
        const firstContentIndex = normalizedBodyLines.findIndex((row) => row.length > 0)
        const header = firstContentIndex >= 0 ? parseCalloutHeader(normalizedBodyLines[firstContentIndex]) : null

        flushMarkdown()
        if (header) {
          segments.push(buildCalloutSegment(header, normalizedBodyLines.slice(firstContentIndex + 1)))
        } else {
          segments.push({
            type: "callout",
            kind: "info",
            title: "",
            emoji: CALLOUT_EMOJI_BY_KIND.info,
            content: normalizedBodyLines.join("\n").trim() || "내용을 입력하세요.",
          })
        }

        i += 1
        continue
      }

      markdownBuffer.push(originalLines.join("\n"))
      i += 1
      continue
    }

    markdownBuffer.push(line)
    i += 1
  }

  flushMarkdown()
  return segments
}

export const normalizeMarkdownForRender = (rawMarkdown: string) => normalizeEscapedMarkdownFences(rawMarkdown.trim())

export const resolveMarkdownRenderModel = ({
  content,
  contentHtml,
}: {
  content?: string
  contentHtml?: string
}): MarkdownRenderModel => {
  const normalizedContent = normalizeMarkdownForRender(content || "")
  const { cleanedMarkdown, layouts: tableLayouts } = extractMarkdownTableLayouts(normalizedContent)
  const normalizedContentHtml = contentHtml?.trim() || ""
  const sanitizedContentHtml = normalizeContentHtmlForMermaid(normalizedContentHtml)

  // 원문 markdown이 있으면 interactive block 책임은 항상 클라이언트 markdown 파이프라인에 둔다.
  const resolvedContentHtml = normalizedContent ? "" : sanitizedContentHtml
  const segments = resolvedContentHtml ? [] : parseMarkdownSegments(cleanedMarkdown)
  const renderKeySeed = resolvedContentHtml
    ? `html:${resolvedContentHtml}`
    : `md:${cleanedMarkdown}::table:${JSON.stringify(tableLayouts)}`

  return {
    normalizedContent: cleanedMarkdown,
    resolvedContentHtml,
    renderKey: `${renderKeySeed.length}:${hashString(renderKeySeed)}`,
    segments,
    tableLayouts,
  }
}
