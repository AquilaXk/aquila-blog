import assert from "node:assert/strict"
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

test("operations alert channel is wired through env contract, compose, and deploy preflight", () => {
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
  assert.deepEqual(targetKey(contract, "home-server-source", "OPERATIONS_ALERT_WEBHOOK_URL"), {
    name: "OPERATIONS_ALERT_WEBHOOK_URL",
    kind: "https-url",
    secret: true,
    minLength: 16,
  })

  assert.match(compose, /alertmanager:/)
  assert.match(compose, /image:\s+\$\{ALERTMANAGER_IMAGE:\?ALERTMANAGER_IMAGE is required \(sha256 digest required\)\}/)
  assert.match(compose, /--config\.file=\/etc\/alertmanager\/alertmanager\.yml/)
  assert.match(compose, /--config\.expand-env/)
  assert.match(compose, /monitoring\/alertmanager\.yml:\/etc\/alertmanager\/alertmanager\.yml:ro/)
  assert.match(compose, /alertmanager_data:$/m)

  assert.match(prometheus, /alerting:\n(?:.*\n)*\s+alertmanagers:/)
  assert.match(prometheus, /targets:\s+\["alertmanager:9093"\]/)
  assert.match(prometheus, /job_name: postgres_exporter/)
  assert.match(prometheus, /targets:\s+\["postgres_exporter:9187"\]/)

  assert.match(alertmanager, /receiver:\s+operations-webhook/)
  assert.match(alertmanager, /group_by:\s+\["alertname", "severity"\]/)
  assert.match(alertmanager, /url:\s+\$\{OPERATIONS_ALERT_WEBHOOK_URL\}/)
  assert.match(alertmanager, /send_resolved:\s+true/)

  assert.match(workflow, /Validate HOME_SERVER_ENV contract/)
  assert(workflow.indexOf("Validate HOME_SERVER_ENV contract") < workflow.indexOf("Deploy over SSH"))
})

test("operations alert webhook is required before homeserver deploy", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: "",
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "OPERATIONS_ALERT_WEBHOOK_URL" && error.message === "is required"))
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
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="db_1"\}/)
  assert.match(taskAlerts, /pg_stat_database_numbackends/)
  assert.match(taskAlerts, /pg_settings_max_connections/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="redis_1"\}/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service="minio_1"\}/)
  assert.match(taskAlerts, /backup.*failed|external.*backup/i)
  assert.match(taskAlerts, /rollback/i)
})
