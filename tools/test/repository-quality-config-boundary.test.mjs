import assert from "node:assert/strict"
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const read = (file) => readFileSync(path.join(repoRoot, file), "utf8")
const webRootPath = /(?:^|["'\s:=,])\/?front(?:\/|["'\s,]|$)/m

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
