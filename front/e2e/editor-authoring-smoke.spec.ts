import { expect, test } from "./helpers/authoringPlaywright"
import {
  QA_ENGINE_ROUTE,
  UNDO_SHORTCUT,
  selectWordInEditable,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring integrated smoke", () => {
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
    await page.getByRole("button", { name: "QA fallback 열 선택" }).click()
    await page.getByRole("button", { name: "QA 가운데" }).click()
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"columnAlignments":["center"]')
    await page.getByRole("button", { name: "QA 노랑 배경" }).click()
    await expect(page.getByTestId("qa-markdown-output")).toContainText('"backgroundColor":"#fef3c7"')
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

  test("기존 draft 편집 후 외부 글 선택 직후 Cmd/Ctrl+Z는 선택 글 본문을 비우지 않는다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const markdownOutput = page.getByTestId("qa-markdown-output")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("선택 전 draft")
    await expect(markdownOutput).toContainText("선택 전 draft")

    await page.getByRole("button", { name: "QA 외부 글 선택" }).click()
    await expect(markdownOutput).toContainText("# 선택 글 제목")
    await expect(markdownOutput).toContainText("선택 글 본문")
    await expect
      .poll(() =>
        page.evaluate(() => (window as Window & { __qaGetUndoDepth?: () => number }).__qaGetUndoDepth?.() ?? -1)
      )
      .toBe(0)

    await editor.click()
    await page.keyboard.press(UNDO_SHORTCUT)

    await expect(markdownOutput).toContainText("# 선택 글 제목")
    await expect(markdownOutput).toContainText("선택 글 본문")
    await expect(markdownOutput).not.toContainText("선택 전 draft")
    await expect(markdownOutput).not.toContainText("(empty)")
  })
})
