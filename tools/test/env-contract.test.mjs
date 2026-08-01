import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

const repoRoot = path.resolve(import.meta.dirname, "../..")
const contractPath = path.join(repoRoot, "deploy/env/env.contract.json")
const workflowPath = path.join(repoRoot, ".github/workflows/deploy.yml")
const ciWorkflowPath = path.join(repoRoot, ".github/workflows/ci.yml")
const backupRestoreWorkflowPath = path.join(repoRoot, ".github/workflows/backup-restore-drill.yml")
const composePath = path.join(repoRoot, "deploy/homeserver/docker-compose.prod.yml")
const caddyfilePath = path.join(repoRoot, "deploy/homeserver/caddy/Caddyfile")
const envExamplePath = path.join(repoRoot, "deploy/homeserver/.env.prod.example")
const applicationProdPath = path.join(repoRoot, "back/src/main/resources/application-prod.yaml")
const deployScriptPath = path.join(repoRoot, "deploy/homeserver/blue_green_deploy.sh")
const deployBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_deploy_backup.sh")
const baselineScriptPath = path.join(repoRoot, "deploy/homeserver/record_deploy_baseline.sh")
const externalBackupScriptPath = path.join(repoRoot, "deploy/homeserver/create_external_backup.sh")
const hardeningScriptPath = path.join(repoRoot, "deploy/homeserver/hardening/setup_hardening.sh")
const hardeningDocPath = path.join(repoRoot, "deploy/homeserver/HARDENING.md")
const prometheusPath = path.join(repoRoot, "deploy/homeserver/monitoring/prometheus.yml")
const taskAlertsPath = path.join(repoRoot, "deploy/homeserver/monitoring/rules/task-alerts.yml")
const vercelConfigPath = path.join(repoRoot, "front/vercel.json")

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

const forbiddenSecretBackupCopyPattern =
  /for file in[^\n]*[\s/]\.env\.prod(?:\.compose)?(?:[\s"';]|$)|\b(?:cp|install)\b[^\n]*[\s/]\.env\.prod(?:\.compose)?(?:[\s"';]|$)/

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
  "API_DOMAIN=api.blog.aquilaxk.site",
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
  "CUSTOM__ADMIN__USERNAME=관리자",
  "CUSTOM__ADMIN__EMAIL=admin@aquilaxk.site",
  "CUSTOM__ADMIN__PASSWORD=valid-admin-password",
  "CUSTOM_PROD_COOKIEDOMAIN=blog.aquilaxk.site",
  "CUSTOM_PROD_FRONTURL=https://blog.aquilaxk.site",
  "CUSTOM_PROD_BACKURL=https://api.blog.aquilaxk.site",
  "CUSTOM_PROD_DBNAME=blog_prod",
  "CUSTOM_PROD_REDISDATABASE=0",
  "CUSTOM__REVALIDATE__URL=https://blog.aquilaxk.site/api/revalidate",
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

test("home-server-source contract rejects enabled AI summary before SSH deployment", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")

  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: baseHomeServerEnv.replace("CUSTOM__AI__SUMMARY__ENABLED=false", "CUSTOM__AI__SUMMARY__ENABLED=true"),
  })

  assert.equal(result.ok, false)
  assert(
    result.errors.some((error) => error.key === "CUSTOM__AI__SUMMARY__ENABLED" && error.message.includes("must be one of: false")),
    result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"),
  )
})

test("Caddy access logs skip signup verification endpoint before proxying", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const matcherIndex = caddyfile.indexOf("@signupVerifySensitive path /member/api/v1/signup/email/verify")
  const skipIndex = caddyfile.indexOf("log_skip @signupVerifySensitive")
  const apiBlockIndex = caddyfile.indexOf("http://{$API_DOMAIN}")
  const proxyIndex = caddyfile.indexOf("reverse_proxy {$ADMIN_API_UPSTREAM:back_blue}:8080", apiBlockIndex)

  assert.notEqual(apiBlockIndex, -1, "API domain block must be configured")
  assert.notEqual(matcherIndex, -1, "signup verify sensitive matcher must be configured")
  assert.notEqual(skipIndex, -1, "signup verify access log skip must be configured")
  assert(skipIndex > matcherIndex, "signup verify log_skip must reference the sensitive matcher")
  assert(skipIndex < proxyIndex, "signup verify log_skip must be declared before API proxy handling")
  assert(!caddyfile.includes("?token="), "Caddy config must not preserve signup verification token query examples")
  assert(!caddyfile.includes("signup=done&email="), "Caddy config must not preserve signup completion email query examples")
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

test("API vhost keeps the legacy API host reachable during the domain cutover", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const addressLine = caddyfile.split("\n").find((line) => line.startsWith("http://{$API_DOMAIN}"))

  assert(addressLine, "API vhost address line must exist")
  // 단일 site address면 구·신 API 호스트가 동시에 살 수 없어, 어느 순서로 전환해도
  // 공개 사이트가 죽는 창이 생긴다.
  assert.match(addressLine, /^http:\/\/\{\$API_DOMAIN\}, http:\/\/\{\$LEGACY_API_DOMAIN:[^}]+\} \{$/, addressLine)
  // 기본값이 비면 주소가 `http://`가 되어 host matcher 없는 :80 catch-all이 된다.
  assert.match(addressLine, /\{\$LEGACY_API_DOMAIN:[a-z0-9-]+\.localhost\}/, addressLine)
})

test("LEGACY_API_DOMAIN is declared as an optional transition-only key and reaches Caddy", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const definition = contract.targets["home-server-source"].keys.find((key) => key.name === "LEGACY_API_DOMAIN")

  assert(definition, "LEGACY_API_DOMAIN must be declared")
  assert.equal(definition.required, false)
  assert.equal(definition.kind, "hostname")

  // Caddy service env에 실리지 않으면 vhost 주소가 기본값(.localhost)으로 남아 무의미해진다.
  const materialize = readFileSync(path.join(repoRoot, "deploy/homeserver/materialize_service_env.sh"), "utf8")
  assert.match(materialize, /LEGACY_API_DOMAIN/)
})

test("LEGACY_API_DOMAIN warns while set and is rejected for another service host", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)

  const open = validateEnvText({
    contract,
    target: "home-server-source",
    text: `${baseHomeServerEnv}\nLEGACY_API_DOMAIN=api.aquilaxk.site`,
  })
  assert.equal(open.ok, true, open.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  // 조용히 영구 잔존하면 apex 소유가 바뀐 뒤에도 구 호스트가 백엔드를 계속 노출한다.
  assert(open.warnings.some((warning) => warning.key === "LEGACY_API_DOMAIN"))

  for (const forbidden of ["aquilaxk.site", "www.aquilaxk.site"]) {
    const result = validateEnvText({
      contract,
      target: "home-server-source",
      text: `${baseHomeServerEnv}\nLEGACY_API_DOMAIN=${forbidden}`,
    })
    assert.equal(result.ok, false, `${forbidden} must not become an API vhost address`)
    assert(result.errors.some((error) => error.key === "LEGACY_API_DOMAIN"))
  }

  const closed = validateEnvText({ contract, target: "home-server-source", text: baseHomeServerEnv })
  assert.equal(closed.warnings.some((warning) => warning.key === "LEGACY_API_DOMAIN"), false)
})

test("LEGACY_API_DOMAIN must be removed, not blanked, because an empty value deletes the API vhost", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // 실측: `caddy adapt`에서 LEGACY_API_DOMAIN= (present but empty)이면 두 번째 주소가
  // `http://`가 되어 site 전체가 host matcher 없는 :80 catch-all이 되고, API vhost의
  // api.blog.aquilaxk.site host matcher가 출력에서 통째로 사라진다.
  // 창을 닫을 때 줄을 지우지 않고 비우는 것이 가장 자연스러운 실수라 여기서 막는다.
  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "home-server-source",
    text: `${baseHomeServerEnv}\nLEGACY_API_DOMAIN=`,
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "LEGACY_API_DOMAIN"))
})

test("Caddy edge CORS allows the public web origin only", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apiBlock = extractCaddySiteBlock(caddyfile, "http://{$API_DOMAIN}")

  assert.notEqual(apiBlock, "", "API domain site block must be extractable")

  const originMatchers = [...apiBlock.matchAll(/header_regexp Origin Origin (\S+)/g)].map((match) => match[1])
  assert.equal(originMatchers.length, 2, "both @corsAllowed and @corsPreflight must match the Origin header")

  for (const pattern of originMatchers) {
    const originPattern = new RegExp(pattern)
    // 전환 후 실제 front origin이 매치돼야 edge CORS가 살아 있다.
    assert(originPattern.test("https://blog.aquilaxk.site"), `edge CORS must allow the public web origin: ${pattern}`)
    // apex와 www는 타 서비스 소유다. 매치되면 우리 API가 그쪽에 열린다.
    assert(!originPattern.test("https://aquilaxk.site"), `edge CORS must not allow the apex origin: ${pattern}`)
    assert(!originPattern.test("https://www.aquilaxk.site"), `edge CORS must not allow the www origin: ${pattern}`)
    assert(!originPattern.test("https://www.blog.aquilaxk.site"), `edge CORS must not allow a www.blog origin: ${pattern}`)
    assert(!originPattern.test("https://blog.aquilaxk.site.evil.example"), `edge CORS must anchor the origin: ${pattern}`)
  }
})

test("Caddy request_header hop deletions use single-line syntax", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apiBlock = extractCaddySiteBlock(caddyfile, "http://{$API_DOMAIN}")

  assert.notEqual(apiBlock, "", "API domain site block must be extractable")
  // request_header does not support block form; `{` after the directive fails caddy adapt.
  assert.doesNotMatch(apiBlock, /request_header\s*\{/)
  assert.match(apiBlock, /^\s*request_header -X-Forwarded-For\s*$/m)
  assert.match(apiBlock, /^\s*request_header -CF-Connecting-IP\s*$/m)
  assert.match(apiBlock, /^\s*request_header -True-Client-IP\s*$/m)
  assert.match(apiBlock, /^\s*request_header -X-Real-IP\s*$/m)
})

test("Caddy access logs skip sensitive query routes before proxying", () => {
  const caddyfile = readFileSync(caddyfilePath, "utf8")
  const apiBlockIndex = caddyfile.indexOf("http://{$API_DOMAIN}")
  const adminHandleIndex = caddyfile.indexOf("handle @adminApi {", apiBlockIndex)
  const publicReadHandleIndex = caddyfile.indexOf("handle @publicReadFallback {", apiBlockIndex)
  const sensitiveRoutes = [
    ["@oauthCallbackSensitive", "path /login/oauth2/code/*"],
    ["@socialSignupSensitive", "path /member/api/v1/signup/social/pending /member/api/v1/signup/social/complete"],
    ["@accountDeletionSensitive", "path /member/api/v1/privacy/account"],
    ["@publicSearchSensitive", "path /post/api/v1/posts/search"],
  ]

  assert.notEqual(apiBlockIndex, -1, "API domain block must be configured")
  assert.notEqual(adminHandleIndex, -1, "admin API handle must be configured")
  assert.notEqual(publicReadHandleIndex, -1, "public read handle must be configured")

  for (const [matcherName, pathMatcher] of sensitiveRoutes) {
    const matcherIndex = caddyfile.indexOf(`${matcherName} ${pathMatcher}`)
    const skipIndex = caddyfile.indexOf(`log_skip ${matcherName}`)

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
stage_home_server_env_key "PROD___POSTGRES__PASSWORD"
stage_home_server_env_key "GRAFANA_ADMIN_PASSWORD"
stage_home_server_env_key "ALERTMANAGER_SMTP_AUTH_PASSWORD"
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
          ].join("\n"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    )

    assert.match(output, /^PROD___POSTGRES__PASSWORD='pa\$word'$/m)
    assert.match(output, /^GRAFANA_ADMIN_PASSWORD='let\\'s\$secret\\path'$/m)
    assert.match(output, /^ALERTMANAGER_SMTP_AUTH_PASSWORD=''$/m)
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
  ["API_DOMAIN", "api.aquilaxk.site"],
  ["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"],
  ["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"],
  ["CUSTOM_PROD_BACKURL", "https://api.aquilaxk.site"],
]

const withEnvKeys = (text, pairs) =>
  pairs.reduce(
    (accumulated, [key, value]) => accumulated.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`),
    text,
  )

const siteTopologies = (contract) =>
  contract.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope").topologies

test("site topology is keyed on API_DOMAIN alone so a single secret value selects every front-derived value", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const topologies = siteTopologies(loadContract(contractPath))

  assert.deepEqual(Object.keys(topologies).sort(), ["api.aquilaxk.site", "api.blog.aquilaxk.site"])
  assert.deepEqual(topologies["api.blog.aquilaxk.site"], {
    cookieDomain: "blog.aquilaxk.site",
    frontHost: "blog.aquilaxk.site",
    webHost: "blog.aquilaxk.site",
    backHost: "api.blog.aquilaxk.site",
    publicEdgeProbeBaseUrl: "https://blog.aquilaxk.site",
    adminEmbedOrigins: "https://blog.aquilaxk.site",
    revalidateUrl: "https://blog.aquilaxk.site/api/revalidate",
  })
  assert.equal(topologies["api.aquilaxk.site"].webHost, "www.aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].cookieDomain, "aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].frontHost, "www.aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].backHost, "api.aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].publicEdgeProbeBaseUrl, "https://www.aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].adminEmbedOrigins, "https://www.aquilaxk.site")
  assert.equal(topologies["api.aquilaxk.site"].revalidateUrl, "https://www.aquilaxk.site/api/revalidate")
  // 전환 전 조합은 구조 불변식(cookieDomain === frontHost)을 위반한다. 그 사실이 표에 표기돼야 한다.
  assert.equal(topologies["api.aquilaxk.site"].structurallyUnsafe, true)
  assert(typeof topologies["api.aquilaxk.site"].warn === "string")
})

test("declared topology itself is checked against the cookie scope invariants, not just matched", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const base = loadContract(contractPath)

  // 표가 오타로 apex 쿠키 도메인을 선언하면, 값 대조만으로는 아무도 못 잡는다.
  // deploy.yml도 같은 표를 읽으므로 따라간다. 표를 검증하는 층이 있어야 한다.
  const poisoned = JSON.parse(JSON.stringify(base))
  const scope = poisoned.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  scope.topologies["api.blog.aquilaxk.site"].cookieDomain = "aquilaxk.site"

  const matching = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"]])
  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: matching })

  assert.equal(result.ok, false, "a topology that violates the cookie scope invariant must not be usable")
  assert(result.errors.some((error) => error.key === "API_DOMAIN" && error.message.includes("unsafe")))
})

const poisonTopology = (contract, name, patch) => {
  const copy = JSON.parse(JSON.stringify(contract))
  const scope = copy.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  Object.assign(scope.topologies[name], patch)
  return copy
}

test("structural invariants are enforced for every declared topology, not only the selected one", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // API_DOMAIN이 전환 전 값이어도, 표의 blog 항목이 오염되면 그 사실이 드러나야 한다.
  // 선택된 항목만 보면 전환 순간까지 오염을 못 잡는다.
  const poisoned = poisonTopology(loadContract(contractPath), "api.blog.aquilaxk.site", {
    cookieDomain: "aquilaxk.site",
  })
  const text = withEnvKeys(baseHomeServerEnv, [
    ...PRE_TRANSITION_DOMAIN_ENV,
    ["ADMIN_EMBED_ORIGINS", "https://www.aquilaxk.site"],
    ["CUSTOM__REVALIDATE__URL", "https://www.aquilaxk.site/api/revalidate"],
  ])

  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("api.blog.aquilaxk.site")))
})

test("only the single declared legacy topology may skip the structural invariants", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // 두 번째 예외가 생기면 불변식을 우회하는 문이 열린다.
  const poisoned = poisonTopology(loadContract(contractPath), "api.blog.aquilaxk.site", {
    cookieDomain: "aquilaxk.site",
    structurallyUnsafe: true,
  })

  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("undeclared legacy exception")))
})

test("the declared legacy topology must carry its label", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const contract = loadContract(contractPath)
  const scope = contract.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  assert.equal(scope.invariants.legacyUnsafeTopology, "api.aquilaxk.site")

  const unlabelled = JSON.parse(JSON.stringify(contract))
  const unlabelledScope = unlabelled.targets["home-server-source"].crossChecks.find(
    (check) => check.type === "cookieDomainScope",
  )
  delete unlabelledScope.topologies["api.aquilaxk.site"].structurallyUnsafe

  const result = validateEnvText({ contract: unlabelled, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("must be labelled")))
})

test("a topology whose web host differs from the cookie domain is rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const poisoned = poisonTopology(loadContract(contractPath), "api.blog.aquilaxk.site", {
    webHost: "www.blog.aquilaxk.site",
  })

  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.message.includes("webHost")))
})

test("a topology whose API host is not under the cookie domain is rejected", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const poisoned = JSON.parse(JSON.stringify(loadContract(contractPath)))
  const scope = poisoned.targets["home-server-source"].crossChecks.find((check) => check.type === "cookieDomainScope")
  scope.topologies["api.blog.aquilaxk.site"].backHost = "api.aquilaxk.site"

  const matching = withEnvKeys(baseHomeServerEnv, [
    ["API_DOMAIN", "api.aquilaxk.site"],
    ["CUSTOM_PROD_BACKURL", "https://api.aquilaxk.site"],
  ])
  // API_DOMAIN을 바꾸지 않은 채 표만 오염된 경우를 본다.
  const result = validateEnvText({ contract: poisoned, target: "home-server-source", text: baseHomeServerEnv })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "API_DOMAIN" && error.message.includes("unsafe")))
  assert(matching.length > 0)
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
  // 일반론이면 오너가 무엇이 사라지는지 모른다. 제거 대상 origin을 찍어야 한다.
  assert(warning.message.includes("https://www.aquilaxk.site"), warning.message)
  assert(warning.message.includes("https://aquilaxk.site"), warning.message)
  assert(warning.message.includes("https://blog.aquilaxk.site"), warning.message)
})

test("a topology may not grant admin embed rights outside its own web host", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const poisoned = poisonTopology(loadContract(contractPath), "api.blog.aquilaxk.site", {
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
  const text = withEnvKeys(baseHomeServerEnv, [["API_DOMAIN", "constructor"]])

  const result = validateEnvText({ contract, target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "API_DOMAIN" && error.message.includes("no declared prod site topology")))
})

test("cookie scope check compares hosts, so URL spelling drift in the secret does not block deploys", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // HOME_SERVER_ENV의 CUSTOM_PROD_*는 실 운영값과 표기가 다를 수 있다. 그래서 하드 핀이 있었다.
  // 후행 슬래시와 대소문자는 같은 host를 가리키므로 통과해야 한다.
  const text = withEnvKeys(baseHomeServerEnv, [
    ["CUSTOM_PROD_FRONTURL", "https://BLOG.aquilaxk.site/"],
    ["CUSTOM_PROD_BACKURL", "https://api.blog.aquilaxk.site/"],
    ["CUSTOM_PROD_COOKIEDOMAIN", "Blog.aquilaxk.site"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
})

test("cookie scope check rejects a cookie domain that is not the one declared for API_DOMAIN", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  for (const wrongCookieDomain of ["aquilaxk.site", "www.aquilaxk.site", "www.blog.aquilaxk.site"]) {
    const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_COOKIEDOMAIN", wrongCookieDomain]])
    const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

    assert.equal(result.ok, false, `${wrongCookieDomain} must not be accepted`)
    assert(result.errors.some((error) => error.key === "CUSTOM_PROD_COOKIEDOMAIN"))
  }
})

test("cookie scope check rejects a front host that is not the one declared for API_DOMAIN", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"]])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_FRONTURL"))
})

test("pre-transition domain set stays valid but is reported as a warning", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [
    ...PRE_TRANSITION_DOMAIN_ENV,
    ["ADMIN_EMBED_ORIGINS", "https://www.aquilaxk.site"],
    ["CUSTOM__REVALIDATE__URL", "https://www.aquilaxk.site/api/revalidate"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  assert(result.warnings.some((warning) => warning.key === "API_DOMAIN"))
  // 전환 전 조합은 구조적으로 안전하지 않다는 사실이 warn 문구에 드러나야 한다.
  assert(result.warnings.some((warning) => warning.key === "API_DOMAIN" && warning.message.includes("apex")))
})

test("partially migrated domain set fails closed instead of mixing both topologies", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  // API_DOMAIN/BACKURL만 옮기고 front·cookie를 그대로 둔 상태.
  const text = withEnvKeys(baseHomeServerEnv, [
    ["CUSTOM_PROD_COOKIEDOMAIN", "aquilaxk.site"],
    ["CUSTOM_PROD_FRONTURL", "https://www.aquilaxk.site"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_COOKIEDOMAIN"))
  assert(result.errors.some((error) => error.key === "CUSTOM_PROD_FRONTURL"))
})

test("API_DOMAIN outside the declared topologies fails on the runner before the remote script runs", async () => {
  const { loadContract, validateEnvText } = await import("../env/validate-env.mjs")
  const text = withEnvKeys(baseHomeServerEnv, [
    ["API_DOMAIN", "api.other.example"],
    ["CUSTOM_PROD_BACKURL", "https://api.other.example"],
  ])

  const result = validateEnvText({ contract: loadContract(contractPath), target: "home-server-source", text })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "API_DOMAIN"))
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
    assert.notEqual(branch, "", `deploy.yml must branch on API_DOMAIN=${apiDomain}`)
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

  // front origin 파생 키가 스위치 밖에 있으면 오너가 API_DOMAIN만 바꿨을 때 조용히 어긋난다.
  assert.match(workflow, /upsert_env_key "ADMIN_EMBED_ORIGINS" "\$\{PROD_SITE_ADMIN_EMBED_ORIGINS\}" "deploy\/homeserver\/\.env\.prod"/)
  // CUSTOM__REVALIDATE__URL은 required: false다. 비어 있는 상태(재생성 비활성)를 켜 버리면 안 된다.
  assert.match(workflow, /if \[ -n "\$\{EXISTING_REVALIDATE_URL\}" \]; then/)
  assert.match(workflow, /upsert_env_key "CUSTOM__REVALIDATE__URL" "\$\{PROD_SITE_REVALIDATE_URL\}" "deploy\/homeserver\/\.env\.prod"/)
})

test("front runtime image build args match the declared site topology", async () => {
  const { loadContract } = await import("../env/validate-env.mjs")
  const topology = siteTopologies(loadContract(contractPath))["api.blog.aquilaxk.site"]
  const dockerfile = readFileSync(path.join(repoRoot, "front/Dockerfile.runtime"), "utf8")

  const argDefaults = new Map(
    [...dockerfile.matchAll(/^ARG (NEXT_PUBLIC_[A-Z0-9_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]),
  )

  // NEXT_PUBLIC_*는 빌드 시점에 번들에 인라인된다. 표와 갈라지면 backend/cookie는 한쪽,
  // front 번들은 다른 쪽을 가리켜 브라우저가 존재하지 않는 호스트로 XHR한다.
  assert.equal(argDefaults.get("NEXT_PUBLIC_SITE_URL"), `https://${topology.frontHost}`)
  assert.equal(argDefaults.get("NEXT_PUBLIC_BACKEND_URL"), `https://${topology.backHost}`)
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
    .replace("CUSTOM_PROD_BACKURL=https://api.blog.aquilaxk.site", "CUSTOM_PROD_BACKURL=https://wrong.blog.aquilaxk.site")

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
  assert.match(workflow, /HOME_AI_SUMMARY_ENABLED: \$\{\{ secrets\.CUSTOM__AI__SUMMARY__ENABLED \|\| vars\.CUSTOM__AI__SUMMARY__ENABLED \|\| 'false' \}\}/)
  assert.match(workflow, /printf 'CUSTOM__AI__SUMMARY__ENABLED=%s\\n' "\$\{HOME_AI_SUMMARY_ENABLED:-false\}"/)
  assert.match(workflow, /upsert_env_key "CUSTOM__AI__SUMMARY__ENABLED" "\$\{HOME_AI_SUMMARY_ENABLED:-\}" "deploy\/homeserver\/\.env\.prod"/)
  assert.match(workflow, /require_privacy_freeze_value "CUSTOM__AI__SUMMARY__ENABLED" "\$\{HOME_AI_SUMMARY_ENABLED:-false\}" "false"/)
  assert.doesNotMatch(workflow, /HOME_NEXT_PUBLIC_/)
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_SIGNUP_ENABLED/)
  assert.doesNotMatch(workflow, /NEXT_PUBLIC_RUM_SAMPLE_RATE/)
  assert(workflow.indexOf("Validate HOME_SERVER_ENV contract") < workflow.indexOf("Deploy over SSH"))
  assert(
    workflow.indexOf('upsert_env_key "CUSTOM__AI__SUMMARY__ENABLED"') <
      workflow.indexOf('require_privacy_freeze_value "CUSTOM__AI__SUMMARY__ENABLED"'),
  )
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

test("deploy workflow derives the pinned prod site scope from API_DOMAIN instead of hard-coding it", () => {
  const workflow = readFileSync(workflowPath, "utf8")

  // 하드 핀 문자열이 남아 있으면 API_DOMAIN secret과 갈라진다.
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_COOKIEDOMAIN" "aquilaxk\.site"/)
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_FRONTURL" "https:\/\/www\.aquilaxk\.site"/)
  assert.doesNotMatch(workflow, /upsert_env_key "CUSTOM_PROD_BACKURL" "https:\/\/api\.aquilaxk\.site"/)

  // 전환 스위치는 HOME_SERVER_ENV의 API_DOMAIN 하나뿐이다.
  assert.match(workflow, /PROD_SITE_API_DOMAIN=/)

  // 알려지지 않은 API_DOMAIN은 fail-closed다.
  assert.match(workflow, /unsupported API_DOMAIN for the prod site contract/)

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

test("Vercel frontend project skips builds when frontend inputs did not change", () => {
  const config = JSON.parse(readFileSync(vercelConfigPath, "utf8"))

  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json")
  assert.equal(config.ignoreCommand, "node scripts/vercel/should-ignore-build.mjs")
})

test("deploy workflow는 path-aware stale gate로 backend 영향 후속 변경만 차단한다", () => {
  const workflow = readFileSync(workflowPath, "utf8")
  const ciWorkflow = readFileSync(ciWorkflowPath, "utf8")

  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
  assert.match(workflow, /DEPLOY_SHA_INPUT: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/)
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
  assert.match(workflow, /STALE_DEPLOY_BLOCK_PATHS_PATTERN=.*restore-privacy-gate/)
  assert.match(ciWorkflow, /- "restore-privacy-gate\.sh"/)
  assert.match(workflow, /grep -Eq "\$\{STALE_DEPLOY_BLOCK_PATHS_PATTERN\}"/)
  assert.doesNotMatch(workflow, /git fetch --depth=1 origin main/)
  assert.doesNotMatch(workflow, /git rev-parse origin\/main/)
  assert.match(workflow, /stale workflow_run blocked by backend-impacting newer main changes: deploy_sha=/)
  assert.match(workflow, /stale workflow_run allowed after backend-neutral newer main changes: deploy_sha=/)
  assert.doesNotMatch(workflow, /stale workflow_run payload: deploy_sha=/)
  assert.doesNotMatch(workflow, /STALE_WORKFLOW_RUN/)
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
  assert.match(workflow, /printf '%s\\n' "\$\{PRE_DEPLOY_ENV_CONTENT\}" > deploy\/homeserver\/\.env\.prod/)
  assert(workflow.indexOf("PRE_DEPLOY_ENV_CONTENT=\"$(cat deploy/homeserver/.env.prod)\"") < workflow.indexOf("printf '%s\\n' \"${HOME_SERVER_ENV}\" > deploy/homeserver/.env.prod"))
  assert(workflow.indexOf("printf '%s\\n' \"${PRE_DEPLOY_ENV_CONTENT}\" > deploy/homeserver/.env.prod") < workflow.indexOf("./deploy/homeserver/rollback_last_deploy.sh"))
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
  const preCandidateCloudflaredCheckIndex = deployScript.indexOf('check_cloudflared_runtime "${api_domain}"', edgeBootIndex)
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
  const rollbackStateWriteIndex = rollbackBlock.indexOf('echo "${rollback_backend}" > "${STATE_FILE}"')
  const burnInRollbackRouteIndex = burnInRollbackBlock.indexOf('switch_caddy_upstream "${previous_backend}"')
  const burnInRollbackRestoreIndex = burnInRollbackBlock.indexOf('restore_runtime_split_helper_backends_to_active "${previous_backend}" "${candidate_backend}"')
  const burnInRollbackHelperFailIndex = burnInRollbackBlock.indexOf(
    "burn-in rollback failed: helper recovery failed after route rollback",
  )
  const burnInRollbackStateWriteIndex = burnInRollbackBlock.indexOf('echo "${previous_backend}" > "${STATE_FILE}"')

  assert.match(backendHttpHostBlock, /back_blue\|back_green\|back_read\|back_admin\|back_worker/)
  assert.match(backendDnsBlock, /host="\$\(backend_http_host "\$\{backend\}"\)"/)
  assert.match(prepareImagesBlock, /for service in back_read back_admin back_worker; do/)
  assert.match(prepareImagesBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{active_image\}"/)
  assert.match(activeHelperStartBlock, /compose_up_force_recreate_with_retry "\$\{helper_services\[@\]\}"/)
  assert.match(activeHelperStartBlock, /if ! check_backend_health "\$\{service\}"; then/)
  assert.match(helperRestartBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{candidate_image\}"/)
  assert.match(helperRestartBlock, /if ! check_backend_health "\$\{service\}"; then/)
  assert.match(helperRestartBlock, /restore_runtime_split_helper_backends_to_active\(\)/)
  assert.match(helperRestartBlock, /upsert_runtime_backend_image "\$\{service\}" "\$\{active_image\}"/)
  assert.match(helperRestartBlock, /write_backend_release_state "\$\{active_backend\}" "\$\{failed_candidate\}"/)
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
  assert.match(deployScript, /compose stop "\$\{next_backend\}" \|\| true/)

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
  // .active_backend는 배포 산출물이 아니라 지금 트래픽을 받는 색이므로 워크트리에서 온다.
  assert.match(backupScript, /if \[\[ -f "\$\{STATE_FILE\}" \]\]; then\s*\n\s*cp "\$\{STATE_FILE\}" "\$\{BACKUP_DIR\}\/\.active_backend"/)
  assert.doesNotMatch(backupScript, /for file in docker-compose\.prod\.yml \.active_backend; do/)

  // rollback은 어느 커밋으로 되돌리는지 로그로 밝힌다.
  assert.match(rollbackScript, /log_backup_restore_provenance\(\) \{/)
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
    writeFileSync(path.join(stubDir, "docker"), "#!/bin/sh\nexit 0\n", { mode: 0o755 })

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
  assert.doesNotMatch(webBlock, /aquilaxk\.site/)
  assert.match(webBlock, /reverse_proxy \{\$WEB_UPSTREAM:front_blue\}:3000 \{/)
  assert.match(webBlock, /import trusted_edge_client_ip/)
  assert.match(webBlock, /^\s*request_header -X-Forwarded-For\s*$/m)
  assert.match(webBlock, /^\s*request_header -CF-Connecting-IP\s*$/m)
  assert.match(webBlock, /^\s*request_header -True-Client-IP\s*$/m)
  assert.match(webBlock, /^\s*request_header -X-Real-IP\s*$/m)
  // /_next/static/*는 콘텐츠 해시 자산이다. `?` 접두사로 Next가 이미 보낸 값을 덮어쓰지 않는다.
  assert.match(webBlock, /@nextImmutable path \/_next\/static\/\*/)
  assert.match(webBlock, /\?Cache-Control "public, max-age=31536000, immutable"/)
  // next.config.js가 내보내는 보안 헤더 7종을 edge가 벗기거나 약화시키면 안 된다.
  assert.doesNotMatch(webBlock, /header_down -/)
  assert.doesNotMatch(webBlock, /Content-Security-Policy/)
  // www 폐기는 redirect 없이 한다 (Epic #1535 Locked Decision 6).
  assert.doesNotMatch(caddyfile, /^\s*redir\b/m)
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
  assert.deepEqual(webDomain.requiredWhen, { key: "API_DOMAIN", equals: "api.blog.aquilaxk.site" })
  // 두 값이 같으면 Caddy site address가 중복돼 caddy가 기동하지 못하고 edge 전체가 내려간다.
  assert.equal(webDomain.mustDifferFrom, "API_DOMAIN")
})

// 주석에만 키 이름이 있어도 통과하던 검사를 실제 산출물 검사로 바꾼다. materialize를 돌려
// 어떤 키가 어느 서비스 env로 갔는지 본다.
test("materialize_service_env.sh는 키를 서비스별 env 파일로 실제 분배한다", () => {
  const workDir = mkdtempSync(path.join(tmpdir(), "materialize-front-"))
  try {
    const scriptDir = path.join(repoRoot, "deploy/homeserver")
    const sourceEnv = path.join(workDir, "source.env")
    writeFileSync(
      sourceEnv,
      [
        "API_DOMAIN=api.blog.example.com",
        "WEB_DOMAIN=blog.example.com",
        "WEB_UPSTREAM=front_green",
        "MONITOR_DOMAIN=",
        "BACKEND_INTERNAL_URL=http://back-blue:8080",
        "CUSTOM__REVALIDATE__TOKEN=revalidate_secret_value",
        "BACKEND_PROXY_MAX_BODY_BYTES=1048576",
        "CUSTOM_PROD_DBNAME=blog_prod",
        "",
      ].join("\n"),
    )

    const outputs = {
      caddy: path.join(scriptDir, ".env.caddy.prod"),
      back: path.join(scriptDir, ".env.back.prod"),
      front: path.join(scriptDir, ".env.front.prod"),
    }
    const preexisting = Object.fromEntries(
      Object.entries(outputs).map(([name, file]) => [name, existsSync(file) ? readFileSync(file, "utf8") : null]),
    )

    try {
      execFileSync("bash", [path.join(scriptDir, "materialize_service_env.sh"), sourceEnv], { stdio: "pipe" })
      const caddyEnv = readFileSync(outputs.caddy, "utf8")
      const backEnv = readFileSync(outputs.back, "utf8")
      const frontEnv = readFileSync(outputs.front, "utf8")

      assert.match(caddyEnv, /^WEB_DOMAIN=blog\.example\.com$/m)
      assert.match(caddyEnv, /^WEB_UPSTREAM=front_green$/m)
      // 값이 빈 키는 caddy env로 내보내지 않는다. Caddy의 `{$VAR:default}`는 변수가 **unset**일
      // 때만 기본값을 쓰고, 존재하되 비어 있으면 빈 문자열을 그대로 쓴다. 그러면 site address가
      // `http://`가 되어 host matcher 없는 :80 catch-all 라우트가 되고, 다른 vhost가 잡지 않는
      // 모든 호스트를 그 vhost가 삼킨다 (caddy adapt로 실측). 줄을 지우지 않고 비우는 실수가
      // edge 라우팅을 통째로 바꾸는 경로라 여기서 끊는다.
      assert.doesNotMatch(caddyEnv, /^MONITOR_DOMAIN=$/m)
      // front 런타임 키가 빠지면 컨테이너는 healthy를 보고하면서 모든 SSR 경로가 500이 된다.
      assert.match(frontEnv, /^BACKEND_INTERNAL_URL=http:\/\/back-blue:8080$/m)
      // front의 TOKEN_FOR_REVALIDATE와 backend의 CUSTOM__REVALIDATE__TOKEN은 같은 공유 비밀이다.
      // 별도 키로 두면 어긋나도 아무도 실패하지 않고 revalidate만 401이 된다.
      assert.match(frontEnv, /^TOKEN_FOR_REVALIDATE=revalidate_secret_value$/m)
      assert.doesNotMatch(frontEnv, /^CUSTOM__REVALIDATE__TOKEN=/m)
      // BACKEND_PROXY_*는 front 전용이다 (`git grep BACKEND_PROXY -- back/`는 0건).
      assert.match(frontEnv, /^BACKEND_PROXY_MAX_BODY_BYTES=1048576$/m)
      assert.doesNotMatch(backEnv, /^BACKEND_PROXY_/m)
      // 서비스별 env는 서로의 비밀을 담지 않는다 (blast radius / HR-56).
      assert.doesNotMatch(frontEnv, /^CUSTOM_PROD_DBNAME=/m)
      assert.doesNotMatch(caddyEnv, /^BACKEND_INTERNAL_URL=/m)
    } finally {
      for (const [name, file] of Object.entries(outputs)) {
        if (preexisting[name] === null) rmSync(file, { force: true })
        else writeFileSync(file, preexisting[name])
      }
    }
  } finally {
    rmSync(workDir, { force: true, recursive: true })
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
  for (const [name, script] of [["blue_green_deploy.sh", deployScript], ["rollback_last_deploy.sh", rollbackScript]]) {
    const envValueBody = script.slice(script.indexOf("env_value() {"), script.indexOf("trim_quotes() {"))
    assert.notEqual(envValueBody, "", `${name} must define env_value before trim_quotes`)
    assert.match(envValueBody, /gsub\(\/\\r\/, "", value\)/, `${name} env_value must strip CR`)
  }
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
  const relevant = result.errors.filter((error) => !error.message.includes("is required"))

  assert.deepEqual(
    relevant.map((error) => `${error.key}: ${error.message}`),
    [],
    ".env.prod.example must stay internally consistent with the env contract",
  )
})
