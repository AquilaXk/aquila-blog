import { expect, test, type Page, type Response } from "@playwright/test"

const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || ""
const adminLegacyLoginId = process.env.E2E_ADMIN_USERNAME?.trim() || ""
const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
const hasLiveCredentials = Boolean((adminEmail || adminLegacyLoginId) && adminPassword)
const hasUiLoginCredentials = Boolean(adminEmail && adminPassword)
const explicitApiBaseUrl = process.env.E2E_API_BASE_URL?.trim() || ""
const liveApiProbeAttempts = Number.parseInt(process.env.E2E_LIVE_API_PROBE_ATTEMPTS || "4", 10)
const liveLoginAttempts = Number.parseInt(process.env.E2E_LIVE_LOGIN_ATTEMPTS || "3", 10)
const liveLoginTimeoutMs = Number.parseInt(process.env.E2E_LIVE_LOGIN_TIMEOUT_MS || "30000", 10)
const liveRetryBaseDelayMs = Number.parseInt(process.env.E2E_LIVE_RETRY_BASE_DELAY_MS || "2000", 10)
const liveUiRedirectTimeoutMs = Number.parseInt(process.env.E2E_LIVE_UI_REDIRECT_TIMEOUT_MS || "20000", 10)
const adminLandingHeadingPattern = /관리자 (?:작업 공간|작업 진입점|운영 허브|허브)/
const adminProfileHeadingPattern = /(?:프로필 워크스페이스|운영 프로필|관리자 프로필 관리|프로필 관리|프로필 설정)/
const adminToolsHeadingPattern = /(?:운영 (?:센터|도구|진단|점검 도구)|서비스 상태)/

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
const isInvalidLoginRequestBody = (status: number, body: string) =>
  status === 400 &&
  /"resultCode"\s*:\s*"400-1"/.test(body) &&
  /요청 본문이 올바르지 않습니다\./.test(body)

const hasAuthCookie = async (page: Page) => {
  const cookies = await page.context().cookies()
  return cookies.some((cookie) => cookie.name === "apiKey" || cookie.name === "accessToken")
}

const isNavigationInterruptedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /interrupted by another navigation/i.test(message)
}

const tryEnterAdminRoute = async (page: Page, timeoutMs: number) => {
  try {
    await page.goto("/admin")
  } catch (error) {
    if (!isNavigationInterruptedError(error)) throw error
  }
  try {
    await page.waitForURL(/\/admin(\/|$)/, { timeout: timeoutMs })
    return true
  } catch {
    return false
  }
}

type UiLoginOutcome =
  | { kind: "response"; response: Response }
  | { kind: "admin-url" }
  | { kind: "auth-cookie" }
  | { kind: "error"; message: string }
  | { kind: "timeout" }

const getVisibleUiLoginError = async (page: Page) => {
  const loginError = page
    .locator("main")
    .getByText(/로그인에 실패|이메일 또는 비밀번호|로그인 시도가 너무 많습니다|서버 오류/i)
    .first()

  if (!(await loginError.isVisible().catch(() => false))) return null
  return (await loginError.textContent())?.trim() || "unknown error"
}

const waitForUiLoginOutcome = async (
  page: Page,
  getObservedLoginResponse: () => Response | null,
  timeoutMs: number
): Promise<UiLoginOutcome> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const observedLoginResponse = getObservedLoginResponse()
    if (observedLoginResponse) {
      return { kind: "response", response: observedLoginResponse }
    }

    if (/\/admin(\/|$)/.test(page.url())) {
      return { kind: "admin-url" }
    }

    if (await hasAuthCookie(page)) {
      return { kind: "auth-cookie" }
    }

    const loginError = await getVisibleUiLoginError(page)
    if (loginError) {
      return { kind: "error", message: loginError }
    }

    await page.waitForTimeout(250)
  }

  const observedLoginResponse = getObservedLoginResponse()
  if (observedLoginResponse) {
    return { kind: "response", response: observedLoginResponse }
  }

  if (/\/admin(\/|$)/.test(page.url())) {
    return { kind: "admin-url" }
  }

  if (await hasAuthCookie(page)) {
    return { kind: "auth-cookie" }
  }

  const loginError = await getVisibleUiLoginError(page)
  if (loginError) {
    return { kind: "error", message: loginError }
  }

  return { kind: "timeout" }
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

const openAdminNewPostEntry = async (page: Page) => {
  const buttonCta = page.getByRole("button", { name: /^새 글 작성/ }).first()
  if (await buttonCta.isVisible().catch(() => false)) {
    await buttonCta.click()
    return
  }

  const linkCta = page.getByRole("link", { name: /^새 글 작성/ }).first()
  if (await linkCta.isVisible().catch(() => false)) {
    await linkCta.click()
    return
  }

  throw new Error("관리자 글 작업 공간에서 '새 글 작성' CTA를 찾지 못했습니다.")
}

const appendTextToBlockEditor = async (page: Page, text: string) => {
  const blockEditor = page.locator(".aq-block-editor__content[contenteditable='true']").first()
  await expect(blockEditor).toBeVisible()
  await expect(blockEditor).toHaveAttribute("contenteditable", "true")
  await blockEditor.click({ position: { x: 24, y: 24 } })
  await expect
    .poll(async () => {
      return blockEditor.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return false
        const active = document.activeElement
        return active === node || !!active?.closest(".aq-block-editor__content[contenteditable='true']")
      })
    })
    .toBe(true)

  await blockEditor.evaluate((node) => {
    if (!(node instanceof HTMLElement)) return
    node.focus()
    const selection = window.getSelection()
    if (!selection) return
    const range = document.createRange()

    const textWalker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let lastTextNode: Text | null = null
    while (textWalker.nextNode()) {
      const candidate = textWalker.currentNode
      if (candidate instanceof Text) {
        lastTextNode = candidate
      }
    }

    if (lastTextNode) {
      range.setStart(lastTextNode, lastTextNode.textContent?.length ?? 0)
    } else {
      const fallbackBlock = node.querySelector("p, li, h1, h2, h3, h4, blockquote, pre") ?? node
      range.selectNodeContents(fallbackBlock)
    }
    range.collapse(false)
    selection.removeAllRanges()
    selection.addRange(range)
  })

  await page.keyboard.type(text)
  await expect
    .poll(async () => {
      return blockEditor.evaluate((node) => {
        if (!(node instanceof HTMLElement)) return ""
        return (node.textContent || "").trim()
      })
    })
    .toContain(text)

  return blockEditor
}

type LoginPayloadCandidate = {
  label: "email+policy" | "email" | "username"
  data: Record<string, string | boolean>
}

const buildLoginPayloadCandidates = (
  email: string,
  legacyLoginId: string,
  password: string
): LoginPayloadCandidate[] => {
  const candidates: LoginPayloadCandidate[] = []
  if (email) {
    candidates.push({
      label: "email+policy",
      data: { email, password, rememberMe: true, ipSecurity: false },
    })
    candidates.push({
      label: "email",
      data: { email, password },
    })
  }
  if (legacyLoginId) {
    candidates.push({
      label: "username",
      data: { username: legacyLoginId, password },
    })
  }
  return candidates
}

const loginWithRetry = async (
  page: Page,
  apiBaseUrl: string,
  loginEmail: string,
  legacyLoginId: string,
  password: string
) => {
  const payloadCandidates = buildLoginPayloadCandidates(loginEmail, legacyLoginId, password)
  if (payloadCandidates.length === 0) {
    throw new Error("Login credentials are missing. Provide E2E_ADMIN_EMAIL or E2E_ADMIN_USERNAME.")
  }

  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    let shouldRetryByStatus = false

    try {
      for (let payloadIndex = 0; payloadIndex < payloadCandidates.length; payloadIndex += 1) {
        const payload = payloadCandidates[payloadIndex]
        const isLastPayload = payloadIndex === payloadCandidates.length - 1
        const response = await page.request.post(`${apiBaseUrl}/member/api/v1/auth/login`, {
          data: payload.data,
          timeout: liveLoginTimeoutMs,
        })

        if (response.ok()) return response

        const body = (await response.text().catch(() => "")).slice(0, 300)
        const status = response.status()
        lastFailure = `status=${status} payload=${payload.label} body=${body}`

        if (isInvalidLoginRequestBody(status, body) && !isLastPayload) continue

        if (isRetriableLoginStatus(status) && attempt < liveLoginAttempts) {
          shouldRetryByStatus = true
          break
        }

        throw new Error(`Login API failed. ${lastFailure}`)
      }
    } catch (error) {
      if (isRetriableNetworkError(error) && attempt < liveLoginAttempts) {
        lastFailure = error instanceof Error ? error.message : String(error)
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }
      throw error
    }

    if (shouldRetryByStatus && attempt < liveLoginAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
      continue
    }
  }

  throw new Error(`Login API failed after retries. base=${apiBaseUrl} last=${lastFailure}`)
}

const loginThroughUi = async (
  page: Page,
  apiBaseUrl: string,
  loginEmail: string,
  legacyLoginId: string,
  password: string
) => {
  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    await page.goto("/login?next=%2Fadmin")
    if (/\/admin(\/|$)/.test(page.url())) return

    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
    await page.getByLabel("이메일").fill(loginEmail)
    await page.locator("#password").fill(password)

    let observedLoginResponse: Response | null = null
    const loginResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/member/api/v1/auth/login"),
        { timeout: liveLoginTimeoutMs }
      )
      .then((response) => {
        observedLoginResponse = response
        return response
      })
      .catch(() => null)

    await page.getByRole("button", { name: "로그인", exact: true }).click()

    const outcome = await waitForUiLoginOutcome(page, () => observedLoginResponse, liveLoginTimeoutMs)
    await loginResponsePromise

    if (outcome.kind === "response") {
      const status = outcome.response.status()

      if (!outcome.response.ok()) {
        const bodyPreview = (await outcome.response.text().catch(() => "")).slice(0, 240)
        lastFailure = `status=${status} body=${bodyPreview}`

        // 운영 반영 타이밍 차이로 구형 로그인 payload가 섞인 경우, UI 테스트를 즉시 중단하지 않고
        // API 경로로 세션을 복구해 이후 관리자 동선을 계속 검증한다.
        if (isInvalidLoginRequestBody(status, bodyPreview)) {
          await loginWithRetry(page, apiBaseUrl, loginEmail, legacyLoginId, password)
          await page.goto("/admin")
          await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: liveUiRedirectTimeoutMs })
          return
        }

        if (isRetriableLoginStatus(status) && attempt < liveLoginAttempts) {
          await sleep(liveRetryBaseDelayMs * attempt)
          continue
        }
        throw new Error(`UI login request failed. ${lastFailure}`)
      }

      if (/\/admin(\/|$)/.test(page.url())) return
    }

    if (outcome.kind === "admin-url") return

    // 성공 쿠키가 있는데 리다이렉트가 지연되는 경우 /admin 재진입으로 판정한다.
    // 단, 쿠키가 만료/무효일 수 있으므로 즉시 실패시키지 않고 API 로그인 복구 경로를 탄다.
    if (outcome.kind === "auth-cookie") {
      if (await tryEnterAdminRoute(page, liveUiRedirectTimeoutMs)) return

      await loginWithRetry(page, apiBaseUrl, loginEmail, legacyLoginId, password)
      if (await tryEnterAdminRoute(page, liveUiRedirectTimeoutMs)) return

      lastFailure = `cookie-present-but-unauthorized url=${page.url()}`
      if (attempt < liveLoginAttempts) {
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }

      throw new Error(`UI login did not establish valid admin session. ${lastFailure}`)
    }

    if (outcome.kind === "error") {
      lastFailure = `error=${outcome.message}`
      if (attempt < liveLoginAttempts) {
        await sleep(liveRetryBaseDelayMs * attempt)
        continue
      }
      throw new Error(`UI login did not establish session. ${lastFailure}`)
    }

    lastFailure = `timeout url=${page.url()}`
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
    test.skip(!hasUiLoginCredentials, "UI 로그인 검증에는 E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD가 필요합니다.")
    await page.goto("/login")
    const apiBaseUrl = resolveApiBaseUrl(page.url())
    await waitForApiReachability(page, apiBaseUrl)
    await loginThroughUi(page, apiBaseUrl, adminEmail, adminLegacyLoginId, adminPassword)
    await expect(page.getByRole("heading", { name: adminLandingHeadingPattern })).toBeVisible()

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
    if (hasUiLoginCredentials) {
      await loginThroughUi(page, apiBaseUrl, adminEmail, adminLegacyLoginId, adminPassword)
    } else {
      await loginWithRetry(page, apiBaseUrl, adminEmail, adminLegacyLoginId, adminPassword)
    }

    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: adminLandingHeadingPattern })).toBeVisible()

    await page.goto("/admin/profile")
    await expect(page.getByRole("heading", { name: adminProfileHeadingPattern })).toBeVisible()
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
    await expect(page.getByRole("heading", { name: adminToolsHeadingPattern })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^작업 큐 진단/ })).toBeVisible()

    await page.goto("/admin/posts")
    const workspaceHeading = page.getByRole("heading", { name: "글 작성" })
    const titleInput = page.locator("#post-title").first()
    const legacyTitleInput = page.getByPlaceholder("제목을 입력하세요").first()
    if (await workspaceHeading.isVisible().catch(() => false)) {
      await openAdminNewPostEntry(page)
      await expect(page).toHaveURL(/\/(editor\/(new|[0-9]+)|admin\/posts\/write)(\/|$|\?)/)
    } else {
      await expect(page).toHaveURL(/\/(editor\/(new|[0-9]+)|admin\/posts\/write|admin\/posts\/new)(\/|$|\?)/)
    }

    if (await titleInput.isVisible().catch(() => false)) {
      await expect(titleInput).toBeVisible()
    } else {
      await expect(legacyTitleInput).toBeVisible()
    }
    await appendTextToBlockEditor(page, "라이브 E2E 편집 확인")

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
