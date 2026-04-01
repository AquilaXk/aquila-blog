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

const invocationCwd = process.cwd()
const inputPath = path.resolve(
  invocationCwd,
  readArg("input", process.env.PLAYWRIGHT_JSON_REPORT_PATH || "test-results/perf/playwright-perf.json")
)
const outputPath = path.resolve(
  invocationCwd,
  readArg("output", process.env.PLAYWRIGHT_PERF_SUMMARY_PATH || "test-results/perf/perf-summary.md")
)
const topN = Math.max(1, Number(readArg("top", "10")) || 10)
const appendStepSummary =
  hasFlag("append-step-summary") || process.env.PLAYWRIGHT_APPEND_STEP_SUMMARY === "true"

const ensureOutputDir = () => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
}

const writeSummary = (content) => {
  ensureOutputDir()
  fs.writeFileSync(outputPath, content, "utf8")
}

const appendGithubStepSummary = (content) => {
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!appendStepSummary || !stepSummaryPath) return
  fs.appendFileSync(stepSummaryPath, `${content}\n`, "utf8")
}

const buildMissingInputSummary = () => {
  const lines = []
  lines.push("# Playwright Perf Summary")
  lines.push("")
  lines.push(`- generatedAt: ${new Date().toISOString()}`)
  lines.push(`- input: \`${inputPath}\``)
  lines.push("- status: missing")
  lines.push("- note: Playwright JSON report가 없어 요약을 생성하지 못했습니다. perf e2e 단계 로그를 확인하세요.")
  return lines.join("\n")
}

const normalizeStatus = (test, lastResult) => {
  const outcome = typeof test?.outcome === "string" ? test.outcome : ""
  if (outcome === "expected") return "passed"
  if (outcome === "flaky") return "flaky"
  if (outcome === "skipped") return "skipped"
  if (outcome === "unexpected") return "failed"

  const rawStatus = typeof lastResult?.status === "string" ? lastResult.status : ""
  if (rawStatus === "passed") return "passed"
  if (rawStatus === "skipped") return "skipped"
  if (rawStatus === "failed" || rawStatus === "timedOut" || rawStatus === "interrupted") return "failed"
  return "unknown"
}

const extractTests = (report) => {
  const rows = []

  const walkSuites = (suites, titleTrail = []) => {
    for (const suite of suites || []) {
      const nextTrail = suite?.title ? [...titleTrail, suite.title] : [...titleTrail]
      const specs = Array.isArray(suite?.specs) ? suite.specs : []

      for (const spec of specs) {
        const tests = Array.isArray(spec?.tests) ? spec.tests : []
        const titleParts = [...nextTrail]
        if (spec?.title) titleParts.push(spec.title)
        const testTitle = titleParts.filter(Boolean).join(" › ") || "(untitled)"
        const filePath = spec?.file || spec?.location?.file || suite?.file || ""

        for (const test of tests) {
          const results = Array.isArray(test?.results) ? test.results : []
          const durationMs = results.reduce((acc, item) => acc + (Number(item?.duration) || 0), 0)
          const lastResult = results.at(-1)
          rows.push({
            project: test?.projectName || "unknown",
            title: testTitle,
            filePath,
            durationMs,
            retries: Math.max(0, results.length - 1),
            status: normalizeStatus(test, lastResult),
          })
        }
      }

      walkSuites(suite?.suites, nextTrail)
    }
  }

  walkSuites(report?.suites, [])
  return rows
}

const buildSummaryMarkdown = (rows) => {
  const totals = {
    total: rows.length,
    passed: 0,
    failed: 0,
    flaky: 0,
    skipped: 0,
    unknown: 0,
    durationMs: 0,
  }

  const projectStats = new Map()
  const failedRows = []

  for (const row of rows) {
    totals.durationMs += row.durationMs
    if (Object.prototype.hasOwnProperty.call(totals, row.status)) {
      totals[row.status] += 1
    } else {
      totals.unknown += 1
    }

    if (row.status === "failed" || row.status === "flaky") {
      failedRows.push(row)
    }

    if (!projectStats.has(row.project)) {
      projectStats.set(row.project, {
        total: 0,
        passed: 0,
        failed: 0,
        flaky: 0,
        skipped: 0,
        unknown: 0,
        durationMs: 0,
      })
    }

    const stats = projectStats.get(row.project)
    stats.total += 1
    stats.durationMs += row.durationMs
    if (Object.prototype.hasOwnProperty.call(stats, row.status)) {
      stats[row.status] += 1
    } else {
      stats.unknown += 1
    }
  }

  const slowRows = rows
    .filter((row) => row.status !== "skipped")
    .slice()
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, topN)

  const lines = []
  lines.push("# Playwright Perf Summary")
  lines.push("")
  lines.push(`- generatedAt: ${new Date().toISOString()}`)
  lines.push(`- input: \`${inputPath}\``)
  lines.push(`- total: ${totals.total}`)
  lines.push(`- passed: ${totals.passed}`)
  lines.push(`- failed: ${totals.failed}`)
  lines.push(`- flaky: ${totals.flaky}`)
  lines.push(`- skipped: ${totals.skipped}`)
  lines.push(`- unknown: ${totals.unknown}`)
  lines.push(`- totalDuration: ${(totals.durationMs / 1000).toFixed(2)}s`)
  lines.push("")
  lines.push("## Project Breakdown")
  lines.push("")
  lines.push("| Project | Total | Passed | Failed | Flaky | Skipped | Unknown | Duration(s) |")
  lines.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")

  const projectNames = [...projectStats.keys()].sort((a, b) => a.localeCompare(b))
  for (const projectName of projectNames) {
    const stats = projectStats.get(projectName)
    lines.push(
      `| ${projectName} | ${stats.total} | ${stats.passed} | ${stats.failed} | ${stats.flaky} | ${stats.skipped} | ${stats.unknown} | ${(stats.durationMs / 1000).toFixed(2)} |`
    )
  }

  if (projectNames.length === 0) {
    lines.push("| (none) | 0 | 0 | 0 | 0 | 0 | 0 | 0.00 |")
  }

  lines.push("")
  lines.push(`## Slowest Tests (Top ${topN})`)
  lines.push("")
  lines.push("| # | Duration(s) | Status | Project | Test |")
  lines.push("| ---: | ---: | --- | --- | --- |")

  slowRows.forEach((row, index) => {
    lines.push(
      `| ${index + 1} | ${(row.durationMs / 1000).toFixed(2)} | ${row.status} | ${row.project} | ${row.title} |`
    )
  })
  if (slowRows.length === 0) {
    lines.push("| 1 | 0.00 | n/a | n/a | no test rows found |")
  }

  lines.push("")
  lines.push("## Failed Or Flaky")
  lines.push("")
  if (failedRows.length === 0) {
    lines.push("- none")
  } else {
    for (const row of failedRows) {
      const location = row.filePath ? ` (${row.filePath})` : ""
      lines.push(`- [${row.status}] ${row.project}: ${row.title}${location}`)
    }
  }

  return lines.join("\n")
}

if (!fs.existsSync(inputPath)) {
  const summary = buildMissingInputSummary()
  writeSummary(summary)
  appendGithubStepSummary(summary)
  console.warn(`[playwright-perf-summary] input report missing: ${inputPath}`)
  console.log(`[playwright-perf-summary] summary written: ${outputPath}`)
  process.exit(0)
}

let reportJson
try {
  reportJson = JSON.parse(fs.readFileSync(inputPath, "utf8"))
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  const summary = [
    "# Playwright Perf Summary",
    "",
    `- generatedAt: ${new Date().toISOString()}`,
    `- input: \`${inputPath}\``,
    "- status: parse_error",
    `- note: ${message}`,
  ].join("\n")
  writeSummary(summary)
  appendGithubStepSummary(summary)
  console.error(`[playwright-perf-summary] failed to parse JSON: ${message}`)
  process.exit(1)
}

const rows = extractTests(reportJson)
const summary = buildSummaryMarkdown(rows)
writeSummary(summary)
appendGithubStepSummary(summary)

console.log(`[playwright-perf-summary] summary written: ${outputPath}`)
console.log(`[playwright-perf-summary] parsed tests: ${rows.length}`)
