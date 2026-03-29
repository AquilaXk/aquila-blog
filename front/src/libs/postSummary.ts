const SUMMARY_PREFIX_REGEX = /^(?:요약|summary)\s*[:：-]\s*/i
const SUMMARY_LEAD_IN_REGEX =
  /^(?:이 글(?:은|에서는)?|이번 글(?:은|에서는)?|이번 포스트(?:는|에서는)?|이 포스트(?:는|에서는)?|본 글(?:은|에서는)?|해당 글(?:은|에서는)?|이 문서(?:는|에서는)?|본문은|정리하면)\s+/i
const HTML_COLON_REGEX = /&#x3A;|&#58;/gi
const WHITESPACE_REGEX = /\s+/g
const FENCED_CODE_REGEX = /```[\s\S]*?```/g
const MARKDOWN_IMAGE_REGEX = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const INLINE_CODE_REGEX = /`([^`]+)`/g
const MARKDOWN_LINK_REGEX = /\[(.*?)\]\((.*?)\)/g
const MARKDOWN_PUNCTUATION_REGEX = /[#>*_~|-]/g
const SUMMARY_BLOCK_START_REGEX = /^\s*>\s*(?:\*\*|__)?\s*(?:["'“”]\s*)?(?:요약|summary)\b/i
const SUMMARY_HTML_BLOCKQUOTE_REGEX = /^\s*<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>\s*/i
const HTML_TAG_REGEX = /<[^>]+>/g
const HTML_NBSP_REGEX = /&nbsp;|&#160;/gi

export const CARD_SUMMARY_PREVIEW_LIMIT = 150
export const DEFAULT_CARD_SUMMARY_FALLBACK = "핵심 내용을 정리 중입니다."

const decodeSummaryEntities = (value: string) => value.replace(HTML_COLON_REGEX, ":")

const stripSummaryLeadIn = (value: string) => {
  let normalized = value.trim()
  let previous = ""

  while (normalized !== previous) {
    previous = normalized
    normalized = normalized.replace(SUMMARY_PREFIX_REGEX, "").replace(SUMMARY_LEAD_IN_REGEX, "").trim()
  }

  return normalized
}

const truncateSummary = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength).trimEnd()}...`
}

export const normalizeCardSummary = (
  value?: string,
  options?: {
    fallback?: string
    maxLength?: number
  }
) => {
  const fallback = options?.fallback ?? DEFAULT_CARD_SUMMARY_FALLBACK
  const maxLength = options?.maxLength ?? CARD_SUMMARY_PREVIEW_LIMIT

  if (typeof value !== "string") return fallback

  const normalized = stripSummaryLeadIn(
    decodeSummaryEntities(value)
      .replace(WHITESPACE_REGEX, " ")
      .trim()
  )

  if (!normalized) return fallback
  return truncateSummary(normalized, maxLength)
}

export const buildPreviewSummaryFromMarkdown = (
  content: string,
  maxLength = CARD_SUMMARY_PREVIEW_LIMIT,
  fallback = "요약을 생성할 수 없습니다."
) => {
  const normalized = content
    .replace(FENCED_CODE_REGEX, " ")
    .replace(MARKDOWN_IMAGE_REGEX, " ")
    .replace(INLINE_CODE_REGEX, "$1")
    .replace(MARKDOWN_LINK_REGEX, "$1")
    .replace(MARKDOWN_PUNCTUATION_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim()
  const compactRaw = content.replace(WHITESPACE_REGEX, " ").trim()
  const relaxedNormalized = compactRaw
    .replace(MARKDOWN_PUNCTUATION_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim()
  const summarySource = normalized || relaxedNormalized || compactRaw
  return normalizeCardSummary(summarySource, { fallback, maxLength })
}

export const extractLeadingSummaryBlock = (
  content: string,
  maxLength = CARD_SUMMARY_PREVIEW_LIMIT
) => {
  const extracted = extractLeadingQuoteBlock(content)
  if (!extracted) {
    return {
      summary: "",
      contentWithoutSummary: content,
    }
  }

  const rawBlock = extracted.rawBlock
  if (!SUMMARY_BLOCK_START_REGEX.test(rawBlock)) {
    return {
      summary: "",
      contentWithoutSummary: content,
    }
  }

  const blockContent = rawBlock
    .replace(/^\s*>\s?/gm, " ")
    .replace(/\*\*/g, " ")
    .replace(/__/g, " ")
    .trim()
  const summary = normalizeCardSummary(blockContent, { fallback: "", maxLength })
  const contentWithoutSummary = content.slice(extracted.matchLength).trimStart()

  return {
    summary,
    contentWithoutSummary,
  }
}

export const extractLeadingSummaryBlockFromHtml = (
  contentHtml: string,
  maxLength = CARD_SUMMARY_PREVIEW_LIMIT
) => {
  const match = contentHtml.match(SUMMARY_HTML_BLOCKQUOTE_REGEX)
  if (!match) {
    return {
      summary: "",
      contentHtmlWithoutSummary: contentHtml,
    }
  }

  const rawBlock = match[0]
  const rawInnerHtml = match[1] || ""
  const normalizedInnerText = decodeSummaryEntities(
    rawInnerHtml
      .replace(HTML_NBSP_REGEX, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(HTML_TAG_REGEX, " ")
      .replace(WHITESPACE_REGEX, " ")
      .trim()
  )

  if (!normalizedInnerText || !/^(?:["'“”]\s*)?(?:요약|summary)\b/i.test(normalizedInnerText)) {
    return {
      summary: "",
      contentHtmlWithoutSummary: contentHtml,
    }
  }

  const summary = normalizeCardSummary(normalizedInnerText, { fallback: "", maxLength })
  return {
    summary,
    contentHtmlWithoutSummary: contentHtml.slice(rawBlock.length).trimStart(),
  }
}

const extractLeadingQuoteBlock = (
  content: string
): {
  rawBlock: string
  matchLength: number
} | null => {
  const totalLength = content.length
  let cursor = 0

  const isSimpleWhitespace = (ch: string) =>
    ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v"

  const readLineBreakLength = (index: number) => {
    if (index >= totalLength) return 0
    if (content[index] === "\r") return content[index + 1] === "\n" ? 2 : 1
    return content[index] === "\n" ? 1 : 0
  }

  while (cursor < totalLength && isSimpleWhitespace(content[cursor])) {
    cursor += 1
  }

  const blockStart = cursor
  let blockEnd = cursor
  let quoteLineCount = 0

  while (cursor < totalLength && content[cursor] === ">") {
    quoteLineCount += 1
    cursor += 1
    if (content[cursor] === " ") cursor += 1

    while (cursor < totalLength && readLineBreakLength(cursor) === 0) {
      cursor += 1
    }

    const lineBreakLength = readLineBreakLength(cursor)
    if (lineBreakLength > 0) {
      cursor += lineBreakLength
    }

    blockEnd = cursor
  }

  if (quoteLineCount === 0) return null

  let separatorLineBreakCount = 0
  while (separatorLineBreakCount < 2) {
    const lineBreakLength = readLineBreakLength(cursor)
    if (lineBreakLength === 0) break
    cursor += lineBreakLength
    separatorLineBreakCount += 1
  }

  if (separatorLineBreakCount < 1) return null

  return {
    rawBlock: content.slice(blockStart, blockEnd),
    matchLength: cursor,
  }
}
