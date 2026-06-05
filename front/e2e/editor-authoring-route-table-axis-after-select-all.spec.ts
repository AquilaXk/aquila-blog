import { expect, test, type Locator, type Page } from "@playwright/test"
import { getTableAffordances } from "./helpers/editorAuthoringFlow"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  clearPost507InteractionTelemetry,
  expectPost507FinalTableTextSelected,
  installPost507InteractionTelemetry,
  mockEditorRouteWithPost507,
  readPost507InteractionTelemetry,
} from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const clickVisibleOverlayControl = async (_page: Page, locator: Locator) => {
  void _page
  await expect(locator).toBeVisible({ timeout: 900 })
  await locator.click({ force: true, timeout: 900 })
}

const moveToPost507RowGripHotzone = async (page: Page, rowHandle: Locator) => {
  const rowMetrics = await resolvePost507FinalTableRowMetrics(page)
  const points = [
    { x: rowMetrics.hoverX, y: rowMetrics.hoverY },
    { x: rowMetrics.hoverX + 4, y: rowMetrics.hoverY },
    { x: rowMetrics.hoverX, y: rowMetrics.cellY },
  ]
  for (const point of points) {
    await page.mouse.move(rowMetrics.cellX, rowMetrics.cellY)
    await page.mouse.move(point.x, point.y, { steps: 4 })
    await page.waitForTimeout(80)
    if (await rowHandle.isVisible().catch(() => false)) return
  }
}

const readTableTextSelectionState = async (page: Page) =>
  page.evaluate(() => ({
    dragAttributeCount: document.querySelectorAll("[data-table-drag-selection-text]").length,
    dragText: document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ?? "",
    selectionText: window.getSelection()?.toString().trim() ?? "",
  }))

const readPost507AxisSelectionState = async (
  page: Page,
  outlineTestId: "table-column-selection-outline" | "table-row-selection-outline",
  menuTestId: "table-column-menu" | "table-row-menu"
) => {
  const editor = page.getByTestId("block-editor-prosemirror")
  const [outlineVisible, menuVisible, selectedCellCount, textSelectionState] = await Promise.all([
    page.getByTestId(outlineTestId).isVisible().catch(() => false),
    page.getByTestId(menuTestId).isVisible().catch(() => false),
    editor.locator(".selectedCell").count(),
    readTableTextSelectionState(page),
  ])
  return {
    outlineVisible,
    menuVisible,
    selectedCellCount,
    textSelectionState,
    hasTableTextSelection:
      textSelectionState.dragAttributeCount > 0 ||
      Boolean(textSelectionState.dragText) ||
      Boolean(textSelectionState.selectionText),
  }
}

const readPost507AxisAttemptDebug = async (page: Page) =>
  page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
    const count = (selector: string) => document.querySelectorAll(selector).length
    const visibleCount = (selector: string) =>
      Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 }).length
    return { columnMenuCount: count("[data-testid='table-column-menu']"), columnOutlineCount: count("[data-testid='table-column-selection-outline']"), columnRailVisibleCount: visibleCount("[data-testid='table-column-rail']"), dragAttributeCount: count("[data-table-drag-selection-text]"), rootDragText: document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ?? "", rowMenuCount: count("[data-testid='table-row-menu']"), rowOutlineCount: count("[data-testid='table-row-selection-outline']"), rowRailVisibleCount: visibleCount("[data-testid='table-row-rail']"), scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY), selectedCellCount: editor?.querySelectorAll(".selectedCell").length ?? 0, selectionText: window.getSelection()?.toString().trim() ?? "" }
  })

const clickPost507AxisHandleUntilSelected = async (
  page: Page,
  axis: "column" | "row",
  handle: Locator,
  outlineTestId: "table-column-selection-outline" | "table-row-selection-outline",
  expectedSelectedCellCount: number
) => {
  const menuTestId = axis === "row" ? "table-row-menu" : "table-column-menu"
  let lastSelectionState: Awaited<ReturnType<typeof readPost507AxisSelectionState>> | null = null
  let lastAttemptDebug: Awaited<ReturnType<typeof readPost507AxisAttemptDebug>> | null = null
  let lastClickError = ""
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const metrics =
      axis === "row" ? await resolvePost507FinalTableRowMetrics(page) : await resolvePost507FinalTableColumnMetrics(page)
    const hoverPoints =
      axis === "row"
        ? [
            { x: metrics.hoverX - 24, y: metrics.hoverY },
            { x: metrics.hoverX - 10, y: metrics.hoverY },
            { x: metrics.hoverX, y: metrics.hoverY },
          ]
        : [{ x: metrics.hoverX, y: metrics.hoverY }]
    for (const point of hoverPoints) {
      await page.mouse.move(metrics.cellX, metrics.cellY)
      await page.mouse.move(point.x, point.y, { steps: 4 })
      await page.waitForTimeout(140)
      if (!(await handle.isVisible().catch(() => false))) {
        lastAttemptDebug = await readPost507AxisAttemptDebug(page)
        continue
      }
      try {
        await installPost507InteractionTelemetry(page)
        await clickVisibleOverlayControl(page, handle)
      } catch {
        lastClickError = "overlay control was visible but did not accept click within 900ms"
        lastAttemptDebug = await readPost507AxisAttemptDebug(page)
        continue
      }
      const selectionSettled = await expect
        .poll(
          async () => {
            const selectionState = await readPost507AxisSelectionState(page, outlineTestId, menuTestId)
            lastSelectionState = selectionState
            return {
              outlineVisible: selectionState.outlineVisible,
              menuVisible: selectionState.menuVisible,
              selectedCellCount: selectionState.selectedCellCount,
              hasTableTextSelection: selectionState.hasTableTextSelection,
            }
          },
          { timeout: 650 }
        )
        .toEqual({
          outlineVisible: true,
          menuVisible: true,
          selectedCellCount: expectedSelectedCellCount,
          hasTableTextSelection: false,
        })
        .then(() => true)
        .catch(async () => {
          lastAttemptDebug = await readPost507AxisAttemptDebug(page)
          return false
        })
      if (selectionSettled) {
        return
      }
    }
  }
  throw new Error(
    `post 507 final table ${axis} handle did not select a structural axis: ${JSON.stringify({
      lastAttemptDebug,
      lastClickError,
      lastSelectionState,
    })}`
  )
}

const expectPost507FinalTableSelectionOnPage = async (page: Page) => {
  await expect
    .poll(async () => {
      const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
      try {
        expectPost507FinalTableTextSelected(selectionText)
        return true
      } catch {
        return false
      }
    })
    .toBe(true)
}

const expectNoTableTextSelectionState = async (page: Page, label: string) => {
  await expect
    .poll(async () => {
      const state = await readTableTextSelectionState(page)
      return {
        hasDragAttribute: state.dragAttributeCount > 0 || Boolean(state.dragText),
        hasSelectionText: Boolean(state.selectionText),
      }
    }, { message: `${label} should not keep table text selection state`, timeout: 600 })
    .toEqual({ hasDragAttribute: false, hasSelectionText: false })
}

const resolvePost507FinalTableRowMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const metrics = await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const tables = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? []).filter((candidate) => {
        const text = candidate.textContent ?? ""
        return text.includes(targetCellText) && text.includes("재발급 로직")
      })
      const table = tables[tables.length - 1]
      const targetCell = Array.from(table?.querySelectorAll<HTMLElement>("td, th") ?? []).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      )
      if (!table || !targetCell) return null

      const tableRect = table.getBoundingClientRect()
      const cellRect = targetCell.getBoundingClientRect()
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        cellRect.width <= 0 ||
        cellRect.height <= 0 ||
        cellRect.bottom <= 8 ||
        cellRect.top >= window.innerHeight - 8
      ) {
        targetCell.scrollIntoView({ block: "center", inline: "nearest" })
        return null
      }

      const clickX = cellRect.left + Math.min(36, Math.max(8, cellRect.width / 3))
      const clickY = cellRect.top + Math.min(16, Math.max(6, cellRect.height / 2))
      return {
        cellX: clickX,
        cellY: clickY,
        hoverX: tableRect.left + 4,
        hoverY: clickY,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(100)
  }

  throw new Error("post 507 final table row metrics are missing")
}

const resolvePost507FinalTableColumnMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const metrics = await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const tables = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? []).filter((candidate) => {
        const text = candidate.textContent ?? ""
        return text.includes(targetCellText) && text.includes("재발급 로직")
      })
      const table = tables[tables.length - 1]
      if (!table) return null

      const tableRect = table.getBoundingClientRect()
      const headerCells = Array.from(table.querySelectorAll<HTMLElement>("thead th, tr:first-child th, tr:first-child td"))
      const headerCell =
        headerCells.find((candidate) => candidate.textContent?.includes("점검 항목")) ?? headerCells[1] ?? headerCells[0]
      if (!headerCell) return null
      const headerRect = headerCell.getBoundingClientRect()
      const clampYToViewport = (value: number) => Math.min(Math.max(value, 12), window.innerHeight - 12)
      const headerClickOffsetY = Math.min(16, Math.max(6, headerRect.height / 2))
      const hoverY = clampYToViewport(tableRect.top + 6)
      const cellY = clampYToViewport(headerRect.top + headerClickOffsetY)
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        headerRect.width <= 0 ||
        headerRect.height <= 0 ||
        headerRect.bottom <= 8 ||
        headerRect.top >= window.innerHeight - 8
      ) {
        return null
      }

      return {
        cellX: headerRect.left + Math.min(40, Math.max(8, headerRect.width / 2)),
        cellY,
        hoverX: headerRect.left + headerRect.width / 2,
        hoverY,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(100)
  }

  throw new Error("post 507 final table row reset column metrics are missing")
}

const resolvePost507FinalTableColumnCoverMetrics = async (page: Page) => {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const metrics = await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const tables = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? []).filter((candidate) => {
        const text = candidate.textContent ?? ""
        return text.includes(targetCellText) && text.includes("재발급 로직")
      })
      const table = tables[tables.length - 1]
      if (!table) return null

      const tableRect = table.getBoundingClientRect()
      const targetCell = Array.from(table.querySelectorAll<HTMLElement>("td, th")).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      )
      const headerCells = Array.from(table.querySelectorAll<HTMLElement>("thead th, tr:first-child th, tr:first-child td"))
      const headerCell =
        headerCells.find((candidate) => candidate.textContent?.includes("점검 항목")) ?? headerCells[1] ?? headerCells[0]
      if (!targetCell || !headerCell) return null
      const targetRect = targetCell.getBoundingClientRect()
      const headerRect = headerCell.getBoundingClientRect()
      if (
        tableRect.width <= 0 ||
        tableRect.height <= 0 ||
        targetRect.width <= 0 ||
        targetRect.height <= 0 ||
        headerRect.width <= 0 ||
        headerRect.height <= 0 ||
        targetRect.bottom <= 8 ||
        targetRect.top >= window.innerHeight - 8
      ) {
        return null
      }

      return {
        cellX: targetRect.left + targetRect.width / 2,
        cellY: targetRect.top + targetRect.height / 2,
        coverLeft: tableRect.left,
        coverTop: tableRect.top,
        coverWidth: tableRect.width,
        hoverX: headerRect.left + headerRect.width / 2,
        hoverY: tableRect.top + 3,
      }
    }, POST_507_FINAL_TABLE_TARGET_CELL)

    if (metrics) return metrics
    await page.waitForTimeout(100)
  }

  throw new Error("post 507 final table column cover metrics are missing")
}

const expectAxisSelectionStable = async (
  page: Page,
  expectedSelectedCellCount: number,
  overlayTestId: "table-column-selection-outline" | "table-row-selection-outline",
  menuTestId: "table-column-menu" | "table-row-menu"
) => {
  const samples = []
  await page.waitForTimeout(340)
  for (let index = 0; index < 13; index += 1) {
    samples.push(
      await page.evaluate(
        ({ menuTestId, overlayTestId }) => {
          const editor = document.querySelector("[data-testid='block-editor-prosemirror']")
          return {
            dragSelectionMarkerCount: document.querySelectorAll("[data-table-drag-selection-text]").length,
            hasRootDragSelectionMarker: document.documentElement.hasAttribute("data-table-drag-selection-text"),
            menuCount: document.querySelectorAll(`[data-testid='${menuTestId}']`).length,
            overlayCount: document.querySelectorAll(`[data-testid='${overlayTestId}']`).length,
            selectedCellCount: editor?.querySelectorAll(".selectedCell").length ?? 0,
          }
        },
        { menuTestId, overlayTestId }
      )
    )
    await page.waitForTimeout(80)
  }

  expect(samples).toEqual(
    samples.map(() => ({
      dragSelectionMarkerCount: 0,
      hasRootDragSelectionMarker: false,
      menuCount: 1,
      overlayCount: 1,
      selectedCellCount: expectedSelectedCellCount,
    }))
  )
}

const countMenuCloseTransitions = (menuCounts: number[]) => {
  let sawOpen = false
  let closeCount = 0
  for (let index = 0; index < menuCounts.length; index += 1) {
    const count = menuCounts[index] ?? 0
    const previousCount = index > 0 ? menuCounts[index - 1] ?? 0 : 0
    if (count > 0) sawOpen = true
    if (sawOpen && previousCount > 0 && count === 0) closeCount += 1
  }
  return closeCount
}

const countMenuReopenTransitions = (menuCounts: number[]) => {
  let sawCloseAfterOpen = false
  let reopenCount = 0
  for (let index = 0; index < menuCounts.length; index += 1) {
    const count = menuCounts[index] ?? 0
    const previousCount = index > 0 ? menuCounts[index - 1] ?? 0 : 0
    if (previousCount > 0 && count === 0) sawCloseAfterOpen = true
    if (sawCloseAfterOpen && previousCount === 0 && count > 0) reopenCount += 1
  }
  return reopenCount
}

const expectNoPost507MenuChurn = (
  telemetry: Awaited<ReturnType<typeof readPost507InteractionTelemetry>>,
  axis: "column" | "row",
  label: string
) => {
  const menuCounts = telemetry.menuTimeline.map((sample) =>
    axis === "row" ? sample.rowMenuVisibleCount : sample.columnMenuVisibleCount
  )
  const fallbackSamples = telemetry.fallbackTimeline.filter(
    (sample) =>
      sample.codeFallbackCount > 0 ||
      sample.tableFallbackCount > 0 ||
      Boolean(sample.codeFallbackText) ||
      Boolean(sample.tableFallbackText)
  )
  expect(menuCounts.some((count) => count > 0), `${label} should record an opened ${axis} menu`).toBe(true)
  expect(countMenuCloseTransitions(menuCounts), `${label} should not close the ${axis} menu after opening`).toBe(0)
  expect(countMenuReopenTransitions(menuCounts), `${label} should not reopen the ${axis} menu after closing`).toBe(0)
  expect(telemetry.scrollToCalls, `${label} should not preserve-scroll rollback during stable axis selection`).toEqual([])
  expect(fallbackSamples, `${label} should not leave code/table text fallback selection markers`).toEqual([])
}

const readPost507AxisOverlayScrollSnapshot = async (
  page: Page,
  overlayTestId: "table-column-selection-outline" | "table-row-selection-outline",
  menuTestId: "table-column-menu" | "table-row-menu"
) =>
  page.evaluate(
    ({ menuTestId, overlayTestId, targetCellText }) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
        .filter((candidate) => {
          const text = candidate.textContent ?? ""
          return text.includes(targetCellText) && text.includes("재발급 로직")
        })
        .at(-1) ?? null
      const overlay = document.querySelector<HTMLElement>(`[data-testid='${overlayTestId}']`)
      const menu = document.querySelector<HTMLElement>(`[data-testid='${menuTestId}']`)
      const toRect = (element: Element | null) => {
        if (!element) return null
        const rect = element.getBoundingClientRect()
        return {
          bottom: Math.round(rect.bottom),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          top: Math.round(rect.top),
        }
      }
      return {
        menu: toRect(menu),
        overlay: toRect(overlay),
        scrollHeight: Math.round(document.scrollingElement?.scrollHeight ?? document.documentElement.scrollHeight),
        scrollTop: Math.round(document.scrollingElement?.scrollTop ?? window.scrollY),
        table: toRect(table),
        viewportHeight: Math.round(window.innerHeight),
      }
    },
    { menuTestId, overlayTestId, targetCellText: POST_507_FINAL_TABLE_TARGET_CELL }
  )

const expectAxisOverlayFollowsScrollOrCloses = async (
  page: Page,
  before: Awaited<ReturnType<typeof readPost507AxisOverlayScrollSnapshot>>,
  overlayTestId: "table-column-selection-outline" | "table-row-selection-outline",
  menuTestId: "table-column-menu" | "table-row-menu"
) => {
  const viewport = page.viewportSize() ?? { height: 620, width: 1280 }
  await page.mouse.move(Math.max(16, viewport.width - 80), Math.max(16, viewport.height - 80))
  const scrollDelta = before.scrollTop + before.viewportHeight >= before.scrollHeight - 24 ? -520 : 520
  let after = await readPost507AxisOverlayScrollSnapshot(page, overlayTestId, menuTestId)
  let tableDelta = after.table && before.table ? after.table.top - before.table.top : 0
  for (let attempt = 0; attempt < 2 && Math.abs(tableDelta) < 160; attempt += 1) {
    await page.mouse.wheel(0, scrollDelta)
    await page.waitForTimeout(220)
    after = await readPost507AxisOverlayScrollSnapshot(page, overlayTestId, menuTestId)
    tableDelta = after.table && before.table ? after.table.top - before.table.top : 0
  }

  expect(after.table).not.toBeNull()
  expect(before.table).not.toBeNull()
  if (!after.table || !before.table) return

  expect(Math.abs(tableDelta)).toBeGreaterThanOrEqual(96)

  const resolveOverlayDrift = (previous: { top: number } | null, next: { top: number } | null) => {
    if (!next) return 0
    if (!previous) return 0
    return Math.abs(next.top - previous.top - tableDelta)
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const overlayDrift = resolveOverlayDrift(before.overlay, after.overlay)
    const menuDrift = resolveOverlayDrift(before.menu, after.menu)
    if (overlayDrift <= 28 && menuDrift <= 28) break
    await page.waitForTimeout(160)
    after = await readPost507AxisOverlayScrollSnapshot(page, overlayTestId, menuTestId)
    tableDelta = after.table && before.table ? after.table.top - before.table.top : tableDelta
  }

  const assertOverlayMovedWithTable = (label: string, previous: { top: number } | null, next: { top: number } | null) => {
    if (!next) return
    expect(previous, `${label} existed before scroll`).not.toBeNull()
    if (!previous) return
    expect(Math.abs(next.top - previous.top - tableDelta), `${label} stale after scroll`).toBeLessThanOrEqual(28)
  }

  assertOverlayMovedWithTable("axis selection outline", before.overlay, after.overlay)
  assertOverlayMovedWithTable("axis menu", before.menu, after.menu)
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

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rowMetrics = await resolvePost507FinalTableRowMetrics(page)
      await page.mouse.move(rowMetrics.cellX, rowMetrics.cellY)
      await page.mouse.move(rowMetrics.hoverX, rowMetrics.hoverY, { steps: 4 })
      await page.waitForTimeout(140)
      if (await rowHandle.isVisible().catch(() => false)) break
      if (attempt === 4) throw new Error("post 507 final table row handle did not appear before row reset")
    }

    await expect(rowHandle).toBeVisible()
    await clickVisibleOverlayControl(page, rowHandle)
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)

    await page.keyboard.press("Escape")
    await page.waitForTimeout(160)
    const resetMetrics = await resolvePost507FinalTableColumnMetrics(page)
    await page.mouse.click(resetMetrics.cellX, resetMetrics.cellY)
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
    await page.waitForTimeout(120)
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const columnMetrics = await resolvePost507FinalTableColumnMetrics(page)
      await page.mouse.move(columnMetrics.cellX, columnMetrics.cellY)
      await page.mouse.move(columnMetrics.hoverX, columnMetrics.hoverY, { steps: 4 })
      await page.waitForTimeout(220)
      if (await columnHandle.isVisible().catch(() => false)) break
      if (attempt === 4) throw new Error("post 507 final table column handle did not appear after row reset")
    }

    await expect(columnHandle).toBeVisible()
    await clickVisibleOverlayControl(page, columnHandle)
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] post 507 row structural selection은 깜빡이지 않고 scroll 중 stale overlay를 남기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 760 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 997,
      title: "post 507 table row axis overlay stability route 글",
    })
    const { rowHandle } = getTableAffordances(page)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
        .filter((candidate) => {
          const text = candidate.textContent ?? ""
          return text.includes(targetCellText) && text.includes("재발급 로직")
        })
        .at(-1)
      const targetCell = Array.from(table?.querySelectorAll<HTMLElement>("td, th") ?? []).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      )
      targetCell?.scrollIntoView({ block: "center", inline: "nearest" })
    }, POST_507_FINAL_TABLE_TARGET_CELL)
    await page.waitForTimeout(120)
    await targetCell.click({ position: { x: 40, y: 16 } })
    await clickPost507AxisHandleUntilSelected(page, "row", rowHandle, "table-row-selection-outline", 3)
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)
    await expectAxisSelectionStable(page, 3, "table-row-selection-outline", "table-row-menu")
    expectNoPost507MenuChurn(await readPost507InteractionTelemetry(page, "row-axis-stable"), "row", "post 507 row axis")
    await clearPost507InteractionTelemetry(page)
    await expectAxisOverlayFollowsScrollOrCloses(
      page,
      await readPost507AxisOverlayScrollSnapshot(page, "table-row-selection-outline", "table-row-menu"),
      "table-row-selection-outline",
      "table-row-menu"
    )
  })

  test("실제 /editor/[id] post 507 column structural selection은 깜빡이지 않고 scroll 중 stale overlay를 남기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 760 })
    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 998,
      title: "post 507 table column axis overlay stability route 글",
    })
    const { columnHandle } = getTableAffordances(page)
    await page.evaluate((targetCellText) => {
      const editor = document.querySelector<HTMLElement>("[data-testid='block-editor-prosemirror']")
      const table = Array.from(editor?.querySelectorAll<HTMLElement>("table") ?? [])
        .filter((candidate) => {
          const text = candidate.textContent ?? ""
          return text.includes(targetCellText) && text.includes("재발급 로직")
        })
        .at(-1)
      const targetCell = Array.from(table?.querySelectorAll<HTMLElement>("td, th") ?? []).find((candidate) =>
        candidate.textContent?.includes(targetCellText)
      )
      targetCell?.scrollIntoView({ block: "center", inline: "nearest" })
    }, POST_507_FINAL_TABLE_TARGET_CELL)
    await page.waitForTimeout(120)
    const columnResetMetrics = await resolvePost507FinalTableColumnMetrics(page)
    await page.mouse.click(columnResetMetrics.cellX, columnResetMetrics.cellY)
    await clickPost507AxisHandleUntilSelected(page, "column", columnHandle, "table-column-selection-outline", 7)
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
    await expectAxisSelectionStable(page, 7, "table-column-selection-outline", "table-column-menu")
    expectNoPost507MenuChurn(
      await readPost507InteractionTelemetry(page, "column-axis-stable"),
      "column",
      "post 507 column axis"
    )
    await clearPost507InteractionTelemetry(page)
    await expectAxisOverlayFollowsScrollOrCloses(
      page,
      await readPost507AxisOverlayScrollSnapshot(page, "table-column-selection-outline", "table-column-menu"),
      "table-column-selection-outline",
      "table-column-menu"
    )
  })

  test("실제 /editor/[id] post 507 마지막 7x3 table은 table-wide Cmd/Ctrl+A 직후 column grip을 첫 축 선택으로 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 993,
      title: "post 507 table select-all column route 글",
    })
    const { columnHandle } = getTableAffordances(page)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await expectPost507FinalTableSelectionOnPage(page)

    const columnCoverMetrics = await resolvePost507FinalTableColumnCoverMetrics(page)
    await page.mouse.move(columnCoverMetrics.cellX, columnCoverMetrics.cellY)
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
      {
        left: columnCoverMetrics.coverLeft,
        top: columnCoverMetrics.coverTop,
        width: columnCoverMetrics.coverWidth,
      }
    )
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.mouse.move(columnCoverMetrics.cellX, columnCoverMetrics.cellY)
      await page.mouse.move(columnCoverMetrics.hoverX, columnCoverMetrics.hoverY, { steps: 4 })
      await page.waitForTimeout(220)
      if (await columnHandle.isVisible().catch(() => false)) break
      if (attempt === 4) throw new Error("post 507 final table column handle did not appear after select-all")
    }

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
    await clickVisibleOverlayControl(page, columnHandle)
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(7)
  })

  test("실제 /editor/[id] post 507 마지막 7x3 table은 table-wide Cmd/Ctrl+A 직후 row grip으로 축 선택을 연다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 920 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 991,
      title: "post 507 table axis after select-all route 글",
    })
    const { rowHandle } = getTableAffordances(page)

    await expect(finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()).toBeVisible()
    const selectCurrentCellText = async () => {
      const currentTargetCell = editor
        .locator("table")
        .last()
        .locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL })
        .first()
      await currentTargetCell.scrollIntoViewIfNeeded()
      const currentTargetBox = await currentTargetCell.boundingBox()
      if (!currentTargetBox) {
        throw new Error("post 507 final table target cell metrics are missing before select-all")
      }
      const clickX = currentTargetBox.x + Math.min(36, Math.max(8, currentTargetBox.width / 3))
      const clickY = currentTargetBox.y + Math.min(16, Math.max(6, currentTargetBox.height / 2))
      await page.mouse.click(clickX, clickY)
      await page.mouse.dblclick(clickX, clickY)
      await page.keyboard.press(SELECT_ALL_SHORTCUT)
      await expectPost507FinalTableSelectionOnPage(page)
    }

    await selectCurrentCellText()
    await moveToPost507RowGripHotzone(page, rowHandle)
    await expect(rowHandle).toBeVisible()
    await clickVisibleOverlayControl(page, rowHandle)
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

  test("실제 /editor/[id] post 507 row grip pointerdown은 기존 table text selection owner를 즉시 취소한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 920 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 989,
      title: "post 507 table axis pointerdown text owner cancel route 글",
    })
    const { rowHandle } = getTableAffordances(page)

    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await expectPost507FinalTableSelectionOnPage(page)

    await moveToPost507RowGripHotzone(page, rowHandle)
    await expect(rowHandle).toBeVisible()

    const rowHandleBox = await rowHandle.boundingBox()
    if (!rowHandleBox) throw new Error("post 507 row handle metrics are missing before pointerdown")
    await page.mouse.move(rowHandleBox.x + rowHandleBox.width / 2, rowHandleBox.y + rowHandleBox.height / 2)
    await page.mouse.down()
    await expectNoTableTextSelectionState(page, "row axis pointerdown")
    await page.mouse.up()

    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(editor.locator(".selectedCell")).toHaveCount(3)
  })
})
