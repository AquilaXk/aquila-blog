import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const frontRoot = path.resolve(scriptDir, "..")
const repoRoot = path.resolve(frontRoot, "..")

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const sanitizeSegment = (value) =>
  value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "unknown"

const readOwnerInfo = (ownerPath) => {
  try {
    return JSON.parse(fs.readFileSync(ownerPath, "utf8"))
  } catch {
    return null
  }
}

const isPidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}

const usage = () => {
  console.error(
    [
      "usage: node scripts/with-test-lock.mjs --resource <name> [--label <name>] [--timeout-ms <ms>] [--poll-ms <ms>] -- <command> [args...]",
      "example: node scripts/with-test-lock.mjs --resource front-verify --label build -- next build",
    ].join("\n")
  )
  process.exit(1)
}

const argv = process.argv.slice(2)
let resource = ""
let label = ""
let timeoutMs = Number(process.env.TEST_LOCK_TIMEOUT_MS || "900000")
let pollMs = Number(process.env.TEST_LOCK_POLL_MS || "1000")
let commandIndex = -1

for (let index = 0; index < argv.length; index += 1) {
  const token = argv[index]
  if (token === "--") {
    commandIndex = index + 1
    break
  }

  if (token === "--resource") {
    resource = argv[index + 1] || ""
    index += 1
    continue
  }

  if (token === "--label") {
    label = argv[index + 1] || ""
    index += 1
    continue
  }

  if (token === "--timeout-ms") {
    timeoutMs = Number(argv[index + 1] || "")
    index += 1
    continue
  }

  if (token === "--poll-ms") {
    pollMs = Number(argv[index + 1] || "")
    index += 1
    continue
  }

  usage()
}

if (!resource || commandIndex < 0 || commandIndex >= argv.length) {
  usage()
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error(`[test-lock] invalid timeout: ${timeoutMs}`)
  process.exit(1)
}

if (!Number.isFinite(pollMs) || pollMs <= 0) {
  console.error(`[test-lock] invalid poll interval: ${pollMs}`)
  process.exit(1)
}

const command = argv.slice(commandIndex)
const safeResource = sanitizeSegment(resource)
const threadToken = sanitizeSegment(process.env.CODEX_THREAD_ID || `pid-${process.pid}`)
const runLabel = label || command[0]
const lockRoot = path.join(os.tmpdir(), "aquila-blog-test-locks", sanitizeSegment(repoRoot))
const lockDir = path.join(lockRoot, `${safeResource}.lock`)
const ownerPath = path.join(lockDir, "owner.json")
const inheritedLock = (process.env.CODEX_SHARED_TEST_LOCK_RESOURCE || "").trim()
const reentrant = inheritedLock === safeResource

const ownerInfo = {
  resource: safeResource,
  label: runLabel,
  threadToken,
  pid: process.pid,
  hostname: os.hostname(),
  acquiredAt: new Date().toISOString(),
  command,
}

let lockAcquired = false
let child = null

const releaseLock = () => {
  if (!lockAcquired || reentrant) return
  lockAcquired = false
  try {
    fs.rmSync(lockDir, { recursive: true, force: true })
  } catch (error) {
    console.warn(`[test-lock] failed to release ${safeResource}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const runCommand = () =>
  new Promise((resolve, reject) => {
    child = spawn(command[0], command.slice(1), {
      cwd: frontRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        CODEX_SHARED_TEST_LOCK_RESOURCE: safeResource,
      },
    })

    child.on("error", reject)
    child.on("exit", (code, signal) => resolve({ code, signal }))
  })

const signals = ["SIGINT", "SIGTERM", "SIGHUP"]
for (const signal of signals) {
  process.on(signal, () => {
    if (child) {
      child.kill(signal)
      return
    }
    releaseLock()
    process.exit(1)
  })
}

const acquireLock = async () => {
  if (reentrant) return

  fs.mkdirSync(lockRoot, { recursive: true })
  const waitStartedAt = Date.now()
  let lastOwnerSignature = ""

  while (true) {
    try {
      fs.mkdirSync(lockDir)
      fs.writeFileSync(ownerPath, JSON.stringify(ownerInfo, null, 2))
      lockAcquired = true
      console.error(`[test-lock] acquired ${safeResource} (${runLabel})`)
      return
    } catch (error) {
      if (error?.code !== "EEXIST") throw error

      const currentOwner = readOwnerInfo(ownerPath)
      if (currentOwner && !isPidAlive(currentOwner.pid)) {
        console.error(
          `[test-lock] stale lock detected for ${safeResource}; removing owner pid=${currentOwner.pid} label=${currentOwner.label || "unknown"}`
        )
        fs.rmSync(lockDir, { recursive: true, force: true })
        continue
      }

      const signature = currentOwner
        ? `${currentOwner.pid}:${currentOwner.threadToken || "unknown"}:${currentOwner.label || "unknown"}`
        : "unknown"

      if (signature !== lastOwnerSignature) {
        const ownerSummary = currentOwner
          ? `owner=${currentOwner.label || "unknown"} thread=${currentOwner.threadToken || "unknown"} pid=${currentOwner.pid || "unknown"}`
          : "owner=unknown"
        console.error(`[test-lock] waiting for ${safeResource}; ${ownerSummary}`)
        lastOwnerSignature = signature
      }

      if (Date.now() - waitStartedAt >= timeoutMs) {
        console.error(`[test-lock] timeout waiting for ${safeResource} after ${timeoutMs}ms`)
        process.exit(1)
      }

      await sleep(pollMs)
    }
  }
}

try {
  await acquireLock()
  const { code, signal } = await runCommand()
  releaseLock()

  if (signal) {
    process.kill(process.pid, signal)
  }

  process.exit(code ?? 1)
} catch (error) {
  releaseLock()
  console.error(`[test-lock] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
