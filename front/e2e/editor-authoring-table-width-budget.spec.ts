import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring table width budgets", () => {
  test("새 table은 3x3이며 normal mode 기본 가독 폭으로 생성된다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const tableShape = await page.evaluate(() => {
      const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
      const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      const table = wrapper?.querySelector<HTMLElement>("table")
      const rows = Array.from(table?.querySelectorAll<HTMLTableRowElement>("tr") ?? [])
      const firstRowCells = rows[0]?.querySelectorAll("th, td") ?? []
      if (!contentRoot || !wrapper || !table || rows.length === 0) return null
      return {
        contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        rowCount: rows.length,
        columnCount: firstRowCells.length,
      }
    })

    expect(tableShape).not.toBeNull()
    if (!tableShape) {
      throw new Error("table width shape is missing")
    }

    expect(tableShape.rowCount).toBe(3)
    expect(tableShape.columnCount).toBe(3)
    expect(Math.abs(tableShape.wrapperWidth - tableShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(tableShape.tableWidth).toBeLessThan(tableShape.contentWidth - 120)
    expect(tableShape.tableWidth).toBeGreaterThanOrEqual(540)
    expect(tableShape.tableWidth).toBeLessThanOrEqual(548)
  })

  test("legacy 최대폭 normal table은 작성 surface에서 기본 가독 폭으로 자동 축소된다", async ({
    page,
  }) => {
    const seed = encodeURIComponent(
      [
        '<!-- aq-table {"overflowMode":"normal","columnWidths":[314,314,316]} -->',
        "| 구성 요소 | 역할 | 실무에서 자주 생기는 문제 |",
        "| --- | --- | --- |",
        "| Endpoint | WebSocket 연결 URL | CORS 설정, 프록시 업그레이드 헤더 누락 |",
        "| Application Prefix | 클라이언트가 서버로 보내는 메시지 경로 | 컨트롤러 매핑 충돌, 경로 규칙 혼란 |",
        "| Broker Prefix | 서버가 구독자에게 메시지를 배포하는 경로 | 트래픽 증가 시 Broker 한계 |",
      ].join("\\n")
    )
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).not.toContainText('"columnWidths":[314,314,316]')

    const tableShape = await page.evaluate(() => {
      const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
      const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      const table = wrapper?.querySelector<HTMLElement>("table")
      const headerCells = Array.from(table?.querySelectorAll<HTMLElement>("th") ?? [])
      if (!contentRoot || !wrapper || !table || headerCells.length === 0) return null
      return {
        contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        columnWidths: headerCells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
      }
    })

    expect(tableShape).not.toBeNull()
    if (!tableShape) {
      throw new Error("legacy normalized table shape is missing")
    }

    expect(Math.abs(tableShape.wrapperWidth - tableShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(tableShape.tableWidth).toBeLessThan(tableShape.contentWidth - 120)
    expect(tableShape.tableWidth).toBeGreaterThanOrEqual(540)
    expect(tableShape.tableWidth).toBeLessThanOrEqual(548)
    tableShape.columnWidths.forEach((width) => {
      expect(width).toBeGreaterThanOrEqual(178)
      expect(width).toBeLessThanOrEqual(184)
    })
  })

  test("table column resize는 활성 열만 바꾸고 다른 열은 유지한 채 writer budget 안에서 clamp한다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const readShape = async () =>
      page.evaluate(() => {
        const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
        const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
        const table = wrapper?.querySelector<HTMLElement>("table")
        const headerCells = Array.from(table?.querySelectorAll<HTMLElement>("th") ?? [])
        if (!contentRoot || !wrapper || !table || headerCells.length === 0) return null
        return {
          contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
          wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
          tableWidth: Math.round(table.getBoundingClientRect().width),
          columnWidths: headerCells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
        }
      })

    const beforeShape = await readShape()
    expect(beforeShape).not.toBeNull()
    if (!beforeShape) {
      throw new Error("table width shape is missing")
    }

    const firstResizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await firstResizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("first table column resize handle is missing")
    }

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 12, startY, { steps: 4 })
    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    await page.mouse.move(startX - 72, startY, { steps: 8 })
    await page.mouse.up()

    await expect
      .poll(async () => {
        const shape = await readShape()
        return shape?.columnWidths[0] ?? null
      })
      .not.toBe(beforeShape.columnWidths[0] ?? null)

    const afterShape = await readShape()
    expect(afterShape).not.toBeNull()
    if (!afterShape) {
      throw new Error("updated table width shape is missing")
    }

    expect(Math.abs(afterShape.wrapperWidth - afterShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(afterShape.wrapperWidth).toBeLessThan(afterShape.contentWidth - 12)
    expect(afterShape.tableWidth).toBeLessThan(beforeShape.tableWidth - 12)
    expect(afterShape.columnWidths[0] ?? 0).toBeLessThan((beforeShape.columnWidths[0] ?? 0) - 12)
    afterShape.columnWidths.slice(1).forEach((width, index) => {
      expect(Math.abs(width - (beforeShape.columnWidths[index + 1] ?? width))).toBeLessThanOrEqual(2)
    })

    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const firstHandleBox = await firstResizeHandle.boundingBox()
    if (!firstHandleBox) {
      throw new Error("first table column resize handle is missing")
    }

    const firstStartX = firstHandleBox.x + firstHandleBox.width / 2
    const firstStartY = firstHandleBox.y + firstHandleBox.height / 2
    const clampAttemptDelta = beforeShape.contentWidth

    await page.mouse.move(firstStartX, firstStartY)
    await page.mouse.down()
    await page.mouse.move(firstStartX + clampAttemptDelta, firstStartY, { steps: 16 })
    await page.mouse.up()

    const clampedShape = await readShape()
    expect(clampedShape).not.toBeNull()
    if (!clampedShape) {
      throw new Error("clamped table width shape is missing")
    }

    expect(clampedShape.tableWidth).toBeLessThanOrEqual(clampedShape.contentWidth + 2)
    expect(clampedShape.columnWidths[0] ?? 0).toBeGreaterThan((afterShape.columnWidths[0] ?? 0) + 12)
    expect(Math.abs((clampedShape.columnWidths[1] ?? 0) - (afterShape.columnWidths[1] ?? 0))).toBeLessThanOrEqual(2)
    expect(Math.abs((clampedShape.columnWidths[2] ?? 0) - (afterShape.columnWidths[2] ?? 0))).toBeLessThanOrEqual(2)
    expect(clampedShape.tableWidth).toBeGreaterThan(afterShape.tableWidth + 12)
    expect(clampedShape.tableWidth).toBeLessThanOrEqual(beforeShape.contentWidth + 2)

    const overflowPolicyHint = page.getByTestId("table-overflow-policy-hint")
    await expect(overflowPolicyHint).toBeVisible()
    await expect(overflowPolicyHint).toContainText("페이지 너비에 맞춤 유지 중")
    await overflowPolicyHint.getByTestId("table-overflow-policy-hint-wide-action").click()
    await expect(page.locator(".aq-block-editor__content .tableWrapper > table").first()).toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')
    await expect(overflowPolicyHint).toBeHidden()
  })

  test("normal mode에서 열 삭제는 기존 표 폭을 유지하며 남은 열 폭을 재분배하고 항상 최대폭으로 되돌리지는 않는다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const readShape = async () =>
      page.evaluate(() => {
        const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
        const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
        const table = wrapper?.querySelector<HTMLElement>("table")
        const headerCells = Array.from(table?.querySelectorAll<HTMLElement>("th") ?? [])
        if (!contentRoot || !wrapper || !table || headerCells.length === 0) return null
        return {
          contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
          wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
          tableWidth: Math.round(table.getBoundingClientRect().width),
          columnWidths: headerCells.map((cell) => Math.round(cell.getBoundingClientRect().width)),
        }
      })

    const firstResizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await firstResizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("first table column resize handle is missing")
    }

    const startX = handleBox.x + handleBox.width / 2
    const startY = handleBox.y + handleBox.height / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - 96, startY, { steps: 10 })
    await page.mouse.up()

    const narrowedShape = await readShape()
    expect(narrowedShape).not.toBeNull()
    if (!narrowedShape) {
      throw new Error("narrowed table width shape is missing")
    }

    expect(Math.abs(narrowedShape.wrapperWidth - narrowedShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(narrowedShape.tableWidth).toBeLessThan(narrowedShape.contentWidth - 24)

    const thirdHeaderCell = page.locator("table th").nth(2)
    await thirdHeaderCell.click()
    await page.getByRole("button", { name: "QA 열 선택" }).click()
    await page.getByRole("button", { name: "QA 열 삭제" }).click()

    const afterDeleteShape = await readShape()
    expect(afterDeleteShape).not.toBeNull()
    if (!afterDeleteShape) {
      throw new Error("post-delete table width shape is missing")
    }

    expect(afterDeleteShape.columnWidths).toHaveLength(2)
    expect(Math.abs(afterDeleteShape.wrapperWidth - afterDeleteShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(Math.abs(afterDeleteShape.tableWidth - narrowedShape.tableWidth)).toBeLessThanOrEqual(8)
    expect(afterDeleteShape.tableWidth).toBeLessThan(afterDeleteShape.contentWidth - 24)
    expect(afterDeleteShape.columnWidths[0]).toBeGreaterThan(narrowedShape.columnWidths[0] + 60)
    expect(afterDeleteShape.columnWidths.every((width) => width >= 140)).toBe(true)
  })

  test("large table 조건이 되면 auto-wide로 승격되고 small table은 normal을 유지한다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()

    const table = page.locator(".aq-block-editor__content .tableWrapper > table").first()
    const tableWrapper = page.locator(".aq-block-editor__content .tableWrapper").first()

    await expect(table).not.toHaveAttribute("data-overflow-mode", "wide")

    await page.getByRole("button", { name: "QA 열 추가" }).click()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(4)
    await expect(table).not.toHaveAttribute("data-overflow-mode", "wide")

    for (let step = 0; step < 4; step += 1) {
      await page.getByRole("button", { name: "QA 열 추가" }).click()
    }
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(8)
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await expect(tableWrapper).toHaveAttribute("data-overflow-mode", "wide")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')
  })
})
