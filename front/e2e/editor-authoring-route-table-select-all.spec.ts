import { expect, test } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"

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
      "| 정책 | 재시도 정책 | idempotent 검토 여부 |",
      "| 예외 | 동시 요청 | 처리 안정성 확인 |",
      "| UI | 행 선택 | 접근성 경로 검증 |",
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

  test("table select all 반복 호출 시에도 table scope만 유지된다", async ({
    page,
  }) => {
    const selectAllReRunMarkdown = [
      '<!-- aq-table {"overflowMode":"normal","columnWidths":[119,192,210]} -->',
      "| 영역 | 점검 항목 | 확인 기준 |",
      "| --- | --- | --- |",
      "| A | B | C |",
      "| D | E | F |",
      "| G | H | I |",
      "| J | K | L |",
      "| M | N | O |",
      "| P | Q | R |",
    ].join("\n")
    const content = [
      "table select all repeat lead paragraph",
      selectAllReRunMarkdown,
      "table select all repeat trailing paragraph",
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
          version: 1,
          title: "table select all repeat route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/996")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("table select all repeat route 글")

    const targetCell = editor.locator("td", { hasText: "D" }).first()
    await targetCell.click({
      position: { x: 24, y: 16 },
    })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(280)
    const firstSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(firstSelectionText).toContain("영역")
    expect(firstSelectionText).toContain("점검 항목")
    expect(firstSelectionText).toContain("확인 기준")

    await targetCell.dblclick({
      position: { x: 24, y: 16 },
    })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(280)
    const secondSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(secondSelectionText).toContain("영역")
    expect(secondSelectionText).toContain("점검 항목")
    expect(secondSelectionText).toContain("확인 기준")
    expect(secondSelectionText).not.toContain("repeat lead paragraph")
    expect(secondSelectionText).not.toContain("repeat trailing paragraph")
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
  })

  test("table row handle 클릭 후 Cmd/Ctrl+A는 해당 table만 선택된다", async ({
    page,
  }) => {
    const content = [
      "table select all row handle lead paragraph",
      [
        "<!-- aq-table {\"overflowMode\":\"normal\",\"columnWidths\":[119,192,210]} -->",
        "| **영역** | **점검 항목** | **확인 기준** |",
        "| --- | --- | --- |",
        "| 개념 이해 | Stateless 의미 | 요청만으로 처리 가능한가 |",
        "| 토큰 구조 | Access Token | 역할 명확 |",
        "| 흐름 | 재발급 로직 | 구현되어 있는가 |",
        "| 예외 | 동시 요청 | 처리 안정성 확인 |",
        "| 정책 | 재시도 정책 | idempotent 검토 여부 |",
        "| UI | 행 선택 | 접근성 경로 검증 |",
      ].join("\n"),
      "table select all row handle trailing paragraph",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/997", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 997,
          version: 3,
          title: "table select all row handle route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/997")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "table select all row handle route 글"
    )
    await expectEditorToContainLoadedText(editor, "Access Token")

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 24, y: 16 },
    })

    const table = editor.locator("table").first()
    const tableBox = await table.boundingBox()
    if (!tableBox) {
      throw new Error("table select-all row handle test: table bounding box is missing")
    }
    await page.mouse.move(tableBox.x + 3, tableBox.y + tableBox.height / 2 - 10)
    await page.waitForTimeout(120)

    const rowHandle = page.locator("[data-table-affordance='row-handle']").first()
    await expect(rowHandle).toHaveCount(1, { timeout: 4_000 })
    await rowHandle.click({ force: true })

    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    const getSelectionText = async () => await page.evaluate(() => window.getSelection()?.toString() ?? "")
    await expect.poll(
      getSelectionText,
      { timeout: 4_000, message: "table row handle select-all should populate table text" }
    ).toContain("영역")

    const selectionText = await getSelectionText()
    expect(selectionText).toContain("영역")
    expect(selectionText).toContain("점검 항목")
    expect(selectionText).toContain("확인 기준")
    expect(selectionText).toContain("Access Token")
    expect(selectionText).toContain("구현되어 있는가")
    expect(selectionText).not.toContain("table select all row handle lead paragraph")
    expect(selectionText).not.toContain("table select all row handle trailing paragraph")
  })
})
