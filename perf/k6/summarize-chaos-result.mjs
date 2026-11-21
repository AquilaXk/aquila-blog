#!/usr/bin/env node
import fs from "node:fs"

const [, , summaryPath, caseName = "case"] = process.argv

if (!summaryPath) {
  console.error("[ERR] usage: summarize-chaos-result.mjs <summary-json> [case-name]")
  process.exit(2)
}

const raw = fs.readFileSync(summaryPath, "utf8")
const summary = JSON.parse(raw)
const metrics = summary.metrics || {}

const metricValue = (metricName, key, fallback = NaN) => {
  const metric = metrics[metricName]
  if (!metric || !metric.values) return fallback
  const value = metric.values[key]
  return Number.isFinite(value) ? value : fallback
}

const successRate = metricValue("chaos_read_success_rate", "rate", 0)
const feedP95 = metricValue("chaos_feed_duration_ms", "p(95)")
const feedP99 = metricValue("chaos_feed_duration_ms", "p(99)")
const exploreP95 = metricValue("chaos_explore_duration_ms", "p(95)")
const exploreP99 = metricValue("chaos_explore_duration_ms", "p(99)")
const detailP95 = metricValue("chaos_detail_duration_ms", "p(95)")
const detailP99 = metricValue("chaos_detail_duration_ms", "p(99)")
const httpFailedRate = metricValue("http_req_failed", "rate", 0)

const checks = [
  ["successRate>=0.95", successRate >= 0.95],
  ["feedP95<2500", feedP95 < 2500],
  ["exploreP95<2500", exploreP95 < 2500],
  ["detailP95<1800", detailP95 < 1800],
]

const passed = checks.every(([, ok]) => ok)
const checkSummary = checks.map(([name, ok]) => `${name}:${ok ? "ok" : "fail"}`).join(" ")

console.log(
  `[chaos-summary] case=${caseName} successRate=${successRate.toFixed(4)} httpReqFailed=${httpFailedRate.toFixed(4)} ` +
    `feedP95=${Number.isFinite(feedP95) ? feedP95.toFixed(2) : "n/a"} feedP99=${Number.isFinite(feedP99) ? feedP99.toFixed(2) : "n/a"} ` +
    `exploreP95=${Number.isFinite(exploreP95) ? exploreP95.toFixed(2) : "n/a"} exploreP99=${Number.isFinite(exploreP99) ? exploreP99.toFixed(2) : "n/a"} ` +
    `detailP95=${Number.isFinite(detailP95) ? detailP95.toFixed(2) : "n/a"} detailP99=${Number.isFinite(detailP99) ? detailP99.toFixed(2) : "n/a"} ` +
    `${checkSummary}`
)

if (!passed) {
  process.exit(1)
}
