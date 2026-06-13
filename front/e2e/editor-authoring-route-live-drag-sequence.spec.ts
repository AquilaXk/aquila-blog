import { expect, test, type Locator, type Page } from "./helpers/authoringPlaywright"
import { expectEditorToContainLoadedText, expectVisibleBox } from "./helpers/editorAuthoringFlow"
import {
  expectPost507FinalTableTextSelected,
  mockEditorRouteWithPost507,
  post507Markdown,
  POST_507_FINAL_TABLE_TARGET_CELL,
} from "./helpers/post507Fixtures"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}
const POST_507_FIRST_LIST_ITEM = "“Stateless가 좋다는데, 왜 좋은 거지?”"
const POST_507_SECOND_LIST_ITEM = "“세션이랑 JWT는 뭐가 다른 거야?”"
const pressSelectAll = async (page: Page) => page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const readSelectionText = (page: Page) =>
  page.evaluate(() => {
    const candidates = [
      window.getSelection()?.toString() ?? "",
      document.documentElement.getAttribute("data-table-drag-selection-text") ??
        "",
      document
        .querySelector("[data-table-drag-selection-text]")
        ?.getAttribute("data-table-drag-selection-text") ?? "",
      document.documentElement.getAttribute("data-code-drag-selection-text") ??
        "",
      document
        .querySelector("[data-code-drag-selection-text]")
        ?.getAttribute("data-code-drag-selection-text") ?? "",
    ].filter((value) => value.trim().length > 0)
    return candidates.sort((left, right) => right.length - left.length)[0] ?? ""
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

const expectNoTextSelectionResidue = async (page: Page, label: string) => {
  const state = await readSelectionResidueState(page)
  expect(state.blockOverlayCount, `${label}: block selection overlay should not remain`).toBe(0)
  expect(state.keyboardBlockSelection, `${label}: keyboard block selection should not remain`).not.toBe("true")
  expect(state.selectedCellCount, `${label}: selectedCell should not remain`).toBe(0)
  expect(state.activePreserveOwner, `${label}: table scroll preserve should not remain`).not.toBe("table")
  expect(state.tableDragText, `${label}: stale table drag text should not remain`).not.toContain(
    POST_507_FINAL_TABLE_TARGET_CELL
  )
}

const clearDragSelectionResidueForRetry = (page: Page) =>
  page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.documentElement.removeAttribute("data-table-drag-selection-text")
    document.documentElement.removeAttribute("data-code-drag-selection-text")
    document
      .querySelectorAll<HTMLElement>(
        "[data-table-drag-selection-text], [data-code-drag-selection-text]"
      )
      .forEach((element) => {
        element.removeAttribute("data-table-drag-selection-text")
        element.removeAttribute("data-code-drag-selection-text")
      })
  })

const hasNestedListChild = (page: Page, parentLabel: string, childLabel: string) =>
  page.evaluate(
    ({ childLabel: expectedChildLabel, parentLabel: expectedParentLabel }) => {
      const readOwnLabel = (item: HTMLElement) =>
        Array.from(item.childNodes)
          .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
          .map((node) => node.textContent || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      return Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
      ).some(
        (item) =>
          readOwnLabel(item) === expectedParentLabel &&
          Array.from(item.querySelectorAll<HTMLElement>("li")).some(
            (child) => readOwnLabel(child) === expectedChildLabel
          )
      )
    },
    { childLabel, parentLabel }
  )

const isDetachedElementError = (error: unknown) =>
  error instanceof Error &&
  /not attached to the DOM|Element is not attached|list paragraph click metrics are missing/i.test(
    error.message
  )

const retryDetachedLocatorAction = async <T>(
  page: Page,
  resolveLocator: () => Locator,
  action: (locator: Locator) => Promise<T>
) => {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const locator = resolveLocator()
    try {
      return await action(locator)
    } catch (error) {
      if (!isDetachedElementError(error)) throw error
      lastError = error
      await page.waitForTimeout(120)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const clickListItemParagraph = async (
  page: Page,
  editor: Locator,
  label: string,
  caretNeedle?: string
) => {
  const resolveParagraph = () => editor.locator("li > p", { hasText: label }).first()
  const clickPoint = await retryDetachedLocatorAction(page, resolveParagraph, async (paragraph) => {
    return paragraph.evaluate((element, needle) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        if (!textNode.data.trim()) continue
        const needleOffset = needle ? textNode.data.indexOf(needle) : -1
        const startOffset =
          needleOffset >= 0 ? needleOffset : textNode.data.search(/\S/)
        const range = document.createRange()
        range.setStart(textNode, Math.max(0, startOffset))
        range.setEnd(
          textNode,
          Math.min(
            textNode.data.length,
            Math.max(0, startOffset) + Math.max(2, needle?.length ?? 0)
          )
        )
        const rect = range.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          const elementRect = element.getBoundingClientRect()
          const absoluteX = rect.left + rect.width / 2
          const absoluteY = rect.top + rect.height / 2
          return {
            expectedMaxOffset:
              needleOffset >= 0 ? needleOffset + Math.max(needle?.length ?? 0, 1) + 2 : null,
            expectedMinOffset: needleOffset >= 0 ? Math.max(0, needleOffset - 2) : null,
            relativeX: absoluteX - elementRect.left,
            relativeY: absoluteY - elementRect.top,
          }
        }
      }
      const rect = element.getBoundingClientRect()
      return {
        expectedMaxOffset: null,
        expectedMinOffset: null,
        relativeX: Math.min(rect.width / 2, 120),
        relativeY: Math.min(rect.height / 2, 14),
      }
    }, caretNeedle ?? null)
  })
  await retryDetachedLocatorAction(page, resolveParagraph, async (paragraph) => {
    const clickMetrics = await paragraph.evaluate((element, point) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return null
      return {
        x: rect.left + Math.min(Math.max(point.relativeX, 1), Math.max(rect.width - 1, 1)),
        y: rect.top + Math.min(Math.max(point.relativeY, 1), Math.max(rect.height - 1, 1)),
      }
    }, clickPoint)
    if (!clickMetrics) throw new Error("list paragraph click metrics are missing")
    await expect
      .poll(() =>
        page.evaluate(
          ({ expectedLabel, x, y }) =>
            document.elementFromPoint(x, y)?.textContent?.includes(expectedLabel) ??
            false,
          { expectedLabel: label, x: clickMetrics.x, y: clickMetrics.y }
        )
      )
      .toBe(true)
    await page.mouse.click(clickMetrics.x, clickMetrics.y)
  })
  const readCaretState = () =>
    resolveParagraph().evaluate(
      (element, point) => {
        const rect = element.getBoundingClientRect()
        const selection = window.getSelection()
        const anchorNode = selection?.anchorNode ?? null
        const anchorElement =
          anchorNode instanceof Element
            ? anchorNode
            : anchorNode instanceof Node
            ? anchorNode.parentElement
            : null
        const pointElement = document.elementFromPoint(
          rect.left + point.relativeX,
          rect.top + point.relativeY
        )
        const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
        const anchorOffset =
          anchorNode instanceof Text ? selection?.anchorOffset ?? null : null
        return {
          activeElement:
            document.activeElement instanceof HTMLElement
              ? {
                  ariaLabel: document.activeElement.getAttribute("aria-label"),
                  className: document.activeElement.className,
                  role: document.activeElement.getAttribute("role"),
                  tagName: document.activeElement.tagName,
                  testId: document.activeElement.getAttribute("data-testid"),
                }
              : null,
          anchorOffset,
          anchorElementText: anchorElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
          anchorInsideParagraph: Boolean(anchorNode && element.contains(anchorNode)),
          anchorNodeName: anchorNode?.nodeName ?? null,
          blockOverlayCount: document.querySelectorAll("[data-testid='keyboard-block-selection-overlay']").length,
          editorKeyboardBlockSelection: editor?.getAttribute("data-keyboard-block-selection") ?? null,
          pointElementText: pointElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
          pointElementTagName: pointElement?.tagName ?? null,
          preserveOwner: document.documentElement.getAttribute("data-editor-scroll-preserve-owner"),
          rangeCount: selection?.rangeCount ?? 0,
          selectedCellCount: document.querySelectorAll(".selectedCell").length,
          selectionText: selection?.toString() ?? "",
        }
      },
      clickPoint
    )
  try {
    await expect.poll(async () => (await readCaretState()).anchorInsideParagraph).toBe(true)
    if (
      clickPoint.expectedMinOffset !== null &&
      clickPoint.expectedMaxOffset !== null
    ) {
      await expect
        .poll(async () => {
          const state = await readCaretState()
          return (
            state.anchorOffset !== null &&
            state.anchorOffset >= clickPoint.expectedMinOffset! &&
            state.anchorOffset <= clickPoint.expectedMaxOffset!
          )
        })
        .toBe(true)
    }
  } catch (error) {
    const state = await readCaretState()
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(state, null, 2)}`)
  }
}

const readPost507FinalTableBlockOverlayMetrics = (page: Page) =>
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
      blockBottom: blockRect.bottom,
      blockLeft: blockRect.left,
      blockTop: blockRect.top,
      blockWidth: blockRect.width,
      gapLeft: overlayRect.left - blockRect.left,
      gapTop: overlayRect.top - blockRect.top,
      overlayBottom: overlayRect.bottom,
      overlayLeft: overlayRect.left,
      overlayTop: overlayRect.top,
      overlayWidth: overlayRect.width,
      scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
    }
  }, POST_507_FINAL_TABLE_TARGET_CELL)

const expectPost507FinalTableBlockOverlayFollowsScroll = async (
  page: Page,
  finalTable: Locator
) => {
  await finalTable.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
  })
  await page.waitForTimeout(160)
  await page.keyboard.press("Escape")
  await page.evaluate(() => {
    window.getSelection()?.removeAllRanges()
    document.dispatchEvent(new Event("selectionchange"))
  })
  await page.mouse.wheel(0, 1)
  await page.waitForTimeout(120)
  await finalTable.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
  })
  await page.waitForTimeout(160)
  const tableBox = await finalTable.boundingBox()
  if (!tableBox) throw new Error("post 507 final table block metrics are missing")

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
    await page.mouse.move(currentTableBox.x + currentTableBox.width / 2, currentTableBox.y + currentTableBox.height / 2)
    await page.mouse.move(currentTableBox.x + point.x, currentTableBox.y + point.y, { steps: 4 })
    await page.waitForTimeout(80)
    if (await blockHandle.isVisible().catch(() => false)) break
  }
  await expect(blockHandle).toBeVisible()
  await blockHandle.click()
  await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()

  const before = await readPost507FinalTableBlockOverlayMetrics(page)
  if (!before) throw new Error("post 507 final table overlay metrics are missing before scroll")
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
    const current = await readPost507FinalTableBlockOverlayMetrics(page)
    if (current && Math.abs(current.scrollTop - before.scrollTop) > 40) {
      scrolled = true
      break
    }
  }
  if (!scrolled) {
    const current = await readPost507FinalTableBlockOverlayMetrics(page)
    throw new Error(
      `post 507 final table overlay scroll did not move: ${JSON.stringify(
        { before, current, scrollState },
        null,
        2
      )}`
    )
  }
  const after = await readPost507FinalTableBlockOverlayMetrics(page)
  if (!after) throw new Error("post 507 final table overlay metrics are missing after scroll")
  expect(Math.abs(after.gapTop - before.gapTop)).toBeLessThanOrEqual(3)
  expect(Math.abs(after.gapLeft - before.gapLeft)).toBeLessThanOrEqual(3)
  expect(Math.abs(after.blockTop - before.blockTop - (after.overlayTop - before.overlayTop))).toBeLessThanOrEqual(3)
  expect(Math.abs(after.blockLeft - before.blockLeft - (after.overlayLeft - before.overlayLeft))).toBeLessThanOrEqual(3)
}

const readClipboardText = (page: Page) =>
  page.evaluate(async () => navigator.clipboard?.readText?.() ?? "")

const writeClipboardText = (page: Page, text: string) =>
  page.evaluate(async (nextText) => {
    await navigator.clipboard?.writeText?.(nextText)
  }, text)

const dragLocatorText = async (
  page: Page,
  target: Locator,
  label: string,
  options: { endX?: number; startX?: number; y?: number; waitMs?: number } = {}
) => {
  await target.waitFor({ state: "attached", timeout: 5_000 })
  await target.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" })
  })
  const box = await target.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { height: rect.height, width: rect.width, x: rect.left, y: rect.top }
  })
  if (box.width <= 0 || box.height <= 0) throw new Error(`${label} metrics are missing`)
  const y = options.y ?? Math.min(box.height / 2, 18)
  const startX = options.startX ?? 8
  const endX = options.endX ?? Math.min(box.width - 8, 360)
  const beforeScrollTop = await readScrollTop(page)

  await target.hover({ position: { x: startX, y } })
  await page.mouse.down()
  await target.hover({ position: { x: endX, y } })
  await page.mouse.up()
  await page.waitForTimeout(options.waitMs ?? 720)

  return { beforeScrollTop, afterScrollTop: await readScrollTop(page), selectionText: await readSelectionText(page) }
}

const dragLocatorTextRange = async (
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
  const isDetachedError = (error: unknown) =>
    error instanceof Error &&
    /not attached to the DOM|Element is not attached|text rect is too small|text range is not hit-testable/i.test(error.message)
  const runDrag = async () => {
    const measureTextRange = async () => {
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
      })
      await page.waitForTimeout(80)
      return target.evaluate((element, { endInsetPx, label, startInsetPx, textToSelect }) => {
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
          if (startRect.width <= 2 || startRect.height <= 2 || endRect.width <= 2 || endRect.height <= 2) throw new Error(`${label} text rect is too small`)
          const resolvedStartInsetPx = Math.min(
            startRect.width / 2,
            Math.max(2, startInsetPx ?? 2)
          )
          const resolvedEndInsetPx = Math.min(
            endRect.width / 2,
            Math.max(2, endInsetPx ?? 2)
          )
          return {
            endX: endRect.right - resolvedEndInsetPx,
            endY: endRect.top + endRect.height / 2,
            startX: startRect.left + resolvedStartInsetPx,
            startY: startRect.top + startRect.height / 2,
          }
        }
        throw new Error(`${label} text node is missing`)
      }, {
        endInsetPx: options.endInsetPx,
        label,
        startInsetPx: options.startInsetPx,
        textToSelect: text,
      })
    }
    const pointHitsTargetText = (metrics: Awaited<ReturnType<typeof measureTextRange>>) =>
      page.evaluate(
        ({ endX, endY, startX, startY, textToSelect }) => {
          const isExpectedPoint = (x: number, y: number) => {
            const element = document.elementFromPoint(x, y)
            return Boolean(element?.textContent?.includes(textToSelect))
          }
          return isExpectedPoint(startX, startY) && isExpectedPoint(endX, endY)
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
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const viewport = page.viewportSize()
      if (!viewport || (metrics.startY >= 8 && metrics.endY >= 8 && metrics.startY <= viewport.height - 8 && metrics.endY <= viewport.height - 8)) break
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
    const viewport = page.viewportSize()
    if (viewport && (metrics.startY < 8 || metrics.endY < 8 || metrics.startY > viewport.height - 8 || metrics.endY > viewport.height - 8)) {
      throw new Error(`${label} text rect is outside viewport: ${JSON.stringify(metrics)}`)
    }
    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.move(metrics.startX, metrics.startY)
    if (options.paced) await page.waitForTimeout(80)
    await page.mouse.down()
    if (options.paced) {
      for (let index = 1; index <= 28; index += 1) {
        const ratio = index / 28
        await page.mouse.move(metrics.startX + (metrics.endX - metrics.startX) * ratio, metrics.startY + (metrics.endY - metrics.startY) * ratio)
        await page.waitForTimeout(index === 1 ? 16 : 4)
      }
      await page.waitForTimeout(40)
    } else {
      await page.mouse.move(metrics.endX, metrics.endY, { steps: 18 })
    }
    await page.mouse.up()
    await page.waitForTimeout(options.waitMs ?? 720)
    const afterScrollTop = await readScrollTop(page)
    const selectionText = await readSelectionText(page)
    return { beforeScrollTop, afterScrollTop, selectionText }
  }

  let result: Awaited<ReturnType<typeof runDrag>> | null = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      result = await runDrag()
      break
    } catch (error) {
      if (!isDetachedError(error) || attempt === 2) throw error
      await page.waitForTimeout(160)
    }
  }
  if (!result) throw new Error(`${label} drag did not start`)
  for (let attempt = 1; options.retryWhenEmpty && !result.selectionText.includes(text) && attempt < 5; attempt += 1) {
    await clearDragSelectionResidueForRetry(page)
    await page.waitForTimeout(120 + attempt * 80)
    try {
      result = await runDrag()
    } catch (error) {
      if (!isDetachedError(error) || attempt === 4) throw error
      await page.waitForTimeout(160)
      continue
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

const filler = (label: string, count: number) =>
  Array.from({ length: count }, (_, index) => [
    `${label} ${index + 1}: 인증 흐름을 설명하는 긴 문단입니다.`,
    "",
  ]).flat()

test.describe("editor authoring route live drag sequence", () => {
  test("body selection 뒤 table/code drag는 이전 selection anchor와 scroll 위치로 튀지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const liveDragContent = [
      "---",
      'tags: ["Stateless", "인증", "JWT", "Refresh Token"]',
      "---",
      "",
      "## 시작하며",
      "",
      "- “Stateless가 좋다는데, 왜 좋은 거지?”",
      "- “세션이랑 JWT는 뭐가 다른 거야?”",
      "",
      ...filler("table 이전 본문", 72),
      "",
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,220]} -->',
      "| **토큰** | **역할** | **비고** |",
      "| --- | --- | --- |",
      "| Access Token | API 인증 | 요청마다 전송 |",
      "| Refresh Token | Access 재발급 | 탈취 위험 높은 자원 |",
      "| Id Token | 사용자 식별 | OpenID 표준 토큰 |",
      "| Session Token | 상태 저장 | 서버 세션 연동 |",
      "| Device Token | 기기 바인딩 | 기기별 추적 |",
      "| Admin Token | 운영자 권한 | 권한 구간 제한 |",
      "",
      "- Access Token 은 요청마다 서버로 보내어지기 때문에 탈취위험이 매우 높다",
      "",
      ...filler("code 이전 본문", 24),
      "",
      "```java",
      "public Token login(User user) {",
      "",
      "    String access = createAccessToken(user);   // 짧게",
      "    String refresh = createRefreshToken(user); // 길게",
      "",
      "    saveRefreshToken(user.getId(), refresh);",
      "",
      "    return new Token(access, refresh);",
      "}",
      "```",
      "",
      "## 재발급",
      "",
      "```java",
      "public String reissue(String refreshToken) {",
      "",
      "    if (!isValid(refreshToken)) {",
      "        throw new UnauthorizedException();",
      "    }",
      "",
      "    return createAccessToken(getUser(refreshToken));",
      "}",
      "```",
      "",
      "## 운영에서 가장 먼저 터지는 문제들",
      "",
      "- 짧은 TTL",
      "- Refresh 관리",
      "",
      ...filler("code 이후 본문", 8),
    ].join("\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/997", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 997,
          version: 12,
          title: "live drag sequence 글",
          content: liveDragContent,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/997")
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new URL(page.url()).origin,
    })

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("live drag sequence 글")
    await expectEditorToContainLoadedText(editor, "createAccessToken")

    const bodyDrag = await dragLocatorText(
      page,
      editor.locator("li", { hasText: "Stateless가 좋다는데" }).first(),
      "stale body selection",
      { waitMs: 720 }
    )
    expect(bodyDrag.selectionText).toContain("Stateless가 좋다는데")
    expect(Math.abs(bodyDrag.afterScrollTop - bodyDrag.beforeScrollTop)).toBeLessThanOrEqual(24)

    const accessTokenCell = editor.getByRole("cell", { name: "Access Token", exact: true })
    const accessTokenBox = await accessTokenCell.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      const y = rect.top + rect.height / 2
      const startX = rect.left + Math.min(rect.width - 18, 24)
      return {
        endX: rect.left + Math.min(rect.width - 8, 128),
        startX,
        y,
      }
    })
    await accessTokenCell.evaluate((element, metrics) => {
      const clientX = metrics.startX + 2
      const clientY = metrics.y
      const selection = window.getSelection()
      selection?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection?.addRange(range)
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY }))
    }, accessTokenBox)
    expect(await readSelectionText(page)).toContain("Access Token")
    await accessTokenCell.evaluate((element, metrics) => {
      const clientX = metrics.startX + 2
      const clientY = metrics.y
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY }))
    }, accessTokenBox)
    await page.evaluate(() => {
      ;(window as typeof window & { __qaTableDragEvents?: unknown[] }).__qaTableDragEvents = []
      const record = (event: MouseEvent | PointerEvent) => {
        const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest("th, td")
        const stack = document.elementsFromPoint(event.clientX, event.clientY).map((element) => ({
          tagName: element.tagName,
          testId: element.getAttribute("data-testid"),
          affordance: element.getAttribute("data-table-affordance"),
          cellText: element.closest("th, td")?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        }))
        ;(window as typeof window & { __qaTableDragEvents?: unknown[] }).__qaTableDragEvents?.push({
          type: event.type,
          x: event.clientX,
          y: event.clientY,
          cellText: cell?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          stack,
        })
      }
      document.addEventListener("pointerdown", record, { capture: true })
      document.addEventListener("pointermove", record, { capture: true })
      document.addEventListener("pointerup", record, { capture: true })
      document.addEventListener("mousedown", record, { capture: true })
      document.addEventListener("mousemove", record, { capture: true })
      document.addEventListener("mouseup", record, { capture: true })
      window.addEventListener("pointermove", record, { capture: true })
      window.addEventListener("mousemove", record, { capture: true })
    })
    const beforeTableDragScrollTop = await readScrollTop(page)
    await page.mouse.move(accessTokenBox.startX, accessTokenBox.y)
    await page.mouse.down()
    await page.mouse.move(accessTokenBox.endX, accessTokenBox.y)
    await page.mouse.up()
    await page.waitForTimeout(850)
    const tableDrag = {
      beforeScrollTop: beforeTableDragScrollTop,
      afterScrollTop: await readScrollTop(page),
      selectionText: await readSelectionText(page),
    }
    const tableSelectionText = await readSelectionText(page)
    if (!tableSelectionText.includes("Access Token") || tableSelectionText.includes("API 인증")) {
      const diagnostics = await page.evaluate(() => {
        const selection = window.getSelection()
        const describeNode = (node: Node | null | undefined) => {
          const element = node instanceof Element ? node : node?.parentElement ?? null
          const cell = element?.closest("th, td")
          return {
            tagName: element?.tagName ?? null,
            text: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? null,
            cellText: cell?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          }
        }
        return {
          selectionText: selection?.toString() ?? "",
          anchor: describeNode(selection?.anchorNode),
          focus: describeNode(selection?.focusNode),
          persisted: Array.from(document.querySelectorAll("[data-table-drag-selection-text]")).map((element) => ({
            text: element.textContent?.replace(/\s+/g, " ").trim(),
            attr: element.getAttribute("data-table-drag-selection-text"),
          })),
          events: (window as typeof window & { __qaTableDragEvents?: unknown[] }).__qaTableDragEvents ?? [],
        }
      })
      throw new Error(`table drag escaped started cell: ${JSON.stringify(diagnostics)}`)
    }
    expect(tableDrag.afterScrollTop).toBeLessThanOrEqual(tableDrag.beforeScrollTop + 24)
    expect(tableDrag.afterScrollTop).toBeGreaterThanOrEqual(tableDrag.beforeScrollTop - 24)

    const codeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(user)" }).first()
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(60))
    const immediateCodeMetrics = await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(style.lineHeight || "22") || 22
      const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0
      return {
        y: Math.min(rect.height - 8, paddingTop + lineHeight * 2.5),
      }
    })
    await expect.poll(async () => {
      const box = await codeContent.boundingBox()
      const viewportHeight = page.viewportSize()?.height ?? 720
      return Boolean(box && box.y >= 0 && box.y <= viewportHeight - 24)
    }).toBe(true)
    const immediateCodeBox = await codeContent.boundingBox()
    if (!immediateCodeBox) throw new Error("immediate code metrics are missing")
    await page.mouse.move(immediateCodeBox.x + 80, immediateCodeBox.y + immediateCodeMetrics.y)
    await page.mouse.click(immediateCodeBox.x + 80, immediateCodeBox.y + immediateCodeMetrics.y)
    await page.waitForTimeout(40)
    const beforeImmediateCodeSelectAll = await readScrollTop(page)
    await pressSelectAll(page)
    try {
      await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const activeElement = document.activeElement instanceof Element ? document.activeElement : null
        const viewportCenterY = window.innerHeight / 2
        const visibleCodeRoots = Array.from(document.querySelectorAll<HTMLElement>(".aq-code-shell")).map((shell) => {
          const rect = shell.getBoundingClientRect()
          const root = shell.querySelector<HTMLElement>(".aq-code-editor-content")
          const centerPenalty = rect.top <= viewportCenterY && rect.bottom >= viewportCenterY ? -1_000 : 0
          return {
            attr: shell.getAttribute("data-code-drag-selection-text"),
            rect: { bottom: rect.bottom, top: rect.top },
            score: Math.abs((rect.top + rect.bottom) / 2 - viewportCenterY) + centerPenalty,
            text: root?.textContent?.replace(/\s+/g, " ").trim().slice(0, 160) ?? "",
          }
        })
        return {
          activeElementClass: String(activeElement?.className ?? ""),
          hasTableDragSelectionText: document.documentElement.hasAttribute("data-table-drag-selection-text"),
          selectionText: window.getSelection()?.toString() ?? "",
          visibleCodeRoots,
        }
      })
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        [
          `immediate code select-all did not persist code text: ${JSON.stringify(diagnostics)}`,
          detail,
        ].join("\n"),
      )
    }
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeImmediateCodeSelectAll + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeImmediateCodeSelectAll - 24)
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(40))

    const followUpBody = editor.locator("li", { hasText: "Access Token 은 요청마다" }).first()
    await followUpBody.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    const followUpBox = await followUpBody.boundingBox()
    if (!followUpBox) throw new Error("follow-up body metrics are missing")
    const beforeFollowUpClick = await readScrollTop(page)
    await page.mouse.click(followUpBox.x + Math.min(followUpBox.width / 2, 220), followUpBox.y + 18)
    await page.waitForTimeout(2_600)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeFollowUpClick + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeFollowUpClick - 24)

    const codeDragMetrics = await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(style.lineHeight || "22") || 22
      const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0
      return {
        y: Math.min(rect.height - 8, paddingTop + lineHeight * 2.5),
        endX: Math.min(rect.width - 8, 390),
      }
    })
    const codeDragDefaultAllowed = await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 80
      const clientY = rect.top + metrics.y
      const pointerDefaultAllowed = element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX,
          clientY,
          pointerType: "mouse",
        }),
      )
      const mouseDefaultAllowed = element.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX,
          clientY,
        }),
      )
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, pointerType: "mouse" }))
      window.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY }))
      return { mouseDefaultAllowed, pointerDefaultAllowed }
    }, codeDragMetrics)
    expect(codeDragDefaultAllowed.pointerDefaultAllowed).toBe(true)
    expect(codeDragDefaultAllowed.mouseDefaultAllowed).toBe(true)
    const codeShell = editor.locator(".aq-code-shell", { hasText: "createAccessToken(user)" }).first()
    const shellDispatchDiagnostics = await codeShell.evaluate(async (shell, metrics) => {
      const contentRoot = shell.querySelector<HTMLElement>(".aq-code-editor-content")
      if (!contentRoot) throw new Error("code shell content root is missing")
      const rect = contentRoot.getBoundingClientRect()
      const startX = rect.left + 80
      const endX = rect.left + metrics.endX
      const clientY = rect.top + metrics.y
      const events: Array<{ type: string; selection: string; dataset: string | null }> = []
      const record = (event: Event) => {
        events.push({
          type: event.type,
          selection: window.getSelection()?.toString() ?? "",
          dataset: shell.getAttribute("data-code-drag-selection-text"),
        })
      }
      for (const type of ["pointerdown", "pointermove", "pointerup", "selectionchange"] as const) {
        document.addEventListener(type, record, { capture: true })
      }
      window.getSelection()?.removeAllRanges()
      shell.removeAttribute("data-code-drag-selection-text")
      shell.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: startX,
          clientY,
          pointerType: "mouse",
        }),
      )
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: endX,
          clientY,
          pointerType: "mouse",
        }),
      )
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          buttons: 0,
          cancelable: true,
          clientX: endX,
          clientY,
          pointerType: "mouse",
        }),
      )
      await new Promise((resolve) => setTimeout(resolve, 220))
      for (const type of ["pointerdown", "pointermove", "pointerup", "selectionchange"] as const) {
        document.removeEventListener(type, record, true)
      }
      return {
        events,
        selection: window.getSelection()?.toString() ?? "",
        dataset: shell.getAttribute("data-code-drag-selection-text"),
        text: contentRoot.textContent,
      }
    }, codeDragMetrics)
    const shellDispatchSelectionTimeline = [
      shellDispatchDiagnostics.selection,
      shellDispatchDiagnostics.dataset,
      ...shellDispatchDiagnostics.events.flatMap((event) => [event.selection, event.dataset]),
    ].filter(Boolean).join("\n")
    if (!shellDispatchSelectionTimeline.includes("createAccessToken")) {
      throw new Error(`code shell drag did not select code text: ${JSON.stringify(shellDispatchDiagnostics)}`)
    }
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(40))
    await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    await page.waitForTimeout(120)
    const beforeCodeSelectAll = await readScrollTop(page)
    await codeContent.click({ position: { x: 80, y: 28 } })
    await page.mouse.wheel(0, 260)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThan(beforeCodeSelectAll + 120)
    const afterUserCodeScroll = await readScrollTop(page)
    await pressSelectAll(page)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(afterUserCodeScroll + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(afterUserCodeScroll - 24)
    const codeClickBox = await codeContent.boundingBox()
    if (!codeClickBox) throw new Error("code click metrics are missing")
    await page.mouse.click(codeClickBox.x + 80, codeClickBox.y + codeDragMetrics.y)
    await page.waitForTimeout(120)
    await expect.poll(() => readSelectionText(page)).toBe("")
    await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const startX = rect.left + 80
      const clientY = rect.top + metrics.y
      const selection = window.getSelection()
      selection?.removeAllRanges()
      element.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: startX,
          clientY,
          pointerType: "mouse",
        }),
      )
      element.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          button: 0,
          buttons: 1,
          cancelable: true,
          clientX: rect.left + metrics.endX,
          clientY,
          pointerType: "mouse",
        }),
      )
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          button: 0,
          buttons: 0,
          cancelable: true,
          clientX: rect.left + metrics.endX,
          clientY,
          pointerType: "mouse",
        }),
      )
    }, codeDragMetrics)
    const freshCodeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(user)" }).first()
    await freshCodeContent.waitFor({ state: "visible", timeout: 5_000 })
    const codeDragStartBox = await expectVisibleBox(freshCodeContent, "code drag start metrics are missing")
    await page.evaluate(() => {
      ;(window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents = []
      const record = (event: Event) => {
        const pointerEvent = event instanceof MouseEvent || event instanceof PointerEvent ? event : null
          const target =
            event.target instanceof Element
              ? event.target
              : event.target instanceof Node
                ? event.target.parentElement
                : null
        const selection = window.getSelection()
        ;(window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents?.push({
          type: event.type,
          buttons: pointerEvent?.buttons,
          button: pointerEvent?.button,
          x: pointerEvent?.clientX,
          y: pointerEvent?.clientY,
          targetClass: String(target?.className ?? ""),
          selectionText: selection?.toString() ?? "",
          persisted: Array.from(
            document.querySelectorAll("[data-code-drag-selection-text]"),
          ).map((element) => element.getAttribute("data-code-drag-selection-text")),
        })
        if (((window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents?.length ?? 0) > 40) {
          ;(window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents?.shift()
        }
      }
      for (const type of ["pointerdown", "mousedown", "selectionchange"] as const) {
        document.addEventListener(type, record, { capture: true, once: type !== "selectionchange" })
      }
    })
    await page.mouse.move(codeDragStartBox.x + 80, codeDragStartBox.y + codeDragMetrics.y)
    await page.mouse.down()
    await page.waitForTimeout(120)
    try {
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document
                .querySelector("[data-code-drag-selection-text]")
                ?.getAttribute("data-code-drag-selection-text") ?? "",
          ),
        )
        .toBe("")
    } catch (error) {
      const diagnostics = await page.evaluate(() => ({
        events: (window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents ?? [],
        persisted: Array.from(document.querySelectorAll("[data-code-drag-selection-text]")).map((element) => ({
          className: String(element.className),
          text: element.getAttribute("data-code-drag-selection-text")?.slice(0, 120) ?? "",
        })),
      }))
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        [
          `code drag pointerdown did not clear stale selection: ${JSON.stringify(diagnostics)}`,
          detail,
        ].join("\n"),
      )
    }
    await page.mouse.up()
    await freshCodeContent.evaluate((element) => {
      window.getSelection()?.removeAllRanges()
      element.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
    })
    const lowerBodyAnchor = editor.getByText("짧은 TTL", { exact: true }).first()
    await lowerBodyAnchor.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    const lowerBodyBox = await lowerBodyAnchor.boundingBox()
    if (!lowerBodyBox) throw new Error("lower body anchor metrics are missing")
    await page.mouse.click(lowerBodyBox.x + Math.min(lowerBodyBox.width / 2, 96), lowerBodyBox.y + 12)
    await page.waitForTimeout(40)
    await lowerBodyAnchor.evaluate((element) => {
      const selection = window.getSelection()
      const textNode = Array.from(element.childNodes).find((node) => node.nodeType === Node.TEXT_NODE)
      if (!selection || !textNode?.textContent) throw new Error("lower body anchor text node is missing")
      const start = textNode.textContent.indexOf("TTL")
      if (start < 0) throw new Error("TTL text is missing")
      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + "TTL".length)
      selection.removeAllRanges()
      selection.addRange(range)
    })
    try {
      await expect.poll(() => readSelectionText(page)).toContain("TTL")
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const selection = window.getSelection()
        const describeNode = (node: Node | null | undefined) => {
          const element = node instanceof Element ? node : node?.parentElement ?? null
          return {
            className: String(element?.className ?? ""),
            codeText: element?.closest(".aq-code-shell")?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
            text: element?.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) ?? null,
          }
        }
        return {
          selectionText: selection?.toString() ?? "",
          anchor: describeNode(selection?.anchorNode),
          focus: describeNode(selection?.focusNode),
          codePersisted: Array.from(
            document.querySelectorAll("[data-code-drag-selection-text]"),
          ).map((element) => element.getAttribute("data-code-drag-selection-text")),
          tablePersisted: Array.from(
            document.querySelectorAll("[data-table-drag-selection-text]"),
          ).map((element) => element.getAttribute("data-table-drag-selection-text")),
          activeElement: String(document.activeElement?.className ?? ""),
        }
      })
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(
        [
          `lower body selection restored stale code text: ${JSON.stringify(diagnostics)}`,
          detail,
        ].join("\n"),
      )
    }
    const reissueCodeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(getUser(refreshToken))" }).first()
    await reissueCodeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    await page.waitForTimeout(120)
    const reissueClickY = await reissueCodeContent.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      const lineHeight = Number.parseFloat(style.lineHeight || "22") || 22
      const paddingTop = Number.parseFloat(style.paddingTop || "0") || 0
      return Math.min(rect.height - 8, paddingTop + lineHeight * 5.5)
    })
    const beforeLowerCodeClick = await readScrollTop(page)
    const reissueCodeBox = await reissueCodeContent.boundingBox()
    if (!reissueCodeBox) throw new Error("lower code click metrics are missing")
    await page.mouse.click(reissueCodeBox.x + 80, reissueCodeBox.y + reissueClickY)
    await page.waitForTimeout(2_600)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeLowerCodeClick + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeLowerCodeClick - 24)
    await pressSelectAll(page)
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken(getUser")
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeLowerCodeClick + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeLowerCodeClick - 24)
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      document.querySelectorAll("[data-code-drag-selection-text]").forEach((element) => {
        element.removeAttribute("data-code-drag-selection-text")
        element.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
      })
    })
    await lowerBodyAnchor.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
    })
    await page.waitForTimeout(120)
    const beforePostCodeBodyClick = await readScrollTop(page)
    const postCodeLowerBodyBox = await lowerBodyAnchor.boundingBox()
    if (!postCodeLowerBodyBox) throw new Error("post-code lower body metrics are missing")
    await page.mouse.move(
      postCodeLowerBodyBox.x + Math.min(postCodeLowerBodyBox.width / 2, 96),
      postCodeLowerBodyBox.y + 12
    )
    await page.mouse.down()
    const afterSelectionChangeBodyClickScroll = await page.evaluate(() => {
      document.dispatchEvent(new Event("selectionchange"))
      window.scrollBy(0, 476)
      return document.scrollingElement?.scrollTop ?? window.scrollY
    })
    expect(afterSelectionChangeBodyClickScroll).toBeGreaterThan(beforePostCodeBodyClick + 120)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforePostCodeBodyClick + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforePostCodeBodyClick - 24)
    await page.mouse.up()
    await page.waitForTimeout(1_000)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforePostCodeBodyClick + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforePostCodeBodyClick - 24)
    const postCodeCurrentLowerBodyBox = await lowerBodyAnchor.boundingBox()
    if (!postCodeCurrentLowerBodyBox) throw new Error("post-code current lower body metrics are missing")
    await page.mouse.move(postCodeCurrentLowerBodyBox.x + 8, postCodeCurrentLowerBodyBox.y + postCodeCurrentLowerBodyBox.height / 2)
    const beforePostCodeBodyDrag = await readScrollTop(page)
    await page.mouse.down()
    await page.mouse.move(
      postCodeCurrentLowerBodyBox.x + Math.max(24, postCodeCurrentLowerBodyBox.width - 8),
      postCodeCurrentLowerBodyBox.y + postCodeCurrentLowerBodyBox.height / 2,
      { steps: 12 }
    )
    await page.mouse.up()
    await page.waitForTimeout(720)
    const postCodeBodySelection = await readSelectionText(page)
    expect(postCodeBodySelection).toContain("TTL")
    expect(postCodeBodySelection).not.toContain("createAccessToken")
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforePostCodeBodyDrag + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforePostCodeBodyDrag - 24)
    await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(40))
    await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      element.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
    })
    const codeDrag = await dragLocatorText(page, codeContent, "token login code drag", {
      endX: codeDragMetrics.endX,
      startX: 80,
      y: codeDragMetrics.y,
      waitMs: 1_600,
    })
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    await writeClipboardText(page, "__AQUILA_SENTINEL__")
    await page.keyboard.press(process.platform === "darwin" ? "Meta+C" : "Control+C")
    await expect.poll(() => readClipboardText(page)).toContain("createAccessToken")
    expect(codeDrag.selectionText).not.toContain("TTL")
    expect(codeDrag.selectionText).not.toContain("Access Token")
    expect(codeDrag.afterScrollTop).toBeLessThanOrEqual(codeDrag.beforeScrollTop + 24)
    expect(codeDrag.afterScrollTop).toBeGreaterThanOrEqual(codeDrag.beforeScrollTop - 24)
  })

  test("live 507 형태의 하단 table/body drag는 focus reveal scroll로 튀지 않고 선택을 남긴다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })

    const live507TableContent = post507Markdown

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/998", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 998,
          version: 4,
          title: "live 507 table body workflow 글",
          content: live507TableContent,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/998")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "live 507 table body workflow 글"
    )
    await expectEditorToContainLoadedText(editor, "Stateless 의미")

    const targetCell = editor.locator("td", { hasText: "Stateless 의미" }).first()
    await page.evaluate(() => {
      ;(window as typeof window & { __qaLive507TableEvents?: unknown[] }).__qaLive507TableEvents = []
      const record = (event: MouseEvent | PointerEvent) => {
        const pointElements = document.elementsFromPoint(event.clientX, event.clientY)
        const cell = pointElements.find((element) => Boolean(element.closest("th, td")))?.closest("th, td")
        ;(window as typeof window & { __qaLive507TableEvents?: unknown[] }).__qaLive507TableEvents?.push({
          type: event.type,
          buttons: "buttons" in event ? event.buttons : 0,
          x: Math.round(event.clientX),
          y: Math.round(event.clientY),
          cellText: cell?.textContent?.replace(/\s+/g, " ").trim() ?? null,
          selectionText: window.getSelection()?.toString() ?? "",
          persisted: Array.from(document.querySelectorAll("[data-table-drag-selection-text]")).map(
            (element) => element.getAttribute("data-table-drag-selection-text")
          ),
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
        })
      }
      document.addEventListener("pointerdown", record, { capture: true, once: true })
      document.addEventListener("pointermove", record, { capture: true, once: true })
      document.addEventListener("pointerup", record, { capture: true, once: true })
      document.addEventListener("mousedown", record, { capture: true, once: true })
      document.addEventListener("mousemove", record, { capture: true, once: true })
      document.addEventListener("mouseup", record, { capture: true, once: true })
    })
    const tableDrag = await dragLocatorTextRange(
      page,
      targetCell,
      "live 507 table drag",
      "Stateless 의미",
      { waitMs: 900 }
    )
    if (!tableDrag.selectionText.includes("Stateless 의미")) {
      const diagnostics = await page.evaluate(() => ({
        selectionText: window.getSelection()?.toString() ?? "",
        persisted: Array.from(document.querySelectorAll("[data-table-drag-selection-text]")).map(
          (element) => ({
            text: element.textContent?.replace(/\s+/g, " ").trim() ?? "",
            attr: element.getAttribute("data-table-drag-selection-text"),
          })
        ),
        events: (window as typeof window & { __qaLive507TableEvents?: unknown[] }).__qaLive507TableEvents ?? [],
        activeElement: document.activeElement?.tagName ?? null,
        activeText: document.activeElement?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ?? null,
        scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      }))
      throw new Error(`live 507 table drag lost text selection: ${JSON.stringify({ tableDrag, diagnostics })}`)
    }
    expect(tableDrag.selectionText).toContain("Stateless 의미")
    expect(tableDrag.afterScrollTop).toBeLessThanOrEqual(tableDrag.beforeScrollTop + 24)
    expect(tableDrag.afterScrollTop).toBeGreaterThanOrEqual(tableDrag.beforeScrollTop - 24)
    await page.evaluate(() => {
      window.getSelection()?.removeAllRanges()
      document.querySelectorAll("[data-table-drag-selection-text]").forEach((element) => {
        element.removeAttribute("data-table-drag-selection-text")
      })
    })
    await expect.poll(() => readSelectionText(page)).toBe("")
    await page.mouse.wheel(0, 360)
    await page.waitForTimeout(160)

    const lowerBody = editor.locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." }).first()
    await lowerBody.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    })
    await page.waitForTimeout(160)
    await expect.poll(() => readSelectionText(page)).toBe("")
    const lowerBodyDrag = await dragLocatorTextRange(
      page,
      lowerBody,
      "live 507 lower body drag",
      "아무것도 안 하는 구조",
      {
        endInsetPx: 4,
        paced: true,
        retryWhenEmpty: true,
        startInsetPx: 4,
        waitMs: 900,
      }
    )
    expect(lowerBodyDrag.selectionText).toContain("아무것도 안 하는 구조")
    expect(lowerBodyDrag.afterScrollTop).toBeLessThanOrEqual(lowerBodyDrag.beforeScrollTop + 24)
    expect(lowerBodyDrag.afterScrollTop).toBeGreaterThanOrEqual(lowerBodyDrag.beforeScrollTop - 24)
  })

  test("실제 507 하단 table Cmd+A 뒤 code/body drag selection은 stale table 선택에 잡히지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })

    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 999,
      title: "post 507 table code body chained selection 글",
      version: 7,
    })

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    const tableDrag = await dragLocatorTextRange(
      page,
      targetCell,
      "post 507 chained final table drag",
      POST_507_FINAL_TABLE_TARGET_CELL,
      { paced: true, retryWhenEmpty: true, waitMs: 900 }
    )
    expect(tableDrag.selectionText).toContain(POST_507_FINAL_TABLE_TARGET_CELL)

    await pressSelectAll(page)
    await expect
      .poll(() => readSelectionText(page))
      .toContain("구현되어 있는가")
    expectPost507FinalTableTextSelected(await readSelectionText(page))

    const immediateLowerBody = editor
      .locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." })
      .first()
    const immediateBodyDrag = await dragLocatorTextRange(
      page,
      immediateLowerBody,
      "post 507 immediate lower body drag after table select all",
      "서버가 아무것도 안 하는 구조",
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    const immediateBodySelectionText = immediateBodyDrag.selectionText
    expect(immediateBodySelectionText).toContain("서버가 아무것도 안 하는 구조")
    expect(immediateBodySelectionText).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(immediateBodySelectionText).not.toContain("구현되어 있는가")
    expect(Math.abs(immediateBodyDrag.afterScrollTop - immediateBodyDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoTextSelectionResidue(page, "immediate lower body after table select all")

    const codeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(user)" }).first()
    await codeContent.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" })
    })
    await page.waitForTimeout(160)
    const codeDrag = await dragLocatorTextRange(
      page,
      codeContent,
      "post 507 chained code drag",
      "createAccessToken(user)",
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    const codeSelectionText = codeDrag.selectionText
    expect(codeSelectionText).toContain("createAccessToken(user)")
    expect(codeSelectionText).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(codeSelectionText).not.toContain("구현되어 있는가")
    expect(Math.abs(codeDrag.afterScrollTop - codeDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoTextSelectionResidue(page, "code drag after table select all")

    await pressSelectAll(page)
    await expect.poll(() => readSelectionText(page)).toContain("return new Token")
    const codeSelectAllText = await readSelectionText(page)
    expect(codeSelectAllText).toContain("createRefreshToken(user)")
    expect(codeSelectAllText).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)

    const lowerBody = editor
      .locator("p", { hasText: "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다." })
      .first()
    const lowerBodyDrag = await dragLocatorTextRange(
      page,
      lowerBody,
      "post 507 chained lower body drag",
      "서버가 아무것도 안 하는 구조",
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    const lowerBodySelectionText = lowerBodyDrag.selectionText
    expect(lowerBodySelectionText).toContain("서버가 아무것도 안 하는 구조")
    expect(lowerBodySelectionText).not.toContain("createAccessToken")
    expect(lowerBodySelectionText).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(Math.abs(lowerBodyDrag.afterScrollTop - lowerBodyDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoTextSelectionResidue(page, "lower body after code select all")

    const listTextDrag = await dragLocatorTextRange(
      page,
      editor.locator("li", { hasText: POST_507_SECOND_LIST_ITEM }).first(),
      "post 507 list text drag after regular non-empty selection",
      "세션이랑 JWT",
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    const listTextSelectionText = listTextDrag.selectionText
    expect(listTextSelectionText).toContain("세션이랑 JWT")
    expect(listTextSelectionText).not.toContain("서버가 아무것도 안 하는 구조")
    expect(listTextSelectionText).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(Math.abs(listTextDrag.afterScrollTop - listTextDrag.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoTextSelectionResidue(page, "list text drag after regular non-empty selection")

    await expectPost507FinalTableBlockOverlayFollowsScroll(page, finalTable)

    await clickListItemParagraph(page, editor, POST_507_SECOND_LIST_ITEM, "JWT")
    await targetCell.scrollIntoViewIfNeeded()
    await targetCell.click()
    await pressSelectAll(page)
    const tableSelectionAfterListRecovery = await readSelectionText(page)
    expect(tableSelectionAfterListRecovery).toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(tableSelectionAfterListRecovery).not.toContain("세션이랑 JWT")

    const immediateListTextDragAfterTable = await dragLocatorTextRange(
      page,
      editor.locator("li", { hasText: POST_507_SECOND_LIST_ITEM }).first(),
      "post 507 list text drag immediately after table select all",
      "세션이랑 JWT",
      { paced: true, retryWhenEmpty: true, waitMs: 1_000 }
    )
    const immediateListTextAfterTable = immediateListTextDragAfterTable.selectionText
    expect(immediateListTextAfterTable).toContain("세션이랑 JWT")
    expect(immediateListTextAfterTable).not.toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(Math.abs(immediateListTextDragAfterTable.afterScrollTop - immediateListTextDragAfterTable.beforeScrollTop)).toBeLessThanOrEqual(24)
    await expectNoTextSelectionResidue(page, "list text drag immediately after table select all")

    await targetCell.scrollIntoViewIfNeeded()
    await targetCell.click()
    await pressSelectAll(page)
    await expect.poll(() => readSelectionText(page)).toContain(POST_507_FINAL_TABLE_TARGET_CELL)

    await clickListItemParagraph(page, editor, POST_507_SECOND_LIST_ITEM, "JWT")
    await page.keyboard.press("Tab")
    await expect.poll(() => hasNestedListChild(page, POST_507_FIRST_LIST_ITEM, POST_507_SECOND_LIST_ITEM)).toBe(true)
    await expectNoTextSelectionResidue(page, "list tab after table overlay scroll")
    await clickListItemParagraph(page, editor, POST_507_SECOND_LIST_ITEM, "JWT")
    await page.keyboard.press("Shift+Tab")
    await expect.poll(() => hasNestedListChild(page, POST_507_FIRST_LIST_ITEM, POST_507_SECOND_LIST_ITEM)).toBe(false)
    await expectNoTextSelectionResidue(page, "list shift tab after table overlay scroll")
  })
})
