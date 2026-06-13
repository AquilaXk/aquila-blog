import { expect, test } from "./helpers/authoringPlaywright"
import type { Locator, Page } from "./helpers/authoringPlaywright"
import {
  QA_ENGINE_ROUTE,
  getTableAffordances,
  getWordDragPoints,
  moveToTableCellAxisHotzone,
  selectWordInEditable,
  setWordSelectionInEditable,
} from "./helpers/editorAuthoringFlow"

const openCellMenuForCell = async (page: Page, cell: Locator) => {
  const { cellMenuButton } = getTableAffordances(page)
  const cellMenu = page.getByTestId("table-cell-menu")

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await cell.click()
      await page.mouse.move(16, 16)
      await cell.hover()
      await expect(cellMenuButton).toBeVisible({ timeout: 1_500 })
      await cellMenuButton.click()
      await page.waitForTimeout(80)
      if (await cellMenu.isVisible().catch(() => false)) return cellMenu
    } catch (error) {
      if (attempt === 2) throw error
      await page.keyboard.press("Escape").catch(() => {})
      await cellMenu.waitFor({ state: "hidden", timeout: 500 }).catch(() => {})
    }
  }

  throw new Error("table cell menu did not open for active cell")
}

const clickStableCellMenuButton = async (page: Page, cell: Locator, name: string) => {
  const cellMenu = page.getByTestId("table-cell-menu")

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const menu =
      attempt === 0 && (await cellMenu.isVisible().catch(() => false))
        ? cellMenu
        : await openCellMenuForCell(page, cell)
    const button = menu.getByRole("button", { name })
    try {
      await expect(button).toBeVisible({ timeout: 1_000 })
      await expect(button).toBeEnabled({ timeout: 1_000 })
      await button.click({ timeout: 1_000 })
      return
    } catch (error) {
      if (attempt === 3) throw error
      await page.keyboard.press("Escape").catch(() => {})
      await cellMenu.waitFor({ state: "hidden", timeout: 500 }).catch(() => {})
    }
  }
}

test.describe("editor authoring table structure and styles", () => {
  test("모바일 뷰포트에서는 표만 wrapper 내부 가로 스크롤을 사용하고 페이지 전체 overflow는 생기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle, rowHandle, growHandle, structureMenuButton, cellMenuButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(growHandle).toHaveCount(0)
    await expect(cellMenuButton).toHaveCount(0)
    await expect(structureMenuButton).toBeVisible()

    for (let index = 0; index < 8; index += 1) {
      await page.getByRole("button", { name: "QA 열 추가" }).click()
    }
    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "QA 열 리사이즈" }).click()
    }

    const metrics = await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      if (!wrapper) return null

      const wrapperStyle = window.getComputedStyle(wrapper)
      wrapper.scrollLeft = wrapper.scrollWidth

      return {
        viewportWidth: Math.round(window.innerWidth),
        pageScrollWidth: Math.round(document.documentElement.scrollWidth),
        wrapperClientWidth: Math.round(wrapper.clientWidth),
        wrapperScrollWidth: Math.round(wrapper.scrollWidth),
        wrapperScrollLeft: Math.round(wrapper.scrollLeft),
        wrapperOverflowX: wrapperStyle.overflowX,
        wrapperTouchAction: wrapperStyle.touchAction,
        wrapperOverscrollBehaviorX:
          (wrapperStyle as CSSStyleDeclaration & { overscrollBehaviorX?: string }).overscrollBehaviorX ||
          "",
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) {
      throw new Error("mobile table wrapper metrics are missing")
    }

    expect(["auto", "scroll"]).toContain(metrics.wrapperOverflowX)
    expect(metrics.wrapperTouchAction).toContain("pan-x")
    expect(metrics.wrapperOverscrollBehaviorX || "auto").toBe("contain")
    expect(metrics.wrapperScrollWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    if (metrics.wrapperScrollWidth > metrics.wrapperClientWidth) {
      expect(metrics.wrapperScrollLeft).toBeGreaterThan(0)
    }
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2)
  })

  test("넓은 붙여넣기 표는 wide mode로 승격되어 wrapper 내부 가로 스크롤을 사용한다", async ({
    page,
  }) => {
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

    const wrapper = page.locator(".aq-block-editor__content .tableWrapper").first()
    const table = wrapper.locator("table")
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')

    const metrics = await page.evaluate(() => {
      const wrapperElement = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      const tableElement = wrapperElement?.querySelector<HTMLElement>("table")
      const firstCell = tableElement?.querySelector<HTMLElement>("th, td")
      if (!wrapperElement || !tableElement || !firstCell) return null

      wrapperElement.scrollLeft = wrapperElement.scrollWidth

      return {
        viewportWidth: Math.round(window.innerWidth),
        pageScrollWidth: Math.round(document.documentElement.scrollWidth),
        wrapperClientWidth: Math.round(wrapperElement.clientWidth),
        wrapperScrollWidth: Math.round(wrapperElement.scrollWidth),
        wrapperScrollLeft: Math.round(wrapperElement.scrollLeft),
        tableWidth: Math.round(tableElement.getBoundingClientRect().width),
        firstCellWidth: Math.round(firstCell.getBoundingClientRect().width),
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) {
      throw new Error("wide pasted table metrics are missing")
    }

    expect(metrics.firstCellWidth).toBeGreaterThanOrEqual(170)
    expect(metrics.tableWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    expect(metrics.wrapperScrollWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    if (metrics.wrapperScrollWidth > metrics.wrapperClientWidth) {
      expect(metrics.wrapperScrollLeft).toBeGreaterThan(0)
    }
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2)
  })

  test("table corner grow handle은 row/column을 함께 확장하고 trailing empty axis만 축소한다", async ({ page }) => {
    const tableLocator = page.locator(".aq-block-editor__content .tableWrapper table").first()
    const hoverTableCorner = async () => {
      const tableBox = await tableLocator.boundingBox()
      if (!tableBox) {
        throw new Error("table bounding box is missing before grow handle hover")
      }
      await tableLocator.hover({
        position: {
          x: Math.max(2, Math.round(tableBox.width) - 4),
          y: 6,
        },
      })
    }

    const clickVisibleGrowHandle = async () => {
      await expect
        .poll(() =>
          page.evaluate(() => {
            const button = document.querySelector('[data-testid="table-corner-grow-handle"]')
            return button instanceof HTMLButtonElement
          })
        )
        .toBe(true)
      await page.evaluate(() => {
        const button = document.querySelector('[data-testid="table-corner-grow-handle"]')
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error("table corner grow handle is not attached")
        }
        button.click()
      })
    }

    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await hoverTableCorner()

    const growHandle = page.getByTestId("table-corner-grow-handle")
    await expect(growHandle).toBeVisible()

    const before = await page.evaluate(() => {
      const firstRow = document.querySelector("table tr")
      return {
        rows: document.querySelectorAll("table tr").length,
        columns: firstRow?.children.length ?? 0,
      }
    })

    await clickVisibleGrowHandle()

    await expect
      .poll(async () => await page.locator("table tr").count())
      .toBeGreaterThan(before.rows)
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const firstRow = document.querySelector("table tr")
            return firstRow?.children.length ?? 0
          })
      )
      .toBeGreaterThan(before.columns)

    const afterGrow = await page.evaluate(() => {
      const firstRow = document.querySelector("table tr")
      return {
        rows: document.querySelectorAll("table tr").length,
        columns: firstRow?.children.length ?? 0,
      }
    })

    const stepMetrics = await growHandle.evaluate((element) => ({
      columnStep: Number((element as HTMLElement).dataset.columnStep || "0"),
      rowStep: Number((element as HTMLElement).dataset.rowStep || "0"),
    }))
    expect(stepMetrics.columnStep).toBeGreaterThan(0)
    expect(stepMetrics.rowStep).toBeGreaterThan(0)

    await growHandle.evaluate(async (element, payload) => {
      const { pointerId, padding } = payload as {
        pointerId: number
        padding: number
      }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const columnStep = Number((element as HTMLElement).dataset.columnStep || "0")
      const rowStep = Number((element as HTMLElement).dataset.rowStep || "0")
      if (!Number.isFinite(columnStep) || !Number.isFinite(rowStep) || columnStep <= 0 || rowStep <= 0) {
        throw new Error("table corner shrink step metrics are missing")
      }
      const currentX = startX - columnStep - padding
      const currentY = startY - rowStep - padding
      const qaWindow = window as Window & {
        __qaTableGrowPointer?: {
          pointerId: number
          clientX: number
          clientY: number
        }
      }
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      qaWindow.__qaTableGrowPointer = { pointerId, clientX: currentX, clientY: currentY }
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
          clientX: currentX,
          clientY: currentY,
        })
      )
      await waitForFrame()
    }, { pointerId: 31, padding: 8 })

    await expect(page.getByTestId("table-corner-preview-outline")).toBeVisible()
    await expect(page.locator("table tr")).toHaveCount(afterGrow.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(afterGrow.columns)

    await page.evaluate(async () => {
      const qaWindow = window as Window & {
        __qaTableGrowPointer?: {
          pointerId: number
          clientX: number
          clientY: number
        }
      }
      const state = qaWindow.__qaTableGrowPointer
      if (!state) {
        throw new Error("table corner grow pointer state is missing before pointerup")
      }
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId: state.pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: state.clientX,
          clientY: state.clientY,
        })
      )
      await waitForFrame()
      delete qaWindow.__qaTableGrowPointer
    })

    await expect(page.locator("table tr")).toHaveCount(before.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(before.columns)

    const trailingCell = page
      .locator("table tr")
      .nth(before.rows - 1)
      .locator("th, td")
      .nth(before.columns - 1)
    const trailingCellBox = await trailingCell.boundingBox()
    if (!trailingCellBox)
      throw new Error("table grow trailing cell metrics are missing")
    await page.mouse.click(
      trailingCellBox.x + Math.min(18, trailingCellBox.width / 2),
      trailingCellBox.y + Math.min(18, trailingCellBox.height / 2)
    )
    await page.keyboard.insertText("keep")
    await expect(trailingCell).toContainText("keep")
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain("keep")
    await hoverTableCorner()
    await expect(growHandle).toBeVisible()

    await growHandle.evaluate(async (element, payload) => {
      const { pointerId, padding } = payload as {
        pointerId: number
        padding: number
      }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const columnStep = Number((element as HTMLElement).dataset.columnStep || "0")
      const rowStep = Number((element as HTMLElement).dataset.rowStep || "0")
      if (!Number.isFinite(columnStep) || !Number.isFinite(rowStep) || columnStep <= 0 || rowStep <= 0) {
        throw new Error("table corner blocked shrink step metrics are missing")
      }
      const currentX = startX - columnStep - padding
      const currentY = startY - rowStep - padding
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
          clientX: currentX,
          clientY: currentY,
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
          clientX: currentX,
          clientY: currentY,
        })
      )
      await waitForFrame()
    }, { pointerId: 32, padding: 8 })

    await expect(page.locator("table tr")).toHaveCount(before.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(before.columns)
    await expect(trailingCell).toContainText("keep")
  })

  test("table 구조 메뉴는 폭 정책과 삭제만 담는 compact popover를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    const table = page.locator(".aq-block-editor__content .tableWrapper table").first()
    const tableBox = await table.boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing before structure menu hover")
    }
    await page.mouse.move(tableBox.x + tableBox.width - 6, tableBox.y + 6)

    const structureMenuButton = page.getByTestId("table-structure-menu-button")
    await expect(structureMenuButton).toBeVisible()
    await structureMenuButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(3)
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "좌측" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "배경 해제" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "제목 행" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "제목 열" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "페이지 너비에 맞춤" })).toBeVisible()
    await expect(tableMenu.getByRole("button", { name: "넓은 표" })).toBeVisible()
    await expect(tableMenu.getByText("제목 행/열 토글은 행 메뉴와 열 메뉴에서 분리했습니다.")).toBeVisible()

    const deleteTableButton = tableMenu.getByRole("button", { name: "표 삭제" })
    await expect(deleteTableButton).toBeVisible()
    await expect(deleteTableButton).toBeEnabled()
    await deleteTableButton.click()
    await expect(page.locator(".aq-block-editor__content table")).toHaveCount(0)
    await expect(page.getByTestId("block-editor-prosemirror")).toBeVisible()
  })

  test("table 구조 메뉴는 표 밖 selection 이동 후 stale 상태로 남지 않는다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    const table = page.locator(".aq-block-editor__content .tableWrapper table").first()
    const tableBox = await table.boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing before stale menu check")
    }
    await page.mouse.move(tableBox.x + tableBox.width - 6, tableBox.y + 6)

    const structureMenuButton = page.getByTestId("table-structure-menu-button")
    await expect(structureMenuButton).toBeVisible()
    await structureMenuButton.click()

    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await page.waitForTimeout(450)
    await expect(tableMenu).toBeVisible()

    const movedOutsideTable = await page.evaluate(() => {
      const qaWindow = window as typeof window & {
        __qaGetSelectionSnapshot?: () => {
          docChildTypes: string[]
        } | null
        __qaSelectBlockAtIndex?: (blockIndex: number) => void
      }
      const paragraphIndex = qaWindow
        .__qaGetSelectionSnapshot?.()
        ?.docChildTypes.findIndex((type) => type === "paragraph")
      if (paragraphIndex === undefined || paragraphIndex < 0) return false
      qaWindow.__qaSelectBlockAtIndex?.(paragraphIndex)
      return true
    })
    expect(movedOutsideTable).toBe(true)
    await expect(tableMenu).toHaveCount(0)
  })

  test("table 구조 메뉴의 폭 정책 UI는 wide/fit-to-page를 토글하고 재진입 후에도 유지된다", async ({
    page,
  }) => {
    const hoverTableCorner = async (tableLocator: Locator, missingMessage: string) => {
      const tableBox = await tableLocator.boundingBox()
      if (!tableBox) {
        throw new Error(missingMessage)
      }
      await tableLocator.hover({
        position: {
          x: Math.max(2, Math.round(tableBox.width) - 4),
          y: 6,
        },
      })
    }

    const clickVisibleStructureMenuButton = async () => {
      const button = page.getByTestId("table-structure-menu-button")
      await expect(button).toBeVisible()
      await button.click()
    }
    const clickVisibleTableMenuButton = async (testId: string) => {
      const button = page.getByTestId("table-table-menu").getByTestId(testId)
      await expect(button).toBeVisible()
      await button.click()
    }

    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    const table = page.locator(".aq-block-editor__content .tableWrapper table").first()
    await hoverTableCorner(table, "table bounding box is missing before structure menu hover")

    const structureMenuButton = page.getByTestId("table-structure-menu-button")

    await expect(structureMenuButton).toBeVisible()
    await clickVisibleStructureMenuButton()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await expect(tableMenu.getByTestId("table-overflow-mode-normal")).toBeVisible()
    await expect(tableMenu.getByTestId("table-overflow-mode-wide")).toBeVisible()
    await expect(tableMenu.getByTestId("table-overflow-mode-normal")).toHaveAttribute("data-active", "true")
    await expect(tableMenu.getByTestId("table-overflow-mode-wide")).toHaveAttribute("data-active", "false")

    await clickVisibleTableMenuButton("table-overflow-mode-wide")
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')

    const wideMarkdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(wideMarkdown.replace(/\n/g, "\\n"))}`)
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )

    const reloadedFirstCell = page.locator("table th, table td").first()
    await reloadedFirstCell.click()
    const reloadedTable = page.locator(".aq-block-editor__content .tableWrapper table").first()
    await hoverTableCorner(reloadedTable, "reloaded table bounding box is missing before structure menu hover")

    const reloadedStructureMenuButton = page.getByTestId("table-structure-menu-button")
    await expect(reloadedStructureMenuButton).toBeVisible()
    await clickVisibleStructureMenuButton()
    const reloadedTableMenu = page.getByTestId("table-table-menu")
    await expect(reloadedTableMenu).toBeVisible()
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-normal")).toBeVisible()
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-wide")).toBeVisible()
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-normal")).toHaveAttribute("data-active", "false")
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-wide")).toHaveAttribute("data-active", "true")

    await clickVisibleTableMenuButton("table-overflow-mode-normal")
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).not.toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"normal"')

    const normalMarkdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(normalMarkdown.replace(/\n/g, "\\n"))}`)
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).not.toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"normal"')
  })

  test("table cell menu는 셀 스타일만 포함하고 구조 액션 없이 정렬/배경을 저장한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    const cellMenu = await openCellMenuForCell(page, firstTableCell)
    await expect(cellMenu).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "좌측" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "가운데" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "배경 해제" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "셀 병합" })).toHaveCount(0)
    await expect(cellMenu.getByRole("button", { name: "셀 분리" })).toHaveCount(0)
    await expect(cellMenu.getByRole("button", { name: "제목 행" })).toHaveCount(0)
    await expect(cellMenu.getByRole("button", { name: "표 삭제" })).toHaveCount(0)

    await clickStableCellMenuButton(page, firstTableCell, "가운데")
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"align":"center"')

    await clickStableCellMenuButton(page, firstTableCell, "노랑 배경")
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"backgroundColor":"#fef3c7"')
  })

  test("table 셀 스타일 버튼과 메뉴는 스크롤 후 viewport 잔상 없이 정리된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { cellMenuButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()
    await expect(cellMenuButton).toBeVisible()

    await page.evaluate(() => {
      if (document.querySelector('[data-testid="qa-scroll-spacer"]')) return
      const spacer = document.createElement("div")
      spacer.setAttribute("data-testid", "qa-scroll-spacer")
      spacer.style.height = "2200px"
      spacer.style.pointerEvents = "none"
      document.body.appendChild(spacer)
    })

    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight })
    })
    await expect(cellMenuButton).toHaveCount(0)

    await page.evaluate(() => {
      window.scrollTo({ top: 0 })
    })
    await expect(firstTableCell).toBeVisible()
    await firstTableCell.hover()
    await expect(cellMenuButton).toBeVisible()

    await cellMenuButton.click()
    const cellMenu = page.getByTestId("table-cell-menu")
    await expect(cellMenu).toBeVisible()

    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight })
    })
    await expect(cellMenuButton).toHaveCount(0)
    await expect(cellMenu).toHaveCount(0)
  })

  test("table row/column 메뉴는 axis-level header action을 노출하고 저장 후 재진입해도 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { rowHandle: rowMenuButton, columnHandle: columnMenuButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await moveToTableCellAxisHotzone(page, { axis: "row", cellText: "", label: "table structure row menu" })

    await expect(rowMenuButton).toBeVisible()
    await rowMenuButton.click()
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "제목 행" })).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "위에 행 추가" })).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "아래에 행 추가" })).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "제목 열" })).toHaveCount(0)
    await expect(rowMenu.getByRole("button", { name: "페이지 너비에 맞춤" })).toHaveCount(0)
    await expect(rowMenu.getByText("행 핸들을 드래그해 순서를 바꿀 수 있습니다.")).toBeVisible()
    const initialHeaderRowVisual = await page.evaluate(() => {
      const firstRowSecondCell = document.querySelector("table tr:first-child > :nth-child(2)") as HTMLElement | null
      const secondRowSecondCell = document.querySelector("table tr:nth-child(2) > :nth-child(2)") as HTMLElement | null
      if (!firstRowSecondCell || !secondRowSecondCell) return null
      return {
        firstRowSecondTag: firstRowSecondCell.tagName,
        firstRowSecondBackground: window.getComputedStyle(firstRowSecondCell).backgroundColor,
        secondRowSecondTag: secondRowSecondCell.tagName,
        secondRowSecondBackground: window.getComputedStyle(secondRowSecondCell).backgroundColor,
      }
    })
    expect(initialHeaderRowVisual).not.toBeNull()
    expect(initialHeaderRowVisual?.firstRowSecondTag).toBe("TH")
    expect(initialHeaderRowVisual?.firstRowSecondBackground).not.toBe(
      initialHeaderRowVisual?.secondRowSecondBackground
    )
    await rowMenu.getByRole("button", { name: "제목 행" }).click()
    const toggledHeaderRowVisual = await page.evaluate(() => {
      const firstRowSecondCell = document.querySelector("table tr:first-child > :nth-child(2)") as HTMLElement | null
      const secondRowSecondCell = document.querySelector("table tr:nth-child(2) > :nth-child(2)") as HTMLElement | null
      if (!firstRowSecondCell || !secondRowSecondCell) return null
      return {
        firstRowSecondTag: firstRowSecondCell.tagName,
        firstRowSecondBackground: window.getComputedStyle(firstRowSecondCell).backgroundColor,
        secondRowSecondBackground: window.getComputedStyle(secondRowSecondCell).backgroundColor,
      }
    })
    expect(toggledHeaderRowVisual).not.toBeNull()
    expect(toggledHeaderRowVisual?.firstRowSecondTag).toBe("TD")
    expect(toggledHeaderRowVisual?.firstRowSecondBackground).toBe(
      toggledHeaderRowVisual?.secondRowSecondBackground
    )
    expect(toggledHeaderRowVisual?.firstRowSecondBackground).not.toBe(
      initialHeaderRowVisual?.firstRowSecondBackground
    )

    await moveToTableCellAxisHotzone(page, { axis: "column", cellText: "", label: "table structure column menu" })
    await expect(columnMenuButton).toBeVisible()
    await columnMenuButton.click()
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "제목 열" })).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "왼쪽 열 추가" })).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "오른쪽 열 추가" })).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "제목 행" })).toHaveCount(0)
    await expect(columnMenu.getByRole("button", { name: "넓은 표" })).toHaveCount(0)
    await expect(columnMenu.getByText("열 핸들을 드래그해 순서를 바꿀 수 있습니다.")).toBeVisible()
    await columnMenu.getByRole("button", { name: "제목 열" }).click()
    const headerColumnVisual = await page.evaluate(() => {
      const secondRowFirstCell = document.querySelector("table tr:nth-child(2) > :first-child") as HTMLElement | null
      const secondRowSecondCell = document.querySelector("table tr:nth-child(2) > :nth-child(2)") as HTMLElement | null
      if (!secondRowFirstCell || !secondRowSecondCell) return null
      return {
        secondRowFirstTag: secondRowFirstCell.tagName,
        secondRowFirstBackground: window.getComputedStyle(secondRowFirstCell).backgroundColor,
        secondRowSecondTag: secondRowSecondCell.tagName,
        secondRowSecondBackground: window.getComputedStyle(secondRowSecondCell).backgroundColor,
      }
    })
    expect(headerColumnVisual).not.toBeNull()
    expect(headerColumnVisual?.secondRowFirstTag).toBe("TH")
    expect(headerColumnVisual?.secondRowSecondTag).toBe("TD")
    expect(headerColumnVisual?.secondRowFirstBackground).not.toBe(
      headerColumnVisual?.secondRowSecondBackground
    )

    await expect(page.locator("table tr").first().locator("th")).toHaveCount(1)
    await expect(page.locator("table tr").nth(1).locator("th")).toHaveCount(1)

    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerRow":false')
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerColumn":true')

    const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(markdown.replace(/\n/g, "\\n"))}`)
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerColumn":true')
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(1)
    await expect(page.locator("table tr").nth(1).locator("th")).toHaveCount(1)
  })

  test("table 셀 텍스트도 드래그 선택 후 인라인 버블 포맷(굵게/색상)을 적용할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.keyboard.type("셀굵게 셀색상")

    await selectWordInEditable(page, firstTableCell, "셀굵게")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    if ((await textBubbleToolbar.count()) === 0) {
      await selectWordInEditable(page, firstTableCell, "셀굵게")
    }
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "굵게", exact: true }).click()

    await selectWordInEditable(page, firstTableCell, "셀색상")
    if ((await textBubbleToolbar.count()) === 0) {
      await selectWordInEditable(page, firstTableCell, "셀색상")
    }
    await expect(textBubbleToolbar).toBeVisible()
    const openBubbleColorMenu = async () => {
      await textBubbleToolbar.hover()
      await page.locator("[aria-label='글자색']").first().click()
    }
    await openBubbleColorMenu()
    const skyColorButton = page.getByRole("button", { name: "하늘", exact: true }).first()
    if (!(await skyColorButton.isVisible())) {
      await selectWordInEditable(page, firstTableCell, "셀색상")
      await expect(textBubbleToolbar).toBeVisible()
      await openBubbleColorMenu()
    }
    await expect(skyColorButton).toBeVisible()
    await skyColorButton.click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect
      .poll(async () => (await markdownOutput.textContent()) || "")
      .toMatch(/\*\*셀굵게(?: 셀색상)?\*\*/)
    await expect
      .poll(async () => (await markdownOutput.textContent()) || "")
      .toContain("{{color:#60a5fa\\|")
  })

  test("table 셀 텍스트 selection bubble도 mouseup 이후에만 노출된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.keyboard.type("셀 버블 지연 노출")

    const points = await getWordDragPoints(firstTableCell, "버블")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await setWordSelectionInEditable(firstTableCell, "버블")
    await expect(textBubbleToolbar).toHaveCount(0)

    await page.mouse.up()
    await expect(textBubbleToolbar).toBeVisible()
  })
})
