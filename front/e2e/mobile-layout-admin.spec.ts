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

    await expect(page.getByRole("heading", { name: "운영 상태와 복구" })).toBeVisible()
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
      const links = Array.from(compactNav?.querySelectorAll<HTMLAnchorElement>("a") ?? [])
      const labelMetrics = links.map((link) => {
        const label = link.querySelector("span")
        const labelStyle = label ? window.getComputedStyle(label) : null
        const box = link.getBoundingClientRect()
        return {
          text: label?.textContent?.trim() ?? "",
          labelDisplay: labelStyle?.display ?? "none",
          height: Math.round(box.height),
          width: Math.round(box.width),
        }
      })

      return {
        utilityHeight: utilityRect?.height ?? 0,
        utilityBottom: utilityRect?.bottom ?? 0,
        headingTop: headingRect?.top ?? 0,
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        labelMetrics,
      }
    })

    expect(topbarSnapshot.utilityHeight).toBeLessThanOrEqual(130)
    expect(topbarSnapshot.headingTop).toBeLessThanOrEqual(240)
    // CompactNav는 가로 스크롤 허용 — body 전체 폭 강제보다 라벨 노출이 우선(P5-2)
    expect(topbarSnapshot.labelMetrics.length).toBeGreaterThan(0)
    for (const metric of topbarSnapshot.labelMetrics) {
      expect(metric.labelDisplay).not.toBe("none")
      expect(metric.text.length).toBeGreaterThan(0)
      expect(metric.height).toBeGreaterThanOrEqual(44)
      expect(metric.width).toBeGreaterThanOrEqual(44)
    }
    expect(topbarSnapshot.labelMetrics.some((metric) => metric.text === "글")).toBe(true)
    expect(topbarSnapshot.labelMetrics.some((metric) => metric.text === "도구")).toBe(true)
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
