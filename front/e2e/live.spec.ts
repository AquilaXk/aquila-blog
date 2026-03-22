import { expect, test, type Page } from "@playwright/test"

const adminIdentifier = process.env.E2E_ADMIN_EMAIL?.trim() || ""
const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
const hasLiveCredentials = Boolean(adminIdentifier && adminPassword)
const explicitApiBaseUrl = process.env.E2E_API_BASE_URL?.trim() || ""
const liveApiProbeAttempts = Number.parseInt(process.env.E2E_LIVE_API_PROBE_ATTEMPTS || "4", 10)
const liveLoginAttempts = Number.parseInt(process.env.E2E_LIVE_LOGIN_ATTEMPTS || "3", 10)
const liveLoginTimeoutMs = Number.parseInt(process.env.E2E_LIVE_LOGIN_TIMEOUT_MS || "30000", 10)
const liveRetryBaseDelayMs = Number.parseInt(process.env.E2E_LIVE_RETRY_BASE_DELAY_MS || "2000", 10)
const liveUiRedirectTimeoutMs = Number.parseInt(process.env.E2E_LIVE_UI_REDIRECT_TIMEOUT_MS || "20000", 10)

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, "")
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const resolveApiBaseUrl = (currentUrl: string) => {
  if (explicitApiBaseUrl) return stripTrailingSlash(explicitApiBaseUrl)

  const parsed = new URL(currentUrl)

  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    const localApiPort = process.env.E2E_LOCAL_API_PORT?.trim() || "8080"
    return `${parsed.protocol}//${parsed.hostname}:${localApiPort}`
  }

  if (parsed.hostname.startsWith("www.")) {
    parsed.hostname = `api.${parsed.hostname.slice(4)}`
    return `${parsed.protocol}//${parsed.host}`
  }

  parsed.hostname = `api.${parsed.hostname}`
  return `${parsed.protocol}//${parsed.host}`
}

const isRetriableNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /(timeout|econnreset|enotfound|etimedout|econnrefused)/i.test(message)
}

const isWebKitCorsAccessControlNoise = (message: string) =>
  /due to access control checks\./i.test(message) && /\/api\.[\w.-]+\//i.test(message)

const isRetriableLoginStatus = (status: number) => [502, 503, 504, 520, 522, 524, 530].includes(status)

const hasAuthCookie = async (page: Page) => {
  const cookies = await page.context().cookies()
  return cookies.some((cookie) => cookie.name === "apiKey" || cookie.name === "accessToken")
}

const waitForApiReachability = async (page: Page, apiBaseUrl: string) => {
  const probePaths = ["/actuator/health", "/member/api/v1/auth/me"]
  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveApiProbeAttempts; attempt += 1) {
    for (const path of probePaths) {
      try {
        const response = await page.request.get(`${apiBaseUrl}${path}`, { timeout: 15_000 })
        if (response.status() > 0) return
        lastFailure = `status=${response.status()} path=${path}`
      } catch (error) {
        lastFailure = error instanceof Error ? error.message : String(error)
      }
    }

    if (attempt < liveApiProbeAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
    }
  }

  throw new Error(
    `API reachability probe failed. base=${apiBaseUrl} attempts=${liveApiProbeAttempts} last=${lastFailure}`
  )
}

const loginWithRetry = async (
  page: Page,
  apiBaseUrl: string,
  loginId: string,
  password: string
) => {
  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    try {
      const response = await page.request.post(`${apiBaseUrl}/member/api/v1/auth/login`, {
        data: { email: loginId, password },
        timeout: liveLoginTimeoutMs,
      })

      if (response.ok()) return response

      const body = (await response.text().catch(() => "")).slice(0, 300)
      const retriableStatus = [502, 503, 504, 520, 522, 524, 530].includes(response.status())
      lastFailure = `status=${response.status()} body=${body}`
      if (retriableStatus && attempt < liveLoginAttempts) {
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }
      throw new Error(`Login API failed. ${lastFailure}`)
    } catch (error) {
      if (isRetriableNetworkError(error) && attempt < liveLoginAttempts) {
        lastFailure = error instanceof Error ? error.message : String(error)
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }
      throw error
    }
  }

  throw new Error(`Login API failed after retries. base=${apiBaseUrl} last=${lastFailure}`)
}

const loginThroughUi = async (page: Page, loginId: string, password: string) => {
  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    await page.goto("/login?next=%2Fadmin")
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
    await page.getByLabel("이메일").fill(loginId)
    await page.locator("#password").fill(password)

    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/member/api/v1/auth/login"),
      { timeout: liveLoginTimeoutMs }
    )

    await page.getByRole("button", { name: "로그인", exact: true }).click()
    const loginResponse = await loginResponsePromise
    const status = loginResponse.status()

    if (!loginResponse.ok()) {
      const bodyPreview = (await loginResponse.text().catch(() => "")).slice(0, 240)
      lastFailure = `status=${status} body=${bodyPreview}`
      if (isRetriableLoginStatus(status) && attempt < liveLoginAttempts) {
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }
      throw new Error(`UI login request failed. ${lastFailure}`)
    }

    const currentUrl = page.url()
    if (/\/admin(\/|$)/.test(currentUrl)) return

    // 성공 쿠키가 있는데 리다이렉트가 지연되는 경우 /admin 재진입으로 판정한다.
    if (await hasAuthCookie(page)) {
      await page.goto("/admin")
      await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: liveUiRedirectTimeoutMs })
      return
    }

    const loginError = page
      .locator("main")
      .getByText(/로그인에 실패|이메일 또는 비밀번호|로그인 시도가 너무 많습니다|서버 오류/i)
      .first()

    if (await loginError.isVisible().catch(() => false)) {
      const errorText = (await loginError.textContent())?.trim() || "unknown error"
      lastFailure = `status=${status} error=${errorText}`
      throw new Error(`UI login did not establish session. ${lastFailure}`)
    }

    lastFailure = `status=${status} url=${currentUrl}`
    if (attempt < liveLoginAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
      continue
    }
  }

  throw new Error(`UI login failed after retries. last=${lastFailure}`)
}

test.describe("live production e2e", () => {
  test.skip(!hasLiveCredentials, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD is required")
  test.setTimeout(120_000)

  test("비로그인 사용자는 /admin 접근 시 로그인 페이지로 이동한다", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
  })

  test("관리자 UI 로그인 경로가 정상 동작한다", async ({ page }) => {
    await page.goto("/login")
    const apiBaseUrl = resolveApiBaseUrl(page.url())
    await waitForApiReachability(page, apiBaseUrl)
    await loginThroughUi(page, adminIdentifier, adminPassword)
    await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible()

    await page.getByRole("button", { name: "Logout", exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
  })

  test("관리자 로그인 후 핵심 운영 경로가 정상 동작하고 로그아웃된다", async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on("pageerror", (error) => {
      runtimeErrors.push(error.message)
    })

    await page.goto("/login?next=%2Fadmin")
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()

    const apiBaseUrl = resolveApiBaseUrl(page.url())
    await waitForApiReachability(page, apiBaseUrl)
    await loginWithRetry(page, apiBaseUrl, adminIdentifier, adminPassword)

    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible()

    await page.goto("/admin/profile")
    await expect(page.getByRole("heading", { name: "관리자 프로필 관리" })).toBeVisible()
    const profileImage = page.locator("main img").first()
    await expect(profileImage).toBeVisible()
    await expect
      .poll(async () => {
        return profileImage.evaluate((node) => {
          if (!(node instanceof HTMLImageElement)) return false
          return node.complete && node.naturalWidth > 0
        })
      })
      .toBeTruthy()

    await page.goto("/admin/tools")
    await expect(page.getByRole("heading", { name: "운영 도구" })).toBeVisible()
    await expect(page.getByText("Task Queue 진단")).toBeVisible()

    await page.goto("/admin/posts/new")
    await expect(page.getByRole("heading", { name: "글 작업실" })).toBeVisible()
    await expect(page.getByPlaceholder("제목을 입력하세요")).toBeVisible()
    const contentEditor = page.getByPlaceholder("당신의 이야기를 적어보세요...")
    await contentEditor.fill("```mermaid\ngraph TD\n  A[요청] --> B[완료]\n```")
    await expect
      .poll(async () => await page.locator(".aq-mermaid-stage svg").count(), { timeout: 20_000 })
      .toBeGreaterThan(0)

    await page.getByRole("button", { name: "Logout", exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()

    const ignorablePatterns = [
      /ResizeObserver loop/i,
      /ChunkLoadError:\s*Loading chunk .* failed/i,
      /Loading (?:CSS )?chunk .* failed/i,
      /_next\/static\/chunks\/.*\.js/i,
      /Failed to fetch dynamically imported module/i,
    ]
    const criticalErrors = runtimeErrors.filter(
      (message) =>
        !isWebKitCorsAccessControlNoise(message) &&
        !ignorablePatterns.some((pattern) => pattern.test(message))
    )
    expect(criticalErrors).toEqual([])
  })
})
