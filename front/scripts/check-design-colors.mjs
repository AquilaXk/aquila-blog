import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const DEFAULT_BASE_REFS = ["origin/main", "main"]
const TARGET_PATHS = [
  "src/design-system",
  "src/routes/Feed",
  "src/routes/Settings",
  "src/components/auth",
  "src/layouts/RootLayout",
]

const DIRECT_COLOR_PATTERN =
  /(?:^|[^A-Za-z0-9_-])(?:#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/

const runGit = (args, options = {}) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", options.silent ? "ignore" : "pipe"],
    ...options,
  })

const resolveBaseRef = () => {
  const requestedBase = process.env.DESIGN_COLOR_BASE_REF?.trim()
  const candidates = requestedBase ? [requestedBase] : DEFAULT_BASE_REFS

  for (const candidate of candidates) {
    try {
      runGit(["rev-parse", "--verify", candidate], { silent: true })
      return candidate
    } catch {
      // Try the next local ref. CI and developer machines do not always have the same refs.
    }
  }

  throw new Error(`Unable to resolve design color base ref: ${candidates.join(", ")}`)
}

export const isInsideGitWorkTree = () => {
  try {
    return runGit(["rev-parse", "--is-inside-work-tree"], { silent: true }).trim() === "true"
  } catch {
    return false
  }
}

const diffArgs = (baseRef) => [
  "diff",
  "--unified=0",
  "--no-ext-diff",
  "--diff-filter=ACMRT",
  baseRef,
  "--",
  ...TARGET_PATHS,
]

const localDiffArgs = [
  "diff",
  "--unified=0",
  "--no-ext-diff",
  "--diff-filter=ACMRT",
  "--",
  ...TARGET_PATHS,
]

const parseAddedLineNumber = (line) => {
  const match = line.match(/^\@\@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? \@\@/)
  if (!match) return null
  return Number(match[1])
}

export const findDirectColorViolations = (diffText) => {
  const violations = []
  let currentFile = ""
  let addedLineNumber = 0

  for (const line of diffText.split(/\r?\n/)) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length)
      continue
    }

    const hunkStart = parseAddedLineNumber(line)
    if (hunkStart !== null) {
      addedLineNumber = hunkStart
      continue
    }

    if (!line.startsWith("+") || line.startsWith("+++")) {
      continue
    }

    const sourceLine = line.slice(1)
    if (DIRECT_COLOR_PATTERN.test(sourceLine)) {
      violations.push({
        file: currentFile,
        line: addedLineNumber,
        source: sourceLine.trim(),
      })
    }

    addedLineNumber += 1
  }

  return violations
}

const formatViolations = (violations) =>
  violations
    .map((violation) => `- ${violation.file}:${violation.line} ${violation.source}`)
    .join("\n")

export const committedDiffRange = (baseRef) => `${baseRef}..HEAD`

export const collectDiffText = () => {
  if (!isInsideGitWorkTree()) {
    console.warn("[design-colors] warning: not inside a git worktree; skipping diff check")
    return ""
  }

  let committedDiff = ""
  try {
    const baseRef = resolveBaseRef()
    committedDiff = runGit(diffArgs(committedDiffRange(baseRef)))
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.warn(`[design-colors] warning: ${reason}; checking local diffs only`)
  }
  const stagedDiff = runGit(["diff", "--cached", ...localDiffArgs.slice(1)])
  const workingTreeDiff = runGit(localDiffArgs)
  return [committedDiff, stagedDiff, workingTreeDiff].filter(Boolean).join("\n")
}

export const main = () => {
  const violations = findDirectColorViolations(collectDiffText())

  if (violations.length === 0) {
    console.log("[design-colors] ok: no new direct hex/rgb/hsl colors in guarded UI paths")
    return
  }

  console.error(
    [
      "[design-colors] New direct color literals are not allowed in guarded UI paths.",
      "Use front/src/design-system semantic tokens or the existing Emotion theme instead.",
      formatViolations(violations),
    ].join("\n")
  )
  process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main()
}
