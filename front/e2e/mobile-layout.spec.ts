import { expect, test, type Page } from "@playwright/test"

const MOBILE_VIEWPORT = { width: 393, height: 852 }
const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
const AVATAR_PNG = Buffer.from(AVATAR_PNG_BASE64, "base64")

test.use({
  viewport: MOBILE_VIEWPORT,
  isMobile: true,
  hasTouch: true,
})

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

const createExplorePage = (title: string, tag = "모바일테스트") => ({
  content: [
    {
      id: 1501,
      createdAt: "2026-03-20T00:00:00Z",
      modifiedAt: "2026-03-20T00:00:00Z",
      authorId: 1,
      authorName: "관리자",
      authorUsername: "aquila",
      authorProfileImgUrl: "/avatar.png",
      title,
      summary: "iPhone 15 Pro 레이아웃 회귀 자동화",
      tags: [tag],
      category: ["테스트"],
      published: true,
      listed: true,
      likesCount: 0,
      commentsCount: 0,
      hitCount: 0,
    },
  ],
  pageable: {
    pageNumber: 0,
    pageSize: 30,
    totalElements: 1,
    totalPages: 1,
  },
})

const mockFeedEndpoints = async (page: Page) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("모바일 카드 overflow 회귀 점검")),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "검색초기")),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || "모바일테스트"
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`태그:${tag}`, tag)),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "모바일테스트", count: 1 }]),
    })
  })
}

const mockDetailEndpoint = async (page: Page) => {
  await page.route("**/post/api/v1/posts/990", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 990,
        createdAt: "2026-03-21T00:00:00Z",
        modifiedAt: "2026-03-21T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "모바일 테이블/코드블록 회귀 테스트",
        content: [
          "| 항목 | 설명 |",
          "| --- | --- |",
          "| 증상 | iPhone 15 Pro에서 가로 스크롤 없이 본문에 맞춰 표시되어야 한다 |",
          "| 원인 | 레이아웃 폭 계산/스크롤 컨테이너 처리 불일치 |",
          "",
          "```kotlin",
          "fun ensureMobileLayout(width: Int) = if (width <= 393) \"safe\" else \"ok\"",
          "```",
        ].join("\n"),
        tags: ["모바일"],
        category: ["프론트"],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/990/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 1 },
      }),
    })
  })
}

const captureLayoutSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const viewportWidth = window.innerWidth
    const html = document.documentElement
    const body = document.body
    const cardRects = Array.from(document.querySelectorAll("a article")).map((el) =>
      (el as HTMLElement).getBoundingClientRect()
    )
    const firstCodeBlock = document.querySelector("pre")
    const firstTable = document.querySelector("table")
    const firstCodeShell = document.querySelector(".aq-code-shell")
    const codeRect = firstCodeBlock ? (firstCodeBlock as HTMLElement).getBoundingClientRect() : null
    const tableRect = firstTable ? (firstTable as HTMLElement).getBoundingClientRect() : null
    const codeStyle = firstCodeBlock ? window.getComputedStyle(firstCodeBlock as HTMLElement) : null
    const codeShellStyle = firstCodeShell ? window.getComputedStyle(firstCodeShell as HTMLElement) : null

    return {
      viewportWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyScrollWidth: body.scrollWidth,
      maxCardRight: cardRects.length ? Math.max(...cardRects.map((rect) => rect.right)) : 0,
      minCardLeft: cardRects.length ? Math.min(...cardRects.map((rect) => rect.left)) : 0,
      firstCardWidth: cardRects[0]?.width ?? 0,
      codeRight: codeRect?.right ?? null,
      codeClientWidth: firstCodeBlock ? (firstCodeBlock as HTMLElement).clientWidth : null,
      codeScrollWidth: firstCodeBlock ? (firstCodeBlock as HTMLElement).scrollWidth : null,
      codeOverflowX: codeStyle?.overflowX ?? null,
      codeShellClientWidth: firstCodeShell ? (firstCodeShell as HTMLElement).clientWidth : null,
      codeShellScrollWidth: firstCodeShell ? (firstCodeShell as HTMLElement).scrollWidth : null,
      codeShellOverflowX: codeShellStyle?.overflowX ?? null,
      tableRight: tableRect?.right ?? null,
    }
  })

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
})

test("iPhone 15 Pro 메인 피드는 카드 overflow 없이 viewport 내부에 렌더된다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expect(page.getByRole("button", { name: "헤더 메뉴 열기" })).toBeVisible()

  const firstSnapshot = await captureLayoutSnapshot(page)
  expect(firstSnapshot.htmlScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.bodyScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.maxCardRight).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect(firstSnapshot.minCardLeft).toBeGreaterThanOrEqual(-0.5)

  await page.reload()
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()

  const secondSnapshot = await captureLayoutSnapshot(page)
  expect(secondSnapshot.htmlScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.bodyScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(Math.abs(firstSnapshot.firstCardWidth - secondSnapshot.firstCardWidth)).toBeLessThanOrEqual(1.5)
})

test("iPhone 15 Pro 상세 본문(table/code block)은 가로 클리핑 없이 유지된다", async ({ page }) => {
  await mockDetailEndpoint(page)

  await page.goto("/posts/990")
  await expect(page.getByText("모바일 테이블/코드블록 회귀 테스트")).toBeVisible()
  await expect(page.locator("table")).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const firstSnapshot = await captureLayoutSnapshot(page)
  expect(firstSnapshot.htmlScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.bodyScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect((firstSnapshot.codeShellScrollWidth ?? 0) >= (firstSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(firstSnapshot.codeShellOverflowX)
  expect(["auto", "scroll", "hidden", "clip"]).toContain(firstSnapshot.codeOverflowX)
  expect(firstSnapshot.tableRight ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)

  await page.reload()
  await expect(page.locator("table")).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const secondSnapshot = await captureLayoutSnapshot(page)
  expect(secondSnapshot.htmlScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.bodyScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect((secondSnapshot.codeShellScrollWidth ?? 0) >= (secondSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(secondSnapshot.codeShellOverflowX)
  expect(["auto", "scroll", "hidden", "clip"]).toContain(secondSnapshot.codeOverflowX)
  expect(secondSnapshot.tableRight ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
})
