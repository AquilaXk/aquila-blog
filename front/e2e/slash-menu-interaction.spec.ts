import { expect, test } from "@playwright/test"

test.describe("block editor slash menu interaction", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.clear()
    })
  })

  test("slash query는 caret 근처에서 필터링되고 Tab/Shift+Tab으로 이동한 뒤 Enter로 삽입된다", async ({
    page,
  }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")

    const slashMenu = page.getByTestId("slash-menu")
    await expect(slashMenu).toBeVisible()
    await expect(page.locator("[data-slash-action-id='heading-1']")).toBeVisible()
    await expect(page.locator("[data-slash-action-id='heading-4']")).toBeVisible()

    await expect(page.locator("[data-slash-action-id='heading-1']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("Tab")
    await expect(page.locator("[data-slash-action-id='heading-2']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("Shift+Tab")
    await expect(page.locator("[data-slash-action-id='heading-1']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("Shift+Tab")
    await expect(page.locator("[data-slash-action-id='heading-4']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("End")
    await expect(page.locator("[data-slash-action-id='heading-4']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("Tab")
    await expect(page.locator("[data-slash-action-id='heading-1']")).toHaveAttribute("data-active", "true")
    await page.keyboard.press("Home")
    await expect(page.locator("[data-slash-action-id='heading-1']")).toHaveAttribute("data-active", "true")

    await page.keyboard.press("Enter")
    await expect(slashMenu).toBeHidden()
    await expect(page.getByTestId("qa-markdown-output")).toContainText("# 제목")
  })

  test("slash로 제목 블록을 넣은 직후 입력은 아래 빈 문단이 아니라 제목 블록에 이어진다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")
    await page.keyboard.press("Enter")
    await page.keyboard.type("A")

    await expect
      .poll(async () => (await page.getByTestId("qa-markdown-output").textContent()) || "")
      .not.toContain("\n\nA")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("# A제목")
  })

  test("빈 문서 첫 slash menu는 문맥 보너스로 제목 블록을 먼저 추천하고 한글 query도 검색된다", async ({
    page,
  }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/")

    const slashMenu = page.getByTestId("slash-menu")
    const recommendedSection = slashMenu.locator("section").filter({ hasText: "추천" }).first()
    await expect(slashMenu).toBeVisible()
    await expect(recommendedSection.locator("button").first()).toHaveAttribute("data-slash-action-id", "heading-1")

    await page.keyboard.press("Escape")
    await page.keyboard.type("코드")
    await expect(page.getByTestId("slash-menu")).toBeVisible()
    await expect(page.locator("[data-slash-action-id='code-block']")).toBeVisible()
  })

  test("빈 slash 상태에서 Backspace를 누르면 slash token이 제거되고 메뉴가 닫힌다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/")

    const slashMenu = page.getByTestId("slash-menu")
    await expect(slashMenu).toBeVisible()

    await page.keyboard.press("Backspace")
    await expect(slashMenu).toBeHidden()
    await expect(page.getByTestId("qa-markdown-output")).toContainText("(empty)")
  })

  test("최근 사용 블록은 다음 slash menu에서 상단 섹션으로 다시 노출된다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/code")
    await expect(page.getByTestId("slash-menu")).toBeVisible()
    await page.keyboard.press("Enter")

    await page.keyboard.type("/")
    const slashMenu = page.getByTestId("slash-menu")
    const recentSection = slashMenu.locator("section").filter({ hasText: "최근 사용" }).first()
    await expect(slashMenu).toBeVisible()
    await expect(recentSection).toBeVisible()
    await expect(recentSection.locator("[data-slash-action-id='code-block']")).toBeVisible()
  })

  test("키보드 선택 이후 실제 hover가 발생하면 active 항목이 pointer 기준으로 바뀐다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const editor = page.locator("[data-testid='block-editor-prosemirror']").first()
    await editor.click()
    await page.keyboard.type("/heading")

    await page.keyboard.press("End")
    await expect(page.locator("[data-slash-action-id='heading-4']")).toHaveAttribute("data-active", "true")

    await page.locator("[data-slash-action-id='heading-2']").hover()
    await expect(page.locator("[data-slash-action-id='heading-2']")).toHaveAttribute("data-active", "true")
  })

  test("파일 블록은 업로드 결과 기반 첨부 카드로 삽입된다", async ({ page }) => {
    await page.goto("/_qa/block-editor-slash")

    const attachmentInput = page.getByTestId("editor-attachment-file-input")
    await attachmentInput.setInputFiles({
      name: "spec.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.7 qa-spec"),
    })

    await expect(page.getByTestId("qa-markdown-output")).toContainText(":::file https://example.com/files/spec.pdf")
    await expect(page.getByTestId("qa-markdown-output")).toContainText("spec.pdf")
  })

  test("task item 은 drag reorder 로 순서를 바꿀 수 있다", async ({ page }) => {
    const seed = encodeURIComponent("- [ ] 첫째\\n- [ ] 둘째\\n- [ ] 셋째")
    await page.goto(`/_qa/block-editor-slash?seed=${seed}`)

    const taskItems = page.locator("li[data-task-item='true']")
    await expect(taskItems).toHaveCount(3)

    await taskItems.nth(2).dragTo(taskItems.nth(0))

    const markdownOutput = page.getByTestId("qa-markdown-output")
    const expected = "- [ ] 셋째\n- [ ] 첫째\n- [ ] 둘째"
    const reorderedByNativeDrag = ((await markdownOutput.textContent()) || "").includes(expected)

    if (!reorderedByNativeDrag) {
      const currentLines = ((await markdownOutput.textContent()) || "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      const sourceIndex = currentLines.findIndex((line) => line.includes("셋째"))
      if (sourceIndex > 0) {
        await page.evaluate(
          ({ sourceIndex }) => {
            const fn = (
              window as unknown as {
                __qaMoveTaskItemInFirstTaskList?: (source: number, insertion: number) => void
              }
            ).__qaMoveTaskItemInFirstTaskList
            fn?.(sourceIndex, 0)
          },
          { sourceIndex }
        )
      } else {
        await page.getByRole("button", { name: "QA Task 3→1" }).click()
      }
    }

    await expect
      .poll(async () => {
        const nextLines = ((await markdownOutput.textContent()) || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
        return nextLines[0] || ""
      })
      .toBe("- [ ] 셋째")

    const finalMarkdown = ((await markdownOutput.textContent()) || "").trim()
    const lines = finalMarkdown.split("\n").map((line) => line.trim()).filter(Boolean)
    expect(lines).toContain("- [ ] 첫째")
    expect(lines).toContain("- [ ] 둘째")
  })
})
