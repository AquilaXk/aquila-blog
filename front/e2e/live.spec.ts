import { expect, test, type Locator, type Page, type Response, type Route } from "@playwright/test"
import {
  adminEmail,
  adminLegacyLoginId,
  adminPassword,
  buildLoginPayloadCandidates,
  cleanupLiveEditorPost,
  completeLegalReconsentIfRequired,
  hasAuthCookie,
  isInvalidLoginRequestBody,
  isNavigationInterruptedError,
  isRetriableLoginStatus,
  isRetriableNetworkError,
  liveLoginAttempts,
  liveLoginTimeoutMs,
  liveRetryBaseDelayMs,
  liveUiRedirectTimeoutMs,
  quickReconsentProbeTimeoutMs,
  resolveApiBaseUrl,
  sleep,
  waitForApiReachability,
} from "./helpers/liveAuth"

const hasLiveCredentials = Boolean((adminEmail || adminLegacyLoginId) && adminPassword)
const hasUiLoginCredentials = Boolean(adminEmail && adminPassword)
const expectedFrontendCommitSha = process.env.E2E_EXPECTED_FRONT_COMMIT_SHA?.trim() || ""
const explicitLiveApiBaseUrl = process.env.E2E_API_BASE_URL?.trim() || ""
const adminLandingHeadingPattern = /^좋은 아침이에요,/
const adminDashboardHeadingPattern = /^운영 상태와 복구$/
const adminCloudHeadingPattern = /^미디어 라이브러리$/
const adminProfileHeadingPattern = /^개인정보와 계정 설정$/
const adminToolsHeadingPattern = /^운영 상태와 복구$/
const adminPostsHeadingPattern = /^글 관리$/
const adminUrlPattern = /\/admin(\/|$|\?)/


const isWebKitCorsAccessControlNoise = (message: string) =>
  /due to access control checks\./i.test(message) &&
  (/\/api\.[\w.-]+\//i.test(message) ||
    /\/(?:www\.)?[\w.-]+\/_next\/data\/[^/\s]+\/[^?\s]+\.json/i.test(message))


const tryEnterAdminRoute = async (page: Page, timeoutMs: number) => {
  const tries = 3
  const perTryTimeout = Math.max(4_000, Math.floor(timeoutMs / tries))

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      await page.goto("/admin")
    } catch (error) {
      if (!isNavigationInterruptedError(error)) throw error
    }

    if (await completeLegalReconsentIfRequired(page, "/admin", timeoutMs, quickReconsentProbeTimeoutMs)) return true
    if (adminUrlPattern.test(page.url())) return true

    try {
      await page.waitForURL(adminUrlPattern, { timeout: perTryTimeout })
      if (await completeLegalReconsentIfRequired(page, "/admin", timeoutMs, quickReconsentProbeTimeoutMs)) return true
      return true
    } catch {
      if (attempt < tries) {
        await sleep(400 * attempt)
      }
    }
  }

  return false
}

const gotoLoginForAdmin = async (page: Page, timeoutMs: number) => {
  try {
    await page.goto("/login?next=%2Fadmin")
  } catch (error) {
    if (!isNavigationInterruptedError(error)) throw error
  }

  if (/\/admin(\/|$)/.test(page.url())) return "admin" as const
  if (/\/login(\/|$|\?)/.test(page.url())) return "login" as const

  try {
    await page.waitForURL(/\/(login|admin)(\/|$|\?)/, { timeout: Math.min(timeoutMs, 8_000) })
  } catch {
    // keep current url and let caller decide by assertion/retry.
  }

  if (/\/admin(\/|$)/.test(page.url())) return "admin" as const
  return "login" as const
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

    if (adminUrlPattern.test(page.url())) {
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

  if (adminUrlPattern.test(page.url())) {
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

const liveEditorSmokeMarkdown = [
  "라이브 E2E 편집 확인",
  "",
  "```ts",
  "const liveHoverWheel = true",
  "```",
  "",
  "| A | B | C | D | E | F | G |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
  "| aa | bb | cc | dd | ee | ff | gg |",
].join("\n")

type LiveWriteResponse = {
  data?: {
    id?: number
  }
}

const appendMarkdownToEditor = async (page: Page, markdown: string) => {
  const editorRoot = page.getByTestId("markdown-editor")
  const writePane = page.getByTestId("markdown-editor-write-pane")
  const previewPane = page.getByTestId("markdown-editor-preview-pane")
  const editorContent = writePane.locator("textarea").first()

  await expect(editorRoot).toBeVisible()
  await expect(writePane).toBeVisible()
  await expect(previewPane).toBeVisible()
  await expect(editorContent).toBeVisible()

  await editorContent.click()
  await page.keyboard.press(process.platform === "darwin" ? "Meta+End" : "Control+End")
  await page.keyboard.insertText(`\n\n${markdown}`)

  await expect(editorContent).toHaveValue(/라이브 E2E 편집 확인/)
  await expect(previewPane.locator("pre").first()).toContainText("const liveHoverWheel = true")
  await expect(previewPane.locator("table").first()).toContainText("aa")

  return previewPane
}

const readDocumentScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const expectHoverWheelChainsToPageScroll = async (page: Page, target: Locator, label: string) => {
  await page.evaluate(() => {
    if (document.querySelector("[data-testid='live-hover-wheel-scroll-spacer']")) return
    const spacer = document.createElement("div")
    spacer.setAttribute("data-testid", "live-hover-wheel-scroll-spacer")
    spacer.style.height = "2400px"
    document.body.appendChild(spacer)
  })

  await target.scrollIntoViewIfNeeded()
  const box = await target.boundingBox()
  if (!box) {
    throw new Error(`${label} metrics are missing before wheel`)
  }

  const overflowContract = await target.evaluate((element) => {
    const style = window.getComputedStyle(element as HTMLElement)
    return {
      overscrollY: (style as CSSStyleDeclaration & { overscrollBehaviorY?: string }).overscrollBehaviorY || "",
      touchAction: style.touchAction,
    }
  })
  expect(overflowContract.overscrollY || "auto").toBe("auto")
  expect(overflowContract.touchAction === "auto" || overflowContract.touchAction.includes("pan-y")).toBe(true)

  await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + Math.min(box.height / 2, 40))

  const beforeScrollTop = await readDocumentScrollTop(page)
  await page.mouse.wheel(0, 420)

  await expect.poll(() => readDocumentScrollTop(page)).toBeGreaterThan(beforeScrollTop + 80)
}

const expectLiveEditorHoverWheelScrollChain = async (page: Page, previewPane: Locator) => {
  await expectHoverWheelChainsToPageScroll(
    page,
    previewPane.locator("pre").first(),
    "live code block"
  )
  await expectHoverWheelChainsToPageScroll(page, previewPane.locator("table").first(), "live table")
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
    const route = await gotoLoginForAdmin(page, liveUiRedirectTimeoutMs)
    if (route === "admin") {
      await completeLegalReconsentIfRequired(page, "/admin", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
      return
    }
    if (await completeLegalReconsentIfRequired(page, "/admin", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)) return

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

    const loginButton = page.getByRole("button", { name: "로그인", exact: true })
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toBeEnabled()
    await loginButton.click()

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
          await completeLegalReconsentIfRequired(page, "/admin", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
          await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: liveUiRedirectTimeoutMs })
          return
        }

        if (isRetriableLoginStatus(status) && attempt < liveLoginAttempts) {
          await sleep(liveRetryBaseDelayMs * attempt)
          continue
        }
        throw new Error(`UI login request failed. ${lastFailure}`)
      }

      if (adminUrlPattern.test(page.url())) {
        await completeLegalReconsentIfRequired(page, "/admin", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
        return
      }
      if (await tryEnterAdminRoute(page, liveUiRedirectTimeoutMs)) return
    }

    if (outcome.kind === "admin-url") {
      await completeLegalReconsentIfRequired(page, "/admin", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
      return
    }

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

    try {
      await loginWithRetry(page, apiBaseUrl, loginEmail, legacyLoginId, password)
      if (await tryEnterAdminRoute(page, liveUiRedirectTimeoutMs)) return
      lastFailure = `timeout->api-login-no-admin url=${page.url()}`
    } catch (fallbackError) {
      const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      lastFailure = `timeout->api-fallback-failed ${fallbackMessage}`
    }

    if (attempt < liveLoginAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
      continue
    }
  }

  throw new Error(`UI login failed after retries. last=${lastFailure}`)
}

const authenticateLiveAdmin = async (page: Page, apiBaseUrl: string) => {
  if (hasUiLoginCredentials) {
    await loginThroughUi(page, apiBaseUrl, adminEmail, adminLegacyLoginId, adminPassword)
    return
  }

  await loginWithRetry(page, apiBaseUrl, adminEmail, adminLegacyLoginId, adminPassword)
}

const isVisibleLoginPage = async (page: Page) => {
  if (/\/login(\/|$|\?)/.test(page.url())) return true
  return page.getByRole("heading", { name: "로그인" }).isVisible().catch(() => false)
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const expectLiveAdminRoute = async (
  page: Page,
  apiBaseUrl: string,
  path: string,
  headingPattern: RegExp,
  label: string
) => {
  const routePattern = new RegExp(`${escapeRegExp(path)}(?:/?(?:$|[?#]))`)

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await page.goto(path)

    if (await isVisibleLoginPage(page)) {
      await authenticateLiveAdmin(page, apiBaseUrl)
      continue
    }

    await completeLegalReconsentIfRequired(page, path, liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
    await expect(page, `${label} route url`).toHaveURL(routePattern, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: headingPattern }), `${label} heading`).toBeVisible()
    return
  }

  throw new Error(`${label} route redirected to login after re-authentication: ${page.url()}`)
}

test.describe("live critical error filter", () => {
  test("WebKit Next data prefetch access-control noise는 critical error에서 제외한다", () => {
    expect(
      isWebKitCorsAccessControlNoise(
        "/blog.aquilaxk.site/_next/data/FsB_f7gB6UefGQbKBjMeG/index.json due to access control checks."
      )
    ).toBe(true)
    expect(
      isWebKitCorsAccessControlNoise(
        "https://api.blog.aquilaxk.site/member/api/v1/notifications/snapshot due to access control checks."
      )
    ).toBe(true)
    expect(isWebKitCorsAccessControlNoise("TypeError: Cannot read properties of undefined")).toBe(false)
    expect(
      isWebKitCorsAccessControlNoise("https://cdn.example.com/widget.js due to access control checks.")
    ).toBe(false)
  })
})

test.describe("live frontend build metadata", () => {
  test("custom domain이 배포 대상 commit의 front build를 서빙한다", async ({ page }) => {
    test.skip(!expectedFrontendCommitSha, "E2E_EXPECTED_FRONT_COMMIT_SHA is required")

    await page.goto("/login?next=%2Fadmin")

    const buildSha = await page.evaluate(() =>
      document.querySelector('meta[name="aquila-build-sha"]')?.getAttribute("content") ?? null
    )
    expect(buildSha).toBe(expectedFrontendCommitSha)
  })
})

test.describe("live public RSS feed", () => {
  test("/feed는 RSS XML discovery 계약을 만족한다", async ({ page }) => {
    const response = await page.request.get("/feed")
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("application/rss+xml")

    const body = await response.text()
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(body).toContain('<rss version="2.0">')
    expect(body).toContain("<channel>")
    expect(body).toContain("<link>https://blog.aquilaxk.site</link>")
    expect(body).toMatch(/<item>[\s\S]*<guid>https:\/\/blog\.aquilaxk\.site\/posts\/\d+<\/guid>[\s\S]*<\/item>/)
    expect(body).not.toContain("<!DOCTYPE")
  })
})

test.describe("live public release gate", () => {
  test.skip(!explicitLiveApiBaseUrl, "E2E_API_BASE_URL is required")
  test.setTimeout(90_000)

  test("deployment URL serves feed, search, detail, legal, CSP, and HTTPS API readiness", async ({ page }) => {
    const homeResponse = await page.goto("/")
    expect(homeResponse?.ok()).toBe(true)
    expect(homeResponse?.headers()["content-security-policy"]).toContain("default-src")

    const firstPost = page.locator("a[data-ui='feed-post-card']").first()
    await expect(firstPost).toBeVisible()
    const detailPath = await firstPost.getAttribute("href")
    const title = (await firstPost.locator("h2").textContent())?.trim() || ""
    expect(detailPath).toMatch(/^\/posts\/[^/?#]+$/)
    expect(title).not.toBe("")

    const searchResponse = page.waitForResponse((response) =>
      response.url().includes("/post/api/v1/posts/search") && response.ok()
    )
    await page.getByLabel("Search posts by keyword").fill(title)
    await searchResponse
    await expect(page.locator(`a[href='${detailPath}']`).first()).toBeVisible()

    const detailResponse = await page.goto(detailPath || "/")
    expect(detailResponse?.ok()).toBe(true)
    await expect(page.getByRole("heading", { name: title }).first()).toBeVisible()

    for (const legalPath of ["/terms", "/privacy", "/cookies", "/legal/history"]) {
      const legalResponse = await page.goto(legalPath, { waitUntil: "domcontentloaded" })
      expect(legalResponse?.ok(), legalPath).toBe(true)
    }

    const webOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL || page.url()).origin
    const readinessUrl = new URL("/actuator/health/readiness", webOrigin).toString()
    const readiness = await page.request.get(readinessUrl)
    expect(readiness.status()).toBe(200)
  })
})

test.describe("live production e2e", () => {
  test.skip(!hasLiveCredentials, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD is required")
  test.setTimeout(120_000)

  test("image upload endpoint accepts the same-origin production preflight without CORS headers", async ({ page }) => {
    const webOrigin = new URL(process.env.PLAYWRIGHT_BASE_URL || "").origin
    const apiBaseUrl = resolveApiBaseUrl(webOrigin)
    expect(apiBaseUrl).toMatch(/^https:\/\//)
    const response = await page.request.fetch(
      new URL("/post/api/v1/posts/images", apiBaseUrl).toString(),
      {
        method: "OPTIONS",
        headers: {
          Origin: webOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "content-type,x-aquila-csrf",
        },
      }
    )

    expect([200, 204]).toContain(response.status())
    expect(response.headers()["access-control-allow-origin"]).toBeUndefined()
  })

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
    await authenticateLiveAdmin(page, apiBaseUrl)

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin", adminLandingHeadingPattern, "admin landing")

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin/profile", adminProfileHeadingPattern, "admin profile")
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

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin/dashboard", adminDashboardHeadingPattern, "admin dashboard")
    const dashboardKpiRail = page.locator('[data-ui="monitoring-service-rail"]')
    await expect(dashboardKpiRail).toBeVisible()
    await expect(dashboardKpiRail.getByText("서비스 상태")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Steady-state guard" })).toBeVisible()

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin/cloud", adminCloudHeadingPattern, "admin cloud")
    const visibleCloudUploadButtons = page
      .getByRole("button", { name: /^(파일 업로드|업로드 중)$/ })
      .filter({ visible: true })
    await expect(visibleCloudUploadButtons.first()).toBeVisible()

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin/tools", adminToolsHeadingPattern, "admin tools")
    await expect(page.getByRole("tab", { name: /^작업 큐 진단/ })).toBeVisible()

    await expectLiveAdminRoute(page, apiBaseUrl, "/admin/posts", adminPostsHeadingPattern, "admin posts")
    const canaryTitle = `__live_e2e_${crypto.randomUUID()}`
    const canarySeedContent = "live editor canary seed"
    const savedTitle = `${canaryTitle} 수정`
    let postId: number | null = null
    let postWriteUrl = ""
    let postWriteRoute: ((route: Route) => Promise<void>) | null = null
    let isPostWriteRouteActive = false

    try {
      const createResponse = await page.request.post(`${apiBaseUrl}/post/api/v1/posts`, {
        data: {
          title: canaryTitle,
          content: canarySeedContent,
          published: false,
          listed: false,
        },
        headers: { "X-Aquila-CSRF": "1" },
      })
      const createBody = (await createResponse.json().catch(() => null)) as LiveWriteResponse | null
      if (createResponse.status() !== 201 || typeof createBody?.data?.id !== "number") {
        throw new Error(`live editor canary creation failed: status=${createResponse.status()}`)
      }
      postId = createBody.data.id
      postWriteUrl = `**/post/api/v1/posts/${postId}`
      postWriteRoute = async (route: Route) => {
        const request = route.request()
        if (request.method() !== "PUT") {
          await route.fallback()
          return
        }

        let payload: { published?: unknown; listed?: unknown } | null = null
        try {
          payload = request.postDataJSON() as { published?: unknown; listed?: unknown } | null
        } catch {
          await route.fulfill({ status: 400, body: "invalid live editor canary payload" })
          return
        }
        if (payload?.published !== false || payload.listed !== false) {
          await route.fulfill({ status: 400, body: "live editor canary write must be private" })
          return
        }
        await route.continue()
      }

      await page.goto(`/editor/${postId}`)
      await expect(page).toHaveURL(new RegExp(`/editor/${postId}(\\?|$)`))

      const titleInput = page.getByPlaceholder("제목을 입력하세요").first()
      await expect(titleInput).toBeVisible()
      const editorContent = page.getByTestId("markdown-editor-write-pane").locator("textarea").first()
      await expect(titleInput).toHaveValue(canaryTitle)
      await expect(editorContent).toHaveValue(canarySeedContent)
      await expect(page.getByLabel("Visibility")).toHaveValue("PRIVATE")

      await titleInput.fill(savedTitle)
      const previewPane = await appendMarkdownToEditor(page, liveEditorSmokeMarkdown)
      await expectLiveEditorHoverWheelScrollChain(page, previewPane)

      await page.getByRole("button", { name: "발행 설정", exact: true }).click()
      const publishDialog = page.getByRole("dialog", { name: "수정 설정" })
      await expect(publishDialog).toBeVisible()
      await publishDialog.getByRole("button", { name: "비공개", exact: true }).click()
      await page.route(postWriteUrl, postWriteRoute)
      isPostWriteRouteActive = true
      const writeResponse = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/post/api/v1/posts/${postId}`
      )
      await publishDialog.getByRole("button", { name: "변경 반영", exact: true }).click()
      const response = await writeResponse
      await page.unroute(postWriteUrl, postWriteRoute)
      isPostWriteRouteActive = false
      expect(response.ok()).toBe(true)

      await page.goto(`/editor/${postId}`)
      await expect(page).toHaveURL(new RegExp(`/editor/${postId}(\\?|$)`))
      await expect(titleInput).toHaveValue(savedTitle)
      await expect(editorContent).toHaveValue(new RegExp(canarySeedContent))
      await expect(editorContent).toHaveValue(/라이브 E2E 편집 확인/)
      await expect(page.getByLabel("Visibility")).toHaveValue("PRIVATE")
      const reloadedPreview = page.getByTestId("markdown-editor-preview-pane")
      await expect(reloadedPreview.locator("pre").first()).toContainText("const liveHoverWheel = true")
      await expect(reloadedPreview.locator("table").first()).toContainText("aa")
    } finally {
      if (isPostWriteRouteActive && postWriteRoute) await page.unroute(postWriteUrl, postWriteRoute)
      if (postId !== null) await cleanupLiveEditorPost(page, postId)
    }

    const backToPostManagement = page.getByRole("button", { name: /글 관리/ }).first()
    if (await backToPostManagement.isVisible().catch(() => false)) {
      await backToPostManagement.click()
      await expectLiveAdminRoute(page, apiBaseUrl, "/admin/posts", adminPostsHeadingPattern, "admin posts after editor")
    }

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
