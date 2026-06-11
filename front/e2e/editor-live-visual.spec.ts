import { expect, test, type Locator, type Page } from "@playwright/test"
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
const post507LowerBodyText = "서버가 아무것도 안 하는 구조"
const post507CodeText = "createAccessToken(user)"
const post507ListText = "세션이랑 JWT"



const tryEnterEditorRoute = async (page: Page, timeoutMs: number) => {
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

const getVisibleUiLoginError = async (page: Page) => {
  const loginError = page
    .locator("main")
    .getByText(/로그인에 실패|이메일 또는 비밀번호|로그인 시도가 너무 많습니다|서버 오류/i)
    .first()

  if (!(await loginError.isVisible().catch(() => false))) return null
  return (await loginError.textContent())?.trim() || "unknown error"
}

const getTableAffordances = (page: Page) => ({
  rowHandle: page.locator("[data-table-affordance='row-handle']").first(),
  columnHandle: page.locator("[data-table-affordance='column-handle']").first(),
  rowAddButton: page.locator("[data-table-affordance='row-add']").first(),
  columnAddButton: page.locator("[data-table-affordance='column-add']").first(),
  growHandle: page.locator("[data-table-affordance='grow-handle']").first(),
  structureMenuButton: page.locator("[data-table-affordance='structure-menu']").first(),
  cellMenuButton: page.locator("[data-table-affordance='cell-menu']").first(),
})

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
  if (route === "editor") return

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

type LiveWriteResponse = {
  data?: {
    id?: number
  }
}

const createHiddenEditorPost = async (
  page: Page,
  title: string,
  content: string
) => {
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

const pressSelectAll = async (page: Page) => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const readSelectionText = (page: Page) =>
  page.evaluate(() => {
    const candidates = [
      window.getSelection()?.toString() ?? "",
      document.documentElement.getAttribute("data-table-drag-selection-text") ?? "",
      document
        .querySelector("[data-table-drag-selection-text]")
        ?.getAttribute("data-table-drag-selection-text") ?? "",
      document.documentElement.getAttribute("data-code-drag-selection-text") ?? "",
      document
        .querySelector("[data-code-drag-selection-text]")
        ?.getAttribute("data-code-drag-selection-text") ?? "",
    ].filter((value) => value.trim().length > 0)
    return candidates.sort((left, right) => right.length - left.length)[0] ?? ""
  })

const clearSelectionResidue = (page: Page) =>
  page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.documentElement.removeAttribute("data-table-drag-selection-text")
    document.documentElement.removeAttribute("data-code-drag-selection-text")
    document
      .querySelectorAll<HTMLElement>("[data-table-drag-selection-text], [data-code-drag-selection-text]")
      .forEach((element) => {
        element.removeAttribute("data-table-drag-selection-text")
        element.removeAttribute("data-code-drag-selection-text")
      })
    document.dispatchEvent(new Event("selectionchange"))
  })

const readSelectionResidueState = (page: Page) =>
  page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
    const tableDragText =
      document.documentElement.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
      ""
    return {
      activePreserveOwner: document.documentElement.getAttribute("data-editor-scroll-preserve-owner"),
      blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
      keyboardBlockSelection: editor?.getAttribute("data-keyboard-block-selection") ?? null,
      selectedCellCount: document.querySelectorAll(".selectedCell").length,
      tableDragText,
    }
  })

const expectNoSelectionResidue = async (page: Page, label: string) => {
  const state = await readSelectionResidueState(page)
  expect(state.blockOverlayCount, `${label}: block selection overlay should not remain`).toBe(0)
  expect(state.keyboardBlockSelection, `${label}: keyboard block selection should not remain`).not.toBe("true")
  expect(state.selectedCellCount, `${label}: selectedCell should not remain`).toBe(0)
  expect(state.activePreserveOwner, `${label}: table scroll preserve should not remain`).not.toBe("table")
  expect(state.tableDragText, `${label}: stale table drag text should not remain`).not.toContain(
    post507FinalTableTargetCell
  )
}

const dragTextRange = async (
  page: Page,
  target: Locator,
  label: string,
  text: string,
  options: {
    endInsetPx?: number
    paced?: boolean
    retryWhenEmpty?: boolean
    startInsetPx?: number
    waitMs?: number
  } = {}
) => {
  const isRetryable = (error: unknown) =>
    error instanceof Error &&
    /not attached to the DOM|Element is not attached|text rect is too small|text range is not hit-testable/i.test(
      error.message
    )

  const runDrag = async () => {
    const measureTextRange = async () => {
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      })
      await page.waitForTimeout(80)
      return target.evaluate(
        (element, { endInsetPx, label, startInsetPx, textToSelect }) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
          while (walker.nextNode()) {
            const textNode = walker.currentNode as Text
            const startOffset = textNode.data.indexOf(textToSelect)
            if (startOffset < 0) continue
            const range = document.createRange()
            range.setStart(textNode, startOffset)
            range.setEnd(textNode, startOffset + textToSelect.length)
            const rects = Array.from(range.getClientRects())
              .filter((candidate) => candidate.width > 2 && candidate.height > 2)
              .sort((a, b) => a.top - b.top || a.left - b.left)
            const startRect = rects[0] ?? range.getBoundingClientRect()
            const endRect = rects[rects.length - 1] ?? startRect
            if (startRect.width <= 2 || startRect.height <= 2 || endRect.width <= 2 || endRect.height <= 2) {
              throw new Error(`${label} text rect is too small`)
            }
            const resolvedStartInsetPx = Math.min(startRect.width / 2, Math.max(2, startInsetPx ?? 2))
            const resolvedEndInsetPx = Math.min(endRect.width / 2, Math.max(2, endInsetPx ?? 2))
            return {
              endX: endRect.right - resolvedEndInsetPx,
              endY: endRect.top + endRect.height / 2,
              startX: startRect.left + resolvedStartInsetPx,
              startY: startRect.top + startRect.height / 2,
            }
          }
          throw new Error(`${label} text node is missing`)
        },
        {
          endInsetPx: options.endInsetPx,
          label,
          startInsetPx: options.startInsetPx,
          textToSelect: text,
        }
      )
    }

    const pointHitsTargetText = (metrics: Awaited<ReturnType<typeof measureTextRange>>) =>
      page.evaluate(
        ({ endX, endY, startX, startY, textToSelect }) => {
          const hitsText = (x: number, y: number) =>
            Boolean(document.elementFromPoint(x, y)?.textContent?.includes(textToSelect))
          return hitsText(startX, startY) && hitsText(endX, endY)
        },
        {
          endX: metrics.endX,
          endY: metrics.endY,
          startX: metrics.startX,
          startY: metrics.startY,
          textToSelect: text,
        }
      )

    let metrics = await measureTextRange()
    const viewport = page.viewportSize()
    for (let attempt = 0; viewport && attempt < 3; attempt += 1) {
      const withinViewport =
        metrics.startY >= 8 &&
        metrics.endY >= 8 &&
        metrics.startY <= viewport.height - 8 &&
        metrics.endY <= viewport.height - 8
      if (withinViewport) break
      await page.mouse.wheel(0, Math.max(metrics.startY, metrics.endY) > viewport.height / 2 ? 360 : -360)
      await page.waitForTimeout(160)
      metrics = await measureTextRange()
    }

    let pointHit = await pointHitsTargetText(metrics)
    for (let attempt = 0; !pointHit && attempt < 4; attempt += 1) {
      await page.waitForTimeout(120 + attempt * 80)
      metrics = await measureTextRange()
      pointHit = await pointHitsTargetText(metrics)
    }
    if (!pointHit) throw new Error(`${label} text range is not hit-testable`)

    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.move(metrics.startX, metrics.startY)
    if (options.paced) await page.waitForTimeout(80)
    await page.mouse.down()
    if (options.paced) {
      for (let index = 1; index <= 28; index += 1) {
        const ratio = index / 28
        await page.mouse.move(
          metrics.startX + (metrics.endX - metrics.startX) * ratio,
          metrics.startY + (metrics.endY - metrics.startY) * ratio
        )
        await page.waitForTimeout(index === 1 ? 16 : 4)
      }
      await page.waitForTimeout(40)
    } else {
      await page.mouse.move(metrics.endX, metrics.endY, { steps: 18 })
    }
    await page.mouse.up()
    await page.waitForTimeout(options.waitMs ?? 720)
    return {
      afterScrollTop: await readScrollTop(page),
      beforeScrollTop,
      selectionText: await readSelectionText(page),
    }
  }

  let result: Awaited<ReturnType<typeof runDrag>> | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await runDrag()
      break
    } catch (error) {
      if (!isRetryable(error) || attempt === 2) throw error
      await page.waitForTimeout(160)
    }
  }
  if (!result) throw new Error(`${label} drag did not start`)

  for (let attempt = 1; options.retryWhenEmpty && !result.selectionText.includes(text) && attempt < 5; attempt += 1) {
    await clearSelectionResidue(page)
    await page.waitForTimeout(120 + attempt * 80)
    try {
      result = await runDrag()
    } catch (error) {
      if (!isRetryable(error) || attempt === 4) throw error
      await page.waitForTimeout(160)
    }
  }

  if (options.retryWhenEmpty && !result.selectionText.includes(text)) {
    const residueState = await readSelectionResidueState(page)
    throw new Error(
      `${label} drag did not select expected text after retries: ${JSON.stringify(
        { residueState, selectionText: result.selectionText },
        null,
        2
      )}`
    )
  }

  return result
}

const readFinalTableOverlayMetrics = (page: Page) =>
  page.evaluate((targetCellText) => {
    const table =
      Array.from(document.querySelectorAll<HTMLElement>("table")).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      ) ?? null
    const block = (table?.closest(".tableWrapper") as HTMLElement | null) ?? table
    const overlay = document.querySelector<HTMLElement>("[data-testid='keyboard-block-selection-overlay']")
    if (!block || !overlay) return null
    const blockRect = block.getBoundingClientRect()
    const overlayRect = overlay.getBoundingClientRect()
    return {
      blockLeft: blockRect.left,
      blockTop: blockRect.top,
      blockWidth: blockRect.width,
      gapLeft: overlayRect.left - blockRect.left,
      gapTop: overlayRect.top - blockRect.top,
      overlayLeft: overlayRect.left,
      overlayTop: overlayRect.top,
      overlayWidth: overlayRect.width,
      scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
    }
  }, post507FinalTableTargetCell)

const expectFinalTableOverlayFollowsScroll = async (page: Page, finalTable: Locator) => {
  await finalTable.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
  })
  await page.waitForTimeout(160)
  await page.keyboard.press("Escape")
  await clearSelectionResidue(page)
  const tableBox = await finalTable.boundingBox()
  if (!tableBox) throw new Error("live 507 final table metrics are missing")

  const blockHandle = page.getByTestId("block-drag-handle")
  for (const point of [
    { x: 24, y: 24 },
    { x: 18, y: 18 },
    { x: 32, y: 28 },
    { x: -24, y: 24 },
    { x: -36, y: 32 },
  ]) {
    const currentTableBox = await finalTable.boundingBox()
    if (!currentTableBox) break
    await page.mouse.move(
      currentTableBox.x + currentTableBox.width / 2,
      currentTableBox.y + currentTableBox.height / 2
    )
    await page.mouse.move(currentTableBox.x + point.x, currentTableBox.y + point.y, { steps: 4 })
    await page.waitForTimeout(80)
    if (await blockHandle.isVisible().catch(() => false)) break
  }
  await expect(blockHandle).toBeVisible()
  await blockHandle.click()
  await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()

  const before = await readFinalTableOverlayMetrics(page)
  if (!before) throw new Error("live 507 final table overlay metrics are missing before scroll")
  expect(Math.abs(before.gapTop + 4)).toBeLessThanOrEqual(8)
  expect(Math.abs(before.overlayWidth - (before.blockWidth + 12))).toBeLessThanOrEqual(8)

  const scrollState = await page.evaluate(() => {
    const scroller = document.scrollingElement ?? document.documentElement
    const scrollTop = scroller.scrollTop || window.scrollY
    const scrollHeight = scroller.scrollHeight || document.documentElement.scrollHeight
    return { maxScrollTop: scrollHeight - window.innerHeight, scrollTop }
  })
  const scrollDeltas =
    scrollState.scrollTop < scrollState.maxScrollTop - 240 ? [180, 360] : [-180, -360]
  let scrolled = false
  for (const scrollDelta of scrollDeltas) {
    const currentTableBox = await finalTable.boundingBox()
    if (currentTableBox) {
      await page.mouse.move(
        currentTableBox.x + Math.min(Math.max(currentTableBox.width / 2, 12), currentTableBox.width - 12),
        currentTableBox.y + Math.min(Math.max(currentTableBox.height / 2, 12), currentTableBox.height - 12)
      )
    }
    await page.mouse.wheel(0, scrollDelta)
    await page.waitForTimeout(160)
    const current = await readFinalTableOverlayMetrics(page)
    if (current && Math.abs(current.scrollTop - before.scrollTop) > 40) {
      scrolled = true
      break
    }
  }
  if (!scrolled) {
    const current = await readFinalTableOverlayMetrics(page)
    throw new Error(
      `live 507 final table overlay scroll did not move: ${JSON.stringify({ before, current, scrollState }, null, 2)}`
    )
  }
  const after = await readFinalTableOverlayMetrics(page)
  if (!after) throw new Error("live 507 final table overlay metrics are missing after scroll")
  expect(Math.abs(after.gapTop - before.gapTop)).toBeLessThanOrEqual(3)
  expect(Math.abs(after.gapLeft - before.gapLeft)).toBeLessThanOrEqual(3)
  expect(Math.abs(after.blockTop - before.blockTop - (after.overlayTop - before.overlayTop))).toBeLessThanOrEqual(3)
  expect(Math.abs(after.blockLeft - before.blockLeft - (after.overlayLeft - before.overlayLeft))).toBeLessThanOrEqual(3)
}

test.describe("editor live visual regression", () => {
  test.skip(!hasUiLoginCredentials, "E2E_ADMIN_EMAIL 또는 E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD가 필요합니다.")

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

    const heading = editor.locator("h1").filter({ hasText: "헤딩 정렬 확인" }).first()
    const paragraph = editor.locator("p").filter({ hasText: "본문 정렬 확인" }).first()
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

    await expect(rowHandle).toBeVisible()
    await expect(columnHandle).toBeVisible()
    await expect(growHandle).toHaveCount(0)
    await expect(structureMenuButton).toHaveCount(0)
    await expect(cellMenuButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)

    await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + 24)

    await expect(cellMenuButton).toBeVisible()
    await expect(rowHandle).toHaveCount(0)
    await expect(columnHandle).toHaveCount(0)
    await expect(growHandle).toHaveCount(0)
    await expect(structureMenuButton).toHaveCount(0)

    await page.mouse.move(tableBox.x + tableBox.width - 6, tableBox.y + 6)

    const cornerHandle = page.getByTestId("table-corner-handle")
    await expect(cornerHandle).toBeVisible()
    await expect(growHandle).toBeVisible()
    await expect(structureMenuButton).toBeVisible()
    await expect(cellMenuButton).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(columnHandle).toHaveCount(0)

    await structureMenuButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu.getByRole("button", { name: "페이지 너비에 맞춤" })).toBeVisible()
    await expect(tableMenu.getByRole("button", { name: "넓은 표" })).toBeVisible()

    await page.keyboard.press("Escape")
    await expect(tableMenu).toBeHidden()
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

  test("실제 /editor/[id]는 말머리 항목을 개별 블록으로 선택/이동하고 Tab 단계 승강을 유지한다", async ({ page }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)

    const title = `실화면 리스트 회귀 ${Date.now()}`
    const postId = await createHiddenEditorPost(page, title, "- 1단계\n- 2단계\n- 3단계")

    try {
      await page.goto(`/editor/${postId}`)
      await page.waitForURL(new RegExp(`/editor/${postId}(\\?|$)`), { timeout: 30000 })
      await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(title)

      const editor = page.getByTestId("block-editor-prosemirror").first()
      const blockSelectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
      const countOwnLabel = (label: string) =>
        page.evaluate((targetLabel) => {
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()

          return Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
          ).filter((item) => readOwnLabel(item) === targetLabel).length
        }, label)

      const thirdItem = editor.locator("li", { hasText: /^3단계$/ }).first()
      await thirdItem.hover()

      const dragHandle = page.getByTestId("block-drag-handle")
      await expect(dragHandle).toBeVisible()
      await dragHandle.click()

      const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
      await expect(selectedDragHandle).toBeVisible()
      await expect(page.getByRole("button", { name: "블록 이동" })).toHaveCount(0)

      const dragGeometry = await page.evaluate(() => {
        const handle = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
          (element) => element.getAttribute("aria-label") === "목록 항목 이동" || element.getAttribute("title") === "목록 항목 이동"
        )
        const firstItem =
          Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")).find((item) =>
            item.textContent?.includes("1단계")
          ) ?? null
        if (!handle || !firstItem) return null

        const handleRect = handle.getBoundingClientRect()
        const firstRect = firstItem.getBoundingClientRect()
        return {
          dragBox: {
            x: handleRect.x,
            y: handleRect.y,
            width: handleRect.width,
            height: handleRect.height,
          },
          firstBox: {
            x: firstRect.x,
            y: firstRect.y,
            width: firstRect.width,
            height: firstRect.height,
          },
        }
      })
      if (!dragGeometry) {
        throw new Error("live editor list item drag geometry is missing")
      }

      const { dragBox, firstBox } = dragGeometry
      await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
      await page.mouse.down()
      await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + Math.max(6, firstBox.height * 0.2), {
        steps: 12,
      })
      await page.mouse.up()

      await expect
        .poll(() =>
          page.evaluate(() => {
            const readOwnLabel = (item: HTMLElement) =>
              Array.from(item.childNodes)
                .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
                .map((node) => node.textContent || "")
                .join(" ")
                .replace(/\s+/g, " ")
                .trim()

            return Array.from(
              document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
            )
              .map((item) => readOwnLabel(item))
              .filter(Boolean)
          })
        )
        .toEqual(["3단계", "1단계", "2단계"])

      await editor.locator("li", { hasText: "2단계" }).first().click()
      await page.keyboard.press("Tab")
      await expect(blockSelectionOverlay).toHaveCount(0)
      await expect.poll(() => countOwnLabel("1단계")).toBe(1)
      await expect.poll(() => countOwnLabel("2단계")).toBe(1)
      await expect.poll(() => countOwnLabel("3단계")).toBe(1)
    } finally {
      await deleteHiddenEditorPost(page, postId)
    }
  })

  test("실제 /editor/507 하단 선택과 table block overlay는 배포본에서 stale table 상태를 남기지 않는다", async ({
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
    await page.waitForURL(/\/editor\/507(\?|$)/, { timeout: 30_000 })
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toBeVisible()

    const buildSha = await page.evaluate(() =>
      document.querySelector('meta[name="aquila-build-sha"]')?.getAttribute("content") ?? null
    )
    if (expectedFrontendCommitSha) {
      expect(buildSha).toBe(expectedFrontendCommitSha)
    }

    const editor = page.getByTestId("block-editor-prosemirror").first()
    await expect(editor.getByText(post507FinalTableTargetCell).first()).toBeVisible({ timeout: 30_000 })

    const finalTable = editor.locator("table", { hasText: post507FinalTableTargetCell }).last()
    const targetCell = finalTable.locator("td", { hasText: post507FinalTableTargetCell }).first()
    await expect(targetCell).toBeVisible()

    const tableDrag = await dragTextRange(
      page,
      targetCell,
      "live /editor/507 final table drag",
      post507FinalTableTargetCell,
      { paced: true, retryWhenEmpty: true, waitMs: 900 }
    )
    expect(tableDrag.selectionText).toContain(post507FinalTableTargetCell)

    await pressSelectAll(page)
    await expect.poll(() => readSelectionText(page)).toContain(post507FinalTableSelectAllNeedle)
    const tableSelectAllText = await readSelectionText(page)
    expect(tableSelectAllText).toContain(post507FinalTableTargetCell)
    expect(tableSelectAllText).not.toContain(post507ListText)

    const lowerBody = editor.locator("p", { hasText: post507LowerBodyText }).first()
    const bodyDrag = await dragTextRange(page, lowerBody, "live /editor/507 lower body drag", post507LowerBodyText, {
      paced: true,
      waitMs: 1_000,
    })
    expect(bodyDrag.selectionText).toContain(post507LowerBodyText)
    expect(bodyDrag.selectionText).not.toContain(post507FinalTableTargetCell)
    expect(bodyDrag.selectionText).not.toContain(post507FinalTableSelectAllNeedle)
    expect(Math.abs(bodyDrag.afterScrollTop - bodyDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoSelectionResidue(page, "live 507 lower body after table select all")

    const codeContent = editor.locator(".aq-code-editor-content", { hasText: post507CodeText }).first()
    const codeDrag = await dragTextRange(page, codeContent, "live /editor/507 code drag", post507CodeText, {
      paced: true,
      retryWhenEmpty: true,
      waitMs: 1_000,
    })
    expect(codeDrag.selectionText).toContain(post507CodeText)
    expect(codeDrag.selectionText).not.toContain(post507FinalTableTargetCell)
    expect(codeDrag.selectionText).not.toContain(post507LowerBodyText)
    expect(Math.abs(codeDrag.afterScrollTop - codeDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoSelectionResidue(page, "live 507 code after body drag")

    await pressSelectAll(page)
    await expect.poll(() => readSelectionText(page)).toContain("return new Token")
    const codeSelectAllText = await readSelectionText(page)
    expect(codeSelectAllText).toContain(post507CodeText)
    expect(codeSelectAllText).not.toContain(post507FinalTableTargetCell)

    const listTextDrag = await dragTextRange(
      page,
      editor.locator("li", { hasText: post507ListText }).first(),
      "live /editor/507 list text drag",
      post507ListText,
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    expect(listTextDrag.selectionText).toContain(post507ListText)
    expect(listTextDrag.selectionText).not.toContain(post507FinalTableTargetCell)
    expect(listTextDrag.selectionText).not.toContain(post507LowerBodyText)
    expect(Math.abs(listTextDrag.afterScrollTop - listTextDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoSelectionResidue(page, "live 507 list text after code select all")

    await expectFinalTableOverlayFollowsScroll(page, finalTable)
  })
})
