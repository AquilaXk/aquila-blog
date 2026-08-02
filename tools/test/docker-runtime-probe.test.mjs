import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

import {
  DEFAULT_READINESS_PATH,
  parseReadinessTargets,
} from "../../deploy/homeserver/monitoring/docker-runtime-probe.mjs"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const alertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")

const read = (filePath) => readFileSync(filePath, "utf8")

const composeArgumentValue = (compose, flag) => {
  const lines = compose.split("\n")
  const index = lines.findIndex((line) => line.trim() === `- "${flag}"`)
  assert.notEqual(index, -1, `missing ${flag} argument in compose`)
  // The next non-comment line is the argument value; comments between a flag and its value are the
  // house style in this file.
  const valueLine = lines.slice(index + 1).find((line) => line.trim() && !line.trim().startsWith("#"))
  assert.ok(valueLine, `missing value line after ${flag} in compose`)
  const match = valueLine.trim().match(/^- "(.*)"$/)
  assert.ok(match, `unexpected ${flag} value line: ${valueLine}`)
  return match[1]
}

test("readiness targets keep the pathless backend form", () => {
  const targets = parseReadinessTargets("api=back-blue:8080,worker=back-worker:8080")

  assert.deepEqual(targets, [
    { component: "api", target: "back-blue:8080", path: DEFAULT_READINESS_PATH },
    { component: "worker", target: "back-worker:8080", path: DEFAULT_READINESS_PATH },
  ])
})

test("readiness targets carry a per-target path without changing the target label", () => {
  const targets = parseReadinessTargets(
    "front=front_blue:3000/api/backend/post/api/v1/posts/tags, front=front_green:3000/api/backend/post/api/v1/posts/tags",
  )

  assert.deepEqual(targets, [
    {
      component: "front",
      target: "front_blue:3000",
      path: "/api/backend/post/api/v1/posts/tags",
    },
    {
      component: "front",
      target: "front_green:3000",
      path: "/api/backend/post/api/v1/posts/tags",
    },
  ])
})

test("readiness targets ignore empty entries and keep an unlabelled address usable", () => {
  assert.deepEqual(parseReadinessTargets(""), [])
  assert.deepEqual(parseReadinessTargets(" , "), [])
  assert.deepEqual(parseReadinessTargets("back-blue:8080"), [
    { component: "unknown", target: "back-blue:8080", path: DEFAULT_READINESS_PATH },
  ])
})

test("compose registers both front colours as observed services", () => {
  const services = composeArgumentValue(read(composePath), "--services").split(",")

  assert.ok(services.includes("front_blue"), `front_blue missing from --services: ${services}`)
  assert.ok(services.includes("front_green"), `front_green missing from --services: ${services}`)
})

// The front tier has no /actuator surface. If the compose argument ever loses the explicit path the
// probe would fall back to the backend readiness group and report both front colours as 404 forever,
// which reads as "front is broken" instead of "the probe is asking the wrong question".
test("compose front readiness targets probe the backend proxy path, not a static path", () => {
  const targets = parseReadinessTargets(composeArgumentValue(read(composePath), "--readiness-targets"))
  const frontTargets = targets.filter((target) => target.component === "front")

  assert.equal(frontTargets.length, 2)
  assert.deepEqual(
    frontTargets.map((target) => target.target).sort(),
    ["front_blue:3000", "front_green:3000"],
  )
  for (const target of frontTargets) {
    assert.equal(target.path, "/api/backend/post/api/v1/posts/tags")
    assert.notEqual(target.path, DEFAULT_READINESS_PATH)
    assert.notEqual(target.path, "/robots.txt")
  }

  // The backend targets must not have been rewritten by the same change.
  assert.ok(targets.some((target) => target.component === "api" && target.path === DEFAULT_READINESS_PATH))
})

test("front containers are covered by restart, OOM and readiness alerts", () => {
  const alerts = read(alertsPath)

  assert.match(alerts, /alert: AquilaFrontReadinessDown/)
  assert.match(alerts, /aquila_backend_readiness_up\{component="front"\}/)
  // The readiness alert must stay gated on a running container so the documented
  // "disable the front profile" rollback does not page anyone.
  // Whitespace is matched loosely: a YAML reformat must not turn an intact gate into a red test.
  assert.match(
    alerts,
    /max\(\s*docker_container_running\{job="docker_runtime_probe",service=~"front_\(blue\|green\)"\}\s*\)\s*==\s*1/,
  )
  // A front container that exceeds mem_limit must page, not just raise the restart warning.
  assert.match(
    alerts,
    /increase\(docker_container_restart_count\{job="docker_runtime_probe",service=~"back_\.\+\|front_\.\+/,
  )
  assert.match(
    alerts,
    /docker_container_oom_killed\{job="docker_runtime_probe",service=~"back_\.\+\|front_\.\+/,
  )
})
