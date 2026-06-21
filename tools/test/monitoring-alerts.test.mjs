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
  assert.match(compose, /--config\.file=\/etc\/alertmanager\/alertmanager\.yml/)
  assert.match(compose, /--config\.expand-env/)
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
  assert.match(compose, /monitoring\/alertmanager\.yml:\/etc\/alertmanager\/alertmanager\.yml:ro/)
  assert.match(compose, /alertmanager_data:$/m)

  assert.match(prometheus, /alerting:\n(?:.*\n)*\s+alertmanagers:/)
  assert.match(prometheus, /targets:\s+\["alertmanager:9093"\]/)
  assert.match(prometheus, /job_name: postgres_exporter/)
  assert.match(prometheus, /targets:\s+\["postgres_exporter:9187"\]/)

  assert.match(alertmanager, /receiver:\s+drop/)
  assert.match(alertmanager, /- name: drop/)
  assert.match(alertmanager, /receiver:\s+operations-email/)
  assert.match(alertmanager, /group_by:\s+\["alertname", "severity"\]/)
  assert.match(alertmanager, /smtp_smarthost:\s+\$\{ALERTMANAGER_SMTP_SMARTHOST\}/)
  assert.match(alertmanager, /smtp_from:\s+\$\{ALERTMANAGER_SMTP_FROM\}/)
  assert.match(alertmanager, /smtp_auth_username:\s+\$\{ALERTMANAGER_SMTP_AUTH_USERNAME\}/)
  assert.match(alertmanager, /smtp_auth_password:\s+\|-\n\s+\$\{ALERTMANAGER_SMTP_AUTH_PASSWORD\}/)
  assert.match(alertmanager, /smtp_require_tls:\s+\$\{ALERTMANAGER_SMTP_REQUIRE_TLS\}/)
  assert.match(alertmanager, /email_configs:/)
  assert.match(alertmanager, /to:\s+\$\{OPERATIONS_ALERT_EMAIL_TO\}/)
  assert.match(alertmanager, /send_resolved:\s+true/)
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
