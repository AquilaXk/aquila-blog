import fs from "node:fs"
import http from "node:http"

const args = process.argv.slice(2)
const optionValue = (name, fallback) => {
  const index = args.indexOf(name)
  if (index === -1 || index + 1 >= args.length) return fallback
  return args[index + 1]
}

const servePort = Number(optionValue("--serve-port", "9920"))
const composeProject = optionValue("--project", "blog_home")
const services = optionValue(
  "--services",
  "cloudflared,back_blue,back_green,back_read,back_admin,back_worker,db_1,redis_1,minio_1",
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
const diskPaths = optionValue("--disk-paths", "minio=/host-storage/minio")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const separator = value.indexOf("=")
    if (separator <= 0) return null
    return {
      mount: value.slice(0, separator),
      path: value.slice(separator + 1),
    }
  })
  .filter(Boolean)

const dockerSocketPath = optionValue("--docker-socket", "/var/run/docker.sock")
const readinessTargets = optionValue(
  "--readiness-targets",
  "api=back-blue:8080,api=back-green:8080,read=back-read:8080,admin=back-admin:8080,worker=back_worker:8080",
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => {
    const [component, target] = value.split("=")
    return { component: component || "unknown", target: target || value }
  })

const escapeLabel = (value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")

const metricLine = (name, labels, value) => {
  const labelText = Object.entries(labels)
    .map(([key, labelValue]) => `${key}="${escapeLabel(String(labelValue))}"`)
    .join(",")
  return `${name}{${labelText}} ${Number.isFinite(value) ? value : 0}`
}

const matchingContainerForService = (containers, service) =>
  containers
    .filter((candidate) => {
      const labels = candidate.Labels || {}
      return labels["com.docker.compose.project"] === composeProject && labels["com.docker.compose.service"] === service
    })
    .sort((left, right) => {
      const leftRunning = String(left.State || "").toLowerCase() === "running" ? 1 : 0
      const rightRunning = String(right.State || "").toLowerCase() === "running" ? 1 : 0
      if (leftRunning !== rightRunning) return rightRunning - leftRunning
      return (right.Created || 0) - (left.Created || 0)
    })[0]

const dockerGet = (path) =>
  new Promise((resolve, reject) => {
    const chunks = []

    const request = http.request({ method: "GET", path, socketPath: dockerSocketPath, timeout: 5000 }, (response) => {
      response.on("data", (chunk) => chunks.push(chunk))
      response.on("end", () => {
        const status = response.statusCode || 0
        if (status < 200 || status >= 300) {
          reject(new Error(`docker ${path} returned ${status}`))
          return
        }
        const body = Buffer.concat(chunks).toString("utf8")
        resolve(JSON.parse(body || "null"))
      })
    })

    request.on("timeout", () => {
      request.destroy(new Error(`docker request timed out: ${path}`))
    })
    request.on("error", reject)
    request.end()
  })

const probeReadiness = ({ component, target }) =>
  new Promise((resolve) => {
    const [host, port = "8080"] = target.split(":")
    const request = http.request(
      {
        method: "GET",
        host,
        port: Number(port),
        path: "/actuator/health/readiness",
        timeout: 3000,
      },
      (response) => {
        response.resume()
        response.on("end", () => {
          const value = response.statusCode === 200 ? 1 : 0
          resolve(metricLine("aquila_backend_readiness_up", { component, target }, value))
        })
      },
    )

    request.on("timeout", () => {
      request.destroy()
      resolve(metricLine("aquila_backend_readiness_up", { component, target }, 0))
    })
    request.on("error", () => {
      resolve(metricLine("aquila_backend_readiness_up", { component, target }, 0))
    })
    request.end()
  })

const collectServiceMetrics = async (containers, service) => {
  const container = matchingContainerForService(containers, service)

  if (!container) {
    return [
      metricLine("docker_container_restart_count", { service }, 0),
      metricLine("docker_container_running", { service }, 0),
      metricLine("docker_container_memory_usage_bytes", { service }, 0),
      metricLine("docker_container_memory_limit_bytes", { service }, 0),
      metricLine("docker_container_oom_killed", { service }, 0),
    ]
  }

  const inspect = await dockerGet(`/containers/${container.Id}/json`)
  const stats = inspect.State?.Running ? await dockerGet(`/containers/${container.Id}/stats?stream=false`) : null
  const memoryUsage = stats?.memory_stats?.usage || 0
  const memoryLimit = stats?.memory_stats?.limit || 0
  const restartCount = inspect.RestartCount || 0

  return [
    metricLine("docker_container_restart_count", { service }, restartCount),
    metricLine("docker_container_running", { service }, inspect.State?.Running ? 1 : 0),
    metricLine("docker_container_memory_usage_bytes", { service }, memoryUsage),
    metricLine("docker_container_memory_limit_bytes", { service }, memoryLimit),
    metricLine("docker_container_oom_killed", { service }, inspect.State?.OOMKilled ? 1 : 0),
  ]
}

const collectDiskMetrics = () => {
  const lines = [
    "# HELP aquila_host_filesystem_avail_bytes Available bytes on a host path watched by docker-runtime-probe.",
    "# TYPE aquila_host_filesystem_avail_bytes gauge",
    "# HELP aquila_host_filesystem_size_bytes Total bytes on a host path watched by docker-runtime-probe.",
    "# TYPE aquila_host_filesystem_size_bytes gauge",
    "# HELP aquila_host_filesystem_up Whether a watched host path is readable.",
    "# TYPE aquila_host_filesystem_up gauge",
  ]

  for (const disk of diskPaths) {
    try {
      const stats = fs.statfsSync(disk.path)
      const bsize = Number(stats.bsize || 0)
      const blocks = Number(stats.blocks || 0)
      const bavail = Number(stats.bavail || 0)
      lines.push(metricLine("aquila_host_filesystem_avail_bytes", { mount: disk.mount, path: disk.path }, bavail * bsize))
      lines.push(metricLine("aquila_host_filesystem_size_bytes", { mount: disk.mount, path: disk.path }, blocks * bsize))
      lines.push(metricLine("aquila_host_filesystem_up", { mount: disk.mount, path: disk.path }, 1))
    } catch {
      lines.push(metricLine("aquila_host_filesystem_avail_bytes", { mount: disk.mount, path: disk.path }, 0))
      lines.push(metricLine("aquila_host_filesystem_size_bytes", { mount: disk.mount, path: disk.path }, 0))
      lines.push(metricLine("aquila_host_filesystem_up", { mount: disk.mount, path: disk.path }, 0))
    }
  }

  return lines
}

const collectMetrics = async () => {
  const containers = await dockerGet("/containers/json?all=1")
  const lines = [
    "# HELP docker_runtime_probe_up Docker runtime probe success.",
    "# TYPE docker_runtime_probe_up gauge",
    "docker_runtime_probe_up 1",
    "# HELP docker_container_restart_count Docker restart count by compose service.",
    "# TYPE docker_container_restart_count gauge",
    "# HELP docker_container_running Docker running state by compose service.",
    "# TYPE docker_container_running gauge",
    "# HELP docker_container_memory_usage_bytes Docker container memory usage by compose service.",
    "# TYPE docker_container_memory_usage_bytes gauge",
    "# HELP docker_container_memory_limit_bytes Docker container memory limit by compose service.",
    "# TYPE docker_container_memory_limit_bytes gauge",
    "# HELP docker_container_oom_killed Docker OOMKilled state by compose service.",
    "# TYPE docker_container_oom_killed gauge",
    "# HELP aquila_backend_readiness_up Backend readiness endpoint probe result.",
    "# TYPE aquila_backend_readiness_up gauge",
  ]

  const serviceMetricLines = await Promise.all(services.map((service) => collectServiceMetrics(containers, service)))
  const readinessMetricLines = await Promise.all(readinessTargets.map((target) => probeReadiness(target)))
  lines.push(...serviceMetricLines.flat())
  lines.push(...readinessMetricLines)
  lines.push(...collectDiskMetrics())

  return `${lines.join("\n")}\n`
}

const server = http.createServer(async (request, response) => {
  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain; charset=utf-8" })
    response.end("ok\n")
    return
  }

  if (request.url !== "/metrics") {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    response.end("not found\n")
    return
  }

  try {
    const metrics = await collectMetrics()
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" })
    response.end(metrics)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" })
    response.end(`docker_runtime_probe_up 0\ndocker_runtime_probe_error{message="${escapeLabel(message).slice(0, 160)}"} 1\n`)
  }
})

server.listen(servePort, "0.0.0.0", () => {
  console.log(`docker-runtime-probe listening on :${servePort}`)
})
