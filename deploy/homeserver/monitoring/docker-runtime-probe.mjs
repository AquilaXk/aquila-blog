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
  "cloudflared,back_blue,back_green,back_read,back_admin,back_worker,redis_1",
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)

const dockerSocketPath = optionValue("--docker-socket", "/var/run/docker.sock")

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

const collectServiceMetrics = async (containers, service) => {
  const container = matchingContainerForService(containers, service)

  if (!container) {
    return [
      metricLine("docker_container_restart_count", { service }, 0),
      metricLine("docker_container_running", { service }, 0),
      metricLine("docker_container_memory_usage_bytes", { service }, 0),
      metricLine("docker_container_memory_limit_bytes", { service }, 0),
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
  ]
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
  ]

  const serviceMetricLines = await Promise.all(services.map((service) => collectServiceMetrics(containers, service)))
  lines.push(...serviceMetricLines.flat())

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
