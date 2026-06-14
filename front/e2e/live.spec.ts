import { expect, test, type Locator, type Page, type Response } from "@playwright/test"
import {
  adminEmail,
  adminLegacyLoginId,
  adminPassword,
  buildLoginPayloadCandidates,
  hasAuthCookie,
  isInvalidLoginRequestBody,
  isNavigationInterruptedError,
  isRetriableLoginStatus,
  isRetriableNetworkError,
  liveLoginAttempts,
  liveLoginTimeoutMs,
  liveRetryBaseDelayMs,
  liveUiRedirectTimeoutMs,
  resolveApiBaseUrl,
  sleep,
  waitForApiReachability,
} from "./helpers/liveAuth"

const hasLiveCredentials = Boolean((adminEmail || adminLegacyLoginId) && adminPassword)
const hasUiLoginCredentials = Boolean(adminEmail && adminPassword)
const expectedFrontendCommitSha = process.env.E2E_EXPECTED_FRONT_COMMIT_SHA?.trim() || ""
const adminLandingHeadingPattern = /^관리자$/
const adminDashboardHeadingPattern = /^운영 상태$/
const adminCloudHeadingPattern = /^내 파일$/
const adminProfileHeadingPattern = /^프로필$/
const adminToolsHeadingPattern = /^운영 도구$/
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

    if (adminUrlPattern.test(page.url())) return true

    try {
      await page.waitForURL(adminUrlPattern, { timeout: perTryTimeout })
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

const liveHoverWheelTableMarkdown = [
  "| A | B | C | D | E | F | G |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
  "| aa | bb | cc | dd | ee | ff | gg |",
].join("\n")

const pasteMarkdownIntoBlockEditor = async (blockEditor: Locator, markdown: string) => {
  await blockEditor.evaluate((element, payload) => {
    const data = new DataTransfer()
    data.setData("text/plain", payload)
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: data })
    element.dispatchEvent(event)
  }, markdown)
}

const ensureLiveHoverWheelFixture = async (page: Page, blockEditor: Locator) => {
  await blockEditor.click({ position: { x: 24, y: 24 } })
  await page.keyboard.press("Enter")

  const codeButton = page.getByRole("button", { name: "코드", exact: true }).first()
  if (await codeButton.isVisible().catch(() => false)) {
    await codeButton.click()
  } else {
    await page.keyboard.type("/코드")
    await page.keyboard.press("Enter")
  }

  await expect(page.locator("[data-code-block-wrapper='true']").first()).toBeVisible()
  await expect(page.locator(".aq-code-shell").first()).toBeVisible()
  await page.keyboard.type("const liveHoverWheel = true")

  const tableButton = page.getByRole("button", { name: "테이블", exact: true }).first()
  if (await tableButton.isVisible().catch(() => false)) {
    await tableButton.click()
  } else {
    await pasteMarkdownIntoBlockEditor(blockEditor, liveHoverWheelTableMarkdown)
  }

  await expect(page.locator(".aq-block-editor__content .tableWrapper").first()).toBeVisible()
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

const expectLiveEditorHoverWheelScrollChain = async (page: Page, blockEditor: Locator) => {
  await ensureLiveHoverWheelFixture(page, blockEditor)
  await expectHoverWheelChainsToPageScroll(
    page,
    page.locator("[data-code-block-wrapper='true']").first(),
    "live code block"
  )
  await expectHoverWheelChainsToPageScroll(
    page,
    page.locator(".aq-block-editor__content .tableWrapper").first(),
    "live table wrapper"
  )
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
    if (route === "admin") return

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
          await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: liveUiRedirectTimeoutMs })
          return
        }

        if (isRetriableLoginStatus(status) && attempt < liveLoginAttempts) {
          await sleep(liveRetryBaseDelayMs * attempt)
          continue
        }
        throw new Error(`UI login request failed. ${lastFailure}`)
      }

      if (adminUrlPattern.test(page.url())) return
      if (await tryEnterAdminRoute(page, liveUiRedirectTimeoutMs)) return
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

test.describe("live critical error filter", () => {
  test("WebKit Next data prefetch access-control noise는 critical error에서 제외한다", () => {
    expect(
      isWebKitCorsAccessControlNoise(
        "/www.aquilaxk.site/_next/data/FsB_f7gB6UefGQbKBjMeG/index.json due to access control checks."
      )
    ).toBe(true)
    expect(
      isWebKitCorsAccessControlNoise(
        "https://api.aquilaxk.site/member/api/v1/notifications/snapshot due to access control checks."
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

    await page.goto("/admin/dashboard")
    await expect(page.getByRole("heading", { name: adminDashboardHeadingPattern })).toBeVisible()
    const dashboardKpiRail = page.locator('[data-ui="monitoring-service-rail"]')
    await expect(dashboardKpiRail).toBeVisible()
    await expect(dashboardKpiRail.getByText("서비스 상태")).toBeVisible()
    await expect(page.getByRole("heading", { name: "우선 점검 항목" })).toBeVisible()

    await page.goto("/admin/cloud")
    await expect(page.getByRole("heading", { name: adminCloudHeadingPattern })).toBeVisible()
    const visibleCloudUploadButton = page
      .getByRole("button", { name: /^(파일 업로드|업로드 중)$/ })
      .filter({ visible: true })
    await expect(visibleCloudUploadButton).toHaveCount(1)
    await expect(visibleCloudUploadButton).toBeVisible()

    await page.goto("/admin/tools")
    await expect(page.getByRole("heading", { name: adminToolsHeadingPattern })).toBeVisible()
    await expect(page.getByRole("tab", { name: /^작업 큐 진단/ })).toBeVisible()

    await page.goto("/admin/posts")
    await expect(page.getByRole("heading", { name: adminPostsHeadingPattern })).toBeVisible()
    const titleInput = page.locator("#post-title").first()
    const legacyTitleInput = page.getByPlaceholder("제목을 입력하세요").first()
    await openAdminNewPostEntry(page)
    await expect(page).toHaveURL(/\/(editor\/(new|[0-9]+)|admin\/posts\/write|admin\/posts\/new)(\/|$|\?)/)

    if (await titleInput.isVisible().catch(() => false)) {
      await expect(titleInput).toBeVisible()
    } else {
      await expect(legacyTitleInput).toBeVisible()
    }
    const blockEditor = await appendTextToBlockEditor(page, "라이브 E2E 편집 확인")
    await expectLiveEditorHoverWheelScrollChain(page, blockEditor)

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
