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
  GH_REPO: $WEB_REPOSITORY
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          repositories: aquila-blog-web
          permission-contents: write
      - run: |
          echo "documentation: gh api --method DELETE repos/AquilaXk/aquila-blog-web/issues"
          gh api "repos/\${WEB_REPOSITORY}/contents/contracts/public-api?ref=main"
          gh api --method POST "repos/\${WEB_REPOSITORY}/dispatches" -f event_type=platform_contract_ready
          gh pr checks 1
          gh pr diff 1
          gh pr list
          gh pr status
          gh pr view 1
          gh pr checkout 1
`)
  const allowedScan = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(allowedScan.status, 0, allowedScan.stderr)
  removeWorkflow(allowedWebRead)

  const allowedDeployDispatch = writeWorkflow("deploy", `
name: Allowed verified deployment dispatch
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/AquilaXk/aquila-blog-web/dispatches" --input payload.json
`)
  const allowedDeployScan = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(allowedDeployScan.status, 0, allowedDeployScan.stderr)
  removeWorkflow(allowedDeployDispatch)

  const currentRepositoryToken = writeWorkflow("current-repository-token", `
name: Current repository token
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          permission-contents: write
      - uses: actions/create-github-app-token@v3
        with:
          repositories: ""
          permission-contents: write
`)
  const currentRepositoryScan = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(currentRepositoryScan.status, 0, currentRepositoryScan.stderr)
  removeWorkflow(currentRepositoryToken)

  const capabilityRejections = [
    ["unknown-web-token-implicit-owner", `
name: Implicit current owner Web token
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          repositories: aquila-blog-web
          permission-contents: write
`, "foreign-web-token"],
    ["unknown-web-token-default-repositories", `
name: Explicit Web owner token without repositories
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          owner: AquilaXk
          permission-contents: write
`, "foreign-web-token"],
    ["unknown-web-token", `
name: Unknown Web token owner
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/create-github-app-token@v3
        with:
          owner: AquilaXk
          repositories: aquila-blog-web
          permission-contents: write
`, "foreign-web-token"],
    ["sync-public-contract-to-web", `
name: Quoted Web API query mutation
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method DELETE "repos/\${WEB_REPOSITORY}/actions/caches?key=x&ref=main"
`, "foreign-api-write"],
    ["sync-public-contract-to-web", `
name: Web GraphQL mutation
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          gh api graphql \\
            -f 'query=mutation { deleteRepository(input: {repositoryId: "x"}) { clientMutationId } }' \\
            -F "repository=$WEB_REPOSITORY"
`, "foreign-api-write"],
    ["sync-public-contract-to-web", `
name: Web release mutation
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh release create v1.0.0 --repo "$WEB_REPOSITORY"
`, "foreign-gh-write"],
    ["sync-public-contract-to-web", `
name: Positional Web pull request URL
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr close https://github.com/AquilaXk/aquila-blog-web/pull/123
`, "foreign-pr-write"],
    ["sync-web-legal-policy-to-platform", `
name: Environment Web Git remote
on: workflow_dispatch
env:
  WEB_REMOTE: https://github.com/AquilaXk/aquila-blog-web.git
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git push "$WEB_REMOTE" HEAD:main
`, "foreign-git-write"],
  ]
  for (const [name, source, category] of capabilityRejections) {
    assertWorkflowRejected(name, source, category)
  }

  assertWorkflowRejected("sync-public-contract-to-web", `
name: Foreign API write with dispatch field decoy
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/\${WEB_REPOSITORY}/issues" -f body="repos/\${WEB_REPOSITORY}/dispatches"
`, "foreign-api-write")
  assertWorkflowRejected("foreign-web-git-url", `
name: Foreign Web Git URL
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git push https://github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-web-owner")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: Allowlisted owner with foreign Web Git push
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git push https://github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Foreign reusable Web workflow
on: workflow_dispatch
jobs:
  delegate:
    uses: AquilaXk/aquila-blog-web/.github/workflows/build.yml@main
`, "foreign-reusable-workflow")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Implicit GH_REPO foreign PR
on: workflow_dispatch
env:
  GH_REPO: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr create --title handoff --body handoff
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Compact-expression foreign API write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/\${{env.WEB_REPOSITORY}}/issues" -f title=handoff
`, "foreign-api-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Leading-slash Web cache deletion
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method DELETE "/repos/\${WEB_REPOSITORY}/actions/caches?key=x"
`, "foreign-api-write")
  assertWorkflowRejected("unknown-split-dispatch", `
name: Split Web owner dispatch
on: workflow_dispatch
env:
  WEB_OWNER: AquilaXk
  WEB_NAME: aquila-blog-web
  WEB_REPOSITORY: \${WEB_OWNER}/\${WEB_NAME}
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/\${WEB_REPOSITORY}/dispatches" -f event_type=handoff
`, "foreign-web-owner")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: Alternate Web Git remotes
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          git push https://github.com/AquilaXk/aquila-blog-web HEAD:main
          git push git@github.com:AquilaXk/aquila-blog-web.git HEAD:main
          git push https://x-access-token:token@github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Implicit GH_REPO foreign PR reopen
on: workflow_dispatch
env:
  GH_REPO: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh pr reopen 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: GH_REPO placeholder foreign API write
on: workflow_dispatch
env:
  GH_REPO: AquilaXk/aquila-blog-web
  METHOD: POST
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method "$METHOD" "repos/{owner}/{repo}/issues" -f title=x
`, "foreign-api-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Compact method scalar API write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
  METHOD: POST
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api -X$METHOD "repos/\${WEB_REPOSITORY}/issues"
`, "foreign-api-write")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: SSH Web Git remote
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git push ssh://git@github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Env wrapped Web API write
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: env FOO=1 gh pr close --repo "$WEB_REPOSITORY" 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Invocation-local Web target
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          GH_REPO=AquilaXk/aquila-blog-web gh pr close 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: GitHub repository option before Web operation
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh -R AquilaXk/aquila-blog-web pr close 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Repeated Git configuration before Web push
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git -c user.name=ci -c user.email=ci@example.invalid push https://github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: Static Git directory before Web push
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git -C platform push https://github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: No pager before Web push
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git --no-pager push https://github.com/AquilaXk/aquila-blog-web.git HEAD:main
`, "foreign-git-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Runner owner Web API write
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: gh api --method POST "repos/\${GITHUB_REPOSITORY_OWNER}/aquila-blog-web/issues" -f title=handoff
`, "foreign-api-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Quoted invocation-local Web target
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: GH_REPO="AquilaXk/aquila-blog-web" gh pr close 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Whitespace Actions expression Web target
on: workflow_dispatch
env:
  WEB_REPOSITORY: AquilaXk/aquila-blog-web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: GH_REPO=\${{ env.WEB_REPOSITORY }} gh pr close 1
`, "foreign-pr-write")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Expanded working directory Web build
on: workflow_dispatch
env:
  WEB_DIRECTORY: web
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - working-directory: \${{ env.WEB_DIRECTORY }}
        run: npm ci
`, "foreign-workspace-build")
  assertWorkflowRejected("foreign-owner-context-checkout", `
name: GitHub owner-context foreign checkout
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          repository: \${{ github.repository_owner }}/aquila-blog-web
`, "foreign-checkout")
  assertWorkflowRejected("sync-web-legal-policy-to-platform", `
name: Allowlisted owner with foreign Web clone
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: git clone https://github.com/AquilaXk/aquila-blog-web.git consumer
`, "foreign-checkout")
  assertWorkflowRejected("sync-public-contract-to-web", `
name: Alternate package Web prefixes
on: workflow_dispatch
jobs:
  handoff:
    runs-on: ubuntu-latest
    steps:
      - run: |
          npm ci --prefix=web
          pnpm install --dir=web
`, "foreign-workspace-build")

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

test("backend dependency policy upgrades Tomcat and removes expired CVE suppression", () => {
  const suppressions = read("back/config/dependency-check-suppressions.xml")
  const build = read("back/build.gradle.kts")

  assert.match(build, /extra\["tomcat\.version"\] = "11\.0\.25"/)
  assert.doesNotMatch(suppressions, /CVE-2026-66299/)
  assert.match(build, /failBuildOnCVSS = 7\.0f/)
  assert.match(build, /failOnError = true/)
  assert.match(
    build,
    /suppressionFiles\.add\("config\/dependency-check-suppressions\.xml"\)/,
  )
})
