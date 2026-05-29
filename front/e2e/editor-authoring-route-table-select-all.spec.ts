import { expect, test } from "@playwright/test"
import { expectEditorToContainLoadedText, getTableAffordances } from "./helpers/editorAuthoringFlow"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

test.describe("editor authoring route table select all", () => {
  test("실제 /editor/[id] table cell에서 첫 Cmd/Ctrl+A는 현재 테이블 전체 셀 텍스트를 선택한다", async ({
    page,
  }) => {
    const leadLabel = "table select all lead paragraph"
    const tailLabel = "table select all trailing paragraph"
    const tableContent = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
      "| **영역** | **점검 항목** | **확인 기준** |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access Token | 역할 명확 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      `${leadLabel}. 첫 Cmd/Ctrl+A에서 editor 전체가 아니라 table 범위만 선택되어야 합니다.`,
      tableContent,
      `${tailLabel}. table 바깥 본문은 첫 Cmd/Ctrl+A 선택 범위에 포함되면 안 됩니다.`,
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/994", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 994,
          version: 3,
          title: "table select all live route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/994")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("table select all live route 글")
    await expectEditorToContainLoadedText(editor, "Access Token")

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 24, y: 16 },
    })
    await targetCell.dblclick({
      position: { x: 40, y: 16 },
    })

    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(360)

    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(selectionText).toContain("영역")
    expect(selectionText).toContain("점검 항목")
    expect(selectionText).toContain("확인 기준")
    expect(selectionText).toContain("Access Token")
    expect(selectionText).toContain("구현되어 있는가")
    expect(selectionText).not.toContain("table select all lead paragraph")
    expect(selectionText).not.toContain("table select all trailing paragraph")
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
  })

  test("실제 /editor/[id] table 행 핸들을 클릭하면 행 overlay/menu가 표시되어야 한다", async ({
    page,
  }) => {
    const leadLabel = "table row handle lead paragraph"
    const tailLabel = "table row handle trailing paragraph"
    const tableContent = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
      "| **영역** | **점검 항목** | **확인 기준** |",
      "| --- | --- | --- |",
      "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
      "| 토큰 구조 | Access Token | 역할 명확 |",
      "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
    ].join("\n")
    const content = [
      `${leadLabel}. 행 핸들이 행 선택으로 이어져야 합니다.`,
      tableContent,
      `${tailLabel}. 행 선택 핸들 동작 실패 여부를 확인합니다.`,
    ].join("\n\n")
    const rowId = 996

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route(`**/post/api/v1/adm/posts/${rowId}`, async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: rowId,
          version: 3,
          title: "table row handle live route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto(`/editor/${rowId}`)
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("table row handle live route 글")
    await expectEditorToContainLoadedText(editor, "Access Token")

    const rowAffordances = getTableAffordances(page)
    const rowHandle = rowAffordances.rowHandle

    const firstTableCell = editor.locator("table th, table td").first()
    await firstTableCell.click({ position: { x: 24, y: 16 } })
    const table = editor.locator("table").first()
    const tableRect = await table.boundingBox()
    const firstCellRect = await firstTableCell.boundingBox()
    if (!tableRect || !firstCellRect) {
      throw new Error("table row handle target metrics are missing")
    }

    await page.mouse.move(tableRect.x + 2, firstCellRect.y + firstCellRect.height / 2)
    await expect(rowHandle).toBeVisible({ timeout: 10_000 })
    const rowHandleRect = await rowHandle.boundingBox()
    if (!rowHandleRect || rowHandleRect.width <= 0 || rowHandleRect.height <= 0) {
      throw new Error("row handle metrics are invalid")
    }

    await page.mouse.click(
      rowHandleRect.x + rowHandleRect.width / 2,
      rowHandleRect.y + rowHandleRect.height / 2
    )
    await expect(page.getByTestId("table-row-selection-outline")).toBeVisible()
    const rowMenu = page.getByTestId("table-row-menu")
    await expect(rowMenu).toBeVisible()
    await expect(rowMenu.getByRole("button", { name: "행 삭제" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(rowMenu).toHaveCount(0)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({ position: { x: 24, y: 16 } })
    await page.keyboard.press(process.platform === "darwin" ? "Meta+a" : "Control+a")
    await page.waitForTimeout(260)
    const selectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(selectionText).toContain("개념 이해")
    expect(selectionText).toContain("Access Token")
    expect(selectionText).not.toContain(leadLabel)
    expect(selectionText).not.toContain(tailLabel)
  })
})
