import type { NextApiRequest, NextApiResponse } from "next"

type RumBody = {
  name?: unknown
  value?: unknown
  id?: unknown
  rating?: unknown
  delta?: unknown
  navigationType?: unknown
  path?: unknown
  attribution?: unknown
  context?: unknown
}

type RumAttribution = {
  target?: unknown
  eventType?: unknown
  resourceUrl?: unknown
}

type RumContext = {
  detailSection?: unknown
  scrollY?: unknown
}

const LOG_SLOW_ONLY = (process.env.RUM_LOG_SLOW_ONLY || "true").toLowerCase() !== "false"
const ALLOWED_METRICS = new Set(["CLS", "FCP", "INP", "LCP", "TTFB"])
const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"])

const toSafeString = (value: unknown, maxLength: number) =>
  typeof value === "string"
    ? value.replace(/[\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength)
    : ""

const toSafeNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).json({ message: "Method Not Allowed" })
  }

  const body = (req.body || {}) as RumBody
  const name = toSafeString(body.name, 12)
  const rating = toSafeString(body.rating, 20)
  const value = toSafeNumber(body.value)
  // delta/path/navigation/attribution/id 는 로깅에 사용하지 않습니다.
  // 사용자 입력 문자열을 로그에 직접 남기지 않아 log injection 경로를 차단합니다.
  toSafeNumber(body.delta)
  toSafeString(body.navigationType, 40)
  const rawAttribution = (body.attribution || {}) as RumAttribution
  toSafeString(rawAttribution.target, 160)
  toSafeString(rawAttribution.eventType, 48)
  toSafeString(rawAttribution.resourceUrl, 240)
  const rawContext = (body.context || {}) as RumContext
  toSafeString(rawContext.detailSection, 24)
  toSafeNumber(rawContext.scrollY)
  toSafeString(body.id, 120)
  toSafeString(body.path, 260)

  if (!ALLOWED_METRICS.has(name) || value === null) {
    return res.status(204).end()
  }

  const normalizedRating = ALLOWED_RATINGS.has(rating) ? rating : "unknown"
  if (!LOG_SLOW_ONLY || normalizedRating !== "good") {
    console.info("[rum:vitals] slow metric observed")
  }

  return res.status(204).end()
}
