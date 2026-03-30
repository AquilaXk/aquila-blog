import { expect, test } from "@playwright/test"

const adminEmail = process.env.E2E_ADMIN_EMAIL?.trim() || ""
const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
const hasUiLoginCredentials = Boolean(adminEmail && adminPassword)

const loginThroughUi = async (page: Parameters<typeof test>[0]["page"]) => {
  await page.goto("/login?next=%2Feditor%2Fnew")

  if (/\/editor(\/|$)/.test(page.url())) return

  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
  await page.getByLabel("이메일").fill(adminEmail)
  await page.locator("#password").fill(adminPassword)
  await page.getByRole("button", { name: "로그인", exact: true }).click()
  await page.waitForURL(/\/(admin|editor)(\/|$)/, { timeout: 30000 })
}

test.describe("editor live visual regression", () => {
  test.skip(!hasUiLoginCredentials, "E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD가 필요합니다.")

  test("split 미리보기는 좌우 패널이 겹치지 않고 헤더 썸네일을 숨기며 인용구 카드 톤을 유지한다", async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1752, height: 1000 })
    await loginThroughUi(page)

    await page.goto("/editor/new")
    await page.waitForURL(/\/editor(\/|$)/, { timeout: 30000 })
    await expect(page.getByTestId("editor-writing-column")).toBeVisible()
    await expect(page.getByTestId("editor-preview-column")).toBeVisible()

    await page.getByPlaceholder("제목을 입력하세요").first().fill("실화면 회귀 점검 제목")

    const editor = page.getByTestId("block-editor-prosemirror").first()
    await editor.click()
    await page.keyboard.type("인용 스타일 동기화를 확인합니다.")
    await page.getByRole("button", { name: "인용문" }).first().click()

    const previewQuote = page.getByTestId("editor-preview-body").locator("blockquote").first()
    await expect(previewQuote).toBeVisible()
    await expect(page.getByTestId("editor-preview-column")).not.toContainText("실화면 회귀 점검 제목")
    await expect(page.getByTestId("editor-preview-column").locator(".thumbnail")).toHaveCount(0)

    const writingBox = await page.getByTestId("editor-writing-column").boundingBox()
    const previewBox = await page.getByTestId("editor-preview-column").boundingBox()
    expect(writingBox).not.toBeNull()
    expect(previewBox).not.toBeNull()
    if (!writingBox || !previewBox) return

    expect(writingBox.x + writingBox.width).toBeLessThanOrEqual(previewBox.x + 1)

    const editorQuote = page.getByTestId("block-editor-prosemirror").locator("blockquote").first()
    await expect(editorQuote).toBeVisible()

    const editorQuoteStyle = await editorQuote.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        backgroundColor: style.backgroundColor,
        borderLeftWidth: Number.parseFloat(style.borderLeftWidth || "0"),
        borderRadius: Number.parseFloat(style.borderRadius || "0"),
      }
    })
    const previewQuoteStyle = await previewQuote.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        backgroundColor: style.backgroundColor,
        borderLeftWidth: Number.parseFloat(style.borderLeftWidth || "0"),
        borderRadius: Number.parseFloat(style.borderRadius || "0"),
      }
    })

    expect(editorQuoteStyle.borderLeftWidth).toBeGreaterThanOrEqual(4)
    expect(editorQuoteStyle.borderRadius).toBeGreaterThan(0)
    expect(previewQuoteStyle.borderLeftWidth).toBeGreaterThanOrEqual(4)
    expect(previewQuoteStyle.borderRadius).toBeGreaterThan(0)
    expect(previewQuoteStyle.backgroundColor).not.toBe("rgba(0, 0, 0, 0)")
    expect(previewQuoteStyle.backgroundColor).toBe(editorQuoteStyle.backgroundColor)
  })
})
