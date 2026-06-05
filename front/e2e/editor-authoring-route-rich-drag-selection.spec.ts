import { expect, test, type Locator } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
  expectVisibleBox,
} from "./helpers/editorAuthoringFlow"

type DragTargetMetrics = {
  startX: number
  endX: number
  y: number
  scrollTop: number
  targetTop: number
  targetHeight: number
}

const readDragTargetMetrics = async (target: Locator, label: string): Promise<DragTargetMetrics> => {
  const metrics = await target.evaluate((element, expectedText) => {
    const findTextNode = (root: Node): Text | null => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      let current = walker.nextNode()
      while (current) {
        if ((current.textContent ?? "").includes(expectedText)) return current as Text
        current = walker.nextNode()
      }
      return null
    }

    const textNode = findTextNode(element)
    const targetRect = element.getBoundingClientRect()
    const range = document.createRange()
    if (textNode) {
      const text = textNode.textContent ?? ""
      const startOffset = text.indexOf(expectedText)
      if (startOffset >= 0) {
        range.setStart(textNode, startOffset)
        range.setEnd(textNode, startOffset + expectedText.length)
      } else {
        range.selectNodeContents(textNode)
      }
    } else {
      range.selectNodeContents(element)
    }
    const rangeRect = range.getBoundingClientRect()
    const rect =
      rangeRect.width > 0 && rangeRect.height > 0
        ? rangeRect
        : targetRect
    return {
      startX: Math.max(targetRect.left + 4, rect.left + 3),
      endX: Math.min(targetRect.right - 4, rect.right - 3),
      y: Math.min(targetRect.bottom - 4, Math.max(targetRect.top + 4, rect.top + rect.height / 2)),
      scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
      targetTop: targetRect.top,
      targetHeight: targetRect.height,
    }
  }, label)

  if (!Number.isFinite(metrics.startX) || !Number.isFinite(metrics.endX) || metrics.endX <= metrics.startX) {
    throw new Error(`${label} drag target metrics are invalid`)
  }
  return metrics
}

test.describe("editor authoring route rich block drag selection", () => {
  test("실제 /editor/[id] rich block drag selection은 block selection anchor와 viewport를 되돌리지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const previousSelectionLabel = "drag selection previous block anchor"
    const bodyLabel = "drag selection body target"
    const tableLabel = "Drag selection table target"
    const codeLabel = "drag selection code target"
    const bodySelectionNeedle = "drag selection body"
    const tableSelectionNeedle = "Drag selection table"
    const codeSelectionNeedle = "drag selection code"
    const leadParagraphs = Array.from({ length: 46 }, (_, index) =>
      index === 20
        ? `${previousSelectionLabel} ${index + 1}. drag 선택 전 이전 block selection anchor가 남아 있는 본문입니다.`
        : `drag selection lead paragraph ${index + 1}. rich block drag selection 회귀를 확인합니다.`
    )
    const trailingParagraphs = Array.from({ length: 20 }, (_, index) =>
      index === 3
        ? `${bodyLabel} ${index + 1}. 표를 지난 뒤 일반 본문 drag selection도 같은 viewport에 남아야 합니다.`
        : `drag selection trailing paragraph ${index + 1}. drag 이후 scrollTop이 되돌아가면 안 됩니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[140,260,260]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      `| 토큰 구조 | ${tableLabel} | 역할 명확 |`,
      "| 보안 | HTTPS 사용 | 필수 |",
      "| 저장소 | Refresh 저장 | DB/Redis |",
      "| 만료 | Access 짧게 | 15~60분 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      "# rich block drag selection 재현",
      ...leadParagraphs,
      tableMarkdown,
      "```ts",
      `const marker = "${codeLabel}";`,
      "console.log(marker);",
      "```",
      ...trailingParagraphs,
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/998", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 998,
          version: 7,
          title: "rich block drag selection 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/998")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "rich block drag selection 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    const dragHandle = page.getByTestId("block-drag-handle")
    const clearPersistedDragSelection = async () => {
      await page.evaluate(() => {
        window.getSelection()?.removeAllRanges()
        document.querySelectorAll("[data-code-drag-selection-text], [data-table-drag-selection-text]").forEach((element) => {
          element.removeAttribute("data-code-drag-selection-text")
          element.removeAttribute("data-table-drag-selection-text")
        })
        document.dispatchEvent(new Event("selectionchange"))
      })
      await page.waitForTimeout(80)
    }
    const selectPreviousBlockAnchor = async () => {
      await clearPersistedDragSelection()
      await previousSelectionParagraph.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      })
      const previousSelectionBox = await expectVisibleBox(
        previousSelectionParagraph,
        "drag selection stale paragraph metrics are missing"
      )
      await page.keyboard.press("Escape")
      await page.mouse.click(
        previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 240),
        previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
      )
      await page.waitForTimeout(80)
      await page.mouse.move(
        previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 240),
        previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
      )
      await previousSelectionParagraph.hover()
      await expect(dragHandle).toBeVisible()
      await dragHandle.click()
      await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    }

    const assertDragSelectionKeepsViewport = async (
      target: Locator,
      expectedSelection: string,
      label: string
    ) => {
      await selectPreviousBlockAnchor()
      await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(60))
      await target.scrollIntoViewIfNeeded()
      await target.evaluate((element) => {
        element.scrollIntoView({ block: "center", inline: "nearest" })
      })
      let beforeGeometry = await readDragTargetMetrics(target, label)

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (attempt > 0) {
          await selectPreviousBlockAnchor()
          await page.mouse.wheel(0, 1).then(() => page.waitForTimeout(60))
          await target.evaluate((element) => {
            element.scrollIntoView({ block: "center", inline: "nearest" })
          })
          beforeGeometry = await readDragTargetMetrics(target, label)
        }
        await page.mouse.move(beforeGeometry.startX, beforeGeometry.y)
        await page.mouse.down()
        await page.mouse.move(beforeGeometry.endX, beforeGeometry.y, { steps: 24 })
        await page.mouse.up()
        await page.waitForTimeout(360)
        const selectedText = await target.evaluate((element) =>
          window.getSelection()?.toString() ||
          element.closest(".aq-code-shell")?.getAttribute("data-code-drag-selection-text") ||
          ""
        )
        if (selectedText.includes(expectedSelection)) break
        await clearPersistedDragSelection()
      }
      try {
        await expect
          .poll(async () =>
            target.evaluate((element) =>
              window.getSelection()?.toString() ||
              element.closest(".aq-code-shell")?.getAttribute("data-code-drag-selection-text") ||
              ""
            )
          )
          .toContain(expectedSelection)
      } catch (error) {
        const diagnostics = await target.evaluate((element) => {
          const shell = element.closest(".aq-code-shell")
          return {
            activeElementClass: document.activeElement instanceof Element ? String(document.activeElement.className) : null,
            codeShellAttr: shell?.getAttribute("data-code-drag-selection-text") ?? null,
            selectionText: window.getSelection()?.toString() ?? "",
          }
        })
        throw new Error(`${label} drag selection missing: ${JSON.stringify(diagnostics)}\n${error instanceof Error ? error.message : String(error)}`)
      }
      const afterGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          selectedText:
            window.getSelection()?.toString() ||
            element.closest(".aq-code-shell")?.getAttribute("data-code-drag-selection-text") ||
            "",
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
        }
      })
      expect(afterGeometry.selectedText).toContain(expectedSelection)
      expect(afterGeometry.selectedText).not.toContain(previousSelectionLabel)
      expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
      const viewportHeight = page.viewportSize()?.height ?? 720
      expect(afterGeometry.targetTop).toBeGreaterThanOrEqual(0)
      expect(afterGeometry.targetTop).toBeLessThanOrEqual(viewportHeight - 24)
    }

    await assertDragSelectionKeepsViewport(
      editor.locator("table th, table td", { hasText: tableLabel }).first(),
      tableSelectionNeedle,
      tableLabel
    )
    await assertDragSelectionKeepsViewport(
      editor.locator(".aq-code-editor-content", { hasText: codeLabel }).first(),
      codeSelectionNeedle,
      codeLabel
    )
    await assertDragSelectionKeepsViewport(
      editor.locator("p", { hasText: bodyLabel }).first(),
      bodySelectionNeedle,
      bodyLabel
    )
  })
})
