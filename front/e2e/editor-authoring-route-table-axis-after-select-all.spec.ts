import { expect, test } from "@playwright/test"
import { getTableAffordances } from "./helpers/editorAuthoringFlow"
import { mockEditorRouteWithSevenByThreeTable } from "./helpers/editorTableFixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

test.describe("editor authoring route table axis after select all", () => {
  test("실제 /editor/[id] 7x3 table은 table-wide Cmd/Ctrl+A 직후 row/column grip으로 축 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 920 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 991,
      title: "7x3 table axis after select-all route 글",
    })
    const { columnHandle, rowHandle } = getTableAffordances(page)

    const table = editor.locator("table").first()
    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    const selectWholeTableText = async () => {
      await targetCell.click({ position: { x: 36, y: 16 } })
      await targetCell.dblclick({ position: { x: 36, y: 16 } })
      await page.keyboard.press(SELECT_ALL_SHORTCUT)
      await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toContain("영역")
      await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toContain("Access Token")
      await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toContain("구현되어 있는가")
    }

    const moveToRowGripHotzone = async () => {
      const tableBox = await table.boundingBox()
      const cellBox = await targetCell.boundingBox()
      if (!tableBox || !cellBox) {
        throw new Error("7x3 route row grip metrics are missing after table-wide select-all")
      }
      const points = [
        { x: tableBox.x + 4, y: cellBox.y + cellBox.height / 2 },
        { x: tableBox.x + 8, y: cellBox.y + cellBox.height / 2 },
        { x: tableBox.x + 4, y: tableBox.y + tableBox.height / 2 },
      ]
      for (const point of points) {
        await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2)
        await page.mouse.move(point.x, point.y, { steps: 4 })
        await page.waitForTimeout(80)
        if (await rowHandle.isVisible().catch(() => false)) return
      }
    }

    const moveToColumnGripHotzone = async () => {
      const tableBox = await table.boundingBox()
      const cellBox = await targetCell.boundingBox()
      if (!tableBox || !cellBox) {
        throw new Error("7x3 route column grip metrics are missing after table-wide select-all")
      }
      const points = [
        { x: cellBox.x + cellBox.width / 2, y: tableBox.y + 4 },
        { x: cellBox.x + cellBox.width / 2, y: tableBox.y + 8 },
        { x: tableBox.x + tableBox.width / 2, y: tableBox.y + 4 },
      ]
      for (const point of points) {
        await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2)
        await page.mouse.move(point.x, point.y, { steps: 4 })
        await page.waitForTimeout(80)
        if (await columnHandle.isVisible().catch(() => false)) return
      }
    }

    await selectWholeTableText()
    await moveToRowGripHotzone()
    await expect(rowHandle).toBeVisible()
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)
    await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toBe("")
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

    await page.keyboard.press("Escape")
    await selectWholeTableText()
    await moveToColumnGripHotzone()
    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
    await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toBe("")
  })
})
