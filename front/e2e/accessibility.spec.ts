import { expect, test, type Page } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"

const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
const AVATAR_PNG = Buffer.from(AVATAR_PNG_BASE64, "base64")

const mockAvatarAsset = async (page: Page) => {
  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })
}

const mockAnonymousSession = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "로그인 후 이용해주세요.", data: null }),
    })
  })
}

const mockFeedEndpoints = async (page: Page) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            id: 1601,
            createdAt: "2026-03-22T00:00:00Z",
            modifiedAt: "2026-03-22T00:00:00Z",
            authorId: 1,
            authorName: "관리자",
            authorUsername: "aquila",
            authorProfileImgUrl: "/avatar.png",
            title: "접근성 점검용 피드 카드",
            summary: "A11y smoke",
            tags: ["a11y"],
            category: ["테스트"],
            published: true,
            listed: true,
            likesCount: 1,
            commentsCount: 1,
            hitCount: 10,
          },
        ],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 1,
          totalPages: 1,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 0,
          totalPages: 0,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 0,
          totalPages: 0,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "a11y", count: 1 }]),
    })
  })
}

const mockDetailEndpoint = async (page: Page) => {
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
        title: "접근성 상세 점검",
        content: "## 본문 제목\n\n접근성 점검용 문단입니다.",
        tags: ["a11y"],
        category: ["테스트"],
        published: true,
        listed: true,
        likesCount: 1,
        commentsCount: 1,
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
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 11 },
      }),
    })
  })
}

const expectNoCriticalViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()

  const criticalOrSerious = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact || "")
  )
  expect(criticalOrSerious).toEqual([])
}

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
})

test("홈 피드 주요 영역은 심각도 높은 접근성 위반이 없다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.goto("/")
  await expect(page.locator("main")).toBeVisible()
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expectNoCriticalViolations(page)
})

test("상세 페이지는 심각도 높은 접근성 위반이 없다", async ({ page }) => {
  await mockDetailEndpoint(page)
  await page.goto("/posts/991")
  await expect(page.getByRole("heading", { name: "접근성 상세 점검" })).toBeVisible()
  await expectNoCriticalViolations(page)
})
