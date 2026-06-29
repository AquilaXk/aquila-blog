import { expect, test } from "@playwright/test"
import {
  createExplorePage,
  createExplorePost,
  mockAvatarAsset,
  mockFeedEndpoints,
} from "./helpers/smokeFixtures"

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke feed and search", () => {
  test("홈 피드 기본 UI가 렌더링된다", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1200 })
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("정렬:CREATED_AT", "테스트태그", { thumbnail: "/avatar.png" })),
    })
  })

  await page.goto("/")
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
  await expect(page.locator('[data-ui="feed-home-product-shell"]')).toBeVisible()
  await expect(page.locator('[data-ui="feed-profile-summary"]')).toHaveCount(0)
  await expect(page.locator('section[aria-label="태그 목록"]')).toBeVisible()
  await expect(page.locator('[data-ui="feed-tag-chip-rail"]')).toBeHidden()
  await expect(page.locator(".thumbnail").first()).toBeVisible()
  await expect(page.locator(".rt")).toBeHidden()

  const homeStyles = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const styles = window.getComputedStyle(element)
      return {
        backgroundColor: styles.backgroundColor,
        borderBottomWidth: styles.borderBottomWidth,
        display: styles.display,
      }
    }

    return {
      firstCard: read('[data-ui="feed-post-card"] article'),
    }
  })

  expect(homeStyles.firstCard?.backgroundColor).toBe("rgb(247, 247, 245)")
  expect(homeStyles.firstCard?.borderBottomWidth).toBe("1px")
})

  test("피드 카드 thumbnail 로드 실패는 빈 사각형 대신 fallback cover를 렌더한다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        createExplorePage("깨진 썸네일 fallback", "테스트태그", { thumbnail: "https://cdn.example.invalid/broken.png" })
      ),
    })
  })
  await page.route("https://cdn.example.invalid/broken.png", async (route) => route.abort("failed"))

  await page.goto("/")

  const firstCard = page.locator('[data-ui="feed-post-card"]').first()
  await expect(firstCard.locator(".imageFallback")).toBeVisible()
  await expect(firstCard.locator(".imageFallback")).toContainText("깨진 썸네일 fallback")
})

  test("피드 카드는 빈 summary/category placeholder를 실제 데이터처럼 렌더링하지 않는다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        createExplorePage("빈 표시값 카드", "", {
          category: [],
          summary: "핵심 내용을 정리 중입니다.",
          tags: [],
          thumbnail: "https://cdn.example.invalid/empty-card.png",
        })
      ),
    })
  })
  await page.route("https://cdn.example.invalid/empty-card.png", async (route) => route.abort("failed"))

  await page.goto("/")

  const firstCard = page.locator('[data-ui="feed-post-card"]').first()
  await expect(firstCard.locator(".tagRow")).toHaveCount(0)
  await expect(firstCard.locator(".summary")).toHaveCount(0)
  await expect(firstCard.locator(".imageFallback")).toBeVisible()
  await expect(firstCard.locator(".imageFallback")).toContainText("빈 표시값 카드")
  await expect(firstCard.locator(".imageFallback")).not.toContainText("Engineering")
  await expect(firstCard).not.toContainText("핵심 내용을 정리 중입니다.")
})

  test("홈 topic rail은 실제 태그 count 상위 항목을 표시하고 tag 탐색으로 연결한다", async ({ page }) => {
  const capturedTag: string[] = []

  await page.setViewportSize({ width: 1680, height: 1200 })
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { tag: "alpha", count: 5 },
        { tag: "운영", count: 9 },
        { tag: "검색", count: 7 },
        { tag: "Spring", count: 1 },
      ]),
    })
  })
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || ""
    capturedTag.push(tag)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(tag ? `태그:${tag}` : "기본목록", tag || "운영")),
    })
  })

  await page.goto("/")
  const topicRail = page.locator('section[aria-label="태그 목록"]')
  await expect(topicRail).toBeVisible()
  await expect(topicRail.locator(".desktopList button[data-tag] .name")).toHaveText(["운영", "검색", "alpha", "Spring"])
  await expect(page.getByText("Architecture")).toHaveCount(0)
  await expect(page.getByText("Infrastructure")).toHaveCount(0)

  await topicRail.locator('button[data-tag="검색"]').click()

  await expect.poll(() => capturedTag.some((value) => value === "검색")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "태그:검색" })).toBeVisible()
})

  test("홈 topic rail은 모바일 viewport에서도 tag 탐색으로 연결한다", async ({ page }) => {
  const capturedTag: string[] = []

  await page.setViewportSize({ width: 390, height: 844 })
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        { tag: "운영", count: 9 },
        { tag: "검색", count: 7 },
        { tag: "alpha", count: 5 },
      ]),
    })
  })
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || ""
    capturedTag.push(tag)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(tag ? `태그:${tag}` : "기본목록", tag || "운영")),
    })
  })

  await page.goto("/")
  const topicRail = page.locator('[data-ui="feed-tag-chip-rail"]')
  await expect(topicRail).toBeVisible()

  await topicRail.locator('button[data-tag="검색"]').click()

  await expect.poll(() => capturedTag.some((value) => value === "검색")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "태그:검색" })).toBeVisible()
})

  test("홈 topic rail은 태그가 없으면 전체 항목만 렌더한다", async ({ page }) => {
  await page.setViewportSize({ width: 1680, height: 1200 })
  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    })
  })

  await page.goto("/")

  const topicRail = page.locator('section[aria-label="태그 목록"]')
  await expect(topicRail).toBeVisible()
  await expect(topicRail.locator(".desktopList button[data-tag]")).toHaveCount(0)
  await expect(topicRail.getByRole("button", { name: "전체보기" })).toBeVisible()
})

  test("홈 새로고침 이후에도 제품형 브랜드 문구를 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "비밀스러운 IT 공작소" })).toBeVisible()
  await expect(page.locator('[data-ui="feed-brand-role"]')).toBeVisible()
  await expect(page.getByText("비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다")).toBeVisible()
  await expect(page.getByText("aquilaXk's Blog")).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "비밀스러운 IT 공작소" })).toBeVisible()
  await expect(page.locator('[data-ui="feed-brand-role"]')).toBeVisible()
  await expect(page.getByText("비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다")).toBeVisible()
  await expect(page.getByText("aquilaXk's Blog")).toHaveCount(0)
})

  test("피드 카드 요약의 escaped quote는 화면에서 정리되어 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        createExplorePage("요약 정규화", "SSE", {
          summary: 'SSE 알림이 \\\\\\"잠깐 되다가 멈추는\\\\\\" 현상 추적',
        })
      ),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "SSE", count: 1 }]),
    })
  })

  await page.goto("/")
  await expect(page.getByText('SSE 알림이 "잠깐 되다가 멈추는" 현상 추적')).toBeVisible()
  await expect(page.getByText('\\"잠깐 되다가 멈추는\\"')).toHaveCount(0)
})

  test("검색 입력은 search API의 kw 파라미터를 통해 백엔드 탐색으로 동작한다", async ({ page }) => {
  const capturedKw: string[] = []

  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    capturedKw.push(kw)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "초기목록")),
    })
  })

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
  const searchInput = page.getByLabel("Search posts by keyword")
  await searchInput.fill("alpha")

  await expect.poll(() => capturedKw.some((value) => value === "alpha")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "검색:alpha" })).toBeVisible()
})

  test("검색 모드는 백엔드가 반환한 순서를 그대로 유지한다", async ({ page }) => {
  const capturedKw: string[] = []

  await mockAvatarAsset(page)
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("기본목록")),
    })
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 3 }]),
    })
  })
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    capturedKw.push(kw)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          createExplorePost({
            id: 301,
            title: "본문 exact phrase 매치",
            summary: `백엔드 순위 1: ${kw}`,
            tags: ["운영"],
            createdAt: "2026-01-01T00:00:00Z",
            modifiedAt: "2026-01-01T00:00:00Z",
          }),
          createExplorePost({
            id: 302,
            title: "alpha beta 제목 매치",
            summary: "클라이언트 재정렬이면 앞으로 오면 안 된다",
            tags: ["검색"],
            createdAt: "2026-03-16T00:00:00Z",
            modifiedAt: "2026-03-16T00:00:00Z",
            likesCount: 80,
            commentsCount: 20,
            hitCount: 4000,
          }),
          createExplorePost({
            id: 303,
            title: "태그 매치",
            summary: "태그로만 강한 문서",
            tags: ["alpha", "beta"],
            createdAt: "2026-03-15T00:00:00Z",
            modifiedAt: "2026-03-15T00:00:00Z",
          }),
        ],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 3,
          totalPages: 1,
        },
      }),
    })
  })

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
  const searchInput = page.getByLabel("Search posts by keyword")
  await searchInput.fill("alpha beta")

  await expect.poll(() => capturedKw.some((value) => value === "alpha beta")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "본문 exact phrase 매치" })).toBeVisible()
  const titles = await page.locator("a[href^='/posts/'] h2").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() || "").filter(Boolean)
  )
  expect(titles.slice(0, 3)).toEqual([
    "본문 exact phrase 매치",
    "alpha beta 제목 매치",
    "태그 매치",
  ])
})

  test("태그 쿼리 파라미터는 explore API의 tag 파라미터로 백엔드 탐색을 요청한다", async ({ page }) => {
  const capturedTag: string[] = []

  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || ""
    capturedTag.push(tag)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(tag ? `태그:${tag}` : "기본목록", tag || "테스트태그")),
    })
  })

  await page.goto("/?tag=%ED%85%8C%EC%8A%A4%ED%8A%B8%ED%83%9C%EA%B7%B8")

  await expect.poll(() => capturedTag.some((value) => value === "테스트태그")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "태그:테스트태그" })).toBeVisible()
})

  test("메인 피드 탐색 요청은 최신순 정렬(sort=CREATED_AT)로 고정된다", async ({ page }) => {
  const capturedSort: string[] = []

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    const url = new URL(route.request().url())
    const sort = url.searchParams.get("sort") || "CREATED_AT"
    capturedSort.push(sort)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`정렬:${sort}`)),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 1 }]),
    })
  })

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()

  await expect.poll(() => capturedSort.some((value) => value === "CREATED_AT")).toBeTruthy()
  await expect(page.locator("a[href^='/posts/'] h2").filter({ hasText: "정렬:CREATED_AT" })).toBeVisible()
})

  test("피드 카드 hover는 fallback 상세 _next/data prefetch를 만들지 않는다", async ({ page }) => {
  const dataPrefetchRequests: string[] = []

  await mockFeedEndpoints(page)
  page.on("request", (request) => {
    const url = request.url()
    if (url.includes("/_next/data/") && url.includes("/posts/101.json")) {
      dataPrefetchRequests.push(url)
    }
  })

  await page.goto("/")
  const firstCard = page.locator("a[href='/posts/101']").first()
  await expect(firstCard).toBeVisible()

  await firstCard.hover()
  await page.waitForTimeout(1400)

  expect(dataPrefetchRequests).toEqual([])
})
})
