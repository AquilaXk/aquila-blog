import type { NextApiRequest, NextApiResponse } from "next"
import { serverApiFetch } from "src/libs/server/backend"

type RecommendTagsRequestBody = {
  title?: unknown
  content?: unknown
  existingTags?: unknown
  maxTags?: unknown
}

type RecommendTagsErrorResponse = {
  message: string
}

type RecommendTagsSuccessResponse = {
  resultCode: string
  msg: string
  data: {
    tags: string[]
    provider: "rule" | "gemini"
    model: string | null
    reason: string | null
    degraded?: boolean
    traceId?: string | null
  }
}

const MAX_TITLE_LENGTH = 300
const MAX_CONTENT_LENGTH = 50_000
const MAX_EXISTING_TAGS = 20
const MAX_TAG_LENGTH = 24
const MIN_TAGS = 3
const MAX_TAGS = 10
const RECOMMEND_TAGS_PROXY_TIMEOUT_MS = 12_000

const fencedCodeRegex = /```[\s\S]*?```/g
const markdownImageRegex = /!\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
const urlRegex = /https?:\/\/\S+/g
const punctuationRegex = /[#>*_~`|=+^:;!?.,(){}[\]/\\]/g
const whitespaceRegex = /\s+/g
const tokenRegex = /[\p{L}\p{N}_-]{2,24}/gu

const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "from",
  "into",
  "about",
  "blog",
  "post",
  "개발",
  "블로그",
  "정리",
  "기록",
  "문제",
  "해결",
  "코드",
  "기능",
])

const toStringOrEmpty = (value: unknown): string => (typeof value === "string" ? value : "")

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const toTagArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  const collected: string[] = []
  value.forEach((item) => {
    if (typeof item === "string") collected.push(item)
  })
  return collected
}

const normalizeTag = (raw: string): string => {
  const cleaned = raw.replace(/[\r\n]/g, " ").replace(/#/g, "").replace(whitespaceRegex, " ").trim()
  if (!cleaned) return ""
  if (cleaned.length < 2 || cleaned.length > MAX_TAG_LENGTH) return ""
  if (cleaned.includes("http://") || cleaned.includes("https://")) return ""
  return cleaned
}

const dedupeTags = (rawTags: string[], maxTags: number): string[] => {
  const map = new Map<string, string>()
  rawTags.forEach((tag) => {
    const normalized = normalizeTag(tag)
    if (!normalized) return
    const key = normalized.toLowerCase()
    if (!map.has(key) && map.size < maxTags) map.set(key, normalized)
  })
  return Array.from(map.values())
}

const tokenize = (source: string): string[] => {
  const normalized = source
    .replace(fencedCodeRegex, " ")
    .replace(markdownImageRegex, " ")
    .replace(markdownLinkRegex, "$1")
    .replace(urlRegex, " ")
    .replace(punctuationRegex, " ")
    .replace(whitespaceRegex, " ")
    .trim()

  if (!normalized) return []
  return (normalized.match(tokenRegex) || []).map((token) => token.trim()).filter(Boolean)
}

const makeRuleTags = (
  title: string,
  content: string,
  existingTags: string[],
  maxTags: number
): string[] => {
  const weighted = new Map<string, number>()
  const put = (token: string, weight: number) => {
    const normalized = normalizeTag(token)
    if (!normalized) return
    if (stopwords.has(normalized.toLowerCase())) return
    weighted.set(normalized, (weighted.get(normalized) || 0) + weight)
  }

  tokenize(title).forEach((token) => put(token, 3))
  tokenize(content).forEach((token) => put(token, 1))

  const ranked = [...weighted.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return b[0].length - a[0].length
    })
    .map(([tag]) => tag)

  return dedupeTags([...existingTags, ...ranked], maxTags)
}

const buildRuleFallbackResponse = (
  title: string,
  content: string,
  existingTags: string[],
  maxTags: number,
  reason: string
): RecommendTagsSuccessResponse => ({
  resultCode: "200-1",
  msg: "규칙 기반 태그 추천을 생성했습니다.",
  data: {
    tags: makeRuleTags(title, content, existingTags, maxTags),
    provider: "rule",
    model: null,
    reason,
    degraded: true,
    traceId: null,
  },
})

const applyDegradedHeaders = (res: NextApiResponse, reason: string) => {
  res.setHeader("X-Tag-Recommendation-Degraded", "1")
  res.setHeader("X-Tag-Recommendation-Degraded-Reason", reason)
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RecommendTagsErrorResponse | RecommendTagsSuccessResponse | unknown>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const body = (req.body || {}) as RecommendTagsRequestBody
  const title = toStringOrEmpty(body.title)
  const content = toStringOrEmpty(body.content)
  const existingTags = dedupeTags(toTagArray(body.existingTags), MAX_EXISTING_TAGS)
  const maxTags = toOptionalNumber(body.maxTags)
  const normalizedMaxTags = maxTags === null ? 6 : Math.max(MIN_TAGS, Math.min(MAX_TAGS, Math.round(maxTags)))

  if (!content.trim()) {
    return res.status(400).json({ message: "본문을 입력해주세요." })
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ message: `제목은 ${MAX_TITLE_LENGTH}자 이하여야 합니다.` })
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ message: `본문은 ${MAX_CONTENT_LENGTH.toLocaleString()}자 이하여야 합니다.` })
  }

  try {
    const upstreamResponse = await serverApiFetch(req, "/post/api/v1/adm/posts/recommend-tags", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content,
        existingTags,
        maxTags: normalizedMaxTags,
      }),
      timeoutMs: RECOMMEND_TAGS_PROXY_TIMEOUT_MS,
    })

    const responseText = await upstreamResponse.text()
    if (!upstreamResponse.ok && upstreamResponse.status >= 500) {
      const reason = `proxy-upstream-${upstreamResponse.status}`
      console.error("[api/post/recommend-tags] upstream 5xx fallback:", upstreamResponse.status, responseText.slice(0, 500))
      applyDegradedHeaders(res, reason)
      return res.status(200).json(buildRuleFallbackResponse(title, content, existingTags, normalizedMaxTags, reason))
    }

    const responseContentType = upstreamResponse.headers.get("content-type")?.trim()
    if (responseContentType) {
      res.setHeader("Content-Type", responseContentType)
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8")
    }

    let outgoingText = responseText
    const isJsonResponse = responseContentType?.toLowerCase().includes("application/json") ?? false
    if (isJsonResponse) {
      try {
        const payload = JSON.parse(responseText) as { data?: { provider?: string; reason?: string | null; degraded?: boolean } }
        if (payload?.data?.provider === "rule") {
          const reason = payload.data.reason?.trim() || "rule-fallback"
          applyDegradedHeaders(res, reason)
          if (typeof payload.data.degraded !== "boolean") {
            payload.data.degraded = true
            outgoingText = JSON.stringify(payload)
          }
        }
      } catch {
        // keep origin body
      }
    }

    res.status(upstreamResponse.status)
    return res.send(outgoingText)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to proxy recommend tags request."
    console.error("[api/post/recommend-tags] proxy failed:", error)
    console.error("[api/post/recommend-tags] fallback reason:", message)
    applyDegradedHeaders(res, "proxy-transport")
    return res.status(200).json(buildRuleFallbackResponse(title, content, existingTags, normalizedMaxTags, "proxy-transport"))
  }
}
