import { expect, test } from "@playwright/test"

test("관리자 프로필 1440px 데스크톱은 편집 폼을 preview rail에 눌리지 않게 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/profile")

  await expect(page.getByRole("heading", { name: /메인과 About에 보일 인상/ })).toBeVisible()
  await expect(page.locator("#profile-display-name")).toBeVisible()

  const layoutSnapshot = await page.evaluate(() => {
    const displayName = document.querySelector<HTMLElement>("#profile-display-name")
    const role = document.querySelector<HTMLElement>("#profile-role")
    const bio = document.querySelector<HTMLElement>("#profile-bio")
    const sectionRail = document.querySelector<HTMLElement>('[aria-label="프로필 섹션"]')
    const rectOf = (element: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect()
      return rect
        ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
          }
        : null
    }

    return {
      displayName: rectOf(displayName),
      role: rectOf(role),
      bio: rectOf(bio),
      sectionRail: rectOf(sectionRail),
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })

  expect(layoutSnapshot.displayName?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.role?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.bio?.width ?? 0).toBeGreaterThanOrEqual(320)
  expect(layoutSnapshot.sectionRail?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.bodyScrollWidth).toBeLessThanOrEqual(layoutSnapshot.viewportWidth)
})
