import { expect, test } from "@playwright/test"

const QA_ENGINE_ROUTE = "/_qa/block-editor-slash?surface=engine"

test.describe("editor nested paste", () => {
  test("빈 콜아웃 본문 html paste는 현재 콜아웃에 유지된다", async ({ page }) => {
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

  test("빈 코드 블록 html paste는 현재 코드 블록에 유지된다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "코드", exact: true }).click()

    const codeEditorContent = page.locator(".aq-code-editor-content").first()
    await expect(codeEditorContent).toBeVisible()
    await codeEditorContent.click()

    await codeEditorContent.evaluate((element) => {
      const data = new DataTransfer()
      data.setData("text/plain", "const pasted = 1")
      data.setData("text/html", "<pre><code>const pasted = 1</code></pre>")
      const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true })
      Object.defineProperty(event, "clipboardData", { value: data })
      element.dispatchEvent(event)
    })

    const markdownOutput = page.getByTestId("qa-markdown-output")
    await expect(markdownOutput).toContainText("```text")
    await expect(markdownOutput).toContainText("const pasted = 1")

    const markdownRaw = (await markdownOutput.textContent()) || ""
    expect(markdownRaw).toContain("```text\nconst pasted = 1\n```")
    expect(markdownRaw).not.toContain("\n\nconst pasted = 1\n")
  })
})
