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

    await expect(page.locator(".aq-block-editor__content table")).toHaveCount(1)
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
    await expect(page.getByTestId("editor-text-bubble-toolbar")).toBeVisible()

    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "콜아웃" }).click()
    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 버블 노출")

    await selectWordInEditable(page, calloutBodyContent, "버블")
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

  test("table mode에서는 block rail이 숨고 table handle/menu가 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    await expect(page.getByTestId("table-column-rail-track")).toHaveCount(0)
    await expect(page.getByTestId("table-column-rail")).toBeVisible()
    await expect(page.getByTestId("table-row-rail")).toBeVisible()
    await expect(page.getByTestId("table-corner-handle")).toBeVisible()
    await expect(page.getByTestId("table-bubble-toolbar")).toHaveCount(0)
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)

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
    expect(Math.abs(tableWidthShape.contentWidth - tableWidthShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(tableWidthShape.firstCellWidth).toBeGreaterThanOrEqual(180)
    expect(tableWidthShape.firstCellWidth).toBeLessThanOrEqual(320)

    const columnRailButton = page.getByTestId("table-column-rail").getByRole("button", { name: "열 추가/삭제" })
    const columnQuickAddButton = page
      .getByTestId("table-column-rail")
      .getByRole("button", { name: "열 추가", exact: true })
    const rowRailButton = page.getByTestId("table-row-rail").getByRole("button", { name: "행 메뉴" })
    const rowQuickAddButton = page
      .getByTestId("table-row-rail")
      .getByRole("button", { name: "행 추가", exact: true })
    const tableCornerButton = page.getByTestId("table-corner-handle").getByRole("button", { name: "표 메뉴" })

    await expect(columnRailButton).toBeVisible()
    await expect(columnRailButton).toContainText("열 메뉴")
    await expect(columnQuickAddButton).toBeVisible()
    await expect(rowRailButton).toBeVisible()
    await expect(rowRailButton).toContainText("행 메뉴")
    await expect(rowQuickAddButton).toBeVisible()
    await expect(tableCornerButton).toBeVisible()
    await expect(tableCornerButton).toContainText("표 메뉴")

    await columnQuickAddButton.click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    await rowQuickAddButton.click()
    await expect(page.locator("table tr")).toHaveCount(4)

    await columnRailButton.click()

    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await columnMenu.getByRole("button", { name: "열 선택" }).click()
    await expect(page.getByTestId("table-column-menu")).toHaveCount(0)
  })

  test("table axis rail hover 전환 중에도 axis menu 액션이 끊기지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const columnRailButton = page.getByTestId("table-column-rail").getByRole("button", { name: "열 추가/삭제" })
    await expect(columnRailButton).toBeVisible()
    await columnRailButton.hover()
    await columnRailButton.click()

    const columnMenu = page.getByTestId("table-column-menu")
    await expect(columnMenu).toBeVisible()
    await columnMenu.getByRole("button", { name: "오른쪽에 삽입" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)
  })

  test("table menu는 좁은 뷰포트에서도 화면 내부에 배치된다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()
    await page.getByTestId("table-corner-handle").getByRole("button", { name: "표 메뉴" }).click()

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

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const assertHandlesInViewport = async () => {
      const readMetrics = async () =>
        page.evaluate(() => {
          const viewportWidth = window.innerWidth
          const viewportHeight = window.innerHeight
          const columnRail = document.querySelector<HTMLElement>("[data-testid='table-column-rail']")
          const corner = document.querySelector<HTMLElement>("[data-testid='table-corner-handle']")
          const rowRail = document.querySelector<HTMLElement>("[data-testid='table-row-rail']")
          const table = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper table")
          const content = document.querySelector<HTMLElement>(".aq-block-editor__content")
          if (!columnRail || !corner || !rowRail || !table || !content) return null

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
            columnRail: toRect(columnRail),
            corner: toRect(corner),
            rowRail: toRect(rowRail),
            cornerWithinViewport: withinViewport(toRect(corner)),
            rowWithinViewport: withinViewport(toRect(rowRail)),
            columnWithinViewport: withinViewport(toRect(columnRail)),
            columnCount: table.querySelectorAll("tr:first-child > th, tr:first-child > td").length,
          }
        })

      await expect
        .poll(
          async () => {
            const metrics = await readMetrics()
            if (!metrics) return null
            return {
              widthStable: metrics.tableWidth <= metrics.contentWidth + 2,
              cornerWithinViewport: metrics.cornerWithinViewport,
              rowWithinViewport: metrics.rowWithinViewport,
              columnWithinViewport: metrics.columnWithinViewport,
            }
          },
          { timeout: 5000 }
        )
        .toMatchObject({
          widthStable: true,
          cornerWithinViewport: true,
          rowWithinViewport: true,
          columnWithinViewport: true,
        })

      const metrics = await readMetrics()
      expect(metrics).not.toBeNull()
      if (!metrics) {
        throw new Error("desktop table handle viewport metrics are missing")
      }

      expect(metrics.tableWidth).toBeLessThanOrEqual(metrics.contentWidth + 2)
      expect(metrics.cornerWithinViewport).toBe(true)
      expect(metrics.rowWithinViewport).toBe(true)
      expect(metrics.columnWithinViewport).toBe(true)

      return metrics
    }

    const beforeMetrics = await assertHandlesInViewport()
    expect(beforeMetrics.columnCount).toBe(3)

    const columnRailButton = page.getByTestId("table-column-rail").getByRole("button", { name: "열 추가/삭제" })
    await columnRailButton.click()
    await page.getByTestId("table-column-menu").getByRole("button", { name: "오른쪽에 삽입" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(4)

    const afterInsertMetrics = await assertHandlesInViewport()
    expect(afterInsertMetrics.columnCount).toBe(4)

    await columnRailButton.click()
    await page.getByTestId("table-column-menu").getByRole("button", { name: "열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    const afterDeleteMetrics = await assertHandlesInViewport()
    expect(afterDeleteMetrics.columnCount).toBe(3)
  })

  test("모바일 뷰포트에서는 표만 wrapper 내부 가로 스크롤을 사용하고 페이지 전체 overflow는 생기지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()

    await expect(page.getByTestId("table-column-rail-track")).toHaveCount(0)

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

  test("table corner menu에서 제목 행 토글과 표 삭제가 동작한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const cornerHandleButton = page.getByTestId("table-corner-handle").getByRole("button", { name: "표 메뉴" })
    await cornerHandleButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(3)
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)

    await tableMenu.getByRole("button", { name: "제목 행" }).click()
    await expect(page.locator("table tr").first().locator("th")).toHaveCount(0)

    await cornerHandleButton.click()
    await expect(tableMenu).toBeVisible()
    await tableMenu.getByRole("button", { name: "표 삭제" }).click()
    await expect(page.locator(".aq-block-editor__content table")).toHaveCount(0)
    await expect(page.getByTestId("block-editor-prosemirror")).toBeVisible()
  })

  test("table 제목 행/열 토글 상태는 저장 후 재진입해도 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()

    const cornerHandleButton = page
      .getByTestId("table-corner-handle")
      .getByRole("button", { name: "표 메뉴" })

    await cornerHandleButton.click()
    const tableMenu = page.getByTestId("table-table-menu")
    await expect(tableMenu).toBeVisible()
    await tableMenu.getByRole("button", { name: "제목 행" }).click()

    await cornerHandleButton.click()
    await expect(tableMenu).toBeVisible()
    await tableMenu.getByRole("button", { name: "제목 열" }).click()

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
    await expect(textBubbleToolbar).toBeVisible()
    await textBubbleToolbar.locator("summary[aria-label='글자색']").click()
    await textBubbleToolbar.getByRole("button", { name: "하늘", exact: true }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("**셀굵게**")
    await expect(markdownOutput).toContainText("{{color:#60a5fa\\|셀색상}}")
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

  test("table column resize drag는 mouseup 전에도 guide가 포인터 위치를 따라간다", async ({ page }) => {
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
    const initialGuideLeft = await page
      .getByTestId("table-column-drag-guide")
      .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))

    await page.mouse.move(startX + 72, startY, { steps: 8 })

    await expect
      .poll(async () =>
        page
          .getByTestId("table-column-drag-guide")
          .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))
      )
      .toBeGreaterThan(initialGuideLeft + 24)

    await page.mouse.up()
  })

  test("writer surface의 table column resize drag도 mouseup 전 guide를 먼저 보여준다", async ({
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
    const initialGuideLeft = await page
      .getByTestId("table-column-drag-guide")
      .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))

    await page.mouse.move(startX + 72, startY, { steps: 8 })

    await expect
      .poll(async () =>
        page
          .getByTestId("table-column-drag-guide")
          .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))
      )
      .toBeGreaterThan(initialGuideLeft + 24)

    const expandedGuideLeft = await page
      .getByTestId("table-column-drag-guide")
      .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))

    await page.mouse.move(startX + 36, startY, { steps: 6 })

    await expect
      .poll(async () =>
        page
          .getByTestId("table-column-drag-guide")
          .evaluate((element) => Math.round((element as HTMLElement).getBoundingClientRect().left))
      )
      .toBeLessThan(expandedGuideLeft - 12)

    await page.mouse.up()
  })

  test("table column resize는 desktop writer readable width budget을 넘지 않는다", async ({
    page,
  }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    await firstHeaderCell.click()
    await firstHeaderCell.hover()

    const beforeWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )

    for (let index = 0; index < 6; index += 1) {
      await page.getByRole("button", { name: "QA 열 리사이즈" }).click()
    }

    const widthShape = await page.evaluate(() => {
      const contentRoot = document.querySelector<HTMLElement>(".aq-block-editor__content")
      const wrapper = document.querySelector<HTMLElement>(".aq-block-editor__content .tableWrapper")
      const table = wrapper?.querySelector<HTMLElement>("table")
      const firstCell = table?.querySelector<HTMLElement>("th, td")
      if (!contentRoot || !wrapper || !table || !firstCell) return null
      return {
        contentWidth: Math.round(contentRoot.getBoundingClientRect().width),
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
        firstCellWidth: Math.round(firstCell.getBoundingClientRect().width),
      }
    })

    expect(widthShape).not.toBeNull()
    if (!widthShape) {
      throw new Error("table width shape is missing")
    }

    expect(Math.abs(widthShape.wrapperWidth - widthShape.tableWidth)).toBeLessThanOrEqual(2)
    expect(widthShape.tableWidth).toBeLessThanOrEqual(widthShape.contentWidth + 2)
    expect(widthShape.firstCellWidth).toBeGreaterThanOrEqual(beforeWidth)
  })
})
