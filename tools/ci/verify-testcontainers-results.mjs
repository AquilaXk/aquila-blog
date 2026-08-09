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

const assertUniqueAttributes = (attributes) => {
  const attributePattern = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"[^"]*"|'[^']*')/g
  const names = new Set()
  let cursor = 0

  for (const attribute of attributes.matchAll(attributePattern)) {
    if (attributes.slice(cursor, attribute.index).trim() !== "" || names.has(attribute[1])) {
      throw new Error("Malformed JUnit XML attributes.")
    }
    names.add(attribute[1])
    cursor = attribute.index + attribute[0].length
  }

  if (attributes.slice(cursor).trim() !== "") {
    throw new Error("Malformed JUnit XML attributes.")
  }
}

const assertWellFormedXml = (report) => {
  if (report.includes("<!--") || report.includes("-->")) {
    throw new Error("JUnit XML comments are not allowed.")
  }

  const declarations = [...report.matchAll(/<\?xml[\s\S]*?\?>/g)]
  const firstContentIndex = report.search(/\S/)
  if (declarations.length > 1 || (declarations.length === 1 && declarations[0].index !== firstContentIndex)) {
    throw new Error("Malformed JUnit XML declaration.")
  }

  const declaration = declarations[0]
  const withoutDeclaration = declaration
    ? report.slice(0, declaration.index) + report.slice(declaration.index + declaration[0].length)
    : report
  const document = withoutDeclaration.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  const withoutAllowedEntities = document.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\dA-Fa-f]+);/g, "")
  if (withoutAllowedEntities.includes("&")) {
    throw new Error("Malformed JUnit XML entity.")
  }

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
      assertUniqueAttributes(attributes)
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

  let reportEntries
  try {
    reportEntries = fs.readdirSync(results, { withFileTypes: true })
  } catch {
    throw new Error("Testcontainers JUnit report directory is missing or unreadable.")
  }

  const reports = reportEntries
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
} catch (error) {
  if (summaryPath) {
    writeSummary(summaryPath, emptySummary())
  }
  const diagnostic = error instanceof Error ? error.message : "Unknown verifier failure."
  console.error(`Testcontainers execution evidence failed: ${diagnostic}`)
  process.exitCode = 1
}
