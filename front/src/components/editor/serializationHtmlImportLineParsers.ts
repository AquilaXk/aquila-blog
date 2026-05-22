import { parseStandaloneMarkdownImageLine } from "src/libs/markdown/rendering"
import type {
  BookmarkBlockAttrs,
  EmbedBlockAttrs,
  FileBlockAttrs,
} from "./serializationTypes"
import { CALL_OUT_KIND_MAP } from "./serializationTypes"
import {
  isLikelyTableRow,
  isTableSeparatorLine,
} from "./serializationTableMetadata"

export const CUSTOM_DIRECTIVE_PATTERN =
  /^:::(bookmark|embed|file)(?:\s+(\S+))?\s*$/i
const CARD_METADATA_COMMENT_PATTERN =
  /^\s*<!--\s*aq-(bookmark|embed|file)\s+(\{[\s\S]*\})\s*-->\s*$/

export const FORMULA_BLOCK_START_PATTERN = /^\s*\$\$\s*$/
const SINGLE_LINE_FORMULA_BLOCK_PATTERN = /^\s*\$\$\s*(.+?)\s*\$\$\s*$/

export const isBlankLine = (line: string) => line.trim().length === 0

export const isFenceStart = (line: string) => {
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

export const isFenceEnd = (line: string, marker: string, length: number) =>
  new RegExp(`^\\s*${marker}{${length},}\\s*$`).test(line)

export const isDividerLine = (line: string) => /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)

export const isHeadingLine = (line: string) => {
  const match = line.match(/^(#{1,6})\s+(.*)$/)
  if (!match) return null
  return { level: match[1].length, text: match[2].trim() }
}

export const isBulletListItem = (line: string) => {
  const match = line.match(/^\s*[-*+]\s+(.*)$/)
  return match ? match[1] : null
}

export const isTaskListItem = (line: string) => {
  const match = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/)
  if (!match) return null

  return {
    checked: match[1].toLowerCase() === "x",
    text: match[2],
  }
}

export const isOrderedListItem = (line: string) => {
  const match = line.match(/^\s*(\d+)\.\s+(.*)$/)
  return match
    ? {
        order: Number.parseInt(match[1], 10) || 1,
        text: match[2],
      }
    : null
}

export const isBlockquoteLine = (line: string) => {
  const match = line.match(/^\s*>\s?(.*)$/)
  return match ? match[1] : null
}

export const parseToggleStart = (line: string) => {
  const match = line.trim().match(/^:::toggle(?:\s+(.*))?$/i)
  if (!match) return null
  return {
    title: (match[1] || "").trim(),
  }
}

export const parseCalloutStart = (line: string) => {
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

export const parseAsideStart = (line: string) => line.match(/^\s*<aside(?:\s+[^>]*)?>(.*)$/i)

export const parseSingleLineFormulaBlock = (line: string) => {
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

export const parseCardMetadataComment = (line: string) => {
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

export const promoteCalloutTitle = (headerTitle: string, bodyLines: string[]) => {
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

export const collectParagraphLines = (lines: string[], startIndex: number) => {
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

export const isSupportedBlockStart = (line: string, nextLine?: string) =>
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
