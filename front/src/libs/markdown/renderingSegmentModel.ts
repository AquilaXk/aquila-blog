import type { CalloutKind, MarkdownSegment } from "src/libs/markdown/renderingTypes"
import { parseStandaloneMarkdownImageLine } from "src/libs/markdown/renderingImageModel"
import { normalizeSafeMarkdownUrl } from "src/libs/markdown/safeMarkdownUrl"

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
  if (remainingLine.length > 0) {
    return { title: "", bodyLines }
  }

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
const CARD_METADATA_COMMENT_PATTERN =
  /^\s*<!--\s*aq-(bookmark|embed|file)\s+(\{[\s\S]*\})\s*-->\s*$/

const FORMULA_BLOCK_START_PATTERN = /^\s*\$\$\s*$/

const normalizeOptionalCardUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || !value.trim()) return undefined
  const normalized = normalizeSafeMarkdownUrl(value)
  return normalized || undefined
}

const parseCardMetadataComment = (line: string) => {
  const match = line.match(CARD_METADATA_COMMENT_PATTERN)
  if (!match) return null

  try {
    const kind = match[1].toLowerCase() as "bookmark" | "embed" | "file"
    const payload = JSON.parse(match[2]) as Record<string, unknown>
    const thumbnailUrl = normalizeOptionalCardUrl(payload.thumbnailUrl)
    const embedUrl = normalizeOptionalCardUrl(payload.embedUrl)
    return {
      kind,
      attrs:
        kind === "file"
          ? {
              ...(typeof payload.mimeType === "string" && payload.mimeType.trim()
                ? { mimeType: payload.mimeType.trim() }
                : {}),
              ...(typeof payload.sizeBytes === "number" && Number.isFinite(payload.sizeBytes)
                ? { sizeBytes: Math.max(0, Math.round(payload.sizeBytes)) }
                : {}),
            }
          : {
              ...(typeof payload.siteName === "string" && payload.siteName.trim()
                ? { siteName: payload.siteName.trim() }
                : {}),
              ...(typeof payload.provider === "string" && payload.provider.trim()
                ? { provider: payload.provider.trim() }
                : {}),
              ...(thumbnailUrl ? { thumbnailUrl } : {}),
              ...(kind === "embed" && embedUrl ? { embedUrl } : {}),
            },
    }
  } catch {
    return null
  }
}

export const parseMarkdownSegments = (content: string): MarkdownSegment[] => {
  const lines = content.split("\n")
  const segments: MarkdownSegment[] = []
  let markdownBuffer: string[] = []
  let activeFenceMarker: "`" | "~" | null = null
  let pendingDirectiveMetadata:
    | {
        kind: "bookmark" | "embed" | "file"
        attrs: Record<string, unknown>
      }
    | null = null

  const flushMarkdown = () => {
    const text = markdownBuffer.join("\n").trim()
    if (text) segments.push({ type: "markdown", content: text })
    markdownBuffer = []
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const fenceMarker = parseFenceMarker(line)
    const directiveMetadataComment = parseCardMetadataComment(line)

    if (activeFenceMarker) {
      markdownBuffer.push(line)
      if (fenceMarker === activeFenceMarker) {
        activeFenceMarker = null
      }
      i += 1
      continue
    }

    if (directiveMetadataComment) {
      pendingDirectiveMetadata = directiveMetadataComment
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
      const url = normalizeSafeMarkdownUrl(customDirectiveMatch[2] || "")
      const bodyLines: string[] = []
      let closed = false

      for (let j = i + 1; j < lines.length; j += 1) {
        if (lines[j].trim() === ":::") {
          const [firstLine = "", ...restLines] = bodyLines
          const secondaryText = restLines.join("\n").trim()
          flushMarkdown()
          const directiveMetadata =
            pendingDirectiveMetadata?.kind === directive
              ? pendingDirectiveMetadata.attrs
              : {}
          pendingDirectiveMetadata = null

          if (directive === "bookmark") {
            segments.push({
              type: "bookmark",
              url,
              title: firstLine.trim() || "북마크",
              description: secondaryText,
              ...directiveMetadata,
            })
          } else if (directive === "embed") {
            segments.push({
              type: "embed",
              url,
              title: firstLine.trim() || "임베드",
              caption: secondaryText,
              ...directiveMetadata,
            })
          } else if (directive === "file") {
            segments.push({
              type: "file",
              url,
              name: firstLine.trim() || "파일",
              description: secondaryText,
              ...directiveMetadata,
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

    pendingDirectiveMetadata = null

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
