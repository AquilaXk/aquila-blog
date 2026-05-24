import { expect, test, type Locator, type Page } from "@playwright/test"
import {
  expectEditorToContainLoadedText,
  getWordDragPoints,
} from "./helpers/editorAuthoringFlow"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const isLocalResourceConsoleNoise = (text: string) =>
  text.startsWith("Failed to load resource:") ||
  text.includes("/_vercel/speed-insights/script.js") ||
  text.includes("/_vercel/insights/script.js")

const dragSelectWord = async (page: Page, editable: Locator, word: string) => {
  await editable.scrollIntoViewIfNeeded()
  const points = await getWordDragPoints(editable, word)
  const beforeScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)

  await page.mouse.move(points.startX, points.startY)
  await page.mouse.down()
  await page.mouse.move(points.endX, points.endY, { steps: 8 })
  await page.mouse.up()

  try {
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const selectionText = window.getSelection()?.toString() ?? ""
            const fallbackSelectionText =
              document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
              document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
              ""
            return (selectionText || fallbackSelectionText).replace(/\s+/g, " ").trim()
          }),
        { timeout: 2_000 }
      )
      .toContain(word)
  } catch {
    const diagnostics = await page.evaluate(
      ({ startX, startY, endX, endY }) => {
        const describeElement = (element: Element | null) => {
          if (!element) return null
          return {
            tagName: element.tagName.toLowerCase(),
            className: element.getAttribute("class"),
            testId: element.getAttribute("data-testid"),
            contentEditable: (element as HTMLElement).contentEditable,
            text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
          }
        }
        const selection = window.getSelection()
        const activeElement = document.activeElement
        const codeContent = document.querySelector<HTMLElement>(".aq-code-editor-content")
        return {
          activeElement: describeElement(activeElement instanceof Element ? activeElement : null),
          anchorElement: describeElement(
            selection?.anchorNode instanceof Element
              ? selection.anchorNode
              : selection?.anchorNode?.parentElement ?? null
          ),
          focusElement: describeElement(
            selection?.focusNode instanceof Element
              ? selection.focusNode
              : selection?.focusNode?.parentElement ?? null
          ),
          selectionRangeCount: selection?.rangeCount ?? 0,
          selectionText:
            selection?.toString() ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
            "",
          startElement: describeElement(document.elementFromPoint(startX, startY)),
          endElement: describeElement(document.elementFromPoint(endX, endY)),
          codeContent: describeElement(codeContent),
          codeContentStyle: codeContent
            ? {
                userSelect: window.getComputedStyle(codeContent).userSelect,
                pointerEvents: window.getComputedStyle(codeContent).pointerEvents,
                color: window.getComputedStyle(codeContent).color,
                webkitTextFillColor: window.getComputedStyle(codeContent).webkitTextFillColor,
              }
            : null,
        }
      },
      points
    )
    throw new Error(`drag selection did not include "${word}": ${JSON.stringify(diagnostics)}`)
  }
  const afterScrollTop = await page.evaluate(() => document.scrollingElement?.scrollTop ?? window.scrollY)
  expect(Math.abs(afterScrollTop - beforeScrollTop), `${word} drag 이후 scrollTop이 유지되어야 합니다`).toBeLessThanOrEqual(24)
}

const expectSelectionScopedToWord = async (page: Page, word: string, unrelatedWords: string[]) => {
  await expect
    .poll(
      async () => {
        const selectionText = await page.evaluate(() => {
          const text =
            window.getSelection()?.toString() ||
            document.querySelector("[data-table-drag-selection-text]")?.getAttribute("data-table-drag-selection-text") ||
            document.querySelector("[data-code-drag-selection-text]")?.getAttribute("data-code-drag-selection-text") ||
            ""
          return text.replace(/\s+/g, " ").trim()
        })
        return (
          selectionText.includes(word) &&
          unrelatedWords.every((unrelatedWord) => !selectionText.includes(unrelatedWord))
        )
      },
      { timeout: 2_000 }
    )
    .toBe(true)
}

const expectCodeHighlightLayerAligned = async (page: Page, word: string) => {
  const metrics = await page.evaluate((targetWord) => {
    const content = Array.from(document.querySelectorAll<HTMLElement>(".aq-code-editor-content")).find((element) =>
      element.textContent?.includes(targetWord)
    )
    const shell = content?.closest(".aq-code-shell")
    const highlightLine = shell?.querySelector<HTMLElement>(".aq-code-highlight-layer .line")
    if (!content || !highlightLine) return null
    const contentStyle = window.getComputedStyle(content)
    const highlightLineStyle = window.getComputedStyle(highlightLine)
    return {
      contentLineHeight: Number.parseFloat(contentStyle.lineHeight || "0"),
      highlightLineMinHeight: Number.parseFloat(highlightLineStyle.minHeight || "0"),
    }
  }, word)

  if (!metrics) {
    throw new Error(`code highlight metrics are missing for "${word}"`)
  }

  expect(
    Math.abs(metrics.contentLineHeight - metrics.highlightLineMinHeight),
    JSON.stringify(metrics)
  ).toBeLessThanOrEqual(1)
}

test.describe("editor authoring route text selection drag", () => {
  test("실제 /editor/[id] 텍스트 드래그 선택은 code/table/body에서 에러 없이 유지된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 720 })
    const runtimeErrors: string[] = []
    const bodyLabel = "본문드래그선택대상"
    const codeLabel = "코드드래그선택대상"
    const tableLabel = "테이블드래그선택대상"
    const codeMarkdown = ["```ts", `const marker = "${codeLabel}";`, "console.log(marker);", "```"].join("\n")
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[180,220]} -->',
      "| 구분 | 값 |",
      "| --- | --- |",
      `| inline code | \`${tableLabel}\` |`,
    ].join("\n")
    const content = [
      "드래그 선택 회귀 재현용 글입니다.",
      `일반 본문 ${bodyLabel} 문장을 마우스로 선택해도 에러가 없어야 합니다.`,
      codeMarkdown,
      tableMarkdown,
    ].join("\n\n")

    page.on("pageerror", (error) => {
      runtimeErrors.push(error.message)
    })
    page.on("console", (message) => {
      if (message.type() === "error" && !isLocalResourceConsoleNoise(message.text())) {
        runtimeErrors.push(message.text())
      }
    })
    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/989", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 989,
          version: 4,
          title: "드래그 선택 버벅임 회귀 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/989")
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "드래그 선택 버벅임 회귀 글"
    )
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expectEditorToContainLoadedText(editor, tableLabel)

    await expectCodeHighlightLayerAligned(page, codeLabel)
    await page.setViewportSize({ width: 390, height: 720 })
    await expectCodeHighlightLayerAligned(page, codeLabel)
    await page.setViewportSize({ width: 980, height: 720 })

    await dragSelectWord(page, editor.locator("p", { hasText: bodyLabel }).first(), bodyLabel)
    const codeContent = editor.locator(".aq-code-editor-content", { hasText: codeLabel }).first()
    await dragSelectWord(page, codeContent, codeLabel)
    await expectSelectionScopedToWord(page, codeLabel, [bodyLabel, tableLabel])
    const codePoints = await getWordDragPoints(codeContent, codeLabel)
    await page.mouse.click(codePoints.startX, codePoints.startY)
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expectSelectionScopedToWord(page, codeLabel, [bodyLabel, tableLabel])
    await dragSelectWord(page, editor.locator("table th, table td", { hasText: tableLabel }).first(), tableLabel)
    await expectSelectionScopedToWord(page, tableLabel, [bodyLabel, codeLabel])

    const tableCell = editor.locator("table th, table td", { hasText: tableLabel }).first()
    const tableCellPoints = await getWordDragPoints(tableCell, tableLabel)
    await page.mouse.click(tableCellPoints.startX, tableCellPoints.startY)
    await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A")
    await expectSelectionScopedToWord(page, tableLabel, [bodyLabel, codeLabel])

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
    expect(runtimeErrors).toEqual([])
  })
})
