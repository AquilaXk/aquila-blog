import { expect, test, type Locator, type Page } from "@playwright/test"
import { mockEditorRouteWithPost507 } from "./helpers/post507Fixtures"

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

const resolveTextRangeBox = async (locator: Locator, text: string) =>
  locator.evaluate((element, targetText) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      const startOffset = textNode.data.indexOf(targetText)
      if (startOffset < 0) continue

      const range = document.createRange()
      range.setStart(textNode, startOffset)
      range.setEnd(textNode, startOffset + targetText.length)
      const rect =
        Array.from(range.getClientRects()).find((candidate) => candidate.width > 2 && candidate.height > 2) ??
        range.getBoundingClientRect()
      if (rect.width <= 2 || rect.height <= 2) {
        throw new Error("post 507 text range box is too small")
      }
      return {
        endX: rect.right - 2,
        startX: rect.left + 2,
        y: rect.top + rect.height / 2,
      }
    }
    throw new Error(`post 507 text range is missing: ${targetText}`)
  }, text)

test.describe("editor authoring route 507 selection scroll owner", () => {
  test("실제 /editor/[id] post 507 일반 본문 클릭 직후 scroll 이벤트가 이전 anchor로 되돌아가지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 995,
      title: "post 507 body scroll owner route 글",
      version: 3,
    })

    const targetParagraph = editor.locator("p", { hasText: "JWT 구조를 이해하면 자연스럽게" }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error("post 507 body scroll owner target paragraph metrics are missing")
    }

    await page.mouse.click(targetBox.x + Math.min(targetBox.width / 2, 160), targetBox.y + targetBox.height / 2)
    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.wheel(0, 260)
    await page.waitForTimeout(120)
    const afterScrollTop = await readScrollTop(page)

    expect(afterScrollTop).toBeGreaterThan(beforeScrollTop + 120)
  })

  test("실제 /editor/[id] post 507 일반 본문 drag selection은 native text selection을 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 996,
      title: "post 507 body text drag route 글",
      version: 4,
    })

    const targetParagraph = editor.locator("p", { hasText: "JWT 구조를 이해하면 자연스럽게" }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const dragBox = await resolveTextRangeBox(targetParagraph, "JWT 구조를 이해하면")
    await page.mouse.move(dragBox.startX, dragBox.y)
    await page.mouse.down()
    await page.mouse.move(dragBox.endX, dragBox.y, { steps: 16 })
    await page.mouse.up()
    await page.waitForTimeout(160)

    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(selectionText).toContain("JWT 구조를 이해하면")

    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.wheel(0, 220)
    await page.waitForTimeout(120)
    const afterScrollTop = await readScrollTop(page)
    expect(afterScrollTop).toBeGreaterThan(beforeScrollTop + 100)
  })

  test("실제 /editor/[id] post 507 일반 본문 pointermove 노이즈는 scroll preserve를 먼저 취소하지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 998,
      title: "post 507 body pointer noise route 글",
      version: 6,
    })

    const targetParagraph = editor.locator("p", { hasText: "JWT 구조를 이해하면 자연스럽게" }).first()
    await targetParagraph.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const targetBox = await targetParagraph.boundingBox()
    if (!targetBox) {
      throw new Error("post 507 body pointer noise target paragraph metrics are missing")
    }

    const pointerY = targetBox.y + targetBox.height / 2
    const pointerX = targetBox.x + Math.min(targetBox.width / 2, 160)
    await page.mouse.move(pointerX, pointerY)
    await page.mouse.down()
    await page.mouse.move(pointerX + 1, pointerY)
    const beforeInjectedScrollTop = await readScrollTop(page)
    const afterInjectedScrollTop = await page.evaluate(() => {
      window.scrollBy(0, 260)
      return document.scrollingElement?.scrollTop ?? window.scrollY
    })
    expect(afterInjectedScrollTop).toBeGreaterThan(beforeInjectedScrollTop + 120)
    await expect.poll(() => readScrollTop(page)).toBeLessThanOrEqual(beforeInjectedScrollTop + 24)
    await expect.poll(() => readScrollTop(page)).toBeGreaterThanOrEqual(beforeInjectedScrollTop - 24)
    await page.mouse.up()
  })

  test("실제 /editor/[id] post 507 code block follow-up focus는 click 보정 후 사용자 wheel scroll을 막지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 997,
      title: "post 507 code follow-up focus route 글",
      version: 5,
    })

    const codeBlock = editor.locator(".aq-code-shell", { hasText: "public Token login" }).first()
    await codeBlock.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const codeEditorContent = codeBlock.locator(".aq-code-editor-content").first()
    const beforeClickScrollTop = await readScrollTop(page)
    await codeEditorContent.click({ position: { x: 28, y: 18 } })
    await page.waitForTimeout(220)
    const afterClickScrollTop = await readScrollTop(page)
    expect(Math.abs(afterClickScrollTop - beforeClickScrollTop)).toBeLessThanOrEqual(24)

    await page.mouse.wheel(0, 260)
    await page.waitForTimeout(160)
    const afterWheelScrollTop = await readScrollTop(page)
    expect(afterWheelScrollTop).toBeGreaterThan(afterClickScrollTop + 100)
  })
})
