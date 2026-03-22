import type { NextApiRequest, NextApiResponse } from "next"

type RumBody = {
  name?: unknown
  value?: unknown
  id?: unknown
  rating?: unknown
  delta?: unknown
  navigationType?: unknown
  path?: unknown
}

const MAX_PATH_LENGTH = 260
const MAX_METRIC_ID_LENGTH = 120
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
  const metricId = toSafeString(body.id, MAX_METRIC_ID_LENGTH)
  const path = toSafeString(body.path, MAX_PATH_LENGTH)
  const value = toSafeNumber(body.value)
  const delta = toSafeNumber(body.delta)
  const navigationType = toSafeString(body.navigationType, 40)

  if (!ALLOWED_METRICS.has(name) || value === null) {
    return res.status(204).end()
  }

  const normalizedRating = ALLOWED_RATINGS.has(rating) ? rating : "unknown"
  if (!LOG_SLOW_ONLY || normalizedRating !== "good") {
    console.info(
      `[rum:vitals] name=${name} rating=${normalizedRating} value=${value.toFixed(4)} delta=${
        delta !== null ? delta.toFixed(4) : "n/a"
      } path="${path || "/"}" nav=${navigationType || "unknown"} id=${metricId || "n/a"}`
    )
  }

  return res.status(204).end()
}

