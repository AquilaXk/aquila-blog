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
})
