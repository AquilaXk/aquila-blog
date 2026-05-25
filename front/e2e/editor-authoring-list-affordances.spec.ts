import { expect, test } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
  expectListItemHandleReady,
  hoverListItemGutter,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring list affordances", () => {
  test("리스트 항목 안의 Tab/Shift+Tab은 Notion처럼 단계 승강으로 동작한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const blockSelectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
    const clickListItemParagraph = async (label: string) => {
      const paragraph = editor.locator("li > p", { hasText: new RegExp(`^${label}$`) }).last()
      await paragraph.click()
      await expect.poll(() =>
        paragraph.evaluate((element) => {
          const selection = window.getSelection()
          return Boolean(selection?.anchorNode && element.contains(selection.anchorNode))
        })
      ).toBe(true)
    }
    const countOwnLabel = (label: string) =>
      page.evaluate((targetLabel) => {
        const readOwnLabel = (item: HTMLElement) =>
          Array.from(item.childNodes)
            .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        return Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
        ).filter((item) => readOwnLabel(item) === targetLabel).length
      }, label)
    const hasNestedChild = (parentLabel: string, childLabel: string) =>
      page.evaluate(
        ({ childLabel: expectedChildLabel, parentLabel: expectedParentLabel }) => {
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          return Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
          ).some(
            (item) =>
              readOwnLabel(item) === expectedParentLabel &&
              Array.from(item.querySelectorAll<HTMLElement>("li")).some(
                (child) => readOwnLabel(child) === expectedChildLabel
              )
          )
        },
        { childLabel, parentLabel }
      )
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("1단계")
    await page.keyboard.press("Enter")
    await page.keyboard.type("2단계")
    await page.keyboard.press("Enter")
    await page.keyboard.type("3단계")

    await clickListItemParagraph("3단계")
    await page.keyboard.press("Tab")
    await expect.poll(() => hasNestedChild("2단계", "3단계")).toBe(true)
    await expect(blockSelectionOverlay).toHaveCount(0)
    await expect.poll(() => countOwnLabel("1단계")).toBe(1)
    await expect.poll(() => countOwnLabel("2단계")).toBe(1)
    await expect.poll(() => countOwnLabel("3단계")).toBe(1)

    await clickListItemParagraph("3단계")
    await page.keyboard.press("Shift+Tab")
    await expect(blockSelectionOverlay).toHaveCount(0)
    await expect.poll(() => hasNestedChild("2단계", "3단계")).toBe(false)
    await expect.poll(() => countOwnLabel("3단계")).toBe(1)
  })

  test("writer surface의 리스트 항목 안 Tab/Shift+Tab도 단계 승강으로 동작한다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const blockSelectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
    const clickListItemParagraph = async (label: string) => {
      const paragraph = editor.locator("li > p", { hasText: new RegExp(`^${label}$`) }).last()
      await paragraph.click()
      await expect.poll(() =>
        paragraph.evaluate((element) => {
          const selection = window.getSelection()
          return Boolean(selection?.anchorNode && element.contains(selection.anchorNode))
        })
      ).toBe(true)
    }
    const countOwnLabel = (label: string) =>
      page.evaluate((targetLabel) => {
        const readOwnLabel = (item: HTMLElement) =>
          Array.from(item.childNodes)
            .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
        return Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
        ).filter((item) => readOwnLabel(item) === targetLabel).length
      }, label)
    const hasNestedChild = (parentLabel: string, childLabel: string) =>
      page.evaluate(
        ({ childLabel: expectedChildLabel, parentLabel: expectedParentLabel }) => {
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          return Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
          ).some(
            (item) =>
              readOwnLabel(item) === expectedParentLabel &&
              Array.from(item.querySelectorAll<HTMLElement>("li")).some(
                (child) => readOwnLabel(child) === expectedChildLabel
              )
          )
        },
        { childLabel, parentLabel }
      )
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("1단계")
    await page.keyboard.press("Enter")
    await page.keyboard.type("2단계")
    await page.keyboard.press("Enter")
    await page.keyboard.type("3단계")

    await clickListItemParagraph("3단계")
    await page.keyboard.press("Tab")
    await expect.poll(() => hasNestedChild("2단계", "3단계")).toBe(true)
    await expect(blockSelectionOverlay).toHaveCount(0)
    await expect.poll(() => countOwnLabel("1단계")).toBe(1)
    await expect.poll(() => countOwnLabel("2단계")).toBe(1)
    await expect.poll(() => countOwnLabel("3단계")).toBe(1)

    await clickListItemParagraph("3단계")
    await page.keyboard.press("Shift+Tab")
    await expect(blockSelectionOverlay).toHaveCount(0)
    await expect.poll(() => hasNestedChild("2단계", "3단계")).toBe(false)
    await expect.poll(() => countOwnLabel("3단계")).toBe(1)
  })

  test("리스트 항목 handle은 말머리 묶음 전체가 아니라 각 항목을 따라간다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    const blockHandleRail = page.locator("[data-block-handle-rail='true']")

    const measureHandleAlignment = async (label: string) =>
      page.evaluate((targetLabel) => {
        const items = Array.from(document.querySelectorAll<HTMLElement>(".aq-block-editor__content li"))
        const targetItem = items.find((item) => item.textContent?.includes(targetLabel)) ?? null
        const handle = document.querySelector<HTMLElement>("[data-testid='block-drag-handle']")
        if (!targetItem || !handle) return null
        const itemRect = targetItem.getBoundingClientRect()
        const handleRect = handle.getBoundingClientRect()
        return {
          itemCenterY: Math.round(itemRect.top + itemRect.height / 2),
          handleCenterY: Math.round(handleRect.top + handleRect.height / 2),
        }
      }, label)

    const firstItem = editor.locator("li", { hasText: "Access" }).first()
    await firstItem.locator("p").first().hover()
    await expect(blockHandleRail.getByRole("button", { name: "블록 추가" })).toBeVisible()
    await expect.poll(() => measureHandleAlignment("Access")).not.toBeNull()
    const firstAlignment = await measureHandleAlignment("Access")
    if (!firstAlignment) {
      throw new Error("Access handle metrics are missing")
    }

    const secondItem = editor.locator("li", { hasText: "Refresh" }).first()
    await secondItem.locator("p").first().hover()
    await expect(blockHandleRail.getByRole("button", { name: "블록 추가" })).toBeVisible()
    await expect.poll(() => measureHandleAlignment("Refresh")).not.toBeNull()
    const refreshMetrics = await measureHandleAlignment("Refresh")
    if (!refreshMetrics) {
      throw new Error("Refresh handle metrics are missing")
    }

    expect(Math.abs(firstAlignment.handleCenterY - firstAlignment.itemCenterY)).toBeLessThanOrEqual(18)
    expect(Math.abs(refreshMetrics.handleCenterY - refreshMetrics.itemCenterY)).toBeLessThanOrEqual(18)
    expect(refreshMetrics.handleCenterY).toBeGreaterThan(firstAlignment.handleCenterY + 20)
  })

  test("writer surface의 선택된 리스트 항목 handle은 wrapper 선택으로 흔들리지 않고 선택 항목을 유지한다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Retry")

    const retryItem = editor.locator("li", { hasText: /^Retry$/ }).first()
    await retryItem.locator("p").first().click()
    await hoverListItemGutter(page, "Retry")

    const { handleBox: dragHandleBox } = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await selectedDragHandle.click({
      position: {
        x: dragHandleBox.width / 2,
        y: dragHandleBox.height / 2,
      },
    })
    await expect(selectedDragHandle).toBeVisible()
    await expect(page.getByRole("button", { name: "블록 추가" })).toBeVisible()

    const { handleBox: selectedHandleBox } = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    await page.mouse.move(
      selectedHandleBox.x + selectedHandleBox.width / 2,
      selectedHandleBox.y + selectedHandleBox.height / 2
    )
    await page.waitForTimeout(120)
    await page.mouse.down()
    await page.mouse.move(
      selectedHandleBox.x + selectedHandleBox.width / 2,
      selectedHandleBox.y + selectedHandleBox.height / 2 + 14
    )
    await page.waitForTimeout(80)
    await page.mouse.up()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll<HTMLElement>("button"))
          const listItemHandleCount = buttons.filter(
            (element) =>
              element.getAttribute("aria-label") === "목록 항목 이동" ||
              element.getAttribute("title") === "목록 항목 이동"
          ).length
          const blockHandleCount = buttons.filter(
            (element) =>
              element.getAttribute("aria-label") === "블록 이동" ||
              element.getAttribute("title") === "블록 이동"
          ).length
          const plusHandleCount = buttons.filter(
            (element) =>
              element.getAttribute("aria-label") === "블록 추가" ||
              element.getAttribute("title") === "블록 추가"
          ).length
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()
          const retryItem =
            Array.from(
              document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
            ).find((item) => readOwnLabel(item) === "Retry") ?? null
          return {
            listItemHandleCount,
            blockHandleCount,
            plusHandleCount,
            retryDraggable: retryItem?.getAttribute("draggable") === "true",
          }
        })
      )
      .toEqual({
        listItemHandleCount: 1,
        blockHandleCount: 0,
        plusHandleCount: 1,
        retryDraggable: true,
      })

    await expect(selectedDragHandle).toBeVisible()
    await expect(page.getByRole("button", { name: "블록 이동" })).toHaveCount(0)
  })

  test("writer surface의 리스트 항목 handle은 row gutter hover에서도 항목을 따라간다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Retry")

    await hoverListItemGutter(page, "Retry")

    await expect(page.getByRole("button", { name: "목록 항목 이동" })).toBeVisible()
    await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
  })

  test("writer surface의 선택된 리스트 항목 affordance는 파란 rail 없이 말머리 바깥에 유지된다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Retry")

    await hoverListItemGutter(page, "Retry")

    const { handleBox: dragHandleBox } = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    await page.mouse.click(dragHandleBox.x + dragHandleBox.width / 2, dragHandleBox.y + dragHandleBox.height / 2)
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await expect(selectedDragHandle).toBeVisible()
    const selectedMetrics = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    const selectedHandleBox = selectedMetrics.handleBox

    expect(selectedMetrics.boxShadow).toBe("none")
    expect(selectedMetrics.textLeft).not.toBeNull()
    expect(selectedHandleBox.x + selectedHandleBox.width + 6).toBeLessThanOrEqual(
      selectedMetrics.itemLeft
    )
  })

  test("engine surface의 선택된 리스트 항목 handle drag는 항목 순서를 갱신한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Retry")

    await hoverListItemGutter(page, "Retry")

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()
    await expect(page.getByRole("button", { name: "목록 항목 이동" })).toBeVisible()

    const firstItem = editor.locator("li", { hasText: /^Access$/ }).first()
    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await expect(firstItem).toBeVisible()
    await expect(selectedDragHandle).toBeVisible()

    const dragGeometry = await page.evaluate(() => {
      const handle = Array.from(document.querySelectorAll<HTMLElement>("button")).find(
        (element) => element.getAttribute("aria-label") === "목록 항목 이동" || element.getAttribute("title") === "목록 항목 이동"
      )
      const firstItem =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")).find((item) =>
          item.textContent?.includes("Access")
        ) ?? null
      if (!handle || !firstItem) return null

      const handleRect = handle.getBoundingClientRect()
      const firstRect = firstItem.getBoundingClientRect()
      return {
        dragBox: {
          x: handleRect.x,
          y: handleRect.y,
          width: handleRect.width,
          height: handleRect.height,
        },
        firstBox: {
          x: firstRect.x,
          y: firstRect.y,
          width: firstRect.width,
          height: firstRect.height,
        },
      }
    })
    if (!dragGeometry) {
      throw new Error("리스트 항목 drag 좌표를 계산할 수 없습니다.")
    }
    const { dragBox, firstBox } = dragGeometry

    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
    await page.waitForTimeout(120)
    await page.mouse.down()
    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + Math.max(6, firstBox.height * 0.2), {
      steps: 12,
    })
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()
    await page.mouse.up()
    await expect(page.getByTestId("block-drag-ghost")).toHaveCount(0)

    await expect
      .poll(() =>
        page.evaluate(() => {
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()

          return Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
          )
            .map((item) => readOwnLabel(item))
            .filter(Boolean)
        })
      )
      .toEqual(["Retry", "Access", "Refresh"])
  })

  test("writer surface의 선택된 리스트 항목 handle drag는 항목 순서를 갱신한다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "목록" }).first().click()
    await page.keyboard.type("Access")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Refresh")
    await page.keyboard.press("Enter")
    await page.keyboard.type("Retry")

    await hoverListItemGutter(page, "Retry")

    const { handleBox: dragHandleBox } = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    await page.mouse.click(
      dragHandleBox.x + dragHandleBox.width / 2,
      dragHandleBox.y + dragHandleBox.height / 2
    )
    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await expect(selectedDragHandle).toBeVisible()
    const firstItem = editor.locator("li", { hasText: /^Access$/ }).first()
    await expect(firstItem).toBeVisible()

    const dragGeometry = await page.evaluate(() => {
      const readOwnLabel = (item: HTMLElement) =>
        Array.from(item.childNodes)
          .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
          .map((node) => node.textContent || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      const retryItem =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")).find(
          (item) => readOwnLabel(item) === "Retry"
        ) ?? null
      const firstItem =
        Array.from(document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")).find(
          (item) => readOwnLabel(item) === "Access"
        ) ?? null
      if (!retryItem || !firstItem) return null

      const retryRect = retryItem.getBoundingClientRect()
      const retryCenterY = retryRect.top + retryRect.height / 2
      const handleCandidate = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .filter(
          (element) =>
            (element.getAttribute("aria-label") === "목록 항목 이동" ||
              element.getAttribute("title") === "목록 항목 이동") &&
            element.offsetParent !== null
        )
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { rect, delta: Math.abs(rect.top + rect.height / 2 - retryCenterY) }
        })
        .sort((left, right) => left.delta - right.delta)[0]
      if (!handleCandidate) return null

      const handleRect = handleCandidate.rect
      const firstRect = firstItem.getBoundingClientRect()
      return {
        dragBox: {
          x: handleRect.x,
          y: handleRect.y,
          width: handleRect.width,
          height: handleRect.height,
        },
        firstBox: {
          x: firstRect.x,
          y: firstRect.y,
          width: firstRect.width,
          height: firstRect.height,
        },
      }
    })
    if (!dragGeometry) {
      throw new Error("writer 리스트 항목 drag 좌표를 계산할 수 없습니다.")
    }
    const { dragBox, firstBox } = dragGeometry

    await page.mouse.move(
      dragBox.x + dragBox.width / 2,
      dragBox.y + dragBox.height / 2
    )
    await page.waitForTimeout(120)
    await page.mouse.down()
    await page.mouse.move(
      firstBox.x + firstBox.width / 2,
      firstBox.y + Math.max(6, firstBox.height * 0.2),
      {
        steps: 12,
      }
    )
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()
    await page.mouse.up()
    await expect(page.getByTestId("block-drag-ghost")).toHaveCount(0)

    await expect
      .poll(() =>
        page.evaluate(() => {
          const readOwnLabel = (item: HTMLElement) =>
            Array.from(item.childNodes)
              .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
              .map((node) => node.textContent || "")
              .join(" ")
              .replace(/\s+/g, " ")
              .trim()

          return Array.from(
            document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
          )
            .map((item) => readOwnLabel(item))
            .filter(Boolean)
        })
      )
      .toEqual(["Retry", "Access", "Refresh"])
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
  })
})
