import { expect, test, type Locator, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const readSelectionText = (page: Page) =>
  page.evaluate(
    () =>
      window.getSelection()?.toString() ||
      document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
      document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
      ""
  )

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
  await target.scrollIntoViewIfNeeded()
  await target.evaluate((element) => {
    element.scrollIntoView({ block: "center", inline: "nearest" })
  })
  const box = await target.boundingBox()
  if (!box) throw new Error(`${label} metrics are missing`)
  const y = options.y ?? Math.min(box.height / 2, 18)
  const startX = options.startX ?? 8
  const endX = options.endX ?? Math.min(box.width - 8, 360)
  const beforeScrollTop = await readScrollTop(page)

  await target.hover({ position: { x: startX, y } })
  await page.mouse.down()
  await target.hover({ position: { x: endX, y } })
  await page.mouse.up()
  await page.waitForTimeout(options.waitMs ?? 720)

  const afterScrollTop = await readScrollTop(page)
  const selectionText = await readSelectionText(page)
  return { beforeScrollTop, afterScrollTop, selectionText }
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
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[146,139]} -->',
      "| **토큰** | **역할** |",
      "| --- | --- |",
      "| Access Token | API 인증 |",
      "| Refresh Token | Access 재발급 |",
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

    const accessTokenCell = editor.locator("td", { hasText: "Access Token" }).first()
    const accessTokenBox = await accessTokenCell.evaluate((element) => {
      element.scrollIntoView({ block: "center", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      return { y: rect.height / 2, endX: Math.min(rect.width - 8, 128) }
    })
    await accessTokenCell.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 10
      const clientY = rect.top + metrics.y
      const selection = window.getSelection()
      selection?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection?.addRange(range)
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY }))
    }, accessTokenBox)
    expect(await readSelectionText(page)).toContain("Access Token")
    await accessTokenCell.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 10
      const clientY = rect.top + metrics.y
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
      document.addEventListener("pointerdown", record, { capture: true, once: true })
      document.addEventListener("pointermove", record, { capture: true, once: true })
      document.addEventListener("pointerup", record, { capture: true, once: true })
      document.addEventListener("mousedown", record, { capture: true, once: true })
      document.addEventListener("mousemove", record, { capture: true, once: true })
      document.addEventListener("mouseup", record, { capture: true, once: true })
    })
    const tableDrag = await dragLocatorText(page, accessTokenCell, "access token table drag", {
      endX: accessTokenBox.endX,
      y: accessTokenBox.y,
      waitMs: 850,
    })
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
    const beforeImmediateCodeSelectAll = await readScrollTop(page)
    await codeContent.click({ position: { x: 80, y: immediateCodeMetrics.y } })
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
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
      const pointerDefaultAllowed = element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY, pointerType: "mouse" }))
      const mouseDefaultAllowed = element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY }))
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
      shell.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX: startX, clientY, pointerType: "mouse" }))
      window.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX: endX, clientY, pointerType: "mouse" }))
      window.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX: endX, clientY, pointerType: "mouse" }))
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
    if (!(shellDispatchDiagnostics.selection || shellDispatchDiagnostics.dataset || "").includes("createAccessToken")) {
      throw new Error(`code shell drag did not select code text: ${JSON.stringify(shellDispatchDiagnostics)}`)
    }
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    const beforeCodeSelectAll = await readScrollTop(page)
    await codeContent.click({ position: { x: 80, y: 28 } })
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeCodeSelectAll + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeCodeSelectAll - 24)
    await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 80
      const clientY = rect.top + metrics.y
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY }))
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY }))
    }, codeDragMetrics)
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 80
      const clientY = rect.top + metrics.y
      const selection = window.getSelection()
      selection?.removeAllRanges()
      const range = document.createRange()
      range.selectNodeContents(element)
      selection?.addRange(range)
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY, pointerType: "mouse" }))
      window.getSelection()?.removeAllRanges()
      element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX, clientY }))
    }, codeDragMetrics)
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const clientX = rect.left + 80
      const clientY = rect.top + metrics.y
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY, pointerType: "mouse" }))
      element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX, clientY }))
    }, codeDragMetrics)
    await codeContent.evaluate((element, metrics) => {
      const rect = element.getBoundingClientRect()
      const startX = rect.left + 80
      const clientY = rect.top + metrics.y
      const selection = window.getSelection()
      selection?.removeAllRanges()
      element.closest(".aq-code-shell")?.removeAttribute("data-code-drag-selection-text")
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX: startX, clientY, pointerType: "mouse" }))
      element.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, button: 0, buttons: 1, cancelable: true, clientX: rect.left + metrics.endX, clientY, pointerType: "mouse" }))
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, buttons: 0, cancelable: true, clientX: rect.left + metrics.endX, clientY, pointerType: "mouse" }))
    }, codeDragMetrics)
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    const codeDragStartBox = await codeContent.boundingBox()
    if (!codeDragStartBox) throw new Error("code drag start metrics are missing")
    await page.evaluate(() => {
      ;(window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents = []
      const record = (event: Event) => {
        const pointerEvent = event instanceof MouseEvent || event instanceof PointerEvent ? event : null
        const target = event.target instanceof Element ? event.target : event.target?.parentElement
        const selection = window.getSelection()
        ;(window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents?.push({
          type: event.type,
          buttons: pointerEvent?.buttons,
          button: pointerEvent?.button,
          x: pointerEvent?.clientX,
          y: pointerEvent?.clientY,
          targetClass: String(target?.className ?? ""),
          selectionText: selection?.toString() ?? "",
          persisted: Array.from(document.querySelectorAll("[data-code-drag-selection-text]")).map((element) => element.getAttribute("data-code-drag-selection-text")),
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
    const codeSelectionAfterMouseDown = await readSelectionText(page)
    if (!codeSelectionAfterMouseDown.includes("createAccessToken")) {
      const diagnostics = await page.evaluate(() => ({
        selectionText: window.getSelection()?.toString() ?? "",
        persisted: Array.from(document.querySelectorAll("[data-code-drag-selection-text]")).map((element) => element.getAttribute("data-code-drag-selection-text")),
        events: (window as typeof window & { __qaCodeDragEvents?: unknown[] }).__qaCodeDragEvents ?? [],
      }))
      throw new Error(`code mousedown cleared selection: ${JSON.stringify(diagnostics)}`)
    }
    await page.mouse.up()
    await codeContent.evaluate((element) => {
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
    await expect.poll(() => readSelectionText(page)).toContain("TTL")
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
})
