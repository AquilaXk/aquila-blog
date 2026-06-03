import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const workflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const applicationProdPath = path.join(repoRoot, "back/src/main/resources/application-prod.yaml")
const deployScriptPath = path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh")
const hardeningScriptPath = path.join(repoRoot, "deploy/homeserver/hardening/setup_hardening.sh")
const hardeningDocPath = path.join(repoRoot, "deploy/homeserver/HARDENING.md")
const prometheusPath = path.join(repoRoot, "deploy/homeserver/monitoring/prometheus.yml")
const taskAlertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")

const targetKeyNames = (contract, targetName) => {
  const target = contract.targets[targetName]
  return [
    ...(target.extends ? targetKeyNames(contract, target.extends) : []),
    ...(target.keys || []).map((definition) => definition.name),
  ]
}

const baseHomeServerEnv = [
  "API_DOMAIN=api.aquilaxk.site",
  "MONITOR_DOMAIN=status.aquilaxk.site",
  "GRAFANA_DOMAIN=grafana.aquilaxk.site",
  "PROMETHEUS_DOMAIN=prometheus.aquilaxk.site",
  "CADDY_EMAIL=ops@aquilaxk.site",
  "CF_TUNNEL_TOKEN=cloudflare-tunnel-token-value",
  "CLOUDFLARED_IMAGE=cloudflare/cloudflared:2026.5.0",
  "DB_IMAGE=jangka512/pgj:2026.05.21",
  "MINIO_IMAGE=minio/minio:RELEASE.2026-05-21T00-00-00Z",
  "PROMETHEUS_BASIC_AUTH_USER=promviewer",
  "PROMETHEUS_BASIC_AUTH_HASH=$$2y$$05$$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVabcdefghi",
  "GRAFANA_ADMIN_USER=admin",
  "GRAFANA_ADMIN_PASSWORD=valid-grafana-password",
  "GRAFANA_ROOT_URL=https://grafana.aquilaxk.site",
  "PROD___SPRING__DATASOURCE__USERNAME=blog_app",
  "PROD___SPRING__DATASOURCE__PASSWORD=valid-db-password",
  "PROD___POSTGRES__PASSWORD=valid-postgres-password",
  "PROD___SPRING__DATA__REDIS__PASSWORD=valid-redis-password",
  "CUSTOM__JWT__SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz",
  "CUSTOM__ADMIN__USERNAME=관리자",
  "CUSTOM__ADMIN__EMAIL=admin@aquilaxk.site",
  "CUSTOM__ADMIN__PASSWORD=valid-admin-password",
  "CUSTOM_PROD_COOKIEDOMAIN=aquilaxk.site",
  "CUSTOM_PROD_FRONTURL=https://www.aquilaxk.site",
  "CUSTOM_PROD_BACKURL=https://api.aquilaxk.site",
  "CUSTOM_PROD_DBNAME=blog_prod",
  "CUSTOM_PROD_REDISDATABASE=0",
  "CUSTOM__REVALIDATE__URL=https://www.aquilaxk.site/api/revalidate",
  "CUSTOM__REVALIDATE__TOKEN=valid-revalidate-token",
  "CUSTOM__AI__SUMMARY__ENABLED=false",
  "CUSTOM__AI__SUMMARY__GEMINI__MODEL=gemini-2.5-flash",
  "SPRING__MAIL__HOST=smtp.mail.example",
  "SPRING__MAIL__PORT=587",
  "SPRING__MAIL__USERNAME=mailer@aquilaxk.site",
  "SPRING__MAIL__PASSWORD=valid-mail-password",
  "SPRING__MAIL__PROPERTIES__MAIL__SMTP__AUTH=true",
  "SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__ENABLE=true",
  "CUSTOM__MEMBER__SIGNUP__MAIL_FROM=mailer@aquilaxk.site",
  "CUSTOM__MEMBER__SIGNUP__MAIL_SUBJECT=[AquilaXk] 회원가입 이메일 인증",
  "CUSTOM__MEMBER__SIGNUP__VERIFY_PATH=/signup/verify",
  "CUSTOM__MEMBER__SIGNUP__EMAIL_EXPIRATION_SECONDS=86400",
  "CUSTOM__MEMBER__SIGNUP__SESSION_EXPIRATION_SECONDS=3600",
  "MINIO_ROOT_USER=minio",
  "MINIO_ROOT_PASSWORD=valid-minio-password",
  "CUSTOM_STORAGE_ENABLED=true",
  "CUSTOM_STORAGE_ENDPOINT=http://minio:9000",
  "CUSTOM_STORAGE_REGION=us-east-1",
  "CUSTOM_STORAGE_BUCKET=blog-images",
  "CUSTOM_STORAGE_ACCESSKEY=minio",
  "CUSTOM_STORAGE_SECRETKEY=valid-minio-password",
  "CUSTOM_STORAGE_PATHSTYLEACCESS=true",
  "CUSTOM_STORAGE_KEYPREFIX=posts",
  "CUSTOM_STORAGE_MAXFILESIZEBYTES=10485760",
].join("\n")

test("home-server-source contract accepts a complete deployment env without BACK_IMAGE", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: baseHomeServerEnv,
  })

  assert.equal(result.ok, true, result.errors.map((error) => error.message).join("\n"))
})

test("home-server-source requires DB runtime username after runtime-role cutover", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = baseHomeServerEnv.replace(/^PROD___SPRING__DATASOURCE__USERNAME=.*\n/m, "")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "PROD___SPRING__DATASOURCE__USERNAME"))
})

test("validator reports key-level failures without leaking secret values", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = baseHomeServerEnv
    .replace("CUSTOM__ADMIN__PASSWORD=valid-admin-password", "CUSTOM__ADMIN__PASSWORD=change_me_admin_password")
    .replace("CUSTOM_PROD_BACKURL=https://api.aquilaxk.site", "CUSTOM_PROD_BACKURL=https://wrong.aquilaxk.site")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM__ADMIN__PASSWORD"))
  assert(result.errors.some((error) => error.message.includes("API_DOMAIN")))
  assert(!JSON.stringify(result).includes("change_me_admin_password"))
})

test("renderer derives local env files and preserves existing generated secrets", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const { renderTargetEnv } = await import("../env/render-local-env.mjs")
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-env-contract-"))

  try {
    const existingFront = "TOKEN_FOR_REVALIDATE=preserved-token\n"
    const rendered = renderTargetEnv({
      contract: loadContract(contractPath),
      target: "front-local",
      sourceText: baseHomeServerEnv,
      existingText: existingFront,
    })

    assert.match(rendered, /^NEXT_PUBLIC_BACKEND_URL=https:\/\/api\.aquilaxk\.site$/m)
    assert.match(rendered, /^PLAYWRIGHT_BASE_URL=https:\/\/www\.aquilaxk\.site$/m)
    assert.match(rendered, /^TOKEN_FOR_REVALIDATE=preserved-token$/m)

    const outFile = path.join(workDir, ".env.local")
    writeFileSync(outFile, rendered)
    assert(readFileSync(outFile, "utf8").includes("E2E_API_BASE_URL=https://api.aquilaxk.site"))
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("deploy workflow validates HOME_SERVER_ENV before SSH deployment", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /Validate HOME_SERVER_ENV contract/)
  assert.match(workflow, /tools\/env\/validate-env\.mjs --target home-server-source/)
  assert(workflow.indexOf("Validate HOME_SERVER_ENV contract") < workflow.indexOf("Deploy over SSH"))
})

test("required secret check does not inject multi-line HOME_SERVER_ENV into shell", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert(!workflow.includes("HOME_SERVER_ENV=${{ secrets.HOME_SERVER_ENV }}"))
  assert.match(workflow, /env:\n(?:.*\n)*\s+HOME_SERVER_ENV: \$\{\{ secrets\.HOME_SERVER_ENV \}\}/)
  assert.match(workflow, /value="\$\{!key:-\}"/)
})

test("runtime contract accounts for every compose env interpolation", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const contractKeys = new Set(targetKeyNames(loadContract(contractPath), "home-server-runtime"))
  const compose = readFileSync(composePath, "utf8")
  const composeKeys = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1])
  const missing = [...new Set(composeKeys)].filter((key) => !contractKeys.has(key)).sort()

  assert.deepEqual(missing, [])
})

test("prod datasource uses a non-superuser runtime role contract", () => {
  const compose = readFileSync(composePath, "utf8")
  const applicationProd = readFileSync(applicationProdPath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")

  assert.match(applicationProd, /username:\s*"\$\{PROD___SPRING__DATASOURCE__USERNAME\}"/)
  assert.match(applicationProd, /flyway:\n(?:.*\n)*\s+user:\s*"\$\{PROD___SPRING__FLYWAY__USER:postgres\}"/)
  assert.match(applicationProd, /password:\s*"\$\{PROD___SPRING__FLYWAY__PASSWORD:\$\{PROD___POSTGRES__PASSWORD\}\}"/)
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{PROD___POSTGRES__PASSWORD:-\$\{PROD___SPRING__DATASOURCE__PASSWORD\}\}/)
  assert.match(deployScript, /validate_db_runtime_role_env/)
  assert.match(deployScript, /provision_db_runtime_role/)
  assert.match(deployScript, /runtime datasource user must not be postgres/)
  assert.match(deployScript, /set_config\('app\.runtime_user',\s*:'runtime_user',\s*false\)/)
  assert.match(deployScript, /runtime_user text := current_setting\('app\.runtime_user'\)/)
  assert(!deployScript.includes("runtime_user text := :'runtime_user'"))
  assert(!deployScript.includes("runtime_password text := :'runtime_password'"))
  assert.match(deployScript, /ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(deployScript, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/)
  assert.match(deployScript, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public/)
})

test("homeserver origin ingress is private behind Cloudflare Tunnel", () => {
  const compose = readFileSync(composePath, "utf8")
  const hardeningScript = readFileSync(hardeningScriptPath, "utf8")
  const hardeningDoc = readFileSync(hardeningDocPath, "utf8")

  assert(!/^\s*-\s*['"]?80:80['"]?\s*$/m.test(compose))
  assert(!/^\s*-\s*['"]?443:443['"]?\s*$/m.test(compose))
  assert.match(compose, /^\s*-\s*['"]?127\.0\.0\.1:80:80['"]?\s*$/m)
  assert.match(compose, /^\s*-\s*['"]?127\.0\.0\.1:443:443['"]?\s*$/m)

  assert(!hardeningScript.includes("ufw allow 80/tcp"))
  assert(!hardeningScript.includes("ufw allow 443/tcp"))
  assert.match(hardeningScript, /Cloudflare Tunnel/)
  assert.match(hardeningDoc, /cloudflared egress/)
  assert.match(hardeningDoc, /80\/443.*loopback/)
})

test("ddos defense monitoring covers rate limit, docker runtime, redis, and memory pressure", () => {
  const compose = readFileSync(composePath, "utf8")
  const prometheus = readFileSync(prometheusPath, "utf8")
  const taskAlerts = readFileSync(taskAlertsPath, "utf8")

  assert.match(compose, /docker_runtime_probe:/)
  assert.match(compose, /monitoring\/docker-runtime-probe\.mjs:\/app\/docker-runtime-probe\.mjs:ro/)
  assert.match(compose, /\/var\/run\/docker\.sock:\/var\/run\/docker\.sock:ro/)
  assert.match(prometheus, /job_name: docker_runtime_probe/)
  assert.match(prometheus, /honor_labels:\s*true/)
  assert.match(prometheus, /docker_runtime_probe:9920/)

  assert.match(taskAlerts, /api_rate_limit_rejected_total/)
  assert.match(taskAlerts, /status="429"/)
  assert.match(taskAlerts, /AquilaDockerRuntimeProbeScrapeDown/)
  assert.match(taskAlerts, /docker_container_restart_count\{[^}]*service="cloudflared"/)
  assert.match(taskAlerts, /docker_container_memory_usage_bytes\{[^}]*service=~"back_.+"/)
  assert.match(taskAlerts, /redis.*latency|lettuce.*duration|redis_commands_duration_seconds/i)
})
