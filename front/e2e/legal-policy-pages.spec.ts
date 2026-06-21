import { expect, test } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset, mockFeedEndpoints } from "./helpers/smokeFixtures"

test.describe("legal policy public pages", () => {
  test("privacy and terms pages expose legal notices and data deletion contact", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded" })

    await expect(page).toHaveTitle(/개인정보처리방침/)
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/)
    await expect(page.getByRole("heading", { name: "개인정보처리방침" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "데이터 삭제 요청" })).toBeVisible()
    await expect(page.getByRole("link", { name: /illusiveman7@gmail\.com/ })).toHaveAttribute(
      "href",
      "mailto:illusiveman7@gmail.com?subject=AquilaLog%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD",
    )

    await page.goto("/terms", { waitUntil: "domcontentloaded" })

    await expect(page).toHaveTitle(/이용약관/)
    await expect(page.locator("meta[name='robots']")).toHaveAttribute("content", /index/)
    await expect(page.getByRole("heading", { name: "이용약관" })).toBeVisible()
    await expect(page.getByText("문의 및 데이터 삭제 요청")).toBeVisible()
    await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
  })

  test("auth and footer surfaces link to privacy and terms", async ({ page }) => {
    await page.goto("/login", { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
    await expect(page.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")

    await page.goto("/signup", { waitUntil: "domcontentloaded" })

    await expect(page.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/privacy")
    await expect(page.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/terms")

    await mockAvatarAsset(page)
    await addPublicAboutSnapshotCookie(page)
    await mockFeedEndpoints(page)
    await page.goto("/", { waitUntil: "domcontentloaded" })

    const footer = page.locator("footer")

    await expect(footer.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute(
      "href",
      "/privacy",
    )
    await expect(footer.getByRole("link", { name: "이용약관" })).toHaveAttribute(
      "href",
      "/terms",
    )
  })
})
