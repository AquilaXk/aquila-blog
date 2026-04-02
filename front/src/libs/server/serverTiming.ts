import { ServerResponse } from "http"

type ServerTimingMetric = {
  name: string
  durationMs: number
  description?: string
}

const sanitizeToken = (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "")

const sanitizeDescription = (value: string) => value.replace(/"/g, "").trim()

const formatMetric = ({ name, durationMs, description }: ServerTimingMetric) => {
  const token = sanitizeToken(name)
  const parts = [`${token};dur=${durationMs.toFixed(1)}`]
  if (description) {
    const normalized = sanitizeDescription(description)
    if (normalized) parts.push(`desc="${normalized}"`)
  }
  return parts.join(";")
}

export const appendServerTiming = (res: ServerResponse, metrics: ServerTimingMetric[]) => {
  if (metrics.length === 0) return

  const current = res.getHeader("Server-Timing")
  const serialized = metrics.map(formatMetric).join(", ")

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
