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
    const quoteIndex = markdown.indexOf("> 인용문")
    const secondLineIndex = markdown.indexOf("둘째 줄")

    expect(firstLineIndex).toBeGreaterThanOrEqual(0)
    expect(quoteIndex).toBeGreaterThan(firstLineIndex)
    expect(secondLineIndex).toBeGreaterThan(quoteIndex)
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
    await page.getByRole("button", { name: "굵게" }).first().click()

    await selectWordInEditable(page, calloutBodyContent, "코드")
    await page.getByRole("button", { name: "인라인 코드", exact: true }).first().click()

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
    await page.mouse.move(points.endX, points.endY, { steps: 8 })
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

    await expect(page.getByTestId("table-column-rail")).toBeVisible()
    await expect(page.getByTestId("table-row-rail")).toBeVisible()
    await expect(page.getByTestId("table-corner-handle")).toBeVisible()
    await expect(page.getByTestId("table-bubble-toolbar")).toHaveCount(0)
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)

    const tableWidthShape = await page.evaluate(() => {
      const wrapper = document.querySelector<HTMLElement>(
        ".aq-block-editor__content .tableWrapper"
      )
      const table = wrapper?.querySelector<HTMLElement>("table")
      if (!wrapper || !table) return null
      return {
        wrapperWidth: Math.round(wrapper.getBoundingClientRect().width),
        tableWidth: Math.round(table.getBoundingClientRect().width),
      }
    })
    expect(tableWidthShape).not.toBeNull()
    if (!tableWidthShape) {
      throw new Error("table wrapper/table width shape is missing")
    }
    expect(Math.abs(tableWidthShape.wrapperWidth - tableWidthShape.tableWidth)).toBeLessThanOrEqual(2)

    await page.getByTestId("table-row-rail").getByRole("button", { name: "행 선택" }).click()
    await expect(page.getByTestId("table-row-menu")).toBeVisible()
    await page.getByTestId("table-row-menu").getByRole("button", { name: "아래에 삽입" }).click()
    await expect(page.locator("table tr")).toHaveCount(3)
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

  test("table QA actions로 열/행 추가와 삭제가 round-trip 된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    await page.getByRole("button", { name: "테이블" }).click()
    const firstCell = page.locator("table th, table td").first()
    await firstCell.click()

    await page.getByRole("button", { name: "QA 행 추가" }).click()
    await page.getByRole("button", { name: "QA 열 추가" }).click()
    await expect(page.locator("table tr")).toHaveCount(3)
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(3)

    await page.getByRole("button", { name: "QA 열 선택" }).click()
    await page.getByRole("button", { name: "QA 열 삭제" }).click()
    await expect(page.locator("table tr").first().locator("th, td")).toHaveCount(2)

    await firstCell.click()
    await page.getByRole("button", { name: "QA 행 삭제" }).click()
    await expect(page.locator("table tr")).toHaveCount(2)
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

    const beforeWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )
    await page.getByRole("button", { name: "QA 열 리사이즈" }).click()

    await expect
      .poll(async () =>
        firstHeaderCell.evaluate((element) =>
          Math.round((element as HTMLElement).getBoundingClientRect().width)
        )
      )
      .toBeGreaterThan(beforeWidth)
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"columnWidths"')
  })
})
