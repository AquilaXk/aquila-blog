import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)

const readArg = (name, fallback = "") => {
  const prefix = `--${name}=`
  const inline = args.find((arg) => arg.startsWith(prefix))
  if (inline) return inline.slice(prefix.length)

  const index = args.indexOf(`--${name}`)
  if (index >= 0) {
    const value = args[index + 1]
    if (value && !value.startsWith("--")) return value
    return "true"
  }

  return fallback
}

const hasFlag = (name) => args.includes(`--${name}`)
const cwd = process.cwd()
const metricsPath = path.resolve(
  cwd,
  readArg("metrics", process.env.PLAYWRIGHT_PERF_RUNTIME_METRICS_PATH || "test-results/perf/runtime-guard-metrics.ndjson")
)
const baselinePath = path.resolve(
  cwd,
  readArg(
    "baseline",
    process.env.RUNTIME_GUARD_BASELINE_PATH || "../deploy/homeserver/monitoring/grafana/dashboards/blog-runtime-guard-baseline.json"
  )
)
const outputPath = path.resolve(cwd, readArg("output", "test-results/perf/runtime-guard-summary.md"))
const jsonOutputPath = path.resolve(cwd, readArg("json-output", "test-results/perf/runtime-guard-summary.json"))
const appendStepSummary =
  hasFlag("append-step-summary") || process.env.RUNTIME_GUARD_APPEND_STEP_SUMMARY === "true"

const ensureOutputDir = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
}

const writeFile = (targetPath, content) => {
  ensureOutputDir(targetPath)
  fs.writeFileSync(targetPath, content, "utf8")
}

const appendSummary = (markdown) => {
  if (!appendStepSummary) return
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  fs.appendFileSync(summaryPath, `${markdown}\n`, "utf8")
}

const safeReadJson = (targetPath, label) => {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} 파싱 실패: ${message}`)
  }
}

const toNumber = (raw, fallback = NaN) => {
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

const readMetricsRows = (targetPath) => {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`metrics 파일이 없습니다: ${targetPath}`)
  }

  const lines = fs
    .readFileSync(targetPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const rows = []
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`metrics NDJSON 파싱 실패: ${message}`)
    }
  }
  return rows
}

const evaluateMetric = (baselineMetric, actualRow) => {
  if (!actualRow) {
    return {
      status: "missing",
      value: null,
      budgetWarn: baselineMetric.warn,
      budgetFail: baselineMetric.fail,
      message: "측정값이 없습니다.",
    }
  }

  const value = toNumber(actualRow.value)
  if (!Number.isFinite(value)) {
    return {
      status: "missing",
      value: null,
      budgetWarn: baselineMetric.warn,
      budgetFail: baselineMetric.fail,
      message: "측정값이 숫자가 아닙니다.",
    }
  }

  const direction = baselineMetric.direction || "lte"
  if (direction !== "lte") {
    return {
      status: "missing",
      value,
      budgetWarn: baselineMetric.warn,
      budgetFail: baselineMetric.fail,
      message: `지원하지 않는 방향(direction=${direction})`,
    }
  }

  if (value > baselineMetric.fail) {
    return {
      status: "fail",
      value,
      budgetWarn: baselineMetric.warn,
      budgetFail: baselineMetric.fail,
      message: "fail 임계값을 초과했습니다.",
    }
  }
  if (value > baselineMetric.warn) {
    return {
      status: "warn",
      value,
      budgetWarn: baselineMetric.warn,
      budgetFail: baselineMetric.fail,
      message: "warn 임계값을 초과했습니다.",
    }
  }
  return {
    status: "pass",
    value,
    budgetWarn: baselineMetric.warn,
    budgetFail: baselineMetric.fail,
    message: "예산 범위 내입니다.",
  }
}

const formatValue = (value, unit) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-"
  if (unit === "ratio") return value.toFixed(4)
  return value.toFixed(2)
}

const baseline = safeReadJson(baselinePath, "baseline")
const metricsRows = readMetricsRows(metricsPath)
const latestByMetric = new Map()

for (const row of metricsRows) {
  if (!row || typeof row.metric !== "string") continue
  const previous = latestByMetric.get(row.metric)
  if (!previous) {
    latestByMetric.set(row.metric, row)
    continue
  }
  const previousAt = new Date(previous.recordedAt || 0).getTime()
  const currentAt = new Date(row.recordedAt || 0).getTime()
  if (currentAt >= previousAt) {
    latestByMetric.set(row.metric, row)
  }
}

const comparisons = []
let failCount = 0
let warnCount = 0
let passCount = 0
let missingCount = 0

for (const metricBaseline of baseline.metrics || []) {
  const actual = latestByMetric.get(metricBaseline.metric)
  const result = evaluateMetric(metricBaseline, actual)
  if (result.status === "fail") failCount += 1
  if (result.status === "warn") warnCount += 1
  if (result.status === "pass") passCount += 1
  if (result.status === "missing") missingCount += 1

  comparisons.push({
    metric: metricBaseline.metric,
    label: metricBaseline.label || metricBaseline.metric,
    section: metricBaseline.section || "-",
    panel: metricBaseline.panel || "-",
    unit: metricBaseline.unit || "ms",
    status: result.status,
    value: result.value,
    warn: result.budgetWarn,
    fail: result.budgetFail,
    message: result.message,
  })
}

const summaryLines = []
summaryLines.push("# Runtime Guard Comparison")
summaryLines.push("")
summaryLines.push(`- generatedAt: ${new Date().toISOString()}`)
summaryLines.push(`- baseline: \`${baselinePath}\``)
summaryLines.push(`- metrics: \`${metricsPath}\``)
summaryLines.push(`- dashboardUid: ${baseline.sourceDashboard?.uid || "-"}`)
summaryLines.push(`- pass: ${passCount}`)
summaryLines.push(`- warn: ${warnCount}`)
summaryLines.push(`- fail: ${failCount}`)
summaryLines.push(`- missing: ${missingCount}`)
summaryLines.push("")
summaryLines.push("| Metric | Section | Dashboard Panel | Value | Warn | Fail | Status |")
summaryLines.push("| --- | --- | --- | ---: | ---: | ---: | --- |")
for (const row of comparisons) {
  summaryLines.push(
    `| ${row.label} | ${row.section} | ${row.panel} | ${formatValue(row.value, row.unit)} | ${formatValue(row.warn, row.unit)} | ${formatValue(row.fail, row.unit)} | ${row.status} |`
  )
}

summaryLines.push("")
summaryLines.push("## Notes")
if (comparisons.length === 0) {
  summaryLines.push("- 비교할 baseline metric이 없습니다.")
} else {
  for (const row of comparisons) {
    summaryLines.push(`- ${row.label}: ${row.message}`)
  }
}

const summaryMarkdown = summaryLines.join("\n")
const summaryJson = {
  generatedAt: new Date().toISOString(),
  baselinePath,
  metricsPath,
  sourceDashboard: baseline.sourceDashboard || null,
  counts: {
    pass: passCount,
    warn: warnCount,
    fail: failCount,
    missing: missingCount,
  },
  comparisons,
}

writeFile(outputPath, summaryMarkdown)
writeFile(jsonOutputPath, `${JSON.stringify(summaryJson, null, 2)}\n`)
appendSummary(summaryMarkdown)

console.log(`[runtime-guard] summary written: ${outputPath}`)
console.log(`[runtime-guard] summary json written: ${jsonOutputPath}`)

if (failCount > 0 || missingCount > 0) {
  console.error(`[runtime-guard] regression detected (fail=${failCount}, missing=${missingCount})`)
  process.exit(1)
}

if (warnCount > 0) {
  console.warn(`[runtime-guard] warning detected (warn=${warnCount})`)
}
