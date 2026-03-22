import { expect, test, type Page, type Route } from "@playwright/test"

const clsBudget = Number(process.env.CLS_BUDGET || 0.1)
const homeClsBudget = Number(process.env.CLS_BUDGET_HOME || 0.12)
const clsAssertionEpsilon = Number(process.env.CLS_ASSERTION_EPSILON || 0.005)
const jitterBudgetPx = Number(process.env.JITTER_BUDGET_PX || 2)
const refreshCheckRoutes = ["/", "/about", "/admin", "/admin/profile", "/admin/posts/new", "/admin/tools"]

const buildMockExploreItem = (id: number) => ({
  id,
  createdAt: "2026-03-17T00:00:00Z",
  modifiedAt: "2026-03-17T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImgUrl: "/avatar.png",
  title: `CLS 예산 점검 ${id}`,
  summary: "layout shift regression gate",
  tags: ["perf"],
  category: ["backend"],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 0,
  hitCount: 0,
})

const mockFeedEndpoints = async (
  page: Page,
  options?: {
    feedHandler?: (route: Route) => Promise<void>
    exploreHandler?: (route: Route) => Promise<void>
  }
) => {
  const pixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBAp6pW2kAAAAASUVORK5CYII=",
    "base64"
  )

  await page.route("**/_next/image**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixelPng,
      headers: {
        "cache-control": "public, max-age=31536000, immutable",
      },
    })
  })

  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: pixelPng,
    })
  })

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    if (options?.feedHandler) {
      await options.feedHandler(route)
      return
    }

    const url = new URL(route.request().url())
    const isCursorEndpoint = url.pathname.endsWith("/cursor")

    if (isCursorEndpoint) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [buildMockExploreItem(1001)],
          pageSize: 30,
          hasNext: false,
          nextCursor: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [buildMockExploreItem(1001)],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 1,
          totalPages: 1,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    if (options?.exploreHandler) {
      await options.exploreHandler(route)
      return
    }

    const url = new URL(route.request().url())
    const isCursorEndpoint = url.pathname.endsWith("/cursor")

    if (isCursorEndpoint) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [buildMockExploreItem(1001)],
          pageSize: 30,
          hasNext: false,
          nextCursor: null,
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [buildMockExploreItem(1001)],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 1,
          totalPages: 1,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "perf", count: 1 }]),
    })
  })

  await page.route("**/member/api/v1/members/adminProfile", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        name: "관리자",
        nickname: "aquila",
        profileImageUrl: "/avatar.png",
        profileImageDirectUrl: "/avatar.png",
        profileRole: "Backend Developer",
        profileBio: "Hello World!",
        serviceLinks: [],
        contactLinks: [],
      }),
    })
  })

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "로그인 후 이용해주세요.", data: null }),
    })
  })
}

const installClsObserver = async (page: Page) => {
  await page.addInitScript(() => {
    ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    if (typeof PerformanceObserver !== "function") return
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          hadRecentInput?: boolean
          value?: number
        }
        if (!shift.hadRecentInput) {
          ;(window as unknown as { __aqCls: number }).__aqCls += shift.value ?? 0
        }
      }
    })
    try {
      observer.observe({ type: "layout-shift", buffered: true })
    } catch {
      ;(window as unknown as { __aqCls: number }).__aqCls = 0
    }
  })
}

const getLayoutSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const getLeft = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return null
      return Number((element as HTMLElement).getBoundingClientRect().left.toFixed(2))
    }

    return {
      logoLeft: getLeft('a[href="/"]'),
      authLeft: getLeft(".authArea"),
      mainLeft: getLeft("main"),
    }
  })

const getWidthLockSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const main = document.querySelector("#__next > main")
    const headerContainer =
      document.querySelector(".container[data-full-width]") ?? document.querySelector("[data-full-width]")

    const readWidth = (element: Element | null) =>
      element ? Math.round((element as HTMLElement).getBoundingClientRect().width) : 0

    return {
      viewport: window.innerWidth,
      mainWidth: readWidth(main),
      headerWidth: readWidth(headerContainer),
    }
  })

const waitForStableHeaderAuthState = async (page: Page) => {
  await page
    .waitForSelector('.authArea:not([data-auth-state="loading"])', {
      timeout: 1200,
    })
    .catch(() => {})
}

const getMaxHorizontalJitter = (
  before: Awaited<ReturnType<typeof getLayoutSnapshot>>,
  after: Awaited<ReturnType<typeof getLayoutSnapshot>>
) => {
  const diffs = [Math.abs((before.logoLeft ?? 0) - (after.logoLeft ?? 0))]
  if (before.authLeft !== null && after.authLeft !== null) {
    diffs.push(Math.abs(before.authLeft - after.authLeft))
  }
  if (before.mainLeft !== null && after.mainLeft !== null) {
    diffs.push(Math.abs(before.mainLeft - after.mainLeft))
  }
  return Math.max(...diffs)
}

test("홈 페이지 CLS(web-vitals) 예산을 통과한다", async ({ page }) => {
  await installClsObserver(page)
  await mockFeedEndpoints(page)
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(1500)

  const cls = await page.evaluate(() => (window as unknown as { __aqCls?: number }).__aqCls ?? 0)
  console.log(`[web-vitals] CLS=${cls.toFixed(4)} budget=${homeClsBudget}`)
  expect(cls).toBeLessThanOrEqual(homeClsBudget + clsAssertionEpsilon)
})

test("주요 페이지는 새로고침 후 수평 꿈틀과 CLS 예산을 통과한다", async ({ page }) => {
  await installClsObserver(page)
  await mockFeedEndpoints(page)

  for (const route of refreshCheckRoutes) {
    await page.goto(route)
    await page.waitForLoadState("networkidle")
    await waitForStableHeaderAuthState(page)
    await page.waitForTimeout(300)
    const before = await getLayoutSnapshot(page)
    await page.evaluate(() => {
      ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    })

    await page.reload({ waitUntil: "networkidle" })
    await waitForStableHeaderAuthState(page)
    await page.waitForTimeout(1000)
    const after = await getLayoutSnapshot(page)

    const jitterPx = getMaxHorizontalJitter(before, after)
    const cls = await page.evaluate(() => (window as unknown as { __aqCls?: number }).__aqCls ?? 0)

    console.log(
      `[refresh-jitter] route=${route} jitter=${jitterPx.toFixed(2)}px budget=${jitterBudgetPx} cls=${cls.toFixed(4)} budget=${clsBudget}`
    )
    expect(jitterPx).toBeLessThanOrEqual(jitterBudgetPx)
    expect(cls).toBeLessThanOrEqual(clsBudget + clsAssertionEpsilon)
  }
})

test("메인 레이아웃은 desktop width-lock 구간(1057~1440)에서 1024px 레일을 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  const checkpoints = [
    { viewport: 1300, expectedLocked: 1024 },
    { viewport: 1100, expectedLocked: 1024 },
    { viewport: 1060, expectedLocked: 1024 },
  ]

  for (const checkpoint of checkpoints) {
    await page.setViewportSize({ width: checkpoint.viewport, height: 900 })
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await waitForStableHeaderAuthState(page)

    const snapshot = await getWidthLockSnapshot(page)
    expect(snapshot.mainWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
    expect(snapshot.headerWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
  }

  await page.setViewportSize({ width: 1056, height: 900 })
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await waitForStableHeaderAuthState(page)

  const fluidSnapshot = await getWidthLockSnapshot(page)
  expect(fluidSnapshot.mainWidth).toBeGreaterThan(1024)
  expect(fluidSnapshot.headerWidth).toBeGreaterThan(1024)
  expect(fluidSnapshot.mainWidth).toBeCloseTo(fluidSnapshot.viewport, 0)
  expect(fluidSnapshot.headerWidth).toBeCloseTo(fluidSnapshot.viewport, 0)
})

test("홈 피드 무한스크롤은 연속 트리거에서도 feed 호출이 폭주하지 않는다", async ({ page }) => {
  const feedCalls: number[] = []
  const feedCallSignatures: string[] = []
  const totalElements = 6
  const pageMap: Record<number, number[]> = {
    1: [1001, 1002],
    2: [1003, 1004],
    3: [1005, 1006],
  }

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const cursorParam = url.searchParams.get("cursor")
      const page = isCursorEndpoint
        ? cursorParam
          ? Number(cursorParam.replace("cursor-", "")) || 1
          : 1
        : Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")
      const ids = pageMap[page] ?? []
      feedCalls.push(page)
      const signature = `${isCursorEndpoint ? "cursor" : "page"}:${page}`
      feedCallSignatures.push(signature)
      const hasNext = page < 3
      const nextCursor = hasNext ? `cursor-${page + 1}` : null

      if (isCursorEndpoint) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content: ids.map(buildMockExploreItem),
            pageSize,
            hasNext,
            nextCursor,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: ids.map(buildMockExploreItem),
          pageable: {
            pageNumber: Math.max(page - 1, 0),
            pageSize,
            totalElements,
            totalPages: 3,
          },
        }),
      })
    },
  })

  await page.goto("/")
  await page.waitForLoadState("networkidle")

  for (let i = 0; i < 8; i += 1) {
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })
    })
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(1200)

  const uniqueCalls = Array.from(new Set(feedCalls))
  const callCounts = feedCallSignatures.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const duplicatedPages = Object.entries(callCounts).filter(([, count]) => count > 1)
  console.log(
    `[infinite-load-guard] calls=${JSON.stringify(feedCalls)} signatures=${JSON.stringify(feedCallSignatures)} unique=${JSON.stringify(uniqueCalls)}`
  )
  if (uniqueCalls.length > 0) {
    expect(uniqueCalls[0]).toBe(1)
    expect(uniqueCalls.every((value) => [1, 2, 3].includes(value))).toBe(true)
  }
  expect(duplicatedPages).toHaveLength(0)
  expect(feedCalls.length).toBeLessThanOrEqual(3)
})

test("홈 피드 긴 목록에서도 동일 page를 중복 요청하지 않는다", async ({ page }) => {
  const feedCalls: number[] = []
  const feedCallSignatures: string[] = []
  const pageMap: Record<number, number[]> = {
    1: [2001, 2002],
    2: [2003, 2004],
    3: [2005, 2006],
    4: [2007, 2008],
    5: [2009, 2010],
    6: [2011, 2012],
  }
  const totalElements = 12

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const cursorParam = url.searchParams.get("cursor")
      const page = isCursorEndpoint
        ? cursorParam
          ? Number(cursorParam.replace("cursor-", "")) || 1
          : 1
        : Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")
      const ids = pageMap[page] ?? []
      feedCalls.push(page)
      const signature = `${isCursorEndpoint ? "cursor" : "page"}:${page}`
      feedCallSignatures.push(signature)
      const hasNext = page < 6
      const nextCursor = hasNext ? `cursor-${page + 1}` : null

      if (isCursorEndpoint) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            content: ids.map(buildMockExploreItem),
            pageSize,
            hasNext,
            nextCursor,
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: ids.map(buildMockExploreItem),
          pageable: {
            pageNumber: Math.max(page - 1, 0),
            pageSize,
            totalElements,
            totalPages: 6,
          },
        }),
      })
    },
  })

  await page.goto("/")
  await page.waitForLoadState("networkidle")

  for (let i = 0; i < 28; i += 1) {
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: "auto" })
    })
    await page.waitForTimeout(220)
  }
  await page.waitForTimeout(1200)

  const callCounts = feedCallSignatures.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  const duplicatedPages = Object.entries(callCounts).filter(([, count]) => count > 1)
  const maxRequestedPage = feedCalls.length ? Math.max(...feedCalls) : 0

  console.log(
    `[infinite-long-list] calls=${JSON.stringify(feedCalls)} signatures=${JSON.stringify(feedCallSignatures)} duplicated=${JSON.stringify(duplicatedPages)}`
  )
  if (feedCalls.length > 0) {
    expect(feedCalls[0]).toBe(1)
  }
  expect(maxRequestedPage).toBeLessThanOrEqual(6)
  expect(duplicatedPages).toHaveLength(0)
})
