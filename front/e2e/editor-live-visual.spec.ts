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

  test("실제 /editor/new는 제품 셸 기준으로 제목/본문 정렬을 유지하고 QA affordance를 노출하지 않는다", async ({
    page,
  }) => {
    test.slow()
    await page.setViewportSize({ width: 1512, height: 982 })
    await loginThroughUi(page)

    await page.goto("/editor/new")
    await page.waitForURL(/\/editor(\/|$)/, { timeout: 30000 })
    await expect(page.getByTestId("editor-writing-column")).toBeVisible()
    await expect(page.getByTestId("editor-preview-column")).toHaveCount(0)
    await expect(page.getByText("BlockEditorShell 엔진 QA")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "제목 1" })).toBeVisible()
    await expect(page.getByPlaceholder("제목을 입력하세요").first()).toBeVisible()

    await page.getByPlaceholder("제목을 입력하세요").first().fill("실화면 회귀 점검 제목")

    const editor = page.getByTestId("block-editor-prosemirror").first()
    await editor.click()
    await page.getByRole("button", { name: "제목 1" }).click()
    await page.keyboard.type("헤딩 정렬 확인")
    await page.keyboard.press("Enter")
    await page.keyboard.type("본문 정렬 확인")

    const heading = editor.locator(".aq-block-editor__content h1").first()
    const paragraph = editor.locator(".aq-block-editor__content p").filter({ hasText: "본문 정렬 확인" }).first()
    await expect(heading).toBeVisible()
    await expect(paragraph).toBeVisible()

    const headingStyle = await heading.evaluate((node) => {
      const style = window.getComputedStyle(node)
      return {
        textAlign: style.textAlign,
      }
    })
    expect(headingStyle.textAlign).toBe("left")

    const headingBox = await heading.boundingBox()
    const paragraphBox = await paragraph.boundingBox()
    expect(headingBox).not.toBeNull()
    expect(paragraphBox).not.toBeNull()
    if (!headingBox || !paragraphBox) return

    expect(Math.abs(headingBox.x - paragraphBox.x)).toBeLessThanOrEqual(4)
  })
})
