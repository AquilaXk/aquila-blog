import { getApiBaseUrl } from "src/apis/backend/client"
import { convertHtmlToMarkdown as convertHtmlClipboardToMarkdown } from "src/libs/markdown/htmlToMarkdown"
import { buildPreviewSummaryFromMarkdown, normalizePersistedSummary } from "src/libs/postSummary"
import { normalizeCategoryValue } from "src/libs/utils"
import {
  DEFAULT_THUMBNAIL_FOCUS_X,
  DEFAULT_THUMBNAIL_FOCUS_Y,
  DEFAULT_THUMBNAIL_ZOOM,
  parseThumbnailFocusXFromUrl,
  parseThumbnailFocusYFromUrl,
  parseThumbnailZoomFromUrl,
  stripThumbnailFocusFromUrl,
} from "src/libs/thumbnailFocus"
import type { PostVisibility } from "./editorStudioState"

export type ParsedEditorMeta = {
  body: string
  tags: string[]
  category: string
  summary: string
  thumbnail: string
}

export type ResolvedEditorMetaSnapshot = {
  body: string
  tags: string[]
  category: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
}

export type MetaUsageMap = Record<string, number>

export type LocalDraftPayload = {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
  savedAt: string
}

const markdownImagePattern = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/
const PREVIEW_THUMBNAIL_ALLOWED_PATH_PREFIX = "/post/api/v1/images/posts/"
const PREVIEW_THUMBNAIL_DISALLOWED_CHAR_REGEX = /[\u0000-\u001F\u007F<>"'`\\]/
const PREVIEW_THUMBNAIL_ALLOWED_PATH_REGEX = /^\/post\/api\/v1\/images\/posts\/[A-Za-z0-9._~/%-]+$/
const PREVIEW_THUMBNAIL_ALLOWED_QUERY_REGEX = /^\?(?:[A-Za-z0-9._~/%=&-]*)$/
const FRONTMATTER_DELIMITER_REGEX = /^\s*---\s*$/
const LEADING_EDITOR_METADATA_LINE_REGEX =
  /^\s*(tags?|categories?|summary|thumbnail|thumb|cover|coverimage|cover_image)\s*:\s*(.+)\s*$/i
const EDITOR_BODY_PLACEHOLDER = "내용을 입력하세요."
const EDITOR_TOGGLE_TITLE_PLACEHOLDER = "토글 제목"
const FENCED_CODE_BLOCK_REGEX = /(^|\n)(`{3,}|~{3,})([^\n]*)\n(?:([\s\S]*?)\n)?\2(?=\n|$)/g
const HTML_CODE_RAW_ATTRIBUTE_TAG_REGEX = /<(?:code|pre)\b([^>]*)>/gi
const HTML_ATTRIBUTE_REGEX = /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>`]+)))?/g

export const PREVIEW_SUMMARY_MAX_LENGTH = 150
export const PREVIEW_SUMMARY_MAX_CONTENT_LENGTH = 50_000

export const dedupeStrings = (items: string[]) =>
  Array.from(
    new Set(
      items
        .map((item) => item.trim())
        .filter(Boolean)
    )
  )

const normalizeMetaItems = (raw: string): string[] => {
  const normalized = raw.trim().replace(/^\[|\]$/g, "")
  if (!normalized) return []

  return dedupeStrings(
    normalized
      .split(",")
      .map((token) => token.trim().replace(/^['"]|['"]$/g, ""))
  )
}

const normalizeMetaScalar = (raw: string) => raw.trim().replace(/^['"]|['"]$/g, "")

export const extractFirstMarkdownImage = (content: string): string => {
  const match = markdownImagePattern.exec(content)
  return match?.[1]?.trim() || ""
}

export const computeContentFingerprint = (content: string): string => {
  // Lightweight FNV-1a style hash to gate repeated derived calculations.
  let hash = 2166136261
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${content.length}:${hash >>> 0}`
}

export const normalizeSafeImageUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""

  if (value.startsWith("/")) {
    return value.startsWith("//") ? "" : value
  }

  if (value.startsWith("./") || value.startsWith("../")) {
    return value
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString()
    }
  } catch {
    return ""
  }

  return ""
}

const toSafePreviewThumbnailPath = (pathname: string, search: string): string => {
  if (!PREVIEW_THUMBNAIL_ALLOWED_PATH_REGEX.test(pathname)) return ""
  if (!search) return pathname
  if (!PREVIEW_THUMBNAIL_ALLOWED_QUERY_REGEX.test(search)) return ""
  return `${pathname}${search}`
}

const resolvePreviewThumbnailApiOrigin = (): string => {
  try {
    return new URL(getApiBaseUrl()).origin
  } catch {
    return ""
  }
}

export const normalizeSafePreviewThumbnailUrl = (raw: string): string => {
  const value = raw.trim()
  if (!value) return ""
  if (PREVIEW_THUMBNAIL_DISALLOWED_CHAR_REGEX.test(value)) return ""

  if (value.startsWith("/")) {
    if (value.startsWith("//")) return ""
    try {
      const parsed = new URL(value, "https://preview.local")
      const safePath = toSafePreviewThumbnailPath(parsed.pathname, parsed.search)
      if (!safePath) return ""
      const apiOrigin = resolvePreviewThumbnailApiOrigin()
      if (typeof window !== "undefined" && apiOrigin && window.location.origin !== apiOrigin) {
        return `${apiOrigin}${safePath}`
      }
      return safePath
    } catch {
      return ""
    }
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return ""
    if (parsed.username || parsed.password) return ""

    const allowedHosts = new Set<string>()
    const baseUrl = getApiBaseUrl()
    try {
      allowedHosts.add(new URL(baseUrl).host)
    } catch {
      return ""
    }
    if (typeof window !== "undefined" && window.location.host) {
      allowedHosts.add(window.location.host)
    }
    if (!allowedHosts.has(parsed.host)) return ""
    if (!parsed.pathname.startsWith(PREVIEW_THUMBNAIL_ALLOWED_PATH_PREFIX)) return ""
    const safePath = toSafePreviewThumbnailPath(parsed.pathname, parsed.search)
    if (!safePath) return ""
    const apiOrigin = resolvePreviewThumbnailApiOrigin()
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return safePath
    }
    if (apiOrigin && parsed.origin === apiOrigin) {
      return `${apiOrigin}${safePath}`
    }
    return `${parsed.origin}${safePath}`
  } catch {
    return ""
  }
}

export const makePreviewSummary = (content: string, maxLength = PREVIEW_SUMMARY_MAX_LENGTH) =>
  buildPreviewSummaryFromMarkdown(content, maxLength, "")

export const normalizeRecommendedTags = (value: unknown, maxTags: number) => {
  if (!Array.isArray(value)) return []
  const map = new Map<string, string>()
  value.forEach((item) => {
    if (typeof item !== "string") return
    const normalized = item.replace(/[\r\n]/g, " ").replace(/#/g, "").replace(/\s+/g, " ").trim()
    if (!normalized) return
    if (normalized.length < 2 || normalized.length > 24) return
    if (!/[\p{L}\p{N}]/u.test(normalized)) return
    if (normalized.toLowerCase() === "aside") return
    const key = normalized.toLowerCase()
    if (map.has(key) || map.size >= maxTags) return
    map.set(key, normalized)
  })
  return Array.from(map.values())
}

export const resolveTagRecommendationErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (!normalized) return "태그 추천 요청 처리 중 오류가 발생했습니다."

  const lowered = normalized.toLowerCase()
  if (lowered.includes("failed to fetch")) {
    return "네트워크 연결 또는 API 응답 수신에 실패했습니다."
  }

  if (lowered.includes("abort") || lowered.includes("timeout")) {
    return "태그 추천 응답 대기 시간이 초과되었습니다."
  }

  return normalized
}

export const formatTagRecommendationReason = (rawReason?: string | null) => {
  const reason = (rawReason || "").trim()
  switch (reason) {
    case "ai-disabled":
      return "AI 태그 추천이 비활성화됨"
    case "api-key-missing":
      return "Gemini API 키 누락"
    case "rate-limited":
      return "요청 제한으로 규칙 추천 사용"
    case "quota-exhausted":
      return "AI API 사용 한도 초과"
    case "status-503":
    case "status-504":
      return "AI API 통신 실패"
    case "transport":
      return "AI API 전송 실패"
    case "parse-error":
      return "AI 태그 응답 파싱 실패"
    case "empty-tags":
      return "AI가 태그를 반환하지 않음"
    case "internal-error":
      return "서버 내부 처리 실패"
    case "proxy-transport":
      return "프록시 통신 실패(규칙 추천 대체)"
    default:
      if (reason.startsWith("proxy-upstream-")) {
        return `프록시 업스트림 오류(${reason.slice("proxy-upstream-".length)})`
      }
      if (reason.startsWith("status-")) return `AI API 상태코드 ${reason.slice("status-".length)}`
      return reason
  }
}

const splitFrontmatterBlock = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n").trimStart()
  const lines = normalized.split("\n")
  if (!FRONTMATTER_DELIMITER_REGEX.test(lines[0] || "")) {
    return {
      metadataLines: [] as string[],
      body: normalized,
    }
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (!FRONTMATTER_DELIMITER_REGEX.test(lines[index] || "")) continue
    return {
      metadataLines: lines.slice(1, index),
      body: lines
        .slice(index + 1)
        .join("\n")
        .replace(/^\n+/, ""),
    }
  }

  return {
    metadataLines: [] as string[],
    body: normalized,
  }
}

const stripLeadingEditorMetadataLines = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n")
  const lines = normalized.split("\n")
  let consumed = 0

  for (const line of lines) {
    if (!line.trim()) {
      consumed += 1
      break
    }
    if (!LEADING_EDITOR_METADATA_LINE_REGEX.test(line)) break
    consumed += 1
  }

  return {
    consumed,
    body: consumed > 0 ? lines.slice(consumed).join("\n").trimStart() : normalized,
  }
}

const resolveEditorBodyFallback = (content: string, parsedBody: string) => {
  const normalized = content.replace(/\r\n?/g, "\n").trimStart()
  if (parsedBody.trim().length > 0 || normalized.trim().length === 0) return parsedBody

  const frontmatterSplit = splitFrontmatterBlock(normalized)
  const inlineMetadataSplit = stripLeadingEditorMetadataLines(frontmatterSplit.body)
  return inlineMetadataSplit.body.trim().length > 0 ? inlineMetadataSplit.body : parsedBody
}

const extractNonEmptyFencedCodeBlocks = (content: string) => {
  const normalized = content.replace(/\r\n?/g, "\n")
  const blocks: string[] = []

  normalized.replace(FENCED_CODE_BLOCK_REGEX, (_match, _leading, marker, info, codeBody) => {
    const body = String(codeBody ?? "")
    if (body.trim().length > 0) {
      blocks.push(`${marker}${info}\n${body}\n${marker}`)
    }
    return _match
  })

  return blocks
}

const decodeHtmlAttributeValue = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\r\n?/g, "\n")

const readHtmlAttributes = (rawAttributes: string) => {
  const attributes = new Map<string, string>()
  rawAttributes.replace(HTML_ATTRIBUTE_REGEX, (_match, name, doubleQuoted, singleQuoted, unquoted) => {
    const key = String(name).toLowerCase()
    const value = doubleQuoted ?? singleQuoted ?? unquoted ?? ""
    attributes.set(key, decodeHtmlAttributeValue(String(value)))
    return _match
  })
  return attributes
}

const resolveCodeLanguageFromHtmlAttributes = (attributes: Map<string, string>) => {
  const explicitLanguage = (
    attributes.get("data-language") ||
    attributes.get("data-prism-language") ||
    ""
  ).trim()
  if (explicitLanguage) return explicitLanguage

  const className = attributes.get("class") || ""
  return (className.match(/(?:^|\s)language-([a-zA-Z0-9_-]+)/)?.[1] || "").trim()
}

const extractRawCodeFencedBlocksFromHtml = (contentHtml?: string | null) => {
  if (!contentHtml?.trim()) return ""

  const blocks: string[] = []
  contentHtml.replace(HTML_CODE_RAW_ATTRIBUTE_TAG_REGEX, (_match, rawAttributes) => {
    const attributes = readHtmlAttributes(String(rawAttributes))
    const codeSource = (
      attributes.get("data-raw-code") ||
      attributes.get("data-prism-source") ||
      ""
    ).trimEnd()
    if (!codeSource.trim()) return _match

    const language = resolveCodeLanguageFromHtmlAttributes(attributes)
    blocks.push(`\`\`\`${language}\n${codeSource}\n\`\`\``)
    return _match
  })

  return blocks.join("\n\n")
}

export const restoreEmptyFencedCodeBlocks = (content: string, recoveredContent: string) => {
  const recoveredBlocks = extractNonEmptyFencedCodeBlocks(recoveredContent)
  if (recoveredBlocks.length === 0) return content

  let nextRecoveredIndex = 0
  const normalized = content.replace(/\r\n?/g, "\n")

  return normalized.replace(FENCED_CODE_BLOCK_REGEX, (match, leading, _marker, _info, codeBody) => {
    if (String(codeBody ?? "").trim().length > 0) return match

    const recoveredBlock = recoveredBlocks[nextRecoveredIndex]
    if (!recoveredBlock) return match
    nextRecoveredIndex += 1
    return `${leading}${recoveredBlock}`
  })
}

export const resolveEditorMetaSnapshot = (content: string, contentHtml?: string | null): ResolvedEditorMetaSnapshot => {
  const parsed = parseEditorMeta(content)
  const normalizedRawContent = content.replace(/\r\n?/g, "\n").trim()
  const markdownFromHtml = contentHtml?.trim() ? convertHtmlClipboardToMarkdown(contentHtml).trim() : ""
  const rawCodeMarkdownFromHtml = extractRawCodeFencedBlocksFromHtml(contentHtml)
  const recoveredCodeMarkdown = [rawCodeMarkdownFromHtml, markdownFromHtml].filter(Boolean).join("\n\n")
  const restoredParsedBody = parsed.body.trim() && recoveredCodeMarkdown
    ? restoreEmptyFencedCodeBlocks(parsed.body, recoveredCodeMarkdown)
    : parsed.body
  const resolvedBody = restoredParsedBody.trim() || markdownFromHtml || rawCodeMarkdownFromHtml || normalizedRawContent
  const parsedThumbnail = normalizeSafeImageUrl(parsed.thumbnail)
  const fallbackThumbnail = normalizeSafeImageUrl(extractFirstMarkdownImage(resolvedBody))
  const syncedThumbnail = stripThumbnailFocusFromUrl(parsedThumbnail || fallbackThumbnail)
  const syncedThumbnailFocusX = parseThumbnailFocusXFromUrl(
    parsedThumbnail || fallbackThumbnail,
    DEFAULT_THUMBNAIL_FOCUS_X
  )
  const syncedThumbnailFocusY = parseThumbnailFocusYFromUrl(
    parsedThumbnail || fallbackThumbnail,
    DEFAULT_THUMBNAIL_FOCUS_Y
  )
  const syncedThumbnailZoom = parseThumbnailZoomFromUrl(parsedThumbnail || fallbackThumbnail, DEFAULT_THUMBNAIL_ZOOM)

  return {
    body: resolvedBody,
    tags: parsed.tags,
    category: parsed.category,
    summary: normalizePersistedSummary(parsed.summary),
    thumbnailUrl: syncedThumbnail,
    thumbnailFocusX: syncedThumbnailFocusX,
    thumbnailFocusY: syncedThumbnailFocusY,
    thumbnailZoom: syncedThumbnailZoom,
  }
}

export const buildEditorStateFingerprint = ({
  title,
  content,
  summary,
  thumbnailUrl,
  thumbnailFocusX,
  thumbnailFocusY,
  thumbnailZoom,
  tags,
  category,
  visibility,
}: {
  title: string
  content: string
  summary: string
  thumbnailUrl: string
  thumbnailFocusX: number
  thumbnailFocusY: number
  thumbnailZoom: number
  tags: string[]
  category: string
  visibility: PostVisibility
}) =>
  JSON.stringify({
    title,
    content,
    summary,
    thumbnailUrl,
    thumbnailFocusX,
    thumbnailFocusY,
    thumbnailZoom,
    tags: dedupeStrings(tags),
    category: category ? normalizeCategoryValue(category) : "",
    visibility,
  })

export const parseEditorMeta = (content: string): ParsedEditorMeta => {
  let trimmed = content.replace(/\r\n?/g, "\n").trimStart()
  const tags: string[] = []
  let category = ""
  let summary = ""
  let thumbnail = ""

  const pushTags = (items: string[]) => {
    dedupeStrings(items).forEach((item) => {
      if (!tags.includes(item)) tags.push(item)
    })
  }

  const setCategory = (items: string[]) => {
    const nextCategory = dedupeStrings(items).map(normalizeCategoryValue)[0] || ""
    if (nextCategory) category = nextCategory
  }

  const frontmatterSplit = splitFrontmatterBlock(trimmed)
  if (frontmatterSplit.metadataLines.length > 0) {
    frontmatterSplit.metadataLines.forEach((line) => {
      const [rawKey, ...rest] = line.split(":")
      if (!rawKey || rest.length === 0) return
      const key = rawKey.trim().toLowerCase()
      const value = rest.join(":").trim()
      if (!value) return

      if (key === "tags" || key === "tag") pushTags(normalizeMetaItems(value))
      if (key === "category" || key === "categories") setCategory(normalizeMetaItems(value))
      if (key === "summary") summary = normalizeMetaScalar(value)
      if (key === "thumbnail" || key === "thumb" || key === "cover" || key === "coverimage" || key === "cover_image") {
        thumbnail = normalizeMetaScalar(value)
      }
    })
    trimmed = frontmatterSplit.body.trimStart()
  }

  const leadingMetadataSplit = stripLeadingEditorMetadataLines(trimmed)
  if (leadingMetadataSplit.consumed > 0) {
    trimmed
      .split("\n")
      .slice(0, leadingMetadataSplit.consumed)
      .forEach((line) => {
        const match = line.match(LEADING_EDITOR_METADATA_LINE_REGEX)
        if (!match) return

        const key = match[1].toLowerCase()
        const value = match[2]
        if (key === "tag" || key === "tags") pushTags(normalizeMetaItems(value))
        if (key === "category" || key === "categories") setCategory(normalizeMetaItems(value))
        if (key === "summary") summary = normalizeMetaScalar(value)
        if (key === "thumbnail" || key === "thumb" || key === "cover" || key === "coverimage" || key === "cover_image") {
          thumbnail = normalizeMetaScalar(value)
        }
      })
    trimmed = leadingMetadataSplit.body
  }

  return {
    body: resolveEditorBodyFallback(content, trimmed),
    tags,
    category,
    summary,
    thumbnail,
  }
}

const serializeMetaItems = (items: string[]) => items.map((item) => JSON.stringify(item)).join(", ")

export const composeEditorContent = (
  body: string,
  tags: string[],
  options?: { category?: string; summary?: string; thumbnail?: string }
) => {
  const normalizedBody = body.trim()
  const normalizedTags = dedupeStrings(tags)
  const normalizedCategory = options?.category ? normalizeCategoryValue(options.category) : ""
  const normalizedSummary = normalizePersistedSummary(options?.summary)
  const normalizedThumbnail = options?.thumbnail?.trim() || ""
  const metadataLines: string[] = []

  if (normalizedTags.length > 0) metadataLines.push(`tags: [${serializeMetaItems(normalizedTags)}]`)
  if (normalizedCategory) metadataLines.push(`category: [${serializeMetaItems([normalizedCategory])}]`)
  if (normalizedThumbnail) metadataLines.push(`thumbnail: ${JSON.stringify(normalizedThumbnail)}`)
  if (normalizedSummary) metadataLines.push(`summary: ${JSON.stringify(normalizedSummary)}`)

  if (metadataLines.length === 0) return normalizedBody
  if (!normalizedBody) return `---\n${metadataLines.join("\n")}\n---`

  return `---\n${metadataLines.join("\n")}\n---\n\n${normalizedBody}`
}

export const buildLocalDraftFingerprint = (payload: Omit<LocalDraftPayload, "savedAt">) =>
  JSON.stringify(payload)

export const detectPublishPlaceholderIssue = (content: string): string | null => {
  let inFence = false

  for (const rawLine of content.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    if (/^```/.test(trimmed)) {
      inFence = !inFence
      continue
    }

    if (inFence || trimmed.startsWith(">")) continue

    if (trimmed === EDITOR_BODY_PLACEHOLDER) {
      return "본문에 기본 placeholder 문구가 남아 있습니다. 실제 내용으로 교체한 뒤 다시 시도해주세요."
    }

    if (trimmed === `:::toggle ${EDITOR_TOGGLE_TITLE_PLACEHOLDER}`) {
      return "토글 제목이 기본값으로 남아 있습니다. 실제 제목으로 바꾼 뒤 다시 시도해주세요."
    }
  }

  return null
}
