import type { NextApiRequest, NextApiResponse } from "next"

type ClientErrorBody = {
  id?: unknown
  boundary?: unknown
  surface?: unknown
  path?: unknown
  errorName?: unknown
  occurredAt?: unknown
  requestId?: unknown
}

const ALLOWED_BOUNDARIES = new Set(["global", "surface"])
const ALLOWED_SURFACES = new Set(["app", "markdown", "editor"])
const SAFE_TEXT = /^[A-Za-z0-9_./:-]+$/
const MAX_REQUEST_ID_LENGTH = 64

const toSafeString = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
  return SAFE_TEXT.test(normalized) ? normalized : ""
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

  if (id && ALLOWED_BOUNDARIES.has(boundary) && ALLOWED_SURFACES.has(surface) && path && errorName && occurredAt) {
    console.info("[rum:client-error] boundary caught client render error", {
      id,
      boundary,
      surface,
      path,
      errorName,
      occurredAt,
      ...(requestId ? { requestId } : {}),
    })
  }

  return res.status(204).end()
}
