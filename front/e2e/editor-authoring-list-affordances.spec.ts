import { expect, test, type Page } from "@playwright/test"
import {
  QA_ENGINE_ROUTE,
  QA_WRITER_ROUTE,
  expectListItemHandleReady,
  hoverListItemGutter,
} from "./helpers/editorAuthoringFlow"
import { mockEditorRouteWithPost507 } from "./helpers/post507Fixtures"
import { LIST_ITEM_SELECTOR } from "../src/components/editor/nestedListItemModel"

const POST_507_FIRST_LIST_ITEM = "“Stateless가 좋다는데, 왜 좋은 거지?”"

const readListItemSelectionOverlayMetrics = async (page: Page, label: string) =>
  page.evaluate((targetLabel) => {
    const readOwnLabel = (item: HTMLElement) =>
      Array.from(item.childNodes)
        .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
        .map((node) => node.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()

    const targetItem =
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
      ).find((item) => readOwnLabel(item) === targetLabel) ?? null
    const overlay = document.querySelector<HTMLElement>("[data-testid='keyboard-block-selection-overlay']")
    if (!targetItem || !overlay) return null

    const itemRect = targetItem.getBoundingClientRect()
    const overlayRect = overlay.getBoundingClientRect()
    const listRect = targetItem.closest("ul, ol")?.getBoundingClientRect() ?? itemRect
    const itemStyle = window.getComputedStyle(targetItem)
    return {
      itemBackgroundColor: itemStyle.backgroundColor,
      itemBoxShadow: itemStyle.boxShadow,
      itemHeight: itemRect.height,
      itemRight: itemRect.right,
      itemTop: itemRect.top,
      markerAwareLeft: Math.min(itemRect.left, listRect.left),
      markerAwareRight: Math.max(itemRect.right, listRect.right),
      overlayHeight: overlayRect.height,
      overlayLeft: overlayRect.left,
      overlayRight: overlayRect.right,
      overlayTop: overlayRect.top,
    }
  }, label)

test.describe("editor authoring list affordances", () => {
  test("plain li fallback selector는 nested list 손자를 direct child로 포함하지 않는다", async ({
    page,
  }) => {
    await page.setContent(`
      <main>
        <ul id="plain-list-root">
          <li id="plain-parent">Parent<ul><li id="plain-child">Child</li></ul></li>
          <li id="plain-sibling">Sibling</li>
        </ul>
      </main>
    `)

    const directIds = await page.evaluate((selector) => {
      const root = document.querySelector<HTMLElement>("#plain-list-root")
      return root
        ? Array.from(root.querySelectorAll<HTMLElement>(`:scope > ${selector}`)).map(
            (element) => element.id
          )
        : []
    }, LIST_ITEM_SELECTOR)

    expect(directIds).toEqual(["plain-parent", "plain-sibling"])
  })

  test("실제 /editor/[id] 507 리스트 항목 block selection은 글머리 안쪽 paint가 아니라 fixed overlay로 표시된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })

    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 590,
      title: "post 507 list item selection route 글",
      version: 2,
    })

    const targetItem = editor.locator("li", { hasText: "Stateless가 좋다는데" }).first()
    await expect(targetItem).toBeVisible()
    await targetItem.scrollIntoViewIfNeeded()
    await hoverListItemGutter(page, POST_507_FIRST_LIST_ITEM)

    const { handleBox } = await expectListItemHandleReady(page, POST_507_FIRST_LIST_ITEM, "목록 항목 이동")
    await page.mouse.click(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)

    const blockSelectionOverlay = page.getByTestId("keyboard-block-selection-overlay")
    await expect(blockSelectionOverlay).toBeVisible()
    const metrics = await readListItemSelectionOverlayMetrics(page, POST_507_FIRST_LIST_ITEM)
    if (!metrics) {
      throw new Error("post 507 list item selection overlay metrics are missing")
    }

    expect(Math.abs(metrics.overlayTop - metrics.itemTop)).toBeLessThanOrEqual(8)
    expect(Math.abs(metrics.overlayHeight - metrics.itemHeight)).toBeLessThanOrEqual(12)
    expect(metrics.overlayLeft).toBeLessThanOrEqual(metrics.markerAwareLeft + 4)
    expect(metrics.overlayRight).toBeGreaterThanOrEqual(metrics.markerAwareRight - 4)
    expect(metrics.itemBoxShadow).toBe("none")
    expect(metrics.itemBackgroundColor).toBe("rgba(0, 0, 0, 0)")
  })

  test("실제 /editor/[id] 507 리스트 항목 더블클릭은 native 텍스트 선택을 caret으로 접지 않는다", async ({
    page,
  }) => {
    const { editor } = await mockEditorRouteWithPost507(page, {
      postId: 591,
      title: "post 507 list item double click route 글",
      version: 2,
    })

    const paragraph = editor.locator("li > p", { hasText: "세션이랑 JWT" }).first()
    await paragraph.scrollIntoViewIfNeeded()
    const clickPoint = await paragraph.evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const textNode = walker.currentNode as Text
        const startOffset = textNode.data.indexOf("JWT")
        if (startOffset < 0) continue
        const range = document.createRange()
        range.setStart(textNode, startOffset)
        range.setEnd(textNode, startOffset + 3)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          }
        }
      }
      return null
    })
    if (!clickPoint) {
      throw new Error("post 507 JWT double click point is missing")
    }

    await page.mouse.dblclick(clickPoint.x, clickPoint.y)
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return {
            isCollapsed: selection?.isCollapsed ?? true,
            selectedCellCount: document.querySelectorAll(".selectedCell").length,
            selectionText: selection?.toString() ?? "",
          }
        })
      )
      .toMatchObject({
        isCollapsed: false,
        selectedCellCount: 0,
        selectionText: expect.stringContaining("JWT"),
      })
  })

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

  test("writer surface의 선택된 리스트 항목 affordance는 내부 paint 없이 fixed overlay로 표시된다", async ({
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
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    const selectedDragHandle = page.getByRole("button", { name: "목록 항목 이동" })
    await expect(selectedDragHandle).toBeVisible()
    const selectedMetrics = await expectListItemHandleReady(page, "Retry", "목록 항목 이동")
    const overlayMetrics = await readListItemSelectionOverlayMetrics(page, "Retry")
    if (!overlayMetrics) {
      throw new Error("writer list item selection overlay metrics are missing")
    }
    const selectedHandleBox = selectedMetrics.handleBox

    expect(Math.abs(overlayMetrics.overlayTop - overlayMetrics.itemTop)).toBeLessThanOrEqual(8)
    expect(Math.abs(overlayMetrics.overlayHeight - overlayMetrics.itemHeight)).toBeLessThanOrEqual(12)
    expect(overlayMetrics.overlayLeft).toBeLessThanOrEqual(overlayMetrics.markerAwareLeft + 4)
    expect(overlayMetrics.overlayRight).toBeGreaterThanOrEqual(overlayMetrics.markerAwareRight - 4)
    expect(selectedMetrics.boxShadow).toBe("none")
    expect(overlayMetrics.itemBackgroundColor).toBe("rgba(0, 0, 0, 0)")
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
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
  })
})
