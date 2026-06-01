import { expect, test, type Page } from "@playwright/test"
import { getTableAffordances } from "./helpers/editorAuthoringFlow"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  mockEditorRouteWithPost507,
} from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const resolvePost507FinalTableColumnMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const metrics = await page.evaluate(async (targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const tables = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? []).filter((candidate) => {
        const text = candidate.textContent ?? ""
        return text.includes(targetCellText) && text.includes("재발급 로직")
      })
      const table = tables[tables.length - 1]
      if (!table) return null

      const centerTableInViewport = () => {
        const rect = table.getBoundingClientRect()
        const targetTop = Math.round(window.innerHeight * 0.42)
        if (rect.top < 96 || rect.top > window.innerHeight - 180) {
          let scrollRoot: Element = document.scrollingElement ?? document.documentElement
          for (let parent = table.parentElement; parent; parent = parent.parentElement) {
            const style = window.getComputedStyle(parent)
            const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY)
            if (canScrollY && parent.scrollHeight > parent.clientHeight) {
              scrollRoot = parent
              break
            }
          }
          scrollRoot.scrollTop += rect.top - targetTop
        }
      }

      centerTableInViewport()
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })

      const tableRect = table.getBoundingClientRect()
      const headerCells = Array.from(table.querySelectorAll<HTMLElement>("thead th, tr:first-child th, tr:first-child td"))
      const headerCell =
        headerCells.find((candidate) => candidate.textContent?.includes("점검 항목")) ?? headerCells[1] ?? headerCells[0]
      if (!headerCell) return null
      const headerRect = headerCell.getBoundingClientRect()
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        headerRect.width <= 0 ||
        headerRect.height <= 0 ||
        tableRect.top < 64 ||
        tableRect.top > window.innerHeight - 80
      ) {
        return null
      }

      return {
        cellX: headerRect.left + Math.min(40, Math.max(8, headerRect.width / 2)),
        cellY: Math.min(headerRect.top + 16, headerRect.bottom - 8),
        hoverX: headerRect.left + headerRect.width / 2,
        hoverY: tableRect.top + 6,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(60)
  }

  throw new Error("7x3 route row reset column metrics are missing")
}

test.describe("editor authoring route post 507 final table axis after cell text select all", () => {
  test("실제 /editor/[id] post 507 마지막 7x3 table은 row 선택 해제 직후 column hotzone direct hover로 열 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 994,
      title: "post 507 table row reset column route 글",
    })
    const { columnHandle, rowHandle } = getTableAffordances(page)

    const table = finalTable
    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })

    const tableBox = await table.boundingBox()
    const cellBox = await targetCell.boundingBox()
    if (!tableBox || !cellBox) {
      throw new Error("7x3 route row reset metrics are missing")
    }

    await page.mouse.move(tableBox.x + 3, cellBox.y + cellBox.height / 2)
    await page.waitForTimeout(140)
    await expect(rowHandle).toBeVisible()
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)

    await page.keyboard.press("Escape")
    await page.waitForTimeout(160)
    const resetMetrics = await resolvePost507FinalTableColumnMetrics(page)
    await page.mouse.click(resetMetrics.cellX, resetMetrics.cellY)
    await page.waitForTimeout(120)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const columnMetrics = await resolvePost507FinalTableColumnMetrics(page)
      await page.mouse.move(columnMetrics.cellX, columnMetrics.cellY)
      await page.mouse.move(columnMetrics.hoverX, columnMetrics.hoverY, { steps: 4 })
      await page.waitForTimeout(220)
      if (await columnHandle.isVisible().catch(() => false)) break
      if (attempt === 4) throw new Error("7x3 route column handle did not appear after row reset")
    }

    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] post 507 마지막 7x3 table은 cell-local Cmd/Ctrl+A 직후 column grip을 첫 축 선택으로 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 993,
      title: "post 507 table select-all column route 글",
    })
    const { columnHandle } = getTableAffordances(page)

    const table = finalTable
    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await expect
      .poll(async () => page.evaluate(() => (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim()))
      .toBe(POST_507_FINAL_TABLE_TARGET_CELL)

    const tableBox = await table.boundingBox()
    const cellBox = await targetCell.boundingBox()
    if (!tableBox || !cellBox) {
      throw new Error("7x3 route column grip metrics are missing after cell-local select-all")
    }
    await page.mouse.move(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2)
    await page.evaluate(
      ({ left, top, width }) => {
        const doc = document as Document & {
          __aqOriginalElementFromPoint?: typeof document.elementFromPoint
          __aqOriginalElementsFromPoint?: typeof document.elementsFromPoint
        }
        const cover = document.createElement("div")
        cover.setAttribute("data-testid", "table-hotzone-cover")
        Object.assign(cover.style, {
          background: "transparent",
          height: "24px",
          left: `${left}px`,
          pointerEvents: "auto",
          position: "fixed",
          top: `${top}px`,
          width: `${width}px`,
          zIndex: "2147483647",
        })
        document.querySelector("[data-testid='block-editor-viewport']")?.appendChild(cover)
        doc.__aqOriginalElementsFromPoint = document.elementsFromPoint.bind(document)
        doc.__aqOriginalElementFromPoint = document.elementFromPoint.bind(document)
        document.elementsFromPoint = ((clientX: number, clientY: number) => {
          const rect = cover.getBoundingClientRect()
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            return [cover]
          }
          return doc.__aqOriginalElementsFromPoint?.(clientX, clientY) ?? []
        }) as typeof document.elementsFromPoint
        document.elementFromPoint = ((clientX: number, clientY: number) => {
          const rect = cover.getBoundingClientRect()
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            return cover
          }
          return doc.__aqOriginalElementFromPoint?.(clientX, clientY) ?? null
        }) as typeof document.elementFromPoint
      },
      { left: tableBox.x, top: tableBox.y, width: tableBox.width }
    )
    await page.mouse.move(cellBox.x + cellBox.width / 2, tableBox.y + 3)
    await page.waitForTimeout(180)

    await expect(columnHandle).toBeVisible()
    await page.getByTestId("table-hotzone-cover").evaluate((element) => {
      const doc = document as Document & {
        __aqOriginalElementFromPoint?: typeof document.elementFromPoint
        __aqOriginalElementsFromPoint?: typeof document.elementsFromPoint
      }
      if (doc.__aqOriginalElementsFromPoint) document.elementsFromPoint = doc.__aqOriginalElementsFromPoint
      if (doc.__aqOriginalElementFromPoint) document.elementFromPoint = doc.__aqOriginalElementFromPoint
      delete doc.__aqOriginalElementsFromPoint
      delete doc.__aqOriginalElementFromPoint
      element.remove()
    })
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] post 507 마지막 7x3 table은 cell-local Cmd/Ctrl+A 직후 row grip으로 축 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 920 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 991,
      title: "post 507 table axis after select-all route 글",
    })
    const { rowHandle } = getTableAffordances(page)

    const table = finalTable
    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    const selectCurrentCellText = async () => {
      const currentTargetCell = editor
        .locator("table")
        .last()
        .locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL })
        .first()
      await currentTargetCell.click({ force: true, position: { x: 36, y: 16 } })
      await currentTargetCell.dblclick({ force: true, position: { x: 36, y: 16 } })
      await page.keyboard.press(SELECT_ALL_SHORTCUT)
      await expect
        .poll(async () => page.evaluate(() => (window.getSelection()?.toString() || "").replace(/\s+/g, " ").trim()))
        .toBe(POST_507_FINAL_TABLE_TARGET_CELL)
    }

    const moveToRowGripHotzone = async () => {
      await expect(targetCell).toBeVisible()
      await targetCell.scrollIntoViewIfNeeded()
      const tableBox = await table.boundingBox()
      const cellBox = await targetCell.boundingBox()
      if (!tableBox || !cellBox) {
        throw new Error("7x3 route row grip metrics are missing after cell-local select-all")
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

    await selectCurrentCellText()
    await moveToRowGripHotzone()
    await expect(rowHandle).toBeVisible()
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)
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
  })
})
