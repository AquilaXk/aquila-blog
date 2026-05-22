import {
  extractNormalizedMermaidSource,
  normalizeEscapedMermaidFences,
} from "src/libs/markdown/mermaid"

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
