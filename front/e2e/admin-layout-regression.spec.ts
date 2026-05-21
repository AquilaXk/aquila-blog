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

const captureDashboardPrioritySnapshot = async (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const priorityHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "우선 점검 항목",
    )
    const prioritySection = priorityHeading?.closest<HTMLElement>("section")
    const priorityTable = prioritySection?.querySelector<HTMLElement>("table")
    const headingRect = priorityHeading?.getBoundingClientRect()
    const sectionRect = prioritySection?.getBoundingClientRect()
    const tableRect = priorityTable?.getBoundingClientRect()

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      headingTop: headingRect?.top ?? Number.POSITIVE_INFINITY,
      sectionTop: sectionRect?.top ?? Number.POSITIVE_INFINITY,
      tableTop: tableRect?.top ?? Number.POSITIVE_INFINITY,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })

test("관리자 대시보드 1440px 데스크톱은 우선 점검 테이블을 first fold 안에 노출한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/dashboard")

  await expect(page.getByRole("heading", { name: "우선 점검 항목" })).toBeVisible()

  const snapshot = await captureDashboardPrioritySnapshot(page)

  expect(snapshot.tableTop).toBeLessThanOrEqual(860)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})

test("관리자 대시보드 모바일은 우선 점검 heading을 first fold 안에 노출한다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin/dashboard")

  await expect(page.getByRole("heading", { name: "우선 점검 항목" })).toBeVisible()

  const snapshot = await captureDashboardPrioritySnapshot(page)

  expect(snapshot.headingTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.sectionTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})
