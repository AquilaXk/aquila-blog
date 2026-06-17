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
const deployBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_deploy_backup.sh")
const externalBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_external_backup.sh")
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
  ]
  const contractKeys = new Set(targetKeyNames(loadContract(contractPath), "home-server-source"))
  const compose = readFileSync(composePath, "utf8")
  const literalImageLines = compose
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter(({ value }) => value.startsWith("image: "))
    .filter(({ value }) => !value.includes("${"))

  assert.deepEqual(literalImageLines, [])
  for (const key of runtimeImageKeys) {
    assert(contractKeys.has(key), `${key} must be covered by the home-server-source contract`)
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

test("deploy workflow는 stale workflow_run을 로그로 남기고 검증된 SHA 배포 기준을 유지한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /DEPLOY_SHA_INPUT: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /CURRENT_MAIN_SHA_INPUT: \$\{\{ github\.sha \}\}/)
  assert.match(workflow, /stale workflow_run payload: deploy_sha=/)
  assert.doesNotMatch(workflow, /STALE_WORKFLOW_RUN/)
  assert.match(workflow, /if echo "\$\{CHANGED_FILES\}" \| grep -Eq "\$\{FRONT_BUILD_SHA_PATHS_PATTERN\}"/)
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
