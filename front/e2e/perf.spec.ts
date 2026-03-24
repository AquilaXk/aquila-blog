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

const mockDetailRailEndpoint = async (page: Page, postId: number) => {
  await page.route(`**/post/api/v1/posts/${postId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: postId,
        createdAt: "2026-03-18T00:00:00Z",
        modifiedAt: "2026-03-18T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "상세 레일 스티키 회귀 점검",
        content: [
          "## 개요",
          "레일 스티키 안정성 검증용 본문입니다.",
          "",
          "### 목표",
          "좌/우 레일이 스크롤 중에도 본문 레이아웃을 침범하지 않아야 합니다.",
          "",
          "## 구현 메모",
          "하이브리드 sticky를 적용했습니다.",
          "",
          "### 전역 가드",
          "overflow-x 클리핑이 sticky를 깨지 않도록 가드합니다.",
          "",
          "## 검증",
          "충분한 스크롤 길이를 확보합니다.",
          "",
          "### 단계 1",
          "스크롤 위치 1200px 부근",
          "",
          "### 단계 2",
          "스크롤 위치 2200px 부근",
          "",
          "## 부록",
          "긴 본문 더미 문단",
          "",
          ...Array.from({ length: 80 }, (_, index) => `- 회귀 방지 체크 ${index + 1}`),
        ].join("\n"),
        tags: ["perf", "sticky"],
        category: ["frontend"],
        published: true,
        listed: true,
        likesCount: 2,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: true,
        actorCanDelete: true,
        type: ["Post"],
        status: ["Public"],
      }),
    })
  })

  await page.route(`**/post/api/v1/posts/${postId}/hit`, async (route) => {
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

  await page.route(`**/post/api/v1/posts/${postId}/like`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { liked: true, likesCount: 3 },
      }),
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
      layoutViewport: document.documentElement.clientWidth,
      bodyViewport: document.body.clientWidth,
      mainWidth: readWidth(main),
      headerWidth: readWidth(headerContainer),
    }
  })

const getRailStickySnapshot = async (page: Page) =>
  page.evaluate(() => {
    const readRect = (selector: string) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = (node as HTMLElement).getBoundingClientRect()
      return {
        top: Number(rect.top.toFixed(2)),
        left: Number(rect.left.toFixed(2)),
        width: Number(rect.width.toFixed(2)),
      }
    }

    const headerHeightRaw = getComputedStyle(document.documentElement)
      .getPropertyValue("--app-header-height")
      .trim()
    const headerHeight = Number.parseFloat(headerHeightRaw)
    return {
      expectedTop: (Number.isFinite(headerHeight) && headerHeight > 0 ? headerHeight : 56) + 16,
      leftRail: readRect(".leftRailInner"),
      rightRail: readRect(".rightRailInner"),
    }
  })

const getVisualLayoutFingerprint = async (page: Page) =>
  page.evaluate(() => {
    const readRect = (selector: string) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const rect = (node as HTMLElement).getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

    const isVisible = (selector: string) => {
      const node = document.querySelector(selector) as HTMLElement | null
      if (!node) return false
      const style = window.getComputedStyle(node)
      return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity) > 0
    }

    return {
      route: window.location.pathname,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      scrollWidth: {
        html: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      },
      rails: {
        chip: isVisible(".chipRail"),
        desktopTag: isVisible(".desktopPanel"),
        leftReaction: isVisible(".leftRailInner"),
        rightToc: isVisible(".rightRailInner"),
      },
      profileSidebarVisible: isVisible(".rt"),
      searchRect: readRect("#feed-search-input"),
      firstCardRect: readRect(".postColumn article"),
      desktopTagRailRect: readRect(".desktopPanel"),
      leftRailRect: readRect(".leftRailInner"),
      rightRailRect: readRect(".rightRailInner"),
    }
  })

const waitForStableHeaderAuthState = async (page: Page) => {
  await page
    .waitForSelector('.authArea:not([data-auth-state="loading"])', {
      timeout: 1200,
    })
    .catch(() => {})
}

const waitForPageReady = async (page: Page, options?: { waitAuth?: boolean }) => {
  await page.waitForLoadState("domcontentloaded")
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {})
  if (options?.waitAuth !== false) {
    await waitForStableHeaderAuthState(page)
  }
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
  await waitForPageReady(page)
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
    await waitForPageReady(page)
    await page.waitForTimeout(300)
    const before = await getLayoutSnapshot(page)
    await page.evaluate(() => {
      ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    })

    await page.reload({ waitUntil: "networkidle" })
    await waitForPageReady(page)
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

test("메인 레이아웃은 velog형 width tier(1728/1376/1024/100%)를 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.setViewportSize({ width: 2000, height: 900 })
  await page.goto("/")
  await waitForPageReady(page)

  const ultraWideSnapshot = await getWidthLockSnapshot(page)
  expect(ultraWideSnapshot.mainWidth).toBeCloseTo(1728, 0)
  expect(ultraWideSnapshot.headerWidth).toBeCloseTo(1728, 0)
  await expect(page.locator(".rt")).toBeVisible()

  await page.setViewportSize({ width: 1600, height: 900 })
  await page.reload({ waitUntil: "networkidle" })
  await waitForPageReady(page)

  const wideSnapshot = await getWidthLockSnapshot(page)
  expect(wideSnapshot.mainWidth).toBeCloseTo(1376, 0)
  expect(wideSnapshot.headerWidth).toBeCloseTo(1376, 0)
  await expect(page.locator(".rt")).toBeVisible()

  const checkpoints = [
    { viewport: 1300, expectedLocked: 1024 },
    { viewport: 1100, expectedLocked: 1024 },
    { viewport: 1060, expectedLocked: 1024 },
  ]

  for (const checkpoint of checkpoints) {
    await page.setViewportSize({ width: checkpoint.viewport, height: 900 })
    await page.reload({ waitUntil: "networkidle" })
    await waitForPageReady(page)

    const snapshot = await getWidthLockSnapshot(page)
    expect(snapshot.mainWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
    expect(snapshot.headerWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
    await expect(page.locator(".rt")).toBeHidden()
  }

  await page.setViewportSize({ width: 1056, height: 900 })
  await page.reload({ waitUntil: "networkidle" })
  await waitForPageReady(page)

  const fluidSnapshot = await getWidthLockSnapshot(page)
  const expectedFluidWidth = Math.min(fluidSnapshot.layoutViewport, fluidSnapshot.bodyViewport)
  expect(fluidSnapshot.mainWidth).toBeGreaterThan(1024)
  expect(fluidSnapshot.headerWidth).toBeGreaterThan(1024)
  expect(fluidSnapshot.mainWidth).toBeCloseTo(expectedFluidWidth, 0)
  expect(fluidSnapshot.headerWidth).toBeCloseTo(expectedFluidWidth, 0)
  await expect(page.locator(".rt")).toBeHidden()
})

test("메인 태그 레일은 1200/1201 전환과 넓은 데스크톱에서 안전하게 전환된다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.setViewportSize({ width: 1200, height: 900 })
  await page.goto("/")
  await waitForPageReady(page)
  await expect(page.locator(".chipRail")).toBeVisible()
  await expect(page.locator(".desktopPanel")).toBeHidden()

  await page.setViewportSize({ width: 1201, height: 900 })
  await page.reload({ waitUntil: "networkidle" })
  await waitForPageReady(page)
  await expect(page.locator(".chipRail")).toBeHidden()
  await expect(page.locator(".desktopPanel")).toBeVisible()
  await expect
    .poll(async () => {
      const rect = await page.locator(".desktopPanel").boundingBox()
      return rect?.x ?? -999
    })
    .toBeGreaterThanOrEqual(0)

  await page.setViewportSize({ width: 1680, height: 900 })
  await page.reload({ waitUntil: "networkidle" })
  await waitForPageReady(page)
  await expect(page.locator(".desktopPanel")).toBeVisible()

  const railRect = await page.locator(".desktopPanel").boundingBox()
  expect(railRect).not.toBeNull()
  expect((railRect?.x ?? -1)).toBeGreaterThanOrEqual(0)

  const firstCardRect = await page.locator(".postColumn article").first().boundingBox()
  expect(firstCardRect).not.toBeNull()
  const railRight = (railRect?.x ?? 0) + (railRect?.width ?? 0)
  const firstCardLeft = firstCardRect?.x ?? 0
  expect(firstCardLeft).toBeGreaterThanOrEqual(railRight + 8)
})

test("상세 좌/우 레일 sticky는 스크롤 전후 좌표를 안정적으로 유지한다", async ({ page }) => {
  const postId = 991
  await mockFeedEndpoints(page)
  await mockDetailRailEndpoint(page, postId)

  await page.setViewportSize({ width: 1440, height: 960 })
  await page.goto(`/posts/${postId}`)
  await waitForPageReady(page)
  await expect(page.getByText("상세 레일 스티키 회귀 점검")).toBeVisible()
  await expect(page.locator(".rightRailInner")).toBeVisible()
  await expect(page.locator(".leftRailInner")).toBeVisible()

  await page.evaluate(() => window.scrollTo({ top: 1200, behavior: "auto" }))
  await page.waitForTimeout(250)
  const midSnapshot = await getRailStickySnapshot(page)

  await page.evaluate(() => window.scrollTo({ top: 2200, behavior: "auto" }))
  await page.waitForTimeout(250)
  const deepSnapshot = await getRailStickySnapshot(page)

  expect(midSnapshot.leftRail).not.toBeNull()
  expect(midSnapshot.rightRail).not.toBeNull()
  expect(deepSnapshot.leftRail).not.toBeNull()
  expect(deepSnapshot.rightRail).not.toBeNull()

  const topTolerance = 2.5
  expect(Math.abs((midSnapshot.leftRail?.top ?? 0) - midSnapshot.expectedTop)).toBeLessThanOrEqual(topTolerance)
  expect(Math.abs((midSnapshot.rightRail?.top ?? 0) - midSnapshot.expectedTop)).toBeLessThanOrEqual(topTolerance)
  expect(Math.abs((deepSnapshot.leftRail?.top ?? 0) - deepSnapshot.expectedTop)).toBeLessThanOrEqual(topTolerance)
  expect(Math.abs((deepSnapshot.rightRail?.top ?? 0) - deepSnapshot.expectedTop)).toBeLessThanOrEqual(topTolerance)

  expect(Math.abs((midSnapshot.leftRail?.left ?? 0) - (deepSnapshot.leftRail?.left ?? 0))).toBeLessThanOrEqual(2)
  expect(Math.abs((midSnapshot.rightRail?.left ?? 0) - (deepSnapshot.rightRail?.left ?? 0))).toBeLessThanOrEqual(2)
})

test("핵심 화면 레이아웃 스냅샷(desktop/iPhone15/iPad mini)을 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await mockDetailRailEndpoint(page, 991)

  const scenarios = [
    { name: "home-desktop-1440", viewport: { width: 1440, height: 900 }, route: "/" },
    { name: "home-iphone15pro-393", viewport: { width: 393, height: 852 }, route: "/" },
    { name: "home-ipad-mini-768", viewport: { width: 768, height: 1024 }, route: "/" },
    { name: "detail-desktop-1440", viewport: { width: 1440, height: 900 }, route: "/posts/991" },
    { name: "detail-iphone15pro-393", viewport: { width: 393, height: 852 }, route: "/posts/991" },
    { name: "detail-ipad-mini-768", viewport: { width: 768, height: 1024 }, route: "/posts/991" },
  ] as const

  for (const scenario of scenarios) {
    await page.setViewportSize(scenario.viewport)
    await page.goto(scenario.route)
    await waitForPageReady(page)
    await page.waitForTimeout(160)
    const snapshot = await getVisualLayoutFingerprint(page)

    // Linux headless 환경의 scrollbar/layout viewport 편차로 home/detail desktop 1440은
    // x/y 절대 좌표가 흔들릴 수 있어 구조/폭/스크롤폭 범위 검증으로 고정한다.
    if (scenario.name === "home-desktop-1440") {
      expect(snapshot.route).toBe("/")
      expect(snapshot.viewport.width).toBe(1440)
      expect(snapshot.viewport.height).toBe(900)
      expect(snapshot.rails.desktopTag).toBe(true)
      expect(snapshot.rails.leftReaction).toBe(false)
      expect(snapshot.rails.rightToc).toBe(false)

      expect(snapshot.searchRect).not.toBeNull()
      expect(snapshot.firstCardRect).not.toBeNull()
      expect(snapshot.desktopTagRailRect).not.toBeNull()

      const searchWidth = snapshot.searchRect?.width ?? 0
      const searchHeight = snapshot.searchRect?.height ?? 0
      const firstCardWidth = snapshot.firstCardRect?.width ?? 0
      const firstCardHeight = snapshot.firstCardRect?.height ?? 0
      const railWidth = snapshot.desktopTagRailRect?.width ?? 0
      const railHeight = snapshot.desktopTagRailRect?.height ?? 0
      const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
      const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0

      expect(searchWidth).toBeGreaterThanOrEqual(600)
      expect(searchWidth).toBeLessThanOrEqual(680)
      expect(searchHeight).toBe(36)
      expect(firstCardWidth).toBeGreaterThanOrEqual(340)
      expect(firstCardWidth).toBeLessThanOrEqual(380)
      expect(firstCardHeight).toBeGreaterThanOrEqual(360)
      expect(firstCardHeight).toBeLessThanOrEqual(400)
      expect(railWidth).toBe(184)
      expect(railHeight).toBeGreaterThanOrEqual(84)
      expect(railHeight).toBeLessThanOrEqual(96)
      expect(htmlScrollWidth).toBeLessThanOrEqual(1440)
      expect(htmlScrollWidth).toBeGreaterThanOrEqual(1420)
      expect(bodyScrollWidth).toBeLessThanOrEqual(1440)
      expect(bodyScrollWidth).toBeGreaterThanOrEqual(1420)
      continue
    }

    if (scenario.name === "detail-desktop-1440") {
      expect(snapshot.route).toBe("/posts/991")
      expect(snapshot.viewport.width).toBe(1440)
      expect(snapshot.viewport.height).toBe(900)
      expect(snapshot.rails.desktopTag).toBe(false)
      expect(snapshot.rails.leftReaction).toBe(true)
      expect(snapshot.rails.rightToc).toBe(true)
      expect(snapshot.profileSidebarVisible).toBe(false)
      expect(snapshot.searchRect).toBeNull()
      expect(snapshot.firstCardRect).toBeNull()
      expect(snapshot.desktopTagRailRect).toBeNull()
      expect(snapshot.leftRailRect).not.toBeNull()
      expect(snapshot.rightRailRect).not.toBeNull()

      const leftRailWidth = snapshot.leftRailRect?.width ?? 0
      const leftRailHeight = snapshot.leftRailRect?.height ?? 0
      const leftRailY = snapshot.leftRailRect?.y ?? 0
      const rightRailWidth = snapshot.rightRailRect?.width ?? 0
      const rightRailHeight = snapshot.rightRailRect?.height ?? 0
      const rightRailY = snapshot.rightRailRect?.y ?? 0
      const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
      const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0

      expect(leftRailWidth).toBe(80)
      expect(leftRailHeight).toBeGreaterThanOrEqual(132)
      expect(leftRailHeight).toBeLessThanOrEqual(144)
      expect(leftRailY).toBeGreaterThanOrEqual(84)
      expect(leftRailY).toBeLessThanOrEqual(92)
      expect(rightRailWidth).toBe(240)
      expect(rightRailHeight).toBeGreaterThanOrEqual(280)
      expect(rightRailHeight).toBeLessThanOrEqual(320)
      expect(rightRailY).toBeGreaterThanOrEqual(84)
      expect(rightRailY).toBeLessThanOrEqual(92)
      expect(htmlScrollWidth).toBeLessThanOrEqual(1440)
      expect(htmlScrollWidth).toBeGreaterThanOrEqual(1420)
      expect(bodyScrollWidth).toBeLessThanOrEqual(1440)
      expect(bodyScrollWidth).toBeGreaterThanOrEqual(1420)
      continue
    }

    expect(JSON.stringify(snapshot, null, 2)).toMatchSnapshot(`${scenario.name}.json`)
  }
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
  await waitForPageReady(page)

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
  await waitForPageReady(page)

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
