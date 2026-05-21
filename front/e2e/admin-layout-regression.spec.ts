import { expect, test, type Page } from "@playwright/test"

const ADMIN_MEMBER_FIXTURE = {
  id: 1,
  username: "aquila",
  nickname: "aquila",
  isAdmin: true,
  profileImageUrl: "/avatar.png",
  profileImageDirectUrl: "/avatar.png",
}

const ADMIN_POST_FIXTURES = Array.from({ length: 6 }, (_, index) => ({
  id: 4200 + index,
  title: index === 0 ? "First fold 운영 점검" : `관리자 글 목록 회귀 ${index}`,
  authorName: "관리자",
  authorProfileImgUrl: "/avatar.png",
  published: index % 2 === 0,
  listed: index % 3 !== 0,
  tempDraft: false,
  createdAt: `2026-05-${String(10 + index).padStart(2, "0")}T01:00:00Z`,
  modifiedAt: `2026-05-${String(20 - index).padStart(2, "0")}T08:30:00Z`,
}))

const createAdminPostPage = () => ({
  content: ADMIN_POST_FIXTURES,
  pageable: {
    pageNumber: 0,
    pageSize: 20,
    totalElements: ADMIN_POST_FIXTURES.length,
    totalPages: 1,
  },
})

const mockAdminPostsWorkspaceEndpoints = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route("**/post/api/v1/adm/posts**", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith("/bootstrap")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          member: ADMIN_MEMBER_FIXTURE,
          firstPage: createAdminPostPage(),
        }),
      })
      return
    }

    if (url.pathname.includes("/deleted")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [],
          pageable: { pageNumber: 0, pageSize: 20, totalElements: 0, totalPages: 0 },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createAdminPostPage()),
    })
  })
}

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

const captureDashboardPrioritySnapshot = async (page: Page) =>
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

const capturePostsFirstFoldSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "글 목록",
    )
    const listSection = heading?.closest<HTMLElement>("section")
    const search = listSection?.querySelector<HTMLElement>("#workspace-post-search")
    const firstRow = Array.from(listSection?.querySelectorAll<HTMLElement>("tbody tr, article") ?? []).find((element) =>
      element.textContent?.includes("First fold 운영 점검"),
    )
    const recentHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "최근 작업",
    )
    const headingRect = heading?.getBoundingClientRect()
    const searchRect = search?.getBoundingClientRect()
    const firstRowRect = firstRow?.getBoundingClientRect()
    const recentRect = recentHeading?.getBoundingClientRect()

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      headingTop: headingRect?.top ?? Number.POSITIVE_INFINITY,
      searchTop: searchRect?.top ?? Number.POSITIVE_INFINITY,
      firstRowTop: firstRowRect?.top ?? Number.POSITIVE_INFINITY,
      recentTop: recentRect?.top ?? Number.POSITIVE_INFINITY,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })

test("관리자 글 관리는 1440px 데스크톱에서 첫 글을 최근 작업보다 먼저 first fold에 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/posts")

  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await page.getByRole("button", { name: "새로고침" }).click()
  await expect(page.locator("tbody tr, article").filter({ hasText: "First fold 운영 점검" }).first()).toBeVisible()

  const snapshot = await capturePostsFirstFoldSnapshot(page)

  expect(snapshot.searchTop).toBeLessThanOrEqual(560)
  expect(snapshot.firstRowTop).toBeLessThanOrEqual(760)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.recentTop)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})

test("관리자 글 관리는 모바일에서 첫 글 카드를 최근 작업보다 먼저 first fold에 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin/posts")

  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await page.getByRole("button", { name: "새로고침" }).click()
  await expect(page.locator("tbody tr, article").filter({ hasText: "First fold 운영 점검" }).first()).toBeVisible()

  const snapshot = await capturePostsFirstFoldSnapshot(page)

  expect(snapshot.searchTop).toBeLessThanOrEqual(520)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.recentTop)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})
