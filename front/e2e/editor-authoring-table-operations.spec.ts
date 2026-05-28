import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  getTableAffordances,
  readTableGrid,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring table operations", () => {
  test("table QA actions로 열/행 추가와 삭제가 round-trip 된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstCell = page.locator("table th, table td").first()
    await firstCell.click()

    const rows = page.locator("table tr")
    const firstRowCells = rows.first().locator("th, td")
    const addRowButton = page.getByRole("button", { name: "QA 행 추가" })
    const addColumnButton = page.getByRole("button", { name: "QA 열 추가" })

    await expect(addRowButton).toBeVisible()
    await expect(addColumnButton).toBeVisible()
    await addRowButton.click()
    await expect(rows).toHaveCount(4)
    await addColumnButton.click()
    await expect(page.locator("table tr")).toHaveCount(4)
    await expect(firstRowCells).toHaveCount(4)

    await page.getByRole("button", { name: "QA 열 선택" }).click()
    await page.getByRole("button", { name: "QA 열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    await firstCell.click()
    await page.getByRole("button", { name: "QA 행 삭제" }).click()
    await expect(page.locator("table tr")).toHaveCount(3)
  })

  test("table row/column grip drag는 축을 재정렬하고 seed 재진입 후에도 순서를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { rowHandle: rowGrip, columnHandle: columnGrip } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const initialValues = [
      ["r1c1", "r1c2", "r1c3"],
      ["r2c1", "r2c2", "r2c3"],
      ["r3c1", "r3c2", "r3c3"],
    ]

    for (let rowIndex = 0; rowIndex < initialValues.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < initialValues[rowIndex].length; columnIndex += 1) {
        const cell = page.locator("table tr").nth(rowIndex).locator("th, td").nth(columnIndex)
        await cell.click()
        await page.keyboard.type(initialValues[rowIndex][columnIndex])
      }
    }

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table reorder anchor metrics are missing")
    }

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await expect(rowGrip).toBeVisible()
    const lastRowBox = await page.locator("table tr").nth(2).boundingBox()
    if (!lastRowBox) {
      throw new Error("table row reorder handle metrics are missing")
    }

    await rowGrip.evaluate(async (element, payload) => {
      const { pointerId, targetY } = payload as { pointerId: number; targetY: number }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: targetY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: startX,
          clientY: targetY,
        })
      )
      await waitForFrame()
    }, { pointerId: 11, targetY: lastRowBox.y + lastRowBox.height + 18 })

    await expect
      .poll(async () => (await readTableGrid(page)).map((row) => row[0]))
      .toEqual(["r2c1", "r3c1", "r1c1"])

    const reorderedFirstCellBox = await page.locator("table tr").first().locator("th, td").first().boundingBox()
    if (!reorderedFirstCellBox) {
      throw new Error("table reordered first cell metrics are missing")
    }

    await page.mouse.move(
      reorderedFirstCellBox.x + reorderedFirstCellBox.width / 2,
      reorderedFirstCellBox.y + 3
    )
    await expect(columnGrip).toBeVisible()
    await expect(columnGrip).toBeVisible()
    const firstRowLastCellBox = await page.locator("table tr").first().locator("th, td").nth(2).boundingBox()
    if (!firstRowLastCellBox) {
      throw new Error("table column reorder handle metrics are missing")
    }

    await columnGrip.evaluate(async (element, payload) => {
      const { pointerId, sourceX, targetX } = payload as { pointerId: number; sourceX: number; targetX: number }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = sourceX
      const startY = rect.top + rect.height / 2
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: targetX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: targetX,
          clientY: startY,
        })
      )
      await waitForFrame()
    }, {
      pointerId: 12,
      sourceX: reorderedFirstCellBox.x + reorderedFirstCellBox.width / 2,
      targetX: firstRowLastCellBox.x + firstRowLastCellBox.width + 48,
    })

    await expect
      .poll(async () => (await readTableGrid(page))[0])
      .toEqual(["r2c2", "r2c3", "r2c1"])

    await expect
      .poll(async () => {
        const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
        return (
          markdown.includes("| r2c2 | r2c3 | r2c1 |") &&
          markdown.includes("| r3c2 | r3c3 | r3c1 |") &&
          markdown.includes("| r1c2 | r1c3 | r1c1 |")
        )
      })
      .toBe(true)

    const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(markdown.replace(/\n/g, "\\n"))}`)

    await expect
      .poll(async () => (await readTableGrid(page)).map((row) => row[0]))
      .toEqual(["r2c2", "r3c2", "r1c2"])
    await expect
      .poll(async () => (await readTableGrid(page))[0])
      .toEqual(["r2c2", "r2c3", "r2c1"])
  })

  test("table row resize handle은 drag 후 row height를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    const beforeHeight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
    )
    await page.getByRole("button", { name: "QA 행 리사이즈" }).click()

    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) =>
          Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
        )
      )
      .toBeGreaterThan(beforeHeight)

    await expect(page.getByTestId("qa-markdown-output")).toContainText('"rowHeights"')
  })
})
