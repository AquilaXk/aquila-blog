import { expect, test } from "@playwright/test"
import { DESKTOP_VIEWPORT, prepareAdminPosts, preparePublicHome } from "./helpers/adaptivityFixtures"
import { mockAnonymousSession, mockAvatarAsset } from "./helpers/mobileLayoutFixtures"

test.describe("residual keyboard paths", () => {
  test("관리자 글 목록은 Arrow로 행 primary 포커스를 이동한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await prepareAdminPosts(page)
    await page.goto("/admin/posts")
    await expect(page.getByRole("heading", { name: "글 관리" })).toBeVisible()
    await page.getByRole("button", { name: "전체", exact: true }).click()

    const titleButtons = page.locator(`[data-admin-posts-row-primary="true"]`)
    await expect(titleButtons.first()).toBeVisible()
    const rowCount = await titleButtons.count()
    expect(rowCount).toBeGreaterThan(1)
    await titleButtons.first().focus()
    await expect(titleButtons.first()).toBeFocused()

    await page.keyboard.press("ArrowDown")
    await expect(titleButtons.nth(1)).toBeFocused()
    await page.keyboard.press("ArrowUp")
    await expect(titleButtons.first()).toBeFocused()
    await page.keyboard.press("End")
    await expect(titleButtons.nth(rowCount - 1)).toBeFocused()
    await page.keyboard.press("Home")
    await expect(titleButtons.first()).toBeFocused()

    const scrollBefore = await page.evaluate(() => window.scrollY)
    await page.keyboard.press("ArrowUp")
    await expect(titleButtons.first()).toBeFocused()
    await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(scrollBefore)
  })

  test("AuthEntryModal은 focus-trap·Esc·trigger 복귀·aria-live를 유지한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await preparePublicHome(page)
    await mockAvatarAsset(page)
    await mockAnonymousSession(page)
    await page.goto("/")

    const loginTrigger = page.getByRole("button", { name: "Login", exact: true })
    await expect(loginTrigger).toBeVisible()
    await loginTrigger.focus()
    await expect(loginTrigger).toBeFocused()
    await loginTrigger.click()

    const dialog = page.getByRole("dialog", { name: "로그인" })
    await expect(dialog).toBeVisible()
    const closeButton = dialog.getByRole("button", { name: "닫기" })
    await expect(closeButton).toBeFocused()

    await page.keyboard.press("Tab")
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const dialogEl = document.querySelector('[role="dialog"][aria-labelledby="auth-entry-modal-title"]')
          return Boolean(dialogEl && document.activeElement && dialogEl.contains(document.activeElement))
        })
      )
      .toBe(true)

    // Shift+Tab from early focus should wrap back to the last focusable (trap).
    await closeButton.focus()
    await page.keyboard.press("Shift+Tab")
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const dialogEl = document.querySelector('[role="dialog"][aria-labelledby="auth-entry-modal-title"]')
          return Boolean(dialogEl && document.activeElement && dialogEl.contains(document.activeElement))
        })
      )
      .toBe(true)

    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(loginTrigger).toBeFocused()

    await loginTrigger.click()
    await expect(dialog).toBeVisible()
    const liveError = dialog.locator(".inlineError[aria-live='polite']")
    await expect(liveError).toHaveCount(1)
    await dialog.getByLabel("이메일").fill("not-an-email")
    await dialog.getByLabel("비밀번호", { exact: true }).fill("x")
    await dialog.getByRole("button", { name: "로그인", exact: true }).click()
    await expect(liveError).toContainText("이메일")
  })

  test("모바일 메뉴 Login 닫기 후 메뉴 버튼으로 포커스가 복귀한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await preparePublicHome(page)
    await mockAvatarAsset(page)
    await mockAnonymousSession(page)
    await page.goto("/")

    const menuButton = page.getByRole("button", { name: "메뉴 열기" })
    await menuButton.click()
    await page.getByRole("button", { name: "Login", exact: true }).click()

    const dialog = page.getByRole("dialog", { name: "로그인" })
    await expect(dialog).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(menuButton).toBeFocused()
  })

  test("Legal TOC jump 후 대상 h2로 포커스가 이동한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await page.goto("/privacy")
    await expect(page.getByRole("heading", { name: "개인정보처리방침", level: 1 })).toBeVisible()

    const toc = page.getByRole("navigation", { name: "정책 목차" }).first()
    const targetLink = toc.getByRole("link").nth(1)
    const targetName = (await targetLink.innerText()).trim()
    await targetLink.click()

    const focusedHeading = page.locator("main.legalBody h2:focus")
    await expect(focusedHeading).toHaveCount(1)
    await expect(focusedHeading).toHaveText(targetName)

    await page.evaluate(() => {
      window.location.hash = "privacy-rights"
    })
    const hashHeading = page.locator("#privacy-rights h2")
    await expect.poll(async () => hashHeading.evaluate((el) => el === document.activeElement)).toBe(true)
  })
})
