import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import http from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  DEFAULT_READINESS_PATH,
  buildPromtailTargets,
  parseReadinessTargets,
} from "../../deploy/homeserver/monitoring/docker-runtime-probe.mjs"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const alertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")
const promtailConfigPath = path.join(repoRoot, "deploy/homeserver/monitoring/promtail/promtail-config.yml")

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

test("compose routes docker_runtime_probe through docker_socket_read_proxy without mounting raw docker.sock", () => {
  const compose = read(composePath)
  const dockerUrl = composeArgumentValue(compose, "--docker-url")

  assert.equal(dockerUrl, "http://docker_socket_read_proxy:2375")

  const probeSectionStart = compose.indexOf("  docker_runtime_probe:")
  const nextSectionStart = compose.indexOf("  back_blue:", probeSectionStart)
  const probeBlock = compose.slice(probeSectionStart, nextSectionStart)

  assert.doesNotMatch(probeBlock, /\/var\/run\/docker\.sock/)
  assert.match(probeBlock, /depends_on:\s*\n\s*-\s*docker_socket_read_proxy/)
  assert.match(
    read(path.join(repoRoot, "deploy/homeserver/monitoring/docker-runtime-probe.mjs")),
    /\/stats\?stream=false&one-shot=true/,
  )
})

test("resolveDockerEndpointOptions supports both unix socket paths and HTTP docker proxy URLs", async () => {
  const probeModule = await import("../../deploy/homeserver/monitoring/docker-runtime-probe.mjs")

  assert.equal(typeof probeModule.resolveDockerEndpointOptions, "function")
  assert.deepEqual(
    probeModule.resolveDockerEndpointOptions({
      dockerUrl: "http://docker_socket_read_proxy:2375",
      dockerSocketPath: "/var/run/docker.sock",
    }),
    {
      protocol: "http:",
      hostname: "docker_socket_read_proxy",
      port: 2375,
      basePath: "",
    },
  )
  assert.deepEqual(
    probeModule.resolveDockerEndpointOptions({
      dockerUrl: "",
      dockerSocketPath: "/var/run/docker.sock",
    }),
    {
      socketPath: "/var/run/docker.sock",
    },
  )
})

test("buildPromtailTargets filters running project containers, preserves relabel metadata, and skips unsafe ids", async () => {
  const probeModule = await import("../../deploy/homeserver/monitoring/docker-runtime-probe.mjs")
  assert.equal(typeof probeModule.buildPromtailTargets, "function")

  const idA = "a".repeat(64)
  const idB = "b".repeat(64)
  const idOther = "c".repeat(64)
  const idStopped = "d".repeat(64)

  const targets = probeModule.buildPromtailTargets(
    [
      {
        Id: idB,
        Names: ["blog_home-caddy-1"],
        State: "running",
        Labels: {
          "com.docker.compose.project": "blog_home",
          "com.docker.compose.service": "caddy",
        },
      },
      {
        Id: idA,
        Names: ["/blog_home-back_blue-1"],
        State: "running",
        Labels: {
          "com.docker.compose.project": "blog_home",
          "com.docker.compose.service": "back_blue",
          promtail: "ignore",
        },
      },
      {
        Id: idOther,
        Names: ["/other-app-1"],
        State: "running",
        Labels: {
          "com.docker.compose.project": "other_project",
          "com.docker.compose.service": "api",
        },
      },
      {
        Id: idStopped,
        Names: ["/blog_home-exited-1"],
        State: "exited",
        Labels: {
          "com.docker.compose.project": "blog_home",
          "com.docker.compose.service": "back_green",
        },
      },
      {
        Id: "../escape",
        Names: ["/bad-id"],
        State: "running",
        Labels: {
          "com.docker.compose.project": "blog_home",
          "com.docker.compose.service": "evil",
        },
      },
    ],
    "blog_home",
  )

  assert.deepEqual(targets, [
    {
      targets: [idA],
      labels: {
        __meta_docker_container_id: idA,
        __meta_docker_container_name: "/blog_home-back_blue-1",
        __meta_docker_container_label_com_docker_compose_service: "back_blue",
        __meta_docker_container_label_com_docker_compose_project: "blog_home",
        __meta_docker_container_label_promtail: "ignore",
        __path__: `/var/lib/docker/containers/${idA}/${idA}-json.log`,
      },
    },
    {
      targets: [idB],
      labels: {
        __meta_docker_container_id: idB,
        __meta_docker_container_name: "/blog_home-caddy-1",
        __meta_docker_container_label_com_docker_compose_service: "caddy",
        __meta_docker_container_label_com_docker_compose_project: "blog_home",
        __meta_docker_container_label_promtail: "",
        __path__: `/var/lib/docker/containers/${idB}/${idB}-json.log`,
      },
    },
  ])
})

test("writePromtailTargetsIfChanged writes empty array immediately, skips unchanged writes, and renames atomically", async () => {
  const probeModule = await import("../../deploy/homeserver/monitoring/docker-runtime-probe.mjs")
  assert.equal(typeof probeModule.writePromtailTargetsIfChanged, "function")

  const workDir = mkdtempSync(path.join(tmpdir(), "promtail-sd-write-"))
  try {
    const targetPath = path.join(workDir, "nested/docker-containers.json")
    const state = { lastSerialized: null }

    const firstWritten = probeModule.writePromtailTargetsIfChanged(targetPath, [], state)
    assert.equal(firstWritten, true)
    assert.equal(existsSync(targetPath), true)
    assert.deepEqual(JSON.parse(readFileSync(targetPath, "utf8")), [])

    const firstInode = statSync(targetPath).ino
    const secondWritten = probeModule.writePromtailTargetsIfChanged(targetPath, [], state)
    assert.equal(secondWritten, false)
    assert.equal(statSync(targetPath).ino, firstInode)

    const sampleTargets = [
      {
        targets: ["e".repeat(64)],
        labels: {
          __meta_docker_container_id: "e".repeat(64),
          __meta_docker_container_name: "/blog_home-loki-1",
          __meta_docker_container_label_com_docker_compose_service: "loki",
          __meta_docker_container_label_com_docker_compose_project: "blog_home",
          __meta_docker_container_label_promtail: "",
          __path__: `/var/lib/docker/containers/${"e".repeat(64)}/${"e".repeat(64)}-json.log`,
        },
      },
    ]
    const thirdWritten = probeModule.writePromtailTargetsIfChanged(targetPath, sampleTargets, state)
    assert.equal(thirdWritten, true)
    assert.deepEqual(JSON.parse(readFileSync(targetPath, "utf8")), sampleTargets)
    assert.deepEqual(readdirSync(path.dirname(targetPath)), ["docker-containers.json"])
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("docker_runtime_probe serves file_sd targets via docker proxy HTTP API and promtail preserves relabel drops", async () => {
  const compose = read(composePath)
  const promtailConfig = read(promtailConfigPath)

  assert.equal(composeArgumentValue(compose, "--promtail-targets-path"), "/promtail-sd/docker-containers.json")
  assert.match(compose, /promtail_sd_targets:/)
  assert.match(promtailConfig, /file_sd_configs:/)
  assert.doesNotMatch(promtailConfig, /docker_sd_configs:/)
  assert.match(promtailConfig, /-\s*\/promtail-sd\/docker-containers\.json\b/)
  assert.match(promtailConfig, /source_labels:\s*\[__meta_docker_container_label_promtail\]\s*\n\s*regex:\s*ignore\s*\n\s*action:\s*drop/)

  const idMain = "1".repeat(64)
  const idIgnored = "2".repeat(64)
  let currentContainers = [
    {
      Id: idMain,
      Names: ["/blog_home-loki-1"],
      State: "running",
      Labels: {
        "com.docker.compose.project": "blog_home",
        "com.docker.compose.service": "loki",
      },
    },
    {
      Id: idIgnored,
      Names: ["/blog_home-guard-curl-1"],
      State: "running",
      Labels: {
        "com.docker.compose.project": "blog_home",
        "com.docker.compose.service": "guard_curl",
        promtail: "ignore",
      },
    },
  ]

  const proxyRequests = []
  const dockerProxy = http.createServer((request, response) => {
    proxyRequests.push(request.url)
    if (request.url === "/containers/json?all=1") {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify(currentContainers))
      return
    }
    if (request.url?.startsWith("/containers/") && request.url.endsWith("/json")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ State: { Running: true, OOMKilled: false }, RestartCount: 0 }))
      return
    }
    if (request.url?.includes("/stats?")) {
      response.writeHead(200, { "content-type": "application/json" })
      response.end(JSON.stringify({ memory_stats: { usage: 1024, limit: 2048 } }))
      return
    }
    response.writeHead(404)
    response.end()
  })

  await new Promise((resolve) => dockerProxy.listen(0, "127.0.0.1", resolve))
  const proxyAddress = dockerProxy.address()
  const workDir = mkdtempSync(path.join(tmpdir(), "probe-e2e-"))
  const targetsFile = path.join(workDir, "docker-containers.json")
  const probeScriptPath = path.join(repoRoot, "deploy/homeserver/monitoring/docker-runtime-probe.mjs")

  let child
  try {
    // Choose a random free port by binding and closing an ephemeral server first.
    const probePort = await new Promise((resolve) => {
      const tempServer = http.createServer()
      tempServer.listen(0, "127.0.0.1", () => {
        const port = tempServer.address().port
        tempServer.close(() => resolve(port))
      })
    })

    child = spawn(
      process.execPath,
      [
        probeScriptPath,
        "--serve-port",
        String(probePort),
        "--docker-url",
        `http://127.0.0.1:${proxyAddress.port}`,
        "--project",
        "blog_home",
        "--services",
        "loki",
        "--readiness-targets",
        "",
        "--disk-paths",
        "",
        "--promtail-targets-path",
        targetsFile,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    )

    await new Promise((resolve, reject) => {
      const deadline = Date.now() + 5000
      const poll = async () => {
        if (Date.now() > deadline) {
          reject(new Error("docker-runtime-probe did not become ready in time"))
          return
        }
        try {
          const response = await fetch(`http://127.0.0.1:${probePort}/healthz`)
          if (response.ok && existsSync(targetsFile)) {
            resolve()
            return
          }
        } catch {
          // Retry until server binds.
        }
        setTimeout(poll, 50)
      }
      poll()
    })

    const metricsRes = await fetch(`http://127.0.0.1:${probePort}/metrics`)
    assert.equal(metricsRes.status, 200)
    const initialTargets = JSON.parse(readFileSync(targetsFile, "utf8"))
    assert.equal(initialTargets.length, 2)
    assert.equal(
      initialTargets.find((entry) => entry.labels.__meta_docker_container_id === idIgnored)?.labels
        .__meta_docker_container_label_promtail,
      "ignore",
    )
    assert.ok(proxyRequests.includes("/containers/json?all=1"))
  } finally {
    if (child && !child.killed) {
      child.kill("SIGTERM")
      await new Promise((resolve) => child.once("exit", resolve))
    }
    await new Promise((resolve) => dockerProxy.close(resolve))
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("buildPromtailTargets applies MAX_PROMTAIL_CONTAINERS after filtering stopped or unrelated containers", () => {
  const stoppedNoise = Array.from({ length: 600 }, (_, i) => ({
    Id: `${String(i + 1).padStart(16, "0")}`,
    Names: [`/stopped-${i}`],
    State: "exited",
    Labels: {
      "com.docker.compose.project": "blog_home",
      "com.docker.compose.service": "ephemeral",
    },
  }))
  const runningId = "fedcba9876543210fedcba9876543210"
  const result = buildPromtailTargets(
    [
      ...stoppedNoise,
      {
        Id: runningId,
        Names: ["/blog_home-back_green-1"],
        State: "running",
        Labels: {
          "com.docker.compose.project": "blog_home",
          "com.docker.compose.service": "back_green",
        },
      },
    ],
    "blog_home",
  )

  assert.equal(result.length, 1)
  assert.equal(result[0].labels.__meta_docker_container_id, runningId)
})


