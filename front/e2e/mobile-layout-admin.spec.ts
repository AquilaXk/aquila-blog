import { expect, test } from "@playwright/test"
import {
  MOBILE_VIEWPORT,
  mockAnonymousSession,
  mockAdminPostsWorkspaceEndpoints,
  mockAvatarAsset,
} from "./helpers/mobileLayoutFixtures"

test.use({
  viewport: MOBILE_VIEWPORT,
  isMobile: true,
  hasTouch: true,
})

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
})

test.describe("모바일 관리자 레이아웃", () => {
  test("모바일 어드민 V4 topbar는 검색 없이 compact nav와 핵심 액션을 보존한다", async ({ page }) => {
    await page.goto("/admin/tools")

    await expect(page.getByRole("heading", { name: "운영 도구" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "관리자 바로가기" })).toBeVisible()
    await expect(page.getByRole("link", { name: "글 관리" })).toBeVisible()
    await expect(page.getByRole("link", { name: "블로그 보기" })).toBeVisible()
    await expect(page.getByRole("link", { name: "새 글", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "관리자 검색 열기" })).toHaveCount(0)
    await expect(page.getByRole("searchbox", { name: "관리자 검색" })).toHaveCount(0)

    const topbarSnapshot = await page.evaluate(() => {
      const compactNav = document.querySelector<HTMLElement>('nav[aria-label="관리자 바로가기"]')
      const utility = compactNav?.closest("header") as HTMLElement | null
      const heading = document.querySelector("h1")
      const utilityRect = utility?.getBoundingClientRect()
      const headingRect = heading?.getBoundingClientRect()

      return {
        utilityHeight: utilityRect?.height ?? 0,
        utilityBottom: utilityRect?.bottom ?? 0,
        headingTop: headingRect?.top ?? 0,
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    expect(topbarSnapshot.utilityHeight).toBeLessThanOrEqual(130)
    expect(topbarSnapshot.headingTop).toBeLessThanOrEqual(240)
    expect(topbarSnapshot.bodyScrollWidth).toBeLessThanOrEqual(topbarSnapshot.viewportWidth)
  })

  test("어드민 글 목록 첫 화면은 목록 본문을 보조 패널보다 먼저 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)

  await page.goto("/admin/posts")
  await expect(page.getByRole("heading", { name: "글 관리" })).toBeVisible()
  await expect(page.getByLabel("글 검색")).toBeVisible()

  const firstListCard = page.locator("article").filter({ hasText: "First fold 운영 점검" }).first()
  await expect(firstListCard).toBeVisible()

  const foldSnapshot = await page.evaluate(() => {
    const search = document.querySelector<HTMLElement>("#workspace-post-search")
    const firstCard = Array.from(document.querySelectorAll<HTMLElement>("article")).find((element) =>
      element.textContent?.includes("First fold 운영 점검")
    )
    const activityLabel = Array.from(document.querySelectorAll<HTMLElement>("strong")).find(
      (element) => element.textContent?.trim() === "작업 기록"
    )
    const activityPanel = activityLabel?.closest<HTMLElement>("section, div")
    const searchRect = search?.getBoundingClientRect()
    const firstCardRect = firstCard?.getBoundingClientRect()
    const activityRect = activityPanel?.getBoundingClientRect()

    return {
      viewportHeight: window.innerHeight,
      searchTop: searchRect?.top ?? Number.POSITIVE_INFINITY,
      firstCardTop: firstCardRect?.top ?? Number.POSITIVE_INFINITY,
      activityTop: activityRect?.top ?? Number.POSITIVE_INFINITY,
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })

  expect(foldSnapshot.searchTop).toBeLessThanOrEqual(610)
  expect(foldSnapshot.firstCardTop).toBeLessThan(foldSnapshot.viewportHeight)
  expect(foldSnapshot.firstCardTop).toBeLessThan(foldSnapshot.activityTop)
  expect(foldSnapshot.bodyScrollWidth).toBeLessThanOrEqual(foldSnapshot.viewportWidth)
})
})
