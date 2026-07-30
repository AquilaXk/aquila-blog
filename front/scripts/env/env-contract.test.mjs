import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const frontRoot = path.resolve(import.meta.dirname, "../..")
const repoRoot = path.resolve(frontRoot, "..")
const contractPath = path.join(frontRoot, "config/env.contract.json")
const validatorPath = path.join(frontRoot, "scripts/env/validate-env.mjs")

const productionEnv = [
  "NEXT_PUBLIC_BACKEND_URL=https://api.example.test",
  "BACKEND_INTERNAL_URL=https://api.example.test",
  "NEXT_PUBLIC_SITE_URL=https://www.example.test",
  "TOKEN_FOR_REVALIDATE=web-revalidate-token",
  "BACKEND_PROXY_MAX_BODY_BYTES=104857600",
  "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=268435456",
  "NEXT_PUBLIC_SIGNUP_ENABLED=false",
  "NEXT_PUBLIC_RUM_SAMPLE_RATE=0",
].join("\n")

test("production rejects missing secret, non-HTTPS URLs, and non-positive proxy limits", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)
  assert.equal(validateEnvText({ contract, target: "production", text: productionEnv }).ok, true)
  const result = validateEnvText({
    contract,
    target: "production",
    text: productionEnv
      .replace("TOKEN_FOR_REVALIDATE=web-revalidate-token\n", "")
      .replace("NEXT_PUBLIC_BACKEND_URL=https://api.example.test", "NEXT_PUBLIC_BACKEND_URL=http://api.example.test")
      .replace("BACKEND_PROXY_MAX_BODY_BYTES=104857600", "BACKEND_PROXY_MAX_BODY_BYTES=0")
      .replace("NEXT_PUBLIC_SIGNUP_ENABLED=false", "NEXT_PUBLIC_SIGNUP_ENABLED=true")
      .replace("NEXT_PUBLIC_RUM_SAMPLE_RATE=0", "NEXT_PUBLIC_RUM_SAMPLE_RATE=1"),
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "TOKEN_FOR_REVALIDATE" && error.message === "is required"))
  assert(result.errors.some((error) => error.key === "NEXT_PUBLIC_BACKEND_URL" && error.message.includes("https")))
  assert(result.errors.some((error) => error.key === "BACKEND_PROXY_MAX_BODY_BYTES" && error.message.includes("positive decimal")))
  assert(result.errors.some((error) => error.key === "NEXT_PUBLIC_SIGNUP_ENABLED" && error.message.includes("false")))
  assert(result.errors.some((error) => error.key === "NEXT_PUBLIC_RUM_SAMPLE_RATE" && error.message.includes("0")))
})

test("production rejects short and placeholder revalidation tokens", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)

  for (const token of ["short-token", "NEED_TO_SET_REVALIDATE_TOKEN", "change_me_revalidate_token", "change-me-revalidate-token"]) {
    const result = validateEnvText({
      contract,
      target: "production",
      text: productionEnv.replace("TOKEN_FOR_REVALIDATE=web-revalidate-token", `TOKEN_FOR_REVALIDATE=${token}`),
    })
    assert.equal(result.ok, false, token)
    assert(result.errors.some((error) => error.key === "TOKEN_FOR_REVALIDATE"), token)
  }
})

test("test target allows both disabled and enabled public feature branches without production inputs", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)

  for (const text of [
    "NEXT_PUBLIC_SIGNUP_ENABLED=false\nNEXT_PUBLIC_RUM_SAMPLE_RATE=0\n",
    "NEXT_PUBLIC_SIGNUP_ENABLED=true\nNEXT_PUBLIC_RUM_SAMPLE_RATE=1\n",
  ]) {
    const result = validateEnvText({ contract, target: "test", text })
    assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  }
})

test("live-e2e requires HTTPS endpoints, a password, and exactly one identity", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)
  const valid = [
    "PLAYWRIGHT_BASE_URL=https://www.example.test",
    "E2E_API_BASE_URL=https://api.example.test",
    "E2E_LIVE_ADMIN_EMAIL=admin@example.test",
    "E2E_LIVE_ADMIN_PASSWORD=live-admin-password",
  ].join("\n")

  assert.equal(validateEnvText({ contract, target: "live-e2e", text: valid }).ok, true)
  const invalid = validateEnvText({
    contract,
    target: "live-e2e",
    text: valid
      .replace("PLAYWRIGHT_BASE_URL=https://www.example.test", "PLAYWRIGHT_BASE_URL=http://www.example.test")
      .replace("E2E_LIVE_ADMIN_PASSWORD=live-admin-password", "E2E_LIVE_ADMIN_PASSWORD=")
      .concat("\nE2E_LIVE_ADMIN_USERNAME=admin"),
  })
  assert.equal(invalid.ok, false)
  assert(invalid.errors.some((error) => error.key === "PLAYWRIGHT_BASE_URL" && error.message.includes("https")))
  assert(invalid.errors.some((error) => error.key === "E2E_LIVE_ADMIN_PASSWORD" && error.message === "is required"))
  assert(invalid.errors.some((error) => error.key === "E2E_LIVE_ADMIN_EMAIL" && error.message.includes("exactly one")))
})

test("live-e2e rejects placeholder credentials", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const result = validateEnvText({
    contract: loadContract(contractPath),
    target: "live-e2e",
    text: [
      "PLAYWRIGHT_BASE_URL=https://www.example.test",
      "E2E_API_BASE_URL=https://api.example.test",
      "E2E_LIVE_ADMIN_USERNAME=admin",
      "E2E_LIVE_ADMIN_PASSWORD=change_me_live_admin_password",
    ].join("\n"),
  })

  assert.equal(result.ok, false)
  assert(result.errors.some((error) => error.key === "E2E_LIVE_ADMIN_PASSWORD" && error.message.includes("placeholder")))
})

test("prebuild validates production only for Vercel production deployment and CI runs the Web contract suite", () => {
  const packageJson = JSON.parse(readFileSync(path.join(frontRoot, "package.json"), "utf8"))
  const frontendWorkflow = readFileSync(path.join(repoRoot, ".github/workflows/reusable-frontend-verify.yml"), "utf8")

  assert.match(packageJson.scripts.prebuild, /VERCEL:-.*1.*VERCEL_ENV:-.*production/)
  assert.match(packageJson.scripts.prebuild, /scripts\/env\/validate-env\.mjs --target production --process-env/)
  assert.match(frontendWorkflow, /node --test scripts\/env\/env-contract\.test\.mjs/)
})

test("CLI failure exposes only key and message, never secret input", () => {
  const secret = "secret-that-must-not-leak"
  const result = spawnSync(process.execPath, [validatorPath, "--target", "live-e2e", "--source-env-var", "WEB_ENV_TEST"], {
    encoding: "utf8",
    env: { ...process.env, WEB_ENV_TEST: `E2E_LIVE_ADMIN_PASSWORD=${secret}` },
  })

  assert.equal(result.status, 1)
  assert.match(result.stderr, /\{"key":"PLAYWRIGHT_BASE_URL","message":"is required"\}/)
  assert.doesNotMatch(result.stderr, new RegExp(secret))
})
