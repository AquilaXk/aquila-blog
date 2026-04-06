const TABLE_SEPARATOR_LINE_PATTERN = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/

const isTableSeparatorLine = (line: string) => TABLE_SEPARATOR_LINE_PATTERN.test(line)

const isLikelyTableRow = (line: string) => {
  const trimmed = line.trim()
  if (!trimmed.includes("|")) return false
  return /^\|?.+\|.+\|?$/.test(trimmed)
}

const wrapWithMarkdownMark = (content: string, marker: string) => {
  const normalized = content.trim()
  if (!normalized) return ""
  return `${marker}${normalized}${marker}`
}

const wrapWithMarkdownCodeMark = (content: string) => {
  const normalized = content.trim()
  if (!normalized) return ""
  const backtickRuns = normalized.match(/`+/g)
  const longestRun = backtickRuns?.reduce((max, run) => Math.max(max, run.length), 0) ?? 0
  const marker = "`".repeat(longestRun + 1)
  const paddedContent =
    normalized.startsWith("`") || normalized.endsWith("`") ? ` ${normalized} ` : normalized
  return `${marker}${paddedContent}${marker}`
}

const normalizeCodeTagMatch = (rawInner: string) => {
  return wrapWithMarkdownCodeMark(String(rawInner || ""))
}

export const normalizeLegacyInlineHtmlSpans = (input: string) => {
  if (!input) return input
  if (!input.includes("<") && !input.includes("&lt;")) return input

  let normalized = input
  normalized = normalized.replace(
    /<\s*code(?:\s+[^>]*)?\s*>([\s\S]*?)<\s*\/\s*code\s*>/gi,
    (_match, rawInner: string) => normalizeCodeTagMatch(rawInner)
  )
  normalized = normalized.replace(
    /&lt;\s*code(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\s*\/\s*code\s*&gt;/gi,
    (_match, rawInner: string) => normalizeCodeTagMatch(rawInner)
  )
  normalized = normalized.replace(
    /<\s*(?:strong|b)(?:\s+[^>]*)?\s*>([\s\S]*?)<\s*\/\s*(?:strong|b)\s*>/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "**")
  )
  normalized = normalized.replace(
    /&lt;\s*(?:strong|b)(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\s*\/\s*(?:strong|b)\s*&gt;/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "**")
  )
  normalized = normalized.replace(
    /<\s*(?:em|i)(?:\s+[^>]*)?\s*>([\s\S]*?)<\s*\/\s*(?:em|i)\s*>/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "*")
  )
  normalized = normalized.replace(
    /&lt;\s*(?:em|i)(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\s*\/\s*(?:em|i)\s*&gt;/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "*")
  )
  normalized = normalized.replace(
    /<\s*(?:del|s)(?:\s+[^>]*)?\s*>([\s\S]*?)<\s*\/\s*(?:del|s)\s*>/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "~~")
  )
  normalized = normalized.replace(
    /&lt;\s*(?:del|s)(?:\s+[^&]*)&gt;([\s\S]*?)&lt;\s*\/\s*(?:del|s)\s*&gt;/gi,
    (_match, rawInner: string) => wrapWithMarkdownMark(String(rawInner || ""), "~~")
  )

  return normalized
}

export const normalizeInlineHtmlInMarkdownTables = (markdown: string) => {
  if (!markdown || !markdown.includes("<")) return markdown

  return markdown
    .split("\n")
    .map((line) => {
      if (!line.includes("<")) return line
      if (!isLikelyTableRow(line) || isTableSeparatorLine(line)) return line
      return normalizeLegacyInlineHtmlSpans(line)
    })
    .join("\n")
}
