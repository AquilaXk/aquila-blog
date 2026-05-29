import { expect, test } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

test.describe("editor authoring route table block drag", () => {
  test("실제 /editor/[id] table block handle drag는 표 전체 block을 하단으로 이동한다", async ({
    page,
  }) => {
    const tableMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[180,180]} -->',
      "| 구분 | 값 |",
      "| --- | --- |",
      "| table-block-marker | 이동 대상 |",
    ].join("\n")
    const content = [
      "테이블 위 문단",
      tableMarkdown,
      "테이블 아래 문단",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/996", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 996,
          version: 2,
          title: "table block drag live route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/996")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("table block drag live route 글")
    await expectEditorToContainLoadedText(editor, "table-block-marker")

    const table = editor.locator(".tableWrapper table").first()
    const trailingParagraph = editor.locator(":scope > p", { hasText: "테이블 아래 문단" }).first()
    const tableBox = await table.boundingBox()
    const trailingBox = await trailingParagraph.boundingBox()
    if (!tableBox || !trailingBox) {
      throw new Error("table block drag live route 좌표를 계산할 수 없습니다.")
    }

    await page.mouse.move(tableBox.x + 24, tableBox.y + 24)
    const dragHandle = page.getByTestId("block-drag-handle")
    await expect(dragHandle).toBeVisible()
    const handleBox = await dragHandle.boundingBox()
    if (!handleBox) {
      throw new Error("table block drag live route handle 좌표를 계산할 수 없습니다.")
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down()
    await page.mouse.move(trailingBox.x + 24, trailingBox.y + trailingBox.height + 18, { steps: 10 })
    await expect(page.getByTestId("block-drag-ghost")).toBeVisible()
    await page.mouse.up()

    const blockOrder = await editor.evaluate((element) =>
      Array.from(element.children).map((child) => child.textContent?.replace(/\s+/g, " ").trim() ?? "")
    )
    const topIndex = blockOrder.findIndex((text) => text.includes("테이블 위 문단"))
    const trailingIndex = blockOrder.findIndex((text) => text.includes("테이블 아래 문단"))
    const tableIndex = blockOrder.findIndex((text) => text.includes("table-block-marker"))
    expect(topIndex).toBeGreaterThanOrEqual(0)
    expect(trailingIndex).toBeGreaterThan(topIndex)
    expect(tableIndex).toBeGreaterThan(trailingIndex)
  })
})
