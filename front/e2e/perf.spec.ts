import { expect, test, type Page, type Route } from "@playwright/test"

const clsBudget = Number(process.env.CLS_BUDGET || 0.1)
const homeClsBudget = Number(process.env.CLS_BUDGET_HOME || 0.12)
const clsAssertionEpsilon = Number(process.env.CLS_ASSERTION_EPSILON || 0.005)
const jitterBudgetPx = Number(process.env.JITTER_BUDGET_PX || 2)
const playwrightBaseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
const refreshCheckRoutes = ["/", "/about", "/admin", "/admin/dashboard", "/admin/profile", "/admin/posts", "/admin/tools"]

const mockTagCounts = [
  { tag: "perf", count: 10 },
  { tag: "frontend", count: 8 },
  { tag: "backend", count: 7 },
  { tag: "architecture", count: 6 },
  { tag: "testing", count: 5 },
  { tag: "deploy", count: 4 },
] as const

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
      body: JSON.stringify(mockTagCounts),
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

const mockAdminMonitoringEndpoints = async (page: Page) => {
  await page.unroute("**/member/api/v1/auth/me").catch(() => {})
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        name: "관리자",
        nickname: "aquila",
        email: "aquilaxk10@gmail.com",
        authorities: ["ROLE_ADMIN"],
      }),
    })
  })

  await page.route("**/system/api/v1/adm/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "UP",
        details: {
          ping: { status: "UP" },
          db: { status: "UP" },
        },
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

    const route = window.location.pathname

    return {
      route,
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
      ...(route === "/admin/dashboard"
        ? {
            dashboardServiceRailRect: readRect('[data-ui="monitoring-service-rail"]'),
            dashboardPanelGridRect: readRect('[data-ui="monitoring-panel-grid"]'),
            dashboardFirstPanelRect: readRect('[data-ui="monitoring-panel-card"]'),
          }
        : {}),
    }
  })

const getDesktopTagRailMetrics = async (page: Page) =>
  page.evaluate(() => {
    const listNode = document.querySelector(".desktopList") as HTMLElement | null
    const panelNode = document.querySelector(".desktopPanel") as HTMLElement | null
    if (!listNode || !panelNode) return null
    const rect = listNode.getBoundingClientRect()
    const panelRect = panelNode.getBoundingClientRect()
    return {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scrollHeight: Math.round(listNode.scrollHeight),
      panelBottom: Math.round(panelRect.bottom),
    }
  })

const waitForHomeTagRailReady = async (page: Page, viewportWidth: number) => {
  if (viewportWidth > 1200) {
    await expect
      .poll(
        async () =>
          page.evaluate(() => {
            const list = document.querySelector(".desktopList")
            if (!list) return 0
            return list.querySelectorAll("li").length
          }),
        { timeout: 5000 }
      )
      .toBeGreaterThanOrEqual(4)
    return
  }

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const rail = document.querySelector(".chipRail")
          if (!rail) return 0
          return rail.querySelectorAll("button").length
        }),
      { timeout: 5000 }
    )
    .toBeGreaterThanOrEqual(4)
}

const applySchemePreference = async (page: Page, scheme: "light" | "dark") => {
  await page.context().clearCookies()
  await page.context().addCookies([
    {
      name: "scheme",
      value: scheme,
      url: playwrightBaseURL,
    },
  ])
}

const waitForSchemeReady = async (page: Page, scheme: "light" | "dark") => {
  const expectedToggleLabel = scheme === "light" ? "다크 모드로 전환" : "라이트 모드로 전환"
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const toggle = document.querySelector('button[aria-label*="모드로 전환"]')
          return toggle?.getAttribute("aria-label") ?? null
        }),
      {
        timeout: 8000,
      }
    )
    .toBe(expectedToggleLabel)
}

const getThemeSurfaceFingerprint = async (page: Page) =>
  page.evaluate(() => {
    const readStyle = (selector: string, property: keyof CSSStyleDeclaration) => {
      const node = document.querySelector(selector)
      if (!node) return null
      return getComputedStyle(node as HTMLElement)[property] as string | null
    }

    const readThemeToggleLabel = () => {
      const toggle = document.querySelector('button[aria-label*="모드로 전환"]')
      return toggle?.getAttribute("aria-label") ?? null
    }

    return {
      route: window.location.pathname,
      themeToggleLabel: readThemeToggleLabel(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerBg: readStyle('[data-autohide]', "backgroundColor"),
      searchBg: readStyle(".field", "backgroundColor"),
      searchBorder: readStyle(".field", "borderTopColor"),
      cardBg: readStyle(".postColumn article", "backgroundColor"),
      cardBorder: readStyle(".postColumn article", "borderTopColor"),
      summaryBg: readStyle('[data-rum-section="summary"]', "backgroundColor"),
      summaryBorder: readStyle('[data-rum-section="summary"]', "borderTopColor"),
      authShellBg: readStyle('[data-auth-shell="true"]', "backgroundColor"),
      authShellBorder: readStyle('[data-auth-shell="true"]', "borderTopColor"),
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

const reloadForPerf = async (page: Page, options?: { waitAuth?: boolean }) => {
  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForPageReady(page, options)
}

const gotoForPerf = async (
  page: Page,
  route: string,
  options?: {
    waitAuth?: boolean
    readyText?: string
  }
) => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto(route, { waitUntil: "domcontentloaded" })
    await waitForPageReady(page, options)

    if (!options?.readyText) return

    const ready = await page.getByText(options.readyText).isVisible().catch(() => false)
    if (ready) return
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
    await gotoForPerf(page, route)
    await page.waitForTimeout(300)
    const before = await getLayoutSnapshot(page)
    await page.evaluate(() => {
      ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    })

    await reloadForPerf(page)
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
  await gotoForPerf(page, "/")

  const ultraWideSnapshot = await getWidthLockSnapshot(page)
  expect(ultraWideSnapshot.mainWidth).toBeCloseTo(1728, 0)
  expect(ultraWideSnapshot.headerWidth).toBeCloseTo(1728, 0)
  await expect(page.locator(".rt")).toBeVisible()

  await page.setViewportSize({ width: 1600, height: 900 })
  await reloadForPerf(page)

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
    await reloadForPerf(page)

    const snapshot = await getWidthLockSnapshot(page)
    expect(snapshot.mainWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
    expect(snapshot.headerWidth).toBeCloseTo(checkpoint.expectedLocked, 0)
    await expect(page.locator(".rt")).toBeHidden()
  }

  await page.setViewportSize({ width: 1056, height: 900 })
  await reloadForPerf(page)

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
  await gotoForPerf(page, "/")
  await expect(page.locator(".chipRail")).toBeVisible()
  await expect(page.locator(".desktopPanel")).toBeHidden()

  await page.setViewportSize({ width: 1201, height: 900 })
  await reloadForPerf(page)
  await expect(page.locator(".chipRail")).toBeHidden()
  await expect(page.locator(".desktopPanel")).toBeVisible()
  await expect
    .poll(async () => {
      const rect = await page.locator(".desktopPanel").boundingBox()
      return rect?.x ?? -999
    })
    .toBeGreaterThanOrEqual(0)

  await page.setViewportSize({ width: 1680, height: 900 })
  await reloadForPerf(page)
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
  await gotoForPerf(page, `/posts/${postId}`, { readyText: "상세 레일 스티키 회귀 점검" })
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
  await mockAdminMonitoringEndpoints(page)

  const scenarios = [
    { name: "home-desktop-1440", viewport: { width: 1440, height: 900 }, route: "/" },
    { name: "home-iphone15pro-393", viewport: { width: 393, height: 852 }, route: "/" },
    { name: "home-ipad-mini-768", viewport: { width: 768, height: 1024 }, route: "/" },
    { name: "detail-desktop-1440", viewport: { width: 1440, height: 900 }, route: "/posts/991" },
    { name: "detail-iphone15pro-393", viewport: { width: 393, height: 852 }, route: "/posts/991" },
    { name: "detail-ipad-mini-768", viewport: { width: 768, height: 1024 }, route: "/posts/991" },
    { name: "admin-dashboard-ipad-mini-768", viewport: { width: 768, height: 1024 }, route: "/admin/dashboard" },
  ] as const

  for (const scenario of scenarios) {
    await page.setViewportSize(scenario.viewport)
    await gotoForPerf(page, scenario.route, {
      readyText: scenario.route === "/posts/991" ? "상세 레일 스티키 회귀 점검" : undefined,
    })
    if (scenario.route === "/") {
      await waitForHomeTagRailReady(page, scenario.viewport.width)
    }
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
      const desktopTagRailMetrics = await getDesktopTagRailMetrics(page)
      expect(desktopTagRailMetrics).not.toBeNull()

      const searchWidth = snapshot.searchRect?.width ?? 0
      const searchHeight = snapshot.searchRect?.height ?? 0
      const firstCardWidth = snapshot.firstCardRect?.width ?? 0
      const firstCardHeight = snapshot.firstCardRect?.height ?? 0
      const railWidth = snapshot.desktopTagRailRect?.width ?? 0
      const railHeight = desktopTagRailMetrics?.height ?? 0
      const railScrollHeight = desktopTagRailMetrics?.scrollHeight ?? 0
      const railPanelBottom = desktopTagRailMetrics?.panelBottom ?? 0
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
      expect(railHeight).toBeLessThanOrEqual(560)
      expect(railScrollHeight).toBeGreaterThanOrEqual(railHeight)
      expect(railPanelBottom).toBeLessThanOrEqual(snapshot.viewport.height)
      expect(htmlScrollWidth).toBeLessThanOrEqual(1440)
      expect(htmlScrollWidth).toBeGreaterThanOrEqual(1420)
      expect(bodyScrollWidth).toBeLessThanOrEqual(1440)
      expect(bodyScrollWidth).toBeGreaterThanOrEqual(1420)
      continue
    }

    if (scenario.name === "home-iphone15pro-393") {
      expect(snapshot.route).toBe("/")
      expect(snapshot.viewport.width).toBe(393)
      expect(snapshot.viewport.height).toBe(852)
      expect(snapshot.rails.chip).toBe(true)
      expect(snapshot.rails.desktopTag).toBe(false)
      expect(snapshot.profileSidebarVisible).toBe(false)
      expect(snapshot.searchRect).not.toBeNull()
      expect(snapshot.firstCardRect).not.toBeNull()

      const searchWidth = snapshot.searchRect?.width ?? 0
      const searchHeight = snapshot.searchRect?.height ?? 0
      const searchY = snapshot.searchRect?.y ?? 0
      const firstCardWidth = snapshot.firstCardRect?.width ?? 0
      const firstCardHeight = snapshot.firstCardRect?.height ?? 0
      const firstCardY = snapshot.firstCardRect?.y ?? 0

      expect(searchWidth).toBeGreaterThanOrEqual(320)
      expect(searchWidth).toBeLessThanOrEqual(336)
      expect(searchHeight).toBe(34)
      expect(searchY).toBeGreaterThanOrEqual(156)
      expect(searchY).toBeLessThanOrEqual(188)
      expect(firstCardWidth).toBeGreaterThanOrEqual(360)
      expect(firstCardWidth).toBeLessThanOrEqual(370)
      expect(firstCardHeight).toBeGreaterThanOrEqual(388)
      expect(firstCardHeight).toBeLessThanOrEqual(404)
      expect(firstCardY).toBeGreaterThanOrEqual(298)
      expect(firstCardY).toBeLessThanOrEqual(332)
      continue
    }

    if (scenario.name === "home-ipad-mini-768") {
      expect(snapshot.route).toBe("/")
      expect(snapshot.viewport.width).toBe(768)
      expect(snapshot.viewport.height).toBe(1024)
      expect(snapshot.rails.chip).toBe(true)
      expect(snapshot.rails.desktopTag).toBe(false)
      expect(snapshot.profileSidebarVisible).toBe(false)
      expect(snapshot.searchRect).not.toBeNull()
      expect(snapshot.firstCardRect).not.toBeNull()

      const searchWidth = snapshot.searchRect?.width ?? 0
      const searchHeight = snapshot.searchRect?.height ?? 0
      const searchY = snapshot.searchRect?.y ?? 0
      const firstCardWidth = snapshot.firstCardRect?.width ?? 0
      const firstCardHeight = snapshot.firstCardRect?.height ?? 0
      const firstCardY = snapshot.firstCardRect?.y ?? 0

      expect(searchWidth).toBeGreaterThanOrEqual(692)
      expect(searchWidth).toBeLessThanOrEqual(710)
      expect(searchHeight).toBe(34)
      expect(searchY).toBeGreaterThanOrEqual(156)
      expect(searchY).toBeLessThanOrEqual(190)
      expect(firstCardWidth).toBeGreaterThanOrEqual(348)
      expect(firstCardWidth).toBeLessThanOrEqual(360)
      expect(firstCardHeight).toBeGreaterThanOrEqual(384)
      expect(firstCardHeight).toBeLessThanOrEqual(398)
      expect(firstCardY).toBeGreaterThanOrEqual(300)
      expect(firstCardY).toBeLessThanOrEqual(334)
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
      expect(leftRailHeight).toBeGreaterThanOrEqual(128)
      expect(leftRailHeight).toBeLessThanOrEqual(172)
      expect(leftRailY).toBeGreaterThanOrEqual(84)
      expect(leftRailY).toBeLessThanOrEqual(93)
      expect(rightRailWidth).toBe(240)
      expect(rightRailHeight).toBeGreaterThanOrEqual(280)
      expect(rightRailHeight).toBeLessThanOrEqual(380)
      expect(rightRailY).toBeGreaterThanOrEqual(84)
      expect(rightRailY).toBeLessThanOrEqual(93)
      expect(htmlScrollWidth).toBeLessThanOrEqual(1440)
      expect(htmlScrollWidth).toBeGreaterThanOrEqual(1420)
      expect(bodyScrollWidth).toBeLessThanOrEqual(1440)
      expect(bodyScrollWidth).toBeGreaterThanOrEqual(1420)
      continue
    }

    if (scenario.name === "admin-dashboard-ipad-mini-768") {
      expect(snapshot.route).toBe("/admin/dashboard")
      expect(snapshot.viewport.width).toBe(768)
      expect(snapshot.viewport.height).toBe(1024)
      expect(snapshot.dashboardServiceRailRect).not.toBeNull()
      expect(snapshot.dashboardPanelGridRect).not.toBeNull()
      expect(snapshot.dashboardFirstPanelRect).not.toBeNull()

      const serviceRailWidth = snapshot.dashboardServiceRailRect?.width ?? 0
      const panelGridWidth = snapshot.dashboardPanelGridRect?.width ?? 0
      const firstPanelWidth = snapshot.dashboardFirstPanelRect?.width ?? 0
      const firstPanelY = snapshot.dashboardFirstPanelRect?.y ?? 0
      const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
      const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0

      expect(serviceRailWidth).toBeGreaterThanOrEqual(720)
      expect(serviceRailWidth).toBeLessThanOrEqual(744)
      expect(panelGridWidth).toBeGreaterThanOrEqual(720)
      expect(panelGridWidth).toBeLessThanOrEqual(744)
      expect(firstPanelWidth).toBeGreaterThanOrEqual(720)
      expect(firstPanelWidth).toBeLessThanOrEqual(744)
      expect(firstPanelY).toBeGreaterThanOrEqual(290)
      expect(firstPanelY).toBeLessThanOrEqual(430)
      expect(htmlScrollWidth).toBeLessThanOrEqual(768)
      expect(bodyScrollWidth).toBeLessThanOrEqual(768)
      continue
    }

    expect(JSON.stringify(snapshot, null, 2)).toMatchSnapshot(`${scenario.name}.json`)
  }
})

test("public 핵심 화면은 dark/light 테마 서피스 계층을 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await mockDetailRailEndpoint(page, 991)

  const scenarios = [
    { route: "/", viewport: { width: 1440, height: 900 } },
    { route: "/", viewport: { width: 393, height: 852 } },
    { route: "/", viewport: { width: 768, height: 1024 } },
    { route: "/posts/991", viewport: { width: 1440, height: 900 } },
    { route: "/posts/991", viewport: { width: 393, height: 852 } },
    { route: "/posts/991", viewport: { width: 768, height: 1024 } },
    { route: "/login", viewport: { width: 1440, height: 900 } },
    { route: "/login", viewport: { width: 393, height: 852 } },
    { route: "/login", viewport: { width: 768, height: 1024 } },
  ] as const

  for (const scheme of ["dark", "light"] as const) {
    for (const scenario of scenarios) {
      await applySchemePreference(page, scheme)
      await page.setViewportSize(scenario.viewport)
      await gotoForPerf(page, scenario.route, {
        readyText: scenario.route === "/posts/991" ? "상세 레일 스티키 회귀 점검" : undefined,
      })
      await waitForSchemeReady(page, scheme)
      await page.waitForTimeout(120)

      const fingerprint = await getThemeSurfaceFingerprint(page)
      const expected = {
        dark: {
          bodyBg: "rgb(18, 18, 18)",
          headerBgChannel: "18, 18, 18",
          searchBg: "rgb(18, 18, 18)",
          searchBorder: "rgb(45, 45, 45)",
          cardBg: "rgb(18, 18, 18)",
          cardBorder: "rgb(38, 38, 38)",
          authShellBg: "rgb(18, 18, 18)",
          authShellBorder: "rgb(45, 45, 45)",
          toggleLabel: "라이트 모드로 전환",
        },
        light: {
          bodyBg: "rgb(243, 245, 248)",
          headerBgChannel: "249, 251, 254",
          searchBg: "rgb(255, 255, 255)",
          searchBorder: "rgb(215, 224, 234)",
          cardBg: "rgb(255, 255, 255)",
          cardBorder: "rgb(231, 237, 244)",
          authShellBg: "rgb(255, 255, 255)",
          authShellBorder: "rgb(215, 224, 234)",
          toggleLabel: "다크 모드로 전환",
        },
      }[scheme]

      expect(fingerprint.route).toBe(scenario.route)
      expect(fingerprint.bodyBg).toBe(expected.bodyBg)
      if (scheme === "light") {
        expect(fingerprint.headerBg).not.toBeNull()
        expect(fingerprint.headerBg).not.toBe(fingerprint.bodyBg)
      } else {
        expect(fingerprint.headerBg?.includes(expected.headerBgChannel)).toBe(true)
      }
      expect(fingerprint.themeToggleLabel).toBe(expected.toggleLabel)

      if (scenario.route === "/") {
        expect(fingerprint.searchBg).toBe(expected.searchBg)
        expect(fingerprint.searchBorder).toBe(expected.searchBorder)
        expect(fingerprint.cardBg).toBe(expected.cardBg)
        expect(fingerprint.cardBorder).toBe(expected.cardBorder)
      }

      if (scenario.route === "/posts/991") {
        expect(fingerprint.summaryBg).toBeNull()
        expect(fingerprint.summaryBorder).toBeNull()
      }

      if (scenario.route === "/login") {
        expect(fingerprint.authShellBg).toBe(expected.authShellBg)
        expect(fingerprint.authShellBorder).toBe(expected.authShellBorder)
      }
    }
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
