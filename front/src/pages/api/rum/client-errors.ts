import type { NextApiRequest, NextApiResponse } from "next"

type ClientErrorBody = {
  id?: unknown
  boundary?: unknown
  surface?: unknown
  path?: unknown
  errorName?: unknown
  occurredAt?: unknown
  requestId?: unknown
  errorMessage?: unknown
  stackTop?: unknown
  category?: unknown
  status?: unknown
  url?: unknown
}

const ALLOWED_BOUNDARIES = new Set(["global", "surface"])
const ALLOWED_SURFACES = new Set(["app", "markdown", "editor"])
const ALLOWED_CATEGORIES = new Set([
  "validation",
  "auth",
  "forbidden",
  "notFound",
  "conflict",
  "rateLimit",
  "payloadTooLarge",
  "server",
  "network",
  "timeout",
])
const SAFE_TEXT = /^[A-Za-z0-9_./:-]+$/
const SAFE_STACK_TOP = /^[A-Za-z0-9_$@./:<>,|-]+$/
const MAX_REQUEST_ID_LENGTH = 64
const MAX_ERROR_MESSAGE_LENGTH = 200
const MAX_STACK_TOP_LENGTH = 500
const MAX_URL_PATH_LENGTH = 260

const toSafeString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
  return SAFE_TEXT.test(normalized) ? normalized : ""
}

const toSafeErrorMessage = (value: unknown) => {
  if (typeof value !== "string") return ""
  return value
    .replace(/https?:\/\/[^\s]+/gi, "[url]")
    .replace(/\bwww\.[^\s]+/gi, "[url]")
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[email]")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ERROR_MESSAGE_LENGTH)
}

const toSafeStackTop = (value: unknown) => {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/[\r\n\t]/g, "|").replace(/\s+/g, "").trim().slice(0, MAX_STACK_TOP_LENGTH)
  if (!normalized || !SAFE_STACK_TOP.test(normalized)) return ""
  return normalized
}

const toSafeStatus = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const status = Math.trunc(value)
    if (status >= 100 && status <= 599) return status
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      const status = Math.trunc(parsed)
      if (status >= 100 && status <= 599) return status
    }
  }
  return null
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const body = (req.body || {}) as ClientErrorBody
  const id = toSafeString(body.id, 80)
  const boundary = toSafeString(body.boundary, 16)
  const surface = toSafeString(body.surface, 40)
  const path = toSafeString(body.path, 260)
  const errorName = toSafeString(body.errorName, 80)
  const occurredAt = toSafeString(body.occurredAt, 40)
  const requestId = toSafeString(body.requestId, MAX_REQUEST_ID_LENGTH)
  const errorMessage = toSafeErrorMessage(body.errorMessage)
  const stackTop = toSafeStackTop(body.stackTop)
  const categoryRaw = toSafeString(body.category, 40)
  const category = ALLOWED_CATEGORIES.has(categoryRaw) ? categoryRaw : ""
  const status = toSafeStatus(body.status)
  const url = toSafeString(body.url, MAX_URL_PATH_LENGTH)

  if (id && ALLOWED_BOUNDARIES.has(boundary) && ALLOWED_SURFACES.has(surface) && path && errorName && occurredAt) {
    console.info("[rum:client-error] boundary caught client render error", {
      id,
      boundary,
      surface,
      path,
      errorName,
      occurredAt,
      ...(requestId ? { requestId } : {}),
      ...(errorMessage ? { errorMessage } : {}),
      ...(stackTop ? { stackTop } : {}),
      ...(category ? { category } : {}),
      ...(status !== null ? { status } : {}),
      ...(url ? { url } : {}),
    })
  }

  return res.status(204).end()
}
