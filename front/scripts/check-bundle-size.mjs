import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

const cwd = process.cwd()
const nextDir = path.join(cwd, ".next")
const manifestPath = path.join(nextDir, "build-manifest.json")
const baselinePath = path.join(cwd, process.env.BUNDLE_BASELINE_PATH || "scripts/bundle-budget-baseline.json")
const reportDir = path.join(cwd, process.env.BUNDLE_REPORT_DIR || "test-results/bundle-size")
const enforcementMode = (process.env.BUNDLE_BUDGET_ENFORCEMENT || "strict").toLowerCase()
const marginPercent = Number(process.env.BUNDLE_BUDGET_MARGIN_PERCENT || "5")
const routes =
  (process.env.BUNDLE_ROUTES || "/,/posts/[id],/admin")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean)
const metrics = ["raw", "gzip", "brotli"]
const writeBaselineMode = process.argv.includes("--write-baseline")

if (!Number.isFinite(marginPercent) || marginPercent < 0) {
  console.error(`[bundle-size] invalid margin percent: ${process.env.BUNDLE_BUDGET_MARGIN_PERCENT}`)
  process.exit(1)
}

if (!fs.existsSync(manifestPath)) {
  console.error("[bundle-size] build-manifest.json not found. Run `yarn build` first.")
  process.exit(1)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
const fileStatCache = new Map()

const statChunkFile = (chunkPath) => {
  const cached = fileStatCache.get(chunkPath)
  if (cached) return cached

  const absolutePath = path.join(nextDir, chunkPath)
  if (!fs.existsSync(absolutePath)) return null

  const buffer = fs.readFileSync(absolutePath)
  const stat = {
    raw: buffer.length,
    gzip: zlib.gzipSync(buffer, { level: 9 }).length,
    brotli: zlib.brotliCompressSync(buffer, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  }
  fileStatCache.set(chunkPath, stat)
  return stat
}

const getRouteChunkFiles = (route) => {
  const appFiles = manifest.pages?.["/_app"] ?? []
  const routeFiles = manifest.pages?.[route] ?? []
  return [...new Set([...appFiles, ...routeFiles].filter((file) => file.endsWith(".js")))]
}

const collectRouteStats = (route) => {
  const chunkFiles = getRouteChunkFiles(route)
  if (chunkFiles.length === 0) {
    throw new Error(`no JS chunks found for route ${route}`)
  }

  const chunks = {}
  const totals = { raw: 0, gzip: 0, brotli: 0 }

  for (const file of chunkFiles) {
    const stat = statChunkFile(file)
    if (!stat) continue
    chunks[file] = stat
    for (const metric of metrics) {
      totals[metric] += stat[metric]
    }
  }

  return {
    chunkCount: Object.keys(chunks).length,
    chunks,
    totals,
  }
}

const collectCurrentStats = () => {
  const routeStats = {}
  for (const route of routes) {
    routeStats[route] = collectRouteStats(route)
  }
  return routeStats
}

const toKb = (value) => value / 1024

const ensureReportDirectory = () => {
  fs.mkdirSync(reportDir, { recursive: true })
}

const writeReportFiles = (report) => {
  ensureReportDirectory()
  const jsonPath = path.join(reportDir, "bundle-size-report.json")
  const markdownPath = path.join(reportDir, "bundle-size-report.md")
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))

  const lines = []
  lines.push("# Bundle Budget Report")
  lines.push("")
  lines.push(`- mode: ${report.meta.enforcementMode}`)
  lines.push(`- marginPercent: ${report.meta.marginPercent}`)
  lines.push(`- baselinePath: ${report.meta.baselinePath}`)
  lines.push(`- generatedAt: ${report.meta.generatedAt}`)
  lines.push("")
  lines.push("| Route | Metric | Current (KB) | Baseline (KB) | Budget (KB) | Delta (KB) | Status |")
  lines.push("| --- | --- | ---: | ---: | ---: | ---: | --- |")

  for (const item of report.routes) {
    for (const metricResult of item.metrics) {
      lines.push(
        `| ${item.route} | ${metricResult.metric} | ${metricResult.currentKb.toFixed(1)} | ${metricResult.baselineKb.toFixed(1)} | ${metricResult.budgetKb.toFixed(1)} | ${metricResult.deltaKb.toFixed(1)} | ${metricResult.status} |`
      )
    }
  }

  lines.push("")
  lines.push("## Top Chunk Increases")
  lines.push("")

  for (const metric of metrics) {
    lines.push(`### ${metric}`)
    const top = report.topChunkIncreases[metric]
    if (!top || top.length === 0) {
      lines.push("- none")
      lines.push("")
      continue
    }
    for (const entry of top) {
      lines.push(
        `- ${entry.route} | ${entry.chunk} | +${toKb(entry.deltaBytes).toFixed(1)}KB (current ${toKb(entry.currentBytes).toFixed(1)}KB)`
      )
    }
    lines.push("")
  }

  fs.writeFileSync(markdownPath, lines.join("\n"))
  console.log(`[bundle-size] report written: ${jsonPath}`)
  console.log(`[bundle-size] report written: ${markdownPath}`)
}

const buildTopChunkIncreases = (currentRoutes, baselineRoutes) => {
  const result = { raw: [], gzip: [], brotli: [] }

  for (const route of routes) {
    const currentChunks = currentRoutes[route]?.chunks ?? {}
    const baselineChunks = baselineRoutes[route]?.chunks ?? {}
    const chunkNames = new Set([...Object.keys(currentChunks), ...Object.keys(baselineChunks)])

    for (const chunk of chunkNames) {
      const current = currentChunks[chunk] ?? { raw: 0, gzip: 0, brotli: 0 }
      const baseline = baselineChunks[chunk] ?? { raw: 0, gzip: 0, brotli: 0 }

      for (const metric of metrics) {
        const delta = current[metric] - baseline[metric]
        if (delta <= 0) continue
        result[metric].push({
          route,
          chunk,
          deltaBytes: delta,
          currentBytes: current[metric],
        })
      }
    }
  }

  for (const metric of metrics) {
    result[metric].sort((a, b) => b.deltaBytes - a.deltaBytes)
    result[metric] = result[metric].slice(0, 15)
  }

  return result
}

const currentRoutes = collectCurrentStats()

if (writeBaselineMode) {
  const baselinePayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    routes: currentRoutes,
  }
  fs.writeFileSync(baselinePath, JSON.stringify(baselinePayload, null, 2))
  console.log(`[bundle-size] baseline updated: ${baselinePath}`)
  process.exit(0)
}

if (!fs.existsSync(baselinePath)) {
  console.error(`[bundle-size] baseline file not found: ${baselinePath}`)
  console.error("[bundle-size] run `yarn check:bundle-size:baseline` after a trusted build to initialize it.")
  process.exit(1)
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"))
const baselineRoutes = baseline.routes ?? {}
const routeResults = []
let hasOverBudget = false

for (const route of routes) {
  const current = currentRoutes[route]
  const base = baselineRoutes[route]
  if (!base || !base.totals) {
    console.error(`[bundle-size] baseline for route ${route} is missing. Update baseline first.`)
    process.exit(1)
  }

  const metricResults = metrics.map((metric) => {
    const currentBytes = current.totals[metric]
    const baselineBytes = base.totals[metric]
    const budgetBytes = Math.ceil(baselineBytes * (1 + marginPercent / 100))
    const deltaBytes = currentBytes - baselineBytes
    const overBudget = currentBytes > budgetBytes
    if (overBudget) hasOverBudget = true
    return {
      metric,
      currentBytes,
      baselineBytes,
      budgetBytes,
      deltaBytes,
      currentKb: toKb(currentBytes),
      baselineKb: toKb(baselineBytes),
      budgetKb: toKb(budgetBytes),
      deltaKb: toKb(deltaBytes),
      status: overBudget ? "OVER" : "OK",
    }
  })

  routeResults.push({
    route,
    chunkCount: current.chunkCount,
    metrics: metricResults,
  })
}

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    enforcementMode,
    marginPercent,
    baselinePath: path.relative(cwd, baselinePath),
    routes,
  },
  routes: routeResults,
  topChunkIncreases: buildTopChunkIncreases(currentRoutes, baselineRoutes),
}

writeReportFiles(report)

for (const routeResult of routeResults) {
  for (const metricResult of routeResult.metrics) {
    const message = `[bundle-size] ${routeResult.route} ${metricResult.metric}: current=${metricResult.currentKb.toFixed(1)}KB baseline=${metricResult.baselineKb.toFixed(1)}KB budget=${metricResult.budgetKb.toFixed(1)}KB delta=${metricResult.deltaKb.toFixed(1)}KB`
    if (metricResult.status === "OVER") {
      if (enforcementMode === "warn") {
        console.log(`::warning::${message}`)
      } else {
        console.error(`::error::${message}`)
      }
    } else {
      console.log(`${message} status=OK`)
    }
  }
}

if (hasOverBudget && enforcementMode !== "warn") {
  console.error("[bundle-size] budget exceeded.")
  process.exit(1)
}

if (hasOverBudget && enforcementMode === "warn") {
  console.log("[bundle-size] budget exceeded, but warn mode keeps the pipeline green.")
}
