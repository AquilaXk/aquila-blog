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

type MockDetailOverrides = {
  id?: number
  title?: string
  content?: string
  likesCount?: number
  commentsCount?: number
  hitCount?: number
  actorHasLiked?: boolean
  actorCanModify?: boolean
  actorCanDelete?: boolean
}

const DETAIL_CONTENT = [
  "| 항목 | 설명 |",
  "| --- | --- |",
  "| 증상 | iPhone 15 Pro에서 가로 스크롤 없이 본문에 맞춰 표시되어야 한다 |",
  "| 원인 | 레이아웃 폭 계산/스크롤 컨테이너 처리 불일치 |",
  "",
  "| 단계 | 핵심 요소 | 설명 |",
  "| --- | --- | --- |",
  "| 연결 | WebSocket | 실시간 양방향 채널을 유지한다 |",
  "| 인증 | STOMP CONNECT | 토큰 검증 시점을 분리한다 |",
  "",
  "```kotlin",
  "fun ensureMobileLayout(width: Int) = if (width <= 393) \"safe\" else \"ok\"",
  "```",
].join("\n")

const mockDetailEndpoint = async (page: Page, overrides: MockDetailOverrides = {}) => {
  const postId = overrides.id ?? 990
  await page.route(`**/post/api/v1/posts/${postId}**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: postId,
        createdAt: "2026-03-21T00:00:00Z",
        modifiedAt: "2026-03-21T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "모바일 테이블/코드블록 회귀 테스트",
        content: DETAIL_CONTENT,
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
        ...overrides,
        id: postId,
        content: overrides.content ?? DETAIL_CONTENT,
      }),
    })
  })

  await page.route(`**/post/api/v1/posts/${postId}/hit**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: (overrides.hitCount ?? 0) + 1 },
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
    const tables = Array.from(document.querySelectorAll("table"))
    const firstTable = tables[0] ?? null
    const secondTable = tables[1] ?? null
    const firstTableHead = firstTable?.querySelector("thead") as HTMLElement | null
    const firstTableCell = firstTable?.querySelector("tbody td, tbody th") as HTMLElement | null
    const secondTableHead = secondTable?.querySelector("thead") as HTMLElement | null
    const secondTableCell = secondTable?.querySelector("tbody td, tbody th") as HTMLElement | null
    const tableScrolls = Array.from(document.querySelectorAll<HTMLElement>(".aq-table-scroll"))
    const firstTableScroll = tableScrolls[0] ?? null
    const secondTableScroll = tableScrolls[1] ?? null
    const firstCodeShell = document.querySelector(".aq-code-shell")
    const codeRect = firstCodeBlock ? (firstCodeBlock as HTMLElement).getBoundingClientRect() : null
    const tableRect = firstTable ? (firstTable as HTMLElement).getBoundingClientRect() : null
    const secondTableRect = secondTable ? (secondTable as HTMLElement).getBoundingClientRect() : null
    const firstTableScrollRect = firstTableScroll ? firstTableScroll.getBoundingClientRect() : null
    const secondTableScrollRect = secondTableScroll ? secondTableScroll.getBoundingClientRect() : null
    const codeStyle = firstCodeBlock ? window.getComputedStyle(firstCodeBlock as HTMLElement) : null
    const codeShellStyle = firstCodeShell ? window.getComputedStyle(firstCodeShell as HTMLElement) : null
    const firstTableScrollStyle = firstTableScroll ? window.getComputedStyle(firstTableScroll) : null
    const secondTableScrollStyle = secondTableScroll ? window.getComputedStyle(secondTableScroll) : null
    const codeShellElement = firstCodeShell as HTMLElement | null
    const codeShellScrollLeftBefore = codeShellElement?.scrollLeft ?? null
    if (codeShellElement) {
      const maxScrollX = Math.max(0, codeShellElement.scrollWidth - codeShellElement.clientWidth)
      codeShellElement.scrollLeft = Math.min(maxScrollX, 180)
    }
    const codeShellScrollLeftAfter = codeShellElement?.scrollLeft ?? null

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
      codeShellTouchAction: codeShellStyle?.touchAction ?? null,
      codeShellOverscrollBehaviorX: codeShellStyle?.overscrollBehaviorX ?? null,
      codeShellScrollLeftBefore,
      codeShellScrollLeftAfter,
      tableRight: tableRect?.right ?? null,
      secondTableRight: secondTableRect?.right ?? null,
      firstTableScrollRight: firstTableScrollRect?.right ?? null,
      secondTableScrollRight: secondTableScrollRect?.right ?? null,
      firstTableScrollClientWidth: firstTableScroll?.clientWidth ?? null,
      firstTableScrollWidth: firstTableScroll?.scrollWidth ?? null,
      secondTableScrollClientWidth: secondTableScroll?.clientWidth ?? null,
      secondTableScrollWidth: secondTableScroll?.scrollWidth ?? null,
      firstTableScrollOverflowX: firstTableScrollStyle?.overflowX ?? null,
      secondTableScrollOverflowX: secondTableScrollStyle?.overflowX ?? null,
      firstTableCellLabel: firstTableCell?.getAttribute("data-label") ?? null,
      firstTableHeadDisplay: firstTableHead ? window.getComputedStyle(firstTableHead).display : null,
      firstTableCellBeforeContent: firstTableCell
        ? window.getComputedStyle(firstTableCell, "::before").content
        : null,
      secondTableHeadDisplay: secondTableHead ? window.getComputedStyle(secondTableHead).display : null,
      secondTableCellBeforeContent: secondTableCell
        ? window.getComputedStyle(secondTableCell, "::before").content
        : null,
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
  const tables = page.locator("table")
  await expect(tables).toHaveCount(2)
  await expect(tables.first()).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const firstSnapshot = await captureLayoutSnapshot(page)
  expect(firstSnapshot.htmlScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.bodyScrollWidth).toBeLessThanOrEqual(firstSnapshot.viewportWidth)
  expect(firstSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect((firstSnapshot.codeShellScrollWidth ?? 0) >= (firstSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(firstSnapshot.codeShellOverflowX)
  expect(firstSnapshot.codeShellTouchAction).toBe("pan-x")
  expect(firstSnapshot.codeShellOverscrollBehaviorX).toBe("contain")
  expect((firstSnapshot.codeShellScrollLeftAfter ?? 0) >= (firstSnapshot.codeShellScrollLeftBefore ?? 0)).toBeTruthy()
  expect(["auto", "scroll", "hidden", "clip"]).toContain(firstSnapshot.codeOverflowX)
  expect(firstSnapshot.firstTableScrollRight ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect(firstSnapshot.secondTableScrollRight ?? 0).toBeLessThanOrEqual(firstSnapshot.viewportWidth + 0.5)
  expect((firstSnapshot.firstTableScrollWidth ?? 0) >= (firstSnapshot.firstTableScrollClientWidth ?? 0)).toBeTruthy()
  expect((firstSnapshot.secondTableScrollWidth ?? 0) >= (firstSnapshot.secondTableScrollClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(firstSnapshot.firstTableScrollOverflowX)
  expect(["auto", "scroll"]).toContain(firstSnapshot.secondTableScrollOverflowX)
  expect((firstSnapshot.tableRight ?? 0) >= (firstSnapshot.firstTableScrollRight ?? 0)).toBeTruthy()
  expect((firstSnapshot.secondTableRight ?? 0) >= (firstSnapshot.secondTableScrollRight ?? 0)).toBeTruthy()
  expect(firstSnapshot.firstTableCellLabel).toBe("항목")
  expect(firstSnapshot.firstTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(firstSnapshot.firstTableCellBeforeContent)
  expect(firstSnapshot.secondTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(firstSnapshot.secondTableCellBeforeContent)

  await page.reload()
  await expect(page.locator("table").first()).toBeVisible()
  await expect(page.locator("pre")).toBeVisible()

  const secondSnapshot = await captureLayoutSnapshot(page)
  expect(secondSnapshot.htmlScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.bodyScrollWidth).toBeLessThanOrEqual(secondSnapshot.viewportWidth)
  expect(secondSnapshot.codeShellClientWidth ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect((secondSnapshot.codeShellScrollWidth ?? 0) >= (secondSnapshot.codeShellClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(secondSnapshot.codeShellOverflowX)
  expect(secondSnapshot.codeShellTouchAction).toBe("pan-x")
  expect(secondSnapshot.codeShellOverscrollBehaviorX).toBe("contain")
  expect((secondSnapshot.codeShellScrollLeftAfter ?? 0) >= (secondSnapshot.codeShellScrollLeftBefore ?? 0)).toBeTruthy()
  expect(["auto", "scroll", "hidden", "clip"]).toContain(secondSnapshot.codeOverflowX)
  expect(secondSnapshot.firstTableScrollRight ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect(secondSnapshot.secondTableScrollRight ?? 0).toBeLessThanOrEqual(secondSnapshot.viewportWidth + 0.5)
  expect((secondSnapshot.firstTableScrollWidth ?? 0) >= (secondSnapshot.firstTableScrollClientWidth ?? 0)).toBeTruthy()
  expect((secondSnapshot.secondTableScrollWidth ?? 0) >= (secondSnapshot.secondTableScrollClientWidth ?? 0)).toBeTruthy()
  expect(["auto", "scroll"]).toContain(secondSnapshot.firstTableScrollOverflowX)
  expect(["auto", "scroll"]).toContain(secondSnapshot.secondTableScrollOverflowX)
  expect((secondSnapshot.tableRight ?? 0) >= (secondSnapshot.firstTableScrollRight ?? 0)).toBeTruthy()
  expect((secondSnapshot.secondTableRight ?? 0) >= (secondSnapshot.secondTableScrollRight ?? 0)).toBeTruthy()
  expect(secondSnapshot.firstTableCellLabel).toBe("항목")
  expect(secondSnapshot.firstTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(secondSnapshot.firstTableCellBeforeContent)
  expect(secondSnapshot.secondTableHeadDisplay).not.toBe("none")
  expect(["none", "normal"]).toContain(secondSnapshot.secondTableCellBeforeContent)
})

test("iPhone 15 Pro 상세 액션은 메타/공유/댓글/작성자 유틸리티 순서를 유지한다", async ({ page }) => {
  await mockDetailEndpoint(page, {
    id: 991,
    title: "모바일 액션 위계 테스트",
    likesCount: 1,
    commentsCount: 4,
    hitCount: 24,
    actorCanModify: true,
    actorCanDelete: true,
  })

  await page.goto("/posts/991")

  const engagementRow = page.locator('[aria-label="post engagement"]')
  const commentStat = engagementRow.locator(".commentStatChip")
  const hitStat = engagementRow.locator(".viewStatChip")
  const likeButton = engagementRow.getByRole("button", { name: "좋아요 1" })
  const compactActionBar = page.getByLabel("빠른 이동 및 반응")
  const shareButton = compactActionBar.getByRole("button", { name: /^공유/ })
  const commentButton = compactActionBar.getByRole("button", { name: /^댓글/ })
  const editButton = page.getByRole("button", { name: "수정" }).first()
  const deleteButton = page.getByRole("button", { name: "삭제" }).first()

  await expect(commentStat).toBeHidden()
  await expect(hitStat).toContainText("조회")
  await expect(hitStat).toContainText("25")
  await expect(likeButton).toBeVisible()
  await expect(shareButton).toBeVisible()
  await expect(commentButton).toBeVisible()
  await expect(editButton).toBeVisible()
  await expect(deleteButton).toBeVisible()

  const [hitBox, likeBox, shareBox, commentActionBox, editBox, deleteBox] = await Promise.all([
    hitStat.boundingBox(),
    likeButton.boundingBox(),
    shareButton.boundingBox(),
    commentButton.boundingBox(),
    editButton.boundingBox(),
    deleteButton.boundingBox(),
  ])

  expect(hitBox).not.toBeNull()
  expect(likeBox).not.toBeNull()
  expect(shareBox).not.toBeNull()
  expect(commentActionBox).not.toBeNull()
  expect(editBox).not.toBeNull()
  expect(deleteBox).not.toBeNull()

  expect(Math.abs((hitBox?.y ?? 0) - (likeBox?.y ?? 0))).toBeLessThanOrEqual(4)
  expect((likeBox?.x ?? 0)).toBeGreaterThan((hitBox?.x ?? 0))
  expect((likeBox?.width ?? 0)).toBeGreaterThan((hitBox?.width ?? 0))
  expect((shareBox?.y ?? 0)).toBeGreaterThan((likeBox?.y ?? 0) + ((likeBox?.height ?? 0) * 0.6))
  expect(Math.abs((shareBox?.y ?? 0) - (commentActionBox?.y ?? 0))).toBeLessThanOrEqual(4)
  expect((editBox?.y ?? 0)).toBeLessThan((likeBox?.y ?? 0))
  expect((deleteBox?.y ?? 0)).toBeLessThan((likeBox?.y ?? 0))
})
