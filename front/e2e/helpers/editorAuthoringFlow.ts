import { expect } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

export const QA_ENGINE_ROUTE = "/_qa/block-editor-slash?surface=engine"
export const QA_WRITER_ROUTE = "/_qa/block-editor-slash?surface=writer"
export const UNDO_SHORTCUT = process.platform === "darwin" ? "Meta+z" : "Control+z"

export const expectVisibleBox = async (locator: Locator, errorMessage: string) => {
  await expect(locator).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox()
        return Boolean(box && box.width > 0 && box.height > 0)
      },
      { timeout: 15_000 }
    )
    .toBe(true)

  const box = await locator.boundingBox()
  if (!box) {
    throw new Error(errorMessage)
  }
  return box
}

export const expectEditorToContainLoadedText = async (editor: Locator, text: string) => {
  await expect(editor).toBeVisible({ timeout: 15_000 })
  await expect(editor).toContainText(text, { timeout: 30_000 })
}

export const selectWordInEditable = async (page: Page, editable: Locator, word: string) => {
  const selected = await editable.evaluate((element, targetWord) => {
    const root = element as HTMLElement
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null = null
    let foundIndex = -1

    while (walker.nextNode()) {
      const current = walker.currentNode as Text
      const index = current.data.indexOf(targetWord)
      if (index >= 0) {
        textNode = current
        foundIndex = index
        break
      }
    }

    if (!textNode || foundIndex < 0) return false
    const range = document.createRange()
    range.setStart(textNode, foundIndex)
    range.setEnd(textNode, foundIndex + targetWord.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    ;(textNode.parentElement || root).dispatchEvent(
      new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window })
    )
    return true
  }, word)

  expect(selected).toBe(true)
  await page.waitForTimeout(80)
}

export const setWordSelectionInEditable = async (editable: Locator, word: string) => {
  const selected = await editable.evaluate((element, targetWord) => {
    const root = element as HTMLElement
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let textNode: Text | null = null
    let foundIndex = -1

    while (walker.nextNode()) {
      const current = walker.currentNode as Text
      const index = current.data.indexOf(targetWord)
      if (index >= 0) {
        textNode = current
        foundIndex = index
        break
      }
    }

    if (!textNode || foundIndex < 0) return false
    const range = document.createRange()
    range.setStart(textNode, foundIndex)
    range.setEnd(textNode, foundIndex + targetWord.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    return true
  }, word)

  expect(selected).toBe(true)
}

export const getWordDragPoints = async (
  editable: Locator,
  word: string
): Promise<{ startX: number; startY: number; endX: number; endY: number }> => {
  const points = await editable.evaluate((element, targetWord) => {
    const root = element as HTMLElement
    const textNodes: Text[] = []
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    let cursor: Text | null = null

    while (walker.nextNode()) {
      const current = walker.currentNode as Text
      if (current.textContent?.includes(targetWord)) {
        textNodes.push(current)
      }
    }

    for (const node of textNodes) {
      const index = node.data.indexOf(targetWord)
      if (index < 0) continue
      const range = document.createRange()
      range.setStart(node, index)
      range.setEnd(node, index + targetWord.length)

      const rects = Array.from(range.getClientRects())
      const rect = rects.find((entry) => entry.width > 0 && entry.height > 0) ?? range.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        return {
          startX: Math.round(rect.left + 2),
          startY: Math.round(rect.top + rect.height / 2),
          endX: Math.round(rect.right - 2),
          endY: Math.round(rect.top + rect.height / 2),
        }
      }

      cursor = node
    }

    for (const node of textNodes) {
      const index = node.data.indexOf(targetWord)
      if (index < 0) continue
      for (let offset = 0; offset < targetWord.length; offset += 1) {
        const charRange = document.createRange()
        charRange.setStart(node, index + offset)
        charRange.setEnd(node, index + offset + 1)
        const rect = charRange.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          return {
            startX: Math.round(rect.left + 2),
            startY: Math.round(rect.top + rect.height / 2),
            endX: Math.round(rect.right - 2),
            endY: Math.round(rect.top + rect.height / 2),
          }
        }
      }
      cursor = node
    }

    if (!cursor) return null

    const fallbackElement = cursor.parentElement?.closest("th, td, p, div") ?? root
    const fallbackRect = fallbackElement.getBoundingClientRect()
    if (fallbackRect.width <= 0 || fallbackRect.height <= 0) return null

    return {
      startX: Math.round(fallbackRect.left + fallbackRect.width / 2),
      startY: Math.round(fallbackRect.top + fallbackRect.height / 2),
      endX: Math.round(fallbackRect.left + fallbackRect.width / 2 + 20),
      endY: Math.round(fallbackRect.top + fallbackRect.height / 2),
    }
  }, word)

  if (!points) {
    throw new Error(`could not resolve drag points for word: ${word}`)
  }

  return points
}

export const readTableGrid = async (page: Page) =>
  page.locator("table tr").evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => (cell.textContent || "").trim())
    )
  )

export const getTableAffordances = (page: Page) => ({
  rowHandle: page.locator("[data-table-affordance='row-handle']").first(),
  columnHandle: page.locator("[data-table-affordance='column-handle']").first(),
  rowAddButton: page.locator("[data-table-affordance='row-add']").first(),
  columnAddButton: page.locator("[data-table-affordance='column-add']").first(),
  growHandle: page.locator("[data-table-affordance='grow-handle']").first(),
  structureMenuButton: page.locator("[data-table-affordance='structure-menu']").first(),
  cellMenuButton: page.locator("[data-table-affordance='cell-menu']").first(),
})

export type ListItemHandleMetrics = {
  itemLeft: number
  itemCenterY: number
  handleCenterY: number
  handleBox: { x: number; y: number; width: number; height: number }
  textLeft: number | null
  boxShadow: string | null
}

export const readListItemHandleMetrics = async (
  page: Page,
  label: string,
  handleLabel?: string
): Promise<ListItemHandleMetrics | null> =>
  page.evaluate(
    ({ targetLabel, targetHandleLabel }) => {
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
      if (!targetItem) {
        return null
      }

      const expectedHandleLabel = targetHandleLabel ?? "목록 항목 이동"
      const itemRect = targetItem.getBoundingClientRect()
      const itemCenterY = itemRect.top + itemRect.height / 2
      const handleCandidates = Array.from(document.querySelectorAll<HTMLElement>("button"))
        .filter(
          (element) =>
            (element.getAttribute("aria-label") === expectedHandleLabel ||
              element.getAttribute("title") === expectedHandleLabel) &&
            (targetHandleLabel || element.getAttribute("data-testid") === "block-drag-handle") &&
            element.offsetParent !== null
        )
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return { element, rect, delta: Math.abs(rect.top + rect.height / 2 - itemCenterY) }
        })
        .sort((left, right) => left.delta - right.delta)
      const handle = handleCandidates[0] ?? null

      if (!handle || handle.element.offsetParent === null) {
        return null
      }

      const handleRect = handle.rect
      const textBlock = targetItem.querySelector("p") as HTMLElement | null

      return {
        itemLeft: itemRect.left,
        itemCenterY: itemRect.top + itemRect.height / 2,
        handleCenterY: handleRect.top + handleRect.height / 2,
        handleBox: {
          x: handleRect.x,
          y: handleRect.y,
          width: handleRect.width,
          height: handleRect.height,
        },
        textLeft: textBlock?.getBoundingClientRect().left ?? null,
        boxShadow: window.getComputedStyle(targetItem).boxShadow,
      }
    },
    { targetLabel: label, targetHandleLabel: handleLabel ?? null }
  )

export const expectListItemHandleReady = async (page: Page, label: string, handleLabel?: string) => {
  await expect
    .poll(
      async () => {
        const metrics = await readListItemHandleMetrics(page, label, handleLabel)
        if (metrics) return metrics

        try {
          await hoverListItemGutter(page, label)
        } catch {
          return null
        }
        return readListItemHandleMetrics(page, label, handleLabel)
      },
      { timeout: 15_000 }
    )
    .not.toBeNull()
  await expect
    .poll(async () => {
      const metrics = await readListItemHandleMetrics(page, label, handleLabel)
      if (!metrics) return Number.POSITIVE_INFINITY
      return Math.abs(metrics.handleCenterY - metrics.itemCenterY)
    }, { timeout: 15_000 })
    .toBeLessThanOrEqual(18)

  const metrics = await readListItemHandleMetrics(page, label, handleLabel)
  if (!metrics) {
    throw new Error(`list item handle metrics are missing: ${label}`)
  }
  return metrics
}

export const hoverListItemGutter = async (page: Page, label: string) => {
  const hoverPoint = await page.evaluate((targetLabel) => {
    const readOwnLabel = (item: HTMLElement) =>
      Array.from(item.childNodes)
        .filter((node) => !(node instanceof HTMLElement && ["UL", "OL"].includes(node.tagName)))
        .map((node) => node.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
    const targetItem = Array.from(
      document.querySelectorAll<HTMLElement>("[data-testid='block-editor-prosemirror'] li")
    ).find((item) => readOwnLabel(item) === targetLabel)
    if (!targetItem) {
      throw new Error(`list item is missing: ${targetLabel}`)
    }
    const rect = targetItem.getBoundingClientRect()
    return {
      gutterX: Math.max(4, rect.left - 8),
      itemX: rect.left + Math.min(12, rect.width / 2),
      y: rect.top + rect.height / 2,
    }
  }, label)

  await page.mouse.move(hoverPoint.itemX, hoverPoint.y)
  await page.mouse.move(hoverPoint.gutterX, hoverPoint.y)
}
