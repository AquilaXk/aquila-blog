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
      waitMs: 2_800,
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

    const codeContent = editor.locator(".aq-code-editor-content", { hasText: "createAccessToken(user)" }).first()
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
    const codeDrag = await dragLocatorText(page, codeContent, "token login code drag", {
      endX: codeDragMetrics.endX,
      y: codeDragMetrics.y,
      waitMs: 1_600,
    })
    await expect.poll(() => readSelectionText(page)).toContain("createAccessToken")
    expect(codeDrag.selectionText).not.toContain("Access Token")
    expect(codeDrag.afterScrollTop).toBeLessThanOrEqual(codeDrag.beforeScrollTop + 24)
    expect(codeDrag.afterScrollTop).toBeGreaterThanOrEqual(codeDrag.beforeScrollTop - 24)
  })
})
