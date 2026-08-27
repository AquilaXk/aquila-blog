import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const workflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const ciWorkflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const securityWorkflowPath = path.join(repoRoot, ".github/workflows/security.yml")
const backupRestoreWorkflowPath = path.join(repoRoot, ".github/workflows/backup-restore-drill.yml")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const caddyfilePath = path.join(repoRoot, "deploy/homeserver/caddy/Caddyfile")
const envExamplePath = path.join(repoRoot, "deploy/homeserver/.env.prod.example")
const applicationProdPath = path.join(repoRoot, "back/src/main/resources/application-prod.yaml")
const deployScriptPath = path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh")
const doctorScriptPath = path.join(repoRoot, "deploy/homeserver/doctor.sh")
const deployStatusScriptPath = path.join(repoRoot, "deploy/homeserver/check_deploy_status.sh")
const deployBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_deploy_backup.sh")
const baselineScriptPath = path.join(repoRoot, "deploy/homeserver/record_deploy_baseline.sh")
const externalBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_external_backup.sh")
const hardeningScriptPath = path.join(repoRoot, "deploy/homeserver/hardening/setup_hardening.sh")
const hardeningDocPath = path.join(repoRoot, "deploy/homeserver/HARDENING.md")
const prometheusPath = path.join(repoRoot, "deploy/homeserver/monitoring/prometheus.yml")
const taskAlertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")

const extractCaddySiteBlock = (caddyfile, siteMarker) => {
  const start = caddyfile.indexOf(siteMarker)
  if (start === -1) return ""
  // Address lines may embed `{env}` placeholders and may list several addresses, so the block
  // opener is the LAST brace on the address line - not the first one after the marker, which
  // would be a `{$VAR}` placeholder of a second address.
  const lineEnd = caddyfile.indexOf("\n", start)
  const addressLine = caddyfile.slice(start, lineEnd === -1 ? caddyfile.length : lineEnd)
  const openBrace = start + addressLine.lastIndexOf("{")
  if (addressLine.lastIndexOf("{") === -1) return ""
  let depth = 0
  for (let i = openBrace; i < caddyfile.length; i += 1) {
    const ch = caddyfile[i]
    if (ch === "{") depth += 1
    else if (ch === "}") {
      depth -= 1
      if (depth === 0) return caddyfile.slice(start, i + 1)
    }
  }
  return ""
}

// 공개 API 게이트는 backend 전용 vhost와 same-origin web vhost가 공유하는 snippet 하나에 있다.
const backendGatesSnippet = "(backend_edge_gates) {"
const retiredLegacyApiDomain = ["LEGACY", "API", "DOMAIN"].join("_")
// The backend-only vhost has one permanent, container-internal entry point.
const backendVhostMarker = "http://caddy {"
// client IP 신뢰 경계도 같은 이유로 한 곳에만 있다.
const clientIpCaptureSnippet = "(edge_client_ip_capture) {"

const forbiddenSecretBackupCopyPattern =
  /for file in[^\n]*[\s/]\.env\.prod(?:\.compose)?(?:[\s"';]|$)|\b(?:cp|install)\b[^\n]*[\s/]\.env\.prod(?:\.compose)?(?:[\s"';]|$)/

const git = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()

const extractTopLevelShellFunction = (source, name) => {
  const lines = source.split("\n")
  const signature = new RegExp(`^(\\s*)${name}\\(\\) \\{$`)
  const start = lines.findIndex((line) => signature.test(line))
  assert.notEqual(start, -1, `${name} function must exist`)
  const indentation = lines[start].match(signature)[1]
  const end = lines.findIndex((line, index) => index > start && line === `${indentation}}`)
  assert.notEqual(end, -1, `${name} function must have a closing brace`)
  return lines.slice(start, end + 1).join("\n")
}

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
  const frontSha = commitFile(workDir, "front/app.txt", "front change\n", "front change")
  const laterFrontSha = commitFile(workDir, "front/later.txt", "later front change\n", "later front change")
  const backendAfterFrontSha = commitFile(
    workDir,
    "deploy/homeserver/after-front.txt",
    "deploy change after front\n",
    "deploy change after front",
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
    frontSha,
    laterFrontSha,
    backendAfterFrontSha,
    nonAncestorSha,
  }
}

const runDeployCalculateScript = ({ cwd, deploySha, currentMainSha, eventName = "push", githubSha = deploySha }) => {
  git(cwd, ["update-ref", "refs/heads/main", currentMainSha])
  git(cwd, ["checkout", "--detach", githubSha])

  const stubDir = path.join(cwd, "bin")
  mkdirSync(stubDir)
  const ghCallLog = path.join(cwd, "gh-calls.txt")
  writeFileSync(
    path.join(stubDir, "gh"),
    `#!/bin/sh
printf '%s\\n' "$*" >> "$GH_CALL_LOG"
exit 1
`,
    { mode: 0o755 },
  )

  const outputFile = path.join(cwd, "github-output.txt")
  const summaryFile = path.join(cwd, "github-summary.md")
  const script = extractDeployCalculateScript()

  const output = execFileSync("bash", ["-c", script], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_REPOSITORY_OWNER: "AquilaXk",
      GITHUB_REPOSITORY: "AquilaXk/aquila-blog",
      GITHUB_SHA: githubSha,
      DEPLOY_SHA_INPUT: githubSha,
      FORCE_BACKEND_DEPLOY_INPUT: "false",
      WEB_FRONTEND_SOURCE_SHA: "a".repeat(40),
      WEB_FRONTEND_IMAGE_REF: `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"b".repeat(64)}`,
      PATH: `${stubDir}:${process.env.PATH}`,
      GH_CALL_LOG: ghCallLog,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const ghCalls = existsSync(ghCallLog) ? readFileSync(ghCallLog, "utf8").trim().split("\n") : []
  assert.deepEqual(ghCalls, [], `calculateTag must not repeat admission API calls for ${eventName}`)

  return { output, ghCallCount: ghCalls.length }
}

const targetKeyNames = (contract, targetName) => {
  const target = contract.targets[targetName]
  return [
    ...(target.extends ? targetKeyNames(contract, target.extends) : []),
    ...(target.keys || []).map((definition) => definition.name),
  ]
}

const webMetricsTokenFixture = "web-metrics-runtime-token-0123456789-${UNSET} # \\\"'\\\\"
const rotatedWebMetricsTokenFixture = `rotated-${webMetricsTokenFixture}`

const baseHomeServerEnv = [
  // 스위치가 same-origin topology면 #1557/#1575의 requiredWhen이 이 둘을 필수로 만든다.
  "WEB_DOMAIN=blog.aquilaxk.site",
  "BACKEND_INTERNAL_URL=http://caddy",
  "MONITOR_DOMAIN=status.aquilaxk.site",
  "GRAFANA_DOMAIN=grafana.aquilaxk.site",
  "PROMETHEUS_DOMAIN=prometheus.aquilaxk.site",
  "ADMIN_EMBED_ORIGINS=https://blog.aquilaxk.site",
  "CADDY_EMAIL=ops@aquilaxk.site",
  "CF_TUNNEL_TOKEN=cloudflare-tunnel-token-value",
  "CLOUDFLARED_IMAGE=cloudflare/cloudflared@sha256:4444444444444444444444444444444444444444444444444444444444444444",
  "AUTOHEAL_IMAGE=willfarrell/autoheal@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "DOCKER_SOCKET_PROXY_IMAGE=tecnativa/docker-socket-proxy@sha256:7777777777777777777777777777777777777777777777777777777777777777",
  "CADDY_IMAGE=caddy@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "UPTIME_KUMA_IMAGE=louislam/uptime-kuma@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  "PROMETHEUS_IMAGE=prom/prometheus@sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
  "ALERTMANAGER_IMAGE=prom/alertmanager@sha256:9999999999999999999999999999999999999999999999999999999999999999",
  "POSTGRES_EXPORTER_IMAGE=quay.io/prometheuscommunity/postgres-exporter@sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "GRAFANA_IMAGE=grafana/grafana@sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  "LOKI_IMAGE=grafana/loki@sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  "PROMTAIL_IMAGE=grafana/promtail@sha256:1111111111111111111111111111111111111111111111111111111111111111",
  "NODE_RUNTIME_IMAGE=node@sha256:2222222222222222222222222222222222222222222222222222222222222222",
  "REDIS_IMAGE=redis@sha256:3333333333333333333333333333333333333333333333333333333333333333",
  "DB_IMAGE=jangka512/pgj@sha256:5555555555555555555555555555555555555555555555555555555555555555",
  "MINIO_IMAGE=minio/minio@sha256:6666666666666666666666666666666666666666666666666666666666666666",
  "MINIO_MC_IMAGE=minio/mc:RELEASE.2025-08-13T08-35-41Z@sha256:a7fe349ef4bd8521fb8497f55c6042871b2ae640607cf99d9bede5e9bdf11727",
  "AQUILA_EXTERNAL_STORAGE_ROOT=/mnt/aquila-blog-data",
  "AQUILA_BACKUP_ROOT=/mnt/aquila-blog-data/backups",
  "AQUILA_BACKUP_RETENTION_DAILY=14",
  "AQUILA_BACKUP_RETENTION_WEEKLY=8",
  "AQUILA_BACKUP_RETENTION_MONTHLY=6",
  "AQUILA_BACKUP_MIN_FREE_PERCENT=15",
  "AQUILA_BACKUP_ENCRYPTION_KEY_FILE=/mnt/aquila-blog-data/backup-encryption.key",
  "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=/opt/aquila-blog/restore-privacy-gate.sh",
  "PROMETHEUS_BASIC_AUTH_USER=prometheus-operator",
  "PROMETHEUS_BASIC_AUTH_HASH=$$2y$$05$$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVabcdefghi",
  "OPERATIONS_ALERT_EMAIL_TO=ops@aquilaxk.site",
  "ALERTMANAGER_SMTP_AUTH_ENABLED=true",
  "ALERTMANAGER_SMTP_AUTH_USERNAME=mailer@aquilaxk.site",
  "ALERTMANAGER_SMTP_AUTH_PASSWORD=valid-mail-password",
  "GRAFANA_ADMIN_USER=admin",
  "GRAFANA_ADMIN_PASSWORD=valid-grafana-password",
  "GRAFANA_ROOT_URL=https://grafana.aquilaxk.site",
  "PROD___SPRING__DATASOURCE__USERNAME=blog_app",
  "PROD___SPRING__DATASOURCE__PASSWORD=valid-db-password",
  "PROD___SPRING__FLYWAY__USER=blog_flyway",
  "PROD___SPRING__FLYWAY__PASSWORD=valid-flyway-password",
  "PROD___POSTGRES__PASSWORD=valid-postgres-password",
  "PROD___POSTGRES_EXPORTER__USERNAME=postgres_exporter",
  "PROD___POSTGRES_EXPORTER__PASSWORD=valid-exporter-password",
  "PROD___SPRING__DATA__REDIS__PASSWORD=valid-redis-password",
  "CUSTOM__JWT__SECRET_KEY=abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz",
  "PROD___CUSTOM__POST__READ__CURSOR_SIGNING_SECRET=cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345",
  "PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION=2",
  "CUSTOM__ADMIN__USERNAME=관리자",
  "CUSTOM__ADMIN__EMAIL=admin@aquilaxk.site",
  "CUSTOM__ADMIN__PASSWORD=valid-admin-password",
  "CUSTOM_PROD_COOKIEDOMAIN=blog.aquilaxk.site",
  "CUSTOM_PROD_FRONTURL=https://blog.aquilaxk.site",
  "CUSTOM_PROD_BACKURL=https://blog.aquilaxk.site",
  "CUSTOM_PROD_DBNAME=blog_prod",
  "CUSTOM_PROD_REDISDATABASE=0",
  "CUSTOM__REVALIDATE__URL=https://blog.aquilaxk.site/api/revalidate",
  "CUSTOM__REVALIDATE__TOKEN=valid-revalidate-token",
  `WEB_METRICS_TOKEN=${webMetricsTokenFixture}`,
  "SPRING__SECURITY__OAUTH2__CLIENT__REGISTRATION__KAKAO__CLIENT_ID=configured-for-contract-test",
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
  "CUSTOM_STORAGE_ACCESSKEY=aquila-storage-v1",
  "CUSTOM_STORAGE_SECRETKEY=valid-storage-secret-value",
  "CUSTOM_STORAGE_CREDENTIAL_VERSION=1",
  "CUSTOM_STORAGE_PATHSTYLEACCESS=true",
  "CUSTOM_STORAGE_KEYPREFIX=posts",
  "CUSTOM_STORAGE_CLOUD_KEY_PREFIX=cloud",
  "CUSTOM_STORAGE_MAXFILESIZEBYTES=99614720",
  "CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=99614720",
  "CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=52428800",
  "CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=99614720",
  "CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=99614720",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=5368709120",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864",
  "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400",
  "CUSTOM_STORAGE_MULTIPART_MAX_FILE_SIZE=95MB",
  "CUSTOM_STORAGE_MULTIPART_MAX_REQUEST_SIZE=100MB",
  "BACKEND_PROXY_MAX_BODY_BYTES=104857600",
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

test("home-server-source는 Kakao OIDC client-id의 누락과 빈 값을 배포 전에 거부한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const key = "SPRING__SECURITY__OAUTH2__CLIENT__REGISTRATION__KAKAO__CLIENT_ID"
  const definition = contract.targets["home-server-source"].keys.find((candidate) => candidate.name === key)

  assert.equal(definition?.required, true, "Kakao client-id must be required at the HOME_SERVER_ENV source")
  assert.equal(definition?.secret, true, "Kakao client-id must be marked secret so diagnostics cannot disclose it")

  for (const [name, text] of [
    ["missing", baseHomeServerEnv.replace(new RegExp(`^${key}=.*\\n`, "m"), "")],
    ["blank", baseHomeServerEnv.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=`)],
  ]) {
    const result = validateEnvText({ contract, target: "home-server-source", text })
    assert.equal(result.ok, false, `${name} Kakao client-id must fail before deployment`)
    assert(result.errors.some((error) => error.key === key && error.message === "is required"), JSON.stringify(result.errors))
  }
})

test("home-server-source는 Web runtime metrics token의 누락·빈 값·짧은 값을 배포 전에 거부한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const key = "WEB_METRICS_TOKEN"
  const definition = contract.targets["home-server-source"].keys.find((candidate) => candidate.name === key)

  assert.equal(definition?.required, true, "Web runtime metrics token must be required at the HOME_SERVER_ENV source")
  assert.equal(definition?.secret, true, "Web runtime metrics token must stay secret in diagnostics")
  assert.equal(definition?.minLength, 32, "Web runtime metrics token must reject short values")

  for (const [name, text] of [
    ["missing", baseHomeServerEnv.replace(new RegExp(`^${key}=.*\\n`, "m"), "")],
    ["blank", baseHomeServerEnv.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=`)],
    ["short", baseHomeServerEnv.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${"a".repeat(31)}`)],
  ]) {
    const result = validateEnvText({ contract, target: "home-server-source", text })
    assert.equal(result.ok, false, `${name} Web runtime metrics token must fail before deployment`)
    assert(result.errors.some((error) => error.key === key), JSON.stringify(result.errors))
  }
})

test("home-server-source cursor keyring rejects unsafe rotation states without exposing key material", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const valid = (text) =>
    validateEnvText({ contract, target: "home-server-source", text, nowEpochSeconds: 1_700_000_000 })

  assert.equal(valid(baseHomeServerEnv).ok, true)

  for (const [name, text] of [
    ["missing current version", baseHomeServerEnv.replace(/^PROD___CUSTOM__POST__READ__CURSOR_SIGNING_KEY_VERSION=.*\n/m, "")],
    ["placeholder current key", baseHomeServerEnv.replace(/CURSOR_SIGNING_SECRET=.*/, "CURSOR_SIGNING_SECRET=change_me_cursor_key")],
    ["example.com current key", baseHomeServerEnv.replace(/CURSOR_SIGNING_SECRET=.*/, "CURSOR_SIGNING_SECRET=cursor-signing-secret.example.com")],
    ["current key with edge whitespace", baseHomeServerEnv.replace(/CURSOR_SIGNING_SECRET=.*/, "CURSOR_SIGNING_SECRET= cursor-signing-current-key-abcdefghijklmnopqrstuvwxyz012345 ")],
    ["current version beyond signed long", baseHomeServerEnv.replace(/CURSOR_SIGNING_KEY_VERSION=.*/, "CURSOR_SIGNING_KEY_VERSION=9223372036854775808")],
    [
      "partial previous keyring",
      `${baseHomeServerEnv}\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345`,
    ],
    [
      "same key version",
      `${baseHomeServerEnv}\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION=2\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS=1700003600`,
    ],
    [
      "expired previous key",
      `${baseHomeServerEnv}\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION=1\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS=1700000000`,
    ],
    [
      "previous key beyond cursor maximum age",
      `${baseHomeServerEnv}\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION=1\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS=1700086401`,
    ],
    [
      "previous expiry beyond signed long",
      `${baseHomeServerEnv}\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_SECRET=cursor-signing-previous-key-abcdefghijklmnopqrstuvwxyz012345\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_SIGNING_KEY_VERSION=1\nPROD___CUSTOM__POST__READ__CURSOR_PREVIOUS_EXPIRES_AT_EPOCH_SECONDS=9223372036854775808`,
    ],
  ]) {
    const result = valid(text)
    assert.equal(result.ok, false, name)
    assert.equal(JSON.stringify(result.errors).includes("cursor-signing-current-key"), false, `${name} leaked a key`)
    assert.equal(JSON.stringify(result.errors).includes("cursor-signing-previous-key"), false, `${name} leaked a key`)
  }
})

test("home-server-source requires admin embed origins before SSH deployment", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: baseHomeServerEnv.replace(/^ADMIN_EMBED_ORIGINS=.*(?:\n|$)/m, ""),
  })

  assert.equal(result.ok, false)
  assert(
    result.errors.some((error) => error.key === "ADMIN_EMBED_ORIGINS" && error.message === "is required"),
    result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )
})

test("active product contracts do not retain the unimplemented AI summary seam", () => {
  const activeProductPaths = [
    ".github/workflows/deploy.yml",
    "deploy/env/env.contract.json",
    "deploy/homeserver/.env.prod.example",
    "deploy/homeserver/.env.back.prod.example",
    "back/.env.default",
    "deploy/homeserver/doctor.sh",
    "deploy/homeserver/post_precheck_env_guard.sh",
  ]

  for (const relativePath of activeProductPaths) {
    const source = readFileSync(path.join(repoRoot, relativePath), "utf8")
    if (relativePath === ".github/workflows/deploy.yml") {
      assert.equal((source.match(/CUSTOM__AI__SUMMARY__/g) ?? []).length, 1, relativePath)
      assert.match(source, /sed -E '\/\^\[\[:space:\]\]\*\(export\[\[:space:\]\]\+\)\?CUSTOM__AI__SUMMARY__\[A-Za-z0-9_\]\*\[\[:space:\]\]\*=\/d' "\$\{LOCAL_ENV_FILE\}" > "\$\{LOCAL_ENV_FILE\}\.sanitized"/)
      continue
    }
    assert.doesNotMatch(source, /CUSTOM__AI__SUMMARY|gemini/i, relativePath)
  }
})

test("Caddy access logs skip signup verification endpoint before proxying", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const gates = extractCaddySiteBlock(caddyfile, backendGatesSnippet)
  const matcherIndex = gates.indexOf("@signupVerifySensitive path /member/api/v1/signup/email/verify")
  const skipIndex = gates.indexOf("log_skip @signupVerifySensitive")
  const proxyIndex = gates.lastIndexOf("reverse_proxy {$ADMIN_API_UPSTREAM:back_blue}:8080")

  assert.notEqual(gates, "", "shared backend gate snippet must be extractable")
  assert.notEqual(matcherIndex, -1, "signup verify sensitive matcher must be configured")
  assert.notEqual(skipIndex, -1, "signup verify access log skip must be configured")
  assert(skipIndex > matcherIndex, "signup verify log_skip must reference the sensitive matcher")
  assert(skipIndex < proxyIndex, "signup verify log_skip must be declared before API proxy handling")
  assert(!caddyfile.includes("?token="), "Caddy config must not preserve signup verification token query examples")
  assert(!caddyfile.includes("signup=done&email="), "Caddy config must not preserve signup completion email query examples")
})

test("공개 API 게이트는 두 vhost가 같은 snippet을 공유하고 front 응답에는 닿지 않는다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const gates = extractCaddySiteBlock(caddyfile, backendGatesSnippet)
  const apiBlock = extractCaddySiteBlock(caddyfile, backendVhostMarker)
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")

  assert.notEqual(gates, "", "shared backend gate snippet must exist")
  assert.notEqual(apiBlock, "", "API vhost must be extractable")
  assert.notEqual(webBlock, "", "web vhost must be extractable")

  // 게이트를 vhost마다 복사하면 한쪽에서만 조용히 사라진다. 정의는 snippet 하나뿐이어야 한다.
  for (const gate of [
    "@denyPrometheus",
    "@notificationSse",
    "@publicReadFallback",
    "@adminApi",
    "max_size 100MB",
  ]) {
    assert.equal(
      caddyfile.split(gate).length - 1,
      gates.split(gate).length - 1,
      `${gate} must be declared only inside the shared backend gate snippet`,
    )
  }

  assert.match(apiBlock, /^\s*import backend_edge_gates\s*$/m, "API vhost must import the shared gates")

  // web vhost의 import는 backend prefix handle **안**에 있어야 한다. site level로 올라가면
  // 공유 header 블록이 front 응답까지 덮어 next.config.js가 소유한 헤더와 충돌한다(HR-56).
  const backendHandle = extractCaddySiteBlock(webBlock, "handle @backendApi {")
  assert.notEqual(backendHandle, "", "web vhost must route the backend prefixes through a handle")
  assert.match(backendHandle, /^\s*import backend_edge_gates\s*$/m, "web vhost must import the shared gates")
  assert.equal(
    webBlock.split("import backend_edge_gates").length - 1,
    1,
    "web vhost must import the shared gates exactly once, inside the backend prefix handle",
  )

  const backendPrefixes = webBlock.match(/^\s*@backendApi path (.+)$/m)
  assert(backendPrefixes, "web vhost must declare the backend prefix matcher")
  assert.deepEqual(backendPrefixes[1].trim().split(/\s+/), [
    "/member/*",
    "/post/*",
    "/system/*",
    "/oauth2/*",
    "/login/oauth2/*",
    // 집계 엔드포인트와 개별 probe는 다른 경로다. bare 형태가 빠지면 HARDENING.md가 안내하는
    // `/actuator/health`가 web 호스트에서 front 404로 떨어진다.
    "/actuator/health",
    "/actuator/health/*",
  ])
})

test("edge의 prometheus 차단은 handle이어야 한다 (respond는 catch-all 뒤로 정렬된다)", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const gates = extractCaddySiteBlock(caddyfile, backendGatesSnippet)

  // Caddy 지시자 순서는 respond를 handle보다 뒤에 둔다. 최상위 `respond @denyPrometheus 403`은
  // catch-all backend proxy 뒤로 컴파일돼 실행되지 않는다 — 실측: 변경 전 설정에서
  // `GET /actuator/prometheus`가 403이 아니라 백엔드 응답을 돌려줬다.
  assert.doesNotMatch(gates, /^\s*respond @denyPrometheus\b/m, "denyPrometheus must not be a bare respond")
  assert.match(gates, /@denyPrometheus path \/actuator\/prometheus\s*\n\s*handle @denyPrometheus \{\s*\n\s*respond 403\s*\n\s*\}/)

  const denyIndex = gates.indexOf("handle @denyPrometheus {")
  const catchAllIndex = gates.lastIndexOf("reverse_proxy {$ADMIN_API_UPSTREAM:back_blue}:8080")
  assert(denyIndex !== -1 && denyIndex < catchAllIndex, "deny gate must precede the catch-all backend proxy")
})

test("Caddy routes tokenized cloud external content through public read upstream before admin API", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const sensitiveMatcherIndex = caddyfile.indexOf("@cloudExternalContentSensitive path /system/api/v1/adm/cloud/files/*/external-content")
  const logSkipIndex = caddyfile.indexOf("log_skip @cloudExternalContentSensitive")
  const publicReadMatcherIndex = caddyfile.indexOf("@publicReadFallback")
  const externalContentIndex = caddyfile.indexOf("/system/api/v1/adm/cloud/files/*/external-content", publicReadMatcherIndex)
  const readProxyIndex = caddyfile.indexOf("reverse_proxy {$READ_API_UPSTREAM:back_blue}:8080", publicReadMatcherIndex)
  const adminMatcherIndex = caddyfile.indexOf("@adminApi")

  assert.notEqual(sensitiveMatcherIndex, -1, "cloud external-content sensitive matcher must be configured")
  assert.notEqual(logSkipIndex, -1, "cloud external-content access log skip must be configured")
  assert.notEqual(publicReadMatcherIndex, -1, "public read matcher must be configured")
  assert.notEqual(externalContentIndex, -1, "cloud external-content route must be in the public read matcher")
  assert.notEqual(readProxyIndex, -1, "public read matcher must proxy to READ_API_UPSTREAM")
  assert.notEqual(adminMatcherIndex, -1, "admin API matcher must be configured")
  assert(logSkipIndex > sensitiveMatcherIndex, "cloud external-content log_skip must reference the sensitive matcher")
  assert(logSkipIndex < publicReadMatcherIndex, "cloud external-content log_skip must be declared before routing")
  assert(externalContentIndex < readProxyIndex, "cloud external-content route must be matched before read proxy handling")
  assert(readProxyIndex < adminMatcherIndex, "public read proxy must be declared before admin API matcher")
})

test("backend vhost keeps only the internal entry point after legacy API domain retirement", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const addressLine = caddyfile.split("\n").find((line) => line.startsWith(backendVhostMarker))

  assert(addressLine, "backend vhost address line must exist")
  assert.equal(addressLine, "http://caddy {", addressLine)
  // 접힌 호스트가 주소로 되살아나면 Cloudflare 콘솔에서 지운 hostname이 다시 백엔드를 노출한다.
  assert.doesNotMatch(caddyfile, /\{\$API_DOMAIN\}/, "the retired API host address must not come back")
  // 두 번째 주소는 front 서버 사이드 호출용 컨테이너 내부 진입점이다(#1539). env placeholder면
  // 값이 비는 순간 `http://`로 붕괴해 host matcher 없는 :80 catch-all이 되므로 리터럴만 허용한다.
  const internalAddress = addressLine.replace(/ \{$/, "")
  assert.equal(internalAddress, "http://caddy", addressLine)
  assert.doesNotMatch(internalAddress, /\{\$/, "the internal API address must not be env-interpolated")
  // 공개 호스트를 내부 주소로 쓰면 front 호출이 공개 인터넷을 왕복한다.
  assert.doesNotMatch(internalAddress, /\./, "the internal API address must not be a public hostname")
})

// front SSR과 /api/backend/* 프록시는 BACKEND_INTERNAL_URL 하나로 backend를 부른다. 그 값이
// 특정 색깔이면 backend blue/green 전환마다 깨지고, back_read/back_admin이면 런타임 모드 밖의
// 요청이 503이 된다(ApiRuntimeBoundaryFilter). 유일하게 성립하는 값은 라우트 분리를 소유한
// Caddy 내부 주소이며, 계약과 배포가 그 값을 함께 고정한다.
test("BACKEND_INTERNAL_URL은 색깔에 묶이지 않는 Caddy 내부 주소로 고정된다", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const definition = contract.targets["home-server-source"].keys.find((key) => key.name === "BACKEND_INTERNAL_URL")

  assert(definition, "BACKEND_INTERNAL_URL must be declared")
  assert.deepEqual(definition.allowedValues, ["http://caddy"])

  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const addressLine = caddyfile.split("\n").find((line) => line.startsWith(backendVhostMarker))
  assert(addressLine.includes("http://caddy"), "the contract value must be an address the backend vhost answers")

  // 배포가 같은 값을 .env.prod에 핀한다. 오너 시크릿에 남은 옛 색깔 값이 그대로 살아남으면
  // front는 healthy를 보고하면서 프록시만 죽는다.
  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /upsert_env_key "BACKEND_INTERNAL_URL" "http:\/\/caddy"/)

  // 색깔 URL은 계약 단계에서 막힌다.
  const example = readFileSync(envExamplePath, "utf8")
  assert.match(example, /^BACKEND_INTERNAL_URL=http:\/\/caddy$/m)
  assert.doesNotMatch(example, /BACKEND_INTERNAL_URL=http:\/\/back[-_](blue|green|read|admin)/)
})

test("legacy API domain is absent from active environment, runtime, and deploy surfaces", () => {
  const activePaths = [
    contractPath,
    envExamplePath,
    caddyfilePath,
    path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"),
    doctorScriptPath,
  ]
  for (const activePath of activePaths) {
    assert.doesNotMatch(readFileSync(activePath, "utf8"), new RegExp(retiredLegacyApiDomain), activePath)
  }

  const workflow = readFileSync(workflowPath, "utf8")
  const copyIndex = workflow.indexOf('printf \'%s\\n\' "${HOME_SERVER_ENV}" > deploy/homeserver/.env.prod')
  const deletionIndex = workflow.indexOf(`remove_env_key "${retiredLegacyApiDomain}" "deploy/homeserver/.env.prod"`)
  assert(copyIndex !== -1, "HOME_SERVER_ENV must be copied to the deploy env file")
  assert(deletionIndex > copyIndex, "the retired key must be deleted after HOME_SERVER_ENV is copied")
})

test("a required key that is present but empty is still rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // 회귀 가드. required 키는 falsy continue 이전에 잡히므로 present-but-empty가 통과하지 않는다.
  // 이게 무너지면 빈 MONITOR_DOMAIN이 Caddy vhost를 host matcher 없는 catch-all로 만든다.
  for (const key of ["MONITOR_DOMAIN", "ADMIN_EMBED_ORIGINS", "CUSTOM_PROD_COOKIEDOMAIN"]) {
    const text = withEnvKeys(baseHomeServerEnv, [[key, ""]])
    const result = validateEnvText({ contract, target: "home-server-source", text })

    assert.equal(result.ok, false, `${key} must not pass when present but empty`)
    assert(result.errors.some((error) => error.key === key))
  }
})

test("every declared key with a value shape rejects a present-but-empty value", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const keys = contract.targets["home-server-source"].keys

  // present-but-empty와 absent는 다르다. Caddy의 {$VAR:default}는 unset일 때만 기본값을 쓰므로
  // 빈 값은 기본값도 못 받고 설정을 무너뜨린다(vhost 소멸 / :80 catch-all / upstream 파손).
  // 이 규칙은 계약 층이라, 새로 선언되는 Caddy 보간 키도 자동으로 덮인다.
  const shaped = keys.filter(
    (key) => !key.requiredWhen && (key.kind !== undefined || key.allowedValues || key.minLength),
  )
  assert(shaped.length > 0)

  for (const key of shaped) {
    const text = `${baseHomeServerEnv}\n${key.name}=`
    const result = validateEnvText({ contract, target: "home-server-source", text })

    assert.equal(result.ok, false, `${key.name} must not pass when present but empty`)
    assert(result.errors.some((error) => error.key === key.name), `${key.name} must be named in the error`)
  }
})

test("keys where an empty value is never meaningful reject it even before their requiredWhen gate opens", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // requiredWhen 예외는 "기능 꺼짐"을 뜻하는 빈 값(SMTP auth 등)을 위한 것이다.
  // WEB_DOMAIN·BACKEND_INTERNAL_URL은 빈 값이 어떤 상태도 뜻하지 않는다 - Caddy web vhost가
  // web.localhost로 내려앉거나 SSR이 500난다.
  for (const key of ["WEB_DOMAIN", "BACKEND_INTERNAL_URL"]) {
    const text = withEnvKeys(baseHomeServerEnv, [
      ["WEB_DOMAIN", key === "WEB_DOMAIN" ? "" : "blog.aquilaxk.site"],
      ...(key === "BACKEND_INTERNAL_URL" ? [["BACKEND_INTERNAL_URL", ""]] : []),
    ])
    const result = validateEnvText({ contract, target: "home-server-source", text })

    assert.equal(result.ok, false, `${key} must reject an empty value`)
    assert(result.errors.some((error) => error.key === key), `${key} must be named in the error`)
  }
})

test("an absent optional key stays valid", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // 줄 자체가 없는 것은 정상 사용이다. 빈 값 규칙이 이걸 깨면 안 된다.
  const absent = baseHomeServerEnv.replace(/^CUSTOM__REVALIDATE__URL=.*$\n?/m, "")
  const absentResult = validateEnvText({ contract, target: "home-server-source", text: absent })
  assert.equal(absentResult.ok, true, absentResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))

})


test("edge에는 CORS가 없다 - 공개 API가 web 호스트의 경로이기 때문이다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")

  // #1575가 공개 API를 web 호스트의 경로로 옮기면서 브라우저 요청은 전부 same-origin이 됐고,
  // #1596이 CORS가 필요했던 마지막 주소(구 API 호스트)를 접었다. 남은 주소는 컨테이너 내부
  // 진입점과 host 이전 창 전용 슬롯뿐이라 어떤 브라우저 origin도 여기에 도달하지 않는다.
  // 되살아나면 edge가 받아 주는 origin 집합만 넓어진다.
  for (const directive of [
    "Access-Control-Allow-Origin",
    "Access-Control-Allow-Credentials",
    "Access-Control-Allow-Methods",
    "Access-Control-Allow-Headers",
    "Access-Control-Expose-Headers",
    "header_regexp Origin",
  ]) {
    assert(!caddyfile.includes(directive), `the edge must not declare ${directive} on a same-origin surface`)
  }
})

test("Caddy request_header hop deletions use single-line syntax", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const capture = extractCaddySiteBlock(caddyfile, clientIpCaptureSnippet)

  assert.notEqual(capture, "", "shared client IP capture snippet must be extractable")
  // request_header does not support block form; `{` after the directive fails caddy adapt.
  assert.doesNotMatch(capture, /request_header\s*\{/)
  assert.match(capture, /^\s*request_header -X-Forwarded-For\s*$/m)
  assert.match(capture, /^\s*request_header -CF-Connecting-IP\s*$/m)
  assert.match(capture, /^\s*request_header -True-Client-IP\s*$/m)
  assert.match(capture, /^\s*request_header -X-Real-IP\s*$/m)
})

test("CF-Connecting-IP는 Cloudflare가 쓴 주소에서만 신뢰되고 컨테이너 내부 진입점에서는 버려진다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const capture = extractCaddySiteBlock(caddyfile, clientIpCaptureSnippet)
  const apiBlock = extractCaddySiteBlock(caddyfile, backendVhostMarker)
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")

  assert.notEqual(capture, "", "shared client IP capture snippet must exist")

  // 두 vhost가 각자 캡처를 복사하면 한쪽만 신뢰 경계를 잃는다. 정의는 snippet 하나뿐이어야 한다.
  assert.equal(
    caddyfile.split("trusted_client_ip {http.request.header.CF-Connecting-IP}").length - 1,
    1,
    "CF-Connecting-IP must be captured in exactly one place",
  )
  for (const block of [apiBlock, webBlock]) {
    assert.match(block, /^\s*import edge_client_ip_capture\s*$/m)
    assert.doesNotMatch(block, /trusted_client_ip \{http\.request\.header/)
  }

  // 내부 site address(`http://caddy`, #1539)는 compose 네트워크의 아무 컨테이너나 도달할 수 있다.
  // 거기서 CF-Connecting-IP는 호출자가 쓰는 값이라, 그대로 믿으면 audit log와 rate-limit 버킷에
  // 남는 client IP를 내부 호출자가 위조할 수 있다. 실측: `Host: caddy`로 보낸 위조 헤더는
  // upstream에 도달하지 않고 peer 주소로 대체된다.
  assert.match(capture, /@internalEntry host caddy/)
  assert.match(capture, /@cloudflareEdge not host caddy/)
  assert.match(capture, /vars @cloudflareEdge trusted_client_ip \{http\.request\.header\.CF-Connecting-IP\}/)
  assert.match(capture, /vars @internalEntry trusted_client_ip \{remote_host\}/)
})

test("backend 전용 vhost의 edge 게이트는 그 vhost의 모든 주소에 적용된다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apiBlock = extractCaddySiteBlock(caddyfile, backendVhostMarker)

  // 게이트 import가 특정 주소로 좁혀지면(예: 공개 호스트 matcher 안으로) 내부 진입점만
  // read/admin upstream 분리와 prometheus 차단 없이 백엔드에 닿는다. site level이어야 한다.
  const gateImportLine = apiBlock.split("\n").find((line) => line.includes("import backend_edge_gates"))
  assert(gateImportLine, "backend vhost must import the shared gates")
  assert.equal(gateImportLine, "  import backend_edge_gates", gateImportLine)
  assert.doesNotMatch(apiBlock, /handle @[A-Za-z]+ \{\s*\n\s*import backend_edge_gates/)
})

test("web vhost의 backend prefix 목록이 백엔드 라우트 표면과 어긋나지 않는다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")
  const routedMatch = webBlock.match(/^\s*@backendApi path (.+)$/m)
  assert(routedMatch, "web vhost must declare the @backendApi prefix matcher")
  const routed = routedMatch[1].trim().split(/\s+/)

  // @publicReadFallback은 SoT 파생 drift guard가 있지만 이 prefix 목록은 리터럴이다. 백엔드에
  // 새 최상위 prefix가 생기면 여기 추가되지 않고, 공개 web 호스트에서 그 API 전체가 front
  // 404가 된다 - 배포는 green이다. 그래서 어노테이션 표면과 대조한다.
  //
  // 목록 전체를 파생시키지는 않는다: `/oauth2/*`·`/login/oauth2/*`·`/actuator/health*`는 우리
  // 어노테이션이 아니라 Spring이 소유하는 경로이고, `/`·`/session`은 의도적 제외다. 반쯤 파생된
  // 표는 "전부 검증됐다"는 잘못된 확신을 준다. 대조 대상은 우리가 소유한 부분으로 한정한다.
  const backendMainDir = path.join(repoRoot, "back/src/main/kotlin")
  const kotlinFiles = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".kt")) kotlinFiles.push(full)
    }
  }
  walk(backendMainDir)

  const classPrefixes = new Set()
  for (const file of kotlinFiles) {
    for (const match of readFileSync(file, "utf8").matchAll(/@RequestMapping\("(\/[^"]*)"/g)) {
      classPrefixes.add(`/${match[1].split("/").filter(Boolean)[0] ?? ""}`)
    }
  }
  assert(classPrefixes.size > 0, "backend class-level @RequestMapping prefixes must be discoverable")

  // 공개 라우팅에서 뺀 것과 그 이유. 여기 없는 새 prefix는 반드시 라우팅돼야 한다.
  const deliberatelyUnrouted = new Set([
    // front가 쓰지 않는다(front는 /member/api/v1/auth/session 사용). `/`는 사이트 자신이다.
    "/",
    "/session",
  ])

  for (const prefix of classPrefixes) {
    if (deliberatelyUnrouted.has(prefix)) continue
    assert(
      routed.includes(`${prefix}/*`),
      `backend prefix ${prefix} is not routed on the public web host (add it to @backendApi or document the exclusion)`,
    )
  }

  // Spring 소유 경로는 어노테이션에서 안 나온다. 리터럴로 고정한다.
  for (const frameworkPath of ["/oauth2/*", "/login/oauth2/*", "/actuator/health", "/actuator/health/*"]) {
    assert(routed.includes(frameworkPath), `${frameworkPath} must stay routed to the backend`)
  }
})

test("컨테이너 내부 진입점은 backend 전용 vhost에 있어 front로 되돌아가는 루프가 불가능하다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apiBlock = extractCaddySiteBlock(caddyfile, backendVhostMarker)
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")

  // front 서버 사이드는 BACKEND_INTERNAL_URL=http://caddy로 백엔드를 부른다(#1539). 그 주소가
  // front upstream을 가진 vhost로 옮겨가면 front -> caddy -> front 무한 루프가 된다.
  const apiAddressLine = caddyfile.split("\n").find((line) => line.startsWith(backendVhostMarker))
  assert(apiAddressLine, "backend vhost address line must exist")
  assert.equal(apiAddressLine, "http://caddy {", apiAddressLine)

  assert.doesNotMatch(apiBlock, /reverse_proxy [^\n]*:3000/, "the internal entry point vhost must have no front upstream")
  assert.doesNotMatch(webBlock, /^\s*http:\/\/caddy/m, "the internal entry point must not move onto the web vhost")

  // front cutover 게이트의 프록시 probe가 타는 경로다: front proxy -> http://caddy ->
  // @publicReadFallback -> READ_API_UPSTREAM. 이 경로가 끊기면 front 배포가 막힌다.
  const gates = extractCaddySiteBlock(caddyfile, backendGatesSnippet)
  const readMatcher = gates.slice(gates.indexOf("@publicReadFallback"), gates.indexOf("handle @publicReadFallback"))
  assert(readMatcher.includes("/post/api/v1/posts/tags"), "front cutover proxy probe path must stay on the read upstream")

  const deployScript = readFileSync(deployScriptPath, "utf8")
  assert.match(deployScript, /FRONT_BACKEND_PROXY_PATH="\$\{FRONT_BACKEND_PROXY_PATH:-\/api\/backend\/post\/api\/v1\/posts\/tags\}"/)
})

test("Caddy access logs skip sensitive query routes before proxying", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const gates = extractCaddySiteBlock(caddyfile, backendGatesSnippet)
  const adminHandleIndex = gates.indexOf("handle @adminApi {")
  const publicReadHandleIndex = gates.indexOf("handle @publicReadFallback {")
  const sensitiveRoutes = [
    ["@oauthCallbackSensitive", "path /login/oauth2/code/*"],
    ["@socialSignupSensitive", "path /member/api/v1/signup/social/pending /member/api/v1/signup/social/complete"],
    ["@accountDeletionSensitive", "path /member/api/v1/privacy/account"],
    ["@publicSearchSensitive", "path /post/api/v1/posts/search"],
  ]

  assert.notEqual(gates, "", "shared backend gate snippet must be configured")
  assert.notEqual(adminHandleIndex, -1, "admin API handle must be configured")
  assert.notEqual(publicReadHandleIndex, -1, "public read handle must be configured")

  for (const [matcherName, pathMatcher] of sensitiveRoutes) {
    const matcherIndex = gates.indexOf(`${matcherName} ${pathMatcher}`)
    const skipIndex = gates.indexOf(`log_skip ${matcherName}`)

    assert.notEqual(matcherIndex, -1, `${matcherName} matcher must be configured`)
    assert.notEqual(skipIndex, -1, `${matcherName} access log skip must be configured`)
    assert(skipIndex > matcherIndex, `${matcherName} log_skip must reference the sensitive matcher`)
    assert(skipIndex < adminHandleIndex, `${matcherName} log_skip must be declared before admin API handling`)
    assert(skipIndex < publicReadHandleIndex, `${matcherName} log_skip must be declared before public read handling`)
  }
})

test("home-server-source contract allows no-auth operations alert SMTP relay", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const noAuthEnv = baseHomeServerEnv
    .split("\n")
    .filter((line) => !line.startsWith("ALERTMANAGER_SMTP_AUTH_USERNAME="))
    .filter((line) => !line.startsWith("ALERTMANAGER_SMTP_AUTH_PASSWORD="))
    .map((line) => {
      return line === "ALERTMANAGER_SMTP_AUTH_ENABLED=true" ? "ALERTMANAGER_SMTP_AUTH_ENABLED=false" : line
    })
    .join("\n")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: noAuthEnv,
  })

  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
})

test("grafana admin password has no compose fallback and rejects weak contract values", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const compose = readFileSync(composePath, "utf8")
  const contract = loadContract(contractPath)
  const assertGrafanaPasswordRejected = (text, expectedMessagePart) => {
    const result = validateEnvText({
      contract,
      target: "home-server-source",
      text,
    })

    assert.equal(result.ok, false)
    assert(
      result.errors.some(
        (error) => error.key === "GRAFANA_ADMIN_PASSWORD" && error.message.includes(expectedMessagePart),
      ),
      result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
    )
  }

  assert.match(
    compose,
    /GF_SECURITY_ADMIN_PASSWORD:\s+\$\{GRAFANA_ADMIN_PASSWORD:\?GRAFANA_ADMIN_PASSWORD is required\}/,
  )
  assert(!compose.includes("change_me_grafana_password"))
  assert(!compose.includes("${GRAFANA_ADMIN_PASSWORD:-"))
  assertGrafanaPasswordRejected(
    baseHomeServerEnv.replace("GRAFANA_ADMIN_PASSWORD=valid-grafana-password", "GRAFANA_ADMIN_PASSWORD=change_me_grafana_password"),
    "forbidden value",
  )
  assertGrafanaPasswordRejected(
    baseHomeServerEnv.replace("GRAFANA_ADMIN_PASSWORD=valid-grafana-password", "GRAFANA_ADMIN_PASSWORD=123456789012345"),
    "at least 16 characters",
  )
  assertGrafanaPasswordRejected(
    baseHomeServerEnv
      .replace("GRAFANA_ADMIN_USER=admin", "GRAFANA_ADMIN_USER=grafana-operator")
      .replace("GRAFANA_ADMIN_PASSWORD=valid-grafana-password", "GRAFANA_ADMIN_PASSWORD=grafana-operator"),
    "must differ from GRAFANA_ADMIN_USER",
  )
})

test("homeserver monitoring runtime files stay readable by container users", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const steadyStateGuard = readFileSync(path.join(repoRoot, "deploy/homeserver/steady_state_guard.sh"), "utf8")
  const compose = readFileSync(composePath, "utf8")
  const grafanaProvisioningDir = path.join(repoRoot, "deploy/homeserver/monitoring/grafana/provisioning")

  assert.doesNotMatch(compose, /--config\.expand-env/)
  assert.equal(existsSync(path.join(grafanaProvisioningDir, "alerting")), true)
  assert.equal(existsSync(path.join(grafanaProvisioningDir, "plugins")), true)
  assert.match(workflow, /ensure_monitoring_bind_mount_permissions/)
  assert.match(workflow, /find deploy\/homeserver\/monitoring -type d -exec chmod 0755/)
  assert.match(workflow, /find deploy\/homeserver\/monitoring -type f -exec chmod 0644/)
  assert.match(deployScript, /ensure_monitoring_bind_mount_permissions\(\)/)
  assert.match(steadyStateGuard, /ensure_monitoring_bind_mount_permissions\(\)/)
  assert.match(deployScript, /find "\$\{SCRIPT_DIR\}\/monitoring" -type d -exec chmod 0755/)
  assert.match(steadyStateGuard, /find "\$\{SCRIPT_DIR\}\/monitoring" -type d -exec chmod 0755/)
  assert.match(deployScript, /find "\$\{SCRIPT_DIR\}\/monitoring" -type f -exec chmod 0644/)
  assert.match(steadyStateGuard, /find "\$\{SCRIPT_DIR\}\/monitoring" -type f -exec chmod 0644/)
  const monitoringBootArray = deployScript.match(/monitoring_services_to_boot=\(([^)]*)\)/)
  assert(monitoringBootArray, "monitoring boot services must be declared as a shared array")
  const monitoringBootServices = monitoringBootArray[1].split(/\s+/).filter(Boolean)
  for (const service of [
    "alertmanager",
    "loki",
    "promtail",
    "prometheus",
    "grafana",
    "public_edge_probe",
    "docker_runtime_probe",
    "postgres_exporter",
  ]) {
    assert(monitoringBootServices.includes(service), `${service} must boot with the monitoring services`)
  }
  assert.match(deployScript, /compose_up_force_recreate_no_deps_with_retry\s+"\$\{monitoring_services_to_boot\[@\]\}"/)
  assert.match(deployScript, /compose up -d --force-recreate --no-deps/)
  assert.match(deployScript, /grafana cli admin reset-admin-password "\$\{grafana_password\}"/)
  assert.match(steadyStateGuard, /grafana cli admin reset-admin-password "\$\{grafana_password\}"/)
})

test("provisioned Grafana dashboard files have dashboard titles", () => {
  const dashboardsDir = path.join(repoRoot, "deploy/homeserver/monitoring/grafana/dashboards")
  const dashboardFiles = readdirSync(dashboardsDir).filter((fileName) => fileName.endsWith(".json"))

  assert.notEqual(dashboardFiles.length, 0)
  for (const fileName of dashboardFiles) {
    const dashboard = JSON.parse(readFileSync(path.join(dashboardsDir, fileName), "utf8"))

    assert.equal(typeof dashboard.title, "string", `${fileName} must define a Grafana dashboard title`)
    assert.notEqual(dashboard.title.trim(), "", `${fileName} must not define an empty Grafana dashboard title`)
  }
})

test("Prometheus basic auth has no Caddy fallback and rejects known weak values", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const envExample = readFileSync(envExamplePath, "utf8")
  const contract = loadContract(contractPath)
  const assertPrometheusAuthRejected = (text, key, expectedMessagePart) => {
    const result = validateEnvText({
      contract,
      target: "home-server-source",
      text,
    })

    assert.equal(result.ok, false)
    assert(
      result.errors.some((error) => error.key === key && error.message.includes(expectedMessagePart)),
      result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
    )
  }

  assert.match(caddyfile, /\{\$PROMETHEUS_BASIC_AUTH_USER\} \{\$PROMETHEUS_BASIC_AUTH_HASH\}/)
  assert(!caddyfile.includes("PROMETHEUS_BASIC_AUTH_USER:promviewer"))
  assert(!caddyfile.includes("PROMETHEUS_BASIC_AUTH_HASH:$2y$05$g4sdUn"))
  assert.match(envExample, /caddy hash-password --plaintext/)
  assert.match(envExample, /Wrap the generated hash in single quotes/)
  assert.match(envExample, /escape every "\$" as "\$\$"/)
  assert(!envExample.includes("exactly as printed"))
  assert(!envExample.includes("PROMETHEUS_BASIC_AUTH_USER=promviewer"))
  assert(!envExample.includes("g4sdUn.YYoUOjAy"))
  assertPrometheusAuthRejected(
    baseHomeServerEnv.replace("PROMETHEUS_BASIC_AUTH_USER=prometheus-operator", "PROMETHEUS_BASIC_AUTH_USER=promviewer"),
    "PROMETHEUS_BASIC_AUTH_USER",
    "forbidden value",
  )
  assertPrometheusAuthRejected(
    baseHomeServerEnv.replace(
      "PROMETHEUS_BASIC_AUTH_USER=prometheus-operator",
      "PROMETHEUS_BASIC_AUTH_USER=change_me_prometheus_user",
    ),
    "PROMETHEUS_BASIC_AUTH_USER",
    "placeholder value",
  )
  assertPrometheusAuthRejected(
    baseHomeServerEnv.replace(
      "PROMETHEUS_BASIC_AUTH_HASH=$$2y$$05$$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVabcdefghi",
      [
        "PROMETHEUS_BASIC_AUTH_HASH=$$2y$$05$$",
        "g4sdUn.YYoUOjAy/41KhSOBCQvOnwTNJ/",
        "jmdl/95o8YKEoq/gddPC",
      ].join(""),
    ),
    "PROMETHEUS_BASIC_AUTH_HASH",
    "forbidden fingerprint",
  )
  assertPrometheusAuthRejected(
    baseHomeServerEnv.replace(
      "PROMETHEUS_BASIC_AUTH_HASH=$$2y$$05$$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVabcdefghi",
      "PROMETHEUS_BASIC_AUTH_HASH=short-hash",
    ),
    "PROMETHEUS_BASIC_AUTH_HASH",
    "at least 50 characters",
  )
})

const runtimeBackendImageKeys = [
  "BACK_BLUE_IMAGE",
  "BACK_GREEN_IMAGE",
  "BACK_READ_IMAGE",
  "BACK_ADMIN_IMAGE",
  "BACK_WORKER_IMAGE",
]

const runtimeFrontImageKeys = ["FRONT_BLUE_IMAGE", "FRONT_GREEN_IMAGE"]

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
    "DOCKER_SOCKET_PROXY_IMAGE",
    "CADDY_IMAGE",
    "UPTIME_KUMA_IMAGE",
    "PROMETHEUS_IMAGE",
    "ALERTMANAGER_IMAGE",
    "POSTGRES_EXPORTER_IMAGE",
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
    ["AUTOHEAL_IMAGE", "willfarrell/autoheal:latest"],
    ["DOCKER_SOCKET_PROXY_IMAGE", "tecnativa/docker-socket-proxy:0.3.0"],
    ["CADDY_IMAGE", "caddy:2.8-alpine"],
    ["UPTIME_KUMA_IMAGE", "louislam/uptime-kuma:1"],
    ["PROMETHEUS_IMAGE", "prom/prometheus:v2.54.1"],
    ["ALERTMANAGER_IMAGE", "prom/alertmanager:v0.27.0"],
    ["POSTGRES_EXPORTER_IMAGE", "quay.io/prometheuscommunity/postgres-exporter:v0.20.1"],
    ["GRAFANA_IMAGE", "grafana/grafana:11.2.2"],
    ["LOKI_IMAGE", "grafana/loki:3.0.0"],
    ["PROMTAIL_IMAGE", "grafana/promtail:3.0.0"],
    ["NODE_RUNTIME_IMAGE", "node:20-alpine"],
    ["DB_IMAGE", "jangka512/pgj:latest"],
    ["REDIS_IMAGE", "redis:7-alpine"],
  ]

  for (const [key, image] of runtimeImageDefaults) {
    const escapedImage = image.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    assert.match(
      externalBackupScript,
      new RegExp(`ensure_image_env_key_from_local_digest "${key}" "${escapedImage}"`),
    )
  }

  assert.doesNotMatch(
    externalBackupScript,
    /ensure_image_env_key_from_local_digest "MINIO_IMAGE"/,
    "external backup must not synthesize a mutable MinIO image when MINIO_IMAGE is absent",
  )
  assert.match(
    externalBackupScript,
    /require_digest_image_env_key "MINIO_IMAGE"/,
    "external backup must require the source-owned immutable MinIO image",
  )

  const imageGuardBody = externalBackupScript.slice(
    externalBackupScript.indexOf("ensure_image_env_key_from_local_digest() {"),
    externalBackupScript.indexOf("ensure_compose_image_env_defaults() {"),
  )
  const pullFallbackBody = externalBackupScript.slice(
    externalBackupScript.indexOf("resolve_repo_digest_with_pull_fallback() {"),
    externalBackupScript.indexOf("ensure_image_env_key_from_local_digest() {"),
  )
  const stageHomeServerEnvKeyBody = externalBackupScript.slice(
    externalBackupScript.indexOf("stage_home_server_env_key() {"),
    externalBackupScript.indexOf("stage_home_server_env_compose_values() {"),
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
  assert.match(externalBackupScript, /compose_env_quote_value\(\) \{/)
  assert.match(externalBackupScript, /upsert_env_key_compose_quoted\(\) \{/)
  assert.match(stageHomeServerEnvKeyBody, /upsert_env_key_compose_quoted "\$\{key\}" "\$\{value\}"/)
  assert.match(externalBackupScript, /stage_home_server_env_compose_values\(\) \{/)
  assert.match(externalBackupScript, /stage_home_server_env_key "OPERATIONS_ALERT_EMAIL_TO"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "ALERTMANAGER_SMTP_AUTH_USERNAME"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "ALERTMANAGER_SMTP_AUTH_PASSWORD"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "PROD___POSTGRES_EXPORTER__PASSWORD"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "PROD___POSTGRES_EXPORTER__USERNAME"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_BLUE"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_GREEN"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "CUSTOM__RUNTIME__API_MODE_WORKER"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "SPRING__MAIL__PROPERTIES__MAIL__SMTP__STARTTLS__ENABLE"/)
  assert.match(externalBackupScript, /stage_home_server_env_key "WEB_METRICS_TOKEN"/)

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
  const stageHomeServerEnvIndex = composeReadyBody.indexOf("\n  stage_home_server_env_compose_values\n")
  const validateComposeIndex = composeReadyBody.indexOf("\n  validate_compose_config_after_env_autofill\n")
  const skipMarkerIndex = preparePostgresBody.indexOf('if [[ "${AQUILA_BACKUP_SKIP_POSTGRES:-false}" == "true" ]]')
  const prepareComposeReadyCallIndex = preparePostgresBody.indexOf("\n  ensure_backup_compose_ready\n")
  const prepareCallIndex = backupPostgresBody.indexOf("\n  prepare_postgres_backup_compose_if_needed\n")
  const composeExecIndex = backupPostgresBody.indexOf("\n  compose exec -T db_1")
  const loopPrepareIndex = backupLoopBody.indexOf("\n  prepare_postgres_backup_compose_if_needed\n")
  const loopCopyIndex = backupLoopBody.indexOf("\n  copy_deploy_config")
  assert(ensureCallIndex > -1, "create_external_backup.sh must call image env auto-fill")
  assert(stageHomeServerEnvIndex > -1, "create_external_backup.sh must stage HOME_SERVER_ENV compose values")
  assert(validateComposeIndex > -1, "create_external_backup.sh must validate compose after image env auto-fill")
  assert(skipMarkerIndex > -1, "PostgreSQL backup skip path must remain explicit")
  assert(prepareComposeReadyCallIndex > -1, "PostgreSQL compose preparation must call compose preflight")
  assert(prepareCallIndex > -1, "PostgreSQL backup must prepare compose before compose exec")
  assert(composeExecIndex > -1, "PostgreSQL backup must keep compose exec")
  assert(loopPrepareIndex > -1, "backup loop must prepare compose before copying deploy config")
  assert(loopCopyIndex > -1, "backup loop must copy deploy config")
  assert(ensureCallIndex < validateComposeIndex, "compose validation must run after image env auto-fill")
  assert(stageHomeServerEnvIndex < validateComposeIndex, "HOME_SERVER_ENV compose values must be staged before compose validation")
  assert(skipMarkerIndex < prepareComposeReadyCallIndex, "compose preflight must not run before skipped PostgreSQL backups")
  assert(prepareCallIndex < composeExecIndex, "compose preflight must run before backup compose calls")
  assert(loopPrepareIndex < loopCopyIndex, "compose env failures must be detected before copying deploy config")
  assert.doesNotMatch(
    copyDeployConfigBody,
    /cp "\$\{COMPOSE_ENV_FILE\}" "\$\{target_dir\}\/\.env\.prod\.compose"/,
  )
  assert.match(externalBackupScript, /secret_files_copied=false/)
})

test("external backup stages HOME_SERVER_ENV values with compose-safe quoting", () => {
  const externalBackupScript = readFileSync(externalBackupScriptPath, "utf8")
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-compose-env-"))
  const envFile = path.join(workDir, ".env.prod")
  const webMetricsToken = `test-web-metrics-${"m".repeat(32)}`
  writeFileSync(envFile, "ALERTMANAGER_SMTP_AUTH_PASSWORD='stale'\n")

  try {
    const functionSnippet = externalBackupScript.slice(
      externalBackupScript.indexOf("read_key_from_text() {"),
      externalBackupScript.indexOf("stage_backend_runtime_image_env_key() {"),
    )
    const output = execFileSync(
      "bash",
      [
        "-lc",
        `
set -euo pipefail
ENV_FILE="${envFile}"
COMPOSE_ENV_FILE="${envFile}"
COMPOSE_ENV_FILE_TMP=""
fail() { printf '%s\\n' "$*" >&2; exit 1; }
${functionSnippet}
stage_home_server_env_compose_values
cat "$COMPOSE_ENV_FILE"
rm -f -- "$COMPOSE_ENV_FILE_TMP" "$COMPOSE_ENV_FILE_TMP.tmp"
`,
      ],
      {
        encoding: "utf8",
        env: {
          ...process.env,
          HOME_SERVER_ENV: [
            "PROD___POSTGRES__PASSWORD=pa$word",
            "GRAFANA_ADMIN_PASSWORD=let's$secret\\path",
            "ALERTMANAGER_SMTP_AUTH_PASSWORD=",
            `WEB_METRICS_TOKEN=${webMetricsToken}`,
          ].join("\n"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    assert.match(output, /^PROD___POSTGRES__PASSWORD='pa\$word'$/m)
    assert.match(output, /^GRAFANA_ADMIN_PASSWORD='let\\'s\$secret\\path'$/m)
    assert.match(output, /^ALERTMANAGER_SMTP_AUTH_PASSWORD=''$/m)
    assert.match(output, new RegExp(`^WEB_METRICS_TOKEN='${webMetricsToken}'$`, "m"))
    assert.doesNotMatch(output, /ALERTMANAGER_SMTP_AUTH_PASSWORD='stale'/)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
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
  assert(keys.has("AQUILA_BACKUP_ENCRYPTION_KEY_FILE"))
  assert(keys.has("AQUILA_RESTORE_PRIVACY_GATE_SCRIPT"))
})

test("restore privacy gate script is required for home-server source env", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: baseHomeServerEnv.replace(/^AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=.*(?:\n|$)/m, ""),
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT"))
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
    .replace("CUSTOM_STORAGE_MAXFILESIZEBYTES=99614720", "CUSTOM_STORAGE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=99614720", "CUSTOM_STORAGE_CLOUD_DOCUMENT_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=52428800", "CUSTOM_STORAGE_CLOUD_PHOTO_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=99614720", "CUSTOM_STORAGE_CLOUD_ARCHIVE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=99614720", "CUSTOM_STORAGE_CLOUD_VIDEO_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=5368709120", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_MAXFILESIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=67108864", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_PARTSIZEBYTES=0")
    .replace("CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=86400", "CUSTOM_STORAGE_CLOUD_VIDEO_RESUMABLE_EXPIRESSECONDS=0")

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
  const keyInsideBackupRoot = baseHomeServerEnv.replace(
    "AQUILA_BACKUP_ENCRYPTION_KEY_FILE=/mnt/aquila-blog-data/backup-encryption.key",
    "AQUILA_BACKUP_ENCRYPTION_KEY_FILE=/mnt/aquila-blog-data/backups/backup-encryption.key",
  )
  const withoutBackupRoot = baseHomeServerEnv.replace(/^AQUILA_BACKUP_ROOT=.*(?:\n|$)/m, "")
  const keyInsideDefaultBackupRoot = withoutBackupRoot.replace(
    "AQUILA_BACKUP_ENCRYPTION_KEY_FILE=/mnt/aquila-blog-data/backup-encryption.key",
    "AQUILA_BACKUP_ENCRYPTION_KEY_FILE=/mnt/aquila-blog-data/backups/backup-encryption.key",
  )
  const privacyGateInsideBackupRoot = baseHomeServerEnv.replace(
    "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=/opt/aquila-blog/restore-privacy-gate.sh",
    "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=/mnt/aquila-blog-data/backups/restore-privacy-gate.sh",
  )
  const privacyGateInsideDefaultBackupRoot = withoutBackupRoot.replace(
    "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=/opt/aquila-blog/restore-privacy-gate.sh",
    "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=/mnt/aquila-blog-data/backups/restore-privacy-gate.sh",
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
  const keyInsideBackupRootResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: keyInsideBackupRoot,
  })
  const keyInsideDefaultBackupRootResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: keyInsideDefaultBackupRoot,
  })
  const privacyGateInsideBackupRootResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: privacyGateInsideBackupRoot,
  })
  const privacyGateInsideDefaultBackupRootResult = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: privacyGateInsideDefaultBackupRoot,
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
  assert.equal(keyInsideBackupRootResult.ok, false)
  assert(keyInsideBackupRootResult.errors.some((error) => error.key === "AQUILA_BACKUP_ENCRYPTION_KEY_FILE"))
  assert.equal(keyInsideDefaultBackupRootResult.ok, false)
  assert(keyInsideDefaultBackupRootResult.errors.some((error) => error.key === "AQUILA_BACKUP_ENCRYPTION_KEY_FILE"))
  assert.equal(privacyGateInsideBackupRootResult.ok, false)
  assert(privacyGateInsideBackupRootResult.errors.some((error) => error.key === "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT"))
  assert.equal(privacyGateInsideDefaultBackupRootResult.ok, false)
  assert(privacyGateInsideDefaultBackupRootResult.errors.some((error) => error.key === "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT"))
})

const PRE_TRANSITION_DOMAIN_ENV = [
  ["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"],
  ["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"],
  ["CUSTOM_PROD_BACKURL", "https://api.aquilaxk.site"],
  // Retired topology rejection input only. It must never become a deployable configuration again.
  ["WEB_DOMAIN", "www.aquilaxk.site"],
]

const withEnvKeys = (text, pairs) =>
  pairs.reduce(
    (accumulated, [key, value]) => accumulated.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`),
    text,
  )

const siteTopologies = (contract) =>
  contract.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope").topologies

// 표는 공개 API origin의 host로 키가 매겨진다. same-origin 전환(#1575) 이후 그 host는 web 호스트다.
const SAME_ORIGIN_TOPOLOGY = "blog.aquilaxk.site"

test("스위치 키의 허용 집합은 topology 표와 독립된 두 번째 편집 지점이다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const definition = contract.targets["home-server-source"].keys.find((key) => key.name === "CUSTOM_PROD_BACKURL")

  // 스위치의 허용 host는 allowedHosts로 한 번 더 좁혀진다. 스위치가 표 하나에만
  // 의존하면 topology 항목 추가가 그대로 스위치 허용 값 확대가 된다.
  assert.deepEqual(definition.allowedHosts, ["blog.aquilaxk.site"])

  // 표에만 추가하고 키 선언을 안 고치면 거부돼야 한다.
  const widened = JSON.parse(JSON.stringify(contract))
  const scope = widened.targets["home-server-source"].crossChecks.find((c) => c.type === "cookieDomainScope")
  scope.topologies["preview.aquilaxk.site"] = {
    cookieDomain: "preview.aquilaxk.site",
    frontHost: "preview.aquilaxk.site",
    webHost: "preview.aquilaxk.site",
    backHost: "preview.aquilaxk.site",
    publicEdgeProbeBaseUrl: "https://preview.aquilaxk.site",
    adminEmbedOrigins: "https://preview.aquilaxk.site",
    revalidateUrl: "https://preview.aquilaxk.site/api/revalidate",
  }
  const text = withEnvKeys(baseHomeServerEnv, [
    ["CUSTOM_PROD_BACKURL", "https://preview.aquilaxk.site"],
    ["CUSTOM_PROD_FRONTURL", "https://preview.aquilaxk.site"],
    ["CUSTOM_PROD_COOKIEDOMAIN", "preview.aquilaxk.site"],
    ["WEB_DOMAIN", "preview.aquilaxk.site"],
  ])
  const result = validateEnvText({ contract: widened, target: "home-server-source", text })
  assert.equal(result.ok, false, "a table-only addition must not widen the switch")
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_BACKURL" && error.message.includes("host must be one of")))

  // host 비교여야 한다. raw allowedValues였다면 후행 슬래시가 거부 사유가 되어, 같은 값을
  // 계약의 다른 층은 받고 이 층만 막는 상태가 된다.
  const slashed = validateEnvText({
    contract,
    target: "home-server-source",
    text: withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_BACKURL", "https://BLOG.aquilaxk.site/"]]),
  })
  assert.equal(slashed.ok, true, slashed.errors.map((e) => `${e.key}: ${e.message}`).join("\n"))
})

test("site topology is keyed on the public API origin alone so a single secret value selects every front-derived value", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const topologies = siteTopologies(loadContract(contractPath))

  assert.deepEqual(Object.keys(topologies).sort(), [SAME_ORIGIN_TOPOLOGY])
  assert.deepEqual(topologies[SAME_ORIGIN_TOPOLOGY], {
    cookieDomain: "blog.aquilaxk.site",
    frontHost: "blog.aquilaxk.site",
    webHost: "blog.aquilaxk.site",
    // same-origin: 공개 API가 web 호스트 자신이다. 이것이 #1575가 만든 목표 위상이고,
    // 공통 접미사가 web 호스트를 넘어갈 여지 자체를 없앤다.
    backHost: "blog.aquilaxk.site",
    publicEdgeProbeBaseUrl: "https://blog.aquilaxk.site",
    adminEmbedOrigins: "https://blog.aquilaxk.site",
    revalidateUrl: "https://blog.aquilaxk.site/api/revalidate",
  })
})

test("declared topology itself is checked against the cookie scope invariants, not just matched", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const base = loadContract(contractPath)

  // 표가 오타로 apex 쿠키 도메인을 선언하면, 값 대조만으로는 아무도 못 잡는다.
  // deploy.yml도 같은 표를 읽으므로 따라간다. 표를 검증하는 층이 있어야 한다.
  const poisoned = JSON.parse(JSON.stringify(base))
  const scope = poisoned.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  scope.topologies[SAME_ORIGIN_TOPOLOGY].cookieDomain = "aquilaxk.site"

  const matching = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"]])
  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: matching })

  assert.equal(result.ok, false, "a topology that violates the cookie scope invariant must not be usable")
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_BACKURL" && error.message.includes("unsafe")))
})

const poisonTopology = (contract, name, patch) => {
  const copy = JSON.parse(JSON.stringify(contract))
  const scope = copy.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  Object.assign(scope.topologies[name], patch)
  return copy
}

test("structural invariants are enforced for every declared topology", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // 표의 blog 항목이 오염되면 선택된 값과 무관하게 그 사실이 드러나야 한다.
  const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    cookieDomain: "aquilaxk.site",
  })
  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes(SAME_ORIGIN_TOPOLOGY)))
})

test("a topology whose web host differs from the cookie domain is rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    webHost: "www.blog.aquilaxk.site",
  })

  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("webHost")))
})

test("every front-derived value in a topology is checked, not just the host trio", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  // 표에 오타가 나면 백엔드가 x-revalidate-token을 담은 POST를 타 서비스 호스트로 보낸다.
  // probe는 존재하지 않는 호스트를 감시하게 된다. 호스트 3개만 보면 이게 통과한다.
  for (const patch of [
    { revalidateUrl: "https://www.aquilaxk.site/api/revalidate" },
    { publicEdgeProbeBaseUrl: "https://aquilaxk.site" },
    // 스킴이 빠지면 hostOf()가 ""를 반환해 비교가 조용히 사라지던 자리다.
    { publicEdgeProbeBaseUrl: "blog.aquilaxk.site" },
    { revalidateUrl: "blog.aquilaxk.site/api/revalidate" },
    { adminEmbedOrigins: "" },
    { webHost: "" },
  ]) {
    const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, patch)
    const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

    assert.equal(result.ok, false, `topology patch must be rejected: ${JSON.stringify(patch)}`)
    assert(
      result.errors.some((error) => error.message.includes(SAME_ORIGIN_TOPOLOGY)),
      `error must name the topology: ${JSON.stringify(patch)}`,
    )
  }
})

test("topology invariants compare hosts case-insensitively", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  // Caddy는 host를 소문자로 정규화한다. 대문자로 적힌 apex가 통과하면 그대로 API vhost가 된다.
  const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    cookieDomain: "AQUILAXK.SITE",
    frontHost: "AQUILAXK.SITE",
    webHost: "AQUILAXK.SITE",
  })
  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(result.ok, false, "uppercase apex cookieDomain must still hit forbiddenCookieDomains")
})

test("표의 키는 그 항목의 backHost와 묶여 있다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  // 키가 공개 API origin host이고 entry.backHost가 다른 값이면, 스위치는 키로 항목을 고르는데
  // 불변식은 backHost로 검사한다 - 고른 위상과 검증된 위상이 갈라진다.
  const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    backHost: "blog.aquilaxk.site.",
  })
  const ok = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(ok.ok, true, "trailing-dot FQDN is the same host and must stay accepted")

  const drifted = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    backHost: "other.blog.aquilaxk.site",
    webHost: "other.blog.aquilaxk.site",
    cookieDomain: "other.blog.aquilaxk.site",
    frontHost: "other.blog.aquilaxk.site",
  })
  const result = validateEnvText({ contract: drifted, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(result.ok, false, "a topology key that does not name its own backHost must be rejected")
  assert(result.errors.some((error) => error.message.includes("topology key must equal backHost")))
})

test("a topology whose API host is neither the web host nor under the cookie domain is rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  // same-origin 완화(backHost === webHost)가 "backHost는 아무거나 좋다"로 새면 안 된다.
  // 형제 호스트는 공통 접미사를 apex로 떨어뜨리므로 여전히 거부돼야 하고, apex 자신도 마찬가지다.
  for (const backHost of ["api.aquilaxk.site", "aquilaxk.site", "www.aquilaxk.site"]) {
    const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, { backHost })
    // 스위치를 바꾸지 않은 채 표만 오염된 경우를 본다.
    const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

    assert.equal(result.ok, false, `backHost=${backHost} must be rejected`)
    assert(
      result.errors.some((error) => error.key === "CUSTOM_PROD_BACKURL" && error.message.includes("unsafe")),
      `backHost=${backHost} must be reported against the switch key`,
    )
  }
})

test("front-derived keys pinned by the deploy announce their replacement instead of blocking it", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // 이 세 키는 오너가 유지보수하지 않는다. deploy.yml이 같은 표에서 파생해 덮어쓴다.
  // 침묵하면 "오너 명시값의 무고지 변경"이고, error면 곧 교체될 값 때문에 배포가 막힌다.
  for (const [key, wrongValue] of [
    ["ADMIN_EMBED_ORIGINS", "https://www.aquilaxk.site"],
    ["CUSTOM__REVALIDATE__URL", "https://www.aquilaxk.site/api/revalidate"],
    ["PUBLIC_EDGE_PROBE_BASE_URL", "https://www.aquilaxk.site"],
  ]) {
    const text = withEnvKeys(`${baseHomeServerEnv}\nPUBLIC_EDGE_PROBE_BASE_URL=https://blog.aquilaxk.site`, [
      [key, wrongValue],
    ])
    const result = validateEnvText({ contract, target: "home-server-source", text })

    assert.equal(result.ok, true, `${key} must not block the deploy: ${result.errors.map((e) => e.key).join(",")}`)
    assert(result.warnings.some((warning) => warning.key === key), `${key} drift must be announced`)
  }
})

test("ADMIN_EMBED_ORIGINS warning names the origins that lose embed rights", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // 오너 정본 .env.prod의 현재 값이다. apex와 www 둘 다 embed 권한을 갖고 있다.
  const text = withEnvKeys(baseHomeServerEnv, [
    ["ADMIN_EMBED_ORIGINS", "https://www.aquilaxk.site https://aquilaxk.site"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })
  const warning = result.warnings.find((entry) => entry.key === "ADMIN_EMBED_ORIGINS")

  assert(warning, "the removal must be announced before the deploy applies it")
  // 일반론이면 오너가 무엇이 사라지는지 모른다. 교체 값과 제거 대상 origin을 그대로 찍어야 한다.
  // 부분 문자열이 아니라 완전 일치로 본다 - 부분 일치는 origin 목록 검사로 오해되기도 하고,
  // 실제로 무엇이 출력되는지도 못 박지 못한다.
  assert.equal(
    warning.message,
    'the deploy will replace this with "https://blog.aquilaxk.site", ' +
      "removing iframe embed rights from: https://www.aquilaxk.site https://aquilaxk.site",
  )
})

test("a topology may not grant admin embed rights outside its own web host", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const poisoned = poisonTopology(loadContract(contractPath), SAME_ORIGIN_TOPOLOGY, {
    adminEmbedOrigins: "https://blog.aquilaxk.site https://aquilaxk.site",
  })

  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("adminEmbedOrigins")))
})

test("an absent revalidate URL is announced because the backend call path is live", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = baseHomeServerEnv.replace(/^CUSTOM__REVALIDATE__URL=.*$\n?/m, "")

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  // required: false지만 비어 있으면 RevalidateService가 조용히 drop한다.
  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  assert(result.warnings.some((warning) => warning.key === "CUSTOM__REVALIDATE__URL"))
})

test("ADMIN_EMBED_ORIGINS drift to another service host is announced", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // 여러 origin이 들어와도 전부 front 호스트여야 한다. 타 서비스 origin에 embed 권한이 남으면 안 된다.
  const mixed = withEnvKeys(baseHomeServerEnv, [
    ["ADMIN_EMBED_ORIGINS", "https://blog.aquilaxk.site https://aquilaxk.site"],
  ])
  const mixedResult = validateEnvText({ contract, target: "home-server-source", text: mixed })
  assert(mixedResult.warnings.some((warning) => warning.key === "ADMIN_EMBED_ORIGINS"))

  const singleResult = validateEnvText({ contract, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(singleResult.ok, true, singleResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  assert.equal(singleResult.warnings.some((warning) => warning.key === "ADMIN_EMBED_ORIGINS"), false)
})

test("an empty value never silently skips a topology comparison", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_COOKIEDOMAIN", ""]])

  const result = validateEnvText({ contract, target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_COOKIEDOMAIN"))
})

test("prototype keys never resolve to a topology", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const scope = contract.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  // allowedValues가 먼저 막지만, crossCheck 자체가 구조적으로 닫혀 있어야 한다.
  scope.topologies = { ...scope.topologies }
  const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_BACKURL", "https://constructor"]])

  const result = validateEnvText({ contract, target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(
    result.errors.some(
      (error) => error.key === "CUSTOM_PROD_BACKURL" && error.message.includes("no declared prod site topology"),
    ),
  )
})

test("cookie scope check compares hosts, so URL spelling drift in the secret does not block deploys", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // HOME_SERVER_ENV의 CUSTOM_PROD_*는 실 운영값과 표기가 다를 수 있다. 그래서 하드 핀이 있었다.
  // 후행 슬래시와 대소문자는 같은 host를 가리키므로 통과해야 한다.
  const text = withEnvKeys(baseHomeServerEnv, [
    ["CUSTOM_PROD_FRONTURL", "https://BLOG.aquilaxk.site/"],
    // 스위치 키 자신도 host로 읽힌다. raw 비교면 이 한 줄이 topology를 통째로 놓친다.
    ["CUSTOM_PROD_BACKURL", "https://BLOG.aquilaxk.site/"],
    ["CUSTOM_PROD_COOKIEDOMAIN", "Blog.aquilaxk.site"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
})

test("cookie scope check rejects a cookie domain that is not the one declared for the switch host", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  for (const wrongCookieDomain of ["aquilaxk.site", "www.aquilaxk.site", "www.blog.aquilaxk.site"]) {
    const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_COOKIEDOMAIN", wrongCookieDomain]])
    const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

    assert.equal(result.ok, false, `${wrongCookieDomain} must not be accepted`)
    assert(result.errors.some((error) => error.key === "CUSTOM_PROD_COOKIEDOMAIN"))
  }
})

test("WEB_DOMAIN is derived from the same switch as the other front-derived values", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // WEB_DOMAIN이 스위치 밖에 있으면 오너가 스위치만 바꿨을 때 web vhost가 구 호스트에
  // 남고, #1557의 urlHostEquals(CUSTOM_PROD_FRONTURL, WEB_DOMAIN)가 배포를 막는다.
  const scope = contract.targets["home-server-source"].crossChecks.find((c) => c.type === "cookieDomainScope")
  assert.equal(scope.webDomainKey, "WEB_DOMAIN")

  const drifted = withEnvKeys(baseHomeServerEnv, [["WEB_DOMAIN", "www.aquilaxk.site"]])
  const result = validateEnvText({ contract, target: "home-server-source", text: drifted })
  assert(result.warnings.some((warning) => warning.key === "WEB_DOMAIN"), "drift must be announced")

  const workflow = readFileSync(workflowPath, "utf8")
  assert.match(workflow, /PROD_SITE_WEB_DOMAIN="blog\.aquilaxk\.site"/)
  assert.match(workflow, /upsert_env_key "WEB_DOMAIN" "\$\{PROD_SITE_WEB_DOMAIN\}" "deploy\/homeserver\/\.env\.prod"/)

  // Retired topology가 빈 WEB_DOMAIN으로 배포를 통과시키면 공개 edge 검증이 사라진다.
  assert.doesNotMatch(workflow, /PROD_SITE_WEB_DOMAIN="www\.aquilaxk\.site"/)
  assert.doesNotMatch(workflow, /PROD_SITE_WEB_DOMAIN=""/)
})

test("스위치 표기 흔들림이 WEB_DOMAIN·BACKEND_INTERNAL_URL requiredWhen 게이트를 조용히 닫지 못한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  // 게이트가 raw 문자열 비교이던 시절, 후행 슬래시나 대문자 하나면 requiredWhen이 false가 되고
  // 두 키가 optional로 통과했다. 그 결과는 "배포 실패"가 아니라 공개 사이트/공개 API 404다.
  // 계약의 다른 host 비교는 이미 슬래시·대소문자를 흡수하므로, 여기만 raw면 같은 스위치를
  // 두 층이 다르게 읽는다.
  for (const spelling of ["https://blog.aquilaxk.site/", "https://BLOG.aquilaxk.site"]) {
    const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_BACKURL", spelling]])
      .replace(/^WEB_DOMAIN=.*\n/m, "")
      .replace(/^BACKEND_INTERNAL_URL=.*\n/m, "")
    const result = validateEnvText({ contract, target: "home-server-source", text })

    assert.equal(result.ok, false, `${spelling} must keep the same-origin gate open`)
    for (const key of ["WEB_DOMAIN", "BACKEND_INTERNAL_URL"]) {
      assert(
        result.errors.some((error) => error.key === key && error.message === "is required"),
        `${spelling}: ${key} must still be required`,
      )
    }
  }
})

test("cookie scope check rejects a front host that is not the one declared for the switch host", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"]])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_FRONTURL"))
})

test("retired pre-transition domain set is rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [
    ...PRE_TRANSITION_DOMAIN_ENV,
    ["ADMIN_EMBED_ORIGINS", "https://www.aquilaxk.site"],
    ["CUSTOM__REVALIDATE__URL", "https://www.aquilaxk.site/api/revalidate"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_BACKURL"))
})

test("partially migrated domain set fails closed instead of mixing both topologies", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // 스위치(BACKURL)만 옮기고 front·cookie를 그대로 둔 상태.
  const text = withEnvKeys(baseHomeServerEnv, [
    ["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"],
    ["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_COOKIEDOMAIN"))
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_FRONTURL"))
})

test("a switch host outside the declared topologies fails on the runner before the remote script runs", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_BACKURL", "https://api.other.example"]])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_BACKURL"))
})

test("deploy workflow derives every prod site value from the same topology table as the env contract", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const topologies = siteTopologies(loadContract(contractPath))
  const workflow = readFileSync(workflowPath, "utf8")

  // 두 층(러너 검증 / 원격 핀)이 서로 다른 표를 들고 있으면 "단일 레버"가 성립하지 않는다.
  for (const [apiDomain, topology] of Object.entries(topologies)) {
    const branch = workflow.slice(
      workflow.indexOf(`            ${apiDomain})`),
      workflow.indexOf(";;", workflow.indexOf(`            ${apiDomain})`)),
    )
    assert.notEqual(branch, "", `deploy.yml must branch on the public API host ${apiDomain}`)
    assert(branch.includes(`PROD_SITE_COOKIE_DOMAIN="${topology.cookieDomain}"`), `${apiDomain} cookie domain`)
    assert(branch.includes(`PROD_SITE_FRONT_URL="https://${topology.frontHost}"`), `${apiDomain} front url`)
    assert(branch.includes(`PROD_SITE_BACK_URL="https://${topology.backHost}"`), `${apiDomain} back url`)
    assert(
      branch.includes(`PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL="${topology.publicEdgeProbeBaseUrl}"`),
      `${apiDomain} public edge probe base url`,
    )
    assert(
      branch.includes(`PROD_SITE_ADMIN_EMBED_ORIGINS="${topology.adminEmbedOrigins}"`),
      `${apiDomain} admin embed origins`,
    )
    assert(branch.includes(`PROD_SITE_REVALIDATE_URL="${topology.revalidateUrl}"`), `${apiDomain} revalidate url`)
  }

  // front origin 파생 키가 스위치 밖에 있으면 오너가 스위치만 바꿨을 때 조용히 어긋난다.
  assert.match(workflow, /upsert_env_key "ADMIN_EMBED_ORIGINS" "\$\{PROD_SITE_ADMIN_EMBED_ORIGINS\}" "deploy\/homeserver\/\.env\.prod"/)
  // CUSTOM__REVALIDATE__URL은 required: false다. 비어 있는 상태(재생성 비활성)를 켜 버리면 안 된다.
  assert.match(workflow, /if \[ -n "\$\{EXISTING_REVALIDATE_URL\}" \]; then/)
  assert.match(workflow, /upsert_env_key "CUSTOM__REVALIDATE__URL" "\$\{PROD_SITE_REVALIDATE_URL\}" "deploy\/homeserver\/\.env\.prod"/)
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
    .replace("CUSTOM_PROD_FRONTURL=https://blog.aquilaxk.site", "CUSTOM_PROD_FRONTURL=https://wrong.blog.aquilaxk.site")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM__ADMIN__PASSWORD"))
  assert(result.errors.some((error) => error.message.includes("CUSTOM_PROD_BACKURL")))
  assert(!JSON.stringify(result).includes("change_me_admin_password"))
})

test("Platform contract keeps runtime keys but removes Web rendering and Web-owned keys", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const sourceKeys = new Set(targetKeyNames(contract, "home-server-source"))

  assert.equal(Object.hasOwn(contract.targets, "front-local"), false)
  for (const key of [
    "NEXT_PUBLIC_SIGNUP_ENABLED",
    "NEXT_PUBLIC_RUM_SAMPLE_RATE",
    "BACKEND_PROXY_MAX_BODY_BYTES",
    "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES",
    "PLAYWRIGHT_BASE_URL",
    "E2E_API_BASE_URL",
    "E2E_LIVE_ADMIN_EMAIL",
    "E2E_LIVE_ADMIN_USERNAME",
    "E2E_LIVE_ADMIN_PASSWORD",
  ]) {
    assert.equal(sourceKeys.has(key), false, `${key} must belong to Web only`)
  }
  for (const key of ["CUSTOM_PROD_FRONTURL", "CUSTOM_PROD_BACKURL", "CUSTOM_PROD_COOKIEDOMAIN", "CUSTOM__REVALIDATE__URL", "CUSTOM__REVALIDATE__TOKEN", "CUSTOM__MEMBER__SIGNUP__ENABLED"]) {
    assert.equal(sourceKeys.has(key), true, `${key} must remain Platform-owned`)
  }

  const result = validateEnvText({ contract, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
})

test("deploy workflow validates HOME_SERVER_ENV before SSH deployment", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /Validate HOME_SERVER_ENV contract/)
  assert.match(workflow, /tools\/env\/validate-env\.mjs --target home-server-source/)
  assert.equal(
    workflow.match(/HOME_RESTORE_PRIVACY_GATE_SCRIPT="\$\{HOME_APP_DIR%\/\}\/restore-privacy-gate\.sh"/g)?.length,
    2,
  )
  assert.doesNotMatch(workflow, /secrets\.AQUILA_RESTORE_PRIVACY_GATE_SCRIPT/)
  assert.doesNotMatch(workflow, /vars\.AQUILA_RESTORE_PRIVACY_GATE_SCRIPT/)
  assert.match(workflow, /printf 'AQUILA_RESTORE_PRIVACY_GATE_SCRIPT=%s\\n' "\$\{HOME_RESTORE_PRIVACY_GATE_SCRIPT\}"/)
  assert.match(workflow, /printf 'HOME_RESTORE_PRIVACY_GATE_SCRIPT=%q\\n' "\$\{HOME_RESTORE_PRIVACY_GATE_SCRIPT\}"/)
  assert.match(workflow, /upsert_env_key "AQUILA_RESTORE_PRIVACY_GATE_SCRIPT" "\$\{HOME_RESTORE_PRIVACY_GATE_SCRIPT\}" "deploy\/homeserver\/\.env\.prod"/)
  assert.doesNotMatch(workflow, /HOME_NEXT_PUBLIC_/)
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_SIGNUP_ENABLED/)
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_RUM_SAMPLE_RATE/)
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

test("deploy workflow purges every accepted retired AI summary assignment from the transport env before scp", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const writeIndex = workflow.indexOf('printf \'%s\\n\' "${HOME_SERVER_ENV}" > "${LOCAL_ENV_FILE}"')
  const purgeCommand = "sed -E '/^[[:space:]]*(export[[:space:]]+)?CUSTOM__AI__SUMMARY__[A-Za-z0-9_]*[[:space:]]*=/d'"
  const purgeIndex = workflow.indexOf(`${purgeCommand} "\${LOCAL_ENV_FILE}" > "\${LOCAL_ENV_FILE}.sanitized"`)
  const replaceIndex = workflow.indexOf('mv "${LOCAL_ENV_FILE}.sanitized" "${LOCAL_ENV_FILE}"')
  const scpIndex = workflow.indexOf('"${LOCAL_ENV_FILE}" "${LOCAL_REMOTE_VARS_FILE}"')
  const transportInput = [
    "# CUSTOM__AI__SUMMARY__MODEL=comment",
    "UNRELATED_VALUE=CUSTOM__AI__SUMMARY__MODEL=literal",
    "  CUSTOM__AI__SUMMARY__MODEL=retired-plain",
    "\texport CUSTOM__AI__SUMMARY__GEMINI__API_KEY=retired-export",
    "export    CUSTOM__AI__SUMMARY__MODEL = retired-spaced",
    "CUSTOM__AI__SUMMARY__=retired-prefix-only",
    "CUSTOM__AI__SUMMARYX=similar-key",
    "CUSTOM__AI__SUMMARY__BAD-KEY=invalid-key",
    "exportCUSTOM__AI__SUMMARY__MODEL=not-an-export-assignment",
    "EXPORT CUSTOM__AI__SUMMARY__MODEL=uppercase-export",
    "UNRELATED_KEY=kept",
    "",
  ].join("\n")
  const sanitized = execFileSync("sed", ["-E", "/^[[:space:]]*(export[[:space:]]+)?CUSTOM__AI__SUMMARY__[A-Za-z0-9_]*[[:space:]]*=/d"], {
    encoding: "utf8",
    input: transportInput,
  })

  assert(writeIndex > -1, "HOME_SERVER_ENV must first be materialized into the runner temp file")
  assert(purgeIndex > writeIndex, "retired prefix must be purged after materialization")
  assert(replaceIndex > purgeIndex, "sanitized temp file must replace the transport source")
  assert(scpIndex > replaceIndex, "scp must receive the sanitized transport file")
  assert.equal((workflow.match(/CUSTOM__AI__SUMMARY__/g) ?? []).length, 1)
  assert.equal(
    sanitized,
    "# CUSTOM__AI__SUMMARY__MODEL=comment\nUNRELATED_VALUE=CUSTOM__AI__SUMMARY__MODEL=literal\nCUSTOM__AI__SUMMARYX=similar-key\nCUSTOM__AI__SUMMARY__BAD-KEY=invalid-key\nexportCUSTOM__AI__SUMMARY__MODEL=not-an-export-assignment\nEXPORT CUSTOM__AI__SUMMARY__MODEL=uppercase-export\nUNRELATED_KEY=kept\n",
  )
})

test("deploy workflow derives the pinned prod site scope from the switch instead of hard-coding it", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  // 하드 핀 문자열이 남아 있으면 HOME_SERVER_ENV 스위치와 갈라진다.
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN" "aquilaxk\.site"/)
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_FRONTURL" "https:\/\/www\.aquilaxk\.site"/)
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_BACKURL" "https:\/\/api\.aquilaxk\.site"/)

  // 전환 스위치는 HOME_SERVER_ENV의 CUSTOM_PROD_BACKURL 하나뿐이고, host로 읽는다 (#1575).
  // raw URL 비교로 되돌아가면 후행 슬래시 하나가 fail-closed 분기로 떨어져, env 계약이 방금
  // 통과시킨 값이 배포에서만 죽는다.
  assert.match(workflow, /PROD_SITE_BACK_URL_RAW="\$\(read_prod_env_value CUSTOM_PROD_BACKURL\)"/)
  assert.match(workflow, /PROD_SITE_BACK_HOST="\$\{PROD_SITE_BACK_URL_RAW#\*:\/\/\}"/)
  assert.match(workflow, /case "\$\{PROD_SITE_BACK_HOST\}" in/)
  assert.doesNotMatch(workflow, /PROD_SITE_API_DOMAIN=/)

  // 알려지지 않은 공개 API origin은 fail-closed다.
  assert.match(workflow, /unsupported CUSTOM_PROD_BACKURL host for the prod site contract/)

  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN" "\$\{PROD_SITE_COOKIE_DOMAIN\}" "deploy\/homeserver\/\.env\.prod"/)
  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_FRONTURL" "\$\{PROD_SITE_FRONT_URL\}" "deploy\/homeserver\/\.env\.prod"/)
  assert.match(workflow, /upsert_env_key "CUSTOM_PROD_BACKURL" "\$\{PROD_SITE_BACK_URL\}" "deploy\/homeserver\/\.env\.prod"/)
  // 공개 edge probe도 같은 스위치를 따라야 전환 창 동안 실서비스 호스트를 계속 감시한다.
  assert.match(
    workflow,
    /upsert_env_key "PUBLIC_EDGE_PROBE_BASE_URL" "\$\{PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL\}" "deploy\/homeserver\/\.env\.prod"/,
  )
  assert(
    workflow.indexOf('upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN"') <
      workflow.indexOf('require_nonempty_env_key "CF_TUNNEL_TOKEN"'),
  )
})

test("public edge probe runtime target requires materialized topology input", () => {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const definition = contract.targets["home-server-source"].keys.find(
    (key) => key.name === "PUBLIC_EDGE_PROBE_BASE_URL",
  )
  const compose = readFileSync(composePath, "utf8")
  const workflow = readFileSync(workflowPath, "utf8")

  assert.equal(definition?.required, false)
  assert.match(
    compose,
    /\$\{PUBLIC_EDGE_PROBE_BASE_URL:\?PUBLIC_EDGE_PROBE_BASE_URL is required\}/,
  )
  assert.doesNotMatch(compose, /\$\{PUBLIC_EDGE_PROBE_BASE_URL:-/)
  for (const topology of Object.values(siteTopologies(contract))) {
    assert(
      workflow.includes(`PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL="${topology.publicEdgeProbeBaseUrl}"`),
      `deploy must derive ${topology.publicEdgeProbeBaseUrl}`,
    )
  }
  assert.match(
    workflow,
    /upsert_env_key "PUBLIC_EDGE_PROBE_BASE_URL" "\$\{PROD_SITE_PUBLIC_EDGE_PROBE_BASE_URL\}" "deploy\/homeserver\/\.env\.prod"/,
  )
})

test("deploy.yml의 host 파싱이 validate-env와 같은 host를 낸다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  // 두 층이 다르게 파싱하면 "계약은 통과했는데 배포만 죽는" 클래스가 된다. userinfo가 그 경로다:
  // new URL().hostname은 벗겨내고, shell 파싱이 안 벗기면 `u@host`가 남아 case가 abort한다.
  // 순서도 계약이다 - path에 '@'가 올 수 있어 path를 먼저, userinfo에 ':'가 올 수 있어 port를
  // 마지막에 벗긴다.
  const order = [
    'PROD_SITE_BACK_HOST="${PROD_SITE_BACK_URL_RAW#*://}"',
    'PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST%%/*}"',
    'PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST##*@}"',
    'PROD_SITE_BACK_HOST="${PROD_SITE_BACK_HOST%%:*}"',
  ]
  let cursor = -1
  for (const step of order) {
    const at = workflow.indexOf(step)
    assert.notEqual(at, -1, `missing host parse step: ${step}`)
    assert(at > cursor, `host parse steps out of order at: ${step}`)
    cursor = at
  }

  // 같은 순서를 여기서 재현해 new URL().hostname과 대조한다.
  const shellHost = (url) => {
    let host = url.replace(/^[^:]*:\/\//, "")
    host = host.replace(/\/.*$/, "")
    host = host.replace(/^.*@/, "")
    host = host.replace(/:.*$/, "")
    return host.toLowerCase()
  }
  for (const url of [
    "https://blog.aquilaxk.site",
    "https://blog.aquilaxk.site/",
    "https://BLOG.aquilaxk.site",
    "https://blog.aquilaxk.site:443",
    "https://u@blog.aquilaxk.site",
    "https://u:p@blog.aquilaxk.site",
    "https://u:p@blog.aquilaxk.site:443/x",
    "https://blog.aquilaxk.site/a@b",
  ]) {
    assert.equal(shellHost(url), new URL(url).hostname.toLowerCase(), `host parse mismatch for ${url}`)
  }
})

test("배포 후 게이트가 same-origin 공개 표면도 검증한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  // web vhost의 @backendApi prefix가 하나 빠져도 CD가 끝까지 green이고 공개 API만 Next.js
  // 404가 되는 실패를 잡는 게이트다 - 브라우저에서만 드러나는 실패다.
  assert.match(workflow, /WEB_DOMAIN="\$\(read_prod_env_value WEB_DOMAIN\)"/)
  assert.match(workflow, /rollback_and_exit "web_host_api_route_failed"/)
  // 백엔드 경로 하나만 보면 prefix 목록이 통째로 사라져도 health 하나로 통과할 수 있다.
  assert.match(workflow, /\/post\/api\/v1\/posts\/feed\?page=1&pageSize=1&sort=CREATED_AT/)
  assert.match(workflow, /-H "Host: \$\{WEB_DOMAIN\}"/)

  // #1596: WEB_DOMAIN이 없으면 검증할 공개 표면 자체가 없다. 조건부로 건너뛰면 아무도 안 보는
  // 사이 배포가 green으로 통과하므로, 건너뛰지 말고 배포를 멈춘다.
  assert.match(workflow, /rollback_and_exit "missing_web_domain"/)
  assert.doesNotMatch(workflow, /skipping the same-origin public API route gate/)

  // 내부 게이트는 공개 HTTPS가 아니라 edge network + Host 헤더여야 한다. DNS·Cloudflare·터널이
  // 고장 난 상황에서도 "Caddy 라우팅이 맞는가"를 따로 답할 수 있어야, 라우팅 회귀가 다른 장애로
  // 오인되지 않는다. 공개 HTTPS 판정은 아래 wait_public_api_health가 소유한다.
  const gate = workflow.slice(
    workflow.indexOf("for web_api_probe_path in "),
    workflow.indexOf('rollback_and_exit "web_host_api_route_failed"'),
  )
  assert.match(gate, /--network blog_home_edge/)
  assert.doesNotMatch(gate, /https:\/\//)
  // 매치되는 vhost가 없는 Host는 404가 아니라 `200` + 빈 본문이다(실측). 상태 코드만 보면
  // WEB_DOMAIN과 Caddyfile이 어긋난 순간 이 게이트가 그 빈 200으로 통과한다.
  assert.match(gate, /%\{size_download\}/)
  assert.match(workflow, /rollback_and_exit "web_host_api_route_empty_body"/)

  // 공개 HTTPS 게이트는 구 API 호스트가 아니라 실제로 서비스되는 web 호스트를 때린다.
  assert.match(workflow, /wait_public_api_health "\$\{WEB_DOMAIN\}"/)
  assert.doesNotMatch(workflow, /\bAPI_DOMAIN\b/)
})

// 매치되는 vhost가 없는 Host에도 Caddy는 404가 아니라 `200` + 빈 본문을 준다. 실측(이 트리의
// Caddyfile을 `caddy run`으로 띄우고 `Host: api.aquilaxk.site`): 200, 0 bytes.
//
// 그래서 내부 edge probe가 상태 코드만 보면, WEB_DOMAIN과 Caddy site address가 어긋난 순간
// 전부 "정상"으로 보고한다 - steady-state guard는 복구를 돌리지 않고 status 리포트는 green을
// 찍는다. 백엔드가 죽어도 같은 결과가 나오는 것이 아니라, "아무 vhost도 매치하지 않았다"가
// 성공으로 읽히는 것이다.
//
// 문 하나만 고치면 다른 문에서 게이트가 조용히 사라지므로 두 스크립트를 함께 고정한다.
test("내부 edge probe는 미매치 Host의 빈 200을 성공으로 읽지 않는다", () => {
  const guards = [
    ["steady_state_guard.sh", readFileSync(path.join(repoRoot, "deploy/homeserver/steady_state_guard.sh"), "utf8")],
    ["check_deploy_status.sh", readFileSync(path.join(repoRoot, "deploy/homeserver/check_deploy_status.sh"), "utf8")],
  ]

  // 함수 하나만 떼어 본다. 같은 파일의 로그인 POST probe도 `%{http_code}`만 쓰지만, 그쪽은
  // 토큰 추출이 뒤따라서 빈 200이 조용히 통과하지 않는다 - 여기서 고정할 대상이 아니다.
  const shellFunctionBody = (script, name) => {
    const start = script.indexOf(`${name}() {`)
    if (start === -1) return ""
    const end = script.indexOf("\n}\n", start)
    return end === -1 ? "" : script.slice(start, end + 3)
  }

  for (const [name, script] of guards) {
    // 상태 코드 옆에서 본문 길이를 같이 걷어야 두 상태를 구분할 수 있다.
    const routeProbe = shellFunctionBody(script, "probe_internal_caddy_route_metrics")
    assert.notEqual(routeProbe, "", `${name} must route internal probes through one metrics helper`)
    assert.match(
      routeProbe,
      /-w "%\{http_code\} %\{size_download\}"/,
      `${name} must collect the body length next to the status code`,
    )
    assert.doesNotMatch(
      routeProbe,
      /-w "%\{http_code\}"/,
      `${name} must not keep a status-only internal route probe`,
    )
    // 미매치 Host는 언제나 200 + 0 bytes다. 200일 때만 본문을 요구하면 인증 응답(401/403)의
    // 본문 유무를 가정하지 않고 그 신호만 정확히 걸러낸다.
    const predicate = shellFunctionBody(script, "is_unmatched_host_response")
    assert.notEqual(predicate, "", `${name} must name the unmatched-host signature in one place`)
    assert.match(predicate, /\[\[ "\$\{code\}" == "200" \]\]/, `${name} predicate must key on 200`)
    assert.match(predicate, /\^\[1-9\]\[0-9\]\*\$/, `${name} predicate must require a non-empty body`)
    // 판정 지점에서 실제로 쓰여야 한다. 정의만 있고 호출이 없으면 게이트가 아니다.
    assert(
      script.split("is_unmatched_host_response").length - 1 >= 3,
      `${name} must call the predicate on every internal probe verdict`,
    )
  }
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
  // indexOf(-1)이 항상 작으므로, 순서 단언 전에 두 지점이 실제로 존재하는지부터 확인한다.
  const publicHealthIndex = workflow.indexOf('wait_public_api_health "${WEB_DOMAIN}"')
  assert(publicHealthIndex !== -1, "the public health gate must target the public web host")
  assert(publicHealthIndex < workflow.indexOf("assert_live_security_headers"))
  assert(
    workflow.indexOf('assert_live_security_headers') <
      workflow.indexOf("run_canary_ratio_check()"),
  )
})

test("deploy workflow probes Caddy through its edge network", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert.match(workflow, /docker run --rm --network blog_home_edge curlimages\/curl:8\.7\.1/)
  assert.doesNotMatch(workflow, /docker run --rm --network blog_home_default curlimages\/curl:8\.7\.1/)
})

test("blue green deploy keeps grafana route checks out of backend rollback decisions", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const burnInBody = deployScript.slice(
    deployScript.indexOf("run_blue_green_burn_in()"),
    deployScript.indexOf("rollback_to_backend()"),
  )

  assert.match(deployScript, /warn_grafana_embed_origin_route\(\)/)
  assert.doesNotMatch(deployScript, /if ! check_grafana_embed_origin_route; then/)
  assert.doesNotMatch(deployScript, /^check_grafana_embed_origin_route$/m)
  assert.doesNotMatch(deployScript, /grafana origin auth-proxy route verify failed[\s\S]{0,220}rollback_/)
  assert.doesNotMatch(burnInBody, /warn_grafana_embed_origin_route/)
  assert.doesNotMatch(deployScript, /steady-state guard monitors it/)
})

test("required secret check does not inject multi-line HOME_SERVER_ENV into shell", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  assert(!workflow.includes("HOME_SERVER_ENV=${{ secrets.HOME_SERVER_ENV }}"))
  assert.match(workflow, /env:\n(?:.*\n)*\s+HOME_SERVER_ENV: \$\{\{ secrets\.HOME_SERVER_ENV \}\}/)
  assert.match(workflow, /value="\$\{!key:-\}"/)
})

test("deploy workflow는 path-aware stale gate로 backend 영향 후속 변경만 차단한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const ciWorkflow = readFileSync(ciWorkflowPath, "utf8")
  const securityWorkflow = readFileSync(securityWorkflowPath, "utf8")

  assert.match(workflow, /workflow_call: \{\}/)
  assert.doesNotMatch(workflow, /^  workflow_run:/m)
  assert.doesNotMatch(workflow, /select\(\.event == "workflow_run"/)
  assert.match(workflow, /ref: \$\{\{ github\.sha \}\}/)
  assert.match(workflow, /DEPLOY_SHA_INPUT: \$\{\{ github\.sha \}\}/)
  assert.match(workflow, /security_caller_admission: \$\{\{ steps\.security_caller_admission\.outputs\.result \}\}/)
  assert.match(workflow, /CALLER_WORKFLOW_REF: \$\{\{ github\.workflow_ref \}\}/)
  assert.match(workflow, /EXPECTED_CALLER_WORKFLOW_REF: AquilaXk\/aquila-blog\/\.github\/workflows\/security\.yml@refs\/heads\/main/)
  assert.match(workflow, /\[ "\$\{GITHUB_REF\}" != "refs\/heads\/main" \]/)
  assert.match(workflow, /Security gate satisfied by the exact same-SHA caller DAG/)
  assert.match(securityWorkflow, /uses: \.\/\.github\/workflows\/deploy\.yml/)
  assert.match(securityWorkflow, /if: github\.event_name == 'push'/)
  assert.match(workflow, /REMOTE_MAIN_SHA="\$\(git ls-remote --exit-code origin refs\/heads\/main \| awk '\{print \$1\}'\)"/)
  assert.match(workflow, /origin\/main sha lookup failed/)
  assert.match(workflow, /git fetch --no-tags --prune origin "\+refs\/heads\/main:refs\/remotes\/origin\/main"/)
  assert.match(workflow, /git merge-base --is-ancestor "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"/)
  assert.match(workflow, /STALE_CHANGED_FILES="\$\(git diff --name-only "\$\{DEPLOY_SHA\}" "\$\{REMOTE_MAIN_SHA\}"/)
  assert.match(workflow, /BACKEND_DEPLOY_PATHS_PATTERN=.*deploy\/env\//)
  assert.match(workflow, /BACKEND_DEPLOY_PATHS_PATTERN=.*tools\/env\//)
  assert.match(workflow, /BACKEND_DEPLOY_PATHS_PATTERN=.*restore-privacy-gate/)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*deploy\/env\//)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*tools\/env\//)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*tools\/security\/native-image-evidence\\\.mjs/)
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*restore-privacy-gate/)
  assert.match(ciWorkflow, /- "restore-privacy-gate\.sh"/)
  assert.match(workflow, /grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"/)
  assert.doesNotMatch(workflow, /git fetch --depth=1 origin main/)
  assert.doesNotMatch(workflow, /git rev-parse origin\/main/)
  assert.match(workflow, /stale deploy blocked by backend-impacting newer main changes: deploy_sha=/)
  assert.match(workflow, /stale automatic caller allowed after backend-neutral newer main changes: deploy_sha=/)
  assert.doesNotMatch(workflow, /\.trivyignore/)
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

test("deploy calculateTag uses the current Platform github.sha for automatic callers", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.backendSha,
      githubSha: fixture.docsSha,
      currentMainSha: fixture.docsSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")
    assert.match(output, new RegExp(`deploy_sha=${fixture.docsSha}`))
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
      /stale deploy blocked by backend-impacting newer main changes/,
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
      /stale deploy blocked by backend-impacting newer main changes/,
    )
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("dispatch calculateTag는 admission 후 main 전진을 late failure로 바꾸지 않는다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({ cwd: fixture.workDir, deploySha: fixture.docsSha, currentMainSha: fixture.backendAfterDocsSha, eventName: "repository_dispatch" })
    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")
    assert.match(output, /front_deploy=true/)
    assert.match(output, /backend_deploy=false/)
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("dispatch calculateTag는 admission API 재조회 없이 immutable front payload를 출력한다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({ cwd: fixture.workDir, deploySha: fixture.docsSha, currentMainSha: fixture.docsSha, eventName: "repository_dispatch" })
    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")
    assert.match(output, /front_deploy=true/)
    assert.match(output, /backend_deploy=false/)
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

// Platform은 Web front 변경 이력으로 배포를 결정하지 않는다. Web이 검증한 immutable digest의
// repository_dispatch만 front rollout을 시작하므로, Platform의 front-only 커밋은 둘 다 건너뛴다.
test("deploy calculateTag는 front만 바뀐 커밋에서 backend와 front를 재배포하지 않는다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.frontSha,
      currentMainSha: fixture.frontSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")

    assert.match(output, /backend_deploy=false/)
    assert.match(output, /front_deploy=false/)
    assert.match(output, /front_source_sha=\n/)
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 backend만 바뀐 커밋에서 front를 재배포하지 않는다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.backendAfterFrontSha,
      currentMainSha: fixture.backendAfterFrontSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")

    assert.match(output, /backend_deploy=true/)
    assert.match(output, /front_deploy=false/)
    // front를 배포하지 않으므로 front 이미지 sha도 계산하지 않는다.
    assert.match(output, /front_source_sha=\n/)
  } finally {
    rmSync(fixture.workDir, { recursive: true, force: true })
  }
})

test("deploy calculateTag는 stale front-only main 변경도 Platform front 배포를 시작하지 않는다", () => {
  const fixture = createDeployStaleFixture()
  try {
    runDeployCalculateScript({
      cwd: fixture.workDir,
      deploySha: fixture.frontSha,
      currentMainSha: fixture.laterFrontSha,
    })

    const output = readFileSync(path.join(fixture.workDir, "github-output.txt"), "utf8")
    const summary = readFileSync(path.join(fixture.workDir, "github-summary.md"), "utf8")

    assert.match(output, /backend_deploy=false/)
    assert.match(output, /front_deploy=false/)
    assert.match(output, /front_source_sha=\n/)
    assert.match(summary, /decision source: first-parent-diff\+path-aware-stale-neutral/)
    assert.match(summary, /front deploy: skipped; only a Web image digest dispatch may deploy front/)
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
  const workflow = readFileSync(workflowPath, "utf8")

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
  assert.doesNotMatch(backupScript, forbiddenSecretBackupCopyPattern)
  assert.match(backupScript, /secret_files_copied=false/)
  assert.match(backupScript, /is_digest_image_value\(\)/)
  assert.match(backupScript, /compose_image_keys=\(AUTOHEAL_IMAGE DOCKER_SOCKET_PROXY_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE/)
  assert.match(backupScript, /is_digest_image_value "\$\{image_value\}"/)
  assert.doesNotMatch(externalBackupScript, forbiddenSecretBackupCopyPattern)
  assert.match(externalBackupScript, /secret_files_copied=false/)
  assert.match(externalBackupScript, /COMPOSE_IMAGE_METADATA_KEYS=\(AUTOHEAL_IMAGE DOCKER_SOCKET_PROXY_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE/)
  assert.match(externalBackupScript, /echo "\$\{image_key\}=\$\{image_value\}"/)
  assert.match(externalBackupScript, /metadata_backend_image_key\(\)/)
  assert.match(externalBackupScript, /for image_key in BACK_BLUE_IMAGE BACK_GREEN_IMAGE BACK_READ_IMAGE BACK_ADMIN_IMAGE BACK_WORKER_IMAGE/)
  assert.match(externalBackupScript, /read_key_from_file "\$\{image_key\}" "\$\{COMPOSE_ENV_FILE\}"/)
  assert.match(externalBackupScript, /echo "\$\{metadata_key\}=\$\{image_value\}"/)
  assert.match(backupScript, /back_blue_image=/)
  assert.match(backupScript, /back_green_image=/)
  assert.match(rollbackScript, /backup_image_key_for_service\(\)/)
  assert.match(rollbackScript, /COMPOSE_IMAGE_METADATA_KEYS=\(AUTOHEAL_IMAGE DOCKER_SOCKET_PROXY_IMAGE CLOUDFLARED_IMAGE CADDY_IMAGE/)
  assert.match(rollbackScript, /restore_compose_image_metadata/)
  assert.match(rollbackScript, /local key metadata_key repaired_value metadata_image legacy_image\s+repaired_value=""/)
  assert.match(rollbackScript, /rollback \$\{key\} restored from backup_metadata/)
  assert.match(rollbackScript, /rollback \$\{key\} repair source=backup_fallback/)
  assert.doesNotMatch(rollbackScript, /rollback \$\{key\} preserved:/)
  assert.match(rollbackScript, /repair_runtime_back_image_if_missing "\$\{target_backend\}"/)
  assert.match(recoverScript, /repair_runtime_back_image_if_missing "back_worker"/)
  assert.match(statusScript, /ACTIVE_BACKEND_IMAGE_KEY="BACK_BLUE_IMAGE"/)
  assert.match(statusScript, /ACTIVE_BACKEND_IMAGE_KEY="BACK_GREEN_IMAGE"/)
  assert.match(steadyStateGuard, /image_key="BACK_BLUE_IMAGE"/)
  assert.match(workflow, /for file in docker-compose\.prod\.yml \.active_backend; do/)
  assert.doesNotMatch(workflow, /for file in \.env\.prod docker-compose\.prod\.yml \.active_backend \.backend-release-state\.env/)
  assert.match(workflow, /PRE_DEPLOY_ENV_CONTENT="\$\(cat deploy\/homeserver\/\.env\.prod\)"/)
  assert.doesNotMatch(workflow, /printf '%s\\n' "\$\{PRE_DEPLOY_ENV_CONTENT\}" > deploy\/homeserver\/\.env\.prod/)
  assert(workflow.indexOf("PRE_DEPLOY_ENV_CONTENT=\"$(cat deploy/homeserver/.env.prod)\"") < workflow.indexOf("printf '%s\\n' \"${HOME_SERVER_ENV}\" > deploy/homeserver/.env.prod"))
  assert.match(workflow, /preserve_pre_deploy_runtime_image_env_keys\(\) \{/)
  assert.match(workflow, /resolve_repo_digest_with_pull_fallback\(\) \{/)
  assert.match(workflow, /preserved \$\{key\} from pre-deploy env after HOME_SERVER_ENV overwrite/)
  assert.match(workflow, /local digest missing for \$\{image_ref\}; pulling fallback image before deploy compose evaluation/)
  assert(
    workflow.indexOf("printf '%s\\n' \"${HOME_SERVER_ENV}\" > deploy/homeserver/.env.prod") <
      workflow.indexOf("preserve_pre_deploy_runtime_image_env_keys"),
    "pre-deploy image digests must be preserved after HOME_SERVER_ENV overwrite",
  )
  assert(
    workflow.indexOf("preserve_pre_deploy_runtime_image_env_keys") <
      workflow.indexOf('ensure_image_key_from_local_digest "AUTOHEAL_IMAGE"'),
    "image digest preserve must run before AUTOHEAL_IMAGE autofill",
  )
  assert.match(
    workflow,
    /if ! digest="\$\(resolve_repo_digest_with_pull_fallback "\$\{fallback_image\}"\)"; then/,
  )
  assert.match(steadyStateGuard, /image_key="BACK_GREEN_IMAGE"/)
  assert.doesNotMatch(statusScript, /env_value "BACK_IMAGE"/)
  assert.doesNotMatch(steadyStateGuard, /env_value "BACK_IMAGE"/)
})

test("rollback keeps the current materialized keyring and only arms after blue-green activation", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const sourceExample = readFileSync(path.join(repoRoot, "deploy/homeserver/.env.prod.example"), "utf8")
  const backExample = readFileSync(path.join(repoRoot, "deploy/homeserver/.env.back.prod.example"), "utf8")
  const rollbackStart = workflow.indexOf("run_backup_rollback() {")
  const rollbackEnd = workflow.indexOf("rollback_from_backup_if_needed() {", rollbackStart)
  const rollbackBlock = workflow.slice(rollbackStart, rollbackEnd)
  const trapGate = workflow.slice(workflow.indexOf("rollback_from_backup_if_needed() {"), workflow.indexOf("./deploy/homeserver/prune_external_backups.sh"))
  const materializedIndex = workflow.indexOf('RUNTIME_ENV_MATERIALIZED="true"')
  const blueGreenIndex = workflow.indexOf("./deploy/homeserver/blue_green_deploy.sh; then", materializedIndex)

  for (const example of [sourceExample, backExample]) {
    assert.match(example, /remove all three previous entries from authoritative HOME_SERVER_ENV/i)
    assert.match(example, /before expiry/i)
    assert.match(example, /expired previous key makes startup\/precheck\/doctor\/rollback fail/i)
  }
  assert(rollbackStart >= 0 && rollbackEnd > rollbackStart, "rollback block must be discoverable")
  assert.doesNotMatch(rollbackBlock, /PRE_DEPLOY_ENV_CONTENT/)
  assert.match(workflow, /PRE_DEPLOY_ENV_CONTENT="\$\(cat deploy\/homeserver\/\.env\.prod\)"/)
  assert.match(workflow, /previous="\$\(extract_env_value_from_text "\$\{key\}" "\$\{PRE_DEPLOY_ENV_CONTENT\}"\)"/)
  assert.match(workflow, /RUNTIME_ENV_MATERIALIZED="false"/)
  assert.match(trapGate, /if \[ "\$\{RUNTIME_ENV_MATERIALIZED\}" != "true" \]; then\s*return 0\s*fi/)
  assert(materializedIndex > 0 && materializedIndex < blueGreenIndex, "rollback must arm immediately before blue-green activation")
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

test("deploy workflows use a single MagicDNS repository variable", () => {
  const deployWorkflow = readFileSync(workflowPath, "utf8")
  const backupRestoreWorkflow = readFileSync(backupRestoreWorkflowPath, "utf8")

  for (const workflow of [deployWorkflow, backupRestoreWorkflow]) {

    assert.match(workflow, /HOME_TAILSCALE_HOST: \$\{\{ vars\.HOME_TAILSCALE_HOST \}\}/)
    assert.match(workflow, /HOME_TAILSCALE_HOST must be a full MagicDNS FQDN ending in \.ts\.net/)
    assert.match(workflow, /\^\[a-z0-9\].*\\\.ts\\\.net\$/)
    assert.doesNotMatch(workflow, /\bHOME_HOST\b/)
    assert.doesNotMatch(workflow, /\bHOME_TS_HOST\b/)
    assert.doesNotMatch(workflow, /\bHOME_SSH_HOST\b/)
    assert.doesNotMatch(workflow, /secrets\.HOME_TAILSCALE_HOST/)
  }

  assert.doesNotMatch(deployWorkflow, /bash -lc "cat < \/dev\/null > \/dev\/tcp\//)
  assert.match(
    deployWorkflow,
    /bash -c 'cat < \/dev\/null > "\/dev\/tcp\/\$1\/\$2"' bash "\$\{HOME_TAILSCALE_HOST\}" "\$\{HOME_SSH_PORT\}"/,
  )
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
  assert.match(workflow, /umask 077 && cat > '\$\{REMOTE_TMP_DIR\}\/deploy\.sh'/)
  assert.match(workflow, /bash '\$\{REMOTE_TMP_DIR\}\/deploy\.sh' <\/dev\/null/)
  assert.doesNotMatch(workflow, /REMOTE_TMP_DIR='\$\{REMOTE_TMP_DIR\}' bash -s/)
  assert.doesNotMatch(workflow, /HOME_SERVER_ENV_B64=/)
  assert.doesNotMatch(workflow, /HOME_GHCR_TOKEN_B64=/)
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
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8")
  const forbiddenCopySamples = [
    "for file in .env.prod docker-compose.prod.yml; do",
    'cp "${SCRIPT_DIR}/.env.prod" "${BACKUP_DIR}/.env.prod"',
    "install -m 600 .env.prod backup/.env.prod",
  ]

  assert.match(externalBackupScript, /^umask 077$/m)
  assert.match(deployBackupScript, /^umask 077$/m)
  assert(externalBackupScript.indexOf("umask 077") < externalBackupScript.indexOf('mkdir -p "${BACKUP_ROOT}/logs"'))
  assert(deployBackupScript.indexOf("umask 077") < deployBackupScript.indexOf('mkdir -p "${BACKUP_DIR}"'))
  for (const sample of forbiddenCopySamples) {
    assert.match(sample, forbiddenSecretBackupCopyPattern)
  }
  assert.doesNotMatch(externalBackupScript, forbiddenSecretBackupCopyPattern)
  assert.doesNotMatch(deployBackupScript, forbiddenSecretBackupCopyPattern)
  assert.doesNotMatch(rollbackScript, forbiddenSecretBackupCopyPattern)
  assert.match(gitignore, /deploy\/homeserver\/\.deploy-backups\//)
  assert.match(gitignore, /deploy\/homeserver\/\*\.backup/)
  assert.match(gitignore, /deploy\/homeserver\/\*\.enc/)
})

test("rollback healthcheck probes the network the restored compose actually attaches the backend to", () => {
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")

  assert.match(rollbackScript, /DATA_NETWORK_NAME="blog_home_data"/)
  assert.match(rollbackScript, /DEFAULT_NETWORK_NAME="blog_home_default"/)
  assert.match(rollbackScript, /compose_container_id_any_state\(\) \{/)
  assert.match(rollbackScript, /container_attached_networks\(\) \{/)
  assert.match(rollbackScript, /resolve_backend_probe_network\(\) \{/)
  assert.match(rollbackScript, /if \[\[ " \$\{networks\} " == \*" \$\{APP_NETWORK_NAME\} "\* \]\]; then/)
  assert.match(rollbackScript, /rollback backend probe network drift: \$\{backend\} is not attached to \$\{APP_NETWORK_NAME\}/)
  assert.match(rollbackScript, /local network="\$\{2:-\$\{APP_NETWORK_NAME\}\}"/)
  assert.match(rollbackScript, /docker run --rm --network "\$\{network\}" curlimages\/curl/)
  assert.doesNotMatch(rollbackScript, /docker run --rm --network "\$\{APP_NETWORK_NAME\}" curlimages\/curl/)
  assert.match(rollbackScript, /probe_network="\$\(resolve_backend_probe_network "\$\{backend\}"\)"/)
  assert.match(rollbackScript, /code="\$\(probe_backend_http_code "\$\{backend\}" "\$\{probe_network\}"\)"/)
  assert(
    rollbackScript.indexOf('probe_network="$(resolve_backend_probe_network "${backend}")"') <
      rollbackScript.indexOf('code="$(probe_backend_http_code "${backend}" "${probe_network}")"'),
    "probe network must be resolved before the rollback healthcheck loop runs",
  )
})

test("rollback backend healthcheck failure emits network and dependency diagnostics", () => {
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")

  assert.match(rollbackScript, /emit_rollback_backend_diagnostics\(\) \{/)
  assert.match(rollbackScript, /emit_rollback_backend_diagnostics "\$\{backend\}" "\$\{probe_network\}" >&2 \|\| true/)
  assert.match(rollbackScript, /rollback probe network used=\$\{probe_network\} expected=\$\{APP_NETWORK_NAME\}/)
  assert.match(rollbackScript, /compose ps -a \|\| true/)
  assert.match(rollbackScript, /compose_container_id_any_state db_1/)
  assert.match(rollbackScript, /echo "db_1 networks=\$\(container_attached_networks "\$\{container_id\}"\)"/)
  assert.match(
    rollbackScript,
    /for network in "\$\{EDGE_NETWORK_NAME\}" "\$\{APP_NETWORK_NAME\}" "\$\{DATA_NETWORK_NAME\}" "\$\{OBSERVE_NETWORK_NAME\}" "\$\{DEFAULT_NETWORK_NAME\}"/,
  )
  assert.match(rollbackScript, /docker network inspect -f '\{\{range \.Containers\}\}\{\{\.Name\}\} \{\{end\}\}'/)
  assert.match(rollbackScript, /compose logs --no-color --tail=120 "\$\{backend\}" \|\| true/)
  assert.doesNotMatch(rollbackScript, /compose logs --no-color --tail=120 "\$\{backend\}" >&2 \|\| true/)
  assert(
    rollbackScript.indexOf("rollback backend healthcheck failed: ${backend}") <
      rollbackScript.indexOf('emit_rollback_backend_diagnostics "${backend}" "${probe_network}" >&2'),
    "diagnostics must be emitted after the rollback healthcheck failure message",
  )
})

test("prod datasource uses a non-superuser runtime role contract", () => {
  const compose = readFileSync(composePath, "utf8")
  const applicationProd = readFileSync(applicationProdPath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const runtimeRoleSql = readFileSync(
    path.join(repoRoot, "deploy/homeserver/sql/provision_db_runtime_role.sql"),
    "utf8",
  )
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const envExample = readFileSync(envExamplePath, "utf8")
  const doctorScript = readFileSync(path.join(repoRoot, "deploy/homeserver/doctor.sh"), "utf8")
  const provisionFnStart = deployScript.indexOf("provision_db_runtime_role()")
  const provisionFnEnd = deployScript.indexOf("\nensure_db_runtime_guards()")
  assert(
    provisionFnStart !== -1 && provisionFnEnd > provisionFnStart,
    "provision_db_runtime_role()/ensure_db_runtime_guards() boundary markers not found",
  )
  const provisionFn = deployScript.slice(provisionFnStart, provisionFnEnd)

  assert.match(applicationProd, /username:\s*"\$\{PROD___SPRING__DATASOURCE__USERNAME\}"/)
  assert.match(applicationProd, /baseline-on-migrate:\s*false/)
  assert.match(applicationProd, /flyway:\n(?:.*\n)*\s+user:\s*"\$\{PROD___SPRING__FLYWAY__USER\}"/)
  assert.match(applicationProd, /password:\s*"\$\{PROD___SPRING__FLYWAY__PASSWORD\}"/)
  assert.doesNotMatch(applicationProd, /PROD___SPRING__FLYWAY__USER:postgres/)
  assert.doesNotMatch(applicationProd, /PROD___SPRING__FLYWAY__PASSWORD:\$\{PROD___POSTGRES__PASSWORD\}/)
  assert.match(applicationProd, /lock-retry-count:\s*\$\{PROD___SPRING__FLYWAY__LOCK_RETRY_COUNT:300\}/)
  assert.match(compose, /POSTGRES_PASSWORD:\s*\$\{PROD___POSTGRES__PASSWORD:-\$\{PROD___SPRING__DATASOURCE__PASSWORD\}\}/)
  assert.match(deployScript, /validate_db_runtime_role_env/)
  assert.match(deployScript, /provision_db_runtime_role/)
  assert.match(deployScript, /runtime datasource user must not be postgres/)
  assert.match(deployScript, /flyway user must be set \(PROD___SPRING__FLYWAY__USER\)/)
  assert.match(deployScript, /flyway user must not be postgres superuser/)
  assert.doesNotMatch(deployScript, /flyway_user="postgres"/)
  assert.match(provisionFn, /PROD___SPRING__FLYWAY__PASSWORD/)
  assert.match(provisionFn, /migration_password="\$\{flyway_password\}"/)
  assert.match(provisionFn, /sql\/provision_db_runtime_role\.sql/)
  assert.match(provisionFn, /validate_db_runtime_role_env \|\| return 1/)
  assert.match(provisionFn, /psql_err=/)
  assert.match(provisionFn, /2>&1\s*>\/dev\/null/)
  assert.doesNotMatch(provisionFn, /psql[\s\S]*>\/dev\/null 2>&1/)
  assert.match(runtimeRoleSql, /SET log_statement = 'none';/)
  assert.match(runtimeRoleSql, /SET log_min_duration_statement = -1;/)
  assert.match(runtimeRoleSql, /\\set VERBOSITY terse/)
  assert(
    runtimeRoleSql.indexOf("SET log_statement = 'none';") <
      runtimeRoleSql.indexOf("app.runtime_password") &&
      runtimeRoleSql.indexOf("\\set VERBOSITY terse") <
        runtimeRoleSql.indexOf("app.runtime_password"),
    "statement logging and verbose errors must be disabled before binding password values",
  )
  assert.match(
    runtimeRoleSql,
    /EXCEPTION WHEN OTHERS THEN\n\s+RAISE EXCEPTION 'runtime role password bootstrap failed for %: %', runtime_user, SQLERRM;/,
  )
  assert.match(
    runtimeRoleSql,
    /EXCEPTION WHEN OTHERS THEN\n\s+RAISE EXCEPTION 'migration role password bootstrap failed for %: %', migration_user, SQLERRM;/,
  )
  assert.match(runtimeRoleSql, /set_config\('app\.runtime_user',\s*:'runtime_user',\s*false\)/)
  assert.match(runtimeRoleSql, /set_config\('app\.migration_password',\s*:'migration_password',\s*false\)/)
  assert.match(runtimeRoleSql, /runtime_user text := current_setting\('app\.runtime_user'\)/)
  assert.match(runtimeRoleSql, /migration_user text := current_setting\('app\.migration_user'\)/)
  assert.match(runtimeRoleSql, /migration_password text := current_setting\('app\.migration_password'\)/)
  assert(!runtimeRoleSql.includes("runtime_user text := :'runtime_user'"))
  assert(!runtimeRoleSql.includes("runtime_password text := :'runtime_password'"))
  assert.match(runtimeRoleSql, /CREATE ROLE %I LOGIN PASSWORD %L',\s*migration_user,\s*migration_password/)
  assert.match(runtimeRoleSql, /GRANT USAGE, CREATE ON SCHEMA public TO %I',\s*migration_user/)
  assert.match(runtimeRoleSql, /GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO %I',\s*migration_user/)
  assert.match(runtimeRoleSql, /GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO %I',\s*migration_user/)
  assert.match(runtimeRoleSql, /ALTER TABLE public\.%I OWNER TO %I',\s*obj\.relname,\s*migration_user/)
  assert.match(runtimeRoleSql, /ALTER SEQUENCE public\.%I OWNER TO %I',\s*obj\.relname,\s*migration_user/)
  assert.match(
    runtimeRoleSql,
    /AND NOT \(c\.relkind = 'S' AND EXISTS \(\s*\n\s*SELECT 1 FROM pg_depend d\s*\n\s*WHERE d\.classid = 'pg_class'::regclass\s*\n\s*AND d\.objid = c\.oid\s*\n\s*AND d\.refclassid = 'pg_class'::regclass\s*\n\s*AND d\.deptype IN \('a', 'i'\)\s*\n\s*\)\)/,
    "owner transfer loop must skip serial/identity-linked sequences (ALTER SEQUENCE OWNER is rejected for them)",
  )
  assert.match(runtimeRoleSql, /ALTER ROLE %I WITH NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/)
  assert.match(runtimeRoleSql, /GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public/)
  assert.match(runtimeRoleSql, /GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public/)
  assert.match(runtimeRoleSql, /ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',\s*migration_user,\s*runtime_user/)
  assert.match(envExample, /^PROD___SPRING__FLYWAY__USER=blog_flyway$/m)
  assert.doesNotMatch(envExample, /^PROD___SPRING__FLYWAY__USER=postgres$/m)
  assert.match(doctorScript, /print_env_key_status "PROD___SPRING__FLYWAY__USER"/)
  assert.match(doctorScript, /print_env_key_status "PROD___SPRING__FLYWAY__PASSWORD"/)

  const flywayUser = (contract.targets["home-server-source"].keys || []).find(
    (key) => key.name === "PROD___SPRING__FLYWAY__USER",
  )
  const flywayPassword = (contract.targets["home-server-source"].keys || []).find(
    (key) => key.name === "PROD___SPRING__FLYWAY__PASSWORD",
  )
  assert.equal(flywayUser?.required, true)
  assert.deepEqual(flywayUser?.forbiddenValues, ["postgres"])
  assert.equal(flywayPassword?.required, true)
  assert.equal(flywayPassword?.secret, true)
})

test("homeserver compose splits service env files, networks, and exporter pg_monitor role", () => {
  const compose = readFileSync(composePath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8")
  const exporterSql = readFileSync(
    path.join(repoRoot, "deploy/homeserver/sql/provision_postgres_exporter_role.sql"),
    "utf8",
  )
  const materializeScript = readFileSync(
    path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"),
    "utf8",
  )

  assert.doesNotMatch(compose, /env_file:\n\s+- \.\/\.env\.prod\b/)
  assert.match(compose, /env_file:\n\s+- \.\/\.env\.caddy\.prod\b/)
  assert.match(compose, /env_file:\n\s+- \.\/\.env\.back\.prod\b/)
  assert.match(
    compose,
    /DATA_SOURCE_USER:\s+\$\{PROD___POSTGRES_EXPORTER__USERNAME:-postgres_exporter\}/,
  )
  assert.match(
    compose,
    /DATA_SOURCE_PASS:\s+\$\{PROD___POSTGRES_EXPORTER__PASSWORD:\?PROD___POSTGRES_EXPORTER__PASSWORD is required\}/,
  )
  assert.doesNotMatch(compose, /DATA_SOURCE_USER:\s+postgres\b/)
  assert.doesNotMatch(compose, /DATA_SOURCE_PASS:\s+\$\{PROD___POSTGRES__PASSWORD\}/)

  assert.match(compose, /name:\s+blog_home_edge/)
  assert.match(compose, /name:\s+blog_home_app/)
  assert.match(compose, /name:\s+blog_home_data/)
  assert.match(compose, /name:\s+blog_home_observe/)
  assert.doesNotMatch(compose, /^\s+default:\s*$/m)

  assert.match(deployScript, /materialize_service_env/)
  assert.match(deployScript, /validate_postgres_exporter_env/)
  assert.match(deployScript, /provision_postgres_exporter_role/)
  assert.match(deployScript, /EDGE_NETWORK_NAME="blog_home_edge"/)
  assert.match(deployScript, /APP_NETWORK_NAME="blog_home_app"/)
  assert.match(deployScript, /OBSERVE_NETWORK_NAME="blog_home_observe"/)
  assert.match(exporterSql, /GRANT pg_monitor TO/)
  assert.match(exporterSql, /NOSUPERUSER/)
  assert.match(exporterSql, /exporter user must not be postgres/)
  assert.match(materializeScript, /PROD___POSTGRES__PASSWORD/)
  assert.match(materializeScript, /is_back_key|PROD___SPRING__/)
  assert.match(
    materializeScript,
    /echo "materialize_service_env: wrote \$\(basename "\$\{CADDY_OUT\}"\), \$\(basename "\$\{BACK_OUT\}"\) and \$\(basename "\$\{FRONT_OUT\}"\)" >&2/,
  )
  assert.match(gitignore, /deploy\/homeserver\/\.env\.back\.prod/)
  assert.match(gitignore, /deploy\/homeserver\/\.env\.caddy\.prod/)

  const exporterPassword = (contract.targets["home-server-source"].keys || []).find(
    (key) => key.name === "PROD___POSTGRES_EXPORTER__PASSWORD",
  )
  const flywayPassword = (contract.targets["home-server-source"].keys || []).find(
    (key) => key.name === "PROD___SPRING__FLYWAY__PASSWORD",
  )
  const flywayUser = (contract.targets["home-server-source"].keys || []).find(
    (key) => key.name === "PROD___SPRING__FLYWAY__USER",
  )
  assert.equal(exporterPassword?.secret, true)
  assert.equal(exporterPassword?.minLength, 8)
  assert.equal(flywayPassword?.secret, true)
  assert.equal(flywayPassword?.minLength, 8)
  assert.equal(flywayPassword?.required, true)
  assert.equal(flywayUser?.required, true)
  assert.deepEqual(flywayUser?.forbiddenValues, ["postgres"])
})

test("pgroonga precheck keeps boolean query parsing resistant to stdout pollution", () => {
  const precheckScript = readFileSync(
    path.join(repoRoot, "deploy/homeserver/pgroonga_precheck.sh"),
    "utf8",
  )

  assert.match(precheckScript, /run_pgroonga_query\(\) \{/)
  assert.match(
    precheckScript,
    /awk '\/\^\[\[:space:\]\]\*\[tf\]\[\[:space:\]\]\*\$\/ \{ gsub\(\/\[\[:space:\]\]\/, ""\); value=\$0 \} END \{ print value \}'/,
  )
  assert.match(precheckScript, /\[\[ "\$\{PGROONGA_EXT_OK\}" != "t" \]\]/)
  assert.match(precheckScript, /\[\[ "\$\{PGROONGA_OP_OK\}" != "t" \]\]/)
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
  const burnInIndex = deployScript.indexOf('run_blue_green_burn_in "${next_backend}" "${active_backend}" "${web_domain}"')
  const stopOldIndex = deployScript.indexOf('checked_stop_backend_service_if_running "${active_backend}"')
  const stateWriteIndex = deployScript.indexOf('write_backend_release_state "${next_backend}" "${active_backend}"')

  assert.match(deployScript, /BLUE_GREEN_BURN_IN_STANDARD_SECONDS=/)
  assert.match(deployScript, /BLUE_GREEN_BURN_IN_HIGH_RISK_SECONDS=/)
  assert.match(deployScript, /resolve_blue_green_burn_in_seconds\(\)/)
  assert.match(deployScript, /rollback_caddy_route_only\(\)/)
  assert.match(deployScript, /run_blue_green_burn_in\(\)/)
  assert.match(deployScript, /rollback_caddy_route_only "\$\{previous_backend\}" "\$\{candidate_backend\}" "\$\{web_domain\}"/)
  assert.match(deployScript, /burn-in failed; keeping previous backend active/)
  assert.match(deployScript, /burn-in ok: candidate=.*previous=.*duration_seconds=/)
  assert(burnInIndex > 0, "deploy script must run burn-in after candidate cutover")
  assert(stopOldIndex > 0, "deploy script must still stop old backend after burn-in")
  assert(stateWriteIndex > 0, "deploy script must write release state after burn-in")
  assert(burnInIndex < stopOldIndex, "old backend must not stop before burn-in completes")
  assert(burnInIndex < stateWriteIndex, "release state must not mark candidate active before burn-in completes")
})

test("backend termination is bounded, evidenced, and completes before deploy success", () => {
  const compose = readFileSync(composePath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const application = readFileSync(path.join(repoRoot, "back/src/main/resources/application.yaml"), "utf8")
  const taskWorkerSource = readFileSync(
    path.join(repoRoot, "back/src/main/kotlin/com/back/global/task/adapter/scheduler/TaskProcessingScheduledJob.kt"),
    "utf8",
  )
  const backendServices = ["back_blue", "back_green", "back_read", "back_admin", "back_worker"]
  const lifecycleBudget = Number(application.match(/timeout-per-shutdown-phase:\s*(\d+)s/)?.[1])

  assert(Number.isFinite(lifecycleBudget), "application lifecycle budget must be parseable")

  const serviceBlock = (service) => {
    const marker = `  ${service}:\n`
    const start = compose.indexOf(marker)
    assert.notEqual(start, -1, `${service} block must exist`)
    const tail = compose.slice(start + marker.length)
    const next = tail.search(/\n  [a-zA-Z0-9_]+:\n/)
    return compose.slice(start, next === -1 ? compose.length : start + marker.length + next)
  }

  for (const service of backendServices) {
    const grace = Number(serviceBlock(service).match(/stop_grace_period:\s*(\d+)s/)?.[1])
    assert(Number.isFinite(grace), `${service} must declare a stop grace period`)
    assert(grace > 2 * lifecycleBudget, `${service} grace must exceed both lifecycle phases`)
  }

  const stopHelper = extractTopLevelShellFunction(deployScript, "checked_stop_backend_service_if_running")
  assert.doesNotMatch(deployScript, /STREAM_DRAIN_SECONDS/)
  assert.match(stopHelper, /if ! container_id="\$\(compose ps -q "\$\{service\}"\)"; then/)
  assert.match(stopHelper, /pre_stop_container_query_failed/)
  assert.match(stopHelper, /if \[\[ -z "\$\{container_id\}" \]\]; then/)
  assert.match(stopHelper, /date -u \+%Y-%m-%dT%H:%M:%SZ/)
  assert.match(stopHelper, /compose stop "\$\{service\}"/)
  assert.doesNotMatch(stopHelper, /compose stop[^\n]*\|\| true/)
  assert.match(stopHelper, /if ! compose stop "\$\{service\}"; then[\s\S]*return 1/)
  assert.match(stopHelper, /docker logs --since "\$\{stop_started_at\}" "\$\{container_id\}"/)
  assert.match(stopHelper, /drain_log_query_failed/)
  assert(taskWorkerSource.includes("Task worker drain timed out after") && stopHelper.includes("Task worker drain timed out after"))
  assert(taskWorkerSource.includes("Task worker drain interrupted; interrupting active workers") && stopHelper.includes("Task worker drain interrupted; interrupting active workers"))
  assert.match(stopHelper, /worker_drain_timeout/)
  assert.match(stopHelper, /worker_drain_interrupted/)
  assert.match(stopHelper, /docker inspect --format/)
  assert.match(stopHelper, /\{\{\.State\.Running\}\}/)
  assert.match(stopHelper, /\{\{\.State\.ExitCode\}\}/)
  assert.match(stopHelper, /\{\{\.State\.OOMKilled\}\}/)
  assert.match(stopHelper, /\$\{status\}" != "exited"/)
  assert.match(stopHelper, /\$\{oom_killed\}" != "false"/)
  assert.match(stopHelper, /exit_code != 0 && exit_code != 143/)
  assert.match(stopHelper, /still running/)
  const timestampIndex = stopHelper.indexOf('date -u +%Y-%m-%dT%H:%M:%SZ')
  const stopIndex = stopHelper.indexOf('compose stop "${service}"')
  const logsIndex = stopHelper.indexOf('docker logs --since "${stop_started_at}" "${container_id}"')
  assert(timestampIndex >= 0 && stopIndex >= 0 && logsIndex >= 0, "stop evidence markers must exist")
  assert(timestampIndex < stopIndex && stopIndex < logsIndex, "timestamp, stop, then exact-container logs is required")

  const mainBurnIn = deployScript.indexOf('run_blue_green_burn_in "${next_backend}" "${active_backend}" "${web_domain}"')
  const mainStop = deployScript.indexOf('checked_stop_backend_service_if_running "${active_backend}"')
  const mainState = deployScript.indexOf('echo "${next_backend}" > "${STATE_FILE}"')
  const mainSuccess = deployScript.indexOf('post-switch verify ok (status=${post_code}); burn-in complete; inactive backend stopped')
  assert(mainBurnIn >= 0 && mainState >= 0 && mainStop >= 0 && mainSuccess >= 0, "main deploy lifecycle markers must exist")
  assert(mainBurnIn < mainState && mainState < mainStop && mainStop < mainSuccess, "route state must precede checked termination and final success")
  assert.match(deployScript, /if ! checked_stop_backend_service_if_running "\$\{active_backend\}"; then[\s\S]*exit 1/)

  const rollback = extractTopLevelShellFunction(deployScript, "rollback_to_backend")
  const rollbackState = rollback.indexOf('printf \'%s\\n\' "${rollback_backend}" > "${STATE_FILE}"')
  const rollbackStop = rollback.indexOf('checked_stop_backend_service_if_running "${inactive_backend}"')
  assert(rollbackState >= 0 && rollbackStop >= 0, "rollback state and termination markers must exist")
  assert(rollbackState < rollbackStop, "rollback route metadata must precede termination")
  assert.match(rollback, /if ! printf '%s\\n' "\$\{rollback_backend\}" > "\$\{STATE_FILE\}"; then[\s\S]*return 1/)
  assert.match(rollback, /if ! write_backend_release_state "\$\{rollback_backend\}" "\$\{inactive_backend\}"; then[\s\S]*return 1/)
  assert.match(rollback, /if ! checked_stop_backend_service_if_running "\$\{inactive_backend\}"; then[\s\S]*return 1/)

  const burnInRollback = extractTopLevelShellFunction(deployScript, "rollback_caddy_route_only")
  const burnInRollbackState = burnInRollback.indexOf('printf \'%s\\n\' "${previous_backend}" > "${STATE_FILE}"')
  const burnInRollbackStop = burnInRollback.lastIndexOf('checked_stop_backend_service_if_running "${candidate_backend}"')
  assert(burnInRollbackState >= 0 && burnInRollbackStop >= 0, "burn-in rollback state and termination markers must exist")
  assert(burnInRollbackState < burnInRollbackStop, "burn-in rollback state must precede termination")
  assert.match(burnInRollback, /if ! printf '%s\\n' "\$\{previous_backend\}" > "\$\{STATE_FILE\}"; then[\s\S]*return 1/)
  assert.match(burnInRollback, /if ! write_backend_release_state "\$\{previous_backend\}" "\$\{candidate_backend\}"; then[\s\S]*return 1/)
  assert.match(burnInRollback, /if ! checked_stop_backend_service_if_running "\$\{candidate_backend\}"; then[\s\S]*return 1/)

  for (const functionName of [
    "start_runtime_split_helper_backends_on_active",
    "restart_runtime_split_backends_after_candidate_ready",
    "restore_runtime_split_helper_backends_to_active",
  ]) {
    const block = extractTopLevelShellFunction(deployScript, functionName)
    const stopLoop = block.indexOf('for service in "${helper_services[@]}"; do')
    const recreate = block.indexOf('compose_up_force_recreate_with_retry "${helper_services[@]}"')
    assert(stopLoop >= 0 && recreate >= 0, `${functionName} must define helper termination and replacement`)
    assert(stopLoop < recreate, `${functionName} must check every replaced helper before recreation`)
    assert.match(block.slice(stopLoop, recreate), /checked_stop_backend_service_if_running "\$\{service\}"/)
    assert.match(block.slice(stopLoop, recreate), /return 1/)
  }

  const restoreHelpers = extractTopLevelShellFunction(deployScript, "restore_runtime_split_helper_backends_to_active")
  assert.match(restoreHelpers, /back_worker" && "\$\{TASK_SCHEMA_COMPATIBLE_WORKER_READY\}" == "true"/)
  assert(restoreHelpers.indexOf('continue') < restoreHelpers.indexOf('helper_services+=("${service}")'), "preserved worker must not enter the replacement stop list")
  assert.doesNotMatch(deployScript, /compose stop "\$\{(?:next_backend|candidate_backend)\}" \|\| true/)
})

test("blue-green deploy waits longer for candidate Flyway startup only", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const candidateStart = deployScript.indexOf("check_candidate_backend_health()")
  const candidateEnd = deployScript.indexOf("check_notification_sse_route()")
  assert.notEqual(candidateStart, -1, "candidate health helper marker must exist")
  assert.notEqual(candidateEnd, -1, "notification route marker must exist")
  const candidateHealthBlock = deployScript.slice(candidateStart, candidateEnd)

  const deployJobStart = workflow.indexOf("  blueGreenDeploy:")
  assert.notEqual(deployJobStart, -1, "blueGreenDeploy job marker must exist")
  const blueGreenDeployJob = workflow.slice(deployJobStart)

  assert.match(deployScript, /CANDIDATE_HEALTHCHECK_RETRIES="\$\{CANDIDATE_HEALTHCHECK_RETRIES:-450\}"/)
  assert.match(deployScript, /CANDIDATE_HEALTHCHECK_RETRIES="\$\(normalize_positive_int "\$\{CANDIDATE_HEALTHCHECK_RETRIES\}" "450"\)"/)
  assert.match(candidateHealthBlock, /local previous_retries="\$\{HEALTHCHECK_RETRIES\}"/)
  assert.match(candidateHealthBlock, /HEALTHCHECK_RETRIES="\$\{CANDIDATE_HEALTHCHECK_RETRIES\}"/)
  assert.match(candidateHealthBlock, /HEALTHCHECK_RETRIES="\$\{previous_retries\}"/)
  assert.match(blueGreenDeployJob, /timeout-minutes:\s*75/)
  assert.match(
    workflow,
    /CANDIDATE_HEALTHCHECK_RETRIES=450 \.\/deploy\/homeserver\/blue_green_deploy\.sh/,
  )
})

test("runtime-split memory tuner allocates the 4160MiB RSS budget and rejects lower explicit caps", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const normalizePositiveInt = deployScript.slice(
    deployScript.indexOf("normalize_positive_int()"),
    deployScript.indexOf("normalize_non_negative_int()"),
  )
  const memoryDefault = deployScript.slice(
    deployScript.indexOf("AUTO_MEMORY_TUNER_DEFAULT_MAX_BUDGET_MB=4096"),
    deployScript.indexOf(
      "AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB=",
      deployScript.indexOf("AUTO_MEMORY_TUNER_DEFAULT_MAX_BUDGET_MB=4096"),
    ),
  )
  const allocatorHelpers = deployScript.slice(
    deployScript.indexOf("round_to_step_mb()"),
    deployScript.indexOf("allocate_single_runtime_memory_limits()"),
  )
  const memoryTuner = deployScript.slice(
    deployScript.indexOf("apply_auto_memory_tuner()"),
    deployScript.indexOf("resolve_local_repo_digest()"),
  )
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-runtime-split-memory-"))

  try {
    for (const [runtimeSplitEnabled, expectedBudget] of [
      ["false", "4096"],
      ["true", "4160"],
    ]) {
      const defaultScript = path.join(workDir, `default-${runtimeSplitEnabled}.sh`)
      writeFileSync(
        defaultScript,
        [
          `RUNTIME_SPLIT_ENABLED=${runtimeSplitEnabled}`,
          'AUTO_MEMORY_TUNER_MAX_BUDGET_MB=""',
          normalizePositiveInt,
          memoryDefault,
          'printf "%s\\n" "${AUTO_MEMORY_TUNER_MAX_BUDGET_MB}"',
          "",
        ].join("\n"),
      )
      assert.equal(execFileSync("bash", [defaultScript], { encoding: "utf8" }).trim(), expectedBudget)
    }

    const allocationScript = path.join(workDir, "allocation.sh")
    writeFileSync(
      allocationScript,
      [
        allocatorHelpers,
        "allocate_runtime_split_memory_limits 4160",
        'printf "%s %s %s %s %s %s %s %s\\n" "${AUTO_TUNED_BACK_MEM_LIMIT_MB}" "${AUTO_TUNED_BACK_READ_MEM_LIMIT_MB}" "${AUTO_TUNED_BACK_ADMIN_MEM_LIMIT_MB}" "${AUTO_TUNED_BACK_WORKER_MEM_LIMIT_MB}" "${AUTO_TUNED_BACK_MEM_RESERVATION_MB}" "${AUTO_TUNED_BACK_READ_MEM_RESERVATION_MB}" "${AUTO_TUNED_BACK_ADMIN_MEM_RESERVATION_MB}" "${AUTO_TUNED_BACK_WORKER_MEM_RESERVATION_MB}"',
        "",
      ].join("\n"),
    )
    const allocationOutput = execFileSync("bash", [allocationScript], { encoding: "utf8" })
    assert.equal(allocationOutput.trim(), "704 832 896 1024 320 384 448 768")

    const applyScript = path.join(workDir, "apply.sh")
    writeFileSync(
      applyScript,
      [
        "AUTO_MEMORY_TUNER_ENABLED=true",
        "RUNTIME_SPLIT_ENABLED=true",
        "RUNTIME_SPLIT_STAGE=A",
        "AUTO_MEMORY_TUNER_MAX_BUDGET_MB=4160",
        "AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB=2048",
        "AUTO_MEMORY_TUNER_MIN_BUDGET_MB=1280",
        "read_host_mem_total_mb() { echo 8192; }",
        'upsert_env_key() { printf "%s=%s\\n" "$1" "$2"; }',
        allocatorHelpers,
        memoryTuner,
        "apply_auto_memory_tuner",
        "",
      ].join("\n"),
    )
    const applyOutput = execFileSync("bash", [applyScript], { encoding: "utf8" })
    assert.match(applyOutput, /^BACK_WORKER_MEM_LIMIT=1024m$/m)
    assert.match(applyOutput, /^BACK_WORKER_MEM_RESERVATION=768m$/m)

    const invalidBudgetScript = path.join(workDir, "invalid-budget.sh")
    writeFileSync(
      invalidBudgetScript,
      [
        "AUTO_MEMORY_TUNER_ENABLED=true",
        "RUNTIME_SPLIT_ENABLED=true",
        "AUTO_MEMORY_TUNER_MAX_BUDGET_MB=4159",
        "AUTO_MEMORY_TUNER_SYSTEM_RESERVE_MB=2048",
        "AUTO_MEMORY_TUNER_MIN_BUDGET_MB=1280",
        "read_host_mem_total_mb() { echo 8192; }",
        "upsert_env_key() { :; }",
        allocatorHelpers,
        memoryTuner,
        "apply_auto_memory_tuner",
        "",
      ].join("\n"),
    )
    assert.throws(
      () => execFileSync("bash", [invalidBudgetScript], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
      (error) => {
        assert.equal(error.status, 1)
        assert.equal(
          error.stderr.trim(),
          "auto-memory-tuner guard: invalid max budget (max_budget_mb=4159 < mode_min_budget_mb=4160)",
        )
        return true
      },
    )
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})

test("runtime-split helper backends do not compete with candidate Flyway migration", () => {
  const compose = readFileSync(composePath, "utf8")
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const helperServices = ["back_read", "back_admin", "back_worker"]

  const serviceBlock = (service) => {
    const marker = `  ${service}:\n`
    const start = compose.indexOf(marker)
    assert.notEqual(start, -1, `${service} block must exist`)
    const tailStart = start + marker.length
    const tail = compose.slice(tailStart)
    const next = tail.search(/\n  [a-zA-Z0-9_]+:\n/)
    return compose.slice(start, next === -1 ? compose.length : tailStart + next)
  }

  for (const service of helperServices) {
    assert.match(serviceBlock(service), /SPRING_FLYWAY_ENABLED:\s*"false"/)
  }

  const backendHttpHostBlock = deployScript.slice(
    deployScript.indexOf("backend_http_host()"),
    deployScript.indexOf("resolve_in_caddy()"),
  )
  const backendDnsBlock = deployScript.slice(
    deployScript.indexOf("check_backend_dns_from_caddy()"),
    deployScript.indexOf("is_backend_running()"),
  )
  const helperRestartBlock = deployScript.slice(
    deployScript.indexOf("restart_runtime_split_backends_after_candidate_ready()"),
    deployScript.indexOf("probe_caddy_http_code()"),
  )
  const prepareImagesBlock = deployScript.slice(
    deployScript.indexOf("prepare_runtime_backend_images()"),
    deployScript.indexOf("require_nonempty_env_key()"),
  )
  const activeHelperStartBlock = deployScript.slice(
    deployScript.indexOf("start_runtime_split_helper_backends_on_active()"),
    deployScript.indexOf("restart_runtime_split_backends_after_candidate_ready()"),
  )
  const rollbackBlock = deployScript.slice(
    deployScript.indexOf("rollback_to_backend()"),
    deployScript.indexOf('if [[ ! -f "${ENV_FILE}" ]]'),
  )
  const burnInRollbackBlock = deployScript.slice(
    deployScript.indexOf("rollback_caddy_route_only()"),
    deployScript.indexOf("run_blue_green_burn_in()"),
  )
  const preCandidateBootStart = deployScript.indexOf("services_to_boot=(")
  const preCandidateBootEnd = deployScript.indexOf('compose_up_with_retry "${services_to_boot[@]}"')
  const activeHelperGuardIndex = deployScript.indexOf('if is_backend_running "${active_backend}"; then')
  const activeHelperStartIndex = deployScript.indexOf('start_runtime_split_helper_backends_on_active "${active_backend}"')
  const activeBackendRunningFlagInitIndex = deployScript.indexOf('active_backend_was_running="false"')
  const activeBackendRunningFlagSetIndex = deployScript.indexOf('active_backend_was_running="true"')
  const edgeBootIndex = deployScript.indexOf("edge_services_to_boot=(caddy cloudflared)")
  const preCandidateCloudflaredCheckIndex = deployScript.indexOf('check_cloudflared_runtime "${web_domain}"', edgeBootIndex)
  const preCandidateCloudflaredSkipIndex = deployScript.indexOf(
    "skip cloudflared runtime check before candidate health: active backend is not running",
  )
  const helperPrebootFlagInitIndex = deployScript.indexOf('runtime_split_helpers_prebooted="false"')
  const helperPrebootFlagSetIndex = deployScript.indexOf('runtime_split_helpers_prebooted="true"')
  const preCandidateHelperDnsSkipIndex = deployScript.indexOf(
    "skip runtime helper dns check before candidate health: helpers were not prebooted",
  )
  const candidateHealthIndex = deployScript.indexOf('check_candidate_backend_health "${next_backend}"')
  const helperRestartIndex = deployScript.indexOf('if ! restart_runtime_split_backends_after_candidate_ready "${next_backend}"; then')
  const postRestartHelperDnsIndex = deployScript.indexOf(
    'check_backend_dns_from_caddy "back_read"',
    helperRestartIndex,
  )
  const rollbackRouteIndex = rollbackBlock.indexOf('switch_caddy_upstream "${rollback_backend}"')
  const rollbackRestoreIndex = rollbackBlock.indexOf('restore_runtime_split_helper_backends_to_active "${rollback_backend}" "${inactive_backend}"')
  const rollbackHelperFailIndex = rollbackBlock.indexOf("rollback failed: helper recovery failed after route rollback")
  const rollbackStateWriteIndex = rollbackBlock.indexOf('printf \'%s\\n\' "${rollback_backend}" > "${STATE_FILE}"')
  const burnInRollbackRouteIndex = burnInRollbackBlock.indexOf('switch_caddy_upstream "${previous_backend}"')
  const burnInRollbackRestoreIndex = burnInRollbackBlock.indexOf('restore_runtime_split_helper_backends_to_active "${previous_backend}" "${candidate_backend}"')
  const burnInRollbackHelperFailIndex = burnInRollbackBlock.indexOf(
    "burn-in rollback failed: helper recovery failed after route rollback",
  )
  const burnInRollbackStateWriteIndex = burnInRollbackBlock.indexOf('printf \'%s\\n\' "${previous_backend}" > "${STATE_FILE}"')

  assert.match(backendHttpHostBlock, /back_blue\|back_green\|back_read\|back_admin\|back_worker/)
  assert.match(backendDnsBlock, /host="\$\(backend_http_host "\$\{backend\}"\)"/)
  assert.match(prepareImagesBlock, /for service in back_read back_admin back_worker; do/)
  assert.match(prepareImagesBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{active_image\}"/)
  assert.match(activeHelperStartBlock, /compose_up_force_recreate_with_retry "\$\{helper_services\[@\]\}"/)
  assert.match(activeHelperStartBlock, /if ! check_backend_health "\$\{service\}"; then/)
  assert.match(helperRestartBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{candidate_image\}"/)
  assert.match(helperRestartBlock, /if ! check_backend_health "\$\{service\}"; then/)
  assert.match(helperRestartBlock, /TASK_SCHEMA_COMPATIBLE_WORKER_READY="true"/)
  assert.match(helperRestartBlock, /TASK_SCHEMA_WORKER_FLOOR_REQUIRED/)
  assert.match(helperRestartBlock, /restore_runtime_split_helper_backends_to_active\(\)/)
  assert.match(helperRestartBlock, /preserving schema-compatible worker image during API rollback/)
  assert.match(helperRestartBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{active_image\}"/)
  assert.doesNotMatch(helperRestartBlock, /write_backend_release_state/)
  assert.match(rollbackBlock, /if ! restore_runtime_split_helper_backends_to_active "\$\{rollback_backend\}" "\$\{inactive_backend\}"; then/)
  assert.match(burnInRollbackBlock, /if ! restore_runtime_split_helper_backends_to_active "\$\{previous_backend\}" "\$\{candidate_backend\}"; then/)
  assert.match(deployScript, /skip active-image helper preboot: active backend is not running/)
  assert(preCandidateBootStart > 0, "deploy script must build the pre-candidate boot list")
  assert(preCandidateBootEnd > preCandidateBootStart, "deploy script must boot infra before the candidate")
  assert(activeBackendRunningFlagInitIndex > preCandidateBootEnd, "active backend running gate must initialize after data infra boot")
  assert(activeHelperGuardIndex > preCandidateBootEnd, "active helper preboot must check that active backend is running")
  assert(activeBackendRunningFlagSetIndex > activeHelperGuardIndex, "active backend running gate must only flip inside running-active branch")
  assert(activeHelperStartIndex > preCandidateBootEnd, "runtime split helpers must start on active image after data infra")
  assert(activeHelperStartIndex > activeHelperGuardIndex, "runtime split helpers must not preboot on fresh deployments")
  assert(preCandidateCloudflaredCheckIndex > edgeBootIndex, "early cloudflared check must run after edge boot")
  assert(preCandidateCloudflaredSkipIndex > edgeBootIndex, "fresh deploys must skip early cloudflared public readiness before backend route exists")
  assert(helperPrebootFlagInitIndex > preCandidateBootEnd, "helper DNS gate state must initialize after data infra boot")
  assert(helperPrebootFlagSetIndex > activeHelperStartIndex, "helper DNS gate state must only flip after active helper preboot")
  assert(
    preCandidateHelperDnsSkipIndex > activeHelperStartIndex,
    "fresh runtime-split deploys must skip helper DNS checks before helpers start",
  )
  assert(edgeBootIndex > activeHelperStartIndex, "edge services must start after active-image helpers exist")
  assert(candidateHealthIndex > preCandidateBootEnd, "candidate healthcheck must happen after infra boot")
  assert.match(deployScript, /if ! check_candidate_backend_health "\$\{next_backend\}"; then/)
  assert.match(deployScript, /candidate backend health failed before cutover: \$\{next_backend\}/)
  assert(helperRestartIndex > candidateHealthIndex, "runtime split helpers must restart after candidate health with explicit failure handling")
  const workerFloorIndex = deployScript.indexOf("resolve_task_schema_worker_floor", candidateHealthIndex)
  assert(workerFloorIndex > candidateHealthIndex, "worker rollback floor must resolve after candidate Flyway health")
  assert(workerFloorIndex < helperRestartIndex, "worker rollback floor must resolve before candidate worker restart")
  assert(postRestartHelperDnsIndex > helperRestartIndex, "helper DNS checks must run after candidate-backed helper startup")
  assert(rollbackRouteIndex >= 0, "rollback must switch caddy route")
  assert(rollbackRestoreIndex > rollbackRouteIndex, "rollback helper recovery must run after route rollback")
  assert(rollbackHelperFailIndex > rollbackRestoreIndex, "rollback helper recovery failure must be explicit")
  assert(
    rollbackStateWriteIndex > rollbackHelperFailIndex &&
      rollbackBlock.slice(rollbackHelperFailIndex, rollbackStateWriteIndex).includes("return 1"),
    "rollback must fail before writing active state when helper recovery fails",
  )
  assert(burnInRollbackRouteIndex >= 0, "burn-in rollback must switch caddy route")
  assert(burnInRollbackRestoreIndex > burnInRollbackRouteIndex, "burn-in helper recovery must run after route rollback")
  assert(burnInRollbackHelperFailIndex > burnInRollbackRestoreIndex, "burn-in helper recovery failure must be explicit")
  assert(
    burnInRollbackStateWriteIndex > burnInRollbackHelperFailIndex &&
      burnInRollbackBlock.slice(burnInRollbackHelperFailIndex, burnInRollbackStateWriteIndex).includes("return 1"),
    "burn-in rollback must fail before writing active state when helper recovery fails",
  )
  assert.match(
    deployScript,
    /restore_runtime_split_helper_backends_to_active "\$\{active_backend\}" "\$\{next_backend\}" \|\| true/,
  )
  assert.doesNotMatch(deployScript, /compose stop "\$\{next_backend\}" \|\| true/)

  const preCandidateBoot = deployScript.slice(preCandidateBootStart, preCandidateBootEnd)
  for (const service of helperServices) {
    assert(!preCandidateBoot.includes(service), `${service} must not start before candidate migration`)
  }
  assert(!preCandidateBoot.includes("caddy"), "caddy must wait until active-image helpers exist")
  assert(!preCandidateBoot.includes("cloudflared"), "cloudflared must wait until active-image helpers exist")
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

  for (const target of ["back-blue:8080", "back-green:8080", "back-read:8080", "back-admin:8080", "back-worker:8080"]) {
    assert.match(prometheus, new RegExp(`- ${target.replace(".", "\\.")}`))
  }

  assert.match(prometheus, /deploy_color: blue/)
  assert.match(prometheus, /deploy_color: green/)
  assert.match(prometheus, /component: api/)
  assert.match(prometheus, /component: read/)
  assert.match(prometheus, /component: admin/)
  assert.match(prometheus, /component: worker/)
  assert.match(taskAlerts, /max\(up\{job="back",service="aquila-back",component="api"\}\) < 1/)
  assert.match(taskAlerts, /AquilaBackWorkerScrapeDown/)
  assert.match(taskAlerts, /max\(up\{job="back",service="aquila-back",component="worker"\}\) < 1/)
  assert.match(taskAlerts, /AquilaBackRuntimeSplitScrapeDown/)
  assert.match(taskAlerts, /component=~"read\|admin"/)
  assert.match(taskAlerts, /docker_container_running\{job="docker_runtime_probe",service=~"back_\(read\|admin\)"\}/)
  assert.doesNotMatch(taskAlerts, /min\(up\{job="back",service="aquila-back"\}\) < 1/)
  assert.match(exampleTaskAlerts, /max\(up\{job="back",service="aquila-back",component="api"\}\) < 1/)
  assert.match(exampleTaskAlerts, /AquilaBackWorkerScrapeDown/)
  assert.match(exampleTaskAlerts, /AquilaBackRuntimeSplitScrapeDown/)
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

const extractDeployRemoteFunctions = (functionNames) => {
  const lines = readFileSync(workflowPath, "utf8").split("\n")
  const indent = " ".repeat(10)
  return functionNames
    .map((name) => {
      const start = lines.indexOf(`${indent}${name}() {`)
      assert.notEqual(start, -1, `${name} not found in deploy workflow remote script`)
      const end = lines.findIndex((line, index) => index > start && line === `${indent}}`)
      assert.notEqual(end, -1, `${name} block is not closed in deploy workflow remote script`)
      return lines
        .slice(start, end + 1)
        .map((line) => (line.startsWith(indent) ? line.slice(indent.length) : line))
        .join("\n")
    })
    .join("\n\n")
}

test("remove_env_key removes every validator-accepted retired assignment without printing values", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-retired-env-key-"))
  try {
    const envFile = path.join(workDir, "home-server.env")
    const preserved = ["# keep this comment", "", "UNRELATED_KEY=preserved"]
    writeFileSync(
      envFile,
      [
        `${retiredLegacyApiDomain}=canonical-secret`,
        ` export ${retiredLegacyApiDomain} = exported-secret`,
        `  ${retiredLegacyApiDomain} = spaced-secret`,
        ...preserved,
        "",
      ].join("\n"),
    )
    const script = ["set -euo pipefail", extractDeployRemoteFunctions(["remove_env_key"]), `remove_env_key ${retiredLegacyApiDomain} ${envFile}`].join("\n")
    const output = execFileSync("bash", ["-c", script], { encoding: "utf8" })

    assert.equal(output, "", "retired assignment values must not be logged")
    const result = readFileSync(envFile, "utf8")
    assert.doesNotMatch(result, new RegExp(`^\\s*(?:export\\s+)?${retiredLegacyApiDomain}\\s*=`, "m"))
    assert.equal(result, `${preserved.join("\n")}\n`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
})

test("HOME_SERVER_ENV image digest는 pre-deploy 보존값보다 우선한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const staleDigest = "willfarrell/autoheal@sha256:31f580ef0279eaced5b38d631b08c474d70d8403c1c2fdd6ddcf2e879d5f3f7c"
  const freshDigest = "willfarrell/autoheal@sha256:201d007d40e3dc395b1176052ea8fe1cf5c4cf69c6d5aeeda6fcdeb256f2400d"

  assert.match(workflow, /HOME_SERVER_ENV overrides \$\{key\} from pre-deploy env: \$\{previous\} -> \$\{current\}/)
  assert.match(workflow, /preserved \$\{key\} from pre-deploy env after HOME_SERVER_ENV overwrite/)
  assert.match(workflow, /require_digest_image_key "AUTOHEAL_IMAGE"/)

  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-preserve-priority-"))
  try {
    const functions = extractDeployRemoteFunctions([
      "upsert_env_key",
      "extract_env_value_from_text",
      "extract_env_value",
      "preserve_pre_deploy_runtime_image_env_keys",
    ])
    const scriptPath = path.join(workDir, "preserve.sh")
    writeFileSync(
      scriptPath,
      [
        "set -euo pipefail",
        `cd ${JSON.stringify(workDir)}`,
        "mkdir -p deploy/homeserver",
        'PRE_DEPLOY_ENV_CAPTURED="true"',
        `PRE_DEPLOY_ENV_CONTENT="FOO=bar\nAUTOHEAL_IMAGE=${staleDigest}"`,
        functions,
        `printf 'FOO=bar\\nAUTOHEAL_IMAGE=%s\\n' ${JSON.stringify(freshDigest)} > deploy/homeserver/.env.prod`,
        "preserve_pre_deploy_runtime_image_env_keys",
        'echo "secret-wins=$(extract_env_value AUTOHEAL_IMAGE)"',
        "printf 'FOO=bar\\n' > deploy/homeserver/.env.prod",
        "preserve_pre_deploy_runtime_image_env_keys",
        'echo "preserve-fallback=$(extract_env_value AUTOHEAL_IMAGE)"',
        // 빈 값은 미설정과 같이 취급해 pre-deploy 값을 복원한다.
        "printf 'FOO=bar\\nAUTOHEAL_IMAGE=\\n' > deploy/homeserver/.env.prod",
        "preserve_pre_deploy_runtime_image_env_keys",
        'echo "empty-value=$(extract_env_value AUTOHEAL_IMAGE)"',
        // 값이 같으면 override 로그도 preserve 로그도 남기지 않는다.
        `printf 'FOO=bar\\nAUTOHEAL_IMAGE=%s\\n' ${JSON.stringify(staleDigest)} > deploy/homeserver/.env.prod`,
        'echo "identical-begin"',
        "preserve_pre_deploy_runtime_image_env_keys",
        'echo "identical-end=$(extract_env_value AUTOHEAL_IMAGE)"',
        // pre-deploy capture 실패 시에는 .env.prod를 전혀 건드리지 않는다.
        'PRE_DEPLOY_ENV_CAPTURED="false"',
        "printf 'FOO=bar\\n' > deploy/homeserver/.env.prod",
        "preserve_pre_deploy_runtime_image_env_keys",
        'echo "no-capture=[$(extract_env_value AUTOHEAL_IMAGE)]"',
        `echo "no-capture-env=$(tr '\\n' ';' < deploy/homeserver/.env.prod)"`,
        "",
      ].join("\n"),
    )

    const output = execFileSync("bash", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    assert.match(output, new RegExp(`^secret-wins=${freshDigest}$`, "m"))
    assert.match(output, new RegExp(`^preserve-fallback=${staleDigest}$`, "m"))
    assert.match(output, new RegExp(`HOME_SERVER_ENV overrides AUTOHEAL_IMAGE from pre-deploy env: ${staleDigest} -> ${freshDigest}`))
    assert.match(output, /preserved AUTOHEAL_IMAGE from pre-deploy env after HOME_SERVER_ENV overwrite/)
    assert.match(output, new RegExp(`^empty-value=${staleDigest}$`, "m"))

    const identicalSegment = output.slice(output.indexOf("identical-begin"), output.indexOf("identical-end="))
    assert.doesNotMatch(identicalSegment, /HOME_SERVER_ENV overrides AUTOHEAL_IMAGE/)
    assert.doesNotMatch(identicalSegment, /preserved AUTOHEAL_IMAGE/)
    assert.match(output, new RegExp(`^identical-end=${staleDigest}$`, "m"))

    assert.match(output, /^no-capture=\[\]$/m)
    assert.match(output, /^no-capture-env=FOO=bar;$/m)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("MinIO bootstrap은 required backend runtime image digest를 보존한다", () => {
  const staleDigests = Object.fromEntries(
    runtimeBackendImageKeys.map((key, index) => [
      key,
      `ghcr.io/aquilaxk/aquila-blog-back@sha256:${"abcde"[index].repeat(64)}`,
    ]),
  )
  const sourceBlueDigest = `ghcr.io/aquilaxk/aquila-blog-back@sha256:${"f".repeat(64)}`
  const supersededSourceBlueDigest = `ghcr.io/aquilaxk/aquila-blog-back@sha256:${"9".repeat(64)}`
  const preDeployEnv = runtimeBackendImageKeys
    .map((key) => `  export ${key} = '${staleDigests[key]}'`)
    .join("\r\n")
    .concat("\r\n")
  const sourceEnv = [
    `BACK_BLUE_IMAGE=${supersededSourceBlueDigest}`,
    `  export BACK_BLUE_IMAGE = "${sourceBlueDigest}"`,
  ]
    .join("\r\n")
    .concat("\r\n")
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-back-image-preserve-"))
  const preDeployEnvPath = path.join(workDir, "pre-deploy.env")
  const sourceEnvPath = path.join(workDir, "source.env")

  try {
    writeFileSync(preDeployEnvPath, preDeployEnv)
    writeFileSync(sourceEnvPath, sourceEnv)
    const functions = extractDeployRemoteFunctions([
      "upsert_env_key",
      "extract_env_value_from_text",
      "extract_env_value",
      "preserve_pre_deploy_runtime_image_env_keys",
    ])
    const scriptPath = path.join(workDir, "preserve-back-images.sh")
    writeFileSync(
      scriptPath,
      [
        "set -euo pipefail",
        `cd ${JSON.stringify(workDir)}`,
        "mkdir -p deploy/homeserver",
        'PRE_DEPLOY_ENV_CAPTURED="true"',
        `PRE_DEPLOY_ENV_CONTENT="$(cat ${JSON.stringify(preDeployEnvPath)})"`,
        functions,
        `cp ${JSON.stringify(sourceEnvPath)} deploy/homeserver/.env.prod`,
        "preserve_pre_deploy_runtime_image_env_keys",
        `for key in ${runtimeBackendImageKeys.join(" ")}; do echo "$key=$(extract_env_value "$key")"; done`,
        "",
      ].join("\n"),
    )

    const output = execFileSync("bash", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    assert.match(output, new RegExp(`^BACK_BLUE_IMAGE=${sourceBlueDigest}$`, "m"))
    assert.match(
      output,
      new RegExp(
        `HOME_SERVER_ENV overrides BACK_BLUE_IMAGE from pre-deploy env: ${staleDigests.BACK_BLUE_IMAGE} -> ${sourceBlueDigest}`,
      ),
    )
    for (const key of runtimeBackendImageKeys.slice(1)) {
      assert.match(output, new RegExp(`^${key}=${staleDigests[key]}$`, "m"))
      assert.match(output, new RegExp(`preserved ${key} from pre-deploy env after HOME_SERVER_ENV overwrite`))
    }
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("backend deploy은 source가 비운 front runtime image digest를 early compose 전에 보존한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const preDeployDigests = Object.fromEntries(
    runtimeFrontImageKeys.map((key, index) => [
      key,
      `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"ab"[index].repeat(64)}`,
    ]),
  )
  const sourceBlueDigest = `ghcr.io/aquilaxk/aquila-blog-web-front@sha256:${"c".repeat(64)}`
  const preDeployEnv = runtimeFrontImageKeys
    .map((key) => `  export ${key} = '${preDeployDigests[key]}'`)
    .join("\r\n")
    .concat("\r\n")
  const sourceEnv = `FRONT_BLUE_IMAGE=${sourceBlueDigest}\n`
  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-front-image-preserve-"))
  const preDeployEnvPath = path.join(workDir, "pre-deploy.env")
  const sourceEnvPath = path.join(workDir, "source.env")
  const preserveIndex = workflow.indexOf("preserve_pre_deploy_runtime_image_env_keys\n")
  const firstComposeIndex = workflow.indexOf(
    "docker compose --env-file deploy/homeserver/.env.prod -f deploy/homeserver/docker-compose.prod.yml up -d minio_1",
  )

  assert(preserveIndex >= 0, "front runtime image preserve call must exist")
  assert(firstComposeIndex >= 0, "first compose evaluation must exist")
  assert(preserveIndex < firstComposeIndex, "front runtime image preserve must run before the first compose evaluation")

  try {
    writeFileSync(preDeployEnvPath, preDeployEnv)
    writeFileSync(sourceEnvPath, sourceEnv)
    const functions = extractDeployRemoteFunctions([
      "upsert_env_key",
      "extract_env_value_from_text",
      "extract_env_value",
      "preserve_pre_deploy_runtime_image_env_keys",
    ])
    const scriptPath = path.join(workDir, "preserve-front-images.sh")
    writeFileSync(
      scriptPath,
      [
        "set -euo pipefail",
        `cd ${JSON.stringify(workDir)}`,
        "mkdir -p deploy/homeserver",
        'PRE_DEPLOY_ENV_CAPTURED="true"',
        `PRE_DEPLOY_ENV_CONTENT="$(cat ${JSON.stringify(preDeployEnvPath)})"`,
        functions,
        `cp ${JSON.stringify(sourceEnvPath)} deploy/homeserver/.env.prod`,
        "preserve_pre_deploy_runtime_image_env_keys",
        `for key in ${runtimeFrontImageKeys.join(" ")}; do echo "$key=$(extract_env_value "$key")"; done`,
        'PRE_DEPLOY_ENV_CONTENT="FOO=bar"',
        "printf 'FOO=bar\\n' > deploy/homeserver/.env.prod",
        "preserve_pre_deploy_runtime_image_env_keys",
        `for key in ${runtimeFrontImageKeys.join(" ")}; do echo "absent-$key=[$(extract_env_value "$key")]"; done`,
        "",
      ].join("\n"),
    )

    const output = execFileSync("bash", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })

    assert.match(output, new RegExp(`^FRONT_BLUE_IMAGE=${sourceBlueDigest}$`, "m"))
    assert.match(
      output,
      new RegExp(
        `HOME_SERVER_ENV overrides FRONT_BLUE_IMAGE from pre-deploy env: ${preDeployDigests.FRONT_BLUE_IMAGE} -> ${sourceBlueDigest}`,
      ),
    )
    assert.match(output, new RegExp(`^FRONT_GREEN_IMAGE=${preDeployDigests.FRONT_GREEN_IMAGE}$`, "m"))
    assert.match(output, /preserved FRONT_GREEN_IMAGE from pre-deploy env after HOME_SERVER_ENV overwrite/)
    for (const key of runtimeFrontImageKeys) {
      assert.match(output, new RegExp(`^absent-${key}=\\[\\]$`, "m"))
    }
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("blue-green deploy는 인프라/모니터링 부팅 후 crashloop 컨테이너를 진단한다", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const guardBody = deployScript.slice(
    deployScript.indexOf("warn_crashlooping_services() {"),
    deployScript.indexOf("cloudflared_registration_log_exists() {"),
  )

  assert(guardBody.length > 0, "warn_crashlooping_services must exist in blue_green_deploy.sh")
  assert.match(guardBody, /settle_seconds="\$\{INFRA_CRASHLOOP_SETTLE_SECONDS:-5\}"/)
  assert.match(guardBody, /cid="\$\(backend_container_id_any_state "\$\{service\}" \|\| true\)"/)
  assert.match(guardBody, /sleep "\$\{settle_seconds\}" \|\| true/)
  assert.match(guardBody, /docker inspect --format '\{\{\.State\.Restarting\}\}'/)
  assert.match(guardBody, /docker inspect --format '\{\{\.State\.ExitCode\}\}'/)
  assert.match(guardBody, /docker inspect --format '\{\{\.State\.StartedAt\}\}'/)
  assert.match(guardBody, /WARN \$\{service\} is not stable after boot: status=\$\{status\} restarting=\$\{restarting\} exit=\$\{exit_code\} restarts=\$\{restart_count\} reason=\$\{reason\}/)
  assert.match(guardBody, /run_compose_diagnostic logs --no-color --tail=40 "\$\{service\}" >&2/)
  assert.match(guardBody, /backend deploy continues/)
  assert.doesNotMatch(guardBody, /\bexit 1\b/)
  // 즉사 컨테이너는 restart backoff 중 "running" 순간에 샘플링될 수 있으므로
  // RestartCount + 최근 StartedAt을 보조 신호로 함께 본다.
  assert.match(guardBody, /recent_start_seconds="\$\{INFRA_CRASHLOOP_RECENT_START_SECONDS:-120\}"/)
  assert.match(guardBody, /"\$\{restart_count\}" -gt 0/)
  assert.match(guardBody, /started_age=\$\(\(now_epoch - started_epoch\)\)/)
  assert.match(guardBody, /reason="restart-churn"/)

  const monitoringBootIndex = deployScript.indexOf('compose_up_force_recreate_no_deps_with_retry "${monitoring_services_to_boot[@]}"')
  const guardCallIndex = deployScript.indexOf("\nwarn_crashlooping_services \\\n")
  const autohealPauseIndex = deployScript.indexOf("\npause_autoheal_for_blue_green\n")

  assert(monitoringBootIndex > -1, "monitoring boot must use a shared service list")
  assert(guardCallIndex > -1, "crashloop guard must run after infra/monitoring boot")
  assert(autohealPauseIndex > -1, "autoheal pause step must stay in the rollout")
  assert(monitoringBootIndex < guardCallIndex, "crashloop guard must run after monitoring containers are booted")
  assert(guardCallIndex < autohealPauseIndex, "crashloop guard must run before autoheal is paused for cutover")

  // 호출문(줄 끝 `\` 로 이어지는 범위)만 잘라 검사한다. 뒤따르는 다른 줄이
  // 우연히 매치돼 통과하는 일이 없도록 범위를 좁힌다.
  const guardCallLines = []
  for (const line of deployScript.slice(guardCallIndex + 1).split("\n")) {
    guardCallLines.push(line)
    if (!line.endsWith("\\")) break
  }
  const guardCall = guardCallLines.join("\n")
  for (const serviceList of ["services_to_boot", "edge_services_to_boot", "monitoring_services_to_boot"]) {
    assert(guardCall.includes(`"\${${serviceList}[@]}"`), `crashloop guard must cover ${serviceList}`)
  }
  // docker_socket_proxy는 autoheal depends_on으로만 기동돼 배열 어디에도 없다.
  assert(guardCall.includes("docker_socket_proxy"), "crashloop guard must cover docker_socket_proxy")
  assert.match(guardCall, /\|\| true$/, "crashloop guard call must not abort the deploy")
})

test("crashloop 진단 게이트는 docker 실패에도 set -e로 배포를 죽이지 않는다", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const extractShellFunctions = (names) => {
    const lines = deployScript.split("\n")
    return names
      .map((name) => {
        const start = lines.indexOf(`${name}() {`)
        assert.notEqual(start, -1, `${name} not found in blue_green_deploy.sh`)
        const end = lines.findIndex((line, index) => index > start && line === "}")
        assert.notEqual(end, -1, `${name} block is not closed in blue_green_deploy.sh`)
        return lines.slice(start, end + 1).join("\n")
      })
      .join("\n\n")
  }

  const workDir = mkdtempSync(path.join(tmpdir(), "aquila-crashloop-guard-"))
  try {
    const stubDir = path.join(workDir, "bin")
    mkdirSync(stubDir)
    // docker ps 가 일시 오류를 내는 상황: pipefail 때문에 명령 치환이 실패한다.
    writeFileSync(path.join(stubDir, "docker"), "#!/bin/sh\nexit 1\n", { mode: 0o755 })

    const scriptPath = path.join(workDir, "guard.sh")
    writeFileSync(
      scriptPath,
      [
        "set -euo pipefail",
        `PATH=${JSON.stringify(stubDir)}:"\${PATH}"`,
        'COMPOSE_PROJECT_NAME="blog_home"',
        "run_diagnostic_command() { return 1; }",
        "run_compose_diagnostic() { return 1; }",
        extractShellFunctions(["backend_container_id_any_state", "docker_timestamp_epoch", "warn_crashlooping_services"]),
        "INFRA_CRASHLOOP_SETTLE_SECONDS=0 warn_crashlooping_services autoheal docker_socket_proxy",
        'echo "guard end"',
        "",
      ].join("\n"),
    )

    const output = execFileSync("bash", [scriptPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    })
    assert.match(output, /^guard end$/m)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("rollback 복원 기준점은 마지막 성공 배포 baseline으로 고정된다", () => {
  const baselineScript = readFileSync(baselineScriptPath, "utf8")
  const backupScript = readFileSync(deployBackupScriptPath, "utf8")
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")
  const workflow = readFileSync(workflowPath, "utf8")
  const gitignore = readFileSync(path.join(repoRoot, ".gitignore"), "utf8")

  // 성공 배포 스냅샷은 완성된 뒤에만 공개돼야 한다. 중간에 끊긴 복사본이 남으면
  // 다음 rollback이 그걸 "마지막 성공 배포"로 착각한다.
  assert.match(baselineScript, /^umask 077$/m)
  assert.match(baselineScript, /STAGING_DIR="\$\{SCRIPT_DIR\}\/\.deploy-baseline\.staging\.\$\$"/)
  assert.match(baselineScript, /PREV_DIR="\$\{SCRIPT_DIR\}\/\.deploy-baseline\.prev\.\$\$"/)
  assert.match(baselineScript, /trap cleanup_publish_scratch EXIT/)
  assert(
    baselineScript.indexOf('cp "${SCRIPT_DIR}/docker-compose.prod.yml" "${STAGING_DIR}/docker-compose.prod.yml"') <
      baselineScript.indexOf('mv "${STAGING_DIR}" "${BASELINE_DIR}"'),
    "baseline must be fully staged before it is published",
  )
  // 죽은 실행이 남긴 scratch는 다음 실행이 걷어낸다. 유효성 게이트 뒤라서, baseline을
  // 만들 수 없는 실행이 앞선 실행의 잔존물을 지우고 끝나지 않는다.
  assert.match(
    baselineScript,
    /rm -rf "\$\{SCRIPT_DIR\}"\/\.deploy-baseline\.staging\.\* "\$\{SCRIPT_DIR\}"\/\.deploy-baseline\.prev\.\*/,
  )
  assert(
    baselineScript.indexOf("deploy baseline not recorded: compose file missing") <
      baselineScript.indexOf('rm -rf "${SCRIPT_DIR}"/.deploy-baseline.staging.*'),
    "the stale-scratch sweep must run after the gate that can abort the recording",
  )
  // 공개는 rename-aside다: 두 mv 사이에도 디스크에는 복원 기준점이 항상 하나 남는다.
  assert.doesNotMatch(baselineScript, /rm -rf "\$\{BASELINE_DIR\}"/)
  assert.match(
    baselineScript,
    /if \[\[ -e "\$\{BASELINE_DIR\}" \]\]; then\s*\n\s*mv "\$\{BASELINE_DIR\}" "\$\{PREV_DIR\}"\s*\n\s*fi\s*\n\s*mv "\$\{STAGING_DIR\}" "\$\{BASELINE_DIR\}"\s*\n\s*rm -rf "\$\{PREV_DIR\}"/,
  )
  // create_deploy_backup.sh의 게이트를 통과하지 못할 스냅샷은 공개하지 않는다.
  assert.match(
    baselineScript,
    /if \[\[ ! -f "\$\{STAGING_DIR\}\/docker-compose\.prod\.yml" \|\| ! -f "\$\{STAGING_DIR\}\/caddy\/Caddyfile" \]\]; then/,
  )
  assert(
    baselineScript.indexOf('! -f "${STAGING_DIR}/caddy/Caddyfile"') <
      baselineScript.indexOf('mv "${STAGING_DIR}" "${BASELINE_DIR}"'),
    "the completeness gate must run before the snapshot is published",
  )
  assert.match(baselineScript, /echo "deploy_sha=\$\(git -C "\$\{SCRIPT_DIR\}\/\.\.\/\.\." rev-parse --short HEAD/)
  assert.match(baselineScript, /^secret_files_copied=false$|echo "secret_files_copied=false"/m)
  assert.doesNotMatch(baselineScript, forbiddenSecretBackupCopyPattern)
  // baseline은 배포 산출물만 담는다. .active_backend는 지금 트래픽을 받는 색이라
  // 스냅샷에 섞이면 rollback이 죽은 색으로 되돌린다.
  assert.doesNotMatch(baselineScript, /\.active_backend/)

  // 백업은 baseline을 우선 사용하고, 없을 때만 워크트리로 폴백하되 로그를 남긴다.
  assert.match(backupScript, /BASELINE_DIR="\$\{SCRIPT_DIR\}\/\.deploy-baseline"/)
  assert.match(backupScript, /restore_source="worktree"/)
  // 빈 caddy/ 디렉터리는 -d 검사를 통과하지만 복원할 리버스 프록시 설정이 없다.
  assert.match(backupScript, /if \[\[ -f "\$\{BASELINE_DIR\}\/docker-compose\.prod\.yml" && -f "\$\{BASELINE_DIR\}\/caddy\/Caddyfile" \]\]; then\s*\n\s*restore_source="baseline"/)
  assert.match(backupScript, /no successful-deploy baseline at \$\{BASELINE_DIR\}; falling back to server working tree files" >&2/)
  assert.match(backupScript, /cp "\$\{BASELINE_DIR\}\/docker-compose\.prod\.yml" "\$\{BACKUP_DIR\}\/docker-compose\.prod\.yml"/)
  assert.match(backupScript, /cp -R "\$\{BASELINE_DIR\}\/caddy" "\$\{BACKUP_DIR\}\/caddy"/)
  assert.match(backupScript, /echo "restore_source=\$\{restore_source\}"/)
  assert.match(backupScript, /echo "baseline_deploy_sha=\$\(read_key_from_file "deploy_sha" "\$\{BASELINE_DIR\}\/metadata\.env"\)"/)
  assert.match(backupScript, /query_flyway_schema_version\(\) \{/)
  assert.match(backupScript, /WHERE success = true AND version IS NOT NULL ORDER BY installed_rank DESC LIMIT 1/)
  assert.match(backupScript, /echo "flyway_schema_version=\$\{flyway_schema_version\}"/)
  assert.match(workflow, /BACKUP_FLYWAY_SCHEMA_VERSION="\$\(/)
  assert.match(workflow, /BACKUP_FLYWAY_SCHEMA_VERSION="unavailable"/)
  assert.match(workflow, /BACKUP_FLYWAY_SCHEMA_VERSION="\$\{BACKUP_FLYWAY_SCHEMA_VERSION\}"/)
  // .active_backend는 배포 산출물이 아니라 지금 트래픽을 받는 색이므로 워크트리에서 온다.
  assert.match(backupScript, /if \[\[ -f "\$\{STATE_FILE\}" \]\]; then\s*\n\s*cp "\$\{STATE_FILE\}" "\$\{BACKUP_DIR\}\/\.active_backend"/)
  assert.doesNotMatch(backupScript, /for file in docker-compose\.prod\.yml \.active_backend; do/)

  // rollback은 어느 커밋으로 되돌리는지 로그로 밝힌다.
  assert.match(rollbackScript, /log_backup_restore_provenance\(\) \{/)
  assert.match(rollbackScript, /worker_rollback_mode\(\) \{/)
  assert.match(rollbackScript, /prepare_worker_rollback_policy\(\) \{/)
  assert.match(rollbackScript, /PRESERVE_CURRENT_WORKER_IMAGE="true"/)
  const workerPolicyInvocation = rollbackScript.lastIndexOf("\nprepare_worker_rollback_policy\n")
  assert.notEqual(workerPolicyInvocation, -1, "rollback must invoke the worker schema policy")
  assert(
    workerPolicyInvocation < rollbackScript.indexOf("\nrestore_compose_image_metadata\n"),
    "worker schema compatibility must be fixed before backup image metadata is restored",
  )
  assert.match(rollbackScript, /rollback restore point: source=\$\{restore_source:-worktree\} baseline_deploy_sha=\$\{deploy_sha:-unknown\} baseline_created_at=\$\{created_at:-unknown\}/)
  assert(
    rollbackScript.indexOf('echo "rollback from backup: ${BACKUP_DIR}"') <
      rollbackScript.indexOf("\nlog_backup_restore_provenance\n"),
    "restore provenance must be logged as part of the rollback banner",
  )

  // baseline 기록은 모든 post-deploy 검증을 통과한 뒤에만, 그리고 배포를 죽이지 않게.
  assert.match(workflow, /deploy\/homeserver\/record_deploy_baseline\.sh \\/)
  const completedIndex = workflow.indexOf('DEPLOY_COMPLETED="true"')
  const recordIndex = workflow.indexOf('if DEPLOY_BASELINE_DIR="$(./deploy/homeserver/record_deploy_baseline.sh)"; then')
  assert.notEqual(recordIndex, -1, "successful deploy must record a baseline")
  assert(completedIndex < recordIndex, "baseline must be recorded only after the deploy is declared complete")
  // 복원 기준점이 밀리는 두 경로는 workflow annotation으로 드러나야 한다. annotation은
  // 러너가 스텝 stdout에서 파싱하므로 stderr로 보내면 안 된다.
  assert.match(
    workflow,
    /^ *echo "::warning title=Deploy baseline not recorded::failed to record successful-deploy baseline; the next rollback will restore an older baseline or the server working tree"$/m,
  )
  assert.match(
    workflow,
    /^ *echo "::warning title=Rollback restore point fell back to the working tree::no successful-deploy baseline was found at deploy\/homeserver\/\.deploy-baseline; a rollback would restore the server working tree instead of the last verified deploy"$/m,
  )
  assert.doesNotMatch(workflow, /echo "::warning[^\n]*" >&2/)
  // create_deploy_backup.sh의 stdout은 백업 경로 반환값이라 annotation을 실을 수 없다.
  // 호출부가 기록된 restore_source를 읽어 대신 올린다.
  assert.doesNotMatch(backupScript, /::warning/)
  assert.match(workflow, /if grep -qx 'restore_source=worktree' "\$\{BACKUP_DIR\}\/metadata\.env" 2>\/dev\/null; then/)
  assert(
    recordIndex < workflow.indexOf("          cleanup_remote_tmp\n          trap - EXIT"),
    "baseline must be recorded before the remote session tears down",
  )

  assert.match(gitignore, /deploy\/homeserver\/\.deploy-baseline\*/)
})

test("연속 실패한 배포가 rollback 복원 기준점을 마지막 성공 배포에서 밀어내지 않는다", () => {
  const successCompose = "services:\n  db_1: {}\n"
  const successCaddy = "api {\n  reverse_proxy back_green:8080\n}\n"
  // 실패한 배포가 rollback하면서 워크트리에 남기는 것: 되돌린 compose 위에
  // rollback_last_deploy.sh 가 upstream 토큰을 back_blue로 다시 쓴 Caddyfile.
  const driftedCompose = "services:\n  db_1: {}\n  docker_socket_proxy: {}\n"
  const driftedCaddy = "api {\n  reverse_proxy back_blue:8080\n}\n"

  const createFixture = () => {
    const workDir = mkdtempSync(path.join(tmpdir(), "aquila-deploy-baseline-"))
    const homeserverDir = path.join(workDir, "deploy/homeserver")
    mkdirSync(path.join(homeserverDir, "caddy"), { recursive: true })
    const stubDir = path.join(workDir, "bin")
    mkdirSync(stubDir)
    // 이미지 메타데이터 수집만 docker를 쓴다. 복원 기준점 로직은 순수 파일 복사다.
    writeFileSync(
      path.join(stubDir, "docker"),
      "#!/bin/sh\ncase \"$*\" in *flyway_schema_history*) printf '%s\\n' '20260810.01' ;; esac\nexit 0\n",
      { mode: 0o755 },
    )

    for (const script of ["create_deploy_backup.sh", "record_deploy_baseline.sh"]) {
      writeFileSync(
        path.join(homeserverDir, script),
        readFileSync(path.join(repoRoot, "deploy/homeserver", script), "utf8"),
        { mode: 0o755 },
      )
    }

    writeFileSync(path.join(homeserverDir, "docker-compose.prod.yml"), successCompose)
    writeFileSync(path.join(homeserverDir, "caddy/Caddyfile"), successCaddy)
    writeFileSync(path.join(homeserverDir, ".active_backend"), "back_green\n")

    git(workDir, ["init", "-b", "main"])
    git(workDir, ["config", "user.email", "ci@example.test"])
    git(workDir, ["config", "user.name", "CI Test"])
    git(workDir, ["add", "-A", "deploy"])
    git(workDir, ["commit", "-m", "successful deploy"])
    const successSha = git(workDir, ["rev-parse", "--short", "HEAD"])

    const run = (script) => {
      const errPath = path.join(workDir, `${script}.err`)
      const stdout = execFileSync(
        "bash",
        ["-c", `${JSON.stringify(path.join(homeserverDir, script))} 2> ${JSON.stringify(errPath)}`],
        {
          cwd: workDir,
          encoding: "utf8",
          env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
          stdio: ["ignore", "pipe", "pipe"],
        },
      ).trim()
      return { stdout, stderr: readFileSync(errPath, "utf8") }
    }

    const runFailing = (script) => {
      const errPath = path.join(workDir, `${script}.err`)
      try {
        execFileSync(
          "bash",
          ["-c", `${JSON.stringify(path.join(homeserverDir, script))} 2> ${JSON.stringify(errPath)}`],
          {
            cwd: workDir,
            encoding: "utf8",
            env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}` },
            stdio: ["ignore", "pipe", "pipe"],
          },
        )
      } catch (error) {
        return { status: error.status, stderr: readFileSync(errPath, "utf8") }
      }
      throw new Error(`${script} was expected to fail`)
    }

    // 실패한 배포도 서버에 checkout되므로 HEAD는 실패한 커밋으로 이동한다.
    const checkoutFailedDeployCommit = () => {
      writeFileSync(path.join(workDir, "failed-deploy-marker"), "failed\n")
      git(workDir, ["add", "failed-deploy-marker"])
      git(workDir, ["commit", "-m", "failed deploy"])
      return git(workDir, ["rev-parse", "--short", "HEAD"])
    }

    // 실패한 배포가 rollback으로 남기고 간 워크트리 상태.
    const applyFailedRollbackLeftovers = () => {
      writeFileSync(path.join(homeserverDir, "docker-compose.prod.yml"), driftedCompose)
      writeFileSync(path.join(homeserverDir, "caddy/Caddyfile"), driftedCaddy)
      writeFileSync(path.join(homeserverDir, ".active_backend"), "back_blue\n")
    }

    const baselineScratchLeftovers = () =>
      readdirSync(homeserverDir).filter((entry) => entry.startsWith(".deploy-baseline."))

    const readMetadata = (backupDir) =>
      Object.fromEntries(
        readFileSync(path.join(backupDir, "metadata.env"), "utf8")
          .split("\n")
          .filter((line) => line.includes("="))
          .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
      )

    return {
      workDir,
      homeserverDir,
      successSha,
      run,
      runFailing,
      checkoutFailedDeployCommit,
      applyFailedRollbackLeftovers,
      baselineScratchLeftovers,
      readMetadata,
    }
  }

  const withBaseline = createFixture()
  try {
    withBaseline.run("record_deploy_baseline.sh")
    const failedSha = withBaseline.checkoutFailedDeployCommit()
    withBaseline.applyFailedRollbackLeftovers()

    const backupDir = withBaseline.run("create_deploy_backup.sh").stdout
    const metadata = withBaseline.readMetadata(backupDir)

    assert.equal(metadata.restore_source, "baseline")
    assert.equal(metadata.flyway_schema_version, "20260810.01")
    assert.equal(metadata.baseline_deploy_sha, withBaseline.successSha)
    // git_head는 실패해서 rollback된 커밋이고, 복원 기준점은 그 이전 성공 배포다.
    // 둘이 같아지면 metadata만으로는 무엇을 복원하는지 알 수 없다.
    assert.equal(metadata.git_head, failedSha)
    assert.notEqual(metadata.baseline_deploy_sha, metadata.git_head)
    assert.equal(readFileSync(path.join(backupDir, "docker-compose.prod.yml"), "utf8"), successCompose)
    assert.equal(readFileSync(path.join(backupDir, "caddy/Caddyfile"), "utf8"), successCaddy)
    // 살아 있는 런타임 상태는 baseline이 아니라 서버 워크트리를 따라간다.
    assert.equal(readFileSync(path.join(backupDir, ".active_backend"), "utf8"), "back_blue\n")
  } finally {
    rmSync(withBaseline.workDir, { force: true, recursive: true })
  }

  const withoutBaseline = createFixture()
  try {
    withoutBaseline.applyFailedRollbackLeftovers()

    const { stdout: backupDir, stderr } = withoutBaseline.run("create_deploy_backup.sh")
    const metadata = withoutBaseline.readMetadata(backupDir)

    assert.equal(metadata.restore_source, "worktree")
    assert.equal(metadata.flyway_schema_version, "20260810.01")
    assert.equal(metadata.baseline_deploy_sha, undefined)
    assert.match(stderr, /no successful-deploy baseline at .*\.deploy-baseline; falling back to server working tree files/)
    assert.equal(readFileSync(path.join(backupDir, "docker-compose.prod.yml"), "utf8"), driftedCompose)
    assert.equal(readFileSync(path.join(backupDir, "caddy/Caddyfile"), "utf8"), driftedCaddy)
  } finally {
    rmSync(withoutBaseline.workDir, { force: true, recursive: true })
  }

  // 재기록은 이전 baseline을 지운 뒤 옮기는 것이 아니라 옆으로 밀어낸 뒤 옮긴다.
  const republished = createFixture()
  try {
    const baselineDir = path.join(republished.homeserverDir, ".deploy-baseline")
    republished.run("record_deploy_baseline.sh")
    assert.equal(republished.readMetadata(baselineDir).deploy_sha, republished.successSha)

    const nextCompose = "services:\n  db_1: {}\n  cloudflared: {}\n"
    writeFileSync(path.join(republished.homeserverDir, "docker-compose.prod.yml"), nextCompose)
    git(republished.workDir, ["add", "deploy/homeserver/docker-compose.prod.yml"])
    git(republished.workDir, ["commit", "-m", "next successful deploy"])
    const nextSha = git(republished.workDir, ["rev-parse", "--short", "HEAD"])

    republished.run("record_deploy_baseline.sh")

    assert.equal(readFileSync(path.join(baselineDir, "docker-compose.prod.yml"), "utf8"), nextCompose)
    assert.equal(republished.readMetadata(baselineDir).deploy_sha, nextSha)
    assert.deepEqual(
      republished.baselineScratchLeftovers(),
      [],
      "publishing must leave neither staging nor set-aside directories behind",
    )
  } finally {
    rmSync(republished.workDir, { force: true, recursive: true })
  }

  // 기록에 실패한 실행은 마지막 성공 배포 스냅샷을 건드리지 않는다.
  const failedRecording = createFixture()
  try {
    const baselineDir = path.join(failedRecording.homeserverDir, ".deploy-baseline")
    failedRecording.run("record_deploy_baseline.sh")

    rmSync(path.join(failedRecording.homeserverDir, "docker-compose.prod.yml"))
    const { status, stderr } = failedRecording.runFailing("record_deploy_baseline.sh")

    assert.equal(status, 1)
    assert.match(stderr, /deploy baseline not recorded: compose file missing/)
    assert.equal(readFileSync(path.join(baselineDir, "docker-compose.prod.yml"), "utf8"), successCompose)
    assert.equal(readFileSync(path.join(baselineDir, "caddy/Caddyfile"), "utf8"), successCaddy)
    assert.deepEqual(
      failedRecording.baselineScratchLeftovers(),
      [],
      "a failed recording must leave no staging directory behind",
    )

    // baseline이 살아남았으므로 backup은 여전히 마지막 성공 배포를 복원 기준점으로 쓴다.
    const backupDir = failedRecording.run("create_deploy_backup.sh").stdout
    assert.equal(failedRecording.readMetadata(backupDir).restore_source, "baseline")
    assert.equal(readFileSync(path.join(backupDir, "docker-compose.prod.yml"), "utf8"), successCompose)
  } finally {
    rmSync(failedRecording.workDir, { force: true, recursive: true })
  }
})

// ---------------------------------------------------------------------------
// #1538 홈서버 front 컨테이너와 Caddy web vhost
// ---------------------------------------------------------------------------

// 서비스 블록은 "다음 2-space 키" 대신 들여쓰기로 끊는다. 정규식으로 자르면 블록 안에 2-space
// 줄(주석 등)이 하나만 들어와도 조기 절단되고, 그러면 `assert.doesNotMatch`가 잘린 뒷부분을 보지
// 못한 채 거짓 통과한다.
const extractComposeService = (compose, serviceName) => {
  const lines = compose.split("\n")
  const start = lines.findIndex((line) => line === `  ${serviceName}:`)
  if (start === -1) return ""

  const body = [lines[start]]
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !line.startsWith("    ")) break
    body.push(line)
  }
  return `${body.join("\n")}\n`
}

const extractComposeServiceNames = (compose) => {
  const lines = compose.split("\n")
  const start = lines.findIndex((line) => line === "services:")
  if (start === -1) return []

  const names = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !line.startsWith("  ")) break
    const match = line.match(/^  ([a-zA-Z0-9_-]+):$/)
    if (match) names.push(match[1])
  }
  return names
}

const frontColours = ["blue", "green"]

test("front 서비스는 compose 프로필 뒤에서 env 기반 digest 이미지로만 기동한다", () => {
  const compose = readFileSync(composePath, "utf8")
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const contractKeys = new Set(targetKeyNames(contract, "home-server-runtime"))
  const digestImageKeys = new Set(
    Object.values(contract.targets)
      .flatMap((target) => target.keys || [])
      .filter((key) => key.kind === "digest-image")
      .map((key) => key.name),
  )

  for (const colour of frontColours) {
    const service = extractComposeService(compose, `front_${colour}`)
    const imageKey = `FRONT_${colour.toUpperCase()}_IMAGE`

    assert.notEqual(service, "", `front_${colour} service must exist`)
    // FRONT_*_IMAGE는 아직 어떤 배포 경로도 주입하지 않는다(#1539 소관). 프로필로 감싸지 않으면
    // 키가 빈 상태에서도 서비스가 기동 대상이 되고, `:?` 형태를 쓰면 프로필과 무관하게 보간이
    // 죽어 기존 배포·백업·doctor의 `docker compose config`가 전부 깨진다.
    assert.match(service, /^\s+profiles: \["front"\]$/m)
    assert.match(service, new RegExp(`^\\s+image: \\$\\{${imageKey}\\}$`, "m"))
    assert(contractKeys.has(imageKey), `${imageKey} must be covered by the home-server-runtime contract`)
    assert(digestImageKeys.has(imageKey), `${imageKey} must be a digest-image key`)
  }
})

test("front 컨테이너는 backend 비의존 liveness healthcheck와 색깔별 .next/cache 볼륨을 갖는다", () => {
  const compose = readFileSync(composePath, "utf8")

  for (const colour of frontColours) {
    const service = extractComposeService(compose, `front_${colour}`)

    assert.notEqual(service, "", `front_${colour} service must exist`)
    // 포트만 보는 체크는 "성공으로 보고되는 열화"를 만든다. robots.txt는 Next 서버가 응답해야만
    // 200이면서 backend에 의존하지 않아 autoheal 재시작 신호로 안전하다.
    assert.match(
      service,
      /test: \["CMD-SHELL", "wget -q -T 3 -O \/dev\/null http:\/\/127\.0\.0\.1:3000\/robots\.txt \|\| exit 1"\]/,
    )
    assert.match(service, /^\s+mem_limit: \$\{FRONT_MEM_LIMIT:-\d+m\}$/m)
    assert.match(service, /^\s+mem_reservation: \$\{FRONT_MEM_RESERVATION:-\d+m\}$/m)
    assert.match(service, /^\s+autoheal: "\$\{FRONT_AUTOHEAL_ENABLED:-true\}"$/m)
    // blue/green은 서로 다른 빌드 산출물이다. 캐시를 공유하면 상대 빌드의 asset 해시를 담은
    // ISR 결과가 남는다.
    assert.match(service, new RegExp(`- front_${colour}_next_cache:/app/\\.next/cache$`, "m"))
    assert.match(compose, new RegExp(`^  front_${colour}_next_cache:$`, "m"))
    // 서버 전용 env가 없으면 컨테이너는 healthy를 보고하면서 모든 SSR 경로가 500이 된다.
    assert.match(service, /env_file:\n(\s+#.*\n)*\s+- \.\/\.env\.front\.prod\n/)
    // caddy가 app에도 붙어 있어 edge 없이 프록시된다. DB/Redis/MinIO에도 접근하지 않는다.
    assert.match(service, /networks:\n\s+- app\n/)
    assert.doesNotMatch(service, /^\s+- edge$/m)
    assert.doesNotMatch(service, /^\s+- data$/m)
  }

  const otherColourCacheReuse = extractComposeService(compose, "front_blue").includes("front_green_next_cache")
  assert.equal(otherColourCacheReuse, false, "front colours must not share one .next/cache volume")
})

test("Caddy web vhost는 env 파생 호스트로 front upstream을 프록시한다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")

  assert.notEqual(webBlock, "", "web domain site block must be extractable")
  // 호스트명 하드코딩은 #1540의 단일 스위치를 깬다. 값이 비었을 때 `http://`만 남으면 Caddy는
  // 전 호스트를 삼키는 catch-all이 되므로, 다른 선택적 vhost와 같은 .localhost 기본값을 둔다.
  assert.match(caddyfile, /^http:\/\/\{\$WEB_DOMAIN:[a-z.-]+\} \{$/m)
  // 주석은 결정 근거를 남기는 자리라 호스트명을 적어도 된다. 설정 지시자에 박히면 안 된다.
  const webDirectives = webBlock
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
  assert.doesNotMatch(webDirectives, /aquilaxk\.site/)
  assert.match(webBlock, /reverse_proxy \{\$WEB_UPSTREAM:front_blue\}:3000 \{/)
  assert.match(webBlock, /import trusted_edge_client_ip/)
  // hop 헤더 제거와 신뢰 client IP 캡처는 API vhost와 공유하는 snippet 하나가 소유한다.
  assert.match(webBlock, /^\s*import edge_client_ip_capture\s*$/m)
  // /_next/static/*는 콘텐츠 해시 자산이다. `?` 접두사로 Next가 이미 보낸 값을 덮어쓰지 않는다.
  assert.match(webBlock, /@nextImmutable path \/_next\/static\/\*/)
  assert.match(webBlock, /\?Cache-Control "public, max-age=31536000, immutable"/)
  // next.config.js가 내보내는 보안 헤더 7종을 edge가 벗기거나 약화시키면 안 된다.
  assert.doesNotMatch(webBlock, /header_down -/)
  assert.doesNotMatch(webBlock, /Content-Security-Policy/)
  // 이 vhost는 블로그 표면만 서빙한다. redirect는 여기 있지 않고 apex vhost가 소유한다
  // (Locked Decision 6은 2026-08-02 오너 결정으로 번복됐다 - #1605).
  assert.doesNotMatch(webBlock, /^\s*redir\b/m)
  // 회사·제품 표면이 web vhost 안으로 섞여 들어오면 백엔드 경로 게이트와 쿠키 스코프가 그
  // 표면들에도 적용된다. 두 표면은 각자 vhost를 가져야 한다.
  assert.doesNotMatch(webBlock, /rewrite \//)
})

test("회사·제품 표면 vhost는 front 전용이고 공유 snippet 하나를 import한다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const companyBlock = extractCaddySiteBlock(caddyfile, "http://{$COMPANY_DOMAIN")
  const productBlock = extractCaddySiteBlock(caddyfile, "http://{$PRODUCT_DOMAIN")
  const surfaceSnippet = extractCaddySiteBlock(caddyfile, "(front_surface_vhost) {")

  assert.notEqual(companyBlock, "", "company surface site block must be extractable")
  assert.notEqual(productBlock, "", "product surface site block must be extractable")
  assert.notEqual(surfaceSnippet, "", "shared front surface snippet must be extractable")

  // 값이 비었을 때 `http://`만 남으면 Caddy는 다른 vhost가 잡지 않는 전 호스트를 삼키는
  // catch-all이 된다. 다른 선택적 vhost와 같은 .localhost 기본값을 강제한다.
  assert.match(caddyfile, /^http:\/\/\{\$COMPANY_DOMAIN:[a-z.-]+\} \{$/m)
  assert.match(caddyfile, /^http:\/\/\{\$PRODUCT_DOMAIN:[a-z.-]+\} \{$/m)

  // 두 vhost는 route 인자만 다른 같은 몸통이어야 한다. 복사되면 robots 정책이나 캐시 floor가
  // 한쪽에서만 조용히 사라진다.
  assert.match(companyBlock, /import front_surface_vhost \/company/)
  assert.match(productBlock, /import front_surface_vhost \/easysubway/)
  assert.equal(caddyfile.split("(front_surface_vhost) {").length - 1, 1)

  // 백엔드 경로 게이트는 blog vhost 전용이다. 공개 API는 그 호스트의 경로이고 인증 쿠키도 그
  // 호스트에 스코프돼 있으므로(#1575), 이 표면들에 백엔드 prefix를 실으면 쿠키가 넓어지거나
  // 쓸 수 없는 세션이 생긴다.
  for (const block of [companyBlock, productBlock, surfaceSnippet]) {
    assert.doesNotMatch(block, /import backend_edge_gates/)
    assert.doesNotMatch(block, /back_blue|back_read|back_admin|ADMIN_API_UPSTREAM|READ_API_UPSTREAM/)
  }

  // 호스트명은 주석에만 쓴다. 지시자에 박히면 단일 env 스위치가 깨진다.
  const surfaceDirectives = surfaceSnippet
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n")
  assert.doesNotMatch(surfaceDirectives, /aquilaxk\.site/)

  // front upstream은 blue/green 스위치를 web vhost와 공유한다.
  assert.match(surfaceSnippet, /reverse_proxy \{\$WEB_UPSTREAM:front_blue\}:3000 \{/)
  assert.match(surfaceSnippet, /^\s*import edge_client_ip_capture\s*$/m)
  assert.match(surfaceSnippet, /import trusted_edge_client_ip/)
  // next.config.js가 내보내는 보안 헤더를 edge가 벗기거나 약화시키면 안 된다.
  assert.doesNotMatch(surfaceSnippet, /header_down -/)
  assert.doesNotMatch(surfaceSnippet, /Content-Security-Policy/)

  // 루트만 표면 라우트로 rewrite한다. 더 깊은 경로까지 잡으면 /_next/* 자산이 끊긴다.
  assert.match(surfaceSnippet, /^\s*rewrite \/ \{args\[0\]\}\s*$/m)

  // 이 호스트의 robots.txt는 vhost가 응답한다. Web image의 blog robots.txt는 blog sitemap을
  // 광고하므로 그대로 나가면 이 표면이 남의 URL 목록을 자기 것으로 광고한다.
  // `handle`이어야 한다 - Caddy 지시자 순서는 `respond`를 `handle` 뒤에 두므로 최상위 respond는
  // catch-all proxy 뒤로 컴파일돼 실행되지 않는다.
  assert.match(surfaceSnippet, /@surfaceRobots path \/robots\.txt/)
  assert.match(surfaceSnippet, /handle @surfaceRobots \{/)
  // 루트만 색인 대상이다. 같은 컨테이너가 이 호스트에서도 블로그 라우트를 응답하므로 열어 두면
  // 블로그가 두 번째 호스트로 중복 색인된다.
  assert.match(surfaceSnippet, /respond "User-agent: \*\\nAllow: \/\$\\nDisallow: \/\\n" 200/)
})

test("front 전용 표면 vhost는 backend에 닿는 front API 경로를 catch-all 앞에서 거부한다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const surfaceSnippet = extractCaddySiteBlock(caddyfile, "(front_surface_vhost) {")
  assert.notEqual(surfaceSnippet, "", "shared front surface snippet must be extractable")

  // allow-list여야 한다. backend에 닿는 오늘의 경로만 나열하는 deny-list는 기본값이 "노출"이라,
  // blog용으로 추가되는 다음 front API route가 이 호스트에서도 조용히 공개된다.
  const deniedMatcherStart = surfaceSnippet.indexOf("@frontApiDenied {")
  assert.ok(deniedMatcherStart > -1, "the front API allow-list matcher must exist")
  const deniedMatcher = surfaceSnippet.slice(deniedMatcherStart, surfaceSnippet.indexOf("}", deniedMatcherStart))
  assert.match(deniedMatcher, /^\s*path \/api\/\*$/m, "the matcher must start from the whole front API namespace")
  assert.match(deniedMatcher, /^\s*not path \/api\/rum\/\*$/m, "RUM ingest is the one namespace these pages use")
  // 개별 경로를 나열하기 시작하면 그것이 곧 deny-list다.
  assert.doesNotMatch(deniedMatcher, /\/api\/backend|\/api\/revalidate/)

  // `handle`이어야 하고 catch-all proxy보다 먼저 쓰여야 한다. Caddy는 같은 handle 그룹을 작성
  // 순서로 평가하므로, 뒤에 오면 Next가 이미 응답한 뒤다.
  const denyHandleIndex = surfaceSnippet.indexOf("handle @frontApiDenied {")
  const catchAllIndex = surfaceSnippet.indexOf("\n  handle {")
  assert.ok(denyHandleIndex > -1, "the deny must be a handle, not a top-level respond")
  assert.ok(catchAllIndex > denyHandleIndex, "the deny must be written before the catch-all proxy")
  // 404다. 403은 이 호스트에 그 라우트가 존재한다는 사실을 알려 준다.
  assert.match(surfaceSnippet.slice(denyHandleIndex, catchAllIndex), /respond 404/)

  // blog vhost는 이 deny를 상속하지 않는다. 공개 API와 revalidate webhook의 집이 그 호스트다.
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")
  assert.doesNotMatch(webBlock, /@frontApiDenied/)
})

test("front 전용 표면 vhost는 블로그 RSS 경로를 catch-all 앞에서 거부한다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const surfaceSnippet = extractCaddySiteBlock(caddyfile, "(front_surface_vhost) {")
  assert.notEqual(surfaceSnippet, "", "shared front surface snippet must be extractable")

  // `_document`가 alternate 링크를 끄는 것은 절반이다. 경로 자체가 살아 있으면 다른 데서 링크를
  // 배운 크롤러가 이 호스트의 피드로 블로그 아이템을 다시 색인한다.
  assert.match(surfaceSnippet, /@surfaceFeedDenied path \/feed \/feed\/\*/)
  const denyHandleIndex = surfaceSnippet.indexOf("handle @surfaceFeedDenied {")
  const catchAllIndex = surfaceSnippet.indexOf("\n  handle {")
  assert.ok(denyHandleIndex > -1, "the deny must be a handle, not a top-level respond")
  assert.ok(catchAllIndex > denyHandleIndex, "the deny must be written before the catch-all proxy")
  assert.match(surfaceSnippet.slice(denyHandleIndex, catchAllIndex), /respond 404/)

  // blog vhost는 이 deny를 상속하지 않는다. RSS의 집이 그 호스트다.
  const webBlock = extractCaddySiteBlock(caddyfile, "http://{$WEB_DOMAIN")
  assert.doesNotMatch(webBlock, /@surfaceFeedDenied/)
})

test("apex vhost는 경로·query를 보존한 308로 회사 호스트에 넘긴다", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apexBlock = extractCaddySiteBlock(caddyfile, "http://{$APEX_DOMAIN")

  assert.notEqual(apexBlock, "", "apex site block must be extractable")
  assert.match(caddyfile, /^http:\/\/\{\$APEX_DOMAIN:[a-z.-]+\} \{$/m)

  // 목적지는 COMPANY_DOMAIN 재사용이어야 한다. 호스트명을 다시 적으면 실제로 서빙하는 vhost와
  // redirect 목적지가 따로 움직인다.
  assert.match(apexBlock, /redir https:\/\/\{\$COMPANY_DOMAIN:[a-z.-]+\}\{uri\} 308/)
  // `{uri}`가 없으면 딥링크가 전부 홈으로 붕괴한다. 308이 아니면(301/302) POST가 GET으로 바뀐다.
  assert.doesNotMatch(apexBlock, /redir [^\n]*(?<!\{uri\}) 30[12]\b/)
  // apex는 자기 콘텐츠가 없다. front upstream이 붙으면 같은 페이지가 두 호스트에서 200이 된다.
  assert.doesNotMatch(apexBlock, /reverse_proxy/)
})

test("표면 도메인 키는 caddy env까지 전달되고 site address 유일성이 계약으로 막힌다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const sourceKeys = JSON.parse(readFileSync(contractPath, "utf8")).targets["home-server-source"].keys
  const materialize = readFileSync(path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"), "utf8")
  const caddyEnvExample = readFileSync(
    path.join(repoRoot, "deploy/homeserver/.env.caddy.prod.example"),
    "utf8",
  )

  for (const name of ["COMPANY_DOMAIN", "PRODUCT_DOMAIN", "APEX_DOMAIN"]) {
    const definition = sourceKeys.find((key) => key.name === name)
    assert.ok(definition, `${name} must be declared in the home-server-source contract`)
    assert.equal(definition.kind, "hostname")
    // DNS 전환은 오너 승인 게이트다. required로 만들면 hostname을 열기 전에 배포가 잠긴다.
    assert.equal(definition.required, false, `${name} must stay optional until its hostname exists`)
    // 빈 값은 어떤 상태도 뜻하지 않는다 - vhost 주소가 :80 catch-all이 된다.
    assert.equal(definition.rejectEmptyValue, true, `${name} must reject an empty value`)
    // caddy service env로 전달되지 않으면 vhost가 조용히 .localhost 기본값에 머문다.
    assert.match(materialize, new RegExp(`\\b${name}\\b`), `${name} must reach the caddy env`)
    assert.match(caddyEnvExample, new RegExp(`^${name}=`, "m"))
  }

  const siteAddressCheck = (contract.targets["home-server-source"].crossChecks || []).find(
    (check) => check.type === "allDistinct",
  )
  assert.ok(siteAddressCheck, "Caddy site address keys must be checked for uniqueness as a set")
  assert.equal(siteAddressCheck.asHost, true, "duplicates that differ only in case are still duplicates")
  for (const name of ["WEB_DOMAIN", "COMPANY_DOMAIN", "PRODUCT_DOMAIN", "APEX_DOMAIN"]) {
    assert(siteAddressCheck.keys.includes(name), `${name} is a Caddy site address and must be in the set`)
  }

  // 정상 조합은 통과한다. 세 키는 base fixture에 없으므로 줄을 덧붙인다 - withEnvKeys는 이미
  // 있는 줄만 치환하므로 여기서 쓰면 아무 값도 설정되지 않고 아래 충돌 검사가 공허해진다.
  const healthy = [
    baseHomeServerEnv,
    "COMPANY_DOMAIN=www.aquilaxk.site",
    "PRODUCT_DOMAIN=easysubway.aquilaxk.site",
    "APEX_DOMAIN=aquilaxk.site",
  ].join("\n")
  const healthyResult = validateEnvText({ contract, target: "home-server-source", text: healthy })
  assert.equal(
    healthyResult.ok,
    true,
    healthyResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )

  // Web source는 별도 저장소가 소유한다. Platform은 Caddy가 실제로 서빙하는 두 surface host만
  // 배포 계약에 고정하고, sibling checkout이나 source archive를 읽는 fallback을 두지 않는다.
  for (const [key, canonicalHost] of [
    ["COMPANY_DOMAIN", "www.aquilaxk.site"],
    ["PRODUCT_DOMAIN", "easysubway.aquilaxk.site"],
  ]) {
    const definition = sourceKeys.find((name) => name.name === key)
    assert.deepEqual(
      definition.allowedValues,
      [canonicalHost],
      `${key} must be pinned to the Platform-owned public surface host`,
    )

    const mismatched = withEnvKeys(healthy, [[key, `surface.${canonicalHost}`]])
    const result = validateEnvText({ contract, target: "home-server-source", text: mismatched })
    assert.equal(result.ok, false, `${key} must reject an undeclared public surface host`)
    assert(
      result.errors.some((error) => error.key === key && /must be one of/.test(error.message)),
      JSON.stringify(result.errors),
    )
  }

  // 주소 중복은 caddy를 기동 불가로 만든다. 대소문자만 다른 중복도 같은 주소다.
  //
  // 실측은 APEX_DOMAIN으로 한다. 위에서 고정한 두 키는 중복을 표현할 수조차 없어(허용 값이 각각
  // 하나뿐이다) 집합 검사가 아니라 고정값 검사가 먼저 막는다 - 그 키로 이 루프를 돌리면 통과 사유가
  // 바뀐 것을 눈치채지 못한 채 집합 검사가 검증되지 않는다. apex는 정본 표에 없는 키라서
  // (front는 apex를 canonical로 쓰지 않고 vhost가 회사 호스트로 308할 뿐이다) 고정값이 없고,
  // 그래서 집합 검사가 유일한 방어선이다.
  for (const [value, reason] of [
    ["blog.aquilaxk.site", "an exact duplicate of the web vhost address"],
    ["BLOG.AQUILAXK.SITE", "a duplicate that differs only in case"],
  ]) {
    const collided = withEnvKeys(healthy, [["APEX_DOMAIN", value]])
    const result = validateEnvText({ contract, target: "home-server-source", text: collided })
    assert.equal(result.ok, false, `APEX_DOMAIN=${value} is ${reason}`)
    assert(
      result.errors.some((error) => error.key === "APEX_DOMAIN" && /must differ from/.test(error.message)),
      JSON.stringify(result.errors),
    )
  }

  // apex의 redirect 목적지는 COMPANY_DOMAIN이다. 짝이 없으면 apex가 .localhost로 넘긴다.
  const orphanApex = `${baseHomeServerEnv}\nAPEX_DOMAIN=aquilaxk.site`
  const orphanResult = validateEnvText({ contract, target: "home-server-source", text: orphanApex })
  assert.equal(orphanResult.ok, false, "APEX_DOMAIN without COMPANY_DOMAIN redirects to nothing")
  assert(orphanResult.errors.some((error) => error.key === "APEX_DOMAIN"))
})

// 키를 생략하는 것은 vhost를 끄는 것이 아니다. Caddy의 `{$VAR:default}`는 변수가 unset일 때
// 기본값을 쓰므로, 생략된 도메인 키의 site address는 `.localhost` 기본 주소로 살아 있다.
// 집합 검사가 생략된 키를 그냥 건너뛰면 "설정된 값 == 생략된 키의 기본 주소" 조합이 통과하는데,
// 그것은 caddy 기동 거부(중복 site address)라서 edge 전체가 내려가는 조합이다.
test("site address 유일성은 생략된 도메인 키의 Caddyfile 기본 주소까지 포함한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const siteAddressCheck = (contract.targets["home-server-source"].crossChecks || []).find(
    (check) => check.type === "allDistinct",
  )
  assert.ok(siteAddressCheck, "Caddy site address keys must be checked for uniqueness as a set")

  // 기대값은 Caddyfile에서 읽는다. 여기 값을 적어 두면 Caddyfile의 기본값이 바뀐 뒤에도 계약의
  // 낡은 표가 그린으로 남고, 그 순간 이 검사가 실제 주소가 아닌 유령 주소를 지킨다.
  const caddyDefaults = {}
  for (const key of siteAddressCheck.keys) {
    const occurrences = [...caddyfile.matchAll(new RegExp(`\\{\\$${key}:([^}]*)\\}`, "g"))].map((match) => match[1])
    assert.ok(occurrences.length > 0, `${key} must be interpolated with a default in the Caddyfile`)
    // 같은 키가 여러 번 보간되면(회사 호스트는 vhost 주소와 apex의 redirect 목적지 양쪽에 쓰인다)
    // 기본값이 하나여야 한다. 갈라지면 어느 쪽이 실제 주소인지 계약이 표현할 수 없다.
    assert.deepEqual([...new Set(occurrences)], [occurrences[0]], `${key} default must be spelled once`)
    caddyDefaults[key] = occurrences[0]
  }
  assert.deepEqual(
    siteAddressCheck.fallbacks,
    caddyDefaults,
    "the contract fallback table must be the Caddyfile's own defaults for every site address key",
  )
  // 기본 주소끼리 겹치면 아무 키도 설정하지 않은 상태에서 이미 caddy가 기동하지 못한다.
  assert.equal(
    new Set(Object.values(caddyDefaults).map((host) => host.toLowerCase())).size,
    Object.keys(caddyDefaults).length,
    "the .localhost defaults themselves must be distinct site addresses",
  )

  const healthy = [
    baseHomeServerEnv,
    "COMPANY_DOMAIN=www.aquilaxk.site",
    "PRODUCT_DOMAIN=easysubway.aquilaxk.site",
    "APEX_DOMAIN=aquilaxk.site",
  ].join("\n")
  const healthyResult = validateEnvText({ contract, target: "home-server-source", text: healthy })
  assert.equal(
    healthyResult.ok,
    true,
    healthyResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )

  // 표면 키를 아직 열지 않은 컷오버 전 조합도 통과해야 한다 - 생략된 세 키의 기본 주소는 서로
  // 다르므로, 기본 주소를 집합에 넣는 것만으로 배포가 잠기면 안 된다.
  const preCutover = validateEnvText({ contract, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(
    preCutover.ok,
    true,
    preCutover.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )

  // 실측은 APEX_DOMAIN으로 한다. COMPANY_DOMAIN·PRODUCT_DOMAIN은 allowedValues로 고정돼 있어
  // 충돌을 표현할 수조차 없고, apex는 고정값이 없어 이 검사가 유일한 방어선이다.
  for (const [omitted, reason] of [
    ["PRODUCT_DOMAIN", "the product vhost still answers on its default address while the key is unset"],
    ["COMPANY_DOMAIN", "the company vhost still answers on its default address while the key is unset"],
  ]) {
    const fallbackHost = caddyDefaults[omitted]
    // apex는 COMPANY_DOMAIN을 요구하므로 회사 키는 남겨 두고 충돌 대상만 생략한다.
    const collided = [
      baseHomeServerEnv,
      ...(omitted === "COMPANY_DOMAIN" ? [] : ["COMPANY_DOMAIN=www.aquilaxk.site"]),
      `APEX_DOMAIN=${fallbackHost}`,
    ].join("\n")
    const result = validateEnvText({ contract, target: "home-server-source", text: collided })
    assert.equal(result.ok, false, `APEX_DOMAIN=${fallbackHost} collides because ${reason}`)
    assert(
      result.errors.some(
        (error) => error.key === "APEX_DOMAIN" && error.message.includes(`must differ from the ${omitted} default site address`),
      ),
      JSON.stringify(result.errors),
    )
  }

  // 대소문자만 다른 충돌도 Caddy에는 같은 주소다.
  const casedCollision = [
    baseHomeServerEnv,
    "COMPANY_DOMAIN=www.aquilaxk.site",
    `APEX_DOMAIN=${caddyDefaults.PRODUCT_DOMAIN.toUpperCase()}`,
  ].join("\n")
  const casedResult = validateEnvText({ contract, target: "home-server-source", text: casedCollision })
  assert.equal(casedResult.ok, false, "a default-address duplicate that differs only in case is still a duplicate")
  assert(
    casedResult.errors.some((error) => error.key === "APEX_DOMAIN" && /default site address/.test(error.message)),
    JSON.stringify(casedResult.errors),
  )

  // 생략된 키를 실제로 설정하면 그 기본 주소는 더 이상 점유되지 않는다. 계속 막으면 유령 주소
  // 때문에 정상 조합이 거부된다.
  const releasedFallback = [
    baseHomeServerEnv,
    "COMPANY_DOMAIN=www.aquilaxk.site",
    "PRODUCT_DOMAIN=easysubway.aquilaxk.site",
    `APEX_DOMAIN=${caddyDefaults.PRODUCT_DOMAIN}`,
  ].join("\n")
  const releasedResult = validateEnvText({ contract, target: "home-server-source", text: releasedFallback })
  assert.equal(
    releasedResult.ok,
    true,
    releasedResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )
})

test("web 도메인 env 키는 caddy 컨테이너까지 전달되고 FRONTURL과 교차 검증된다", () => {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"))
  const caddyEnvExample = readFileSync(
    path.join(repoRoot, "deploy/homeserver/.env.caddy.prod.example"),
    "utf8",
  )
  const sourceKeys = contract.targets["home-server-source"].keys
  const webDomain = sourceKeys.find((key) => key.name === "WEB_DOMAIN")
  const webUpstream = sourceKeys.find((key) => key.name === "WEB_UPSTREAM")

  assert.ok(webDomain, "WEB_DOMAIN must be declared in the home-server-source contract")
  assert.equal(webDomain.kind, "hostname")
  // WEB_UPSTREAM은 Caddyfile의 reverse_proxy 대상으로 그대로 보간된다. 자유 문자열로 두면 오타
  // 하나가 공개 web 트래픽을 Caddy가 닿을 수 있는 다른 서비스로 보낸다.
  assert.ok(webUpstream, "WEB_UPSTREAM must be declared in the home-server-source contract")
  assert.deepEqual(webUpstream.allowedValues, ["front_blue", "front_green"])
  assert.match(caddyEnvExample, /^WEB_DOMAIN=/m)
  assert(
    (contract.targets["home-server-source"].crossChecks || []).some(
      (check) =>
        check.type === "urlHostEquals" &&
        check.urlKey === "CUSTOM_PROD_FRONTURL" &&
        check.hostKey === "WEB_DOMAIN",
    ),
    "WEB_DOMAIN must be cross-checked against CUSTOM_PROD_FRONTURL host",
  )
  // WEB_DOMAIN을 잊은 채 CUSTOM_PROD_FRONTURL만 옮기면 crossCheck는 한쪽이 비어 스킵되고
  // 공개 도메인만 404가 된다. 새 topology에서는 필수로 좁힌다.
  // host 비교여야 한다. raw 비교면 후행 슬래시 하나로 게이트가 조용히 닫히고, WEB_DOMAIN이
  // optional로 통과해 공개 사이트와 공개 API가 함께 404가 된다.
  assert.deepEqual(webDomain.requiredWhen, { key: "CUSTOM_PROD_BACKURL", hostEquals: "blog.aquilaxk.site" })
  // 접힌 구 API 호스트 키가 계약으로 되살아나면 Caddy가 더 이상 읽지 않는 값을 오너가 계속
  // 유지보수하게 되고, 그 키를 요구하는 게이트가 다시 붙을 여지가 남는다.
  assert.equal(sourceKeys.some((key) => key.name === "API_DOMAIN"), false)
  assert.doesNotMatch(caddyEnvExample, /^API_DOMAIN=/m)
})

// 주석에만 키 이름이 있어도 통과하던 검사를 실제 산출물 검사로 바꾼다. materialize를 돌려
// 어떤 키가 어느 서비스 env로 갔는지 본다.
test("materialize_service_env.sh는 키를 서비스별 env 파일로 실제 분배한다", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "materialize-front-"))
  try {
    const script = path.join(workDir, "materialize_service_env.sh")
    const sourceEnv = path.join(workDir, "source.env")
    copyFileSync(path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"), script)
    chmodSync(script, 0o755)
    writeFileSync(
      sourceEnv,
      [
        "WEB_DOMAIN=blog.example.com",
        "WEB_UPSTREAM=front_green",
        "MONITOR_DOMAIN=",
        "BACKEND_INTERNAL_URL=http://caddy",
        "CUSTOM__REVALIDATE__TOKEN=revalidate_secret_value",
        " export WEB_METRICS_TOKEN = 'stale-web-metrics-token-abcdefghijklmnopqrstuvwxyz012345' \r",
        ` WEB_METRICS_TOKEN = "${webMetricsTokenFixture}"  \r`,
        "BACKEND_PROXY_MAX_BODY_BYTES=1048576",
        "CUSTOM_PROD_DBNAME=blog_prod",
        "",
      ].join("\n"),
    )

    const outputs = {
      caddy: path.join(workDir, ".env.caddy.prod"),
      back: path.join(workDir, ".env.back.prod"),
      front: path.join(workDir, ".env.front.prod"),
      frontMetrics: path.join(workDir, ".env.front.metrics.prod"),
      prometheusCredentialRoot: path.join(workDir, ".web-metrics-credentials"),
      prometheusCredentialDir: path.join(workDir, ".web-metrics-credentials", "runtime"),
      prometheusCredential: path.join(workDir, ".web-metrics-credentials", "runtime", "web-metrics-token"),
      legacyPrometheusCredential: path.join(workDir, ".web-metrics-token"),
    }

    {
      writeFileSync(outputs.legacyPrometheusCredential, "retired-credential\n", { mode: 0o600 })
      execFileSync("bash", [script, sourceEnv], { stdio: "pipe" })
      const caddyEnv = readFileSync(outputs.caddy, "utf8")
      const backEnv = readFileSync(outputs.back, "utf8")
      const frontEnv = readFileSync(outputs.front, "utf8")
      const frontMetricsEnv = readFileSync(outputs.frontMetrics, "utf8")
      const prometheusCredential = readFileSync(outputs.prometheusCredential, "utf8")

      assert.match(caddyEnv, /^WEB_DOMAIN=blog\.example\.com$/m)
      assert.match(caddyEnv, /^WEB_UPSTREAM=front_green$/m)
      // 값이 빈 키는 caddy env로 내보내지 않는다. Caddy의 `{$VAR:default}`는 변수가 **unset**일
      // 때만 기본값을 쓰고, 존재하되 비어 있으면 빈 문자열을 그대로 쓴다. 그러면 site address가
      // `http://`가 되어 host matcher 없는 :80 catch-all 라우트가 되고, 다른 vhost가 잡지 않는
      // 모든 호스트를 그 vhost가 삼킨다 (caddy adapt로 실측). 줄을 지우지 않고 비우는 실수가
      // edge 라우팅을 통째로 바꾸는 경로라 여기서 끊는다.
      assert.doesNotMatch(caddyEnv, /^MONITOR_DOMAIN=$/m)
      // front 런타임 키가 빠지면 컨테이너는 healthy를 보고하면서 모든 SSR 경로가 500이 된다.
      assert.match(frontEnv, /^BACKEND_INTERNAL_URL=http:\/\/caddy$/m)
      // front의 TOKEN_FOR_REVALIDATE와 backend의 CUSTOM__REVALIDATE__TOKEN은 같은 공유 비밀이다.
      // 별도 키로 두면 어긋나도 아무도 실패하지 않고 revalidate만 401이 된다.
      assert.match(frontEnv, /^TOKEN_FOR_REVALIDATE=revalidate_secret_value$/m)
      assert.doesNotMatch(frontEnv, /^CUSTOM__REVALIDATE__TOKEN=/m)
      assert.doesNotMatch(frontEnv, /^WEB_METRICS_TOKEN=/m)
      assert.doesNotMatch(backEnv, /^WEB_METRICS_TOKEN=/m)
      assert.doesNotMatch(caddyEnv, /^WEB_METRICS_TOKEN=/m)
      assert.equal(frontMetricsEnv, `WEB_METRICS_TOKEN=${webMetricsTokenFixture}\n`)
      assert.equal(prometheusCredential, `${webMetricsTokenFixture}\n`)
      assert.equal(statSync(outputs.frontMetrics).mode & 0o777, 0o600)
      assert.equal(statSync(outputs.prometheusCredentialRoot).mode & 0o777, 0o700)
      assert.equal(statSync(outputs.prometheusCredentialDir).mode & 0o777, 0o755)
      assert.equal(statSync(outputs.prometheusCredential).mode & 0o777, 0o444)
      assert.equal(existsSync(outputs.legacyPrometheusCredential), false, "retired single-file credential must be removed")

      const credentialRootInode = statSync(outputs.prometheusCredentialRoot).ino
      const credentialDirInode = statSync(outputs.prometheusCredentialDir).ino
      const credentialInode = statSync(outputs.prometheusCredential).ino
      const rotatedSourceEnv = path.join(workDir, "rotated-web-metrics-token.env")
      writeFileSync(rotatedSourceEnv, `WEB_METRICS_TOKEN=${rotatedWebMetricsTokenFixture}\n`)
      execFileSync("bash", [script, rotatedSourceEnv], { stdio: "pipe" })
      assert.equal(statSync(outputs.prometheusCredentialRoot).ino, credentialRootInode)
      assert.equal(statSync(outputs.prometheusCredentialDir).ino, credentialDirInode)
      assert.notEqual(statSync(outputs.prometheusCredential).ino, credentialInode)
      assert.equal(readFileSync(outputs.prometheusCredential, "utf8"), `${rotatedWebMetricsTokenFixture}\n`)
      assert.equal(readFileSync(outputs.frontMetrics, "utf8"), `WEB_METRICS_TOKEN=${rotatedWebMetricsTokenFixture}\n`)

      const composeEnvCheck = path.join(workDir, "compose-env-check.yml")
      writeFileSync(
        composeEnvCheck,
        [
          "services:",
          "  env_check:",
          "    image: alpine:3.20",
          "    env_file:",
          `      - path: ${outputs.front}`,
          `      - path: ${outputs.frontMetrics}`,
          "        format: raw",
          "",
        ].join("\n"),
      )
      const rendered = JSON.parse(
        execFileSync("docker", ["compose", "-f", composeEnvCheck, "config", "--format", "json"], { encoding: "utf8" }),
      )
      assert(Object.hasOwn(rendered.services.env_check.environment, "WEB_METRICS_TOKEN"))
      // BACKEND_PROXY_*는 front 전용이다 (`git grep BACKEND_PROXY -- back/`는 0건).
      assert.match(frontEnv, /^BACKEND_PROXY_MAX_BODY_BYTES=1048576$/m)
      assert.doesNotMatch(backEnv, /^BACKEND_PROXY_/m)
      // 서비스별 env는 서로의 비밀을 담지 않는다 (blast radius / HR-56).
      assert.doesNotMatch(frontEnv, /^CUSTOM_PROD_DBNAME=/m)
      assert.doesNotMatch(caddyEnv, /^BACKEND_INTERNAL_URL=/m)

      const missingTokenEnv = path.join(workDir, "missing-web-metrics-token.env")
      writeFileSync(missingTokenEnv, "BACKEND_INTERNAL_URL=http://caddy\n")
      assert.throws(
        () => execFileSync("bash", [script, missingTokenEnv], { stdio: "pipe" }),
      )
      assert.equal(existsSync(outputs.prometheusCredential), false, "missing token must not preserve a stale Prometheus credential")
      assert.equal(existsSync(outputs.frontMetrics), false, "missing token must not preserve a stale front credential")

      const shortTokenEnv = path.join(workDir, "short-web-metrics-token.env")
      writeFileSync(outputs.legacyPrometheusCredential, "retired-credential\n", { mode: 0o600 })
      writeFileSync(shortTokenEnv, "WEB_METRICS_TOKEN=too-short\n")
      assert.throws(
        () => execFileSync("bash", [script, shortTokenEnv], { stdio: "pipe" }),
      )
      assert.equal(existsSync(outputs.prometheusCredential), false, "short token must never materialize a Prometheus credential")
      assert.equal(existsSync(outputs.frontMetrics), false, "short token must never materialize a front credential")
      assert.equal(existsSync(outputs.legacyPrometheusCredential), false, "invalid input must remove the retired credential")
      assert.doesNotMatch(readFileSync(outputs.front, "utf8"), /WEB_METRICS_TOKEN=too-short/)
    }
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("materialize_service_env.sh는 Docker Compose 2.30.0 미만을 산출물 생성 전에 차단한다", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "materialize-compose-version-"))
  try {
    const script = path.join(workDir, "materialize_service_env.sh")
    const sourceEnv = path.join(workDir, ".env.prod")
    const fakeBin = path.join(workDir, "bin")
    const fakeDocker = path.join(fakeBin, "docker")
    const outputs = [
      ".env.caddy.prod",
      ".env.back.prod",
      ".env.front.prod",
      ".env.front.metrics.prod",
      ".web-metrics-credentials/runtime/web-metrics-token",
    ]

    copyFileSync(path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"), script)
    chmodSync(script, 0o755)
    mkdirSync(fakeBin)
    writeFileSync(sourceEnv, `WEB_METRICS_TOKEN=${webMetricsTokenFixture}\n`)
    writeFileSync(fakeDocker, "#!/usr/bin/env bash\nprintf '%s\\n' \"$FAKE_DOCKER_COMPOSE_VERSION\"\n")
    chmodSync(fakeDocker, 0o755)

    const run = (version) =>
      execFileSync("bash", [script, sourceEnv], {
        env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, FAKE_DOCKER_COMPOSE_VERSION: version },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })

    assert.throws(() => run("v2.29.9"), /Docker Compose 2\.30\.0 or newer is required/)
    for (const output of outputs) assert.equal(existsSync(path.join(workDir, output)), false)

    run("2.30.0-desktop.1")
    for (const output of outputs) assert.equal(existsSync(path.join(workDir, output)), true)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }
})

test("Prometheus alone receives the host-private Web metrics credential directory", () => {
  const compose = readFileSync(composePath, "utf8")
  const prometheus = extractComposeService(compose, "prometheus")

  assert.match(prometheus, /- \.\/\.web-metrics-credentials\/runtime:\/run\/secrets:ro$/m)
  assert.doesNotMatch(compose, /^secrets:/m)
  assert.doesNotMatch(compose, /\.\/\.web-metrics-token:/)
  for (const serviceName of extractComposeServiceNames(compose).filter((name) => name !== "prometheus")) {
    assert.doesNotMatch(extractComposeService(compose, serviceName), /\.web-metrics-credentials|web-metrics-token/)
  }
})

test("front services alone consume the raw Web metrics env file", () => {
  const compose = readFileSync(composePath, "utf8")

  for (const colour of ["blue", "green"]) {
    const service = extractComposeService(compose, `front_${colour}`)
    assert.match(service, /env_file:\n(?:\s+#.*\n)*\s+- \.\/\.env\.front\.prod\n\s+- path: \.\/\.env\.front\.metrics\.prod\n\s+format: raw/)
  }
  for (const serviceName of ["back_blue", "caddy", "prometheus"]) {
    assert.doesNotMatch(extractComposeService(compose, serviceName), /\.env\.front\.metrics\.prod/)
  }
})

// COMPOSE_PROFILES는 셸과 .env.prod 양쪽에 있을 수 있는데 compose()가 항상 명시 지정하므로,
// 셸만 읽으면 .env.prod가 켠 프로필이 조용히 사라진다. 그리고 프로필이 켜져도 boot 목록에
// 없으면 `compose up`이 그 서비스를 만들지 않는다. 두 겹 다 고정한다.
test("배포·롤백 스크립트는 env 파일의 COMPOSE_PROFILES를 병합하고 front를 기동한다", () => {
  const deployScript = readFileSync(deployScriptPath, "utf8")
  const rollbackScript = readFileSync(path.join(repoRoot, "deploy/homeserver/rollback_last_deploy.sh"), "utf8")

  for (const [name, script] of [["blue_green_deploy.sh", deployScript], ["rollback_last_deploy.sh", rollbackScript]]) {
    assert.match(script, /compose_profiles_from_env_file\(\) \{/, `${name} must read COMPOSE_PROFILES from the env file`)
    assert.match(script, /env_value "COMPOSE_PROFILES"/, `${name} must resolve COMPOSE_PROFILES from .env.prod`)
  }

  assert.match(deployScript, /compose_profile_enabled "front"/)
  assert.match(deployScript, /front_services_to_boot=\(front_blue front_green\)/)

  // CRLF로 저장된 .env.prod에서는 값 끝에 \r이 남는다. trim_quotes가 그 뒤에 돌면 마지막 문자가
  // \r이라 닫는 따옴표를 못 떼고 `front"`가 되어 프로필이 조용히 꺼진다. 같은 리더가 DB 비밀번호와
  // 스토리지 키도 읽으므로 값 손상 범위가 프로필에 그치지 않는다. 읽는 지점에서 없앤다.
  const readers = [
    ["deploy.yml", readFileSync(workflowPath, "utf8"), "read_prod_env_value"],
    ["blue_green_deploy.sh", deployScript, "env_value"],
    ["rollback_last_deploy.sh", rollbackScript, "env_value"],
    ["check_deploy_status.sh", readFileSync(deployStatusScriptPath, "utf8"), "env_value"],
    ["doctor.sh", readFileSync(doctorScriptPath, "utf8"), "env_value"],
  ]
  for (const [name, script, functionName] of readers) {
    const readerBody = extractTopLevelShellFunction(script, functionName)
    const executableReaderBody = readerBody
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n")
    assert.match(executableReaderBody, /^\s*(?:gsub\(\/\\r\/, "", value\)|sub\(\/\\r\$\/, "", value\))\s*$/m, `${name} reader must execute CRLF terminator removal`)
  }
  const doctorReader = extractTopLevelShellFunction(readFileSync(doctorScriptPath, "utf8"), "env_value")
  assert.match(doctorReader, /^\s*sub\(\/\\r\$\/, "", value\)\s*$/m, "doctor.sh env_value must preserve internal carriage returns")
  assert.doesNotMatch(doctorReader, /^\s*gsub\(\/\\r\/, "", value\)\s*$/m, "doctor.sh env_value must not remove internal carriage returns")
})

// .env.prod.example은 deploy.yml이 HOME_SERVER_ENV 부재 시 .env.prod로 복사하는 파일이고
// verify-platform-standalone.sh의 입력이기도 한데, 계약으로 검증하는 곳이 없었다. 그래서 키가
// 서로 어긋난 예시가 조용히 남을 수 있었다 — 특히 도메인 세 값은 crossCheck 대상이다.
test(".env.prod.example은 자기 자신이 env 계약을 통과한다", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const example = readFileSync(envExamplePath, "utf8")

  // 예시 파일은 placeholder(change_me / example.com / <digest>)로 채워져 있는 것이 정상이라
  // 값 자체를 보는 규칙은 끈다. 이 게이트가 지키는 것은 키 사이의 정합성이다 —
  // crossChecks(도메인 3종·백업 경로)와 mustDifferFrom. 그것만 남긴다.
  const contract = loadContract(contractPath)
  const relaxed = JSON.parse(JSON.stringify(contract))
  for (const target of Object.values(relaxed.targets)) {
    for (const key of target.keys || []) {
      key.placeholderForbidden = false
      delete key.kind
      delete key.minLength
      delete key.allowedValues
      delete key.forbiddenValues
      delete key.forbiddenSha256
    }
  }

  const result = validateEnvText({ contract: relaxed, target: "home-server-source", text: example })

  // `is required`를 걸러내던 필터를 걷었다. 그 필터가 있는 동안 이 게이트는 "예시가 계약을
  // 통과한다"고 말하면서 실제로는 필수 키 누락을 통째로 눈감았고, requiredWhen 게이트가
  // 새 스위치로 옮겨가면서 실제로 빠진 키(BACKEND_INTERNAL_URL)를 놓쳤다. 예시 파일은
  // 오너가 복사해 쓰는 출발점이므로 필수 키가 빠진 상태를 통과시키면 안 된다.
  assert.deepEqual(
    result.errors.map((error) => `${error.key}: ${error.message}`),
    [],
    ".env.prod.example must stay internally consistent with the env contract",
  )
})
