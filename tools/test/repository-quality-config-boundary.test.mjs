import assert from "node:assert/strict"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const read = (file) => readFileSync(path.join(repoRoot, file), "utf8")
const sonarValue = (source, key) => source
  .replace(/\\\r?\n\s*/g, "")
  .match(new RegExp(`^${key.replaceAll(".", "\\.")}=(.*)$`, "m"))?.[1]
const webRootPath = /(?:^|["'\s:=,])\/?front(?:\/|["'\s,]|$)/m
const platformRootPath = /(?:^|["'\s:=,])\/?(?:back|deploy)(?:\/|["'\s,]|$)/m

test("Web quality configuration is root-ready and Web-only", () => {
  const security = read("front/.github/workflows/security.yml")
  const sonarWorkflow = read("front/.github/workflows/sonarcloud.yml")
  const sonar = read("front/sonar-project.properties")
  const automaticSonar = read("front/.sonarcloud.properties")
  const codeRabbit = read("front/.coderabbit.yaml")
  const dependabot = read("front/.github/dependabot.yml")
  const osv = read("front/osv-scanner.toml")
  const trivy = read("front/.trivyignore.yaml")
  const combined = [security, sonarWorkflow, sonar, automaticSonar, codeRabbit, dependabot, osv, trivy].join("\n")

  assert.match(security, /^  codeql-javascript-typescript:/m)
  assert.match(security, /^  lockfile-audit:/m)
  assert.match(security, /security-csp-header\.spec\.ts/)
  assert.doesNotMatch(security, /java-kotlin|gradlew|dependencyCheckAnalyze/)
  assert.match(sonar, /^sonar\.projectKey=AquilaXk_aquila-blog-web$/m)
  assert.match(sonar, /^sonar\.sources=src,packages$/m)
  assert.match(sonar, /^sonar\.tests=e2e,tests\/unit$/m)
  for (const key of ["sonar.sources", "sonar.tests", "sonar.exclusions"]) {
    const expected = sonarValue(sonar, key)
    assert.ok(expected, key)
    assert.equal(sonarValue(automaticSonar, key), expected, key)
  }
  assert.match(codeRabbit, /path: "src\/\*\*"/)
  assert.match(dependabot, /package-ecosystem: "npm"/)
  assert.match(dependabot, /package-ecosystem: "github-actions"/)
  assert.match(security, /--config osv-scanner\.toml/)
  assert.match(security, /--ignorefile \.trivyignore\.yaml/)
  assert.match(security, /--list-all-pkgs/)
  assert.match(security, /scanned_packages/)
  assert.match(osv, /id = "CVE-2026-14257"/)
  assert.match(osv, /ignoreUntil = 2026-08-08/)
  assert.match(trivy, /id: CVE-2026-14257/)
  assert.match(trivy, /expired_at: 2026-08-08/)
  assert.match(sonarWorkflow, /vars\.SONARCLOUD_CI_ENABLED != 'true'/)
  assert.match(sonarWorkflow, /vars\.SONARCLOUD_CI_ENABLED == 'true'/)
  assert.doesNotMatch(combined, webRootPath)
  assert.doesNotMatch(combined, platformRootPath)
})

test("quality boundary patterns reject quoted and absolute repository roots", () => {
  for (const value of [
    'path: "front/**"',
    "directory: '/front'",
    'path: "/back/**"',
    "directory: 'deploy/'",
    "working-directory: front",
    "directory: /front",
    "path: back",
    "owner: deploy,",
  ]) {
    assert.match(value, value.includes("front") ? webRootPath : platformRootPath)
  }
})

test("Platform boundary scanner does not follow tracked symlinks", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "platform-boundary-"))
  t.after(() => rmSync(root, { force: true, recursive: true }))
  mkdirSync(path.join(root, "tools/repo-boundary"), { recursive: true })
  mkdirSync(path.join(root, ".github/workflows"), { recursive: true })
  copyFileSync(
    path.join(repoRoot, "tools/repo-boundary/check-platform-boundary.mjs"),
    path.join(root, "tools/repo-boundary/check-platform-boundary.mjs"),
  )
  const outside = path.join(root, "outside.txt")
  writeFileSync(outside, "front/yarn.lock\n")
  symlinkSync(outside, path.join(root, "tools/external-link"))
  const raceFile = path.join(root, "tools/race.txt")
  writeFileSync(raceFile, "safe\n")
  writeFileSync(path.join(root, ".github/workflows/ci.yml"), [
    "working-directory: ./front",
    "working-directory: \"front\"",
    "working-directory: 'front'",
    "working-directory: front/subdir",
    "working-directory: /front",
  ].join("\n"))
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

  const result = spawnSync(process.execPath, ["tools/repo-boundary/check-platform-boundary.mjs", "--report-only"], {
    cwd: root,
    encoding: "utf8",
  })
  assert.equal(result.status, 0, result.stderr)
  for (let line = 1; line <= 5; line += 1) {
    assert.match(result.stderr, new RegExp(`\\.github/workflows/ci\\.yml:${line}(?:,|\\s*$)`))
  }

  const raceResult = spawnSync(
    process.execPath,
    ["--require", racePreload, "tools/repo-boundary/check-platform-boundary.mjs", "--report-only"],
    { cwd: root, encoding: "utf8", timeout: 1_000 },
  )
  assert.equal(raceResult.status, 0, raceResult.error?.message || raceResult.stderr)
})

test("root quality configuration preserves Web coverage until physical cutover", () => {
  const security = read(".github/workflows/security.yml")
  const sonar = read("sonar-project.properties")
  const automaticSonar = read(".sonarcloud.properties")
  const codeRabbit = read(".coderabbit.yaml")
  const dependabot = read(".github/dependabot.yml")

  assert.match(security, /java-kotlin/)
  assert.match(security, /dependencyCheckAnalyze/)
  assert.match(security, /dependency-review-action/)
  assert.match(security, /javascript-typescript/)
  assert.match(security, /front\/yarn\.lock/)
  assert.match(security, /node:20-alpine/)
  assert.match(sonar, /^sonar\.projectKey=AquilaXk_aquila-blog$/m)
  assert.match(sonar, /^sonar\.sources=back\/src\/main,front\/src,front\/packages$/m)
  assert.match(automaticSonar, /^sonar\.sources=back\/src\/main,front\/src,front\/packages$/m)
  assert.match(codeRabbit, /path: "front\/\*\*"/)
  assert.match(codeRabbit, /path: "back\/\*\*"/)
  assert.match(dependabot, /package-ecosystem: "gradle"/)
  assert.match(dependabot, /package-ecosystem: "github-actions"/)
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

  assert.equal(expiry, "2026-08-23")
  assert.deepEqual(selectors, ["packageUrl", "cve"])
  assert.match(
    block,
    /<packageUrl regex="true">\^pkg:maven\/org\\\.apache\\\.tomcat\\\.embed\/tomcat-embed-\(\?:core\|websocket\)@11\\\.0\\\.24\$<\/packageUrl>/,
  )
  assert.match(block, /<cve>CVE-2026-66299<\/cve>/)
  assert.ok(block.includes("https://tomcat.apache.org/security-11.html"))
  assert.ok(block.includes("https://github.com/AquilaXk/aquila-blog/issues/1647"))
  assert.match(build, /failBuildOnCVSS = 7\.0f/)
  assert.match(build, /failOnError = true/)
})
