import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
  getWordDragPoints,
  getTableAffordances,
  moveToTableCellAxisHotzone,
} from "./helpers/editorAuthoringFlow"
import { mockEditorRouteWithSevenByThreeTable } from "./helpers/editorTableFixtures"

test.describe("editor authoring table affordances", () => {
  test("wide table hover 중 wheel 입력은 page scroll chain을 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 980, height: 900 })
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    const wideTableMarkdown = [
      "| A | B | C | D | E | F | G |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
      "| aa | bb | cc | dd | ee | ff | gg |",
    ].join("\n")
    await editor.evaluate((element, markdown) => {
      const data = new DataTransfer()
      data.setData("text/plain", markdown)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, wideTableMarkdown)

    const tableWrapper = page.locator(".aq-block-editor__content .tableWrapper").first()
    const table = tableWrapper.locator("table")
    await expect(tableWrapper).toBeVisible()
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await page.evaluate(() => {
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "qa-scroll-spacer")
      spacer.style.height = "2400px"
      document.body.appendChild(spacer)
    })

    await tableWrapper.scrollIntoViewIfNeeded()
    const box = await tableWrapper.boundingBox()
    if (!box) {
      throw new Error("table wrapper metrics are missing before wheel")
    }
    const overflowContract = await tableWrapper.evaluate((element) => {
      const style = window.getComputedStyle(element as HTMLElement)
      return {
        overscrollY: (style as CSSStyleDeclaration & { overscrollBehaviorY?: string }).overscrollBehaviorY || "",
        touchAction: style.touchAction,
      }
    })
    expect(overflowContract.overscrollY || "auto").toBe("auto")
    expect(overflowContract.touchAction === "auto" || overflowContract.touchAction.includes("pan-y")).toBe(true)

    await page.mouse.move(box.x + Math.min(box.width / 2, 120), box.y + Math.min(box.height / 2, 40))

    const beforeScrollY = await page.evaluate(() => window.scrollY)
    await page.mouse.wheel(0, 420)

    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScrollY + 120)
  })

  test("table hover에서도 block selection affordance를 다시 띄우고 table block selection으로 전환할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const {
      columnHandle,
      rowHandle,
      columnAddButton,
      rowAddButton,
      growHandle: tableGrowHandle,
      structureMenuButton: tableStructureMenuButton,
      cellMenuButton: tableCellMenuButton,
    } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    await firstTableCell.hover()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(page.getByTestId("table-corner-handle")).toHaveCount(0)
    await expect(tableGrowHandle).toHaveCount(0)
    await expect(tableStructureMenuButton).toHaveCount(0)
    await expect(tableCellMenuButton).toBeVisible()
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
    await expect(page.getByTestId("table-bubble-toolbar")).toHaveCount(0)

    const tableWidthShape = await page.evaluate(() => {
      const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
      const wrapper = document.querySelector<HTMLElement>(
        ".aq-block-editor__content .tableWrapper"
      )
      const table = wrapper?.querySelector<HTMLElement>("table")
      if (!contentRoot || !wrapper || !table) return null
      return {
        contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        firstCellWidth: Math.round(
          (table.querySelector("th, td") as HTMLElement | null)?.getBoundingClientRect().width || 0
        ),
      }
    })
    expect(tableWidthShape).not.toBeNull()
    if (!tableWidthShape) {
      throw new Error("table wrapper/table width shape is missing")
    }
    expect(Math.abs(tableWidthShape.wrapperWidth - tableWidthShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(tableWidthShape.tableWidth).toBeLessThan(tableWidthShape.contentWidth - 120)
    expect(tableWidthShape.firstCellWidth).toBeGreaterThanOrEqual(180)
    expect(tableWidthShape.firstCellWidth).toBeLessThanOrEqual(320)

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing")
    }
    const trailingParagraph = page.locator(".aq-block-editor__content > p").last()
    await expect(trailingParagraph).toBeVisible()
    await trailingParagraph.click()
    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    await expect(columnHandle).toBeVisible()
    await expect(rowHandle).toBeVisible()
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
    await expect(tableGrowHandle).toHaveCount(0)
    await expect(tableStructureMenuButton).toHaveCount(0)
    await expect(tableCellMenuButton).toHaveCount(0)

    const [columnGripRect, rowGripRect] = await Promise.all(
      [columnHandle, rowHandle].map((locator) =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { width: Math.round(rect.width), height: Math.round(rect.height) }
        })
      )
    )
    expect(columnGripRect.width).toBeGreaterThan(columnGripRect.height)
    expect(rowGripRect.height).toBeGreaterThan(rowGripRect.width)

    await page.mouse.move(tableBox.x + 42, tableBox.y + 24)

    await expect(tableCellMenuButton).toBeVisible()
    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(tableGrowHandle).toHaveCount(0)
    await expect(tableStructureMenuButton).toHaveCount(0)

    const cellMenuRect = await tableCellMenuButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
    expect(cellMenuRect.width).toBeLessThanOrEqual(24)
    expect(cellMenuRect.height).toBeLessThanOrEqual(24)

    await page.mouse.move(tableBox.x + tableBox.width - 8, tableBox.y + 8)
    await page.mouse.move(tableBox.x + tableBox.width - 6, tableBox.y + 6)

    await expect(tableGrowHandle).toBeVisible()
    await expect(tableStructureMenuButton).toBeVisible()
    await expect(tableCellMenuButton).toHaveCount(0)

    const [growHandleRect, structureMenuRect] = await Promise.all(
      [tableGrowHandle, tableStructureMenuButton].map((locator) =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
          }
        })
      )
    )
    expect(growHandleRect.width).toBeLessThanOrEqual(26)
    expect(growHandleRect.height).toBeLessThanOrEqual(26)
    expect(structureMenuRect.width).toBeLessThanOrEqual(26)
    expect(structureMenuRect.height).toBeLessThanOrEqual(26)

    await page.mouse.click(
      structureMenuRect.left + structureMenuRect.width / 2,
      structureMenuRect.top + structureMenuRect.height / 2
    )
    await expect(page.getByTestId("table-table-menu")).toBeVisible()
    await page.mouse.move(tableBox.x + tableBox.width - 8, tableBox.y + tableBox.height - 8)
    await expect(columnAddButton).toBeVisible()
    await expect(rowAddButton).toBeVisible()

    const [columnAddRect, rowAddRect] = await Promise.all(
      [columnAddButton, rowAddButton].map((locator) =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          }
        })
      )
    )
    expect(Math.abs(columnAddRect.width - columnAddRect.height)).toBeLessThanOrEqual(4)
    expect(Math.abs(rowAddRect.width - rowAddRect.height)).toBeLessThanOrEqual(4)

    const edgeAlignment = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper table")
      const columnAddBar = document.querySelector<HTMLElement>("[data-table-affordance='column-add']")
      const rowAddBar = document.querySelector<HTMLElement>("[data-table-affordance='row-add']")
      if (!table || !columnAddBar || !rowAddBar) return null

      const tableRect = table.getBoundingClientRect()
      const columnAddRect = columnAddBar.getBoundingClientRect()
      const rowAddRect = rowAddBar.getBoundingClientRect()
      return {
        columnEdgeCenterGap: Math.round(columnAddRect.left + columnAddRect.width / 2 - tableRect.right),
        rowEdgeCenterGap: Math.round(rowAddRect.top + rowAddRect.height / 2 - tableRect.bottom),
        columnVerticalCenterGap: Math.round(
          columnAddRect.top + columnAddRect.height / 2 - (tableRect.top + tableRect.height / 2)
        ),
        rowHorizontalCenterGap: Math.round(
          rowAddRect.left + rowAddRect.width / 2 - (tableRect.left + tableRect.width / 2)
        ),
      }
    })
    expect(edgeAlignment).not.toBeNull()
    if (!edgeAlignment) {
      throw new Error("table edge alignment metrics are missing")
    }
    expect(Math.abs(edgeAlignment.columnEdgeCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.rowEdgeCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.columnVerticalCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.rowHorizontalCenterGap)).toBeLessThanOrEqual(18)

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-selection-outline")).toHaveCount(0)
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(page.getByTestId("table-row-menu").getByRole("button", { name: "행 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("table-row-menu")).toHaveCount(0)

    await page.mouse.move(tableBox.x + tableBox.width - 3, tableBox.y + tableBox.height - 3)
    await columnAddButton.click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    await rowAddButton.click()
    await expect(page.locator("table tr")).toHaveCount(4)

    await page.keyboard.press("Escape")
    await expect(page.getByTestId("table-row-menu")).toHaveCount(0)
    await expect(page.getByTestId("table-column-menu")).toHaveCount(0)
    const readCurrentTableBox = async (label: string) => {
      const currentTableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
      if (!currentTableBox) throw new Error(`${label} table bounding box is missing`)
      return currentTableBox
    }
    const expandedTableBox = await readCurrentTableBox("expanded")
    await page.mouse.move(expandedTableBox.x + expandedTableBox.width / 2, expandedTableBox.y + 3)
    await expect(columnHandle).toBeVisible()
    const columnHandleBox = await columnHandle.boundingBox()
    if (!columnHandleBox) throw new Error("column handle bounding box is missing")
    await page.mouse.click(columnHandleBox.x + columnHandleBox.width / 2, columnHandleBox.y + columnHandleBox.height / 2)
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-selection-outline")).toHaveCount(0)
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "열 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("table-column-menu")).toHaveCount(0)

    const blockDragHandle = page.getByTestId("block-drag-handle")
    const moveToBlockHandleHotzone = async () => {
      for (const point of [
        { x: 24, y: 24 },
        { x: 18, y: 18 },
        { x: 32, y: 28 },
        { x: -24, y: 24 },
        { x: -36, y: 32 },
      ]) {
        const currentTableBox = await readCurrentTableBox("block handle hotzone")
        await page.mouse.move(currentTableBox.x + currentTableBox.width / 2, currentTableBox.y + currentTableBox.height / 2)
        await page.mouse.move(currentTableBox.x + point.x, currentTableBox.y + point.y, { steps: 4 })
        await page.waitForTimeout(80)
        if (await blockDragHandle.isVisible().catch(() => false)) return
      }
    }
    await moveToBlockHandleHotzone()
    await expect(blockDragHandle).toBeVisible()
    await blockDragHandle.click()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()

    const moveToColumnGripHotzone = async () => {
      for (const point of [
        { x: 3, y: 3 },
        { x: 6, y: 3 },
        { x: 12, y: 3 },
      ]) {
        const currentTableBox = await readCurrentTableBox("column grip hotzone")
        await page.mouse.move(currentTableBox.x + currentTableBox.width / 2, currentTableBox.y + currentTableBox.height / 2)
        await page.mouse.move(currentTableBox.x + point.x, currentTableBox.y + point.y, { steps: 4 })
        await page.waitForTimeout(80)
        if (await columnHandle.isVisible().catch(() => false)) return
      }
    }
    await moveToColumnGripHotzone()
    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
  })

  test("table rail segment selection은 fallback rect에서도 native text selection 없이 전체 열을 선택한다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    await page.getByRole("button", { name: "QA fallback 열 선택" }).click()

    const rowCount = await page.locator("table tr").count()
    await expect
      .poll(async () => page.locator(".aq-block-editor__content .selectedCell").count())
      .toBe(rowCount)
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString() || ""))
      .toBe("")
  })

  test("실제 /editor/[id] 7x3 table은 셀 텍스트 선택 뒤 row/column grip 클릭으로 축 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 920 })
    const { editor } = await mockEditorRouteWithSevenByThreeTable(page, {
      postId: 993,
      title: "7x3 table axis route 글",
    })
    const { columnHandle, rowHandle } = getTableAffordances(page)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    const dragAccessTokenNativeSelection = async () => {
      await page.evaluate(() => window.getSelection()?.removeAllRanges())
      const points = await getWordDragPoints(targetCell, "Access Token")
      await page.mouse.move(points.startX, points.startY)
      await page.mouse.down()
      await page.mouse.move(points.endX, points.endY, { steps: 18 })
      await page.mouse.up()
      await expect
        .poll(async () => page.evaluate(() => window.getSelection()?.toString() || ""))
        .toContain("Access Token")
    }
    await dragAccessTokenNativeSelection()

    await moveToTableCellAxisHotzone(page, {
      axis: "row",
      cellText: "Access Token",
      label: "7x3 route row grip",
      tableText: "재발급 로직",
    })
    await expect(rowHandle).toBeVisible()
    await rowHandle.click()

    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(page.getByTestId("table-row-menu").getByRole("button", { name: "행 삭제" })).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)

    await page.keyboard.press("Escape")
    await dragAccessTokenNativeSelection()

    await moveToTableCellAxisHotzone(page, {
      axis: "column",
      cellText: "Access Token",
      label: "7x3 route column grip",
      tableText: "재발급 로직",
    })
    await expect(columnHandle).toBeVisible()
    await columnHandle.click()

    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(page.getByTestId("table-column-menu").getByRole("button", { name: "열 삭제" })).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("table axis rail hover 전환 중에도 target axis anchor가 끊기지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle, rowHandle } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const targetCell = page.locator("table tr").nth(2).locator("th, td").nth(1)
    await targetCell.click()
    await targetCell.hover()

    const targetMetrics = await targetCell.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing")
    }

    await page.mouse.move(tableBox.x + 6, targetMetrics.top + targetMetrics.height / 2)
    await expect(rowHandle).toBeVisible()
    const rowRailRect = await rowHandle.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    expect(Math.abs(rowRailRect.top + rowRailRect.height / 2 - (targetMetrics.top + targetMetrics.height / 2))).toBeLessThanOrEqual(8)

    await page.mouse.click(rowRailRect.left + rowRailRect.width / 2, rowRailRect.top + rowRailRect.height / 2)
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "행 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(rowMenu).toHaveCount(0)

    await targetCell.click()
    await targetCell.hover()
    const columnTargetMetrics = await targetCell.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { left: Math.round(rect.left), width: Math.round(rect.width) }
    })
    const columnTableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!columnTableBox) {
      throw new Error("table bounding box is missing before column axis hover")
    }
    const columnTargetCenter = columnTargetMetrics.left + columnTargetMetrics.width / 2
    await expect
      .poll(async () => {
        await page.mouse.move(columnTargetCenter, columnTableBox.y + 24)
        await page.mouse.move(columnTargetCenter, columnTableBox.y + 6)
        const box = await columnHandle.boundingBox()
        return box ? Math.abs(box.x + box.width / 2 - columnTargetCenter) : Number.POSITIVE_INFINITY
      })
      .toBeLessThanOrEqual(8)
  })

  test("table menu는 좁은 뷰포트에서도 화면 내부에 배치된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    const structureMenuButton = page.getByTestId("table-structure-menu-button")
    await expect(structureMenuButton).toBeVisible()
    await structureMenuButton.click()

    const menu = page.getByTestId("table-table-menu")
    await expect(menu).toBeVisible()
    const inViewport = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const padding = 4
      return (
        rect.left >= padding &&
        rect.top >= padding &&
        rect.right <= window.innerWidth - padding &&
        rect.bottom <= window.innerHeight - padding
      )
    })
    expect(inViewport).toBe(true)
  })

  test("desktop table handle은 viewport 내부를 유지하고 열 추가·삭제 뒤 폭 계약이 유지된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    const moveToRowColumnHotzone = async () => {
      const firstCellBox = await page.locator(".aq-block-editor__content .tableWrapper table tr:first-child > *").first().boundingBox()
      if (!firstCellBox) {
        throw new Error("first table cell bounding box is missing")
      }
      await page.mouse.move(firstCellBox.x + 8, firstCellBox.y + 8)
    }

    const moveToTrailingHotzone = async () => {
      const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
      if (!tableBox) {
        throw new Error("table bounding box is missing")
      }
      await page.mouse.move(tableBox.x + tableBox.width - 8, tableBox.y + tableBox.height - 8)
    }

    const assertHandlesInViewport = async () => {
      await moveToTrailingHotzone()

      const readAddMetrics = async () =>
        page.evaluate(() => {
          const viewportWidth = window.innerWidth
          const viewportHeight = window.innerHeight
          const columnAddBar = document.querySelector<HTMLElement>("[data-table-affordance='column-add']")
          const rowAddBar = document.querySelector<HTMLElement>("[data-table-affordance='row-add']")
          const table = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper table")
          const content = document.querySelector<HTMLElement>(".aq-block-editor__content")
          if (!columnAddBar || !rowAddBar || !table || !content) return null

          const toRect = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect()
            return {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
              width: Math.round(rect.width),
            }
          }

          const withinViewport = (rect: { left: number; top: number; right: number; bottom: number }) =>
            rect.left >= 8 &&
            rect.top >= 8 &&
            rect.right <= viewportWidth - 8 &&
            rect.bottom <= viewportHeight - 8

          return {
            tableWidth: Math.round(table.getBoundingClientRect().width),
            contentWidth: Math.round(content.getBoundingClientRect().width),
            columnAddBar: toRect(columnAddBar),
            rowAddBar: toRect(rowAddBar),
            rowAddWithinViewport: withinViewport(toRect(rowAddBar)),
            columnAddWithinViewport: withinViewport(toRect(columnAddBar)),
            columnCount: table.querySelectorAll("tr:first-child > th, tr:first-child > td").length,
          }
        })

      await expect
        .poll(
          async () => {
            const metrics = await readAddMetrics()
            if (!metrics) return null
            return {
              widthStable: metrics.tableWidth <= metrics.contentWidth + 2,
              rowAddWithinViewport: metrics.rowAddWithinViewport,
              columnAddWithinViewport: metrics.columnAddWithinViewport,
            }
          },
          { timeout: 5000 }
        )
        .toMatchObject({
          widthStable: true,
          rowAddWithinViewport: true,
          columnAddWithinViewport: true,
        })

      const addMetrics = await readAddMetrics()
      expect(addMetrics).not.toBeNull()
      if (!addMetrics) {
        throw new Error("desktop table add-bar viewport metrics are missing")
      }

      expect(addMetrics.tableWidth).toBeLessThanOrEqual(addMetrics.contentWidth + 2)
      expect(addMetrics.rowAddWithinViewport).toBe(true)
      expect(addMetrics.columnAddWithinViewport).toBe(true)

      return addMetrics
    }

    const beforeMetrics = await assertHandlesInViewport()
    expect(beforeMetrics.columnCount).toBe(3)

    await moveToRowColumnHotzone()
    await columnHandle.click()
    const columnMenu = page.getByTestId("table-column-menu")
    await columnMenu.getByRole("button", { name: "오른쪽 열 추가" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    const afterInsertMetrics = await assertHandlesInViewport()
    expect(afterInsertMetrics.columnCount).toBe(4)

    await moveToRowColumnHotzone()
    await columnHandle.click()
    await columnMenu.getByRole("button", { name: "열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    const afterDeleteMetrics = await assertHandlesInViewport()
    expect(afterDeleteMetrics.columnCount).toBe(3)
  })

  test("writer surface의 row/column grip은 edge hover에서만 노출된다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)
    const { columnHandle, rowHandle, columnAddButton, rowAddButton, growHandle, structureMenuButton, cellMenuButton } =
      getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("writer table bounding box is missing")
    }
    const moveToTableCenter = async () => {
      await page.mouse.move(tableBox.x + tableBox.width / 2, tableBox.y + tableBox.height / 2, { steps: 4 })
    }

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    await expect(columnHandle).toBeVisible()
    await expect(rowHandle).toBeVisible()
    await expect(growHandle).toHaveCount(0)
    await expect(structureMenuButton).toHaveCount(0)
    await expect(cellMenuButton).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    await moveToTableCenter()
    await page.mouse.move(tableBox.x + tableBox.width - 6, tableBox.y + 6, { steps: 6 })

    await expect(growHandle).toBeVisible()
    await expect(structureMenuButton).toBeVisible()
    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(cellMenuButton).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
  })

  test("writer surface의 multi-table hover는 hovered table 기준으로 cell menu를 고정하고 block drag handle을 유지한다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)
    const { cellMenuButton } = getTableAffordances(page)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstTableForSetup = page.locator(".aq-block-editor__content .tableWrapper table").first()
    const firstSetupBox = await firstTableForSetup.boundingBox()
    if (!firstSetupBox) {
      throw new Error("writer first table bounding box is missing before multi-table setup")
    }

    await page.mouse.click(firstSetupBox.x + 40, firstSetupBox.y + firstSetupBox.height + 28)
    await page.keyboard.type("중간 문단 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type("중간 문단 2")
    await page.keyboard.press("Enter")
    await page.keyboard.type("중간 문단 3")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const tables = page.locator(".aq-block-editor__content .tableWrapper table")
    await expect(tables).toHaveCount(2)

    const secondTableCell = tables.nth(1).locator("th, td").nth(1)
    await secondTableCell.scrollIntoViewIfNeeded()
    await secondTableCell.click()
    await page.waitForTimeout(1_160)

    const firstTable = tables.first()
    await firstTable.scrollIntoViewIfNeeded()
    const firstTableBox = await firstTable.boundingBox()
    if (!firstTableBox) {
      throw new Error("writer first table bounding box is missing")
    }

    const firstTableCell = firstTable.locator("th, td").first()
    await firstTableCell.hover()
    const firstTableCellBox = await firstTableCell.boundingBox()
    if (!firstTableCellBox) {
      throw new Error("writer first table cell bounding box is missing")
    }
    await page.mouse.move(firstTableCellBox.x + firstTableCellBox.width / 2, firstTableCellBox.y + firstTableCellBox.height / 2)

    const cellMenuMetrics = await cellMenuButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      }
    })

    expect(cellMenuMetrics.top).toBeGreaterThanOrEqual(Math.round(firstTableBox.y) - 12)
    expect(cellMenuMetrics.bottom).toBeLessThanOrEqual(Math.round(firstTableBox.y + firstTableBox.height) + 24)

    await page.mouse.move(firstTableBox.x + 24, firstTableBox.y + 24)
    await expect(page.getByTestId("block-drag-handle")).toBeVisible()
  })

  test("writer surface의 pasted 4열 table에서도 row/column menu가 계속 동작한다", async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1500 })
    await page.goto(QA_WRITER_ROUTE)
    const { rowHandle: rowMenuButton, columnHandle: columnMenuButton } = getTableAffordances(page)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()

    const tableMarkdown = [
      "| 축 | 대표 지표 | 의미 | 자주 하는 오해 |",
      "| --- | --- | --- | --- |",
      "| 처리량 | TPS / RPS | 초당 얼마나 많은 요청과 트랜잭션을 처리하는가 | 처리량이 높으면 시스템이 건강하다고 생각함 |",
      "| 지연 | P95 / P99 | 느린 요청의 꼬리 지연을 확인 | 평균 응답 시간만 보고 빠르다고 결론냄 |",
      "| 안정성 | Error Rate | 타임아웃, 5xx, 재시도 증가를 포함해 실패를 측정 | 에러를 일시적 네트워크 문제로만 봄 |",
      "| 자원 | CPU, 메모리, 스레드, 커넥션 | 병목이 애플리케이션인지 인프라인지 좁히는 단서 | 리소스가 남아 있으면 안전하다고 생각함 |",
    ].join("\n")

    await editor.evaluate((element, markdown) => {
      const data = new DataTransfer()
      data.setData("text/plain", markdown)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, tableMarkdown)

    const table = page.locator(".aq-block-editor__content .tableWrapper table")
    await expect(table.locator("tr")).toHaveCount(5)
    await expect(table.locator("tr").first().locator("th, td")).toHaveCount(4)

    const firstTableCell = table.locator("tr").first().locator("th, td").first()
    await firstTableCell.click()
    const getRenderedTableBox = async () => {
      const box = await table.boundingBox()
      if (!box) throw new Error("writer rendered pasted table bounding box is missing")
      return box
    }
    const clickVisibleAxisHandle = async (handle: typeof rowMenuButton, label: string) => {
      await expect(handle).toBeVisible()
      const box = await handle.boundingBox()
      if (!box) throw new Error(`${label} handle bounding box is missing`)
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    }
    const resetToFirstTableCell = async () => { await page.keyboard.press("Escape"); await firstTableCell.click({ position: { x: 16, y: 16 } }) }
    const moveToRowHotzone = async () => { const box = await getRenderedTableBox(); await page.mouse.move(box.x + 8, box.y + 36) }
    const moveToColumnHotzone = async () => { const box = await getRenderedTableBox(); await page.mouse.move(box.x + Math.min(96, box.width / 4), box.y + 6) }
    await moveToRowHotzone()

    await expect(rowMenuButton).toBeVisible()

    await clickVisibleAxisHandle(rowMenuButton, "writer pasted row")
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await page.waitForTimeout(50)
    await rowMenu.getByRole("button", { name: "아래에 행 추가" }).click()
    await expect(table.locator("tr")).toHaveCount(6)

    await resetToFirstTableCell()
    await moveToColumnHotzone()
    await clickVisibleAxisHandle(columnMenuButton, "writer pasted column")
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await page.waitForTimeout(50)
    await columnMenu.getByRole("button", { name: "오른쪽 열 추가" }).click()
    await expect(table.locator("tr").first().locator("th, td")).toHaveCount(5)

  })
})
