import { expect, test, type Page } from "@playwright/test"
import {
  adminEmail,
  adminLegacyLoginId,
  adminPassword,
  buildLoginPayloadCandidates,
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

const uiLoginId = adminEmail || adminLegacyLoginId
const hasUiLoginCredentials = Boolean(uiLoginId && adminPassword)
const editorOrAdminUrlPattern = /\/(admin|editor)(\/|$|\?)/
const editorUrlPattern = /\/editor(\/|$|\?)/
const expectedFrontendCommitSha = process.env.E2E_EXPECTED_FRONT_COMMIT_SHA?.trim() || ""
const liveEditor507CanaryEnabled = process.env.E2E_LIVE_EDITOR_507_CANARY === "true"
const liveEditor507SeededHosts = new Set(
  (process.env.E2E_LIVE_EDITOR_507_HOSTS || "www.aquilaxk.site")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
)

const post507FinalTableTargetCell = "Stateless 의미"
const post507FinalTableSelectAllNeedle = "구현되어 있는가"
const post507CodeText = "createAccessToken(user)"
const post507ListText = "세션이랑 JWT"

const markdownCanary = [
  "# Live Markdown editor",
  "",
  "507 하단 복합 선택 회귀를 Markdown write/preview 경로에서 검증한다.",
  "",
  "- 세션이랑 JWT",
  "- [ ] task item",
  "",
  "| 항목 | 설명 |",
  "| --- | --- |",
  "| Stateless 의미 | 구현되어 있는가 |",
  "",
  "```java",
  "createAccessToken(user)",
  "```",
].join("\n")

const tryEnterEditorRoute = async (page: Page, timeoutMs: number) => {
  const tries = 3
  const perTryTimeout = Math.max(4_000, Math.floor(timeoutMs / tries))

  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      await page.goto("/editor/new")
    } catch (error) {
      if (!isNavigationInterruptedError(error)) throw error
    }

    if (await completeLegalReconsentIfRequired(page, "/editor/new", timeoutMs)) return true
    if (editorUrlPattern.test(page.url())) return true

    try {
      await page.waitForURL(editorUrlPattern, { timeout: perTryTimeout })
      if (await completeLegalReconsentIfRequired(page, "/editor/new", timeoutMs)) return true
      return true
    } catch {
      if (attempt < tries) await sleep(400 * attempt)
    }
  }

  return false
}

const gotoLoginForEditor = async (page: Page, timeoutMs: number) => {
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
    // Keep current URL and let the caller decide.
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

const loginWithRetry = async (page: Page, apiBaseUrl: string) => {
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

const loginThroughUi = async (page: Page) => {
  const route = await gotoLoginForEditor(page, liveUiRedirectTimeoutMs)
  if (route === "editor") {
    await completeLegalReconsentIfRequired(page, "/editor/new", liveUiRedirectTimeoutMs)
    return
  }

  const apiBaseUrl = resolveApiBaseUrl(page.url())
  await waitForApiReachability(page, apiBaseUrl)

  let lastFailure = "unknown"

  for (let attempt = 1; attempt <= liveLoginAttempts; attempt += 1) {
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
    await page.getByLabel("이메일").fill(uiLoginId)
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
        if (editorUrlPattern.test(page.url())) {
          await completeLegalReconsentIfRequired(page, "/editor/new", liveUiRedirectTimeoutMs)
          return
        }
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

    if (outcome.kind === "editor-url") {
      await completeLegalReconsentIfRequired(page, "/editor/new", liveUiRedirectTimeoutMs)
      return
    }

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

type LiveWriteResponse = {
  data?: {
    id?: number
  }
}

const createHiddenEditorPost = async (page: Page, title: string, content: string) => {
  const apiBaseUrl = resolveApiBaseUrl(page.url())
  const response = await page.request.post(`${apiBaseUrl}/post/api/v1/posts`, {
    data: {
      title,
      content,
      published: false,
      listed: false,
    },
    headers: {
      "X-Aquila-CSRF": "1",
    },
  })
  const body = (await response.json().catch(() => null)) as LiveWriteResponse | null
  const postId = body?.data?.id
  if (!response.ok() || typeof postId !== "number") {
    throw new Error(`failed to create live editor post: status=${response.status()} body=${JSON.stringify(body)}`)
  }
  return postId
}

const deleteHiddenEditorPost = async (page: Page, postId: number) => {
  const apiBaseUrl = resolveApiBaseUrl(page.url())
  const response = await page.request.delete(`${apiBaseUrl}/post/api/v1/posts/${postId}`, {
    headers: {
      "X-Aquila-CSRF": "1",
    },
  })
  if (!response.ok()) {
    const body = await response.text().catch(() => "")
    throw new Error(`failed to delete live editor post ${postId}: status=${response.status()} body=${body.slice(0, 300)}`)
  }
}

const expectMarkdownEditorShell = async (page: Page) => {
  await expect(page.getByTestId("markdown-editor")).toBeVisible()
  await expect(page.getByTestId("markdown-editor-write-pane")).toBeVisible()
  await expect(page.getByTestId("markdown-editor-preview-pane")).toBeVisible()
  await expect(page.locator("[data-testid='keyboard-block-selection-overlay']")).toHaveCount(0)
  await expect(page.locator("[data-testid='block-drag-handle']")).toHaveCount(0)
  await expect(page.locator("[data-table-affordance]")).toHaveCount(0)
}

const focusMarkdownEditor = async (page: Page) => {
  const writePane = page.getByTestId("markdown-editor-write-pane")
  await expect(writePane).toBeVisible()
  const content = writePane.locator("textarea")
  await content.click()
  await expect(content).toBeFocused()
  return content
}

const replaceMarkdown = async (page: Page, markdown: string) => {
  await focusMarkdownEditor(page)
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
  await page.keyboard.insertText(markdown)
}

const readEditorSelection = async (page: Page) =>
  page.getByTestId("markdown-editor-write-pane").locator("textarea").evaluate((textarea) => {
    const element = textarea as HTMLTextAreaElement
    return element.value.slice(element.selectionStart, element.selectionEnd).replace(/\s+/g, " ").trim()
  })

test.describe("editor live visual regression", () => {
  test.skip(!hasUiLoginCredentials, "E2E_ADMIN_EMAIL 또는 E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD가 필요합니다.")

  test("실제 /editor/new는 Markdown write/preview 셸을 렌더하고 legacy block affordance를 노출하지 않는다", async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)

    await page.goto("/editor/new")
    await completeLegalReconsentIfRequired(
      page,
      "/editor/new",
      liveUiRedirectTimeoutMs,
      quickReconsentProbeTimeoutMs
    )
    await page.waitForURL(/\/editor(\/|$)/, { timeout: 30_000 })
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toBeVisible()
    await expectMarkdownEditorShell(page)
    await expect(page.getByRole("tab", { name: "Split" })).toHaveAttribute("aria-selected", "true")

    await page.getByPlaceholder("제목을 입력하세요").first().fill("실화면 Markdown editor 회귀 점검")
    await replaceMarkdown(page, markdownCanary)

    const preview = page.getByTestId("markdown-editor-preview-pane")
    await expect(preview.getByRole("heading", { name: "Live Markdown editor" })).toBeVisible()
    await expect(preview.locator("table")).toContainText(post507FinalTableTargetCell)
    await expect(preview.locator("pre")).toContainText(post507CodeText)
    await expect(preview.getByText(post507ListText)).toBeVisible()
    await expect(page.locator("[data-table-affordance]")).toHaveCount(0)
  })

  test("실제 /editor/[id]는 저장된 Markdown table/code/list를 write/preview에 같은 내용으로 로드한다", async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)

    const title = `실화면 Markdown 저장글 회귀 ${Date.now()}`
    const postId = await createHiddenEditorPost(page, title, markdownCanary)

    try {
      await page.goto(`/editor/${postId}`)
      await completeLegalReconsentIfRequired(
        page,
        `/editor/${postId}`,
        liveUiRedirectTimeoutMs,
        quickReconsentProbeTimeoutMs
      )
      await page.waitForURL(new RegExp(`/editor/${postId}(\\?|$)`), { timeout: 30_000 })
      await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(title)
      await expectMarkdownEditorShell(page)

      const writePane = page.getByTestId("markdown-editor-write-pane")
      await expect(writePane.locator("textarea")).toHaveValue(new RegExp(post507FinalTableTargetCell))
      await expect(writePane.locator("textarea")).toHaveValue(new RegExp(post507CodeText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

      const preview = page.getByTestId("markdown-editor-preview-pane")
      await expect(preview.locator("table")).toContainText(post507FinalTableSelectAllNeedle)
      await expect(preview.locator("pre")).toContainText(post507CodeText)
      await expect(preview.getByText(post507ListText)).toBeVisible()

      await focusMarkdownEditor(page)
      await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
      await expect.poll(() => readEditorSelection(page)).toContain(post507FinalTableTargetCell)
      await expect.poll(() => readEditorSelection(page)).toContain(post507CodeText)
    } finally {
      await deleteHiddenEditorPost(page, postId)
    }
  })

  test("실제 /editor/507 canary는 Markdown editor와 상세 렌더 preview 기준으로 하단 table/code/list를 표시한다", async ({
    page,
  }) => {
    test.skip(!liveEditor507CanaryEnabled, "E2E_LIVE_EDITOR_507_CANARY=true일 때만 실제 507 seeded live canary를 실행합니다.")
    test.slow()
    await page.setViewportSize({ width: 1580, height: 900 })
    await loginThroughUi(page)
    test.skip(
      !liveEditor507SeededHosts.has(new URL(page.url()).hostname.toLowerCase()),
      "실제 507 seeded content가 있는 live host에서만 canary를 실행합니다."
    )

    await page.goto("/editor/507")
    await completeLegalReconsentIfRequired(page, "/editor/507", liveUiRedirectTimeoutMs, quickReconsentProbeTimeoutMs)
    await page.waitForURL(/\/editor\/507(\?|$)/, { timeout: 30_000 })
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toBeVisible()

    const buildSha = await page.evaluate(() =>
      document.querySelector('meta[name="aquila-build-sha"]')?.getAttribute("content") ?? null
    )
    if (expectedFrontendCommitSha) {
      expect(buildSha).toBe(expectedFrontendCommitSha)
    }

    await expectMarkdownEditorShell(page)
    const preview = page.getByTestId("markdown-editor-preview-pane")
    const finalReferenceTable = preview.locator("table").filter({ hasText: post507FinalTableTargetCell }).first()
    const tokenCodeBlock = preview.locator("pre").filter({ hasText: post507CodeText }).first()
    await expect(finalReferenceTable).toContainText(post507FinalTableTargetCell, { timeout: 30_000 })
    await expect(finalReferenceTable).toContainText(post507FinalTableSelectAllNeedle)
    await expect(tokenCodeBlock).toContainText(post507CodeText)
    await expect(preview.getByText(post507ListText)).toBeVisible()

    await expect(page.locator("[data-table-affordance]")).toHaveCount(0)
  })
})
