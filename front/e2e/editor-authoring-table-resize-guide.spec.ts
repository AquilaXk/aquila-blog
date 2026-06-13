import { expect, test } from "./helpers/authoringPlaywright"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring table resize guide", () => {
  test("table column resize handle은 drag 후 column width 메타를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const beforeWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )
    const beforeMarkdown = (await markdownOutput.textContent()) || ""
    await page.getByRole("button", { name: "QA 열 리사이즈" }).click()

    await expect
      .poll(async () =>
        (await markdownOutput.textContent()) || ""
      )
      .not.toBe(beforeMarkdown)

    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) =>
          Math.round((element as HTMLElement).getBoundingClientRect().width)
        )
      )
      .toBeGreaterThanOrEqual(beforeWidth)
    await expect(markdownOutput).toContainText('"columnWidths"')
  })

  test("table column resize drag는 mouseup 전에도 guide가 실제 열 경계를 따라간다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const resizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("table column resize handle is missing")
    }

    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 8, startY, { steps: 4 })

    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    const readGuideBoundaryDelta = async () => {
      const [guideCenter, boundaryRight] = await Promise.all([
        page.getByTestId("table-column-drag-guide").evaluate((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect()
          return Math.round(rect.left + rect.width / 2)
        }),
        firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
      ])
      return Math.abs(guideCenter - boundaryRight)
    }
    const initialBoundaryRight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().right)
    )

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)

    await page.mouse.move(startX - 72, startY, { steps: 8 })

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)
    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right))
      )
      .toBeLessThan(initialBoundaryRight - 24)

    await page.mouse.up()
  })

  test("writer surface의 table column resize drag도 mouseup 전 guide가 실제 열 경계를 따라간다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const resizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("writer table column resize handle is missing")
    }

    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 2, startY)

    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    const readGuideBoundaryDelta = async () => {
      const [guideCenter, boundaryRight] = await Promise.all([
        page.getByTestId("table-column-drag-guide").evaluate((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect()
          return Math.round(rect.left + rect.width / 2)
        }),
        firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
      ])
      return Math.abs(guideCenter - boundaryRight)
    }
    const initialBoundaryRight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().right)
    )

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)

    await page.mouse.move(startX - 72, startY, { steps: 8 })

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)
    const shrunkBoundaryRight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().right)
    )
    expect(shrunkBoundaryRight).toBeLessThan(initialBoundaryRight - 24)

    await page.mouse.move(startX - 36, startY, { steps: 6 })

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)
    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right))
      )
      .toBeGreaterThan(shrunkBoundaryRight + 12)

    await page.mouse.up()
  })

  test("writer surface의 최우측 table column boundary drag도 mouseup 전 guide가 실제 우측 경계를 따라간다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const lastHeaderCell = page.locator("table th").last()
    await lastHeaderCell.click()
    await lastHeaderCell.hover()

    const resizeHandle = page.getByTestId("table-column-resize-boundary-2")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("writer table last-column resize boundary is missing")
    }

    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 2, startY)

    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    const readGuideBoundaryDelta = async () => {
      const [guideCenter, boundaryRight] = await Promise.all([
        page.getByTestId("table-column-drag-guide").evaluate((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect()
          return Math.round(rect.left + rect.width / 2)
        }),
        lastHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
      ])
      return Math.abs(guideCenter - boundaryRight)
    }
    const initialBoundaryRight = await lastHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().right)
    )

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)

    await page.mouse.move(startX + 48, startY, { steps: 8 })

    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)
    await expect
      .poll(async () =>
        lastHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right))
      )
      .toBeGreaterThan(initialBoundaryRight + 8)

    await page.mouse.up()
  })

  test("writer surface의 table column boundary drag는 native text selection 없이 guide만 남긴다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const initialBoundaryCenter = await page
      .getByTestId("table-column-resize-boundary-0")
      .evaluate((element) => {
        const rect = (element as HTMLElement).getBoundingClientRect()
        return Math.round(rect.left + rect.width / 2)
      })

    const resizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("writer table column resize boundary is missing")
    }

    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 2, startY)

    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    await expect(page.getByTestId("table-column-resize-boundary-0")).toHaveCount(0)
    await expect
      .poll(async () => {
        const guideCenter = await page.getByTestId("table-column-drag-guide").evaluate((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect()
          return Math.round(rect.left + rect.width / 2)
        })
        return Math.abs(guideCenter - initialBoundaryCenter)
      })
      .toBeLessThanOrEqual(2)
    await expect
      .poll(async () => {
        const [guideCenter, boundaryRight] = await Promise.all([
          page.getByTestId("table-column-drag-guide").evaluate((element) => {
            const rect = (element as HTMLElement).getBoundingClientRect()
            return Math.round(rect.left + rect.width / 2)
          }),
          firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
        ])
        return Math.abs(guideCenter - boundaryRight)
      })
      .toBeLessThanOrEqual(2)
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString() || ""))
      .toBe("")

    await page.mouse.move(startX + 64, startY, { steps: 8 })

    await expect
      .poll(async () => {
        const [guideCenter, boundaryRight] = await Promise.all([
          page.getByTestId("table-column-drag-guide").evaluate((element) => {
            const rect = (element as HTMLElement).getBoundingClientRect()
            return Math.round(rect.left + rect.width / 2)
          }),
          firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
        ])
        return Math.abs(guideCenter - boundaryRight)
      })
      .toBeLessThanOrEqual(2)
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString() || ""))
      .toBe("")

    await page.mouse.up()
  })

  test("writer surface의 table column boundary drag는 좌우로 흔들어도 guide와 실제 경계가 벌어지지 않는다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const resizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("writer table column resize boundary is missing")
    }

    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)
    const readGuideBoundaryDelta = async () => {
      const [guideCenter, boundaryRight] = await Promise.all([
        page.getByTestId("table-column-drag-guide").evaluate((element) => {
          const rect = (element as HTMLElement).getBoundingClientRect()
          return Math.round(rect.left + rect.width / 2)
        }),
        firstHeaderCell.evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().right)),
      ])
      return Math.abs(guideCenter - boundaryRight)
    }

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    // Headless drag starts can miss the guide until the pointer crosses a tiny delta.
    await page.mouse.move(startX + 8, startY, { steps: 4 })
    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)

    for (const offsetX of [72, 24, 96, 18, 88, 28, 64, 36]) {
      await page.mouse.move(startX + offsetX, startY)
      await expect.poll(readGuideBoundaryDelta).toBeLessThanOrEqual(2)
    }

    await page.mouse.up()
  })

  test("plain markdown table도 column width 메타 없이 drag commit 후 실제 폭을 갱신한다", async ({
    page,
  }) => {
    const seedMarkdown = [
      "| 제목 | 내용 |",
      "| --- | --- |",
      "| WebSocket | 실시간 양방향 통신을 처리한다 |",
      "| STOMP | 메시지를 구독하고 배포한다 |",
    ].join("\n")
    const seedParam = encodeURIComponent(seedMarkdown.replace(/\n/g, "\\n"))

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seedParam}`)

    const firstHeaderCell = page.locator("table th").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const resizeHandle = page.getByTestId("table-column-resize-boundary-0")
    const handleBox = await resizeHandle.boundingBox()
    if (!handleBox) {
      throw new Error("plain markdown table column resize handle is missing")
    }

    const beforeWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )
    const beforeMarkdown = (await markdownOutput.textContent()) || ""
    const startX = Math.round(handleBox.x + handleBox.width / 2)
    const startY = Math.round(handleBox.y + handleBox.height / 2)

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX + 72, startY, { steps: 8 })
    await page.mouse.up()

    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) =>
          Math.round((element as HTMLElement).getBoundingClientRect().width)
        )
      )
      .toBeGreaterThan(beforeWidth + 16)

    await expect
      .poll(async () =>
        (await markdownOutput.textContent()) || ""
      )
      .not.toBe(beforeMarkdown)
    await expect(markdownOutput).toContainText('"columnWidths"')
  })
})
