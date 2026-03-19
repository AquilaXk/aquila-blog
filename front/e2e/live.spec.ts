import { expect, test } from "@playwright/test"

const adminUsername = process.env.E2E_ADMIN_USERNAME?.trim() || ""
const adminPassword = process.env.E2E_ADMIN_PASSWORD?.trim() || ""
const hasLiveCredentials = Boolean(adminUsername && adminPassword)

test.describe("live production e2e", () => {
  test.skip(!hasLiveCredentials, "E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD is required")
  test.setTimeout(120_000)

  test("비로그인 사용자는 /admin 접근 시 로그인 페이지로 이동한다", async ({ page }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()
  })

  test("관리자 로그인 후 핵심 운영 경로가 정상 동작하고 로그아웃된다", async ({ page }) => {
    const runtimeErrors: string[] = []
    page.on("pageerror", (error) => {
      runtimeErrors.push(error.message)
    })

    await page.goto("/login?next=%2Fadmin")
    await page.locator("#username").fill(adminUsername)
    await page.locator("#password").fill(adminPassword)
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().includes("/member/api/v1/auth/login"),
      { timeout: 20_000 }
    )
    await page.locator("form button[type='submit']").click()

    const loginResponse = await loginResponsePromise.catch(() => null)
    if (!loginResponse) {
      throw new Error(`Login request was not observed. currentUrl=${page.url()}`)
    }

    if (!loginResponse.ok()) {
      const body = (await loginResponse.text().catch(() => "")).slice(0, 300)
      throw new Error(
        `Login API failed. status=${loginResponse.status()} currentUrl=${page.url()} body=${body}`
      )
    }

    await page.goto("/admin")
    await expect(page).toHaveURL(/\/admin(\/|$)/, { timeout: 20_000 })
    await expect(page.getByRole("heading", { name: "운영 허브" })).toBeVisible()

    await page.goto("/admin/profile")
    await expect(page.getByRole("heading", { name: "관리자 프로필 관리" })).toBeVisible()
    const profileImage = page.locator("main img").first()
    await expect(profileImage).toBeVisible()
    await expect
      .poll(async () => {
        return profileImage.evaluate((node) => {
          if (!(node instanceof HTMLImageElement)) return false
          return node.complete && node.naturalWidth > 0
        })
      })
      .toBeTruthy()

    await page.goto("/admin/tools")
    await expect(page.getByRole("heading", { name: "운영 도구" })).toBeVisible()
    await expect(page.getByText("Task Queue 진단")).toBeVisible()

    await page.goto("/admin/posts/new")
    await expect(page.getByRole("heading", { name: "글 작업실" })).toBeVisible()
    await expect(page.getByPlaceholder("제목을 입력하세요")).toBeVisible()
    const contentEditor = page.getByPlaceholder("당신의 이야기를 적어보세요...")
    await contentEditor.fill("```mermaid\ngraph TD\n  A[요청] --> B[완료]\n```")
    await expect
      .poll(async () => await page.locator(".aq-mermaid-stage svg").count(), { timeout: 20_000 })
      .toBeGreaterThan(0)

    await page.getByRole("button", { name: "Logout", exact: true }).click()
    await expect(page).toHaveURL(/\/login/)
    await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible()

    const ignorablePatterns = [/ResizeObserver loop/i]
    const criticalErrors = runtimeErrors.filter(
      (message) => !ignorablePatterns.some((pattern) => pattern.test(message))
    )
    expect(criticalErrors).toEqual([])
  })
})
