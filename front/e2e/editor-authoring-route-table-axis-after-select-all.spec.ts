import { expect, test } from "@playwright/test"
import { getTableAffordances } from "./helpers/editorAuthoringFlow"
import { mockEditorRouteWithSevenByThreeTable } from "./helpers/editorTableFixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

test.describe("editor authoring route table axis after select all", () => {
  test("실제 /editor/[id] 7x3 table은 row 선택 해제 직후 column hotzone direct hover로 열 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 994,
      title: "7x3 table row reset column route 글",
      lead: "table live lead paragraph",
      tail: "table live trailing paragraph",
    })
    const { columnHandle, rowHandle } = getTableAffordances(page)

    const table = editor.locator("table").first()
    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
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
    await targetCell.click({ position: { x: 40, y: 16 } })
    const tableBoxAfterReset = await table.boundingBox()
    const cellBoxAfterReset = await targetCell.boundingBox()
    if (!tableBoxAfterReset || !cellBoxAfterReset) {
      throw new Error("7x3 route row reset column metrics are missing")
    }
    await page.mouse.move(cellBoxAfterReset.x + cellBoxAfterReset.width / 2, tableBoxAfterReset.y + 3)
    await page.waitForTimeout(180)

    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] 7x3 table은 row reset 뒤 scroll 보정으로 stale column hotzone에 남아도 열 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 995,
      title: "7x3 table stale row reset column route 글",
      lead: "table live lead paragraph",
      tail: "table live trailing paragraph",
    })
    const { columnHandle, rowHandle } = getTableAffordances(page)

    const table = editor.locator("table").first()
    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.evaluate(() => window.scrollBy(0, 120))
    await page.waitForTimeout(50)

    const staleTableBox = await table.boundingBox()
    const staleCellBox = await targetCell.boundingBox()
    if (!staleTableBox || !staleCellBox) {
      throw new Error("7x3 route stale row reset metrics are missing")
    }

    await page.mouse.move(staleTableBox.x + 3, staleCellBox.y + staleCellBox.height / 2)
    await page.waitForTimeout(140)
    await expect(rowHandle).toBeVisible()
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)

    await page.keyboard.press("Escape")
    await targetCell.click({ position: { x: 40, y: 16 } })
    await page.evaluate(() => {
      const tableElement = document.querySelector("[data-testid='block-editor-prosemirror'] table")
      const tableShell = tableElement?.closest(".aq-table-shell, .tableWrapper, table")
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "stale-table-shift-spacer")
      spacer.style.height = "96px"
      spacer.style.pointerEvents = "none"
      tableShell?.before(spacer)
    })
    await page.waitForTimeout(50)
    const shiftedTableBox = await table.boundingBox()
    if (!shiftedTableBox || shiftedTableBox.y - staleTableBox.y < 48) {
      throw new Error("7x3 route stale row reset scroll shift is missing")
    }
    await page.mouse.move(staleCellBox.x + staleCellBox.width / 2, staleTableBox.y + 3)
    await page.waitForTimeout(180)

    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] 7x3 table은 stale active DOM ref가 끊겨도 현재 rendered table로 column hotzone을 복구한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 996,
      title: "7x3 table disconnected ref stale hotzone route 글",
      lead: "table live lead paragraph",
      tail: "table live trailing paragraph",
    })
    const { columnHandle } = getTableAffordances(page)

    const table = editor.locator("table").first()
    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })

    const staleTableBox = await table.boundingBox()
    const staleCellBox = await targetCell.boundingBox()
    if (!staleTableBox || !staleCellBox) {
      throw new Error("7x3 route disconnected ref metrics are missing")
    }

    await page.mouse.move(staleCellBox.x + staleCellBox.width / 2, staleCellBox.y + staleCellBox.height / 2)
    await page.waitForTimeout(140)
    await page.evaluate(() => {
      const tableElement = document.querySelector("[data-testid='block-editor-prosemirror'] table")
      const tableShell = tableElement?.closest(".aq-table-shell, .tableWrapper, table")
      if (!tableShell) throw new Error("table shell is missing")
      const clone = tableShell.cloneNode(true) as HTMLElement
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "stale-active-table-ref-shift-spacer")
      spacer.style.height = "96px"
      spacer.style.pointerEvents = "none"
      tableShell.before(spacer)
      tableShell.replaceWith(clone)
    })
    await page.waitForTimeout(50)

    const shiftedTableBox = await table.boundingBox()
    if (!shiftedTableBox || shiftedTableBox.y - staleTableBox.y < 48) {
      throw new Error("7x3 route disconnected ref shift is missing")
    }

    await page.mouse.move(staleCellBox.x + staleCellBox.width / 2, staleTableBox.y + 3)
    await page.waitForTimeout(180)

    await expect(columnHandle).toBeVisible()
  })

  test("실제 /editor/[id] 7x3 table은 table-wide Cmd/Ctrl+A 직후 column grip을 첫 축 선택으로 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 993,
      title: "7x3 table select-all column route 글",
      lead: "table live lead paragraph",
      tail: "table live trailing paragraph",
    })
    const { columnHandle } = getTableAffordances(page)

    const table = editor.locator("table").first()
    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toContain("영역")
    await expect.poll(async () => page.evaluate(() => window.getSelection()?.toString() || "")).toContain("구현되어 있는가")

    const tableBox = await table.boundingBox()
    const cellBox = await targetCell.boundingBox()
    if (!tableBox || !cellBox) {
      throw new Error("7x3 route column grip metrics are missing after table-wide select-all")
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
