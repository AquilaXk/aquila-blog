import { expect, test } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"
import {
  POST_507_FINAL_TABLE_TARGET_CELL,
  POST_507_TITLE,
  clearPost507SelectionState,
  clickPost507AxisHandle,
  expectPost507FinalTableTextSelected,
  expectPost507WheelScrollsWithoutLock,
  installPost507InteractionTelemetry,
  mockEditorRouteWithPost507,
  readPost507EditorDiagnostics,
  readPost507SelectionText,
  scrollPost507FinalTableTargetIntoView,
} from "./helpers/post507Fixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const readBestSelectionText = () => {
  const selectionText = window.getSelection()?.toString() ?? ""
  const fallbackSelectionText =
    document.documentElement.getAttribute("data-table-drag-selection-text") ||
    document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
    document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
    ""

  return (selectionText || fallbackSelectionText).replace(/\s+/g, " ").trim()
}

const countCloseReopenTransitions = (counts: number[]) => {
  let sawOpen = false
  let closedAfterOpen = false
  let reopenCount = 0
  for (const count of counts) {
    if (count > 0 && closedAfterOpen) reopenCount += 1
    if (count > 0) sawOpen = true
    if (sawOpen && count === 0) closedAfterOpen = true
  }
  return reopenCount
}

const expectNoVisibleMenuFlicker = async (page: Parameters<typeof readPost507EditorDiagnostics>[0], axis: "column" | "row") => {
  const diagnostics = await readPost507EditorDiagnostics(page, `user-flow-${axis}-flicker`)
  const counts = diagnostics.interactionTelemetry.menuTimeline.map((sample) =>
    axis === "row" ? sample.rowMenuVisibleCount : sample.columnMenuVisibleCount
  )
  expect(counts.some((count) => count > 0), `${axis} menu should become visible in user flow`).toBe(true)
  expect(countCloseReopenTransitions(counts), `${axis} menu should not visibly close and reopen`).toBe(0)
}

test.describe("editor authoring selection bubble occlusion", () => {
  test("heading 아래 본문 드래그 선택은 bubble과 block handle이 글머리를 가리지 않는다", async ({
    page,
  }) => {
    const content = ["## 마치며", "Stateless는 서버가 아무것도 안 하는 구조가 아닙니다."].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        body: JSON.stringify(adminMember),
        contentType: "application/json",
      })
    })
    await page.route("**/post/api/v1/adm/posts/986", async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          content,
          contentHtml: null,
          id: 986,
          listed: true,
          published: true,
          title: "heading selection bubble occlusion",
          version: 1,
        }),
        contentType: "application/json",
      })
    })

    await page.goto("/editor/986")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("heading selection bubble occlusion")
    await expectEditorToContainLoadedText(editor, "Stateless는 서버가")

    const paragraph = editor.locator("p", { hasText: "Stateless는 서버가" }).first()
    await expect(paragraph).toBeVisible()
    const points = await paragraph.evaluate((element) => {
      element.scrollIntoView({ block: "start", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      return {
        endX: rect.left + Math.min(rect.width - 2, 430),
        endY: rect.top + rect.height / 2,
        startX: rect.left + 2,
        startY: rect.top + rect.height / 2,
      }
    })

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await page.mouse.move(points.endX, points.endY, { steps: 14 })
    await page.mouse.up()

    await expect
      .poll(() => page.evaluate(() => window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? ""))
      .toContain("Stateless는 서버가")
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()

    const metrics = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>("[data-testid='editor-text-bubble-toolbar']")
      const bubbleRoot = toolbar?.parentElement
      const heading = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] h2"))
        .find((element) => element.textContent?.includes("마치며"))
      const paragraph = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p"))
        .find((element) => element.textContent?.includes("Stateless는 서버가"))
      if (!toolbar || !bubbleRoot || !heading || !paragraph) return null
      const toolbarRect = toolbar.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      const paragraphRect = paragraph.getBoundingClientRect()
      const selection = window.getSelection()
      const selectionRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : paragraphRect
      const overlapsHeading = !(
        toolbarRect.right <= headingRect.left ||
        toolbarRect.left >= headingRect.right ||
        toolbarRect.bottom <= headingRect.top ||
        toolbarRect.top >= headingRect.bottom
      )
      return {
        blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
        overlapsHeading,
        placement: bubbleRoot.getAttribute("data-placement"),
        selectionRight: selectionRect.right,
        toolbarLeft: toolbarRect.left,
      }
    })

    if (!metrics) throw new Error("heading paragraph bubble metrics are missing")
    expect(metrics.overlapsHeading).toBe(false)
    expect(metrics.blockHandleCount).toBe(0)
    expect(metrics.placement).toBe("side")
    expect(metrics.toolbarLeft).toBeGreaterThanOrEqual(metrics.selectionRight - 4)
  })

  test("사용자 507 하단 본문/table 드래그 플로우는 selection과 toolbar를 블록 안에 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const { editor, finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 987,
      title: POST_507_TITLE,
      version: 3,
    })
    await installPost507InteractionTelemetry(page)
    await expectEditorToContainLoadedText(editor, "구현되어 있는가")

    const bottomBodyLabel = "Stateless는 “서버가 아무것도 안 하는 구조”가 아닙니다."
    const resolveBodyPoints = () =>
      page.evaluate((label) => {
        const paragraph = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] p"))
          .find((element) => element.textContent?.includes(label))
        paragraph?.scrollIntoView({ block: "center", inline: "nearest" })
        const rect = paragraph?.getBoundingClientRect()
        if (!rect) return null
        return {
          beforeScrollY: document.scrollingElement?.scrollTop ?? window.scrollY,
          endX: rect.left + Math.min(rect.width - 8, 520),
          endY: rect.top + rect.height / 2,
          startX: rect.left + 8,
          startY: rect.top + rect.height / 2,
        }
      }, bottomBodyLabel)
    let bodySelected = false
    for (let attempt = 0; attempt < 3 && !bodySelected; attempt += 1) {
      if (attempt > 0) await clearPost507SelectionState(page)
      const bodyPoints = await resolveBodyPoints()
      if (!bodyPoints) throw new Error("507 lower body drag points are missing")
      await page.mouse.move(bodyPoints.startX, bodyPoints.startY)
      await page.mouse.down()
      await page.mouse.move(bodyPoints.endX, bodyPoints.endY, { steps: 18 })
      await page.mouse.up()
      bodySelected = await expect
        .poll(() => page.evaluate(readBestSelectionText), { timeout: 900 })
        .toContain("Stateless")
        .then(() => true)
        .catch(() => false)
    }
    expect(bodySelected).toBe(true)
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()

    const bodyGeometry = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>("[data-testid='editor-text-bubble-toolbar']")
      const bubbleRoot = toolbar?.parentElement
      const heading = Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] h2"))
        .find((element) => element.textContent?.includes("마치며"))
      if (!toolbar || !bubbleRoot || !heading) return null
      const toolbarRect = toolbar.getBoundingClientRect()
      const headingRect = heading.getBoundingClientRect()
      const overlapsHeading = !(
        toolbarRect.right <= headingRect.left ||
        toolbarRect.left >= headingRect.right ||
        toolbarRect.bottom <= headingRect.top ||
        toolbarRect.top >= headingRect.bottom
      )
      return {
        blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
        overlapsHeading,
        placement: bubbleRoot.getAttribute("data-placement"),
        scrollY: document.scrollingElement?.scrollTop ?? window.scrollY,
        selectionText: window.getSelection()?.toString().replace(/\s+/g, " ").trim() ?? "",
      }
    })
    if (!bodyGeometry) throw new Error("507 lower body selection geometry is missing")
    expect(bodyGeometry.selectionText).toContain("Stateless")
    expect(bodyGeometry.overlapsHeading).toBe(false)
    expect(bodyGeometry.blockHandleCount).toBe(0)
    expect(["above", "side"]).toContain(bodyGeometry.placement)

    await page.mouse.wheel(0, 220)
    await expect
      .poll(() => page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY))
      .toBeGreaterThan(bodyGeometry.scrollY + 40)
    await expect.poll(() => page.evaluate(readBestSelectionText), { timeout: 2_000 }).toContain("Stateless")

    const points = await page.evaluate(() => {
      const tables = document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] table")
      const table = tables[tables.length - 1]
      table?.scrollIntoView({ block: "center", inline: "nearest" })
      const cells = Array.from(table?.querySelectorAll<HTMLElement>("th, td") ?? [])
      const startCell = cells.find((cell) => cell.textContent?.includes("Stateless 의미"))
      const endCell = cells.find((cell) => cell.textContent?.includes("Stateless 의미"))
      if (!startCell || !endCell) return null
      const range = document.createRange()
      const textNode = Array.from(startCell.childNodes).find((node) => node.textContent?.includes("Stateless 의미"))
      if (textNode) {
        range.selectNodeContents(textNode)
      } else {
        range.selectNodeContents(startCell)
      }
      const textRect = range.getBoundingClientRect()
      const startRect = startCell.getBoundingClientRect()
      const endRect = endCell.getBoundingClientRect()
      const dragRect = textRect.width > 0 && textRect.height > 0 ? textRect : startRect
      return {
        endX: Math.min(endRect.right - 8, dragRect.right - 2),
        endY: dragRect.top + dragRect.height / 2,
        startX: Math.max(startRect.left + 8, dragRect.left + 2),
        startY: dragRect.top + dragRect.height / 2,
      }
    })
    if (!points) throw new Error("table cell occlusion drag points are missing")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await page.mouse.move(points.endX, points.endY, { steps: 18 })
    await page.mouse.up()

    await expect
      .poll(() => page.evaluate(readBestSelectionText), { timeout: 2_000 })
      .toContain("Stateless 의미")

    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()
    const toolbarGeometry = await page.evaluate(() => {
      const toolbar = document.querySelector<HTMLElement>("[data-testid='editor-text-bubble-toolbar']")
      const bubbleRoot = toolbar?.parentElement
      const tables = document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] table")
      const finalTable = tables[tables.length - 1]
      const targetCell = Array.from(finalTable?.querySelectorAll<HTMLElement>("th, td") ?? [])
        .find((cell) => cell.textContent?.includes("Stateless 의미"))
      const headerCell = Array.from(finalTable?.querySelectorAll<HTMLElement>("th") ?? [])
        .find((cell) => cell.textContent?.includes("점검 항목"))
      if (!toolbar || !bubbleRoot || !targetCell || !headerCell) return null
      const toolbarRect = toolbar.getBoundingClientRect()
      const headerRect = headerCell.getBoundingClientRect()
      const selection = window.getSelection()
      const selectionRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : targetCell.getBoundingClientRect()
      const overlapsHeader = !(
        toolbarRect.right <= headerRect.left ||
        toolbarRect.left >= headerRect.right ||
        toolbarRect.bottom <= headerRect.top ||
        toolbarRect.top >= headerRect.bottom
      )
      return {
        blockHandleCount: document.querySelectorAll("[data-testid='block-drag-handle']").length,
        overlapsHeader,
        placement: bubbleRoot.getAttribute("data-placement"),
        selectionRight: selectionRect.right,
        toolbarLeft: toolbarRect.left,
      }
    })

    if (!toolbarGeometry) throw new Error("table cell bubble geometry is missing")
    expect(toolbarGeometry.overlapsHeader).toBe(false)
    expect(toolbarGeometry.blockHandleCount).toBe(0)
    expect(toolbarGeometry.placement).toBe("side")
    expect(toolbarGeometry.toolbarLeft).toBeGreaterThanOrEqual(toolbarGeometry.selectionRight - 4)

    await clearPost507SelectionState(page)
    await scrollPost507FinalTableTargetIntoView(page)
    const targetCell = finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first()
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await expect
      .poll(() => readPost507SelectionText(page), { timeout: 2_000 })
      .toContain("구현되어 있는가")
    expectPost507FinalTableTextSelected(await readPost507SelectionText(page))
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    await expectPost507WheelScrollsWithoutLock(page, "507 user flow table cmd-a")

    await clearPost507SelectionState(page)
    await scrollPost507FinalTableTargetIntoView(page)
    await clickPost507AxisHandle(page, "row", 3)
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expectNoVisibleMenuFlicker(page, "row")
    await expectPost507WheelScrollsWithoutLock(page, "507 user flow row axis")

    await page.keyboard.press("Escape")
    await clearPost507SelectionState(page)
    await scrollPost507FinalTableTargetIntoView(page)
    await clickPost507AxisHandle(page, "column", 7)
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-menu")).toBeVisible()
    await expectNoVisibleMenuFlicker(page, "column")
    await expectPost507WheelScrollsWithoutLock(page, "507 user flow column axis")

    await page.keyboard.press("Escape")
    await clearPost507SelectionState(page)
    await scrollPost507FinalTableTargetIntoView(page)
    const tableBox = await finalTable.boundingBox()
    if (!tableBox) throw new Error("507 final table block selection metrics are missing")
    await page.mouse.move(tableBox.x + 24, tableBox.y + 24)
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    const finalDiagnostics = await readPost507EditorDiagnostics(page, "507-user-flow-final")
    expect(finalDiagnostics.selectionText.trim()).toBe("")
    expect(finalDiagnostics.domSnapshot.selectedCellCount).toBe(0)
    expect(finalDiagnostics.domSnapshot.blockOverlayCount).toBe(1)
    await expectPost507WheelScrollsWithoutLock(page, "507 user flow table block selection")
  })
})
