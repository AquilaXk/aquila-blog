import { expect, type Page } from "@playwright/test"
import {
  createExplorePage,
  mockAdminPostsWorkspaceEndpoints,
  mockAnonymousSession,
  mockAvatarAsset,
  MOBILE_TAG_ENTRIES,
  MOBILE_VIEWPORT,
} from "./mobileLayoutFixtures"

export const TOUCH_TARGET_MIN_PX = 44
export const DESKTOP_VIEWPORT = { width: 1440, height: 900 }

const createAdaptivityExplorePage = () => {
  const page = createExplorePage("adaptivity 카드 overflow 회귀 점검")
  page.content = page.content.map((item) => ({
    ...item,
    thumbnail: "/avatar.png",
  }))
  return page
}

const mockAdaptivityFeedEndpoints = async (page: Page) => {
  const feedPage = createAdaptivityExplorePage()
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(feedPage),
    })
  })
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(feedPage),
    })
  })
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(feedPage),
    })
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOBILE_TAG_ENTRIES),
    })
  })
}

export const preparePublicHome = async (page: Page) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
  await mockAdaptivityFeedEndpoints(page)
}

export const prepareAdminPosts = async (page: Page) => {
  await mockAvatarAsset(page)
  await mockAdminPostsWorkspaceEndpoints(page)
}

export const openMobileHome = async (page: Page) => {
  await page.setViewportSize(MOBILE_VIEWPORT)
  await preparePublicHome(page)
  await page.goto("/")
  await expect(page.locator("main")).toBeVisible()
}

export const expectNoHorizontalOverflow = async (page: Page) => {
  const snapshot = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))

  expect(snapshot.htmlScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
}

export const expectMinTouchTarget = async (
  page: Page,
  locator: ReturnType<Page["locator"]> | ReturnType<Page["getByRole"]>,
  label: string
) => {
  await expect(locator, label).toBeVisible()
  const box = await locator.boundingBox()
  expect(box, `${label} boundingBox`).not.toBeNull()
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN_PX)
}

export const applyRootFontScale = async (page: Page, percent: 125 | 150) => {
  await page.evaluate((scalePercent) => {
    document.documentElement.style.fontSize = `${(16 * scalePercent) / 100}px`
  }, percent)
}

export const readMotionBudget = async (page: Page, selector: string) =>
  page.evaluate((targetSelector) => {
    const node = document.querySelector(targetSelector)
    if (!(node instanceof HTMLElement)) {
      return null
    }
    const style = window.getComputedStyle(node)
    return {
      transitionDuration: style.transitionDuration,
      animationDuration: style.animationDuration,
      transitionProperty: style.transitionProperty,
    }
  }, selector)

export const isNearZeroDuration = (value: string) => {
  if (!value || value === "0s" || value === "0ms" || value === "none") return true
  return value
    .split(",")
    .map((part) => part.trim())
    .every((part) => {
      if (part === "0s" || part === "0ms" || part === "none") return true
      const match = /^([\d.eE+-]+)(ms|s)$/.exec(part)
      if (!match) return false
      const amount = Number(match[1])
      if (!Number.isFinite(amount)) return false
      const unit = match[2]
      const ms = unit === "s" ? amount * 1000 : amount
      return ms <= 20
    })
}
