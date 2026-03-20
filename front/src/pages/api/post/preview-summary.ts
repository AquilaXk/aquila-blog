import type { NextApiRequest, NextApiResponse } from "next"
import { serverApiFetch } from "src/libs/server/backend"

type PreviewSummaryRequestBody = {
  title?: unknown
  content?: unknown
  maxLength?: unknown
}

type PreviewSummaryErrorResponse = {
  message: string
}

type PreviewSummarySuccessResponse = {
  resultCode: string
  msg: string
  data: {
    summary: string
    provider: "rule" | "gemini"
    model: string | null
    reason: string | null
    traceId?: string | null
    debug?: {
      cacheStatus?: string | null
      promptLength?: number | null
      promptPreview?: string | null
      strictResponseStatus?: number | null
      strictResponsePreview?: string | null
      relaxedRetried?: boolean | null
      relaxedResponseStatus?: number | null
      relaxedResponsePreview?: string | null
      parsedSummaryLength?: number | null
      parsedSummaryPreview?: string | null
    } | null
  }
}

const MAX_TITLE_LENGTH = 300
const MAX_CONTENT_LENGTH = 50_000
const MIN_SUMMARY_LENGTH = 80
const MAX_SUMMARY_LENGTH = 220
const PREVIEW_SUMMARY_PROXY_TIMEOUT_MS = 45_000

const toStringOrEmpty = (value: unknown): string => (typeof value === "string" ? value : "")

const toOptionalNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

const codeFenceRegex = /```[\s\S]*?```/g
const markdownImageRegex = /!\[[^\]]*]\(([^)]+)\)/g
const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
const markdownPunctuationRegex = /[#>*_~`|]/g
const whitespaceRegex = /\s+/g

const makeRuleSummary = (content: string, maxLength: number): string => {
  const normalized =
    content
      .replace(codeFenceRegex, " ")
      .replace(markdownImageRegex, " ")
      .replace(markdownLinkRegex, "$1")
      .replace(markdownPunctuationRegex, " ")
      .replace(whitespaceRegex, " ")
      .trim()

  const fallback =
    normalized ||
    content.replace(whitespaceRegex, " ").trim() ||
    "요약을 생성할 수 없습니다."

  if (fallback.length <= maxLength) return fallback
  return `${fallback.slice(0, maxLength).trim()}...`
}

const buildRuleFallbackResponse = (
  content: string,
  maxLength: number,
  reason: string
): PreviewSummarySuccessResponse => ({
  resultCode: "200-1",
  msg: "규칙 기반 요약을 생성했습니다.",
  data: {
    summary: makeRuleSummary(content, maxLength),
    provider: "rule",
    model: null,
    reason,
    traceId: null,
    debug: null,
  },
})

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PreviewSummaryErrorResponse | PreviewSummarySuccessResponse | unknown>
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const body = (req.body || {}) as PreviewSummaryRequestBody
  const title = toStringOrEmpty(body.title)
  const content = toStringOrEmpty(body.content)
  const maxLength = toOptionalNumber(body.maxLength)

  if (!content.trim()) {
    return res.status(400).json({ message: "본문을 입력해주세요." })
  }

  if (title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ message: `제목은 ${MAX_TITLE_LENGTH}자 이하여야 합니다.` })
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ message: `본문은 ${MAX_CONTENT_LENGTH.toLocaleString()}자 이하여야 합니다.` })
  }

  if (maxLength !== null && (maxLength < MIN_SUMMARY_LENGTH || maxLength > MAX_SUMMARY_LENGTH)) {
    return res
      .status(400)
      .json({ message: `요약 길이는 ${MIN_SUMMARY_LENGTH}~${MAX_SUMMARY_LENGTH}자 범위만 지원합니다.` })
  }

  try {
    const upstreamResponse = await serverApiFetch(req, "/post/api/v1/adm/posts/preview-summary", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        content,
        maxLength: maxLength ?? undefined,
      }),
      timeoutMs: PREVIEW_SUMMARY_PROXY_TIMEOUT_MS,
    })

    const responseText = await upstreamResponse.text()
    if (!upstreamResponse.ok && upstreamResponse.status >= 500) {
      const reason = `proxy-upstream-${upstreamResponse.status}`
      console.error(
        "[api/post/preview-summary] upstream 5xx fallback:",
        upstreamResponse.status,
        responseText.slice(0, 500)
      )
      return res.status(200).json(buildRuleFallbackResponse(content, maxLength ?? 150, reason))
    }

    const responseContentType = upstreamResponse.headers.get("content-type")?.trim()

    if (responseContentType) {
      res.setHeader("Content-Type", responseContentType)
    } else {
      res.setHeader("Content-Type", "application/json; charset=utf-8")
    }

    res.status(upstreamResponse.status)
    return res.send(responseText)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to proxy preview summary request."
    console.error("[api/post/preview-summary] proxy failed:", error)
    console.error("[api/post/preview-summary] fallback reason:", message)
    return res.status(200).json(buildRuleFallbackResponse(content, maxLength ?? 150, "proxy-transport"))
  }
}
