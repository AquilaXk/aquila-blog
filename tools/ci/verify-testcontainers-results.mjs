import fs from "node:fs"
import path from "node:path"

const emptySummary = () => ({
  tests: 0,
  skipped: 0,
  failures: 0,
  errors: 0,
  status: "failed",
})

const parseArguments = (argumentsList) => {
  if (argumentsList.length !== 4) {
    throw new Error("Expected --results and --summary arguments.")
  }

  const values = new Map()
  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index]
    const value = argumentsList[index + 1]
    if ((option !== "--results" && option !== "--summary") || !value || values.has(option)) {
      throw new Error("Expected --results and --summary arguments.")
    }
    values.set(option, value)
  }

  if (values.size !== 2) {
    throw new Error("Expected --results and --summary arguments.")
  }

  return { results: values.get("--results"), summary: values.get("--summary") }
}

const numericAttributes = ["tests", "skipped", "failures", "errors"]

const assertWellFormedXml = (report) => {
  if (report.includes("<!--") || report.includes("-->")) {
    throw new Error("JUnit XML comments are not allowed.")
  }

  const document = report
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  const elements = /<(\/?)([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)>/g
  const stack = []
  let cursor = 0
  let rootElements = 0

  for (const element of document.matchAll(elements)) {
    const [tag, closingMarker, name, attributes, selfClosingMarker] = element
    const leadingText = document.slice(cursor, element.index)
    if (leadingText.includes("<") || leadingText.includes(">")) {
      throw new Error("Malformed JUnit XML.")
    }

    const closing = closingMarker === "/"
    const selfClosing = selfClosingMarker === "/"
    if (closing) {
      if (selfClosing || attributes.trim() !== "" || stack.pop() !== name) {
        throw new Error("Malformed JUnit XML.")
      }
    } else {
      if (stack.length === 0) rootElements += 1
      if (!selfClosing) stack.push(name)
    }
    cursor = element.index + tag.length
  }

  const trailingText = document.slice(cursor)
  if (
    trailingText.includes("<") ||
    trailingText.includes(">") ||
    stack.length !== 0 ||
    rootElements !== 1
  ) {
    throw new Error("Malformed JUnit XML.")
  }
}

const readSuiteTotals = (report) => {
  assertWellFormedXml(report)
  const suites = [...report.matchAll(/<testsuite\b([^>]*)>/g)]
  const openingSuiteCount = (report.match(/<testsuite\b/g) ?? []).length
  const closedSuiteCount = (report.match(/<\/testsuite\s*>/g) ?? []).length
  const nonSelfClosingSuiteCount = suites.filter((suite) => !/\/\s*$/.test(suite[1])).length
  if (
    suites.length === 0 ||
    openingSuiteCount !== suites.length ||
    closedSuiteCount !== nonSelfClosingSuiteCount
  ) {
    throw new Error("Malformed JUnit suite.")
  }

  return suites.reduce(
    (totals, suite) => {
      const attributes = suite[1]
      for (const name of numericAttributes) {
        const match = attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))
        if (!match || !/^\d+$/.test(match[1])) {
          throw new Error("Malformed JUnit suite.")
        }
        totals[name] += Number(match[1])
      }
      return totals
    },
    { tests: 0, skipped: 0, failures: 0, errors: 0 },
  )
}

const writeSummary = (summaryPath, summary) => {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true })
  fs.writeFileSync(summaryPath, JSON.stringify(summary))
}

let summaryPath
try {
  const { results, summary: requestedSummaryPath } = parseArguments(process.argv.slice(2))
  summaryPath = requestedSummaryPath
  const totals = emptySummary()
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true })

  const reports = fs
    .readdirSync(results, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^TEST-.*\.xml$/.test(entry.name))
    .map((entry) => path.join(results, entry.name))

  if (reports.length === 0) {
    throw new Error("Testcontainers JUnit reports are missing.")
  }

  for (const reportPath of reports) {
    const reportTotals = readSuiteTotals(fs.readFileSync(reportPath, "utf8"))
    for (const name of numericAttributes) {
      totals[name] += reportTotals[name]
    }
  }

  const passed =
    totals.tests > 0 && totals.skipped === 0 && totals.failures === 0 && totals.errors === 0
  const resultSummary = { ...totals, status: passed ? "passed" : "failed" }
  writeSummary(summaryPath, resultSummary)

  if (!passed) {
    console.error("Testcontainers execution evidence failed.")
    process.exitCode = 1
  } else {
    console.log("Testcontainers execution evidence passed.")
  }
} catch {
  if (summaryPath) {
    writeSummary(summaryPath, emptySummary())
  }
  console.error("Testcontainers execution evidence failed.")
  process.exitCode = 1
}
