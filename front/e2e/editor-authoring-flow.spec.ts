import { expect, test } from "@playwright/test"
import type { Locator, Page } from "@playwright/test"

const QA_ENGINE_ROUTE = "/_qa/block-editor-slash?surface=engine"
const QA_WRITER_ROUTE = "/_qa/block-editor-slash?surface=writer"
const UNDO_SHORTCUT = process.platform === "darwin" ? "Meta+z" : "Control+z"

const selectWordInEditable = async (page: Page, editable: Locator, word: string) => {
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

const setWordSelectionInEditable = async (editable: Locator, word: string) => {
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

const getWordDragPoints = async (
  editable: Locator,
  word: string
): Promise<{ startX: number; startY: number; endX: number; endY: number }> => {
  const points = await editable.evaluate((element, targetWord) => {
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

    if (!textNode || foundIndex < 0) return null
    const range = document.createRange()
    range.setStart(textNode, foundIndex)
    range.setEnd(textNode, foundIndex + targetWord.length)
    const rect = range.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null

    return {
      startX: Math.round(rect.left + 2),
      startY: Math.round(rect.top + rect.height / 2),
      endX: Math.round(rect.right - 2),
      endY: Math.round(rect.top + rect.height / 2),
    }
  }, word)

  if (!points) {
    throw new Error(`could not resolve drag points for word: ${word}`)
  }

  return points
}

const readTableGrid = async (page: Page) =>
  page.locator("table tr").evaluateAll((rows) =>
    rows.map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => (cell.textContent || "").trim())
    )
  )

const getTableAffordances = (page: Page) => ({
  rowHandle: page.locator("[data-table-affordance='row-handle']").first(),
  columnHandle: page.locator("[data-table-affordance='column-handle']").first(),
  rowAddButton: page.locator("[data-table-affordance='row-add']").first(),
  columnAddButton: page.locator("[data-table-affordance='column-add']").first(),
  growHandle: page.locator("[data-table-affordance='grow-handle']").first(),
  structureMenuButton: page.locator("[data-table-affordance='structure-menu']").first(),
  cellMenuButton: page.locator("[data-table-affordance='cell-menu']").first(),
})

test.describe("block editor authoring flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
    })
  })

  test("긴 작성 플로우에서 인라인 수식/quick insert/표 스타일/파일 업로드가 함께 유지된다", async ({
    page,
  }) => {
    test.slow()
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("인라인 $수식$ 대상")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("인라인 $수식$ 대상")

    await page.keyboard.press("Enter")

    await editor.evaluate((element, payload) => {
      const data = new DataTransfer()
      data.setData("text/plain", payload.url)
      data.setData("text/html", `<a href="${payload.url}">${payload.url}</a>`)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, { url: "https://github.com/aquilaxk/aquila-blog" })

    await expect(page.getByTestId("qa-markdown-output")).toContainText(":::bookmark https://github.com/aquilaxk/aquila-blog")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"provider":"GitHub"')

    await page.keyboard.press("Enter")

    await editor.evaluate((element, payload) => {
      const data = new DataTransfer()
      data.setData("text/plain", payload.url)
      data.setData("text/html", `<a href="${payload.url}">${payload.url}</a>`)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" })

    await expect(page.getByTestId("qa-markdown-output")).toContainText(":::embed https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"embedUrl":"https://www.youtube.com/embed/dQw4w9WgXcQ"')

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.getByRole("button", { name: "QA 열 선택" }).click()
    await page.getByRole("button", { name: "QA 가운데" }).click()
    await page.getByRole("button", { name: "QA 노랑 배경" }).click()
    await page.getByRole("button", { name: "QA 끝으로 이동" }).click()

    await page.getByRole("button", { name: "QA 콜아웃" }).click()
    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 코드값")
    await selectWordInEditable(page, calloutBodyContent, "콜아웃 코드값")
    await page.getByRole("button", { name: "인라인 코드", exact: true }).first().click()

    await page.getByRole("button", { name: "QA 수식" }).click()

    const attachmentInput = page.getByTestId("editor-attachment-file-input")
    await attachmentInput.setInputFiles({
      name: "architecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 qa-architecture"),
    })

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP]")
    await expect(markdownOutput).not.toContainText("핵심 포인트")
    await expect(markdownOutput).toContainText("> `콜아웃 코드값`")
    await expect(markdownOutput).toContainText("$수식$")
    await expect(markdownOutput).toContainText(":::file https://example.com/files/architecture.pdf")
    await expect(markdownOutput).toContainText('"mimeType":"application/pdf"')
    await expect(markdownOutput).toContainText('"columnAlignments":["center"]')
    await expect(markdownOutput).toContainText('"backgroundColor":"#fef3c7"')
  })

  test("블록 핸들 + 메뉴 삽입은 hover 블록 기준을 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "첫 줄" }).first()
    await firstParagraph.hover()

    const addBlockButton = page.getByRole("button", { name: "블록 추가" })
    await expect(addBlockButton).toBeVisible()
    await addBlockButton.click()

    const blockMenu = page.locator("[data-block-menu-root='true']")
    await expect(blockMenu).toBeVisible()
    await blockMenu.getByRole("button", { name: "인용문" }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    const markdown = await markdownOutput.innerText()

    const firstLineIndex = markdown.indexOf("첫 줄")
    const quoteLineMatch = markdown.match(/^>.*$/m)
    const quoteIndex = quoteLineMatch ? markdown.indexOf(quoteLineMatch[0]) : -1
    const secondLineIndex = markdown.indexOf("둘째 줄")

    expect(firstLineIndex).toBeGreaterThanOrEqual(0)
    expect(quoteIndex).toBeGreaterThan(firstLineIndex)
    expect(secondLineIndex).toBeGreaterThan(quoteIndex)
  })

  test("테이블 셀 내부에서는 구조 블록 삽입이 차단되어 중첩 테이블이 생기지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    const tableInsertButton = page
      .locator("[aria-label='빠른 블록 삽입']")
      .getByRole("button", { name: "테이블" })
    await expect(tableInsertButton).toBeDisabled()

    await page.keyboard.type("/테이블")
    await page.keyboard.press("Enter")

    await expect(page.locator(".aq-block-editor__content table").first()).toBeVisible()
    await expect(page.locator(".aq-block-editor__content table table")).toHaveCount(0)
  })

  test("writer surface에서도 테이블 기본값은 비어 있고 셀 내부 구조 삽입이 차단된다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const tables = page.locator(".aq-block-editor__content table")
    await expect(tables).toHaveCount(1)
    await expect(page.locator(".aq-block-editor__content table table")).toHaveCount(0)
    await expect(page.getByText("제목", { exact: true })).toHaveCount(0)
    await expect(page.getByText("항목", { exact: true })).toHaveCount(0)

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.keyboard.type("/테이블")
    await page.keyboard.press("Enter")

    await expect(tables).toHaveCount(1)
    await expect(page.locator(".aq-block-editor__content table table")).toHaveCount(0)

    await editor.evaluate((element) => {
      const data = new DataTransfer()
      data.setData(
        "text/plain",
        "| 내부셀A | 내부셀B |\n| --- | --- |\n| 내부셀C | 내부셀D |"
      )
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    })

    await expect(tables).toHaveCount(1)
    await expect(page.locator(".aq-block-editor__content table table")).toHaveCount(0)
    await expect(page.locator(".aq-block-editor__content table")).toContainText("내부셀A")
    await expect(page.locator(".aq-block-editor__content table")).not.toContainText("| 내부셀A | 내부셀B |")
  })

  test("테이블 생성 경로가 달라도 동일한 empty table shape를 만든다", async ({ page }) => {
    const captureTableMarkdown = async () => {
      const markdownOutput = page.getByTestId("qa-markdown-output")
      await expect(markdownOutput).toContainText("| --- | --- | --- |")
      const rawMarkdown = (await markdownOutput.textContent()) || ""
      return rawMarkdown
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => line.startsWith("<!-- aq-table") || line.startsWith("|"))
        .join("\n")
    }

    await page.goto(QA_ENGINE_ROUTE)
    await page.getByRole("button", { name: "테이블" }).click()
    const toolbarTableMarkdown = await captureTableMarkdown()

    await page.goto(QA_ENGINE_ROUTE)
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/테이블")
    await page.keyboard.press("Enter")
    await expect(page.locator(".aq-block-editor__content table")).toHaveCount(1)
    const slashTableMarkdown = await captureTableMarkdown()

    expect(toolbarTableMarkdown).toBe(slashTableMarkdown)
    expect(toolbarTableMarkdown).toContain("| --- | --- | --- |")
    expect(toolbarTableMarkdown.match(/\|  \|  \|  \|/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(toolbarTableMarkdown).not.toContain("| 제목 | 값 |")
  })

  test("새 블록 템플릿은 샘플 문구 없이 빈 입력 상태로 생성된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await editor.click()

    await page.getByRole("button", { name: "체크리스트", exact: true }).click()
    await page.getByRole("button", { name: "코드", exact: true }).click()
    await page.getByRole("button", { name: "토글", exact: true }).click()
    await page.getByRole("button", { name: "테이블", exact: true }).click()

    await expect(markdownOutput).not.toContainText("| 제목 | 값 |")
    await expect(markdownOutput).not.toContainText("| 항목 | 내용 |")
    await expect(markdownOutput).not.toContainText("코드를 입력하세요")
    await expect(markdownOutput).not.toContainText("- [ ] 할 일")
    await expect(markdownOutput).not.toContainText(":::toggle 더 보기")
  })

  test("writer surface 토글 요약줄은 본문 스케일에 맞는 크기와 hit area를 유지한다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "토글", exact: true }).first().click()

    const summary = page.getByTestId("toggle-block-summary").first()
    await expect(summary).toBeVisible()

    const metrics = await summary.evaluate((element) => {
      const summaryElement = element as HTMLElement
      const toggleRoot = summaryElement.closest("details")
      const titleInput = summaryElement.querySelector("input")
      const chevron = summaryElement.querySelector("[data-testid='toggle-block-chevron']")
      if (
        !(titleInput instanceof HTMLInputElement) ||
        !(chevron instanceof HTMLElement) ||
        !(toggleRoot instanceof HTMLElement) ||
        !(summaryElement.nextElementSibling instanceof HTMLElement)
      ) {
        return null
      }

      const summaryRect = summaryElement.getBoundingClientRect()
      const toggleRootRect = toggleRoot.getBoundingClientRect()
      const chevronRect = chevron.getBoundingClientRect()
      const titleRect = titleInput.getBoundingClientRect()
      const titleStyle = window.getComputedStyle(titleInput)
      const chevronStyle = window.getComputedStyle(chevron)
      const chevronShapeStyle = window.getComputedStyle(chevron, "::before")
      const bodyStyle = window.getComputedStyle(summaryElement.nextElementSibling)

      return {
        summaryHeight: summaryRect.height,
        chevronWidth: chevronRect.width,
        chevronHeight: chevronRect.height,
        chevronFontSize: Number.parseFloat(chevronStyle.fontSize),
        chevronClipPath: chevronShapeStyle.clipPath,
        titleOffset: titleRect.left - toggleRootRect.left,
        bodyIndent: Number.parseFloat(bodyStyle.paddingLeft),
        titleFontSize: Number.parseFloat(titleStyle.fontSize),
        titleLineHeight: Number.parseFloat(titleStyle.lineHeight),
      }
    })

    expect(metrics).not.toBeNull()
    expect(metrics?.summaryHeight ?? 0).toBeGreaterThanOrEqual(44)
    expect(metrics?.chevronWidth ?? 0).toBeGreaterThanOrEqual(18)
    expect(metrics?.chevronHeight ?? 0).toBeGreaterThanOrEqual(18)
    expect(metrics?.chevronClipPath ?? "").toContain("polygon")
    expect((metrics?.chevronHeight ?? 0) + 1).toBeGreaterThanOrEqual(metrics?.titleFontSize ?? 0)
    expect(Math.abs((metrics?.titleOffset ?? 0) - (metrics?.bodyIndent ?? 0))).toBeLessThanOrEqual(2)
    expect(metrics?.titleFontSize ?? 0).toBeGreaterThanOrEqual(17.5)
    expect(metrics?.titleLineHeight ?? 0).toBeGreaterThanOrEqual(26)
  })

  test("콜아웃 본문은 단일 리치 편집 surface로 동작하고 split preview를 노출하지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")

    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await expect(page.locator("[data-callout-markdown-role='body']")).toHaveCount(0)
    await expect(page.locator("[data-callout-markdown-preview='true']")).toHaveCount(0)

    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("콜아웃 둘째 줄")

    const leadParagraph = editor.locator("p", { hasText: "앞 문단" }).first()
    await leadParagraph.click()
    await calloutBodyContent.click()
    await page.keyboard.type(" 입력 유지")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> 콜아웃 첫 줄")
    await expect(markdownOutput).toContainText("입력 유지")
    await expect(markdownOutput).toContainText("콜아웃 둘째 줄")
  })

  test("새 콜아웃은 빈 제목 placeholder로 생성되고 즉시 paste가 본문에 들어간다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutTitleInput = page.locator("input[placeholder='제목']").first()
    await expect(calloutTitleInput).toHaveValue("")

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()

    await editor.evaluate((element, text) => {
      const data = new DataTransfer()
      data.setData("text/plain", text)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, "콜아웃 즉시 붙여넣기")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP]")
    await expect(markdownOutput).not.toContainText("핵심 포인트")
    await expect(markdownOutput).toContainText("> 콜아웃 즉시 붙여넣기")
  })

  test("빈 콜아웃 본문에서 html clipboard paste도 콜아웃 본문에 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()

    await editor.evaluate((element) => {
      const data = new DataTransfer()
      data.setData("text/plain", "콜아웃 HTML 붙여넣기")
      data.setData("text/html", "<p><strong>콜아웃 HTML 붙여넣기</strong></p>")
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    })

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP]")
    await expect(markdownOutput).toContainText("> 콜아웃 HTML 붙여넣기")
    const markdownRaw = (await markdownOutput.textContent()) || ""
    expect(markdownRaw).not.toContain("\n\n콜아웃 HTML 붙여넣기\n")
  })

  test("콜아웃 본문에서 선택 버블 포맷이 직접 적용되고 markdown로 직렬화된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()
    await page.keyboard.type("굵게 코드")

    await selectWordInEditable(page, calloutBodyContent, "굵게")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "굵게" }).click()

    await selectWordInEditable(page, calloutBodyContent, "코드")
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "인라인 코드", exact: true }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> **굵게** `코드`")
  })

  test("텍스트 선택 상태에서 포맷 도구로 글자 크기/강조/색상을 바로 적용할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    const markdownOutput = page.getByTestId("qa-markdown-output")
    await editor.click()
    await page.keyboard.type("버블 포맷 테스트")

    await selectWordInEditable(page, editor, "포맷")
    await page.getByRole("button", { name: "굵게" }).first().click()
    await expect(markdownOutput).toContainText("**포맷**")

    await selectWordInEditable(page, editor, "버블")
    await page.getByRole("button", { name: "제목 2" }).first().click()
    await expect(markdownOutput).toContainText("## ")

    await selectWordInEditable(page, editor, "테스트")
    await page.locator("[aria-label='글자색']").first().click()
    await page.getByRole("button", { name: "하늘" }).first().click()
    await expect(markdownOutput).toContainText("{{color:#60a5fa|테스트}}")
  })

  test("writer surface에서도 일반 본문/콜아웃 본문 텍스트 선택 시 인라인 버블이 노출된다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("버블 노출 테스트 문장")

    await selectWordInEditable(page, editor, "노출")
    if ((await page.getByTestId("editor-text-bubble-toolbar").count()) === 0) {
      await selectWordInEditable(page, editor, "노출")
    }
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()

    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "콜아웃" }).click()
    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 버블 노출")

    await selectWordInEditable(page, calloutBodyContent, "버블")
    if ((await page.getByTestId("editor-text-bubble-toolbar").count()) === 0) {
      await selectWordInEditable(page, calloutBodyContent, "버블")
    }
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()
  })

  test("writer surface에서는 마우스 드래그 선택 중 버블을 숨기고 mouseup 이후에만 노출한다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("마우스 업에서만 버블 노출")

    const points = await getWordDragPoints(editor, "버블")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await setWordSelectionInEditable(editor, "버블")
    await expect(textBubbleToolbar).toHaveCount(0)

    await page.mouse.up()
    await expect(textBubbleToolbar).toBeVisible()
  })

  test("코드 블록은 작성 surface에서도 Prism 하이라이트 토큰을 렌더한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/코드")
    await page.keyboard.press("Enter")
    await page.keyboard.type("const count = 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type('return "ok"')

    const codeBlock = page.locator(".aq-code-shell").first()
    await expect(codeBlock).toBeVisible()
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.keyword").first()).toBeVisible()
    await expect(codeBlock.locator(".aq-code-highlight-layer .token.string").first()).toBeVisible()

    const colors = await codeBlock.evaluate((element) => {
      const root = element as HTMLElement
      const base = root.querySelector<HTMLElement>(".aq-code-highlight-layer")
      const keyword = root.querySelector<HTMLElement>(".aq-code-highlight-layer .token.keyword")
      const stringToken = root.querySelector<HTMLElement>(".aq-code-highlight-layer .token.string")
      return {
        base: base ? window.getComputedStyle(base).color : "",
        keyword: keyword ? window.getComputedStyle(keyword).color : "",
        string: stringToken ? window.getComputedStyle(stringToken).color : "",
      }
    })

    expect(colors.base).toBeTruthy()
    expect(colors.keyword).toBeTruthy()
    expect(colors.string).toBeTruthy()
    expect(colors.keyword).not.toBe(colors.base)
    expect(colors.string).not.toBe(colors.base)
  })

  test("코드 언어 선택 팝오버는 본문 숨김 텍스트 스타일을 상속하지 않는다", async ({ page }) => {
    const seed = encodeURIComponent("```javascript\nconst answer = 42;\n```")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    await page.getByRole("button", { name: /JavaScript/i }).click()

    const languageDialog = page.getByRole("dialog", { name: "코드 언어 선택" })
    await expect(languageDialog).toBeVisible()
    await expect(languageDialog.getByRole("button", { name: "TXT", exact: true })).toBeVisible()

    const computed = await languageDialog.getByRole("button", { name: "TXT", exact: true }).evaluate((element) => {
      const buttonStyle = window.getComputedStyle(element as HTMLElement)
      const label = element.querySelector("span")
      const labelStyle = label ? window.getComputedStyle(label) : null

      return {
        buttonTextSecurity: buttonStyle.webkitTextSecurity,
        buttonTextFill: buttonStyle.webkitTextFillColor,
        labelTextSecurity: labelStyle?.webkitTextSecurity ?? "",
        labelTextFill: labelStyle?.webkitTextFillColor ?? "",
      }
    })

    expect(computed.buttonTextSecurity).toBe("none")
    expect(computed.labelTextSecurity).toBe("none")
    expect(computed.buttonTextFill).not.toBe("transparent")
    expect(computed.labelTextFill).not.toBe("transparent")
  })

  test("텍스트 블록에서 Tab은 부분 선택이 아니라 블록 선택으로 승격된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("노션 예시")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "노션 예시" }).first()
    await firstParagraph.click()
    await page.keyboard.press("Tab")

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toBe("")
  })

  test("초기 hydrate 직후 Cmd/Ctrl+Z는 외부 value 동기화를 되돌리지 않는다", async ({ page }) => {
    const seed = encodeURIComponent("# 제목\\n\\n첫 문단\\n\\n둘째 문단")
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("# 제목")
    await expect(markdownOutput).toContainText("첫 문단")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.press(UNDO_SHORTCUT)

    await expect(markdownOutput).toContainText("# 제목")
    await expect(markdownOutput).toContainText("첫 문단")
    await expect(markdownOutput).not.toContainText("(empty)")
  })

  test("블록 내부 클릭/텍스트 더블클릭은 편집만 유지하고 좌측 외곽 더블클릭에서만 블록 선택된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")
    await page.keyboard.press("Enter")

    const blocks = editor.locator(":scope > p")
    await expect(blocks).toHaveCount(3)

    const textBlock = blocks.nth(0)
    const emptyBlock = blocks.nth(2)
    const selectionOverlay = page.getByTestId("keyboard-block-selection-overlay")

    await textBlock.click()
    await expect(selectionOverlay).toHaveCount(0)
    await textBlock.dblclick()
    await expect(selectionOverlay).toHaveCount(0)

    const textBlockRect = await textBlock.boundingBox()
    if (!textBlockRect) {
      throw new Error("텍스트 블록 좌표를 계산할 수 없습니다.")
    }
    await textBlock.dblclick({ position: { x: 4, y: Math.max(4, textBlockRect.height / 2) } })
    await expect(selectionOverlay).toBeVisible()
    await expect
      .poll(() => textBlock.evaluate((element) => window.getComputedStyle(element).boxShadow))
      .toBe("none")
    await expect
      .poll(async () => {
        const textRect = textBlockRect
        const overlayRect = await selectionOverlay.boundingBox()
        if (!textRect || !overlayRect) return Number.POSITIVE_INFINITY
        return Math.abs((overlayRect.y + 4) - textRect.y)
      })
      .toBeLessThanOrEqual(10)

    await emptyBlock.click()
    await expect(selectionOverlay).toHaveCount(0)
    await emptyBlock.dblclick()
    await expect(selectionOverlay).toHaveCount(0)
  })

  test("블록 이동 핸들 1회 클릭은 블록 선택을 고정하고 Backspace로 삭제된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p", { hasText: "첫 줄" }).first()
    await firstParagraph.hover()

    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    await dragHandle.click()

    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toBe("")

    await page.keyboard.press("Backspace")

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).not.toContainText("첫 줄")
    await expect(markdownOutput).toContainText("둘째 줄")
  })

  test("블록 드래그 시 source ghost와 destination 삽입선 피드백이 동시에 보인다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p").first()
    const secondParagraph = editor.locator("p").nth(1)

    await firstParagraph.hover()
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()

    const dragBox = await dragHandle.boundingBox()
    const secondBox = await secondParagraph.boundingBox()
    if (!dragBox || !secondBox) {
      throw new Error("드래그 좌표를 계산할 수 없습니다.")
    }

    await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(secondBox.x + Math.min(24, secondBox.width / 3), secondBox.y + secondBox.height / 2)

    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()
    await expect(page.getByTestId("block-drop-indicator").first()).toBeVisible()
    await expect(page.getByTestId("block-drop-target-highlight")).toHaveCount(0)

    await page.mouse.up()
  })

  test("table hover에서도 block selection affordance를 다시 띄우고 table block selection으로 전환할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const {
      columnHandle,
      rowHandle,
      columnAddButton,
      rowAddButton,
      growHandle: tableGrowHandle,
      structureMenuButton: tableStructureMenuButton,
      cellMenuButton: tableCellMenuButton,
    } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    await firstTableCell.hover()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(page.getByTestId("table-corner-handle")).toBeVisible()
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
    await expect(page.getByTestId("table-bubble-toolbar")).toHaveCount(0)

    const tableWidthShape = await page.evaluate(() => {
      const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
      const wrapper = document.querySelector<HTMLElement>(
        ".aq-block-editor__content .tableWrapper"
      )
      const table = wrapper?.querySelector<HTMLElement>("table")
      if (!contentRoot || !wrapper || !table) return null
      return {
        contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        firstCellWidth: Math.round(
          (table.querySelector("th, td") as HTMLElement | null)?.getBoundingClientRect().width || 0
        ),
      }
    })
    expect(tableWidthShape).not.toBeNull()
    if (!tableWidthShape) {
      throw new Error("table wrapper/table width shape is missing")
    }
    expect(Math.abs(tableWidthShape.wrapperWidth - tableWidthShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(tableWidthShape.tableWidth).toBeLessThan(tableWidthShape.contentWidth - 120)
    expect(tableWidthShape.firstCellWidth).toBeGreaterThanOrEqual(180)
    expect(tableWidthShape.firstCellWidth).toBeLessThanOrEqual(320)

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing")
    }
    const trailingParagraph = page.locator(".aq-block-editor__content > p").last()
    await expect(trailingParagraph).toBeVisible()
    await trailingParagraph.click()
    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    await expect(columnHandle).toBeVisible()
    await expect(rowHandle).toBeVisible()
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)
    await expect(tableGrowHandle).toBeVisible()
    await expect(tableStructureMenuButton).toBeVisible()
    await expect(tableCellMenuButton).toBeVisible()

    const [columnGripRect, rowGripRect, growHandleRect, structureMenuRect, cellMenuRect] = await Promise.all(
      [columnHandle, rowHandle, tableGrowHandle, tableStructureMenuButton, tableCellMenuButton].map((locator) =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return { width: Math.round(rect.width), height: Math.round(rect.height) }
        })
      )
    )
    expect(columnGripRect.width).toBeGreaterThan(columnGripRect.height)
    expect(rowGripRect.height).toBeGreaterThan(rowGripRect.width)
    expect(growHandleRect.width).toBeLessThanOrEqual(26)
    expect(growHandleRect.height).toBeLessThanOrEqual(26)
    expect(structureMenuRect.width).toBeLessThanOrEqual(26)
    expect(structureMenuRect.height).toBeLessThanOrEqual(26)
    expect(cellMenuRect.width).toBeLessThanOrEqual(24)
    expect(cellMenuRect.height).toBeLessThanOrEqual(24)

    await tableStructureMenuButton.click()
    await expect(page.getByTestId("table-table-menu")).toBeVisible()
    await page.mouse.move(tableBox.x + tableBox.width - 8, tableBox.y + tableBox.height - 8)
    await expect(columnAddButton).toBeVisible()
    await expect(rowAddButton).toBeVisible()

    const [columnAddRect, rowAddRect] = await Promise.all(
      [columnAddButton, rowAddButton].map((locator) =>
        locator.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          }
        })
      )
    )
    expect(Math.abs(columnAddRect.width - columnAddRect.height)).toBeLessThanOrEqual(4)
    expect(Math.abs(rowAddRect.width - rowAddRect.height)).toBeLessThanOrEqual(4)

    const edgeAlignment = await page.evaluate(() => {
      const table = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper table")
      const columnAddBar = document.querySelector<HTMLElement>("[data-table-affordance='column-add']")
      const rowAddBar = document.querySelector<HTMLElement>("[data-table-affordance='row-add']")
      if (!table || !columnAddBar || !rowAddBar) return null

      const tableRect = table.getBoundingClientRect()
      const columnAddRect = columnAddBar.getBoundingClientRect()
      const rowAddRect = rowAddBar.getBoundingClientRect()
      return {
        columnEdgeCenterGap: Math.round(columnAddRect.left + columnAddRect.width / 2 - tableRect.right),
        rowEdgeCenterGap: Math.round(rowAddRect.top + rowAddRect.height / 2 - tableRect.bottom),
        columnVerticalCenterGap: Math.round(
          columnAddRect.top + columnAddRect.height / 2 - (tableRect.top + tableRect.height / 2)
        ),
        rowHorizontalCenterGap: Math.round(
          rowAddRect.left + rowAddRect.width / 2 - (tableRect.left + tableRect.width / 2)
        ),
      }
    })
    expect(edgeAlignment).not.toBeNull()
    if (!edgeAlignment) {
      throw new Error("table edge alignment metrics are missing")
    }
    expect(Math.abs(edgeAlignment.columnEdgeCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.rowEdgeCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.columnVerticalCenterGap)).toBeLessThanOrEqual(18)
    expect(Math.abs(edgeAlignment.rowHorizontalCenterGap)).toBeLessThanOrEqual(18)

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await rowHandle.click()
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-column-selection-outline")).toHaveCount(0)
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await expect(page.getByTestId("table-row-menu").getByRole("button", { name: "행 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(page.getByTestId("table-row-menu")).toHaveCount(0)

    await page.mouse.move(tableBox.x + tableBox.width - 3, tableBox.y + tableBox.height - 3)
    await columnAddButton.click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    await rowAddButton.click()
    await expect(page.locator("table tr")).toHaveCount(4)

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("table-row-selection-outline")).toHaveCount(0)
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "열 삭제" })).toBeVisible()
    await columnMenu.getByRole("button", { name: "열 선택" }).click()
    await expect(page.getByTestId("table-column-menu")).toHaveCount(0)

    await page.mouse.move(tableBox.x + 24, tableBox.y + 24)

    const blockDragHandle = page.getByTestId("block-drag-handle")
    await expect(blockDragHandle).toBeVisible()
    await blockDragHandle.click()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toBeVisible()

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await expect(columnHandle).toBeVisible()
    await columnHandle.click()
    await expect(page.getByTestId("table-column-selection-outline")).toBeVisible()
    await expect(page.getByTestId("keyboard-block-selection-overlay")).toHaveCount(0)
  })

  test("table rail segment selection은 fallback rect에서도 native text selection 없이 전체 열을 선택한다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    await page.getByRole("button", { name: "QA fallback 열 선택" }).click()

    const rowCount = await page.locator("table tr").count()
    await expect
      .poll(async () => page.locator(".aq-block-editor__content .selectedCell").count())
      .toBe(rowCount)
    await expect
      .poll(async () => page.evaluate(() => window.getSelection()?.toString() || ""))
      .toBe("")
  })

  test("table axis rail hover 전환 중에도 target axis anchor가 끊기지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle, rowHandle } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const targetCell = page.locator("table tr").nth(2).locator("th, td").nth(1)
    await targetCell.click()
    await targetCell.hover()

    const targetMetrics = await targetCell.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table bounding box is missing")
    }

    await page.mouse.move(tableBox.x + 6, targetMetrics.top + targetMetrics.height / 2)
    await expect(rowHandle).toBeVisible()
    const rowRailRect = await rowHandle.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    expect(Math.abs(rowRailRect.top + rowRailRect.height / 2 - (targetMetrics.top + targetMetrics.height / 2))).toBeLessThanOrEqual(8)

    await rowHandle.click()
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "행 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(rowMenu).toHaveCount(0)

    await targetCell.click()
    await targetCell.hover()
    await page.mouse.move(targetMetrics.left + targetMetrics.width / 2, tableBox.y + 6)
    await expect(columnHandle).toBeVisible()
    const columnRailRect = await columnHandle.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    })
    expect(Math.abs(columnRailRect.left + columnRailRect.width / 2 - (targetMetrics.left + targetMetrics.width / 2))).toBeLessThanOrEqual(8)
  })

  test("table menu는 좁은 뷰포트에서도 화면 내부에 배치된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()
    await page.getByTestId("table-structure-menu-button").click()

    const menu = page.getByTestId("table-table-menu")
    await expect(menu).toBeVisible()
    const inViewport = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const padding = 4
      return (
        rect.left >= padding &&
        rect.top >= padding &&
        rect.right <= window.innerWidth - padding &&
        rect.bottom <= window.innerHeight - padding
      )
    })
    expect(inViewport).toBe(true)
  })

  test("desktop table handle은 viewport 내부를 유지하고 열 추가·삭제 뒤 폭 계약이 유지된다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    const moveToRowColumnHotzone = async () => {
      const firstCellBox = await page.locator(".aq-block-editor__content .tableWrapper table tr:first-child > *").first().boundingBox()
      if (!firstCellBox) {
        throw new Error("first table cell bounding box is missing")
      }
      await page.mouse.move(firstCellBox.x + 8, firstCellBox.y + 8)
    }

    const moveToTrailingHotzone = async () => {
      const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
      if (!tableBox) {
        throw new Error("table bounding box is missing")
      }
      await page.mouse.move(tableBox.x + tableBox.width - 8, tableBox.y + tableBox.height - 8)
    }

    const assertHandlesInViewport = async () => {
      await moveToTrailingHotzone()

      const readAddMetrics = async () =>
        page.evaluate(() => {
          const viewportWidth = window.innerWidth
          const viewportHeight = window.innerHeight
          const columnAddBar = document.querySelector<HTMLElement>("[data-table-affordance='column-add']")
          const rowAddBar = document.querySelector<HTMLElement>("[data-table-affordance='row-add']")
          const table = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper table")
          const content = document.querySelector<HTMLElement>(".aq-block-editor__content")
          if (!columnAddBar || !rowAddBar || !table || !content) return null

          const toRect = (element: HTMLElement) => {
            const rect = element.getBoundingClientRect()
            return {
              left: Math.round(rect.left),
              top: Math.round(rect.top),
              right: Math.round(rect.right),
              bottom: Math.round(rect.bottom),
              width: Math.round(rect.width),
            }
          }

          const withinViewport = (rect: { left: number; top: number; right: number; bottom: number }) =>
            rect.left >= 8 &&
            rect.top >= 8 &&
            rect.right <= viewportWidth - 8 &&
            rect.bottom <= viewportHeight - 8

          return {
            tableWidth: Math.round(table.getBoundingClientRect().width),
            contentWidth: Math.round(content.getBoundingClientRect().width),
            columnAddBar: toRect(columnAddBar),
            rowAddBar: toRect(rowAddBar),
            rowAddWithinViewport: withinViewport(toRect(rowAddBar)),
            columnAddWithinViewport: withinViewport(toRect(columnAddBar)),
            columnCount: table.querySelectorAll("tr:first-child > th, tr:first-child > td").length,
          }
        })

      await expect
        .poll(
          async () => {
            const metrics = await readAddMetrics()
            if (!metrics) return null
            return {
              widthStable: metrics.tableWidth <= metrics.contentWidth + 2,
              rowAddWithinViewport: metrics.rowAddWithinViewport,
              columnAddWithinViewport: metrics.columnAddWithinViewport,
            }
          },
          { timeout: 5000 }
        )
        .toMatchObject({
          widthStable: true,
          rowAddWithinViewport: true,
          columnAddWithinViewport: true,
        })

      const addMetrics = await readAddMetrics()
      expect(addMetrics).not.toBeNull()
      if (!addMetrics) {
        throw new Error("desktop table add-bar viewport metrics are missing")
      }

      expect(addMetrics.tableWidth).toBeLessThanOrEqual(addMetrics.contentWidth + 2)
      expect(addMetrics.rowAddWithinViewport).toBe(true)
      expect(addMetrics.columnAddWithinViewport).toBe(true)

      return addMetrics
    }

    const beforeMetrics = await assertHandlesInViewport()
    expect(beforeMetrics.columnCount).toBe(3)

    await moveToRowColumnHotzone()
    await columnHandle.click()
    const columnMenu = page.getByTestId("table-column-menu")
    await columnMenu.getByRole("button", { name: "오른쪽에 삽입" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    const afterInsertMetrics = await assertHandlesInViewport()
    expect(afterInsertMetrics.columnCount).toBe(4)

    await moveToRowColumnHotzone()
    await columnHandle.click()
    await columnMenu.getByRole("button", { name: "열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    const afterDeleteMetrics = await assertHandlesInViewport()
    expect(afterDeleteMetrics.columnCount).toBe(3)
  })

  test("writer surface의 row/column grip과 trailing +행/+열은 edge hover에서만 노출된다", async ({ page }) => {
    await page.goto(QA_WRITER_ROUTE)
    const { columnHandle, rowHandle, columnAddButton, rowAddButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("writer table bounding box is missing")
    }
    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    await expect(columnHandle).toBeVisible()
    await expect(rowHandle).toBeVisible()
    await expect(columnAddButton).toHaveCount(0)
    await expect(rowAddButton).toHaveCount(0)

    await page.mouse.move(tableBox.x + tableBox.width - 3, tableBox.y + tableBox.height - 3)

    await expect(columnAddButton).toBeVisible()
    await expect(rowAddButton).toBeVisible()
  })

  test("writer surface의 multi-table hover는 hovered table 기준으로 cell menu를 고정하고 block drag handle을 유지한다", async ({
    page,
  }) => {
    await page.goto(QA_WRITER_ROUTE)
    const { cellMenuButton } = getTableAffordances(page)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const firstTableForSetup = page.locator(".aq-block-editor__content .tableWrapper table").first()
    const firstSetupBox = await firstTableForSetup.boundingBox()
    if (!firstSetupBox) {
      throw new Error("writer first table bounding box is missing before multi-table setup")
    }

    await page.mouse.click(firstSetupBox.x + 40, firstSetupBox.y + firstSetupBox.height + 28)
    await page.keyboard.type("중간 문단 1")
    await page.keyboard.press("Enter")
    await page.keyboard.type("중간 문단 2")
    await page.keyboard.press("Enter")
    await page.keyboard.type("중간 문단 3")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "테이블", exact: true }).first().click()

    const tables = page.locator(".aq-block-editor__content .tableWrapper table")
    await expect(tables).toHaveCount(2)

    const secondTableCell = tables.nth(1).locator("th, td").nth(1)
    await secondTableCell.scrollIntoViewIfNeeded()
    await secondTableCell.click()

    const firstTable = tables.first()
    await firstTable.scrollIntoViewIfNeeded()
    const firstTableBox = await firstTable.boundingBox()
    if (!firstTableBox) {
      throw new Error("writer first table bounding box is missing")
    }

    const firstTableCell = firstTable.locator("th, td").first()
    await firstTableCell.hover()
    await page.mouse.move(firstTableBox.x + firstTableBox.width / 2, firstTableBox.y + 6)

    const cellMenuMetrics = await cellMenuButton.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        left: Math.round(rect.left),
      }
    })

    expect(cellMenuMetrics.top).toBeGreaterThanOrEqual(Math.round(firstTableBox.y) - 12)
    expect(cellMenuMetrics.bottom).toBeLessThanOrEqual(Math.round(firstTableBox.y + firstTableBox.height) + 24)

    await page.mouse.move(firstTableBox.x + 24, firstTableBox.y + 24)
    await expect(page.getByTestId("block-drag-handle")).toBeVisible()
  })

  test("writer surface의 pasted 4열 table에서도 row/column menu가 계속 동작한다", async ({ page }) => {
    await page.setViewportSize({ width: 1680, height: 1500 })
    await page.goto(QA_WRITER_ROUTE)
    const { rowHandle: rowMenuButton, columnHandle: columnMenuButton } = getTableAffordances(page)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()

    const tableMarkdown = [
      "| 축 | 대표 지표 | 의미 | 자주 하는 오해 |",
      "| --- | --- | --- | --- |",
      "| 처리량 | TPS / RPS | 초당 얼마나 많은 요청과 트랜잭션을 처리하는가 | 처리량이 높으면 시스템이 건강하다고 생각함 |",
      "| 지연 | P95 / P99 | 느린 요청의 꼬리 지연을 확인 | 평균 응답 시간만 보고 빠르다고 결론냄 |",
      "| 안정성 | Error Rate | 타임아웃, 5xx, 재시도 증가를 포함해 실패를 측정 | 에러를 일시적 네트워크 문제로만 봄 |",
      "| 자원 | CPU, 메모리, 스레드, 커넥션 | 병목이 애플리케이션인지 인프라인지 좁히는 단서 | 리소스가 남아 있으면 안전하다고 생각함 |",
    ].join("\n")

    await editor.evaluate((element, markdown) => {
      const data = new DataTransfer()
      data.setData("text/plain", markdown)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, tableMarkdown)

    const table = page.locator(".aq-block-editor__content .tableWrapper table")
    await expect(table.locator("tr")).toHaveCount(5)
    await expect(table.locator("tr").first().locator("th, td")).toHaveCount(4)

    const firstTableCell = table.locator("tr").first().locator("th, td").first()
    await firstTableCell.click()

    const getTableSurfaceBox = async () => {
      const box = await page.locator(".aq-block-editor__content .tableWrapper").boundingBox()
      if (!box) {
        throw new Error("writer table surface bounding box is missing")
      }
      return box
    }
    const getRenderedTableBox = async () => {
      const box = await table.boundingBox()
      if (!box) {
        throw new Error("writer rendered pasted table bounding box is missing")
      }
      return box
    }

    const moveToTopLeftHotzone = async () => {
      const box = await getRenderedTableBox()
      await page.mouse.move(box.x + 8, box.y + 8)
    }
    const moveToBottomRightHotzone = async () => {
      const box = await getTableSurfaceBox()
      await page.mouse.move(box.x + box.width - 8, box.y + box.height - 8)
    }
    await moveToTopLeftHotzone()

    await expect(rowMenuButton).toBeVisible()
    await expect(columnMenuButton).toBeVisible()

    await rowMenuButton.click()
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await rowMenu.getByRole("button", { name: "아래에 삽입" }).click()
    await expect(table.locator("tr")).toHaveCount(6)

    await moveToTopLeftHotzone()
    await columnMenuButton.click()
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await columnMenu.getByRole("button", { name: "오른쪽에 삽입" }).click()
    await expect(table.locator("tr").first().locator("th, td")).toHaveCount(5)

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight)
    })
    await page.waitForTimeout(120)
    await moveToTopLeftHotzone()
    await rowMenuButton.click()
    await expect(rowMenu).toBeVisible()
    await rowMenu.getByRole("button", { name: "아래에 삽입" }).click()
    await expect(table.locator("tr")).toHaveCount(7)

    await moveToTopLeftHotzone()
    await columnMenuButton.click()
    await expect(columnMenu).toBeVisible()
    await columnMenu.getByRole("button", { name: "오른쪽에 삽입" }).click()
    await expect(table.locator("tr").first().locator("th, td")).toHaveCount(6)
  })

  test("모바일 뷰포트에서는 표만 wrapper 내부 가로 스크롤을 사용하고 페이지 전체 overflow는 생기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)
    const { columnHandle, rowHandle } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    await expect(columnHandle).toHaveCount(0)
    await expect(rowHandle).toHaveCount(0)

    for (let index = 0; index < 8; index += 1) {
      await page.getByRole("button", { name: "QA 열 추가" }).click()
    }
    for (let index = 0; index < 4; index += 1) {
      await page.getByRole("button", { name: "QA 열 리사이즈" }).click()
    }

    const metrics = await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      if (!wrapper) return null

      const wrapperStyle = window.getComputedStyle(wrapper)
      wrapper.scrollLeft = wrapper.scrollWidth

      return {
        viewportWidth: Math.round(window.innerWidth),
        pageScrollWidth: Math.round(document.documentElement.scrollWidth),
        wrapperClientWidth: Math.round(wrapper.clientWidth),
        wrapperScrollWidth: Math.round(wrapper.scrollWidth),
        wrapperScrollLeft: Math.round(wrapper.scrollLeft),
        wrapperOverflowX: wrapperStyle.overflowX,
        wrapperTouchAction: wrapperStyle.touchAction,
        wrapperOverscrollBehaviorX:
          (wrapperStyle as CSSStyleDeclaration & { overscrollBehaviorX?: string }).overscrollBehaviorX ||
          "",
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) {
      throw new Error("mobile table wrapper metrics are missing")
    }

    expect(["auto", "scroll"]).toContain(metrics.wrapperOverflowX)
    expect(metrics.wrapperTouchAction).toContain("pan-x")
    expect(metrics.wrapperOverscrollBehaviorX || "auto").toBe("contain")
    expect(metrics.wrapperScrollWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    if (metrics.wrapperScrollWidth > metrics.wrapperClientWidth) {
      expect(metrics.wrapperScrollLeft).toBeGreaterThan(0)
    }
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2)
  })

  test("넓은 붙여넣기 표는 wide mode로 승격되어 wrapper 내부 가로 스크롤을 사용한다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 980, height: 900 })
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()

    const wideTableMarkdown = [
      "| A | B | C | D | E | F | G |",
      "| --- | --- | --- | --- | --- | --- | --- |",
      "| 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
      "| aa | bb | cc | dd | ee | ff | gg |",
    ].join("\n")

    await editor.evaluate((element, markdown) => {
      const data = new DataTransfer()
      data.setData("text/plain", markdown)
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    }, wideTableMarkdown)

    const wrapper = page.locator(".aq-block-editor__content .tableWrapper").first()
    const table = wrapper.locator("table")
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')

    const metrics = await page.evaluate(() => {
      const wrapperElement = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      const tableElement = wrapperElement?.querySelector<HTMLElement>("table")
      const firstCell = tableElement?.querySelector<HTMLElement>("th, td")
      if (!wrapperElement || !tableElement || !firstCell) return null

      wrapperElement.scrollLeft = wrapperElement.scrollWidth

      return {
        viewportWidth: Math.round(window.innerWidth),
        pageScrollWidth: Math.round(document.documentElement.scrollWidth),
        wrapperClientWidth: Math.round(wrapperElement.clientWidth),
        wrapperScrollWidth: Math.round(wrapperElement.scrollWidth),
        wrapperScrollLeft: Math.round(wrapperElement.scrollLeft),
        tableWidth: Math.round(tableElement.getBoundingClientRect().width),
        firstCellWidth: Math.round(firstCell.getBoundingClientRect().width),
      }
    })

    expect(metrics).not.toBeNull()
    if (!metrics) {
      throw new Error("wide pasted table metrics are missing")
    }

    expect(metrics.firstCellWidth).toBeGreaterThanOrEqual(170)
    expect(metrics.tableWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    expect(metrics.wrapperScrollWidth).toBeGreaterThanOrEqual(metrics.wrapperClientWidth)
    if (metrics.wrapperScrollWidth > metrics.wrapperClientWidth) {
      expect(metrics.wrapperScrollLeft).toBeGreaterThan(0)
    }
    expect(metrics.pageScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 2)
  })

  test("table corner grow handle은 row/column을 함께 확장하고 trailing empty axis만 축소한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const growHandle = page.getByTestId("table-corner-grow-handle")
    await expect(growHandle).toBeVisible()

    const before = await page.evaluate(() => {
      const firstRow = document.querySelector("table tr")
      return {
        rows: document.querySelectorAll("table tr").length,
        columns: firstRow?.children.length ?? 0,
      }
    })

    await growHandle.click()

    await expect
      .poll(async () => await page.locator("table tr").count())
      .toBeGreaterThan(before.rows)
    await expect
      .poll(
        async () =>
          await page.evaluate(() => {
            const firstRow = document.querySelector("table tr")
            return firstRow?.children.length ?? 0
          })
      )
      .toBeGreaterThan(before.columns)

    const afterGrow = await page.evaluate(() => {
      const firstRow = document.querySelector("table tr")
      return {
        rows: document.querySelectorAll("table tr").length,
        columns: firstRow?.children.length ?? 0,
      }
    })

    const growHandleBox = await growHandle.boundingBox()
    expect(growHandleBox).not.toBeNull()
    const stepMetrics = await growHandle.evaluate((element) => ({
      columnStep: Number((element as HTMLElement).dataset.columnStep || "0"),
      rowStep: Number((element as HTMLElement).dataset.rowStep || "0"),
    }))
    expect(stepMetrics.columnStep).toBeGreaterThan(0)
    expect(stepMetrics.rowStep).toBeGreaterThan(0)

    const startX = (growHandleBox?.x ?? 0) + (growHandleBox?.width ?? 0) / 2
    const startY = (growHandleBox?.y ?? 0) + (growHandleBox?.height ?? 0) / 2
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX - stepMetrics.columnStep - 8, startY - stepMetrics.rowStep - 8)

    await expect(page.getByTestId("table-corner-preview-outline")).toBeVisible()
    await expect(page.locator("table tr")).toHaveCount(afterGrow.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(afterGrow.columns)

    await page.mouse.up()

    await expect(page.locator("table tr")).toHaveCount(before.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(before.columns)

    const trailingCell = page.locator("table tr").nth(before.rows - 1).locator("th, td").nth(before.columns - 1)
    await trailingCell.click()
    await page.keyboard.type("keep")
    await firstTableCell.hover()

    await growHandle.evaluate(async (element, payload) => {
      const { pointerId, padding } = payload as {
        pointerId: number
        padding: number
      }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const columnStep = Number((element as HTMLElement).dataset.columnStep || "0")
      const rowStep = Number((element as HTMLElement).dataset.rowStep || "0")
      if (!Number.isFinite(columnStep) || !Number.isFinite(rowStep) || columnStep <= 0 || rowStep <= 0) {
        throw new Error("table corner blocked shrink step metrics are missing")
      }
      const currentX = startX - columnStep - padding
      const currentY = startY - rowStep - padding
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: currentX,
          clientY: currentY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: currentX,
          clientY: currentY,
        })
      )
      await waitForFrame()
    }, { pointerId: 32, padding: 8 })

    await expect(page.locator("table tr")).toHaveCount(before.rows)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(before.columns)
    await expect(trailingCell).toContainText("keep")
  })

  test("table 구조 메뉴는 구조 액션만 포함하고 제목 행 토글과 표 삭제가 동작한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const structureMenuButton = page.getByTestId("table-structure-menu-button")
    await structureMenuButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(3)
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "좌측" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "배경 해제" })).toHaveCount(0)
    await expect(tableMenu.getByRole("button", { name: "페이지 너비에 맞춤" })).toBeVisible()
    await expect(tableMenu.getByRole("button", { name: "넓은 표" })).toBeVisible()

    await tableMenu.getByRole("button", { name: "제목 행" }).click()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(0)

    await structureMenuButton.click()
    await expect(tableMenu).toBeVisible()
    await tableMenu.getByRole("button", { name: "표 삭제" }).click()
    await expect(page.locator(".aq-block-editor__content table")).toHaveCount(0)
    await expect(page.getByTestId("block-editor-prosemirror")).toBeVisible()
  })

  test("table 구조 메뉴의 폭 정책 UI는 wide/fit-to-page를 토글하고 재진입 후에도 유지된다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const structureMenuButton = page.getByTestId("table-structure-menu-button")
    const table = page.locator(".aq-block-editor__content .tableWrapper table").first()

    await structureMenuButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await expect(tableMenu.getByTestId("table-overflow-mode-normal")).toHaveAttribute("data-active", "true")
    await expect(tableMenu.getByTestId("table-overflow-mode-wide")).toHaveAttribute("data-active", "false")

    await tableMenu.getByRole("button", { name: "넓은 표" }).click()
    await expect(table).toHaveAttribute("data-overflow-mode", "wide")
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"wide"')

    const wideMarkdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(wideMarkdown.replace(/\n/g, "\\n"))}`)
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )

    const reloadedFirstCell = page.locator("table th, table td").first()
    await reloadedFirstCell.click()
    await reloadedFirstCell.hover()

    await page.getByTestId("table-structure-menu-button").click()
    const reloadedTableMenu = page.getByTestId("table-table-menu")
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-normal")).toHaveAttribute("data-active", "false")
    await expect(reloadedTableMenu.getByTestId("table-overflow-mode-wide")).toHaveAttribute("data-active", "true")

    await reloadedTableMenu.getByRole("button", { name: "페이지 너비에 맞춤" }).click()
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).not.toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"normal"')

    const normalMarkdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(normalMarkdown.replace(/\n/g, "\\n"))}`)
    await expect(page.locator(".aq-block-editor__content .tableWrapper table").first()).not.toHaveAttribute(
      "data-overflow-mode",
      "wide"
    )
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"overflowMode":"normal"')
  })

  test("table cell menu는 셀 스타일만 포함하고 구조 액션 없이 정렬/배경을 저장한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { cellMenuButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    await cellMenuButton.click()

    const cellMenu = page.getByTestId("table-cell-menu")
    await expect(cellMenu).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "좌측" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "가운데" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "배경 해제" })).toBeVisible()
    await expect(cellMenu.getByRole("button", { name: "제목 행" })).toHaveCount(0)
    await expect(cellMenu.getByRole("button", { name: "표 삭제" })).toHaveCount(0)

    await cellMenu.getByRole("button", { name: "가운데" }).click()
    await cellMenu.getByRole("button", { name: "노랑 배경" }).click()

    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"align":"center"')
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"backgroundColor":"#fef3c7"')
  })

  test("table row/column 메뉴는 axis-level header action을 노출하고 저장 후 재진입해도 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { rowHandle: rowMenuButton, columnHandle: columnMenuButton } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table axis menu metrics are missing")
    }
    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)

    await expect(rowMenuButton).toBeVisible()
    await rowMenuButton.click()
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "제목 행" })).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "제목 열" })).toHaveCount(0)
    await rowMenu.getByRole("button", { name: "제목 행" }).click()

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await expect(columnMenuButton).toBeVisible()
    await columnMenuButton.click()
    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "제목 열" })).toBeVisible()
    await expect(columnMenu.getByRole("button", { name: "제목 행" })).toHaveCount(0)
    await columnMenu.getByRole("button", { name: "제목 열" }).click()

    await expect(page.locator("table tr").first().locator("th")).toHaveCount(1)
    await expect(page.locator("table tr").nth(1).locator("th")).toHaveCount(1)

    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerRow":false')
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerColumn":true')

    const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(markdown.replace(/\n/g, "\\n"))}`)
    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .toContain('"headerColumn":true')
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(1)
    await expect(page.locator("table tr").nth(1).locator("th")).toHaveCount(1)
  })

  test("table 셀 텍스트도 드래그 선택 후 인라인 버블 포맷(굵게/색상)을 적용할 수 있다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.keyboard.type("셀굵게 셀색상")

    await selectWordInEditable(page, firstTableCell, "셀굵게")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.getByRole("button", { name: "굵게", exact: true }).click()

    await selectWordInEditable(page, firstTableCell, "셀색상")
    if ((await textBubbleToolbar.count()) === 0) {
      await selectWordInEditable(page, firstTableCell, "셀색상")
    }
    await expect(textBubbleToolbar).toBeVisible()
    const openBubbleColorMenu = async () => {
      await textBubbleToolbar.hover()
      await page.locator("[aria-label='글자색']").first().click()
    }
    await openBubbleColorMenu()
    const skyColorButton = page.getByRole("button", { name: "하늘", exact: true }).first()
    if (!(await skyColorButton.isVisible())) {
      await selectWordInEditable(page, firstTableCell, "셀색상")
      await expect(textBubbleToolbar).toBeVisible()
      await openBubbleColorMenu()
    }
    await expect(skyColorButton).toBeVisible()
    await skyColorButton.click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect
      .poll(async () => (await markdownOutput.textContent()) || "")
      .toMatch(/\*\*셀굵게(?: 셀색상)?\*\*/)
    await expect
      .poll(async () => (await markdownOutput.textContent()) || "")
      .toContain("{{color:#60a5fa\\|")
  })

  test("table 셀 텍스트 selection bubble도 mouseup 이후에만 노출된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.keyboard.type("셀 버블 지연 노출")

    const points = await getWordDragPoints(firstTableCell, "버블")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")

    await page.mouse.move(points.startX, points.startY)
    await page.mouse.down()
    await setWordSelectionInEditable(firstTableCell, "버블")
    await expect(textBubbleToolbar).toHaveCount(0)

    await page.mouse.up()
    await expect(textBubbleToolbar).toBeVisible()
  })

  test("table QA actions로 열/행 추가와 삭제가 round-trip 된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstCell = page.locator("table th, table td").first()
    await firstCell.click()

    await page.getByRole("button", { name: "QA 행 추가" }).click()
    await page.getByRole("button", { name: "QA 열 추가" }).click()
    await expect(page.locator("table tr")).toHaveCount(4)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    await page.getByRole("button", { name: "QA 열 선택" }).click()
    await page.getByRole("button", { name: "QA 열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    await firstCell.click()
    await page.getByRole("button", { name: "QA 행 삭제" }).click()
    await expect(page.locator("table tr")).toHaveCount(3)
  })

  test("table row/column grip drag는 축을 재정렬하고 seed 재진입 후에도 순서를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)
    const { rowHandle: rowGrip, columnHandle: columnGrip } = getTableAffordances(page)

    await page.getByRole("button", { name: "테이블" }).click()

    const initialValues = [
      ["r1c1", "r1c2", "r1c3"],
      ["r2c1", "r2c2", "r2c3"],
      ["r3c1", "r3c2", "r3c3"],
    ]

    for (let rowIndex = 0; rowIndex < initialValues.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < initialValues[rowIndex].length; columnIndex += 1) {
        const cell = page.locator("table tr").nth(rowIndex).locator("th, td").nth(columnIndex)
        await cell.click()
        await page.keyboard.type(initialValues[rowIndex][columnIndex])
      }
    }

    const tableBox = await page.locator(".aq-block-editor__content .tableWrapper table").boundingBox()
    if (!tableBox) {
      throw new Error("table reorder anchor metrics are missing")
    }

    await page.mouse.move(tableBox.x + 3, tableBox.y + 3)
    await expect(rowGrip).toBeVisible()
    const lastRowBox = await page.locator("table tr").nth(2).boundingBox()
    if (!lastRowBox) {
      throw new Error("table row reorder handle metrics are missing")
    }

    await rowGrip.evaluate(async (element, payload) => {
      const { pointerId, targetY } = payload as { pointerId: number; targetY: number }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: targetY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: startX,
          clientY: targetY,
        })
      )
      await waitForFrame()
    }, { pointerId: 11, targetY: lastRowBox.y + lastRowBox.height + 18 })

    await expect
      .poll(async () => (await readTableGrid(page)).map((row) => row[0]))
      .toEqual(["r2c1", "r3c1", "r1c1"])

    const reorderedFirstCellBox = await page.locator("table tr").first().locator("th, td").first().boundingBox()
    if (!reorderedFirstCellBox) {
      throw new Error("table reordered first cell metrics are missing")
    }

    await page.mouse.move(
      reorderedFirstCellBox.x + reorderedFirstCellBox.width / 2,
      reorderedFirstCellBox.y + 3
    )
    await expect(columnGrip).toBeVisible()
    await expect(columnGrip).toBeVisible()
    const firstRowLastCellBox = await page.locator("table tr").first().locator("th, td").nth(2).boundingBox()
    if (!firstRowLastCellBox) {
      throw new Error("table column reorder handle metrics are missing")
    }

    await columnGrip.evaluate(async (element, payload) => {
      const { pointerId, targetX } = payload as { pointerId: number; targetX: number }
      const rect = (element as HTMLElement).getBoundingClientRect()
      const startX = rect.left + rect.width / 2
      const startY = rect.top + rect.height / 2
      const waitForFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 1,
          isPrimary: true,
          clientX: targetX,
          clientY: startY,
        })
      )
      await waitForFrame()
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "mouse",
          button: 0,
          buttons: 0,
          isPrimary: true,
          clientX: targetX,
          clientY: startY,
        })
      )
      await waitForFrame()
    }, { pointerId: 12, targetX: firstRowLastCellBox.x + firstRowLastCellBox.width + 48 })

    await expect
      .poll(async () => (await readTableGrid(page))[0])
      .toEqual(["r2c2", "r2c3", "r2c1"])

    await expect
      .poll(async () => {
        const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
        return (
          markdown.includes("| r2c2 | r2c3 | r2c1 |") &&
          markdown.includes("| r3c2 | r3c3 | r3c1 |") &&
          markdown.includes("| r1c2 | r1c3 | r1c1 |")
        )
      })
      .toBe(true)

    const markdown = (await page.getByTestId("qa-markdown-output").textContent()) || ""
    await page.goto(`${QA_ENGINE_ROUTE}&seed=${encodeURIComponent(markdown.replace(/\n/g, "\\n"))}`)

    await expect
      .poll(async () => (await readTableGrid(page)).map((row) => row[0]))
      .toEqual(["r2c2", "r3c2", "r1c2"])
    await expect
      .poll(async () => (await readTableGrid(page))[0])
      .toEqual(["r2c2", "r2c3", "r2c1"])
  })

  test("table row resize handle은 drag 후 row height를 유지한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    const beforeHeight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
    )
    await page.getByRole("button", { name: "QA 행 리사이즈" }).click()

    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) =>
          Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
        )
      )
      .toBeGreaterThan(beforeHeight)

    await expect(page.getByTestId("qa-markdown-output")).toContainText('"rowHeights"')
  })

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

    const afterWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )
    expect(afterWidth).toBeGreaterThanOrEqual(beforeWidth)
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

    await expect(page.getByTestId("table-column-drag-guide")).toBeVisible()
    await expect(page.getByTestId("table-column-resize-boundary-0")).toHaveCount(0)
    await expect
      .poll(async () =>
        page
          .getByTestId("table-column-drag-guide")
          .evaluate((element) => {
            const rect = (element as HTMLElement).getBoundingClientRect()
            return Math.round(rect.left + rect.width / 2)
          })
      )
      .toBe(initialBoundaryCenter)
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
    await page.mouse.move(startX + 2, startY)
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
      "| WebSocket | HTTP 요청/응답만으로는 채팅 같은 실시간 양방향 통신을 자연스럽게 처리하기 어렵다 |",
      "| STOMP | Broker 기반 구독/배포 모델로 메시지를 주고받는다 |",
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

    await page.mouse.move(firstStartX, firstStartY)
    await page.mouse.down()
    await page.mouse.move(firstStartX + 180, firstStartY, { steps: 10 })
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
