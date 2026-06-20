import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import {
  addPublicAboutSnapshotCookie,
  createExplorePost,
  mockAvatarAsset,
} from "./helpers/smokeFixtures"

const TAGS = [
  "JWT",
  "Spring",
  "Security",
  "Kafka",
  "Architecture",
  "Infrastructure",
  "Performance",
  "Realtime",
].map((tag, index) => ({ tag, count: 20 - index }))

const POSTS = Array.from({ length: 9 }, (_, index) =>
  createExplorePost({
    id: 7000 + index,
    title: index === 0 ? "JWT VS Session" : `AquilaLog 아키텍처 노트 ${index + 1}`,
    summary:
      index === 0
        ? "JWT가 Stateless하다고 해서 무조건 좋은 것은 아니라는 점을 운영 관점에서 정리합니다."
        : "Spring, Infrastructure, Security를 제품 수준의 글 카드에서 읽기 쉽게 정리합니다.",
    tags: index === 0 ? [] : [TAGS[index % TAGS.length].tag],
    category: [index === 0 ? "Security" : TAGS[index % TAGS.length].tag],
    thumbnail: index % 3 === 0 ? "" : `/mock-cover-${index}.png`,
    hitCount: 1200 + index * 137,
    commentsCount: index,
    likesCount: index + 1,
    createdAt: `2026-06-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
    modifiedAt: `2026-06-${String(10 + index).padStart(2, "0")}T00:00:00Z`,
  })
)

const createPageResponse = (posts = POSTS) => ({
  content: posts,
  pageable: {
    pageNumber: 0,
    pageSize: 30,
    totalElements: posts.length,
    totalPages: 1,
  },
})

const mockHomeFeedRedesignEndpoints = async (page: Page, posts = POSTS) => {
  await mockAvatarAsset(page)
  await addPublicAboutSnapshotCookie(page)

  await page.route("**/mock-cover-*.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII=",
        "base64"
      ),
    })
  })

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createPageResponse(posts)),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createPageResponse(posts)),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createPageResponse(posts)),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(TAGS),
    })
  })
}

const addEmptyProfileLinksCookie = async (page: Page) => {
  const profile = {
    username: "aquila",
    name: "aquila",
    nickname: "aquila",
    modifiedAt: new Date().toISOString(),
    profileImageUrl: "/avatar.png",
    profileImageDirectUrl: "/avatar.png",
    profileRole: "Backend Developer",
    contactLinks: [],
    serviceLinks: [],
  }

  await page.route("**/member/api/v1/members/adminProfile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(profile),
    })
  })

  await page.context().addCookies([
    {
      name: "admin_profile_snapshot_v1",
      value: encodeURIComponent(JSON.stringify(profile)),
      url: "http://127.0.0.1:3000",
    },
  ])
}

test.describe("home feed product redesign", () => {
  test("1440px 이상 홈은 포스트 중심 3열과 compact profile/tag chip 구조를 사용한다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockHomeFeedRedesignEndpoints(page)

    await page.goto("/")

    await expect(page.locator('[data-ui="feed-home-product-shell"]')).toBeVisible()
    await expect(page.locator('[data-ui="feed-profile-summary"]')).toBeVisible()
    await expect(page.locator('[data-ui="feed-tag-chip-rail"]')).toBeVisible()
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "AquilaLog")
    await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", "AquilaLog")
    await expect(page.locator(".desktopPanel")).toBeHidden()
    await expect(page.locator(".rt")).toBeHidden()
    await expect(page.locator('[data-ui="feed-profile-summary"]')).not.toContainText("Posts-")

    const cardRects = await page.locator('[data-ui="feed-post-card"]').evaluateAll((cards) =>
      cards.slice(0, 6).map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) }
      })
    )
    const firstRowTop = cardRects[0]?.top
    const firstRow = cardRects.filter((rect) => rect.top === firstRowTop)
    const secondRow = cardRects.filter((rect) => rect.top !== firstRowTop)

    expect(firstRow).toHaveLength(3)
    expect(secondRow.length).toBeGreaterThanOrEqual(3)
    expect(Math.min(...firstRow.map((rect) => rect.width))).toBeGreaterThanOrEqual(300)
  })

  test("1440px 미만 데스크톱은 포스트 카드를 2열로 유지한다", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockHomeFeedRedesignEndpoints(page)

    await page.goto("/")
    await expect(page.locator('[data-ui="feed-post-card"]').nth(3)).toBeVisible()

    const cardRects = await page.locator('[data-ui="feed-post-card"]').evaluateAll((cards) =>
      cards.slice(0, 4).map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) }
      })
    )
    const firstRowTop = cardRects[0]?.top
    const firstRow = cardRects.filter((rect) => rect.top === firstRowTop)

    expect(firstRow).toHaveLength(2)
    expect(Math.min(...firstRow.map((rect) => rect.width))).toBeGreaterThanOrEqual(360)
  })

  test("브랜드 cover fallback은 썸네일 없는 글도 통일된 기술 블로그 카드로 보여준다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockHomeFeedRedesignEndpoints(page)

    await page.goto("/")

    const fallbackCover = page.locator('[data-ui="feed-card-brand-cover"]').filter({
      hasText: "JWT VS Session",
    })
    await expect(fallbackCover).toBeVisible()
    await expect(fallbackCover.getByText("Security", { exact: true })).toBeVisible()
  })

  test("저장용 category prefix는 카드와 cover 라벨에 노출하지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const categorizedPosts = [
      createExplorePost({
        id: 8110,
        title: "Spring 운영 패턴",
        summary: "저장용 카테고리 prefix 대신 사용자에게 보이는 라벨만 보여줘야 합니다.",
        tags: [],
        category: ["monitor::Spring"],
        thumbnail: "",
      }),
    ]
    await mockHomeFeedRedesignEndpoints(page, categorizedPosts)

    await page.goto("/")

    const categorizedCard = page.locator('[data-ui="feed-post-card"]').filter({
      hasText: "Spring 운영 패턴",
    })
    await expect(categorizedCard).toBeVisible()
    await expect(categorizedCard.getByText("Spring", { exact: true })).toHaveCount(2)
    await expect(categorizedCard.getByText("monitor::Spring", { exact: true })).toHaveCount(0)
  })

  test("pinned 내부 태그는 카드 category 라벨로 노출하지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const pinnedPosts = [
      createExplorePost({
        id: 8101,
        title: "Pinned SSE 운영 노트",
        summary: "Pinned 내부 태그 대신 실제 주제 태그를 카드 라벨로 보여줘야 합니다.",
        tags: ["Pinned", "SSE"],
        category: [],
        thumbnail: "",
      }),
    ]
    await mockHomeFeedRedesignEndpoints(page, pinnedPosts)

    await page.goto("/")

    const pinnedCover = page.locator('[data-ui="feed-card-brand-cover"]').filter({
      hasText: "Pinned SSE 운영 노트",
    })
    await expect(pinnedCover).toBeVisible()
    await expect(pinnedCover.getByText("SSE", { exact: true })).toBeVisible()
    await expect(pinnedCover.getByText("Pinned", { exact: true })).toHaveCount(0)
  })

  test("명시적으로 비운 profile 링크는 기본 링크로 되살리지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await mockHomeFeedRedesignEndpoints(page)
    await addEmptyProfileLinksCookie(page)

    await page.goto("/")

    const profileSummary = page.locator('[data-ui="feed-profile-summary"]')
    await expect(profileSummary).toBeVisible()
    await expect(profileSummary.locator(".links a")).toHaveCount(0)
  })

  test("category-only 글은 restore snapshot과 memo guard에서도 stale fallback으로 떨어지지 않는다", () => {
    const feedRoot = path.resolve(__dirname, "../src/routes/Feed")
    const restoreSource = readFileSync(path.join(feedRoot, "FeedExplorerRestoreModel.ts"), "utf8")
    const postListSource = readFileSync(path.join(feedRoot, "PostList/index.tsx"), "utf8")
    const postCardSource = readFileSync(path.join(feedRoot, "PostList/PostCard.tsx"), "utf8")

    expect(restoreSource).toContain("category?: string[]")
    expect(restoreSource.match(/post\.category\?\.length \? \{ category: post\.category \}/g)).toHaveLength(2)
    expect(postListSource).toContain("export default memo(PostList)")
    expect(postListSource).not.toContain("arePostListPropsEqual")
    expect(postListSource).not.toContain("arePostsEqual")
    expect(postCardSource).toContain("export default memo(PostCard)")
    expect(postCardSource).not.toContain("arePostCardPropsEqual")
    expect(postCardSource).toContain("INTERNAL_CATEGORY_TAGS")
    expect(readFileSync(path.join(feedRoot, "ProfileSummaryCard.tsx"), "utf8")).not.toContain("resolveContactLinks(null)")
  })

  test("모바일 홈은 태그 칩과 카드 1열을 유지하고 가로 overflow를 만들지 않는다", async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await mockHomeFeedRedesignEndpoints(page)

    await page.goto("/")

    await expect(page.locator('[data-ui="feed-tag-chip-rail"]')).toBeVisible()
    await expect(page.locator('[data-ui="feed-profile-summary"]')).toBeHidden()
    await expect(page.locator(".desktopPanel")).toBeHidden()
    await expect(page.locator('[data-ui="feed-post-card"]').nth(2)).toBeVisible()

    const layout = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-ui="feed-post-card"]')).slice(0, 3)
      const rects = cards.map((card) => {
        const rect = card.getBoundingClientRect()
        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width) }
      })

      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        rects,
      }
    })

    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1)
    expect(new Set(layout.rects.map((rect) => rect.left)).size).toBe(1)
  })
})
