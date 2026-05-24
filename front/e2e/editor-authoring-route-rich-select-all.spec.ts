import { expect, test, type Locator } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
  expectVisibleBox,
} from "./helpers/editorAuthoringFlow"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

test.describe("editor authoring route rich block select all", () => {
  test("실제 /editor/[id] rich block Cmd/Ctrl+A는 내부 텍스트 선택 중 viewport를 유지한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const adminMember = {
      id: 1,
      username: "qa-admin",
      nickname: "aquila",
      isAdmin: true,
    }
    const previousSelectionLabel = "select all previous block anchor"
    const codeLabel = "select all code viewport target"
    const tableLabel = "Select all table viewport target"
    const leadParagraphs = Array.from({ length: 54 }, (_, index) =>
      index === 18
        ? `${previousSelectionLabel} ${index + 1}. Cmd+A 전에 이전 block selection anchor를 남깁니다.`
        : `select all lead paragraph ${index + 1}. rich block 내부 선택 중 viewport 유지 회귀를 확인합니다.`
    )
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[180,260]} -->',
      "| 영역 | 점검 항목 |",
      "| --- | --- |",
      `| 테이블 | ${tableLabel} |`,
      "| 결과 | viewport 유지 |",
    ].join("\n")
    const content = [
      "# rich block select all viewport 재현",
      ...leadParagraphs,
      "```ts",
      `const marker = "${codeLabel}";`,
      "console.log(marker);",
      "```",
      tableMarkdown,
      "select all trailing paragraph. 내부 선택 이후에도 위치가 유지되어야 합니다.",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/999", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 999,
          version: 5,
          title: "rich block select all viewport 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/999")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "rich block select all viewport 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)

    const previousSelectionParagraph = editor.locator("p", { hasText: previousSelectionLabel }).first()
    const dragHandle = page.getByTestId("block-drag-handle")
    const selectPreviousBlockAnchor = async () => {
      await previousSelectionParagraph.scrollIntoViewIfNeeded()
      const previousSelectionBox = await expectVisibleBox(
        previousSelectionParagraph,
        "select all stale selection paragraph metrics are missing"
      )
      await page.mouse.move(
        previousSelectionBox.x + Math.min(previousSelectionBox.width / 2, 260),
        previousSelectionBox.y + Math.min(previousSelectionBox.height / 2, 18)
      )
      await previousSelectionParagraph.hover()
      await expect(dragHandle).toBeVisible()
      await dragHandle.click()
      await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
      return page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
    }

    const assertSelectAllKeepsViewport = async (
      target: Locator,
      expectedSelection: string,
      label: string,
      clickOffset = { x: 32, y: 20 }
    ) => {
      const staleSelectionScrollTop = await selectPreviousBlockAnchor()
      await target.scrollIntoViewIfNeeded()
      const targetBox = await expectVisibleBox(target, `${label} metrics are missing before select all`)
      const beforeGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return {
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })
      await page.evaluate(
        ({ staleScrollTop }) => {
          document.addEventListener(
            "selectionchange",
            () => {
              window.setTimeout(() => {
                window.scrollTo(0, staleScrollTop)
              }, 32)
            },
            { capture: true, once: true }
          )
        },
        { staleScrollTop: staleSelectionScrollTop }
      )

      await page.mouse.click(
        targetBox.x + Math.min(clickOffset.x, Math.max(8, targetBox.width - 8)),
        targetBox.y + Math.min(clickOffset.y, Math.max(8, targetBox.height - 8))
      )
      await page.keyboard.press(SELECT_ALL_SHORTCUT)
      await page.waitForTimeout(560)

      const afterGeometry = await target.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        const selection = window.getSelection()
        return {
          selectedText: selection?.toString() ?? "",
          scrollTop: document.scrollingElement?.scrollTop ?? window.scrollY,
          targetTop: rect.top,
          targetBottom: rect.bottom,
        }
      })

      expect(afterGeometry.selectedText).toContain(expectedSelection)
      expect(afterGeometry.selectedText).not.toContain("AquilaLog")
      expect(afterGeometry.selectedText).not.toContain("select all lead paragraph 1")
      expect(Math.abs(afterGeometry.scrollTop - beforeGeometry.scrollTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetTop - beforeGeometry.targetTop)).toBeLessThanOrEqual(24)
      expect(Math.abs(afterGeometry.targetBottom - beforeGeometry.targetBottom)).toBeLessThanOrEqual(24)
    }

    await assertSelectAllKeepsViewport(
      editor.locator(".aq-code-editor-content", { hasText: codeLabel }).first(),
      codeLabel,
      codeLabel
    )
    await assertSelectAllKeepsViewport(
      editor.locator("table th, table td", { hasText: tableLabel }).first(),
      tableLabel,
      tableLabel,
      { x: 24, y: 16 }
    )
  })
})
