import { expect, test, type Page } from "@playwright/test"
import { expectEditorToContainLoadedText } from "./helpers/editorAuthoringFlow"
import { editorSevenByThreeTableMarkdown } from "./helpers/editorTableFixtures"

const SELECT_ALL_SHORTCUT = process.platform === "darwin" ? "Meta+a" : "Control+a"
const TABLE_SELECT_ALL_EXAMPLE = editorSevenByThreeTableMarkdown

const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}
const blurTableCellByKeyboard = async (page: Page, maxAttempts = 28) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await page.keyboard.press("Tab")
    await page.waitForTimeout(80)
    const inTableCell = await page.evaluate(
      () => Boolean(document.activeElement?.closest("th, td"))
    )
    if (!inTableCell) {
      return true
    }
  }
  return false
}

const expectNativeSelectionAnchoredInParagraph = async (
  page: Page,
  paragraphText: string
) => {
  await expect
    .poll(async () =>
      page.evaluate((expectedText) => {
        const selection = window.getSelection()
        const anchorElement =
          selection?.anchorNode instanceof Element
            ? selection.anchorNode
            : selection?.anchorNode?.parentElement ?? null
        const focusElement =
          selection?.focusNode instanceof Element
            ? selection.focusNode
            : selection?.focusNode?.parentElement ?? null
        return Boolean(
          anchorElement?.closest("p")?.textContent?.includes(expectedText) &&
            focusElement?.closest("p")?.textContent?.includes(expectedText)
        )
      }, paragraphText)
    )
    .toBe(true)
}

const expectSevenByThreeTableShape = async (page: Page) => {
  const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
  await expect(editor.locator("table tr")).toHaveCount(7)
  await expect(editor.locator("table tr").first().locator("th, td")).toHaveCount(3)
}

test.describe("editor authoring route table select all", () => {
  test("실제 /editor/[id] table cell에서 첫 Cmd/Ctrl+A는 현재 테이블 전체 셀 텍스트를 선택한다", async ({
    page,
  }) => {
    const leadLabel = "table select all lead paragraph"
    const tailLabel = "table select all trailing paragraph"
    const tableContent = TABLE_SELECT_ALL_EXAMPLE
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
    await expectSevenByThreeTableShape(page)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 40, y: 16 },
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
    const content = [
      "table select all repeat lead paragraph",
      TABLE_SELECT_ALL_EXAMPLE,
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
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "table select all repeat route 글"
    )
    await expectSevenByThreeTableShape(page)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 40, y: 16 },
    })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(280)
    const firstSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")
    expect(firstSelectionText).toContain("영역")
    expect(firstSelectionText).toContain("점검 항목")
    expect(firstSelectionText).toContain("확인 기준")

    await targetCell.dblclick({
      position: { x: 40, y: 16 },
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
      TABLE_SELECT_ALL_EXAMPLE,
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
    await expectSevenByThreeTableShape(page)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 40, y: 16 },
    })

    const table = editor.locator("table").first()
    const tableBox = await table.boundingBox()
    const targetCellBox = await targetCell.boundingBox()
    if (!tableBox || !targetCellBox) {
      throw new Error("table select-all row handle test: table or target cell bounding box is missing")
    }
    const rowHandleCandidates = [
      { x: tableBox.x + 3, y: targetCellBox.y + targetCellBox.height / 2 },
      { x: tableBox.x + 3, y: tableBox.y + 24 },
      { x: tableBox.x + 3, y: tableBox.y + tableBox.height / 2 - 10 },
      { x: targetCellBox.x + 3, y: targetCellBox.y + targetCellBox.height / 2 },
      { x: tableBox.x + 3, y: tableBox.y + tableBox.height / 2 },
    ]
    const rowHandle = page.locator("[data-table-affordance='row-handle']")
    for (const { x, y } of rowHandleCandidates) {
      await page.mouse.move(x, y)
      await page.waitForTimeout(120)
      if (await rowHandle.count() > 0) {
        break
      }
    }
    if (await rowHandle.count() > 0) {
      await rowHandle.first().click({ force: true })
    }

    await page.keyboard.press("Escape")
    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })

    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(240)
    const rowHandleSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")

    expect(rowHandleSelectionText).toContain("영역")
    expect(rowHandleSelectionText).toContain("점검 항목")
    expect(rowHandleSelectionText).toContain("확인 기준")
    expect(rowHandleSelectionText).toContain("Access Token")
    expect(rowHandleSelectionText).toContain("구현되어 있는가")
    expect(rowHandleSelectionText).not.toContain("table select all row handle lead paragraph")
    expect(rowHandleSelectionText).not.toContain("table select all row handle trailing paragraph")
  })

  test("키보드 포커스 이탈 후에도 table 내부 Cmd/Ctrl+A가 table 전체 텍스트를 선택한다", async ({
    page,
  }) => {
    const content = [
      "table select all keyboard focus escape lead paragraph",
      TABLE_SELECT_ALL_EXAMPLE,
      "table select all keyboard focus escape trailing paragraph",
    ].join("\n\n")

    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(adminMember),
      })
    })
    await page.route("**/post/api/v1/adm/posts/998", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: 998,
          version: 1,
          title: "table select all keyboard focus escape route 글",
          content,
          contentHtml: null,
          published: true,
          listed: true,
        }),
      })
    })

    await page.goto("/editor/998")
    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue(
      "table select all keyboard focus escape route 글"
    )
    await expectSevenByThreeTableShape(page)

    const targetCell = editor.locator("td", { hasText: "Access Token" }).first()
    await targetCell.click({
      position: { x: 40, y: 16 },
    })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })
    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(240)
    const firstSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")

    expect(firstSelectionText).toContain("영역")
    expect(firstSelectionText).toContain("확인 기준")
    expect(firstSelectionText).not.toContain(
      "table select all keyboard focus escape lead paragraph"
    )
    expect(firstSelectionText).not.toContain(
      "table select all keyboard focus escape trailing paragraph"
    )

    const blurred = await blurTableCellByKeyboard(page)
    expect(blurred).toBeTruthy()

    const leadParagraph = editor.locator("p", {
      hasText: "table select all keyboard focus escape lead paragraph",
    }).first()
    await leadParagraph.click()
    await expectNativeSelectionAnchoredInParagraph(
      page,
      "table select all keyboard focus escape lead paragraph"
    )
    await expect(editor.locator(".selectedCell")).toHaveCount(0)
    await expect
      .poll(async () =>
        page.evaluate(() =>
          Boolean(
            document.documentElement.getAttribute("data-table-drag-selection-text")?.trim() ||
              document.querySelector("[data-table-drag-selection-text]")
          )
        )
      )
      .toBe(false)

    await targetCell.click({ position: { x: 40, y: 16 } })
    await targetCell.dblclick({ position: { x: 40, y: 16 } })

    await page.keyboard.press(SELECT_ALL_SHORTCUT)
    await page.waitForTimeout(240)
    const secondSelectionText = await page.evaluate(() => window.getSelection()?.toString() ?? "")

    expect(secondSelectionText).toContain("영역")
    expect(secondSelectionText).toContain("확인 기준")
    expect(secondSelectionText).toContain("Access Token")
    expect(secondSelectionText).not.toContain(
      "table select all keyboard focus escape lead paragraph"
    )
    expect(secondSelectionText).not.toContain(
      "table select all keyboard focus escape trailing paragraph"
    )
  })
})
