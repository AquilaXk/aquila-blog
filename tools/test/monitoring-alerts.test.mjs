import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const workflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const prometheusPath = path.join(repoRoot, "deploy/homeserver/monitoring/prometheus.yml")
const alertmanagerPath = path.join(repoRoot, "deploy/homeserver/monitoring/alertmanager.yml")
const taskAlertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")

const read = (filePath) => readFileSync(filePath, "utf8")

const targetKey = (contract, targetName, keyName) => {
  const target = contract.targets[targetName]
  assert(target, `missing target ${targetName}`)
  return (target.keys || []).find((definition) => definition.name === keyName)
}

test("operations alert email channel is wired through env contract, compose, and deploy preflight", () => {
  const contract = JSON.parse(read(contractPath))
  const compose = read(composePath)
  const workflow = read(workflowPath)
  const prometheus = read(prometheusPath)
  const alertmanager = read(alertmanagerPath)

  assert.deepEqual(targetKey(contract, "home-server-source", "ALERTMANAGER_IMAGE"), {
    name: "ALERTMANAGER_IMAGE",
    kind: "digest-image",
    required: false,
  })
  assert.deepEqual(targetKey(contract, "home-server-source", "OPERATIONS_ALERT_EMAIL_TO"), {
    name: "OPERATIONS_ALERT_EMAIL_TO",
    kind: "email",
    secret: true,
  })
  assert.deepEqual(targetKey(contract, "home-server-source", "ALERTMANAGER_SMTP_AUTH_ENABLED"), {
    name: "ALERTMANAGER_SMTP_AUTH_ENABLED",
    kind: "boolean",
    required: false,
  })
  assert.deepEqual(targetKey(contract, "home-server-source", "ALERTMANAGER_SMTP_AUTH_USERNAME"), {
    name: "ALERTMANAGER_SMTP_AUTH_USERNAME",
    requiredWhen: { key: "ALERTMANAGER_SMTP_AUTH_ENABLED", equals: "true" },
  })
  assert.deepEqual(targetKey(contract, "home-server-source", "ALERTMANAGER_SMTP_AUTH_PASSWORD"), {
    name: "ALERTMANAGER_SMTP_AUTH_PASSWORD",
    secret: true,
    requiredWhen: { key: "ALERTMANAGER_SMTP_AUTH_ENABLED", equals: "true" },
    minLength: 8,
  })

  assert.match(compose, /alertmanager:/)
  assert.match(compose, /image:\s+\$\{ALERTMANAGER_IMAGE:\?ALERTMANAGER_IMAGE is required \(sha256 digest required\)\}/)
  assert.match(compose, /> \/tmp\/alertmanager\.yml/)
  assert.match(compose, /--config\.file=\/tmp\/alertmanager\.yml/)
  assert.doesNotMatch(compose, /--config\.expand-env/)
  assert.doesNotMatch(
    compose.slice(compose.indexOf("  alertmanager:"), compose.indexOf("  postgres_exporter:")),
    /env_file:/,
  )
  assert.match(
    compose,
    /OPERATIONS_ALERT_EMAIL_TO:\s+\$\{OPERATIONS_ALERT_EMAIL_TO:\?OPERATIONS_ALERT_EMAIL_TO is required\}/,
  )
  assert.match(compose, /ALERTMANAGER_SMTP_SMARTHOST:\s+\$\{SPRING__MAIL__HOST:\?SPRING__MAIL__HOST is required\}:\$\{SPRING__MAIL__PORT:\?SPRING__MAIL__PORT is required\}/)
  assert.match(compose, /ALERTMANAGER_SMTP_FROM:\s+\$\{CUSTOM__MEMBER__SIGNUP__MAIL_FROM:\?CUSTOM__MEMBER__SIGNUP__MAIL_FROM is required\}/)
  assert.match(compose, /ALERTMANAGER_SMTP_AUTH_USERNAME:\s+\$\{ALERTMANAGER_SMTP_AUTH_USERNAME:-\}/)
  assert.match(compose, /ALERTMANAGER_SMTP_AUTH_PASSWORD:\s+\$\{ALERTMANAGER_SMTP_AUTH_PASSWORD:-\}/)
  assert.match(compose, /ALERTMANAGER_SMTP_REQUIRE_TLS:\s+\$\{SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__ENABLE:-true\}/)
  assert.match(compose, /\$\$ALERTMANAGER_SMTP_SMARTHOST/)
  assert.match(compose, /\$\$ALERTMANAGER_SMTP_AUTH_PASSWORD/)
  assert.match(compose, /\$\$ALERTMANAGER_GRAFANA_ROOT_URL/)
  assert.match(compose, /\$\$OPERATIONS_ALERT_EMAIL_TO/)
  assert.match(compose, /operations-email/)
  assert.match(compose, /email_configs:/)
  assert.match(compose, /send_resolved: true/)
  assert.match(compose, /alertname=~"Aquila\(PublicEdgeProbeScrapeDown\|DockerRuntimeProbeScrapeDown\|BackWorkerScrapeDown\)"/)
  assert.match(compose, /templates:/)
  assert.match(compose, /\/tmp\/alertmanager-email\.tmpl/)
  assert.match(compose, /define "aquila\.email\.subject"/)
  assert.match(compose, /define "aquila\.email\.text"/)
  assert.match(compose, /define "aquila\.email\.html"/)
  assert.match(compose, /\$\$title := or \(index \.CommonAnnotations "title_ko"\)/)
  assert.match(compose, /\$\$severity := or \.CommonLabels\.severity "unknown"/)
  assert.match(compose, /\[Aquila 운영\]\[\{\{ template "aquila\.status_ko" \.Status \}\}\]/)
  assert.match(compose, /Subject: "\{\{ template \\"aquila\.email\.subject\\" \. \}\}"/)
  assert.match(compose, /text: "\{\{ template \\"aquila\.email\.text\\" \. \}\}"/)
  assert.match(compose, /html: "\{\{ template \\"aquila\.email\.html\\" \. \}\}"/)
  assert.match(compose, /Grafana에서 보기/)
  assert.doesNotMatch(compose, /GeneratorURL/)
  assert.doesNotMatch(compose, /monitoring\/alertmanager\.yml:\/etc\/alertmanager\/alertmanager\.yml:ro/)
  assert.match(compose, /alertmanager_data:$/m)

  assert.match(prometheus, /alerting:\n(?:.*\n)*\s+alertmanagers:/)
  assert.match(prometheus, /targets:\s+\["alertmanager:9093"\]/)
  assert.match(prometheus, /job_name: postgres_exporter/)
  assert.match(prometheus, /targets:\s+\["postgres_exporter:9187"\]/)

  assert.match(alertmanager, /receiver:\s+drop/)
  assert.match(alertmanager, /- name: drop/)
  assert.match(alertmanager, /group_by:\s+\["alertname", "severity"\]/)
  assert.doesNotMatch(alertmanager, /\$\{ALERTMANAGER_/)
  assert.doesNotMatch(alertmanager, /\$\{OPERATIONS_ALERT_EMAIL_TO\}/)
  assert.doesNotMatch(alertmanager, /email_configs:/)
  assert.doesNotMatch(alertmanager, /webhook_configs:/)

  assert.match(workflow, /Validate HOME_SERVER_ENV contract/)
  assert(workflow.indexOf("Validate HOME_SERVER_ENV contract") < workflow.indexOf("Deploy over SSH"))
})

test("operations alert email recipient is required before homeserver deploy", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: "",
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "OPERATIONS_ALERT_EMAIL_TO" && error.message === "is required"))
})

test("operations alert rules cover launch-blocking failure domains", () => {
  const taskAlerts = read(taskAlertsPath)
  const requiredAlerts = [
    "AquilaPublicEdgeProbeRouteDown",
    "AquilaBackReadinessDown",
    "AquilaApiOrigin5xxRatioHigh",
    "AquilaContainerRestarted",
    "AquilaContainerOomKilled",
    "AquilaPostgresDiskUsageHigh",
    "AquilaPostgresUnavailable",
    "AquilaPostgresConnectionSaturationHigh",
    "AquilaRedisUnavailable",
    "AquilaMinioUnavailable",
    "AquilaTaskDlqRateHigh",
    "AquilaExternalBackupFailed",
    "AquilaDeployRollbackDetected",
  ]

  for (const alertName of requiredAlerts) {
    assert.match(taskAlerts, new RegExp(`alert: ${alertName}\\b`), `${alertName} rule is missing`)
  }

  assert.match(taskAlerts, /aquila_public_edge_probe_route_up/)
  assert.match(taskAlerts, /aquila_backend_readiness_up\{component="api"\}/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="db_1"\}/)
  assert.match(taskAlerts, /pg_stat_database_numbackends/)
  assert.match(taskAlerts, /pg_settings_max_connections/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="redis_1"\}/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="minio_1"\}/)
  assert.match(taskAlerts, /backup.*failed|external.*backup/i)
  assert.match(taskAlerts, /rollback/i)
})

// Scope note: everything below is a *repo-side* contract over tracked files. None of it
// observes the image actually running in production -- POSTGRES_EXPORTER_IMAGE comes from
// the HOME_SERVER_ENV secret, and deploy.yml's preserve_pre_deploy_runtime_image_env_keys
// restores the server's existing value whenever the secret does not pin the key, so the
// fallback tags asserted here are only reached on a first-ever deploy. If the owner never
// updates the secret, production stays on v0.15.0 and this test still passes. The runtime
// safety net is AquilaPostgresExporterScrapeDown and AquilaPostgresCheckpointMetricsMissing,
// not this file (#1426).
test("postgres_exporter image pins, compose flags, and blind-spot alerts stay consistent", () => {
  const compose = read(composePath)
  const taskAlerts = read(taskAlertsPath)
  const deployScript = read(path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh"))
  const backupScript = read(path.join(repoRoot, "deploy/homeserver/create_external_backup.sh"))

  const exporterStart = compose.indexOf("\n  postgres_exporter:")
  const grafanaStart = compose.indexOf("\n  grafana:")
  assert(exporterStart >= 0, "postgres_exporter service is missing from the compose file")
  // slice() would silently widen to the whole file if the end marker moved (negative index).
  assert(grafanaStart > exporterStart, "grafana must still follow postgres_exporter in the compose file")
  const resolvedCompose = JSON.parse(
    execFileSync(
      "docker",
      ["compose", "-f", composePath, "config", "--no-interpolate", "--format", "json"],
      { encoding: "utf8" },
    ),
  )
  assert.deepEqual(resolvedCompose.services.postgres_exporter.command, ["--collector.stat_checkpointer"])

  // Drift guard only: keeps the three tracked fallback pins from diverging or rolling back
  // below v0.17.0, the first release carrying the pg_stat_checkpointer fix. These three did
  // drift apart before, which is why they are checked together rather than one
  // representative file. This says nothing about the deployed image -- see the scope note.
  for (const [name, source] of [
    ["blue_green_deploy.sh", deployScript],
    ["create_external_backup.sh", backupScript],
    ["deploy.yml", read(workflowPath)],
  ]) {
    const pin = source.match(
      /ensure_image_(?:env_)?key_from_local_digest "POSTGRES_EXPORTER_IMAGE" "[^"]*postgres-exporter:v(\d+)\.(\d+)\.(\d+)"/,
    )
    assert(pin, `${name} must pin a versioned postgres-exporter fallback image`)
    const [major, minor] = [Number(pin[1]), Number(pin[2])]
    assert(
      major > 0 || minor >= 17,
      `${name} postgres-exporter fallback must be >= v0.17.0 for PG17+ pg_stat_checkpointer, got v${pin[1]}.${pin[2]}.${pin[3]}`,
    )
  }

  // A collector that silently stops producing series leaves no alert and no dashboard gap,
  // so the absence of the series is itself the signal that has to page (#1419).
  assert.match(taskAlerts, /alert: AquilaPostgresCheckpointMetricsMissing\b/)
  assert.match(taskAlerts, /absent\(pg_stat_checkpointer_num_timed_total\{job="postgres_exporter"\}\)/)

  // If the exporter itself dies, AquilaPostgresDiskUsageHigh and
  // AquilaPostgresConnectionSaturationHigh evaluate against an empty vector and can never
  // fire. That blind spot needs its own signal, plus restart coverage (#1426).
  assert.match(taskAlerts, /alert: AquilaPostgresExporterScrapeDown\b/)
  assert.match(taskAlerts, /min\(up\{job="postgres_exporter"\}\) < 1/)

  const restartAlert = taskAlerts.match(/alert: AquilaContainerRestarted\n\s*expr: ([^\n]+)/)
  assert(restartAlert, "AquilaContainerRestarted rule is missing")
  assert.match(restartAlert[1], /postgres_exporter/)

  const probeServices = compose.match(/-\s*"--services"\s*\n\s*-\s*"([^"]+)"/)
  assert(probeServices, "docker_runtime_probe must pass an explicit --services list")
  assert(
    probeServices[1].split(",").map((value) => value.trim()).includes("postgres_exporter"),
    "postgres_exporter must be exported by docker_runtime_probe for AquilaContainerRestarted to see it",
  )
})

test("autoheal and its docker socket proxy stay under continuous restart observation", () => {
  const compose = read(composePath)
  const taskAlerts = read(taskAlertsPath)

  const probeBlock = compose.slice(compose.indexOf("\n  docker_runtime_probe:"))
  const probeServicesOption = probeBlock.match(/-\s*"--services"\s*\n\s*-\s*"([^"]+)"/)
  assert(probeServicesOption, "docker_runtime_probe must pass an explicit --services list")
  const probedServices = probeServicesOption[1].split(",").map((value) => value.trim())

  const restartAlert = taskAlerts.match(/alert: AquilaContainerRestarted\n\s*expr: ([^\n]+)/)
  assert(restartAlert, "AquilaContainerRestarted rule is missing")
  const alertedServices = restartAlert[1].match(/service=~"([^"]+)"/)
  assert(alertedServices, "AquilaContainerRestarted must select services by regex")
  const alertedAlternatives = alertedServices[1].split("|").map((value) => value.trim())

  // A crash-looping autoheal (or its socket proxy) is invisible between deploys
  // unless the probe exports its restart count and the alert selects it (#1407).
  for (const service of ["autoheal", "docker_socket_proxy"]) {
    assert(probedServices.includes(service), `${service} must be exported by docker_runtime_probe`)
    assert(alertedAlternatives.includes(service), `${service} must be covered by AquilaContainerRestarted`)
  }
})
