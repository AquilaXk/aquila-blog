import { appendFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import path from "node:path"
import { expect, type Locator, type Page, type Route } from "@playwright/test"

export const clsBudget = Number(process.env.CLS_BUDGET || 0.1)
export const homeClsBudget = Number(process.env.CLS_BUDGET_HOME || 0.12)
export const clsAssertionEpsilon = Number(process.env.CLS_ASSERTION_EPSILON || 0.005)
export const jitterBudgetPx = Number(process.env.JITTER_BUDGET_PX || 2)
export const feedScrollMaxFrameGapBudgetMs = Number(process.env.PERF_FEED_SCROLL_MAX_FRAME_GAP_BUDGET_MS || 120)
export const feedScrollLongFrameRatioBudget = Number(process.env.PERF_FEED_SCROLL_LONG_FRAME_RATIO_BUDGET || 0.15)
export const detailEntryBudgetMs = Number(process.env.PERF_DETAIL_ENTRY_BUDGET_MS || 1800)
export const homeFcpBudgetMs = Number(process.env.PERF_HOME_FCP_BUDGET_MS || 1800)
export const playwrightBaseURL = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
export const runtimeGuardMetricsRelativePath =
  process.env.PLAYWRIGHT_PERF_RUNTIME_METRICS_PATH || "test-results/perf/runtime-guard-metrics.ndjson"
export const frontRoot = path.basename(process.cwd()) === "front" ? process.cwd() : path.resolve(process.cwd(), "front")
export const runtimeGuardMetricsPath = path.resolve(
  frontRoot,
  runtimeGuardMetricsRelativePath
)
export const isSsrAuthBackendDisconnectedForPerf =
  (process.env.BACKEND_INTERNAL_URL || "").trim().replace(/\/+$/, "") === "http://127.0.0.1:1"
export const allowAdminDashboardLoginFallback =
  process.env.PERF_ALLOW_ADMIN_LOGIN_FALLBACK === "true" || isSsrAuthBackendDisconnectedForPerf
export const refreshCheckRoutes = ["/", "/about", "/admin", "/admin/dashboard", "/admin/profile", "/admin/posts", "/admin/tools"]

export type RuntimeGuardMetricName =
  | "home_first_contentful_paint_ms"
  | "feed_scroll_blocking.max_frame_gap_ms"
  | "feed_scroll_blocking.long_frame_ratio"
  | "detail_enter_cost"
  | "feed.scroll.max_frame_gap_ms"
  | "feed.scroll.long_frame_ratio"
  | "detail.entry.ms"

export type RuntimeGuardMetricMeta = {
  unit: "ms" | "ratio"
  route: string
  section: "feed" | "detail"
  sampleCount?: number
  extra?: Record<string, number>
}

export const PERF_RUNTIME_GUARD_TRIALS = 3

export const average = (values: number[]) => {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export const roundMetric = (value: number, precision = 3) => Number(value.toFixed(precision))

export const recordRuntimeGuardMetric = (
  metric: RuntimeGuardMetricName,
  value: number,
  budget: number,
  meta: RuntimeGuardMetricMeta
) => {
  mkdirSync(path.dirname(runtimeGuardMetricsPath), { recursive: true })
  appendFileSync(
    runtimeGuardMetricsPath,
    `${JSON.stringify({
      recordedAt: new Date().toISOString(),
      metric,
      value: roundMetric(value),
      budget,
      ...meta,
      extra: meta.extra ? Object.fromEntries(Object.entries(meta.extra).map(([key, raw]) => [key, roundMetric(raw)])) : undefined,
    })}\n`,
    "utf8"
  )
}

export const resetRuntimeGuardMetricsFile = () => {
  mkdirSync(path.dirname(runtimeGuardMetricsPath), { recursive: true })
  writeFileSync(runtimeGuardMetricsPath, "", "utf8")
}

export const recordRuntimeGuardMetricWithAliases = (
  metric: RuntimeGuardMetricName,
  value: number,
  budget: number,
  meta: RuntimeGuardMetricMeta,
  aliases: RuntimeGuardMetricName[] = []
) => {
  const metrics = Array.from(new Set([metric, ...aliases]))
  for (const currentMetric of metrics) {
    recordRuntimeGuardMetric(currentMetric, value, budget, meta)
  }
}


export const mockTagCounts = [
  { tag: "perf", count: 10 },
  { tag: "frontend", count: 8 },
  { tag: "backend", count: 7 },
  { tag: "architecture", count: 6 },
  { tag: "testing", count: 5 },
  { tag: "deploy", count: 4 },
] as const

export const buildMockExploreItem = (id: number) => ({
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

export const mockFeedEndpoints = async (
  page: Page,
  options?: {
    feedHandler?: (route: Route) => Promise<void>
    exploreHandler?: (route: Route) => Promise<void>
    adminProfile?: Record<string, unknown>
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
        blogDesign: "legacy",
        legacyBlogScheme: "dark",
        serviceLinks: [],
        contactLinks: [],
        ...options?.adminProfile,
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

export const mockDetailRailEndpoint = async (page: Page, postId: number) => {
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

  await page.route("**/post/api/v1/posts/related/author**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: postId + 1,
          title: "같은 작성자 연관 글 1",
          summary: "작성자 단일 조회 API 회귀 방지용",
          thumbnail: null,
          createdTime: "2026-03-18",
        },
      ]),
    })
  })
}

export const mockAdminMonitoringEndpoints = async (page: Page) => {
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

export const installClsObserver = async (page: Page) => {
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

export const getLayoutSnapshot = async (page: Page) =>
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

export const getWidthLockSnapshot = async (page: Page) =>
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

export const getRailStickySnapshot = async (page: Page) =>
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

export const getVisualLayoutFingerprint = async (page: Page) =>
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
    const readSectionRectByHeading = (headingText: string) => {
      const heading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
        (node) => node.textContent?.trim() === headingText,
      )
      const section = heading?.closest("section")
      if (!section) return null
      const rect = (section as HTMLElement).getBoundingClientRect()
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

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
            dashboardPrioritySectionRect: readSectionRectByHeading("Steady-state guard"),
            dashboardPanelGridRect: readSectionRectByHeading("Public read latency"),
            dashboardFirstPanelRect: readSectionRectByHeading("Live logs"),
          }
        : {}),
    }
  })

export const getDesktopTagRailMetrics = async (page: Page) =>
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

export const waitForHomeTagRailReady = async (page: Page, viewportWidth: number) => {
  const selector = viewportWidth >= 1201 ? ".desktopPanel" : ".chipRail"
  await expect
    .poll(
      async () =>
        page.evaluate((railSelector) => {
          const rail = document.querySelector(railSelector)
          if (!rail) return 0
          return rail.querySelectorAll("button").length
        }, selector),
      { timeout: 5000 }
    )
    .toBeGreaterThanOrEqual(4)
}

export const applySchemePreference = async (page: Page, scheme: "light" | "dark") => {
  await page.context().clearCookies()
  await page.context().addCookies([
    {
      name: "scheme",
      value: scheme,
      url: playwrightBaseURL,
    },
  ])
}

export const getThemeSurfaceFingerprint = async (page: Page) =>
  page.evaluate(() => {
    const readStyle = (selector: string, property: keyof CSSStyleDeclaration) => {
      const node = document.querySelector(selector)
      if (!node) return null
      return getComputedStyle(node as HTMLElement)[property] as string | null
    }

    const readThemeToggleLabel = () => {
      const toggle = document.querySelector('button[aria-label="테마 전환"]')
      return toggle?.getAttribute("aria-label") ?? null
    }

    return {
      route: window.location.pathname,
      themeToggleLabel: readThemeToggleLabel(),
      bodyBg: getComputedStyle(document.body).backgroundColor,
      headerBg: readStyle('[data-ui="app-header"]', "backgroundColor"),
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

export const waitForStableHeaderAuthState = async (page: Page) => {
  await page
    .waitForSelector('.authArea:not([data-auth-state="loading"])', {
      timeout: 1200,
    })
    .catch(() => {})
}

export const waitForPageReady = async (page: Page, options?: { waitAuth?: boolean }) => {
  await page.waitForLoadState("domcontentloaded")
  await page.waitForLoadState("networkidle", { timeout: 2500 }).catch(() => {})
  if (options?.waitAuth !== false) {
    await waitForStableHeaderAuthState(page)
  }
}

export const waitForFeedCardLink = async (page: Page, postId: number): Promise<Locator> => {
  const cardLink = page.locator(`a[href="/posts/${postId}"]`).first()

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page
      .waitForResponse(
        (response) =>
          response.request().method() === "GET" && response.url().includes("/post/api/v1/posts/feed"),
        { timeout: 6000 }
      )
      .catch(() => null)

    await expect(cardLink).toBeVisible({ timeout: 8_000 }).catch(() => {})
    if (await cardLink.isVisible().catch(() => false)) {
      return cardLink
    }

    if (attempt === 0) {
      await reloadForPerf(page)
    }
  }

  await expect(cardLink).toBeVisible({ timeout: 8_000 })
  return cardLink
}

export const reloadForPerf = async (page: Page, options?: { waitAuth?: boolean }) => {
  await page.reload({ waitUntil: "domcontentloaded" })
  await waitForPageReady(page, options)
}

export const gotoForPerf = async (
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

export const getMaxHorizontalJitter = (
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
