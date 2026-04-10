import { expect, test } from "@playwright/test"

const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || ""
const adminLegacyLoginId = process.env.E2E_ADMIN_USERNAME?.trim() || ""
const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
const explicitApiBaseUrl = process.env.E2E_API_BASE_URL?.trim() || ""
const hasUiLoginCredentials = Boolean(adminEmail && adminPassword)
const liveApiProbeAttempts = Number.parseInt(process.env.E2E_LIVE_API_PROBE_ATTEMPTS || "4", 10)
const liveLoginAttempts = Number.parseInt(process.env.E2E_LIVE_LOGIN_ATTEMPTS || "3", 10)
const liveLoginTimeoutMs = Number.parseInt(process.env.E2E_LIVE_LOGIN_TIMEOUT_MS || "30000", 10)
const liveRetryBaseDelayMs = Number.parseInt(process.env.E2E_LIVE_RETRY_BASE_DELAY_MS || "2000", 10)
const liveUiRedirectTimeoutMs = Number.parseInt(process.env.E2E_LIVE_UI_REDIRECT_TIMEOUT_MS || "20000", 10)
const editorOrAdminUrlPattern = /\/(admin|editor)(\/|$|\?)/
const editorUrlPattern = /\/editor(\/|$|\?)/

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

const isRetriableLoginStatus = (status: number) => [502, 503, 504, 520, 522, 524, 530].includes(status)
const isInvalidLoginRequestBody = (status: number, body: string) =>
  status === 400 &&
  /"resultCode"\s*:\s*"400-1"/.test(body) &&
  /요청 본문이 올바르지 않습니다\./.test(body)

const hasAuthCookie = async (page: Parameters<typeof test>[0]["page"]) => {
  const currentUrl = page.url()
  const cookies = /^https?:\/\//.test(currentUrl)
    ? await page.context().cookies([new URL(currentUrl).origin])
    : await page.context().cookies()
  return cookies.some((cookie) => cookie.name === "apiKey" || cookie.name === "accessToken")
}

const isNavigationInterruptedError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  return /interrupted by another navigation/i.test(message)
}

const tryEnterEditorRoute = async (page: Parameters<typeof test>[0]["page"], timeoutMs: number) => {
  const tries = 3
  const perTryTimeout = Math.max(4_000, Math.floor(timeoutMs / tries))

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      await page.goto("/editor/new")
    } catch (error) {
      if (!isNavigationInterruptedError(error)) throw error
    }

    if (editorUrlPattern.test(page.url())) return true

    try {
      await page.waitForURL(editorUrlPattern, { timeout: perTryTimeout })
      return true
    } catch {
      if (attempt < tries) await sleep(400 * attempt)
    }
  }

  return false
}

const gotoLoginForEditor = async (page: Parameters<typeof test>[0]["page"], timeoutMs: number) => {
  try {
    await page.goto("/login?next=%2Feditor%2Fnew")
  } catch (error) {
    if (!isNavigationInterruptedError(error)) throw error
  }

  if (editorUrlPattern.test(page.url())) return "editor" as const
  if (/\/login(\/|$|\?)/.test(page.url())) return "login" as const

  try {
    await page.waitForURL(/\/(login|editor)(\/|$|\?)/, { timeout: Math.min(timeoutMs, 8_000) })
  } catch {
    // keep current url and let caller decide.
  }

  if (editorUrlPattern.test(page.url())) return "editor" as const
  return "login" as const
}

type UiLoginOutcome =
  | { kind: "response"; status: number; bodyPreview: string }
  | { kind: "editor-url" }
  | { kind: "auth-cookie" }
  | { kind: "error"; message: string }
  | { kind: "timeout" }

const getVisibleUiLoginError = async (page: Parameters<typeof test>[0]["page"]) => {
  const loginError = page
    .locator("main")
    .getByText(/로그인에 실패|이메일 또는 비밀번호|로그인 시도가 너무 많습니다|서버 오류/i)
    .first()

  if (!(await loginError.isVisible().catch(() => false))) return null
  return (await loginError.textContent())?.trim() || "unknown error"
}

const getTableAffordances = (page: Parameters<typeof test>[0]["page"]) => ({
  rowHandle: page.locator("[data-table-affordance='row-handle']").first(),
  columnHandle: page.locator("[data-table-affordance='column-handle']").first(),
  rowAddButton: page.locator("[data-table-affordance='row-add']").first(),
  columnAddButton: page.locator("[data-table-affordance='column-add']").first(),
  growHandle: page.locator("[data-table-affordance='grow-handle']").first(),
  structureMenuButton: page.locator("[data-table-affordance='structure-menu']").first(),
  cellMenuButton: page.locator("[data-table-affordance='cell-menu']").first(),
})

const waitForUiLoginOutcome = async (
  page: Parameters<typeof test>[0]["page"],
  getObservedLoginResponse: () => { status: number; bodyPreview: string } | null,
  timeoutMs: number
): Promise<UiLoginOutcome> => {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    const observedLoginResponse = getObservedLoginResponse()
    if (observedLoginResponse) return { kind: "response", ...observedLoginResponse }
    if (editorOrAdminUrlPattern.test(page.url())) return { kind: "editor-url" }
    if (await hasAuthCookie(page)) return { kind: "auth-cookie" }

    const loginError = await getVisibleUiLoginError(page)
    if (loginError) return { kind: "error", message: loginError }

    await page.waitForTimeout(250)
  }

  const observedLoginResponse = getObservedLoginResponse()
  if (observedLoginResponse) return { kind: "response", ...observedLoginResponse }
  if (editorOrAdminUrlPattern.test(page.url())) return { kind: "editor-url" }
  if (await hasAuthCookie(page)) return { kind: "auth-cookie" }

  const loginError = await getVisibleUiLoginError(page)
  if (loginError) return { kind: "error", message: loginError }

  return { kind: "timeout" }
}

const waitForApiReachability = async (page: Parameters<typeof test>[0]["page"], apiBaseUrl: string) => {
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

    if (attempt < liveApiProbeAttempts) await sleep(liveRetryBaseDelayMs * attempt)
  }

  throw new Error(`API reachability probe failed. base=${apiBaseUrl} last=${lastFailure}`)
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

const loginWithRetry = async (page: Parameters<typeof test>[0]["page"], apiBaseUrl: string) => {
  const payloadCandidates = buildLoginPayloadCandidates(adminEmail, adminLegacyLoginId, adminPassword)
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

        if (response.ok()) return

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

const loginThroughUi = async (page: Parameters<typeof test>[0]["page"]) => {
  const route = await gotoLoginForEditor(page, liveUiRedirectTimeoutMs)
  if (route === "editor") return

  const apiBaseUrl = resolveApiBaseUrl(page.url())
  await waitForApiReachability(page, apiBaseUrl)

  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
    await page.getByLabel("이메일").fill(adminEmail)
    await page.locator("#password").fill(adminPassword)

    let observedLoginResponse: { status: number; bodyPreview: string } | null = null
    const loginResponsePromise = page
      .waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          response.url().includes("/member/api/v1/auth/login"),
        { timeout: liveLoginTimeoutMs }
      )
      .then(async (response) => {
        observedLoginResponse = {
          status: response.status(),
          bodyPreview: (await response.text().catch(() => "")).slice(0, 240),
        }
      })
      .catch(() => null)

    const loginButton = page.getByRole("button", { name: "로그인", exact: true })
    await expect(loginButton).toBeVisible()
    await expect(loginButton).toBeEnabled()
    await loginButton.click()

    const outcome = await waitForUiLoginOutcome(page, () => observedLoginResponse, liveLoginTimeoutMs)
    await loginResponsePromise

    if (outcome.kind === "response") {
      if (outcome.status < 400) {
        if (editorUrlPattern.test(page.url())) return
        if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
      } else {
        lastFailure = `status=${outcome.status} body=${outcome.bodyPreview}`
        if (isInvalidLoginRequestBody(outcome.status, outcome.bodyPreview)) {
          await loginWithRetry(page, apiBaseUrl)
          if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
        }
        if (isRetriableLoginStatus(outcome.status) && attempt < liveLoginAttempts) {
          await sleep(liveRetryBaseDelayMs * attempt)
          continue
        }
      }
    }

    if (outcome.kind === "editor-url") return

    if (outcome.kind === "auth-cookie") {
      if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
      await loginWithRetry(page, apiBaseUrl)
      if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
      lastFailure = `cookie-present-but-no-editor url=${page.url()}`
    }

    if (outcome.kind === "error") {
      lastFailure = `error=${outcome.message}`
      await loginWithRetry(page, apiBaseUrl)
      if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
    }

    if (outcome.kind === "timeout") {
      try {
        await loginWithRetry(page, apiBaseUrl)
        if (await tryEnterEditorRoute(page, liveUiRedirectTimeoutMs)) return
        lastFailure = `timeout->api-login-no-editor url=${page.url()}`
      } catch (fallbackError) {
        const fallbackMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
        lastFailure = `timeout->api-fallback-failed ${fallbackMessage}`
      }
    }

    if (attempt < liveLoginAttempts) {
      await sleep(liveRetryBaseDelayMs * attempt)
      await gotoLoginForEditor(page, liveUiRedirectTimeoutMs)
      continue
    }
  }

  throw new Error(`UI login failed after retries. last=${lastFailure}`)
}

test.describe("editor live visual regression", () => {
  test.skip(!hasUiLoginCredentials, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD가 필요합니다.")

  test("실제 /editor/new는 제품 셸 기준으로 제목/본문 정렬을 유지하고 QA affordance를 노출하지 않는다", async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)

    await page.goto("/editor/new")
    await page.waitForURL(/\/editor(\/|$)/, { timeout: 30000 })
    await expect(page.getByTestId("editor-writing-column")).toBeVisible()
    await expect(page.getByTestId("editor-preview-column")).toHaveCount(0)
    await expect(page.getByText("BlockEditorShell 엔진 QA")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "제목 1" })).toBeVisible()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toBeVisible()

    await page.getByPlaceholder("제목을 입력하세요").first().fill("실화면 회귀 점검 제목")

    const editor = page.getByTestId("block-editor-prosemirror").first()
    await editor.click()
    await page.getByRole("button", { name: "제목 1" }).click()
    await page.keyboard.type("헤딩 정렬 확인")
    await page.keyboard.press("Enter")
    await page.keyboard.type("본문 정렬 확인")

    const heading = editor.locator(".aq-block-editor__content h1").first()
    const paragraph = editor.locator(".aq-block-editor__content p").filter({ hasText: "본문 정렬 확인" }).first()
    await expect(heading).toBeVisible()
    await expect(paragraph).toBeVisible()

    const headingStyle = await heading.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        textAlign: style.textAlign,
      }
    })
    expect(headingStyle.textAlign).toBe("left")

    const headingBox = await heading.boundingBox()
    const paragraphBox = await paragraph.boundingBox()
    expect(headingBox).not.toBeNull()
    expect(paragraphBox).not.toBeNull()
    if (!headingBox || !paragraphBox) return

    expect(Math.abs(headingBox.x - paragraphBox.x)).toBeLessThanOrEqual(4)
  })

  test("실제 /editor/new는 table affordance가 제품 셸 clipping 없이 노출된다", async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)
    const {
      rowHandle,
      columnHandle,
      rowAddButton,
      columnAddButton,
      growHandle,
      structureMenuButton,
      cellMenuButton,
    } = getTableAffordances(page)

    await page.goto("/editor/new")
    await page.waitForURL(/\/editor(\/|$)/, { timeout: 30000 })
    await page.getByPlaceholder("제목을 입력하세요").first().fill("실화면 테이블 affordance 회귀 점검")

    const editor = page.getByTestId("block-editor-prosemirror").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const table = page.locator(".aq-block-editor__content .tableWrapper table").first()
    await expect(table).toBeVisible()

    const tableBox = await table.boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing")
    }

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    const cornerHandle = page.getByTestId("table-corner-handle")
    await expect(cornerHandle).toBeVisible()
    await expect(growHandle).toBeVisible()
    await expect(structureMenuButton).toBeVisible()
    await expect(cellMenuButton).toBeVisible()
    await expect(rowHandle).toBeVisible()
    await expect(columnHandle).toBeVisible()

    await structureMenuButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu.getByRole("button", { name: "페이지 너비에 맞춤" })).toBeVisible()
    await expect(tableMenu.getByRole("button", { name: "넓은 표" })).toBeVisible()

    await page.mouse.move(tableBox.x + tableBox.width - 3, tableBox.y + tableBox.height - 3)

    await expect(columnAddButton).toBeVisible()
    await expect(rowAddButton).toBeVisible()

    const viewport = page.viewportSize()
    const addBarBoxes = await Promise.all([columnAddButton.boundingBox(), rowAddButton.boundingBox()])
    const [columnAddBarBox, rowAddBarBox] = addBarBoxes
    expect(viewport).not.toBeNull()
    expect(columnAddBarBox).not.toBeNull()
    expect(rowAddBarBox).not.toBeNull()
    if (!viewport || !columnAddBarBox || !rowAddBarBox) return

    expect(columnAddBarBox.x + columnAddBarBox.width).toBeLessThanOrEqual(viewport.width)
    expect(rowAddBarBox.y + rowAddBarBox.height).toBeLessThanOrEqual(viewport.height)
    expect(
      Math.abs(columnAddBarBox.x + columnAddBarBox.width / 2 - (tableBox.x + tableBox.width))
    ).toBeLessThanOrEqual(18)
    expect(
      Math.abs(rowAddBarBox.y + rowAddBarBox.height / 2 - (tableBox.y + tableBox.height))
    ).toBeLessThanOrEqual(18)
    expect(
      Math.abs(columnAddBarBox.y + columnAddBarBox.height / 2 - (tableBox.y + tableBox.height / 2))
    ).toBeLessThanOrEqual(18)
    expect(
      Math.abs(rowAddBarBox.x + rowAddBarBox.width / 2 - (tableBox.x + tableBox.width / 2))
    ).toBeLessThanOrEqual(18)
  })
})
