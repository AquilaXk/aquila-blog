#!/usr/bin/env node
/**
 * Fail-closed yarn audit gate for High/Critical advisories (#1124).
 * Rejects the yarn classic false-pass where `--groups a,b` audits 0 packages.
 *
 * Usage:
 *   node tools/guards/check-yarn-audit-high.mjs
 *   node tools/guards/check-yarn-audit-high.mjs --cwd front
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import {
  isAllowlisted,
  loadAllowlistForImport,
} from "./check-vulnerability-exceptions.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export function parseYarnAuditJsonLines(raw) {
  const advisories = new Map()
  let packagesAudited = null
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.trim()) continue
    let event
    try {
      event = JSON.parse(line)
    } catch {
      continue
    }
    if (event.type === "auditSummary") {
      const total = event.data?.totalDependencies
      if (typeof total === "number") packagesAudited = total
      continue
    }
    if (event.type !== "auditAdvisory") continue
    const advisory = event.data?.advisory
    if (!advisory) continue
    const severity = String(advisory.severity || "").toLowerCase()
    if (severity !== "high" && severity !== "critical") continue
    const ghsa = advisory.github_advisory_id || ""
    const cves = Array.isArray(advisory.cves) ? advisory.cves : []
    const id = ghsa || cves[0] || String(advisory.id || "unknown")
    const pkg = advisory.module_name || "unknown"
    const key = `${id}|${pkg}`
    if (!advisories.has(key)) {
      advisories.set(key, {
        id,
        aliases: [ghsa, ...cves].filter(Boolean),
        package: pkg,
        severity,
        title: advisory.title || "",
      })
    }
  }
  return { packagesAudited, advisories: [...advisories.values()] }
}

export function filterYarnAdvisories(advisories, exceptions, { now = new Date() } = {}) {
  return advisories.filter((item) => {
    const ids = [item.id, ...(item.aliases || [])]
    return !ids.some((id) => isAllowlisted(id, item.package, exceptions, { now }))
  })
}

function main(argv = process.argv.slice(2)) {
  const cwdFlag = argv.indexOf("--cwd")
  const cwdRel = cwdFlag === -1 ? "front" : argv[cwdFlag + 1]
  if (!cwdRel) {
    console.error("usage: check-yarn-audit-high.mjs [--cwd front]")
    process.exit(2)
  }
  const cwd = path.resolve(repoRoot, cwdRel)
  const result = spawnSync("yarn", ["audit", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  })
  const raw = `${result.stdout || ""}${result.stderr || ""}`
  const { packagesAudited, advisories } = parseYarnAuditJsonLines(raw)
  if (packagesAudited === null || packagesAudited <= 0) {
    console.error(
      "[yarn-audit-high] refuse to pass: packages audited is 0/missing (yarn audit false-pass).",
    )
    process.exit(1)
  }

  let exceptions
  try {
    exceptions = loadAllowlistForImport()
  } catch (error) {
    console.error(`[yarn-audit-high] ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
  const blocking = filterYarnAdvisories(advisories, exceptions)
  if (blocking.length > 0) {
    console.error(`[yarn-audit-high] blocking High/Critical: ${blocking.length}`)
    for (const item of blocking.slice(0, 80)) {
      console.error(` - ${item.severity} ${item.id} ${item.package} ${item.title}`)
    }
    process.exit(1)
  }
  console.log(
    `[yarn-audit-high] ok: audited=${packagesAudited} high/critical(after allowlist)=0`,
  )
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main()
}
