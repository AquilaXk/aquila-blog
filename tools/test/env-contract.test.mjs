import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const workflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const applicationProdPath = path.join(repoRoot, "back/src/main/resources/application-prod.yaml")
const deployScriptPath = path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh")
const deployBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_deploy_backup.sh")
const externalBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_external_backup.sh")
const hardeningScriptPath = path.join(repoRoot, "deploy/homeserver/hardening/setup_hardening.sh")
const hardeningDocPath = path.join(repoRoot, "deploy/homeserver/HARDENING.md")
const prometheusPath = path.join(repoRoot, "deploy/homeserver/monitoring/prometheus.yml")
const taskAlertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")

const git = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

const commitFile = (cwd, relativePath, content, message) => {
  const filePath = path.join(cwd, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content)
  git(cwd, ["add", relativePath])
  git(cwd, ["commit", "-m", message])
  return git(cwd, ["rev-parse", "HEAD"])
}

const extractDeployCalculateScript = () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const lines = workflow.split("\n")
  const runIndex = lines.findIndex((line, index) => {
    return line === "        run: |" && lines.slice(Math.max(0, index - 20), index).some((prev) => prev.includes("Calculate deploy targets and image tags"))
  })
  assert.notEqual(runIndex, -1, "calculateTag run block not found")

  const scriptLines = []
  for (const line of lines.slice(runIndex + 1)) {
    if (line.startsWith("          ")) {
      scriptLines.push(line.slice(10))
      continue
    }
    if (line.trim() === "") {
      scriptLines.push("")
      continue
    }
    break
  }

  return scriptLines.join("\n")
}

const createDeployStaleFixture = () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-deploy-stale-"))
  git(workDir, ["init", "-b", "main"])
  git(workDir, ["config", "user.email", "ci@example.test"])
  git(workDir, ["config", "user.name", "CI Test"])
  git(workDir, ["remote", "add", "origin", workDir])

  const initialSha = commitFile(workDir, "README.md", "initial\n", "initial")
  const backendSha = commitFile(workDir, "back/app.txt", `${initialSha}\nbackend\n`, "backend change")
  const docsSha = commitFile(workDir, "docs/ops.md", "ops note\n", "docs change")
  const backendAfterDocsSha = commitFile(
    workDir,
    "deploy/homeserver/runtime.txt",
    "deploy runtime change\n",
    "deploy change",
  )
  const envContractAfterDocsSha = commitFile(
    workDir,
    "deploy/env/env.contract.json",
    '{"updated":true}\n',
    "env contract change",
  )
  git(workDir, ["checkout", "-b", "detached-deploy", initialSha])
  const nonAncestorSha = commitFile(workDir, "back/side.txt", "side backend\n", "side backend change")
  git(workDir, ["checkout", "main"])

  return {
    workDir,
    backendSha,
    docsSha,
    backendAfterDocsSha,
    envContractAfterDocsSha,
    nonAncestorSha,
  }
}

const runDeployCalculateScript = ({ cwd, deploySha, currentMainSha }) => {
  git(cwd, ["update-ref", "refs/heads/main", currentMainSha])
  git(cwd, ["checkout", "--detach", deploySha])

  const outputFile = path.join(cwd, "github-output.txt")
  const summaryFile = path.join(cwd, "github-summary.md")
  const script = extractDeployCalculateScript()

  return execFileSync("bash", ["-lc", script], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: "workflow_run",
      GITHUB_REPOSITORY_OWNER: "AquilaXk",
      GITHUB_REPOSITORY: "AquilaXk/aquila-blog",
      DEPLOY_SHA_INPUT: deploySha,
      FORCE_BACKEND_DEPLOY_INPUT: "false",
      FORCE_FRONT_LIVE_VERIFY_INPUT: "false",
      FORCE_EDITOR_LIVE_CANARY_INPUT: "false",
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
}

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
  "CLOUDFLARED_IMAGE=cloudflare/cloudflared@sha256:4444444444444444444444444444444444444444444444444444444444444444",
  "AUTOHEAL_IMAGE=willfarrell/autoheal@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "CADDY_IMAGE=caddy@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "UPTIME_KUMA_IMAGE=louislam/uptime-kuma@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "PROMETHEUS_IMAGE=prom/prometheus@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "GRAFANA_IMAGE=grafana/grafana@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "LOKI_IMAGE=grafana/loki@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "PROMTAIL_IMAGE=grafana/promtail@sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "NODE_RUNTIME_IMAGE=node@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "REDIS_IMAGE=redis@sha256:3333333333333333333333333333333333333333333333333333333333333333",
  "DB_IMAGE=jangka512/pgj@sha256:5555555555555555555555555555555555555555555555555555555555555555",
  "MINIO_IMAGE=minio/minio@sha256:6666666666666666666666666666666666666666666666666666666666666666",
  "AQUILA_EXTERNAL_STORAGE_ROOT=/mnt/aquila-blog-data",
  "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
  "AQUILA_BACKUP_RETENTION_DAILY=14",
  "AQUILA_BACKUP_RETENTION_WEEKLY=8",
  "AQUILA_BACKUP_RETENTION_MONTHLY=6",
  "AQUILA_BACKUP_MIN_FREE_PERCENT=15",
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
  "CUSTOM_STORAGE_MAXFILESIZEBYTES=104857600",
  "CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=104857600",
  "CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=52428800",
  "CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=104857600",
  "CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=104857600",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=5368709120",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400",
  "CUSTOM_STORAGE_MULTIPART_MAX_FILE_SIZE=100MB",
  "CUSTOM_STORAGE_MULTIPART_MAX_REQUEST_SIZE=104MB",
  "BACKEND_PROXY_MAX_BODY_BYTES=109051904",
  "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=268435456",
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

const runtimeBackendImageKeys = [
  "BACK_BLUE_IMAGE",
  "BACK_GREEN_IMAGE",
  "BACK_READ_IMAGE",
  "BACK_ADMIN_IMAGE",
  "BACK_WORKER_IMAGE",
]

const runtimeBackendImageEnv = runtimeBackendImageKeys
  .map((key, index) => `${key}=ghcr.io/aquilaxk/aquila-blog-back@sha256:${"789ab"[index].repeat(64)}`)
  .join("\n")

test("home-server runtime requires runtime-specific backend images by digest", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const tagBackImage = `ghcr.io/aquilaxk/aquila-blog-back:sha-${"b".repeat(40)}`

  const digestResult = validateEnvText({
    contract,
    target: "home-server-runtime",
    text: `${baseHomeServerEnv}\n${runtimeBackendImageEnv}\n`,
  })
  assert.equal(digestResult.ok, true, digestResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))

  const tagResult = validateEnvText({
    contract,
    target: "home-server-runtime",
    text: `${baseHomeServerEnv}\n${runtimeBackendImageEnv}\nBACK_BLUE_IMAGE=${tagBackImage}\n`,
  })
  assert.equal(tagResult.ok, false)
  assert(tagResult.errors.some((error) => error.key === "BACK_BLUE_IMAGE" && error.message.includes("digest")))
})

test("runtime service images are env-backed in compose and digest-validated by contract", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const runtimeImageKeys = [
    "AUTOHEAL_IMAGE",
    "CADDY_IMAGE",
    "UPTIME_KUMA_IMAGE",
    "PROMETHEUS_IMAGE",
    "GRAFANA_IMAGE",
    "LOKI_IMAGE",
    "PROMTAIL_IMAGE",
    "NODE_RUNTIME_IMAGE",
    "REDIS_IMAGE",
    ...runtimeBackendImageKeys,
  ]
  const contract = loadContract(contractPath)
  const sourceContractKeys = new Set(targetKeyNames(contract, "home-server-source"))
  const runtimeContractKeys = new Set(targetKeyNames(contract, "home-server-runtime"))
  const compose = readFileSync(composePath, "utf8")
  const literalImageLines = compose
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter(({ value }) => value.startsWith("image: "))
    .filter(({ value }) => !value.includes("${"))

  assert.deepEqual(literalImageLines, [])
  assert(!compose.includes("${BACK_IMAGE"))
  assert(!sourceContractKeys.has("BACK_IMAGE"))
  assert(!runtimeContractKeys.has("BACK_IMAGE"))
  for (const key of runtimeImageKeys) {
    assert(
      sourceContractKeys.has(key) || runtimeContractKeys.has(key),
      `${key} must be covered by the env contract`,
    )
  }

  const sourceWithoutAutofilledRuntimeImages = baseHomeServerEnv
    .split("\n")
    .filter((line) => !runtimeImageKeys.some((key) => line.startsWith(`${key}=`)))
    .join("\n")
  const missingAutofilledRuntimeImagesResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: sourceWithoutAutofilledRuntimeImages,
  })
  assert.equal(
    missingAutofilledRuntimeImagesResult.ok,
    true,
    missingAutofilledRuntimeImagesResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )

  const tagOnlyResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: baseHomeServerEnv.replace(
      "CADDY_IMAGE=caddy@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "CADDY_IMAGE=caddy:2.8-alpine",
    ),
  })
  assert.equal(tagOnlyResult.ok, false)
  assert(tagOnlyResult.errors.some((error) => error.key === "CADDY_IMAGE"))
})

test("외부 백업은 compose 평가 전에 누락된 runtime image env를 보정한다", () => {
  const externalBackupScript = readFileSync(externalBackupScriptPath, "utf8")
  const runtimeImageDefaults = [
    ["CLOUDFLARED_IMAGE", "cloudflare/cloudflared:latest"],
    ["AUTOHEAL_IMAGE", "willfarrell/autoheal:1.2.0"],
    ["CADDY_IMAGE", "caddy:2.8-alpine"],
    ["UPTIME_KUMA_IMAGE", "louislam/uptime-kuma:1"],
    ["PROMETHEUS_IMAGE", "prom/prometheus:v2.54.1"],
    ["GRAFANA_IMAGE", "grafana/grafana:11.2.2"],
    ["LOKI_IMAGE", "grafana/loki:3.0.0"],
    ["PROMTAIL_IMAGE", "grafana/promtail:3.0.0"],
    ["NODE_RUNTIME_IMAGE", "node:20-alpine"],
    ["DB_IMAGE", "jangka512/pgj:latest"],
    ["REDIS_IMAGE", "redis:7-alpine"],
    ["MINIO_IMAGE", "minio/minio:latest"],
  ]

  for (const [key, image] of runtimeImageDefaults) {
    const escapedImage = image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(
      externalBackupScript,
      new RegExp(`ensure_image_env_key_from_local_digest "${key}" "${escapedImage}"`),
    )
  }

  const imageGuardBody = externalBackupScript.slice(
    externalBackupScript.indexOf("ensure_image_env_key_from_local_digest() {"),
    externalBackupScript.indexOf("ensure_compose_image_env_defaults() {"),
  )
  const pullFallbackBody = externalBackupScript.slice(
    externalBackupScript.indexOf("resolve_repo_digest_with_pull_fallback() {"),
    externalBackupScript.indexOf("ensure_image_env_key_from_local_digest() {"),
  )
  assert.match(imageGuardBody, /value="\$\(trim_quotes "\$\(env_value "\$\{key\}"\)"\)"/)
  assert.match(
    externalBackupScript,
    /if \[\[ "\$\{value\}" == \*":latest" \|\| "\$\{value\}" == \*":latest@"\* \]\]/,
  )
  assert.match(imageGuardBody, /require_digest_image_value "\$\{key\}" "\$\{value\}"/)
  assert.match(imageGuardBody, /file_value="\$\(trim_quotes "\$\(read_key_from_file "\$\{key\}" "\$\{ENV_FILE\}"\)"\)"/)
  assert.match(imageGuardBody, /ensure_compose_env_work_file\n\s+upsert_env_key "\$\{key\}" "\$\{value\}"/)
  assert.match(imageGuardBody, /upsert_env_key "\$\{key\}" "\$\{value\}"/)
  assert.match(
    imageGuardBody,
    /require_digest_image_value "\$\{key\}" "\$\{digest\}"/,
  )
  assert.match(imageGuardBody, /digest="\$\(resolve_repo_digest_with_pull_fallback "\$\{fallback_image\}"\)"/)
  assert.match(pullFallbackBody, /digest="\$\(resolve_local_repo_digest "\$\{image_ref\}" \|\| true\)"/)
  assert.match(pullFallbackBody, /docker pull "\$\{image_ref\}" >\/dev\/null/)
  assert.match(
    pullFallbackBody,
    /fail "fallback image pull did not provide repo digest: \$\{image_ref\}"/,
  )
  assert.match(imageGuardBody, /ensure_compose_env_work_file\n\s+upsert_env_key "\$\{key\}" "\$\{digest\}"/)
  assert.match(
    externalBackupScript,
    /set \+e\n\s+grep -vE "\^\$\{key\}=" "\$\{target\}" > "\$\{target\}\.tmp"\n\s+status=\$\?\n\s+set -e\n\s+\[\[ "\$\{status\}" -eq 0 \|\| "\$\{status\}" -eq 1 \]\] \|\| fail "failed to filter \$\{key\} from \$\{target\}"/,
  )
  assert.match(
    externalBackupScript,
    /COMPOSE_ENV_FILE="\$\{ENV_FILE\}"/,
  )
  assert.match(
    externalBackupScript,
    /docker compose --env-file "\$\{COMPOSE_ENV_FILE\}" -f "\$\{COMPOSE_FILE\}" "\$@"/,
  )
  assert.match(
    externalBackupScript,
    /rm -f -- "\$\{COMPOSE_ENV_FILE_TMP\}" "\$\{COMPOSE_ENV_FILE_TMP\}\.tmp"/,
  )
  assert(
    imageGuardBody.indexOf("ensure_compose_env_work_file") < imageGuardBody.indexOf('upsert_env_key "${key}" "${value}"') &&
    imageGuardBody.indexOf('upsert_env_key "${key}" "${value}"') < imageGuardBody.indexOf("return 0"),
    "HOME_SERVER_ENV image values must be staged before compose reads the env file",
  )

  const composeReadyBody = externalBackupScript.slice(
    externalBackupScript.indexOf("ensure_backup_compose_ready() {"),
    externalBackupScript.indexOf("backup_classes() {"),
  )
  const copyDeployConfigBody = externalBackupScript.slice(
    externalBackupScript.indexOf("copy_deploy_config() {"),
    externalBackupScript.indexOf("backup_postgres() {"),
  )
  const preparePostgresBody = externalBackupScript.slice(
    externalBackupScript.indexOf("prepare_postgres_backup_compose_if_needed() {"),
    externalBackupScript.indexOf("backup_classes() {"),
  )
  const backupPostgresBody = externalBackupScript.slice(
    externalBackupScript.indexOf("backup_postgres() {"),
    externalBackupScript.indexOf("is_dir_empty() {"),
  )
  const backupLoopBody = externalBackupScript.slice(
    externalBackupScript.indexOf('for class in "${classes[@]}"; do'),
    externalBackupScript.indexOf('log "backup complete id=${TIMESTAMP}"'),
  )
  const ensureCallIndex = composeReadyBody.indexOf("\n  ensure_compose_image_env_defaults\n")
  const validateComposeIndex = composeReadyBody.indexOf("\n  validate_compose_config_after_env_autofill\n")
  const skipMarkerIndex = preparePostgresBody.indexOf('if [[ "${AQUILA_BACKUP_SKIP_POSTGRES:-false}" == "true" ]]')
  const prepareComposeReadyCallIndex = preparePostgresBody.indexOf("\n  ensure_backup_compose_ready\n")
  const prepareCallIndex = backupPostgresBody.indexOf("\n  prepare_postgres_backup_compose_if_needed\n")
  const composeExecIndex = backupPostgresBody.indexOf("\n  compose exec -T db_1")
  const loopPrepareIndex = backupLoopBody.indexOf("\n  prepare_postgres_backup_compose_if_needed\n")
  const loopCopyIndex = backupLoopBody.indexOf("\n  copy_deploy_config")
  assert(ensureCallIndex > -1, "create_external_backup.sh must call image env auto-fill")
  assert(validateComposeIndex > -1, "create_external_backup.sh must validate compose after image env auto-fill")
  assert(skipMarkerIndex > -1, "PostgreSQL backup skip path must remain explicit")
  assert(prepareComposeReadyCallIndex > -1, "PostgreSQL compose preparation must call compose preflight")
  assert(prepareCallIndex > -1, "PostgreSQL backup must prepare compose before compose exec")
  assert(composeExecIndex > -1, "PostgreSQL backup must keep compose exec")
  assert(loopPrepareIndex > -1, "backup loop must prepare compose before copying deploy config")
  assert(loopCopyIndex > -1, "backup loop must copy deploy config")
  assert(ensureCallIndex < validateComposeIndex, "compose validation must run after image env auto-fill")
  assert(skipMarkerIndex < prepareComposeReadyCallIndex, "compose preflight must not run before skipped PostgreSQL backups")
  assert(prepareCallIndex < composeExecIndex, "compose preflight must run before backup compose calls")
  assert(loopPrepareIndex < loopCopyIndex, "compose env failures must be detected before copying deploy config")
  assert.match(
    copyDeployConfigBody,
    /cp "\$\{COMPOSE_ENV_FILE\}" "\$\{target_dir\}\/\.env\.prod\.compose"/,
  )
})

test("home-server runtime contract covers external storage backup keys", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const keys = new Set(targetKeyNames(loadContract(contractPath), "home-server-runtime"))

  assert(keys.has("AQUILA_EXTERNAL_STORAGE_ROOT"))
  assert(keys.has("AQUILA_BACKUP_ROOT"))
  assert(keys.has("AQUILA_BACKUP_RETENTION_DAILY"))
  assert(keys.has("AQUILA_BACKUP_RETENTION_WEEKLY"))
  assert(keys.has("AQUILA_BACKUP_RETENTION_MONTHLY"))
  assert(keys.has("AQUILA_BACKUP_MIN_FREE_PERCENT"))
})

test("external storage values reject unsafe paths and non-positive retention", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = baseHomeServerEnv
    .replace("AQUILA_EXTERNAL_STORAGE_ROOT=/mnt/aquila-blog-data", "AQUILA_EXTERNAL_STORAGE_ROOT=/")
    .replace("AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups", "AQUILA_BACKUP_ROOT=../backups")
    .replace("AQUILA_BACKUP_RETENTION_DAILY=14", "AQUILA_BACKUP_RETENTION_DAILY=0")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "AQUILA_EXTERNAL_STORAGE_ROOT"))
  assert(result.errors.some((error) => error.key === "AQUILA_BACKUP_ROOT"))
  assert(result.errors.some((error) => error.key === "AQUILA_BACKUP_RETENTION_DAILY"))
})

test("external storage upload limits reject non-positive values", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = baseHomeServerEnv
    .replace("CUSTOM_STORAGE_MAXFILESIZEBYTES=104857600", "CUSTOM_STORAGE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=104857600", "CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=52428800", "CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=104857600", "CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=104857600", "CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=5368709120", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=0")
    .replace("BACKEND_PROXY_MAX_BODY_BYTES=109051904", "BACKEND_PROXY_MAX_BODY_BYTES=0")
    .replace("BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=268435456", "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=0")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES"))
  assert(result.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS"))
  assert(result.errors.some((error) => error.key === "BACKEND_PROXY_MAX_BODY_BYTES"))
  assert(result.errors.some((error) => error.key === "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES"))
})

test("대용량 동영상 resumable 설정은 part 크기와 세션 만료 경계를 검증한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const belowBoundary = baseHomeServerEnv
    .replace(
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864",
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=5242879",
    )
    .replace(
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400",
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=59",
    )
  const atBoundary = baseHomeServerEnv
    .replace(
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864",
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=5242880",
    )
    .replace(
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400",
      "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=60",
    )

  const belowResult = validateEnvText({
    contract,
    target: "home-server-source",
    text: belowBoundary,
  })
  const boundaryResult = validateEnvText({
    contract,
    target: "home-server-source",
    text: atBoundary,
  })

  assert.equal(belowResult.ok, false)
  assert(belowResult.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES"))
  assert(belowResult.errors.some((error) => error.key === "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS"))
  assert.equal(boundaryResult.ok, true)
})

test("external backup root must stay strictly inside the default or configured storage root", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const withoutExternalRoot = baseHomeServerEnv.replace(/^AQUILA_EXTERNAL_STORAGE_ROOT=.*\n/m, "")
  const outsideDefaultRoot = withoutExternalRoot.replace(
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
    "AQUILA_BACKUP_ROOT=/other/backups",
  )
  const sameAsExternalRoot = baseHomeServerEnv.replace(
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data",
  )
  const insideMinioData = baseHomeServerEnv.replace(
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/minio/backups",
  )
  const repeatedSeparatorInsideMinioData = baseHomeServerEnv.replace(
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
    "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data//minio/backups",
  )
  const nonDefaultStorageRoot = baseHomeServerEnv
    .replace("AQUILA_EXTERNAL_STORAGE_ROOT=/mnt/aquila-blog-data", "AQUILA_EXTERNAL_STORAGE_ROOT=/mnt/other-disk")
    .replace("AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups", "AQUILA_BACKUP_ROOT=/mnt/other-disk/backups")

  const outsideResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: outsideDefaultRoot,
  })
  const sameResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: sameAsExternalRoot,
  })
  const insideMinioResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: insideMinioData,
  })
  const repeatedSeparatorInsideMinioResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: repeatedSeparatorInsideMinioData,
  })
  const nonDefaultStorageRootResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: nonDefaultStorageRoot,
  })

  assert.equal(outsideResult.ok, false)
  assert(outsideResult.errors.some((error) => error.key === "AQUILA_BACKUP_ROOT"))
  assert.equal(sameResult.ok, false)
  assert(sameResult.errors.some((error) => error.key === "AQUILA_BACKUP_ROOT"))
  assert.equal(insideMinioResult.ok, false)
  assert(insideMinioResult.errors.some((error) => error.key === "AQUILA_BACKUP_ROOT"))
  assert.equal(repeatedSeparatorInsideMinioResult.ok, false)
  assert(repeatedSeparatorInsideMinioResult.errors.some((error) => error.key === "AQUILA_BACKUP_ROOT"))
  assert.equal(nonDefaultStorageRootResult.ok, false)
  assert(nonDefaultStorageRootResult.errors.some((error) => error.key === "AQUILA_EXTERNAL_STORAGE_ROOT"))
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
    assert.match(rendered, /^BACKEND_PROXY_MAX_BODY_BYTES=109051904$/m)
    assert.match(rendered, /^BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=268435456$/m)
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
  assert.match(workflow, /export HOME_SERVER_ENV/)
  assert(workflow.indexOf("export HOME_SERVER_ENV") < workflow.indexOf("create_external_backup.sh"))
  assert.match(workflow, /restart_external_backup_legacy_minio_if_needed/)
  assert.match(workflow, /backup created \(pre-checkout\)/)
  assert.match(workflow, /keeping migrated MinIO copy for manual reconciliation after rollback/)
  assert(!workflow.includes("removing migrated MinIO copy after rollback to legacy volume"))
  assert(workflow.indexOf("backup created (pre-checkout)") < workflow.indexOf('git checkout --force "${HOME_DEPLOY_SHA}"'))
  assert(workflow.indexOf("umask 077") < workflow.indexOf("backup created (pre-checkout)"))
  assert(
    workflow.indexOf("restart_external_backup_legacy_minio_if_needed") <
      workflow.indexOf("run_backup_rollback"),
  )
  assert(workflow.indexOf('rollback_from_backup_if_needed "unexpected_exit_status_${status}"') < workflow.indexOf("EXTERNAL_BACKUP_DIR="))
  assert(workflow.indexOf("run_backup_rollback") < workflow.indexOf("restart_external_backup_legacy_minio_if_needed", workflow.indexOf("run_backup_rollback")))
  assert(workflow.lastIndexOf("rm -f deploy/homeserver/.external-minio-migration-stopped") < workflow.indexOf('DEPLOY_COMPLETED="true"'))
})

test("deploy workflow pins production site cookie scope to the live custom domain before rollout", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN" "aquilaxk\.site" "deploy\/homeserver\/\.env\.prod"/)
  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_FRONTURL" "https:\/\/www\.aquilaxk\.site" "deploy\/homeserver\/\.env\.prod"/)
  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_BACKURL" "https:\/\/api\.aquilaxk\.site" "deploy\/homeserver\/\.env\.prod"/)
  assert(
    workflow.indexOf('upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN"') <
      workflow.indexOf('require_nonempty_env_key "CF_TUNNEL_TOKEN"'),
  )
})

test("deploy workflow validates live API security headers after homeserver rollout", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /assert_live_security_headers\(\)/)
  assert.match(workflow, /header_value_from_file\(\)/)
  assert.match(workflow, /strict-transport-security" "max-age=31536000"/)
  assert.match(workflow, /x-content-type-options" "nosniff"/)
  assert.match(workflow, /x-frame-options" "deny"/)
  assert.match(workflow, /referrer-policy" "strict-origin-when-cross-origin"/)
  assert.match(workflow, /permissions-policy" "camera=\(\)"/)
  assert.match(workflow, /cache-control" "no-store"/)
  assert.match(workflow, /"public-feed"/)
  assert.match(workflow, /\/post\/api\/v1\/posts\/feed\?page=1&pageSize=1&sort=CREATED_AT/)
  assert.match(workflow, /"protected-auth-me"/)
  assert.match(workflow, /\/member\/api\/v1\/auth\/me/)
  assert.match(workflow, /rollback_and_exit "public_feed_security_header_smoke_failed"/)
  assert.match(workflow, /rollback_and_exit "protected_auth_security_header_smoke_failed"/)
  assert(
    workflow.indexOf('wait_public_api_health "${API_DOMAIN}"') <
      workflow.indexOf('assert_live_security_headers'),
  )
  assert(
    workflow.indexOf('assert_live_security_headers') <
      workflow.indexOf("run_canary_ratio_check()"),
  )
})

test("required secret check does not inject multi-line HOME_SERVER_ENV into shell", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert(!workflow.includes("HOME_SERVER_ENV=${{ secrets.HOME_SERVER_ENV }}"))
  assert.match(workflow, /env:\n(?:.*\n)*\s+HOME_SERVER_ENV: \$\{\{ secrets\.HOME_SERVER_ENV \}\}/)
  assert.match(workflow, /value="\$\{!key:-\}"/)
})

test("deploy workflow는 editor live canary를 editor 변경 또는 명시적 force로 제한한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /editor_live_canary: \$\{\{ steps\.meta\.outputs\.editor_live_canary \}\}/)
  assert.match(workflow, /EDITOR_LIVE_CANARY_PATHS_PATTERN=.*front\/src\/components\/markdown-editor\//)
  assert.match(workflow, /EDITOR_LIVE_CANARY_PATHS_PATTERN=.*front\/src\/pages\/editor\//)
  assert.match(workflow, /force_editor_live_canary:\s*\n/)
  assert.match(workflow, /E2E_LIVE_EDITOR_507_CANARY: \$\{\{ needs\.calculateTag\.outputs\.editor_live_canary \}\}/)
  assert.doesNotMatch(workflow, /E2E_LIVE_EDITOR_507_CANARY:\s*['"]?true['"]?/)
})

test("deploy workflow는 frontend 변경에서만 live frontend SHA를 현재 commit으로 기대한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /expected_front_commit_sha: \$\{\{ steps\.meta\.outputs\.expected_front_commit_sha \}\}/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*\^front\/\(src\//)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*packages\//)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*scripts\/\(check-refactor-boundaries\\\.mjs/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*with-test-lock\\\.mjs/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*patch-lodash-template\\\.cjs/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*site\\\.config\\\.js/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*tsconfig\\\.json/)
  assert.match(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN=.*next-sitemap\\\.config\\\.js/)
  assert.doesNotMatch(workflow, /FRONT_BUILD_SHA_PATHS_PATTERN='?\^front\/'?\n/)
  assert.match(workflow, /EXPECTED_FRONT_COMMIT_SHA="\$\{DEPLOY_SHA\}"/)
  assert.match(workflow, /E2E_EXPECTED_FRONT_COMMIT_SHA: \$\{\{ needs\.calculateTag\.outputs\.expected_front_commit_sha \}\}/)
  assert.doesNotMatch(workflow, /E2E_EXPECTED_FRONT_COMMIT_SHA:\s*\$\{\{ needs\.calculateTag\.outputs\.deploy_sha \}\}/)
})

test("deploy workflow는 path-aware stale gate로 backend 영향 후속 변경만 차단한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /DEPLOY_SHA_INPUT: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /REMOTE_MAIN_SHA="\$\(git ls-remote --exit-code origin refs\/heads\/main \| awk '\{print \$1\}'\)"/)
  assert.match(workflow, /origin\/main sha lookup failed/)
  assert.match(workflow, /git fetch --no-tags --prune origin "\+refs\/heads\/main:refs\/remotes\/origin\/main"/)
  assert.match(workflow, /git merge-base --is-ancestor "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"/)
  assert.match(workflow, /STALE_CHANGED_FILES="\$\(git diff --name-only "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"/)
  assert.match(workflow, /BACKEND_DEPLOY_PATHS_PATTERN=.*deploy\/env\//)
  assert.match(workflow, /BACKEND_DEPLOY_PATHS_PATTERN=.*tools\/env\//)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*deploy\/env\//)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*tools\/env\//)
  assert.match(workflow, /grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"/)
  assert.doesNotMatch(workflow, /git fetch --depth=1 origin main/)
  assert.doesNotMatch(workflow, /git rev-parse origin\/main/)
  assert.match(workflow, /stale workflow_run blocked by backend-impacting newer main changes: deploy_sha=/)
  assert.match(workflow, /stale workflow_run allowed after backend-neutral newer main changes: deploy_sha=/)
  assert.doesNotMatch(workflow, /stale workflow_run payload: deploy_sha=/)
  assert.doesNotMatch(workflow, /STALE_WORKFLOW_RUN/)
  assert.match(workflow, /if echo "\$\{CHANGED_FILES\}" \| grep -Eq "\$\{FRONT_BUILD_SHA_PATHS_PATTERN\}"/)
})

test("deploy calculateTag는 docs-only 후속 main 변경이면 기존 backend deploy를 계속 허용한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.backendSha,
      currentMainSha: fixture.docsSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")
    const summary = readFileSync(path.join(fixture.workDir, "github-summary.md"), "utf8")

    assert.match(output, /backend_deploy=true/)
    assert.match(summary, /path-aware-stale-neutral/)
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 backend 영향 후속 main 변경이면 stale deploy를 차단한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    assert.throws(
      () =>
        runDeployCalculateScript({
          cwd: fixture.workDir,
          deploySha: fixture.backendSha,
          currentMainSha: fixture.backendAfterDocsSha,
        }),
      /stale workflow_run blocked by backend-impacting newer main changes/,
    )
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 deploy-time env 검증 입력 후속 변경이면 stale deploy를 차단한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    assert.throws(
      () =>
        runDeployCalculateScript({
          cwd: fixture.workDir,
          deploySha: fixture.backendSha,
          currentMainSha: fixture.envContractAfterDocsSha,
        }),
      /stale workflow_run blocked by backend-impacting newer main changes/,
    )
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 deploy-time env 검증 입력 현재 main 변경이면 backend deploy를 실행한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.envContractAfterDocsSha,
      currentMainSha: fixture.envContractAfterDocsSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")

    assert.match(output, /backend_deploy=true/)
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 현재 main ancestry 밖의 deploy SHA를 차단한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    assert.throws(
      () =>
        runDeployCalculateScript({
          cwd: fixture.workDir,
          deploySha: fixture.nonAncestorSha,
          currentMainSha: fixture.docsSha,
        }),
      /deploy sha is not reachable from origin\/main/,
    )
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy workflow uses immutable backend digest and does not push latest", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /back_image_ref: \$\{\{ steps\.backend_image\.outputs\.back_image_ref \}\}/)
  assert.match(workflow, /id: build_backend_image/)
  assert.match(workflow, /echo "back_image_ref=\$\{IMAGE_NAME\}@\$\{BACKEND_IMAGE_DIGEST\}"/)
  assert.match(workflow, /HOME_BACK_IMAGE: \$\{\{ needs\.buildAndPush\.outputs\.back_image_ref \}\}/)
  assert.match(workflow, /ACTIVE_BACKEND_IMAGE_KEY=/)
  assert.match(workflow, /EXPECTED_BACK_IMAGE="\$\(extract_env_value "\$\{ACTIVE_BACKEND_IMAGE_KEY\}"\)"/)
  assert.doesNotMatch(workflow, /EXPECTED_BACK_IMAGE="\$\(extract_env_value "BACK_IMAGE"\)"/)
  assert.doesNotMatch(workflow, /image_latest_ref/)
  assert.doesNotMatch(workflow, /\$\{\{ needs\.calculateTag\.outputs\.image_latest_ref \}\}/)
  assert.doesNotMatch(workflow, /IMAGE_LATEST_REF="\$\{IMAGE_NAME\}:latest"/)
})

test("homeserver deploy preserves runtime-specific backend image release state", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const backupScript = readFileSync(deployBackupScriptPath, "utf8")
  const externalBackupScript = readFileSync(externalBackupScriptPath, "utf8")
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")
  const recoverScript = readFileSync(path.join(repoRoot, "deploy/homeserver/recover.sh"), "utf8")
  const statusScript = readFileSync(path.join(repoRoot, "deploy/homeserver/check_deploy_status.sh"), "utf8")
  const steadyStateGuard = readFileSync(path.join(repoRoot, "deploy/homeserver/steady_state_guard.sh"), "utf8")

  for (const key of runtimeBackendImageKeys) {
    assert.match(deployScript, new RegExp(`${key}`))
    assert.match(rollbackScript, new RegExp(`${key}`))
    assert.match(recoverScript, new RegExp(`${key}`))
  }

  assert.match(deployScript, /RELEASE_STATE_FILE="\$\{SCRIPT_DIR\}\/\.backend-release-state\.env"/)
  assert.match(deployScript, /awk -F= -v key="\$\{key\}"/)
  assert.match(deployScript, /value = substr\(\$0, index\(\$0, "="\) \+ 1\)/)
  assert.match(deployScript, /END \{\s*print value\s*\}/)
  assert.match(externalBackupScript, /is_digest_image_value\(\)/)
  assert.match(externalBackupScript, /stage_backend_runtime_image_env_key\(\)/)
  assert.match(externalBackupScript, /export "\$\{key\}=\$\{image\}"/)
  assert.doesNotMatch(
    externalBackupScript,
    /if \[\[ -n "\$\{value\}" \]\]; then\s*require_digest_image_value "\$\{key\}" "\$\{value\}"\s*return 0\s*fi/s,
  )
  assert.match(
    externalBackupScript,
    /invalid .*runtime image env .*will try fallback sources before backup compose evaluation/,
  )
  assert.match(externalBackupScript, /stage_backend_runtime_image_env_key "\$\{key\}" "\$\{legacy_value\}"/)
  assert.match(externalBackupScript, /stage_backend_runtime_image_env_key "\$\{key\}" "\$\{container_value\}"/)
  assert.match(deployScript, /write_backend_release_state "\$\{next_backend\}" "\$\{active_backend\}"/)
  assert.match(deployScript, /prepare_runtime_backend_images "\$\{active_backend\}" "\$\{next_backend\}" "\$\{STAGED_BACK_IMAGE\}"/)
  assert.match(backupScript, /\.backend-release-state\.env/)
  assert.match(backupScript, /back_blue_image=/)
  assert.match(backupScript, /back_green_image=/)
  assert.match(rollbackScript, /backup_image_key_for_service\(\)/)
  assert.match(rollbackScript, /local key metadata_key current_value repaired_value metadata_image legacy_image\s+repaired_value=""/)
  assert.match(rollbackScript, /repair_runtime_back_image_if_missing "\$\{target_backend\}"/)
  assert.match(recoverScript, /repair_runtime_back_image_if_missing "back_worker"/)
  assert.match(statusScript, /ACTIVE_BACKEND_IMAGE_KEY="BACK_BLUE_IMAGE"/)
  assert.match(statusScript, /ACTIVE_BACKEND_IMAGE_KEY="BACK_GREEN_IMAGE"/)
  assert.match(steadyStateGuard, /image_key="BACK_BLUE_IMAGE"/)
  assert.match(steadyStateGuard, /image_key="BACK_GREEN_IMAGE"/)
  assert.doesNotMatch(statusScript, /env_value "BACK_IMAGE"/)
  assert.doesNotMatch(steadyStateGuard, /env_value "BACK_IMAGE"/)
})

test("deploy workflow requires pinned known_hosts and private GHCR credentials", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /HOME_KNOWN_HOSTS: \$\{\{ secrets\.HOME_KNOWN_HOSTS \}\}/)
  assert.match(workflow, /HOME_GHCR_USERNAME: \$\{\{ secrets\.HOME_GHCR_USERNAME \}\}/)
  assert.match(workflow, /HOME_GHCR_TOKEN: \$\{\{ secrets\.HOME_GHCR_TOKEN \}\}/)
  assert.match(workflow, /HOME_KNOWN_HOSTS\s*\n\s*HOME_GHCR_USERNAME\s*\n\s*HOME_GHCR_TOKEN/)
  assert.doesNotMatch(workflow, /ssh-keyscan/)
  assert.doesNotMatch(workflow, /Collecting known_hosts/)
  assert.doesNotMatch(workflow, /if \[ -n "\$\{HOME_GHCR_USERNAME:-\}" \] && \[ -n "\$\{HOME_GHCR_TOKEN:-\}" \]/)
})

test("deploy workflow transfers secret env through temporary files instead of ssh command line", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /home-server\.env/)
  assert.match(workflow, /scp -i "\$SSH_DIR\/home_key"/)
  assert.match(workflow, /REMOTE_ENV_FILE=/)
  assert.match(workflow, /cleanup_remote_tmp_from_runner\(\)/)
  assert.match(workflow, /trap cleanup_remote_tmp_from_runner EXIT/)
  assert.match(workflow, /REMOTE\n\s+REMOTE_TMP_DIR=""/)
  assert.match(workflow, /REMOTE\n\s+REMOTE_TMP_DIR=""\n\s+trap - EXIT/)
  assert.doesNotMatch(workflow, /HOME_SERVER_ENV_B64=/)
  assert.doesNotMatch(workflow, /HOME_GHCR_TOKEN_B64=/)
  assert.doesNotMatch(workflow, /HOME_AI_SUMMARY_GEMINI_API_KEY_B64=/)
})

test("runtime contract accounts for every compose env interpolation", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const contractKeys = new Set(targetKeyNames(loadContract(contractPath), "home-server-runtime"))
  const compose = readFileSync(composePath, "utf8")
  const composeKeys = [...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1])
  const missing = [...new Set(composeKeys)].filter((key) => !contractKeys.has(key)).sort()

  assert.deepEqual(missing, [])
})

test("minio production data is bound to the approved external disk", () => {
  const compose = readFileSync(composePath, "utf8")

  assert.match(compose, /type:\s*bind/)
  assert.match(compose, /source:\s*\$\{AQUILA_EXTERNAL_STORAGE_ROOT:-\/mnt\/aquila-blog-data\}\/minio/)
  assert.match(compose, /target:\s*\/data/)
  assert.match(compose, /create_host_path:\s*false/)
  assert(!compose.includes("minio_data:/data"))
  assert(!/^\s*minio_data:\s*$/m.test(compose))
})

test("secret-bearing homeserver backups use private file permissions", () => {
  const externalBackupScript = readFileSync(externalBackupScriptPath, "utf8")
  const deployBackupScript = readFileSync(deployBackupScriptPath, "utf8")

  assert.match(externalBackupScript, /^umask 077$/m)
  assert.match(deployBackupScript, /^umask 077$/m)
  assert(externalBackupScript.indexOf("umask 077") < externalBackupScript.indexOf('mkdir -p "${BACKUP_ROOT}/logs"'))
  assert(deployBackupScript.indexOf("umask 077") < deployBackupScript.indexOf('mkdir -p "${BACKUP_DIR}"'))
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

test("blue-green deploy pauses autoheal while staging a candidate backend", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const pauseCallIndex = deployScript.indexOf("\npause_autoheal_for_blue_green\n")
  const candidateRecreateIndex = deployScript.indexOf('compose_up_force_recreate_with_retry "${next_backend}"')

  assert.match(deployScript, /pause_autoheal_for_blue_green\(\)/)
  assert.match(deployScript, /resume_autoheal_if_paused\(\)/)
  assert.match(deployScript, /trap 'resume_autoheal_if_paused; release_deploy_lock' EXIT INT TERM/)
  assert.match(deployScript, /compose stop autoheal/)
  assert.match(deployScript, /compose up -d autoheal/)
  assert(pauseCallIndex > 0, "deploy script must call pause_autoheal_for_blue_green before staging")
  assert(candidateRecreateIndex > 0, "deploy script must recreate the candidate backend")
  assert(
    pauseCallIndex < candidateRecreateIndex,
    "autoheal must be paused before candidate backend force-recreate",
  )
})

test("blue-green deploy keeps old backend running during burn-in rollback window", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const burnInIndex = deployScript.indexOf('run_blue_green_burn_in "${next_backend}" "${active_backend}" "${api_domain}"')
  const stopOldIndex = deployScript.indexOf('drain_and_stop_backend_if_running "${active_backend}"')
  const stateWriteIndex = deployScript.indexOf('write_backend_release_state "${next_backend}" "${active_backend}"')

  assert.match(deployScript, /BLUE_GREEN_BURN_IN_STANDARD_SECONDS=/)
  assert.match(deployScript, /BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS=/)
  assert.match(deployScript, /resolve_blue_green_burn_in_seconds\(\)/)
  assert.match(deployScript, /rollback_caddy_route_only\(\)/)
  assert.match(deployScript, /run_blue_green_burn_in\(\)/)
  assert.match(deployScript, /rollback_caddy_route_only "\$\{previous_backend\}" "\$\{candidate_backend\}" "\$\{api_domain\}"/)
  assert.match(deployScript, /burn-in failed; keeping previous backend active/)
  assert.match(deployScript, /burn-in ok: candidate=.*previous=.*duration_seconds=/)
  assert(burnInIndex > 0, "deploy script must run burn-in after candidate cutover")
  assert(stopOldIndex > 0, "deploy script must still stop old backend after burn-in")
  assert(stateWriteIndex > 0, "deploy script must write release state after burn-in")
  assert(burnInIndex < stopOldIndex, "old backend must not stop before burn-in completes")
  assert(burnInIndex < stateWriteIndex, "release state must not mark candidate active before burn-in completes")
})

test("runtime-split memory tuner keeps backend color startup headroom", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const splitAllocator = deployScript.slice(
    deployScript.indexOf("allocate_runtime_split_memory_limits()"),
    deployScript.indexOf("allocate_single_runtime_memory_limits()"),
  )

  assert.match(
    deployScript,
    /AUTO_MEMORY_TUNER_MAX_BUDGET_MB="\$\{AUTO_MEMORY_TUNER_MAX_BUDGET_MB:-4096\}"/,
  )
  assert.match(splitAllocator, /local blue_min=640/)
  assert.match(deployScript, /mode_min_budget_mb=3200/)
  assert(!splitAllocator.includes("local blue_min=384"))
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

test("prometheus scrapes backend runtimes with color and component labels", () => {
  const prometheus = readFileSync(prometheusPath, "utf8")
  const taskAlerts = readFileSync(taskAlertsPath, "utf8")
  const exampleTaskAlerts = readFileSync(
    path.join(repoRoot, "deploy/homeserver/monitoring/prometheus-task-alerts.example.yml"),
    "utf8",
  )
  const overviewDashboard = readFileSync(
    path.join(repoRoot, "deploy/homeserver/monitoring/grafana/dashboards/blog-overview.json"),
    "utf8",
  )

  for (const target of ["back-blue:8080", "back-green:8080", "back-read:8080", "back-admin:8080", "back_worker:8080"]) {
    assert.match(prometheus, new RegExp(`- ${target.replace(".", "\\.")}`))
  }

  assert.match(prometheus, /deploy_color: blue/)
  assert.match(prometheus, /deploy_color: green/)
  assert.match(prometheus, /component: api/)
  assert.match(prometheus, /component: read/)
  assert.match(prometheus, /component: admin/)
  assert.match(prometheus, /component: worker/)
  assert.match(taskAlerts, /max\(up\{job="back",service="aquila-back",component="api"\}\) < 1/)
  assert.doesNotMatch(taskAlerts, /min\(up\{job="back",service="aquila-back"\}\) < 1/)
  assert.match(exampleTaskAlerts, /max\(up\{job="back",service="aquila-back",component="api"\}\) < 1/)
  assert.doesNotMatch(exampleTaskAlerts, /min\(up\{job="back",service="aquila-back"\}\) < 1/)
  assert.match(overviewDashboard, /max\(up\{job=\\"back\\",service=\\"aquila-back\\",component=\\"api\\"\}\) or on\(\) vector\(0\)/)
  assert.match(overviewDashboard, /Back API scrape health \(any color up\)/)
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
