import { expect, test } from "@playwright/test"
import {
  applyRootFontScale,
  DESKTOP_VIEWPORT,
  expectMinTouchTarget,
  expectNoHorizontalOverflow,
  isNearZeroDuration,
  openMobileHome,
  prepareAdminPosts,
  preparePublicHome,
  readMotionBudget,
  TOUCH_TARGET_MIN_PX,
} from "./helpers/adaptivityFixtures"
import { mockAvatarAsset, mockAnonymousSession } from "./helpers/mobileLayoutFixtures"

test.describe("adaptivity hit-area", () => {
  test("모바일 홈 핵심 컨트롤은 44px 이상 터치 타깃을 유지한다", async ({ page }) => {
    await openMobileHome(page)

    await expectMinTouchTarget(page, page.getByLabel("Search posts by keyword"), "feed search")
    await expectMinTouchTarget(page, page.getByRole("button", { name: "메뉴 열기" }), "mobile menu")
    await expectMinTouchTarget(page, page.getByRole("button", { name: "전체보기" }), "topic chip")

    const firstCard = page.locator('[data-ui="feed-post-card"]').first()
    await expect(firstCard).toBeVisible()
    const cardBox = await firstCard.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.width).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
    expect(cardBox!.height).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  })
})

test.describe("adaptivity focus-trap", () => {
  test("관리자 글 삭제 ConfirmDialog는 트랩·Esc·trigger 복귀를 유지한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await prepareAdminPosts(page)
    await page.goto("/admin/posts")
    await expect(page.getByRole("heading", { name: "글 관리" })).toBeVisible()
    await page.getByRole("button", { name: "전체", exact: true }).click()

    const deleteTrigger = page.getByRole("button", { name: "삭제", exact: true }).first()
    await expect(deleteTrigger).toBeVisible()
    await deleteTrigger.focus()
    await expect(deleteTrigger).toBeFocused()
    await deleteTrigger.click()

    const dialog = page.getByRole("dialog", { name: "글을 삭제할까요?" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused()

    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "삭제하기" })).toBeFocused()
    await page.keyboard.press("Tab")
    await expect(dialog.getByRole("button", { name: "취소" })).toBeFocused()

    await page.keyboard.press("Escape")
    await expect(dialog).toHaveCount(0)
    await expect(deleteTrigger).toBeFocused()
  })
})

test.describe("adaptivity reduced-motion", () => {
  test("prefers-reduced-motion에서 피드 카드 transition이 사실상 비활성이다", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await openMobileHome(page)
    const firstCard = page.locator('[data-ui="feed-post-card"]').first()
    await expect(firstCard).toBeVisible()

    await expect
      .poll(async () => page.evaluate(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches))
      .toBe(true)

    const articleBudget = await readMotionBudget(page, '[data-ui="feed-post-card"] article')
    expect(articleBudget, `article budget=${JSON.stringify(articleBudget)}`).not.toBeNull()
    expect(
      isNearZeroDuration(articleBudget!.transitionDuration),
      `article transitionDuration=${articleBudget!.transitionDuration}`
    ).toBe(true)
    expect(
      isNearZeroDuration(articleBudget!.animationDuration),
      `article animationDuration=${articleBudget!.animationDuration}`
    ).toBe(true)

    const globalSample = await page.evaluate(() => {
      const probe = document.createElement("div")
      probe.style.transition = "opacity 300ms ease"
      probe.style.animation = "spin 1s linear infinite"
      document.body.appendChild(probe)
      const style = window.getComputedStyle(probe)
      const result = {
        transitionDuration: style.transitionDuration,
        animationDuration: style.animationDuration,
      }
      probe.remove()
      return result
    })
    expect(
      isNearZeroDuration(globalSample.transitionDuration),
      `probe transitionDuration=${globalSample.transitionDuration}`
    ).toBe(true)
    expect(
      isNearZeroDuration(globalSample.animationDuration),
      `probe animationDuration=${globalSample.animationDuration}`
    ).toBe(true)
  })
})

test.describe("adaptivity font-scale", () => {
  for (const percent of [125, 150] as const) {
    test(`루트 폰트 ${percent}%에서 홈 landmark와 가로 overflow를 유지한다`, async ({ page }) => {
      await page.setViewportSize(DESKTOP_VIEWPORT)
      await preparePublicHome(page)
      await page.goto("/")
      await applyRootFontScale(page, percent)

      await expect(page.locator("main")).toBeVisible()
      await expect(page.locator("h1").first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }

  test("루트 폰트 150%에서 관리자 글 목록 landmark와 가로 overflow를 유지한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await prepareAdminPosts(page)
    await page.goto("/admin/posts")
    await applyRootFontScale(page, 150)

    await expect(page.getByRole("heading", { name: "글 관리" })).toBeVisible()
    await page.getByRole("button", { name: "전체", exact: true }).click()
    await expect(page.getByRole("button", { name: "삭제", exact: true }).first()).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })

  test("루트 폰트 125%에서 상세 landmark와 가로 overflow를 유지한다", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await mockAvatarAsset(page)
    await mockAnonymousSession(page)
    await page.route("**/post/api/v1/posts/991", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: 991,
          createdAt: "2026-03-22T00:00:00Z",
          modifiedAt: "2026-03-22T00:00:00Z",
          authorId: 1,
          authorName: "관리자",
          authorUsername: "aquila",
          authorProfileImageDirectUrl: "/avatar.png",
          title: "adaptivity 상세 점검",
          content: "## 본문\n\n폰트 확대 회귀 점검용 문단입니다.",
          tags: ["adaptivity"],
          category: ["테스트"],
          published: true,
          listed: true,
          likesCount: 1,
          commentsCount: 0,
          hitCount: 10,
          actorHasLiked: false,
          actorCanModify: false,
          actorCanDelete: false,
        }),
      })
    })
    await page.route("**/post/api/v1/posts/991/hit", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ resultCode: "200-1", msg: "ok", data: { hitCount: 11 } }),
      })
    })
    await page.route("**/post/api/v1/posts/991/comments", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      })
    })

    await page.goto("/posts/991")
    await applyRootFontScale(page, 125)
    await expect(page.locator("main")).toBeVisible()
    await expect(page.getByRole("heading", { name: "adaptivity 상세 점검" })).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
})
