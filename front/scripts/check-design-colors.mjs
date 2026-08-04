import { execFileSync } from "node:child_process"
import { pathToFileURL } from "node:url"

const DEFAULT_BASE_REFS = ["origin/main", "main"]
const TARGET_PATHS = [
  "src/design-system",
  "src/routes/Company",
  "src/routes/EasySubway",
  "src/routes/Feed",
  "src/routes/Settings",
  "src/components/auth",
  "src/layouts/RootLayout",
]

/**
 * 색 리터럴을 정의해도 되는 유일한 파일들. 게이트의 목적은 "hex 금지"가 아니라 "색 정의 지점을
 * 한 곳으로 모으기"이므로, 정본 팔레트를 옮겨 적는 토큰 모듈은 여기서 예외로 둔다. 표면 코드는
 * 그 모듈이 내보낸 토큰만 참조하고, 새 예외를 추가할 때는 정본 출처를 파일 주석에 남긴다.
 *
 * 경로는 이 앱 기준(`front/` 아래)으로 적는다. git이 diff 헤더에 쓰는 경로는 pathspec을 어디서
 * 주든 저장소 루트 기준이므로(`front/src/...`), 비교는 suffix로 한다 - 앱 기준 경로와 문자열
 * 일치만 보면 커밋된 diff에서 예외가 조용히 풀린다.
 */
const COLOR_SOURCE_ALLOWLIST = ["src/design-system/marketingPalette.ts"]

export const isColorSourceFile = (file) =>
  COLOR_SOURCE_ALLOWLIST.some((allowed) => file === allowed || file.endsWith(`/${allowed}`))

const DIRECT_COLOR_PATTERN =
  /(?:^|[^A-Za-z0-9_-])(?:#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\))/
const FUNCTION_COLOR_START_PATTERN = /(?:^|[^A-Za-z0-9_-])(?:rgba?|hsla?)\(/
const FRAGMENT_REFERENCE_PATTERN =
  /(?:href\s*=\s*(?:["']#[A-Za-z][\w:-]*["']|\{\s*["']#[A-Za-z][\w:-]*["']\s*\})|url\(\s*["']?#[A-Za-z][\w:-]*["']?\s*\))/g

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
    const colorSourceLine = sourceLine.replace(FRAGMENT_REFERENCE_PATTERN, "")
    if (
      !isColorSourceFile(currentFile) &&
      (DIRECT_COLOR_PATTERN.test(colorSourceLine) ||
        FUNCTION_COLOR_START_PATTERN.test(colorSourceLine))
    ) {
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
