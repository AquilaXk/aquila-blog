import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const frontRoot = path.resolve(import.meta.dirname, "../..")
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

const productionBuildEnv = [
  "NEXT_PUBLIC_BACKEND_URL=https://api.example.test",
  "BACKEND_INTERNAL_URL=https://api.example.test",
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

test("Vercel production build accepts runtime defaults while strict production remains fail-closed", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)

  const buildResult = validateEnvText({ contract, target: "production-build", text: productionBuildEnv })
  assert.equal(buildResult.ok, true, buildResult.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))

  const strictResult = validateEnvText({ contract, target: "production", text: productionBuildEnv })
  assert.equal(strictResult.ok, false)
  assert(strictResult.errors.some((error) => error.key === "TOKEN_FOR_REVALIDATE" && error.message === "is required"))
})

test("Vercel production build validates optional values when they are supplied", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)
  const result = validateEnvText({
    contract,
    target: "production-build",
    text: [
      productionBuildEnv,
      "NEXT_PUBLIC_SITE_URL=http://www.example.test",
      "TOKEN_FOR_REVALIDATE=short-token",
      "BACKEND_PROXY_MAX_BODY_BYTES=0",
      "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES=0",
      "NEXT_PUBLIC_SIGNUP_ENABLED=true",
      "NEXT_PUBLIC_RUM_SAMPLE_RATE=1",
    ].join("\n"),
  })

  assert.equal(result.ok, false)
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "TOKEN_FOR_REVALIDATE",
    "BACKEND_PROXY_MAX_BODY_BYTES",
    "BACKEND_PROXY_MAX_IN_FLIGHT_BODY_BYTES",
    "NEXT_PUBLIC_SIGNUP_ENABLED",
    "NEXT_PUBLIC_RUM_SAMPLE_RATE",
  ]) {
    assert(result.errors.some((error) => error.key === key), key)
  }
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

test("live-ready requires only HTTPS Web and API targets", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)
  const valid = [
    "PLAYWRIGHT_BASE_URL=https://aquila-blog-web.vercel.app",
    "E2E_API_BASE_URL=https://api.example.test",
  ].join("\n")

  assert.equal(validateEnvText({ contract, target: "live-ready", text: valid }).ok, true)
  for (const text of [
    valid.replace("E2E_API_BASE_URL=https://api.example.test", ""),
    valid.replace("E2E_API_BASE_URL=https://api.example.test", "E2E_API_BASE_URL=http://api.example.test"),
  ]) {
    assert.equal(validateEnvText({ contract, target: "live-ready", text }).ok, false)
  }
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

test("prebuild validates both the container build and the Vercel build, and Web CI runs the contract suite", () => {
  const packageJson = JSON.parse(readFileSync(path.join(frontRoot, "package.json"), "utf8"))
  const webWorkflow = readFileSync(path.join(frontRoot, ".github/workflows/ci.yml"), "utf8")

  // 컨테이너 경로: VERCEL/VERCEL_ENV가 없는 빌드에서도 검증이 돌아야 한다.
  assert.match(packageJson.scripts.prebuild, /AQUILA_PROD_BUILD:-.*1/)
  assert.match(packageJson.scripts.prebuild, /--target container-build --process-env/)
  // Vercel 경로: 아직 라이브 호스트라 이 분기를 지우면 검증이 양쪽 모두에서 사라진다.
  assert.match(packageJson.scripts.prebuild, /VERCEL:-.*1.*VERCEL_ENV:-.*production/)
  assert.match(packageJson.scripts.prebuild, /--target production-build --process-env/)
  assert.doesNotMatch(packageJson.scripts.prebuild, /--target production --process-env/)
  assert.match(webWorkflow, /node --test scripts\/env\/env-contract\.test\.mjs/)
})

test("container build marker and NEXT_PUBLIC build args are wired in the runtime Dockerfile", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const dockerfile = readFileSync(path.join(frontRoot, "Dockerfile.runtime"), "utf8")

  // 마커가 없으면 prebuild 검증이 컨테이너 빌드에서 통째로 skip된다.
  assert.match(dockerfile, /^ENV AQUILA_PROD_BUILD=1$/m)

  const argDefaults = new Map(
    [...dockerfile.matchAll(/^ARG (NEXT_PUBLIC_[A-Z0-9_]+)="([^"]*)"$/gm)].map((match) => [match[1], match[2]]),
  )
  const contract = loadContract(contractPath)
  const containerBuildKeys = contract.targets["container-build"].keys.map((key) => key.name)

  // NEXT_PUBLIC_AQUILA_BUILD_SHA는 값이 아니라 출처를 나르는 관측용 인자다. 워크플로만 아는
  // 값이라 로컬 docker build에서는 빈 채로 두어야 하므로 container-build 계약에 넣지 않는다.
  const observabilityArgs = new Set(["NEXT_PUBLIC_AQUILA_BUILD_SHA"])
  assert.equal(argDefaults.has("NEXT_PUBLIC_AQUILA_BUILD_SHA"), true, "build SHA arg가 선언돼 있어야 한다")

  // 나머지 build-arg 표면과 container-build 계약이 갈라지면 게이트가 공허해진다.
  const configArgs = [...argDefaults.keys()].filter((key) => !observabilityArgs.has(key))
  assert.deepEqual(configArgs.sort(), [...containerBuildKeys].sort())

  // 기본값이 비어 있으면 isProd가 false로 굳고 canonical/OG URL이 틀린 이미지가 조용히 나간다.
  const result = validateEnvText({
    contract,
    target: "container-build",
    text: configArgs.map((key) => `${key}=${argDefaults.get(key)}`).join("\n"),
  })
  assert.equal(result.ok, true, result.errors.map((error) => `${error.key}: ${error.message}`).join("\n"))
  assert.equal(argDefaults.get("NEXT_PUBLIC_SITE_URL"), "https://blog.aquilaxk.site")
  // #1575: 공개 API가 web 호스트의 경로다. 두 값이 갈라지면 브라우저 요청이 다시 cross-origin이
  // 되고, edge에는 그 origin을 허용하는 CORS가 더 이상 없다. 목표 호스트만 보면 SITE_URL이
  // 따로 움직여도 통과하므로 두 값의 동일성을 함께 고정한다.
  assert.equal(argDefaults.get("NEXT_PUBLIC_BACKEND_URL"), argDefaults.get("NEXT_PUBLIC_SITE_URL"))
  assert.equal(argDefaults.get("NEXT_PUBLIC_BACKEND_URL"), "https://blog.aquilaxk.site")
})

test("container-build fails closed when a NEXT_PUBLIC build arg is missing or empty", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)
  const complete = [
    "NEXT_PUBLIC_BACKEND_URL=https://api.blog.aquilaxk.site",
    "NEXT_PUBLIC_SITE_URL=https://blog.aquilaxk.site",
    "NEXT_PUBLIC_SIGNUP_ENABLED=false",
    "NEXT_PUBLIC_RUM_SAMPLE_RATE=0",
  ]

  assert.equal(validateEnvText({ contract, target: "container-build", text: complete.join("\n") }).ok, true)

  for (const index of complete.keys()) {
    const key = complete[index].split("=")[0]
    const emptied = complete.map((line, position) => (position === index ? `${key}=` : line))
    const result = validateEnvText({ contract, target: "container-build", text: emptied.join("\n") })
    assert.equal(result.ok, false, `${key} must be required for a container build`)
    assert(result.errors.some((error) => error.key === key && error.message === "is required"))
  }
})

test("BACKEND_INTERNAL_URL accepts container-internal http but still rejects plaintext public hosts", async () => {
  const { loadContract, validateEnvText } = await import("./validate-env.mjs")
  const contract = loadContract(contractPath)

  for (const internalUrl of ["http://back_blue:8080", "http://127.0.0.1:1", "http://localhost:3000", "https://api.blog.aquilaxk.site"]) {
    const result = validateEnvText({
      contract,
      target: "production",
      text: productionEnv.replace("BACKEND_INTERNAL_URL=https://api.example.test", `BACKEND_INTERNAL_URL=${internalUrl}`),
    })
    assert.equal(result.ok, true, `${internalUrl}: ${result.errors.map((error) => `${error.key}: ${error.message}`).join("\n")}`)
  }

  for (const rejected of ["http://api.blog.aquilaxk.site", "http://api.example.test", "ftp://back_blue", "back_blue:8080"]) {
    const result = validateEnvText({
      contract,
      target: "production",
      text: productionEnv.replace("BACKEND_INTERNAL_URL=https://api.example.test", `BACKEND_INTERNAL_URL=${rejected}`),
    })
    assert.equal(result.ok, false, `${rejected} must not pass BACKEND_INTERNAL_URL validation`)
    assert(result.errors.some((error) => error.key === "BACKEND_INTERNAL_URL"))
  }
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
