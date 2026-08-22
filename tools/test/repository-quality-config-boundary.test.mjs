import assert from "node:assert/strict"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const read = (file) => readFileSync(path.join(repoRoot, file), "utf8")
const webRootPath = /(?:^|["'\s:=,])\/?front(?:\/|["'\s,]|$)/m
const privateReportUrl = "https://github.com/AquilaXk/aquila-blog/security/advisories/new"

test("Platform quality configuration owns only Platform surfaces", () => {
  const security = read(".github/workflows/security.yml")
  const sonar = read("sonar-project.properties")
  const automaticSonar = read(".sonarcloud.properties")
  const codeRabbit = read(".coderabbit.yaml")
  const dependabot = read(".github/dependabot.yml")
  const combined = [security, sonar, automaticSonar, codeRabbit, dependabot].join("\n")

  assert.match(security, /java-kotlin/)
  assert.match(security, /dependencyCheckAnalyze/)
  assert.match(security, /dependency-review-action/)
  assert.doesNotMatch(security, /javascript-typescript|frontend-lockfile-audit|front runtime image/)
  assert.match(sonar, /^sonar\.projectKey=AquilaXk_aquila-blog$/m)
  assert.match(sonar, /^sonar\.sources=back\/src\/main$/m)
  assert.match(sonar, /^sonar\.tests=back\/src\/test$/m)
  assert.match(automaticSonar, /^sonar\.sources=back\/src\/main$/m)
  assert.match(automaticSonar, /^sonar\.tests=back\/src\/test$/m)
  assert.match(codeRabbit, /path: "back\/\*\*"/)
  assert.match(dependabot, /package-ecosystem: "gradle"/)
  assert.match(dependabot, /package-ecosystem: "github-actions"/)
  assert.doesNotMatch(dependabot, /package-ecosystem: "npm"/)
  assert.doesNotMatch(combined, webRootPath)
})

test("Platform CI runs the boundary guard when forbidden Web paths are introduced", () => {
  const ci = read(".github/workflows/ci.yml")

  assert.match(ci, /^      - "front"$/m)
  assert.match(ci, /^      - "front\/\*\*"$/m)
})

test("public issue guidance sends vulnerability details only to the private report form", () => {
  const chooser = read(".github/ISSUE_TEMPLATE/config.yml")
  const operations = read(".github/ISSUE_TEMPLATE/ops_security_data.yml")
  const workflow = read("docs/design/issue-pr-workflow.md")
  const combined = [chooser, operations, workflow].join("\n")

  assert.match(chooser, /blank_issues_enabled: false/)
  assert.match(chooser, new RegExp(privateReportUrl.replaceAll("/", "\\/")))
  for (const guidance of [operations, workflow]) {
    assert.match(guidance, new RegExp(privateReportUrl.replaceAll("/", "\\/")))
    assert.match(guidance, /취약점 세부사항.*PoC.*secret/s)
  }
  assert.match(operations, /토큰.*쿠키.*개인정보.*내부 URL/s)
  assert.doesNotMatch(combined, /CODE_OF_CONDUCT\.md#enforcement|maintainer private contact/i)
})

test("Platform boundary scanner is symlink-safe and rejects foreign Web workflow ownership", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "platform-boundary-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  mkdirSync(path.join(root, "tools/repo-boundary"), { recursive: true })
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true })
  copyFileSync(
    path.join(repoRoot, "tools/repo-boundary/check-platform-boundary.mjs"),
    path.join(root, "tools/repo-boundary/check-platform-boundary.mjs"),
  )
  const outside = path.join(root, "outside.txt")
  writeFileSync(outside, `${["front", "yarn.lock"].join("/")}\n`)
  symlinkSync(outside, path.join(root, "tools/external-link"))
  const raceFile = path.join(root, "tools/race.txt")
  writeFileSync(raceFile, "safe\n")
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), "name: Platform CI\n")
  const blockedPipe = path.join(root, "blocked-pipe")
  assert.equal(spawnSync("mkfifo", [blockedPipe]).status, 0)
  const racePreload = path.join(root, "race-preload.cjs")
  writeFileSync(racePreload, `
const fs = require("node:fs")
const { syncBuiltinESMExports } = require("node:module")
const originalOpenSync = fs.openSync
fs.openSync = (target, ...args) => {
  if (String(target).endsWith("/tools/race.txt")) {
    fs.renameSync(${JSON.stringify(blockedPipe)}, target)
  }
  return originalOpenSync(target, ...args)
}
syncBuiltinESMExports()
`)
  assert.equal(spawnSync("git", ["init", "--initial-branch=main"], { cwd: root }).status, 0)
  assert.equal(spawnSync("git", ["add", "."], { cwd: root }).status, 0)

  const result = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)

  const writeWorkflow = (name, source) => {
    const relative = `.github/workflows/${name}.yml`
    writeFileSync(path.join(root, relative), source)
    assert.equal(spawnSync("git", ["add", relative], { cwd: root }).status, 0)
    return relative
  }
  const removeWorkflow = (relative) => {
    assert.equal(spawnSync("git", ["rm", "--cached", "--quiet", "--", relative], { cwd: root }).status, 0)
    rmSync(path.join(root, relative))
  }
  const assertWorkflowRejected = (name, source, category) => {
    const relative = writeWorkflow(name, source)
    const scan = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
      cwd: root,
      encoding: "utf8",
    })
    assert.equal(scan.status, 1, scan.stderr)
    assert.match(scan.stderr, new RegExp(`${name}\\.yml.*${category}`))
    removeWorkflow(relative)
  }

  assertWorkflowRejected("unknown-web-owner", `
name: Unknown Web owner
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api "repos/AquilaXk/aquila-blog-web/contents/contracts/public-api?ref=main"
`, "foreign-web-owner")

  const allowedWebRead = writeWorkflow("sync-public-contract-to-web", `
name: Allowed Web read and dispatch
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          repositories: aquila-blog-web
          permission-contents: write
      - run: |
          gh api "repos/\${WEB_REPOSITORY}/contents/contracts/public-api?ref=main"
          gh api --method POST "repos/\${WEB_REPOSITORY}/dispatches" -f event_type=platform_contract_ready
`)
  const allowedScan = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(allowedScan.status, 0, allowedScan.stderr)
  removeWorkflow(allowedWebRead)

  assertWorkflowRejected("foreign-checkout", `
name: Foreign checkout
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: AquilaXk/aquila-blog-web
          path: web
`, "foreign-checkout")
  assertWorkflowRejected("foreign-build", `
name: Foreign build
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - working-directory: web
        run: yarn contracts:generate
`, "foreign-workspace-build")
  assertWorkflowRejected("foreign-build-cwd", `
name: Foreign build cwd flag
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: yarn --cwd web contracts:generate
`, "foreign-workspace-build")
  assertWorkflowRejected("foreign-build-workflow-default", `
name: Workflow-default foreign build
on: workflow_dispatch
defaults:
  run: { working-directory: web }
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: npm ci
`, "foreign-workspace-build")
  assertWorkflowRejected("foreign-cd-write", `
name: Multiline foreign workspace write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          cd web
          git add generated
          pnpm build
`, "foreign-git-write")
  assertWorkflowRejected("foreign-git-write", `
name: Foreign git write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git -C web commit -m handoff
`, "foreign-git-write")
  assertWorkflowRejected("foreign-pr-write", `
name: Foreign PR write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr create --repo "\${WEB_REPOSITORY}" --title handoff --body handoff
`, "foreign-pr-write")
  assertWorkflowRejected("foreign-api-write", `
name: Foreign API write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/\${WEB_REPOSITORY}/issues" -f title=handoff
`, "foreign-api-write")
  assertWorkflowRejected("foreign-checkout-indented", `
name: Indented foreign checkout
on: workflow_dispatch
jobs:
    handoff:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
          with:
            repository: AquilaXk/aquila-blog-web
`, "foreign-checkout")
  assertWorkflowRejected("foreign-api-implicit", `
name: Implicit foreign API write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api "repos/AquilaXk/aquila-blog-web/issues" -f title=handoff
`, "foreign-api-write")
  assertWorkflowRejected("foreign-api-continuation", `
name: Continued foreign API write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          gh api \\
            --method POST \\
            "repos/AquilaXk/aquila-blog-web/issues" \\
            -f title=handoff
`, "foreign-api-write")
  assertWorkflowRejected("foreign-pr-target-alias", `
name: Aliased foreign PR write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
  TARGET_REPOSITORY: $WEB_REPOSITORY
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr create --repo="\${TARGET_REPOSITORY}" --title handoff --body handoff
`, "foreign-pr-write")
  assertWorkflowRejected("foreign-checkout-mixed-case", `
name: Mixed-case foreign checkout
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: aQuIlAxK/AqUiLa-BlOg-WeB
`, "foreign-checkout")
  assertWorkflowRejected("foreign-checkout-quoted-steps", `
name: Quoted steps foreign checkout
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    "steps":
      - uses: actions/checkout@v4
        with: { repository: AquilaXk/aquila-blog-web }
`, "foreign-checkout")
  assertWorkflowRejected("foreign-build-job-default", `
name: Job-default foreign build
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: web
    steps:
      - run: npm ci
`, "foreign-workspace-build")
  assertWorkflowRejected("foreign-pr-short-repo", `
name: Short-selector foreign PR write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr create -R AquilaXk/aquila-blog-web --title handoff --body handoff
`, "foreign-pr-write")
  assertWorkflowRejected("foreign-api-repository-root", `
name: Repository-root foreign API write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method PATCH "repos/AquilaXk/aquila-blog-web" -f description=handoff
`, "foreign-api-write")

  const reportOnly = spawnSync(
    process.execPath,
    ["tools/repo-boundary/check-platform-boundary.mjs", "--report-only"],
    { cwd: root, encoding: "utf8" },
  )
  assert.equal(reportOnly.status, 2, reportOnly.stderr)

  const raceResult = spawnSync(
    process.execPath,
    ["--require", racePreload, "tools/repo-boundary/check-platform-boundary.mjs"],
    { cwd: root, encoding: "utf8", timeout: 1_000 },
  )
  assert.equal(raceResult.status, 0, raceResult.error?.message || raceResult.stderr)

  mkdirSync(path.join(root, "front"))
  writeFileSync(path.join(root, "front/package.json"), "{}\n")
  assert.equal(spawnSync("git", ["add", "front/package.json"], { cwd: root }).status, 0)
  const trackedWeb = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(trackedWeb.status, 1, trackedWeb.stderr)
  assert.match(trackedWeb.stderr, /front\/package\.json/)
})

test("backend dependency suppression scopes the Tomcat examples CVE to embedded 11.0.24", () => {
  const suppressions = read("back/config/dependency-check-suppressions.xml")
  const build = read("back/build.gradle.kts")
  const blocks = [...suppressions.matchAll(/<suppress until="([^"]+)">([\s\S]*?)<\/suppress>/g)]
    .filter(([, , body]) => body.includes("CVE-2026-66299"))

  assert.equal(blocks.length, 1)
  const [block, expiry] = blocks[0]
  const selectors = [...block.matchAll(/<([A-Za-z][\w-]*)(?:\s[^>]*)?>/g)]
    .map(([, tag]) => tag)
    .filter((tag) => tag !== "suppress" && tag !== "notes")
  const noteLines = block.split("\n").map((line) => line.trim())

  assert.equal(expiry, "2026-08-23")
  assert.deepEqual(selectors, ["packageUrl", "cve"])
  assert.match(
    block,
    /<packageUrl regex="true">\^pkg:maven\/org\\\.apache\\\.tomcat\\\.embed\/tomcat-embed-\(\?:core\|websocket\)@11\\\.0\\\.24\$<\/packageUrl>/,
  )
  assert.match(block, /<cve>CVE-2026-66299<\/cve>/)
  assert.ok(noteLines.includes("Apache guidance: https://tomcat.apache.org/security-11.html"))
  assert.ok(noteLines.includes("Tracked: https://github.com/AquilaXk/aquila-blog/issues/1647"))
  assert.match(build, /failBuildOnCVSS = 7\.0f/)
  assert.match(build, /failOnError = true/)
  assert.match(
    build,
    /suppressionFiles\.add\("config\/dependency-check-suppressions\.xml"\)/,
  )
})
