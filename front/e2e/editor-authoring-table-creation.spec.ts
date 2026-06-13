import { expect, test } from "./helpers/authoringPlaywright"
import {
  QA_ENGINE_ROUTE,
  selectWordInEditable,
} from "./helpers/editorAuthoringFlow"

test.describe("editor authoring table creation", () => {
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
    await page.goto(QA_ENGINE_ROUTE)

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

  test("공개 상세 텍스트 선택 툴바가 scroll 동안 stale viewport 좌표에 고정되지 않는다", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const markdown = Array.from({ length: 18 }, (_, index) =>
      index === 11
        ? "스크롤 중에도 버블앵커가 본문 selection을 따라가야 한다."
        : `긴 본문 ${index + 1}. 버블 툴바 scroll anchor 회귀를 확인하기 위한 충분히 긴 문단입니다. `.repeat(3).trim()
    ).join("\n\n")
    const seed = encodeURIComponent(markdown.replace(/\n/g, "\\n"))

    await page.goto(`${QA_ENGINE_ROUTE}&seed=${seed}`)

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.evaluate((element, targetWord) => {
      const root = element as HTMLElement
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
      while (walker.nextNode()) {
        const current = walker.currentNode as Text
        if (!current.data.includes(targetWord)) continue
        ;(current.parentElement || root).scrollIntoView({ block: "center" })
        return
      }
      throw new Error(`could not find target word: ${targetWord}`)
    }, "버블앵커")

    await selectWordInEditable(page, editor, "버블앵커")
    const textBubbleToolbar = page.getByTestId("editor-text-bubble-toolbar")
    if ((await textBubbleToolbar.count()) === 0) {
      await selectWordInEditable(page, editor, "버블앵커")
    }
    await expect(textBubbleToolbar).toBeVisible()

    const beforeScrollBox = await textBubbleToolbar.boundingBox()
    if (!beforeScrollBox) {
      throw new Error("text bubble toolbar metrics are missing before scroll")
    }

    await page.evaluate(() => {
      window.scrollBy(0, 180)
    })
    await page.waitForTimeout(120)

    await expect(textBubbleToolbar).toBeVisible()
    const afterScrollBox = await textBubbleToolbar.boundingBox()
    if (!afterScrollBox) {
      throw new Error("text bubble toolbar metrics are missing after scroll")
    }

    expect(Math.abs(afterScrollBox.y - beforeScrollBox.y)).toBeGreaterThan(40)
  })
})
