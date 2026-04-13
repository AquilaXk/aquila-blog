#!/usr/bin/env node

import http from "node:http"
import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { performance } from "node:perf_hooks"

const DEFAULT_BASE_URL = "https://www.aquilaxk.site"
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_REQUESTS_PER_ROUTE = 2
const DEFAULT_LATEST_POSTS = 3
const DEFAULT_STATE_PATH = path.join(
  process.env.HOME || process.cwd(),
  ".cache",
  "aquila-blog",
  "public-edge-probe-state.json"
)
const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60_000
const DEFAULT_SERVE_PORT = 9915

const HELP_TEXT = `public-edge-probe.mjs

Usage:
  node deploy/homeserver/monitoring/public-edge-probe.mjs [options]

One-shot options:
  --base-url <url>           Base URL to probe (default: ${DEFAULT_BASE_URL})
  --route <path>             Route to probe. Repeatable. Defaults to / plus latest post routes from sitemap.
  --latest-posts <count>     Number of latest posts to auto-load from sitemap (default: ${DEFAULT_LATEST_POSTS})
  --requests <count>         Sequential requests per route (default: ${DEFAULT_REQUESTS_PER_ROUTE})
  --timeout-ms <ms>          Request timeout in milliseconds (default: ${DEFAULT_TIMEOUT_MS})
  --state-path <file>        Persistent state file (default: ${DEFAULT_STATE_PATH})
  --output-json <file>       Write JSON report to file
  --output-md <file>         Write Markdown report to file
  --prometheus-out <file>    Write Prometheus exposition text to file

Server mode:
  --serve-port <port>        Start HTTP exporter on the port
  --refresh-ms <ms>          Probe refresh interval in server mode (default: ${DEFAULT_REFRESH_INTERVAL_MS})

Other:
  --help                     Show this message
`

const normalizePath = (value) => {
  if (!value || value === "/") return "/"
  return value.startsWith("/") ? value : `/${value}`
}

const parseArgs = (argv) => {
  const args = {
    baseUrl: DEFAULT_BASE_URL,
    routes: [],
    latestPosts: DEFAULT_LATEST_POSTS,
    requestsPerRoute: DEFAULT_REQUESTS_PER_ROUTE,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    statePath: DEFAULT_STATE_PATH,
    outputJson: "",
    outputMd: "",
    prometheusOut: "",
    refreshMs: DEFAULT_REFRESH_INTERVAL_MS,
    servePort: 0,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    const next = argv[index + 1]
    switch (token) {
      case "--base-url":
        args.baseUrl = next || args.baseUrl
        index += 1
        break
      case "--route":
        if (next) args.routes.push(normalizePath(next))
        index += 1
        break
      case "--latest-posts":
        args.latestPosts = Math.max(0, Number.parseInt(next || "", 10) || 0)
        index += 1
        break
      case "--requests":
        args.requestsPerRoute = Math.max(1, Number.parseInt(next || "", 10) || DEFAULT_REQUESTS_PER_ROUTE)
        index += 1
        break
      case "--timeout-ms":
        args.timeoutMs = Math.max(1_000, Number.parseInt(next || "", 10) || DEFAULT_TIMEOUT_MS)
        index += 1
        break
      case "--state-path":
        args.statePath = next || args.statePath
        index += 1
        break
      case "--output-json":
        args.outputJson = next || ""
        index += 1
        break
      case "--output-md":
        args.outputMd = next || ""
        index += 1
        break
      case "--prometheus-out":
        args.prometheusOut = next || ""
        index += 1
        break
      case "--refresh-ms":
        args.refreshMs = Math.max(5_000, Number.parseInt(next || "", 10) || DEFAULT_REFRESH_INTERVAL_MS)
        index += 1
        break
      case "--serve-port":
        args.servePort = Math.max(1, Number.parseInt(next || "", 10) || DEFAULT_SERVE_PORT)
        index += 1
        break
      case "--help":
        args.help = true
        break
      default:
        if (token.startsWith("--")) {
          throw new Error(`Unknown option: ${token}`)
        }
        break
    }
  }

  args.baseUrl = args.baseUrl.replace(/\/+$/, "")
  args.routes = Array.from(new Set(args.routes.map(normalizePath)))
  return args
}

const safeNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const bucketize = (value, steps, fallback = "unknown") => {
  if (value === null || value < 0) return fallback
  for (const [limit, label] of steps) {
    if (value <= limit) return label
  }
  return steps[steps.length - 1]?.[1] || fallback
}

const deploymentWindowBucket = (ageMs) =>
  bucketize(ageMs, [
    [15 * 60_000, "deploy_0_15m"],
    [60 * 60_000, "deploy_15_60m"],
    [6 * 60 * 60_000, "deploy_1_6h"],
    [Number.POSITIVE_INFINITY, "deploy_over_6h"],
  ])

const publishAgeBucket = (ageMs) =>
  bucketize(
    ageMs,
    [
      [5 * 60_000, "publish_0_5m"],
      [30 * 60_000, "publish_5_30m"],
      [2 * 60 * 60_000, "publish_30_120m"],
      [24 * 60 * 60_000, "publish_2_24h"],
      [Number.POSITIVE_INFINITY, "publish_over_24h"],
    ],
    "not_post"
  )

const slugifyMetricLabel = (value) =>
  String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/"/g, '\\"')

const withTimeoutSignal = (timeoutMs) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  }
}

const fetchText = async (url, timeoutMs) => {
  const { signal, clear } = withTimeoutSignal(timeoutMs)
  const startedAt = performance.now()
  let response
  try {
    response = await fetch(url, {
      redirect: "follow",
      signal,
      headers: {
        "user-agent": "aquila-public-edge-probe/1.0",
      },
    })
  } finally {
    clear()
  }

  const ttfbMs = performance.now() - startedAt
  const textStartedAt = performance.now()
  const body = await response.text()
  const totalMs = ttfbMs + (performance.now() - textStartedAt)
  return {
    response,
    body,
    ttfbMs,
    totalMs,
  }
}

const parseBuildId = (html) => {
  const match = html.match(/\/_next\/static\/([^/]+)\/_buildManifest\.js/)
  return match?.[1] || ""
}

const parseCanonicalPath = (html) => {
  const match = html.match(/<link rel="canonical" href="https?:\/\/[^/"<]+([^"]*)"/i)
  return normalizePath(match?.[1] || "/")
}

const parsePublishedTime = (html) => {
  const match = html.match(/<meta property="article:published_time" content="([^"]+)"/i)
  return match?.[1] || ""
}

const parseSitemapRoutes = (xml, baseUrl, latestPosts) => {
  if (latestPosts <= 0) return []
  const escapedBase = baseUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`<loc>${escapedBase}(/posts/[^<]+)</loc>`, "g")
  const routes = []
  let match = regex.exec(xml)
  while (match) {
    routes.push(normalizePath(match[1]))
    if (routes.length >= latestPosts) break
    match = regex.exec(xml)
  }
  return routes
}

const readJsonFile = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const ensureDirForFile = async (filePath) => {
  if (!filePath) return
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

const writeFileAtomically = async (filePath, content) => {
  if (!filePath) return
  await ensureDirForFile(filePath)
  const parentDir = path.dirname(filePath)
  const baseName = path.basename(filePath)
  const tempDir = await fs.mkdtemp(path.join(parentDir, `${baseName}.tmp-`))
  const tempPath = path.join(tempDir, baseName)

  try {
    await fs.writeFile(tempPath, content, { encoding: "utf8", mode: 0o600 })
    await fs.rename(tempPath, filePath)
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }
}

const round = (value) => Number(value.toFixed(3))

const updateCounts = (bucket, cacheState) => {
  const key = cacheState || "UNKNOWN"
  bucket[key] = (bucket[key] || 0) + 1
}

const createDefaultState = () => ({
  version: 1,
  builds: {},
  routes: {},
})

const summarizeOverallCache = (routeReports) => {
  const counts = {}
  for (const route of routeReports) {
    if (!route.samples.length) continue
    updateCounts(counts, route.samples[0].cacheState)
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
  return {
    total,
    counts,
  }
}

const toMarkdownReport = (report) => {
  const lines = []
  lines.push("# Public edge probe")
  lines.push("")
  lines.push(`- baseUrl: ${report.baseUrl}`)
  lines.push(`- probedAt: ${report.probedAt}`)
  lines.push(`- first request cache counts: ${JSON.stringify(report.overall.firstRequestCache.counts)}`)
  lines.push("")

  for (const route of report.routes) {
    const first = route.samples[0]
    const warm = route.samples[1]
    lines.push(`## ${route.route}`)
    lines.push(`- buildId: ${route.buildId || "unknown"}`)
    lines.push(`- deployWindow: ${route.deployWindowBucket}`)
    lines.push(`- firstRequest: ${first ? `${first.cacheState} ${round(first.ttfbMs)}ms` : "n/a"}`)
    lines.push(`- warmRequest: ${warm ? `${warm.cacheState} ${round(warm.ttfbMs)}ms` : "n/a"}`)
    if (route.publishedAt) {
      lines.push(`- publishedAt: ${route.publishedAt}`)
      lines.push(`- publishAge: ${route.publishAgeBucket}`)
      lines.push(`- firstProbeAfterPublish: ${route.firstProbeAfterPublish ? "yes" : "no"}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

const toPrometheusText = (report) => {
  const lines = [
    "# HELP aquila_public_edge_probe_request_ttfb_seconds Synthetic public-route TTFB by request order.",
    "# TYPE aquila_public_edge_probe_request_ttfb_seconds gauge",
    "# HELP aquila_public_edge_probe_first_probe_after_publish Indicates whether the current probe is the first probe after publish.",
    "# TYPE aquila_public_edge_probe_first_probe_after_publish gauge",
  ]

  for (const route of report.routes) {
    for (const sample of route.samples) {
      lines.push(
        `aquila_public_edge_probe_request_ttfb_seconds{route="${slugifyMetricLabel(route.route)}",request_index="${sample.requestIndex}",cache_state="${slugifyMetricLabel(sample.cacheState)}",build_id="${slugifyMetricLabel(route.buildId || "unknown")}",deploy_window="${slugifyMetricLabel(route.deployWindowBucket)}",publish_age="${slugifyMetricLabel(route.publishAgeBucket)}"} ${round(sample.ttfbMs / 1000)}`
      )
    }
    lines.push(
      `aquila_public_edge_probe_first_probe_after_publish{route="${slugifyMetricLabel(route.route)}",build_id="${slugifyMetricLabel(route.buildId || "unknown")}",published_at="${slugifyMetricLabel(route.publishedAt || "none")}"} ${route.firstProbeAfterPublish ? 1 : 0}`
    )
  }

  return `${lines.join("\n")}\n`
}

const probeRoute = async ({ baseUrl, route, requestsPerRoute, timeoutMs, state }) => {
  const samples = []
  let buildId = ""
  let canonicalPath = route
  let publishedAt = ""

  for (let requestIndex = 1; requestIndex <= requestsPerRoute; requestIndex += 1) {
    const targetUrl = `${baseUrl}${route}`
    const { response, body, ttfbMs, totalMs } = await fetchText(targetUrl, timeoutMs)
    const cacheState = response.headers.get("x-vercel-cache") || "UNKNOWN"
    const ageHeader = safeNumber(response.headers.get("age") || "")
    buildId = buildId || parseBuildId(body)
    canonicalPath = parseCanonicalPath(body)
    publishedAt = publishedAt || parsePublishedTime(body)
    samples.push({
      requestIndex,
      status: response.status,
      cacheState,
      ageSeconds: ageHeader ?? 0,
      ttfbMs,
      totalMs,
    })
  }

  const nowIso = new Date().toISOString()
  let newBuildSeen = false
  if (buildId) {
    const existingBuildState = state.builds[buildId]
    if (!existingBuildState) {
      newBuildSeen = true
      state.builds[buildId] = {
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
      }
    } else {
      existingBuildState.lastSeenAt = nowIso
    }
  }

  const routeKey = canonicalPath || route
  const routeState = state.routes[routeKey] || {
    firstRequestCacheCounts: {},
    allRequestCacheCounts: {},
    publishedAt: "",
    publishedFirstProbeAt: "",
  }
  state.routes[routeKey] = routeState

  if (samples[0]) updateCounts(routeState.firstRequestCacheCounts, samples[0].cacheState)
  for (const sample of samples) {
    updateCounts(routeState.allRequestCacheCounts, sample.cacheState)
  }

  const firstProbeAfterPublish = Boolean(
    publishedAt && routeState.publishedAt && routeState.publishedAt !== publishedAt
  )
  if (publishedAt) {
    routeState.publishedAt = publishedAt
    if (firstProbeAfterPublish) {
      routeState.publishedFirstProbeAt = nowIso
    }
  }

  const buildFirstSeenAt = buildId ? state.builds[buildId]?.firstSeenAt || nowIso : nowIso
  const deployAgeMs = Date.now() - new Date(buildFirstSeenAt).getTime()
  const publishAgeMs = publishedAt ? Date.now() - new Date(publishedAt).getTime() : null

  return {
    route: routeKey,
    buildId,
    deployWindowBucket: newBuildSeen ? "deploy_first_seen" : deploymentWindowBucket(deployAgeMs),
    deployAgeMs,
    publishedAt,
    publishAgeBucket: publishAgeBucket(publishAgeMs),
    publishAgeMs,
    firstProbeAfterPublish,
    samples,
  }
}

const runProbe = async (args) => {
  const state = await readJsonFile(args.statePath, createDefaultState())
  const routes = new Set(args.routes.length ? args.routes : ["/"])

  if (!args.routes.length && args.latestPosts > 0) {
    const sitemapUrl = `${args.baseUrl}/sitemap.xml`
    const { body } = await fetchText(sitemapUrl, args.timeoutMs)
    for (const route of parseSitemapRoutes(body, args.baseUrl, args.latestPosts)) {
      routes.add(route)
    }
  }

  const routeReports = []
  for (const route of routes) {
    routeReports.push(
      await probeRoute({
        baseUrl: args.baseUrl,
        route,
        requestsPerRoute: args.requestsPerRoute,
        timeoutMs: args.timeoutMs,
        state,
      })
    )
  }

  const report = {
    baseUrl: args.baseUrl,
    probedAt: new Date().toISOString(),
    routes: routeReports,
    overall: {
      firstRequestCache: summarizeOverallCache(routeReports),
    },
  }
  const markdown = toMarkdownReport(report)
  const prometheus = toPrometheusText(report)

  await writeFileAtomically(args.statePath, `${JSON.stringify(state, null, 2)}\n`)

  if (args.outputJson) {
    await writeFileAtomically(args.outputJson, `${JSON.stringify(report, null, 2)}\n`)
  }
  if (args.outputMd) {
    await writeFileAtomically(args.outputMd, `${markdown}\n`)
  }
  if (args.prometheusOut) {
    await writeFileAtomically(args.prometheusOut, prometheus)
  }

  return { report, markdown, prometheus }
}

const runOneShot = async (args) => {
  const { markdown } = await runProbe(args)
  process.stdout.write(`${markdown}\n`)
}

const startServer = async (args) => {
  let latest = {
    report: null,
    markdown: "# Public edge probe\n\n- status: warming up\n",
    prometheus:
      "# HELP aquila_public_edge_probe_up Probe exporter availability.\n# TYPE aquila_public_edge_probe_up gauge\naquila_public_edge_probe_up 0\n",
    lastError: "",
    lastSuccessAt: "",
  }

  let refreshing = false

  const refresh = async () => {
    if (refreshing) return
    refreshing = true
    try {
      const next = await runProbe(args)
      latest = {
        report: next.report,
        markdown: next.markdown,
        prometheus: `${next.prometheus}# HELP aquila_public_edge_probe_up Probe exporter availability.\n# TYPE aquila_public_edge_probe_up gauge\naquila_public_edge_probe_up 1\n`,
        lastError: "",
        lastSuccessAt: next.report.probedAt,
      }
    } catch (error) {
      latest = {
        ...latest,
        lastError: error instanceof Error ? error.message : String(error),
        prometheus: `${latest.prometheus}# HELP aquila_public_edge_probe_last_refresh_error Indicates the last refresh ended in error.\n# TYPE aquila_public_edge_probe_last_refresh_error gauge\naquila_public_edge_probe_last_refresh_error 1\n`,
      }
      console.error(`[public-edge-probe] refresh failed: ${latest.lastError}`)
    } finally {
      refreshing = false
    }
  }

  await refresh()
  setInterval(() => {
    void refresh()
  }, args.refreshMs).unref()

  const server = http.createServer((req, res) => {
    const pathname = req.url?.split("?")[0] || "/"
    if (pathname === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" })
      res.end(latest.prometheus)
      return
    }
    if (pathname === "/report.json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify(latest.report || { status: "warming-up", lastError: latest.lastError }, null, 2))
      return
    }
    if (pathname === "/healthz") {
      res.writeHead(latest.lastError ? 503 : 200, { "Content-Type": "application/json; charset=utf-8" })
      res.end(JSON.stringify({ ok: !latest.lastError, lastError: latest.lastError, lastSuccessAt: latest.lastSuccessAt }))
      return
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
    res.end(latest.markdown)
  })

  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(args.servePort, "0.0.0.0", () => resolve())
  })
  process.stdout.write(`[public-edge-probe] serving on 0.0.0.0:${args.servePort}\n`)
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    process.stdout.write(HELP_TEXT)
    return
  }
  if (args.servePort > 0) {
    await startServer(args)
    return
  }
  await runOneShot(args)
}

main().catch((error) => {
  process.stderr.write(`[public-edge-probe] ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
