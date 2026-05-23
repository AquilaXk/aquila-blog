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

test.describe("mobile layout admin", () => {
  test("모바일 어드민 유틸리티는 검색을 접어 first fold를 보존한다", async ({ page }) => {
  await page.goto("/admin/tools")

  await expect(page.getByRole("heading", { name: /문제 확인과 복구/ })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "관리자 바로가기" })).toBeVisible()
  await expect(page.getByRole("link", { name: "글 관리" })).toBeVisible()

  const searchToggle = page.getByRole("button", { name: "관리자 검색 열기" })
  await expect(searchToggle).toBeVisible()
  await expect(page.getByRole("searchbox", { name: "관리자 검색" })).toBeHidden()

  const collapsedSnapshot = await page.evaluate(() => {
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

  expect(collapsedSnapshot.utilityHeight).toBeLessThanOrEqual(92)
  expect(collapsedSnapshot.headingTop).toBeLessThanOrEqual(205)
  expect(collapsedSnapshot.bodyScrollWidth).toBeLessThanOrEqual(collapsedSnapshot.viewportWidth)

  await searchToggle.click()
  const searchInput = page.getByRole("searchbox", { name: "관리자 검색" })
  await expect(searchInput).toBeVisible()
  await searchInput.fill("글 관리")
  await searchInput.press("Enter")
  await expect(page).toHaveURL(/\/admin\/posts(?:$|\?)/)
})

  test("어드민 글 목록 first fold는 목록 본문을 보조 패널보다 먼저 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)

  await page.goto("/admin/posts")
  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await expect(page.getByLabel("검색어")).toBeVisible()

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
