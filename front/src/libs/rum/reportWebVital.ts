import type { NextWebVitalsMetric } from "next/app"
import * as gtag from "src/libs/gtag"
import { CONFIG } from "site.config"

type RumMetricPayload = {
  name: NextWebVitalsMetric["name"]
  value: number
  id: string
  rating: "good" | "needs-improvement" | "poor" | "unknown"
  delta: number
  navigationType?: string
  path: string
}

const RUM_ENDPOINT = "/api/rum/vitals"
const ALLOWED_METRICS = new Set<NextWebVitalsMetric["name"]>([
  "CLS",
  "FCP",
  "INP",
  "LCP",
  "TTFB",
])

const toSampleRate = () => {
  const raw = Number(process.env.NEXT_PUBLIC_RUM_SAMPLE_RATE || "0.2")
  if (!Number.isFinite(raw)) return 0.2
  return Math.min(1, Math.max(0, raw))
}

const shouldSendMetric = (metric: NextWebVitalsMetric) => {
  if (!ALLOWED_METRICS.has(metric.name)) return false
  if (typeof window === "undefined") return false
  const sampleRate = toSampleRate()
  if (sampleRate <= 0) return false
  return Math.random() <= sampleRate
}

const sendToApi = (payload: RumMetricPayload) => {
  const body = JSON.stringify(payload)

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" })
      navigator.sendBeacon(RUM_ENDPOINT, blob)
      return
    } catch {
      // fallback to fetch below
    }
  }

  void fetch(RUM_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // ignore
  })
}

const sendToAnalytics = (metric: NextWebVitalsMetric) => {
  if (!(CONFIG.isProd && CONFIG.googleAnalytics?.enable)) return
  gtag.event({
    action: "web_vital",
    category: metric.name,
    label: metric.id,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
  })
}

export const reportWebVital = (metric: NextWebVitalsMetric) => {
  if (!shouldSendMetric(metric)) return

  const metricWithDetail = metric as NextWebVitalsMetric & {
    rating?: "good" | "needs-improvement" | "poor"
    delta?: number
    navigationType?: string
  }

  const payload: RumMetricPayload = {
    name: metric.name,
    value: metric.value,
    id: metric.id,
    rating: metricWithDetail.rating || "unknown",
    delta: typeof metricWithDetail.delta === "number" ? metricWithDetail.delta : metric.value,
    navigationType: metricWithDetail.navigationType,
    path: window.location.pathname,
  }

  sendToApi(payload)
  sendToAnalytics(metric)
}
