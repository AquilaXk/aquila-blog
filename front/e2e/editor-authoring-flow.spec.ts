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
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("인라인 수식 대상")

    await page.evaluate(() => {
      const paragraph = document.querySelector(".aq-block-editor__content p")
      const textNode = paragraph?.firstChild
      if (!paragraph || !textNode || textNode.nodeType !== Node.TEXT_NODE) return
      const text = textNode.textContent || ""
      const start = text.indexOf("수식")
      if (start < 0) return

      const range = document.createRange()
      range.setStart(textNode, start)
      range.setEnd(textNode, start + "수식".length)
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    const inlineFormulaButton = page.getByRole("button", { name: "인라인 수식" })
    if (!(await inlineFormulaButton.isVisible().catch(() => false))) {
      await page.locator("summary[aria-label='추가 도구']").click()
    }
    await page.getByRole("button", { name: "인라인 수식" }).click()
    await expect(page.getByTestId("qa-markdown-output")).toContainText("인라인 $수식$ 대상")

    await page.getByRole("button", { name: "콜아웃" }).click()
    await page.getByRole("button", { name: "테이블" }).click()
    await page.getByRole("button", { name: "수식" }).click()

    const attachmentInput = page.locator("input[type='file']").nth(1)
    await attachmentInput.setInputFiles({
      name: "architecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 qa-architecture"),
    })

    const firstTableCell = page.locator("table th, table td").first()
    await firstTableCell.click()
    await page.getByRole("button", { name: "열 선택" }).click()
    await page.getByRole("button", { name: "가운데" }).click()
    await page.getByRole("button", { name: "노랑 배경" }).click()

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("> [!TIP] 핵심 포인트")
    await expect(markdownOutput).toContainText("$$")
    await expect(markdownOutput).toContainText(":::file https://example.com/files/architecture.pdf")
    await expect(markdownOutput).toContainText('"mimeType":"application/pdf"')
    await expect(markdownOutput).toContainText('"columnAlignments":["center",null]')
    await expect(markdownOutput).toContainText('"backgroundColor":"#fef3c7"')
  })
})
