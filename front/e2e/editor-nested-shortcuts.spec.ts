import { expect, test } from "@playwright/test"

const QA_ENGINE_ROUTE = "/_qa/block-editor-slash?surface=engine"
const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

test.describe("editor nested shortcuts", () => {
  test("코드 블록 내부 Cmd/Ctrl+A는 현재 코드 블록 내용만 선택한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "코드", exact: true }).click()

    const codeEditorContent = page.locator(".aq-code-editor-content").first()
    await expect(codeEditorContent).toBeVisible()
    await codeEditorContent.click()
    await page.keyboard.type("const before = 1")
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    await expect
      .poll(() =>
        codeEditorContent.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toBe("const before = 1")
  })

  test("콜아웃 본문 내부 Cmd/Ctrl+A는 현재 콜아웃 본문만 선택한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("앞 문단")
    await page.keyboard.press("Enter")
    await page.getByRole("button", { name: "QA 콜아웃" }).click()

    const calloutBodyContent = page.locator("[data-callout-body-content='true']").first()
    await expect(calloutBodyContent).toBeVisible()
    await calloutBodyContent.click()
    await page.keyboard.type("콜아웃 기존 본문")
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    await expect
      .poll(() =>
        calloutBodyContent.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toContain("콜아웃 기존 본문")
  })

  test("일반 본문 Cmd/Ctrl+A는 전체 문서를 선택한다", async ({ page }) => {
    await page.goto(QA_ENGINE_ROUTE)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("첫 문단")
    await page.keyboard.press("Enter")
    await page.keyboard.type("둘째 문단")
    await page.keyboard.press(SELECT_ALL_SHORTCUT)

    await expect
      .poll(() =>
        editor.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toContain("첫 문단")
    await expect
      .poll(() =>
        editor.evaluate(() => {
          const selection = window.getSelection()
          return selection ? selection.toString() : ""
        })
      )
      .toContain("둘째 문단")
  })
})
