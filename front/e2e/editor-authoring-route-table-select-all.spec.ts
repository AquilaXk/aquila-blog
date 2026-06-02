import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  expectPost507FinalTableTextSelected,
  mockEditorRouteWithPost507,
} from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const readPageScrollState = (page: Page) =>
  page.evaluate(() => ({
    scrollHeight: document.scrollingElement?.scrollHeight ?? document.body.scrollHeight,
    scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
    viewportHeight: window.innerHeight,
  }))

const expectPost507FinalTableSelectionStable = async (page: Page) => {
  for (let sample = 0; sample < 5; sample += 1) {
    await page.waitForTimeout(120)
    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )
  }
}

const expectWheelScrollRemainsUsable = async (page: Page) => {
  const before = await readPageScrollState(page)
  const scrollDelta =
    before.scrollTop + before.viewportHeight >= before.scrollHeight - 320 ? -260 : 260

  await page.mouse.wheel(0, scrollDelta)

  if (scrollDelta > 0) {
    await expect
      .poll(async () => (await readPageScrollState(page)).scrollTop)
      .toBeGreaterThan(before.scrollTop + 80)
  } else {
    await expect
      .poll(async () => (await readPageScrollState(page)).scrollTop)
      .toBeLessThan(before.scrollTop - 80)
  }
}

const blurTableCellByKeyboard = async (page: Page, maxAttempts = 28) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.keyboard.press("Tab")
    await page.waitForTimeout(80)
    const inTableCell = await page.evaluate(() =>
      Boolean(document.activeElement?.closest("th, td"))
    )
    if (!inTableCell) {
      return true
    }
  }
  return false
}

const expectNativeSelectionAnchoredInParagraph = async (
  page: Page,
  paragraphText: string
) => {
  await expect
    .poll(async () =>
      page.evaluate((expectedText) => {
        const selection = window.getSelection()
        const anchorElement =
          selection?.anchorNode instanceof Element
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement ?? null
        const focusElement =
          selection?.focusNode instanceof Element
            ? selection.focusNode
            : selection?.focusNode?.parentElement ?? null
        return Boolean(
          anchorElement?.closest("p")?.textContent?.includes(expectedText) &&
            focusElement?.closest("p")?.textContent?.includes(expectedText)
        )
      }, paragraphText)
    )
    .toBe(true)
}

const expectPost507FinalTableShape = async (finalTable: Locator) => {
  await expect(finalTable.locator("tr")).toHaveCount(7)
  await expect(finalTable.locator("tr").first().locator("th, td")).toHaveCount(3)
}

test.describe("editor authoring route post 507 final table select all", () => {
  test("실제 /editor/[id] post 507 마지막 table cell에서 첫 Cmd/Ctrl+A는 현재 table 전체 셀 텍스트를 선택한다", async ({
    page,
  }) => {
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 994,
      title: "post 507 table select all live route 글",
      version: 3,
    })
    await expectPost507FinalTableShape(finalTable)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    await expectPost507FinalTableSelectionStable(page)
    await expectWheelScrollRemainsUsable(page)
    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
  })

  test("post 507 마지막 table cell Cmd/Ctrl+A 반복 호출 시에도 현재 table 전체 셀 텍스트만 유지된다", async ({
    page,
  }) => {
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 996,
      title: "post 507 table select all repeat route 글",
    })
    await expectPost507FinalTableShape(finalTable)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(280)
    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )

    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(280)
    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
  })

  test("키보드 포커스 이탈 후에도 post 507 마지막 table 내부 Cmd/Ctrl+A가 현재 table 전체 셀 텍스트를 선택한다", async ({
    page,
  }) => {
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 998,
      title: "post 507 table select all keyboard focus escape route 글",
    })
    await expectPost507FinalTableShape(finalTable)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(240)
    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )

    const blurred = await blurTableCellByKeyboard(page)
    expect(blurred).toBeTruthy()

    const paragraphText = "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다."
    const closingParagraph = editor.locator("p", { hasText: paragraphText }).first()
    await closingParagraph.scrollIntoViewIfNeeded()
    await closingParagraph.click()
    await expectNativeSelectionAnchoredInParagraph(page, paragraphText)
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Boolean(
            document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ||
              document.querySelector("[data-table-drag-selection-text]")
          )
        )
      )
      .toBe(false)

    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(240)

    expectPost507FinalTableTextSelected(
      await page.evaluate(() => window.getSelection()?.toString() ?? "")
    )
  })
})
