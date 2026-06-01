import { expect, test, type Page } from "@playwright/test"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  expectPost507FinalTableTextSelected,
  mockEditorRouteWithPost507,
} from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const readScrollTop = (page: Page) =>
  page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

test.describe("editor authoring route table scroll preserve", () => {
  test("실제 /editor/[id] post 507 마지막 table cell 클릭/텍스트 선택/Cmd+A 중 scrollTop이 튀지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 993,
      title: "post 507 table scroll preserve live route 글",
      version: 2,
    })

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const beforeClickScrollTop = await readScrollTop(page)
    await targetCell.click({ position: { x: 28, y: 16 } })
    await page.waitForTimeout(180)
    const afterClickScrollTop = await readScrollTop(page)
    expect(Math.abs(afterClickScrollTop - beforeClickScrollTop)).toBeLessThanOrEqual(24)

    const dragMetrics = await targetCell.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const startOffset = textNode.data.indexOf("Stateless 의미")
        if (startOffset < 0) continue
        const range = document.createRange()
        range.setStart(textNode, startOffset)
        range.setEnd(textNode, startOffset + "Stateless 의미".length)
        const rect = Array.from(range.getClientRects()).find((candidate) => candidate.width > 2 && candidate.height > 2) ?? range.getBoundingClientRect()
        if (rect.width <= 2 || rect.height <= 2) {
          throw new Error("table scroll preserve text rect is too small")
        }
        return {
          endX: rect.right - 2,
          startX: rect.left + 2,
          y: rect.top + rect.height / 2,
        }
      }
      throw new Error("table scroll preserve text node is missing")
    })

    const beforeDragScrollTop = await readScrollTop(page)
    await page.mouse.move(dragMetrics.startX, dragMetrics.y)
    await page.mouse.down()
    await page.mouse.move(dragMetrics.endX, dragMetrics.y, { steps: 16 })
    await page.mouse.up()
    await page.waitForTimeout(220)
    const afterDragScrollTop = await readScrollTop(page)
    expect(Math.abs(afterDragScrollTop - beforeDragScrollTop)).toBeLessThanOrEqual(24)

    const beforeSelectAllScrollTop = await readScrollTop(page)
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(320)
    const afterSelectAllScrollTop = await readScrollTop(page)
    expect(Math.abs(afterSelectAllScrollTop - beforeSelectAllScrollTop)).toBeLessThanOrEqual(24)

    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expectPost507FinalTableTextSelected(selectionText)
  })

  test("테이블 caret 포커스 후 wheel scroll은 캐럿 위치를 보존하며 점프하지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const leadParagraphs = Array.from({ length: 60 }, (_, index) =>
      `table scroll preserve lead paragraph ${index + 1}. 캐럿 고정 점검용 시나리오입니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[160,220,220]} -->',
      "| **영역** | **점검 항목** | **확인 기준** |",
      "| --- | --- | --- |",
      "| 시작 | 캐럿 | 유지 |",
      "| 중간 | 스크롤 | 점검 |",
      "| 끝 | 반응성 | 확인 |",
      "| 예외 | 입력 | 복원 |",
      "| 회복 | 포커스 | 정합성 |",
      "| 보강 | 트래킹 | 누락 없음 |",
    ].join("\n")
    const trailingParagraphs = Array.from({ length: 20 }, (_, index) =>
      `table scroll preserve trailing paragraph ${index + 1}. 스크롤 이동 후에도 캐럿 anchor는 유지되어야 합니다.`
    )
    const content = [
      ...leadParagraphs,
      tableMarkdown,
      ...trailingParagraphs,
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/994", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 994,
          version: 2,
          title: "table caret scroll jump regress test",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/994")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "table caret scroll jump regress test"
    )

    const targetCell = editor.locator("td", { hasText: "캐럿" }).first()
    await targetCell.scrollIntoViewIfNeeded()
    await page.waitForTimeout(120)

    const cellBox = await targetCell.boundingBox()
    if (!cellBox) {
      throw new Error("table caret scroll jump test target cell box is not available")
    }

    await page.mouse.move(cellBox.x + 24, cellBox.y + 16)
    await page.mouse.down()
    await page.mouse.up()
    const caretStateAfterClick = await page.evaluate(() => {
      const selection = window.getSelection()
      return {
        isCollapsed: selection?.isCollapsed ?? false,
        text: selection?.toString() ?? "",
      }
    })
    expect(caretStateAfterClick).toMatchObject({
      isCollapsed: true,
      text: "",
    })

    const beforeScrollTop = await readScrollTop(page)
    await page.mouse.wheel(0, 240)
    await page.waitForTimeout(220)
    const afterFirstWheel = await readScrollTop(page)
    expect(afterFirstWheel - beforeScrollTop).toBeGreaterThan(120)

    await page.mouse.wheel(0, -240)
    await page.waitForTimeout(220)
    const afterSecondWheel = await readScrollTop(page)
    expect(afterSecondWheel).toBeLessThan(beforeScrollTop + 140)
    expect(Math.abs(afterSecondWheel - afterFirstWheel)).toBeGreaterThan(60)

    const caretStateAfterScroll = await page.evaluate(() => {
      const selection = window.getSelection()
      return {
        isCollapsed: selection?.isCollapsed ?? false,
        text: selection?.toString() ?? "",
      }
    })
    expect(caretStateAfterScroll).toMatchObject({
      isCollapsed: true,
      text: "",
    })
  })
})
