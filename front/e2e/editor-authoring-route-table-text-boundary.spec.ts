import { readFileSync } from "fs"
import { expect, test } from "@playwright/test"
import {
  POST_507_FINAL_TABLE_FORBIDDEN_TEXTS,
  POST_507_FINAL_TABLE_TARGET_CELL,
  mockEditorRouteWithPost507,
} from "./helpers/post507Fixtures"

test.describe("editor authoring route table text drag boundary", () => {
  test("table text restore source contract는 한쪽 endpoint만 table 안인 native selection을 owned로 인정하지 않는다", () => {
    const source = readFileSync("src/components/editor/tableTextSelectionModel.ts", "utf8")
    expect(source).toContain("isTableCellEndpointSelection")
    expect(source).not.toContain("(anchorElement && currentCell.contains(anchorElement)) ||")
    expect(source).not.toContain("(focusElement && currentCell.contains(focusElement)))")
  })

  test("실제 /editor/[id] 507 table text drag는 table 밖 body selection을 owner로 인정하지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1580, height: 900 })
    const { finalTable } = await mockEditorRouteWithPost507(page, {
      postId: 996,
      title: "live 507 table text boundary 글",
      version: 1,
    })
    await finalTable.locator("td", { hasText: POST_507_FINAL_TABLE_TARGET_CELL }).first().scrollIntoViewIfNeeded()

    const forbiddenText = POST_507_FINAL_TABLE_FORBIDDEN_TEXTS[0]
    await page.evaluate(
      ({ forbiddenText, tableText }) => {
        const table = Array.from(document.querySelectorAll("table")).find((candidate) =>
          candidate.textContent?.includes(tableText)
        )
        const startCell = Array.from(table?.querySelectorAll<HTMLElement>("th, td") ?? []).find((cell) =>
          cell.textContent?.includes(tableText)
        )
        const textNodeFor = (root: Node, text: string) => {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
          while (walker.nextNode()) {
            const node = walker.currentNode as Text
            if (node.data.includes(text)) return node
          }
          return null
        }
        const outsideNode = textNodeFor(document.body, forbiddenText)
        const startNode = startCell ? textNodeFor(startCell, tableText) : null
        if (!startCell || !startNode || !outsideNode || startCell.contains(outsideNode.parentElement)) {
          throw new Error("table boundary fixture nodes are missing")
        }
        const pointFor = (node: Text, text: string, edge: "end" | "start") => {
          const offset = node.data.indexOf(text)
          const range = document.createRange()
          range.setStart(node, offset)
          range.setEnd(node, offset + text.length)
          const rect = Array.from(range.getClientRects()).find((candidate) => candidate.width > 2 && candidate.height > 2) ?? range.getBoundingClientRect()
          return { x: edge === "start" ? rect.left + 2 : rect.right - 2, y: rect.top + rect.height / 2 }
        }
        const start = pointFor(startNode, tableText, "start")
        const outside = pointFor(outsideNode, forbiddenText, "end")
        const dispatch = (type: string, point: { x: number; y: number }, buttons: number) => {
          const target = document.elementFromPoint(point.x, point.y) ?? document
          const init = { bubbles: true, button: 0, buttons, cancelable: true, clientX: point.x, clientY: point.y, composed: true }
          if (type.startsWith("pointer")) target.dispatchEvent(new PointerEvent(type, { ...init, isPrimary: true, pointerId: 1, pointerType: "mouse" }))
          else target.dispatchEvent(new MouseEvent(type, init))
        }
        dispatch("pointerdown", start, 1)
        dispatch("mousedown", start, 1)
        const leakedRange = document.createRange()
        leakedRange.setStart(startNode, startNode.data.indexOf(tableText))
        leakedRange.setEnd(outsideNode, outsideNode.data.indexOf(forbiddenText) + forbiddenText.length)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(leakedRange)
        dispatch("pointermove", outside, 1)
        dispatch("mousemove", outside, 1)
        dispatch("pointerup", outside, 0)
        dispatch("mouseup", outside, 0)
      },
      { forbiddenText, tableText: POST_507_FINAL_TABLE_TARGET_CELL }
    )
    await page.waitForTimeout(260)

    const selectionState = await page.evaluate(() => {
      const selection = window.getSelection()
      const closestCellText = (node: Node | null | undefined) => {
        const element = node instanceof Element ? node : node?.parentElement
        return element?.closest("th, td")?.textContent?.replace(/\s+/g, " ").trim() ?? ""
      }
      return {
        anchorCellText: closestCellText(selection?.anchorNode),
        focusCellText: closestCellText(selection?.focusNode),
        nativeText: selection?.toString().replace(/\s+/g, " ").trim() ?? "",
        persistedText: document.documentElement.getAttribute("data-table-drag-selection-text") ?? "",
      }
    })
    expect(selectionState.nativeText).toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(selectionState.nativeText).not.toContain(forbiddenText)
    expect(selectionState.anchorCellText || selectionState.focusCellText).toContain(POST_507_FINAL_TABLE_TARGET_CELL)
    expect(selectionState.persistedText).not.toContain(forbiddenText)
  })
})
