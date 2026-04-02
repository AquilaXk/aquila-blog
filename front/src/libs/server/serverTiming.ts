import { IncomingMessage, ServerResponse } from "http"

type ServerTimingMetric = {
  name: string
  durationMs: number
  description?: string
}

const sanitizeToken = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "")

const sanitizeDescription = (value: string) => value.replace(/"/g, "").trim()

const SSR_DEBUG_QUERY_KEY = "__debugSsr"
const SSR_DEBUG_HEADER = "x-aquila-debug-ssr"
const SSR_DEBUG_RESPONSE_HEADER = "X-Aquila-Ssr-Timing"

const formatMetric = ({ name, durationMs, description }: ServerTimingMetric) => {
  const token = sanitizeToken(name)
  const parts = [`${token};dur=${durationMs.toFixed(1)}`]
  if (description) {
    const normalized = sanitizeDescription(description)
    if (normalized) parts.push(`desc="${normalized}"`)
  }
  return parts.join(";")
}

const buildMetricsHeaderValue = (metrics: ServerTimingMetric[]) => metrics.map(formatMetric).join(", ")

const appendVary = (res: ServerResponse, token: string) => {
  const current = res.getHeader("Vary")
  if (!current) {
    res.setHeader("Vary", token)
    return
  }

  const currentValue = Array.isArray(current) ? current.join(", ") : String(current)
  const tokens = currentValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  if (!tokens.some((item) => item.toLowerCase() === token.toLowerCase())) {
    tokens.push(token)
  }

  res.setHeader("Vary", tokens.join(", "))
}

export const isSsrDebugEnabled = (req: IncomingMessage) => {
  const headerValue = req.headers[SSR_DEBUG_HEADER]
  if (typeof headerValue === "string" && headerValue.trim() === "1") return true
  if (Array.isArray(headerValue) && headerValue.some((item) => item.trim() === "1")) return true

  const rawUrl = typeof req.url === "string" ? req.url : "/"
  try {
    const url = new URL(rawUrl, "http://localhost")
    return url.searchParams.get(SSR_DEBUG_QUERY_KEY) === "1"
  } catch {
    return false
  }
}

export const appendServerTiming = (res: ServerResponse, metrics: ServerTimingMetric[]) => {
  if (metrics.length === 0) return

  const current = res.getHeader("Server-Timing")
  const serialized = buildMetricsHeaderValue(metrics)

  if (typeof current === "string" && current.trim()) {
    res.setHeader("Server-Timing", `${current}, ${serialized}`)
    return
  }

  if (Array.isArray(current) && current.length > 0) {
    res.setHeader("Server-Timing", [...current, serialized].join(", "))
    return
  }

  res.setHeader("Server-Timing", serialized)
}

export const appendSsrDebugTiming = (
  req: IncomingMessage,
  res: ServerResponse,
  metrics: ServerTimingMetric[]
) => {
  appendServerTiming(res, metrics)
  if (!isSsrDebugEnabled(req) || metrics.length === 0) return

  appendVary(res, SSR_DEBUG_HEADER)
  res.setHeader(SSR_DEBUG_RESPONSE_HEADER, buildMetricsHeaderValue(metrics))
}

export const timed = async <T>(action: () => Promise<T>) => {
  const startedAt = performance.now()
  try {
    return {
      ok: true as const,
      value: await action(),
      durationMs: performance.now() - startedAt,
    }
  } catch (error) {
    return {
      ok: false as const,
      error,
      durationMs: performance.now() - startedAt,
    }
  }
}
