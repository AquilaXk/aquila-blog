import { expect, test } from "@playwright/test"

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
    await page.goto("/_qa/block-editor-slash")

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
    await page.getByRole("button", { name: "QA 수식" }).click()

    const attachmentInput = page.getByTestId("editor-attachment-file-input")
    await attachmentInput.setInputFiles({
      name: "architecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 qa-architecture"),
    })

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP] 핵심 포인트")
    await expect(markdownOutput).toContainText("$수식$")
    await expect(markdownOutput).toContainText(":::file https://example.com/files/architecture.pdf")
    await expect(markdownOutput).toContainText('"mimeType":"application/pdf"')
    await expect(markdownOutput).toContainText('"columnAlignments":["center"]')
    await expect(markdownOutput).toContainText('"backgroundColor":"#fef3c7"')
  })

  test("블록 핸들 + 메뉴 삽입은 hover 블록 기준을 유지한다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 줄")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 줄")

    const firstParagraph = editor.locator("p").first()
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

  test("블록 드래그 시 source/destination 피드백이 동시에 보인다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

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
    await expect(page.getByTestId("block-drop-target-highlight").first()).toBeVisible()

    await page.mouse.up()
  })

  test("table mode에서는 block rail이 숨고 table quick rail/toolbar가 유지된다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    await page.getByRole("button", { name: "테이블" }).click()

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await firstTableCell.hover()
    await page.getByRole("button", { name: "QA 열 선택" }).click()

    await expect(page.getByTestId("table-column-rail")).toBeVisible()
    await expect(page.getByTestId("table-row-rail")).toBeVisible()
    await expect(page.getByTestId("table-bubble-toolbar")).toBeVisible()
    await expect(page.getByTestId("block-drag-handle")).toHaveCount(0)

    const toolbar = page.getByTestId("table-bubble-toolbar")
    await toolbar.hover()
    await expect(toolbar).toBeVisible()

    await page.getByRole("button", { title: "행 추가" }).click()
    await expect(page.locator("table tr")).toHaveCount(3)
  })

  test("table QA actions로 열/행 추가와 삭제가 round-trip 된다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

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
    await page.goto("/_qa/block-editor-slash")

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()
    const beforeHeight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
    )
    await page.getByRole("button", { name: "QA 행 리사이즈" }).click()

    const afterHeight = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).closest("tr")!.getBoundingClientRect().height)
    )

    expect(afterHeight).toBeGreaterThan(beforeHeight)
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"rowHeights"')
  })

  test("table column resize handle은 drag 후 column width 메타를 유지한다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    await page.getByRole("button", { name: "테이블" }).click()
    const firstHeaderCell = page.locator("table th").first()

    const beforeWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )
    await page.getByRole("button", { name: "QA 열 리사이즈" }).click()

    const afterWidth = await firstHeaderCell.evaluate((element) =>
      Math.round((element as HTMLElement).getBoundingClientRect().width)
    )

    expect(afterWidth).toBeGreaterThan(beforeWidth)
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"columnWidths"')
  })
})
