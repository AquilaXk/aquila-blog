#!/usr/bin/env node
import { appendFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const phases = new Map([
  ["vercel.deployment.ready", "ready"],
  ["vercel.deployment.promoted", "promoted"],
  ["workflow_dispatch", "ready"],
])
const webDeploymentHost = /^aquila-blog-web-[a-z0-9]{9}-aquilaxks-projects\.vercel\.app$/
const commitSha = /^[a-f0-9]{40}$/

export const resolveLiveTarget = ({ eventType, deploymentUrl, environment, sourceCommit }) => {
  const phase = phases.get(eventType)
  if (!phase) throw new Error("unsupported deployment event")
  if (environment !== "production") throw new Error("production environment is required")
  const commit = sourceCommit?.trim() || ""
  if (eventType !== "workflow_dispatch" && !commitSha.test(commit)) {
    throw new Error("repository dispatch source commit must be 40 lowercase hex")
  }

  const deployment = new URL(deploymentUrl)
  if (deployment.protocol !== "https:" || !webDeploymentHost.test(deployment.hostname)) {
    throw new Error("an immutable HTTPS Vercel deployment URL is required")
  }
  if (deployment.pathname !== "/" || deployment.search || deployment.hash) {
    throw new Error("deployment URL must not contain a path, query, or fragment")
  }

  return phase === "ready"
    ? {
        phase,
        webUrl: deployment.origin,
        checkName: "Vercel - aquila-blog-web: production-ready",
        requiresCredentials: false,
        sourceCommit: commit,
      }
    : {
        phase,
        webUrl: "https://www.aquilaxk.site",
        checkName: "Vercel - aquila-blog-web: production-promoted",
        requiresCredentials: true,
        sourceCommit: commit,
      }
}

const parseArgs = (argv) => {
  const args = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    const value = argv[index + 1]
    if (value === undefined) throw new Error(`missing value for ${key}`)
    if (key === "--event-type") args.eventType = value
    else if (key === "--deployment-url") args.deploymentUrl = value
    else if (key === "--environment") args.environment = value
    else if (key === "--source-commit") args.sourceCommit = value
    else if (key === "--github-output") args.githubOutput = value
    else throw new Error(`unknown argument: ${key}`)
  }
  return args
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    if (!args.githubOutput) throw new Error("--github-output is required")
    const target = resolveLiveTarget(args)
    appendFileSync(args.githubOutput, [
      `phase=${target.phase}`,
      `web_url=${target.webUrl}`,
      `check_name=${target.checkName}`,
      `requires_credentials=${target.requiresCredentials}`,
      `source_commit=${target.sourceCommit}`,
      "",
    ].join("\n"))
  } catch (error) {
    console.error(`[live-targets] ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
