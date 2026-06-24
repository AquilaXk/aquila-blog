import { expect, test } from "@playwright/test"
import {
  allowAdminDashboardLoginFallback,
  applySchemePreference,
  getRailStickySnapshot,
  getThemeSurfaceFingerprint,
  getVisualLayoutFingerprint,
  getWidthLockSnapshot,
  gotoForPerf,
  isSsrAuthBackendDisconnectedForPerf,
  mockAdminMonitoringEndpoints,
  mockDetailRailEndpoint,
  mockFeedEndpoints,
  reloadForPerf,
  waitForHomeTagRailReady,
} from "./helpers/perfFixtures"

test.describe("성능 레이아웃과 표면 예산", () => {
  test("메인 레이아웃은 V4 1240px 컨테이너와 40px gutter를 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  const checkpoints = [2000, 1600, 1300, 1100, 1060, 1056]

  for (const viewport of checkpoints) {
    await page.setViewportSize({ width: viewport, height: 900 })
    if (viewport === checkpoints[0]) {
      await gotoForPerf(page, "/")
    } else {
      await reloadForPerf(page)
    }

    const expectedWidth = viewport <= 1056 ? viewport - 24 : Math.min(1240, viewport - 40)
    const snapshot = await getWidthLockSnapshot(page)
    expect(snapshot.mainWidth).toBeCloseTo(expectedWidth, 0)
    expect(snapshot.headerWidth).toBeCloseTo(expectedWidth, 0)
    await expect(page.locator(".rt")).toBeHidden()
  }
})

  test("피드 카드 호버는 V4 행형 목록의 레이아웃 위치를 이동시키지 않는다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoForPerf(page, "/")

  const firstRegularCard = page.locator('a[data-layout="regular"]').first()
  await expect(firstRegularCard).toBeVisible()

  const initialMetrics = await firstRegularCard.evaluate((card) => {
    const article = card.querySelector("article")
    if (!(article instanceof HTMLElement)) {
      throw new Error("regular feed card article을 찾지 못했습니다.")
    }

    const cardStyle = window.getComputedStyle(card as HTMLElement)
    const articleStyle = window.getComputedStyle(article)
    const articleRect = article.getBoundingClientRect()
    return {
      articleTop: Number(articleRect.top.toFixed(2)),
      cardContentVisibility: cardStyle.contentVisibility,
      articleTransform: articleStyle.transform,
    }
  })

  expect(initialMetrics.cardContentVisibility).toBe("visible")
  expect(initialMetrics.articleTransform).toBe("none")

  await firstRegularCard.hover()
  await page.waitForTimeout(320)

  const hoverMetrics = await firstRegularCard.evaluate((card) => {
    const article = card.querySelector("article")
    if (!(article instanceof HTMLElement)) {
      throw new Error("regular feed card article을 찾지 못했습니다.")
    }

    const articleRect = article.getBoundingClientRect()
    const articleStyle = window.getComputedStyle(article)

    return {
      articleTop: Number(articleRect.top.toFixed(2)),
      articleTransform: articleStyle.transform,
    }
  })

  expect(hoverMetrics.articleTransform).toBe("none")
  expect(Math.abs(hoverMetrics.articleTop - initialMetrics.articleTop)).toBeLessThanOrEqual(1)
})

  test("메인 태그 레일은 1200/1201 전환과 넓은 데스크톱에서 안전하게 유지된다", async ({ page }) => {
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
  await expect(page.locator(".chipRail")).toBeHidden()
  await expect(page.locator(".desktopPanel")).toBeVisible()

  const railRect = await page.locator(".desktopPanel").boundingBox()
  expect(railRect).not.toBeNull()
  expect((railRect?.x ?? -1)).toBeGreaterThanOrEqual(0)

  const firstCardRect = await page.locator(".postColumn article").first().boundingBox()
  expect(firstCardRect).not.toBeNull()
  expect(firstCardRect?.x ?? 0).toBeGreaterThanOrEqual((railRect?.x ?? 0) + (railRect?.width ?? 0) + 16)
})

  test("상세 좌/우 고정 레일은 스크롤 전후 좌표를 안정적으로 유지한다", async ({ page }) => {
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

  test("핵심 화면 레이아웃 스냅샷(데스크톱/iPhone15/iPad mini)을 유지한다", async ({ page }) => {
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
      expect(snapshot.rails.chip).toBe(false)
      expect(snapshot.rails.desktopTag).toBe(true)
      expect(snapshot.rails.leftReaction).toBe(false)
      expect(snapshot.rails.rightToc).toBe(false)

      expect(snapshot.searchRect).not.toBeNull()
      expect(snapshot.firstCardRect).not.toBeNull()

      const searchWidth = snapshot.searchRect?.width ?? 0
      const searchHeight = snapshot.searchRect?.height ?? 0
      const firstCardWidth = snapshot.firstCardRect?.width ?? 0
      const firstCardHeight = snapshot.firstCardRect?.height ?? 0
      const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
      const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0

      expect(searchWidth).toBeGreaterThanOrEqual(120)
      expect(searchWidth).toBeLessThanOrEqual(240)
      expect(searchHeight).toBeGreaterThanOrEqual(34)
      expect(searchHeight).toBeLessThanOrEqual(44)
      expect(firstCardWidth).toBeGreaterThanOrEqual(820)
      expect(firstCardWidth).toBeLessThanOrEqual(1020)
      expect(firstCardHeight).toBeGreaterThanOrEqual(120)
      expect(firstCardHeight).toBeLessThanOrEqual(280)
      expect(snapshot.desktopTagRailRect?.width ?? 0).toBeGreaterThanOrEqual(160)
      expect(snapshot.desktopTagRailRect?.width ?? 0).toBeLessThanOrEqual(240)
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

      expect(searchWidth).toBeGreaterThanOrEqual(170)
      expect(searchWidth).toBeLessThanOrEqual(190)
      expect(searchHeight).toBe(34)
      expect(searchY).toBeGreaterThanOrEqual(620)
      expect(searchY).toBeLessThanOrEqual(700)
      expect(firstCardWidth).toBeGreaterThanOrEqual(360)
      expect(firstCardWidth).toBeLessThanOrEqual(370)
      expect(firstCardHeight).toBeGreaterThanOrEqual(340)
      expect(firstCardHeight).toBeLessThanOrEqual(430)
      expect(firstCardY).toBeGreaterThanOrEqual(700)
      expect(firstCardY).toBeLessThanOrEqual(820)
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

      expect(searchWidth).toBeGreaterThanOrEqual(170)
      expect(searchWidth).toBeLessThanOrEqual(190)
      expect(searchHeight).toBe(34)
      expect(searchY).toBeGreaterThanOrEqual(560)
      expect(searchY).toBeLessThanOrEqual(760)
      expect(firstCardWidth).toBeGreaterThanOrEqual(720)
      expect(firstCardWidth).toBeLessThanOrEqual(750)
      expect(firstCardHeight).toBeGreaterThanOrEqual(260)
      expect(firstCardHeight).toBeLessThanOrEqual(430)
      expect(firstCardY).toBeGreaterThanOrEqual(650)
      expect(firstCardY).toBeLessThanOrEqual(850)
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
      expect(leftRailY).toBeLessThanOrEqual(104)
      expect(rightRailWidth).toBe(240)
      expect(rightRailHeight).toBeGreaterThanOrEqual(280)
      expect(rightRailHeight).toBeLessThanOrEqual(380)
      expect(rightRailY).toBeGreaterThanOrEqual(84)
      expect(rightRailY).toBeLessThanOrEqual(104)
      expect(htmlScrollWidth).toBeLessThanOrEqual(1440)
      expect(htmlScrollWidth).toBeGreaterThanOrEqual(1420)
      expect(bodyScrollWidth).toBeLessThanOrEqual(1440)
      expect(bodyScrollWidth).toBeGreaterThanOrEqual(1420)
      continue
    }

    if (scenario.name === "admin-dashboard-ipad-mini-768") {
      expect(snapshot.viewport.width).toBe(768)
      expect(snapshot.viewport.height).toBe(1024)

      // admin/dashboard는 SSR auth guard를 통과하지 못하면 /login fallback을 탈 수 있다.
      // (예: perf CI의 backend 단절 모드, 로컬 미로그인 상태, SSR auth backend 비가용)
      // 단, 이 fallback 허용은 명시 플래그(PERF_ALLOW_ADMIN_LOGIN_FALLBACK=true) 또는
      // backend 단절 perf 모드에서만 허용한다. 기본은 dashboard 진입 실패를 테스트 실패로 본다.
      if (snapshot.route === "/login") {
        if (!allowAdminDashboardLoginFallback) {
          throw new Error(
            `[perf] admin-dashboard unexpected fallback=/login (set PERF_ALLOW_ADMIN_LOGIN_FALLBACK=true only when intentionally testing auth fallback)`
          )
        }
        console.info(
          `[perf] admin-dashboard fallback=/login backendDisconnected=${String(isSsrAuthBackendDisconnectedForPerf)} allowFallback=${String(allowAdminDashboardLoginFallback)}`
        )
        const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
        const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0
        expect(htmlScrollWidth).toBeLessThanOrEqual(768)
        expect(bodyScrollWidth).toBeLessThanOrEqual(768)
        continue
      }

      expect(snapshot.route).toBe("/admin/dashboard")
      expect(snapshot.dashboardServiceRailRect).not.toBeNull()
      expect(snapshot.dashboardPrioritySectionRect).not.toBeNull()
      expect(snapshot.dashboardPanelGridRect).not.toBeNull()
      expect(snapshot.dashboardFirstPanelRect).not.toBeNull()

      const serviceRailWidth = snapshot.dashboardServiceRailRect?.width ?? 0
      const prioritySectionY = snapshot.dashboardPrioritySectionRect?.y ?? 0
      const prioritySectionBottom =
        (snapshot.dashboardPrioritySectionRect?.y ?? 0) + (snapshot.dashboardPrioritySectionRect?.height ?? 0)
      const panelGridWidth = snapshot.dashboardPanelGridRect?.width ?? 0
      const firstPanelWidth = snapshot.dashboardFirstPanelRect?.width ?? 0
      const firstPanelY = snapshot.dashboardFirstPanelRect?.y ?? 0
      const htmlScrollWidth = snapshot.scrollWidth?.html ?? 0
      const bodyScrollWidth = snapshot.scrollWidth?.body ?? 0

      // V4 관리자 first fold는 iPad mini 768 환경에서 우선 점검 영역을 300px 전후로 당긴다.
      // V4 shell compact topbar에서는 Linux headless 기준 287px까지 내려온다.
      // 관리자 route는 full-bleed 작업 공간이므로 콘텐츠 폭은 742px 안팎으로 고정한다.
      expect(serviceRailWidth).toBeGreaterThanOrEqual(738)
      expect(serviceRailWidth).toBeLessThanOrEqual(744)
      expect(prioritySectionY).toBeGreaterThanOrEqual(285)
      expect(prioritySectionY).toBeLessThanOrEqual(320)
      expect(panelGridWidth).toBeGreaterThanOrEqual(738)
      expect(panelGridWidth).toBeLessThanOrEqual(744)
      expect(firstPanelWidth).toBeGreaterThanOrEqual(738)
      expect(firstPanelWidth).toBeLessThanOrEqual(744)
      expect(firstPanelY).toBeGreaterThanOrEqual(prioritySectionBottom)
      expect(firstPanelY).toBeLessThanOrEqual(650)
      expect(htmlScrollWidth).toBeLessThanOrEqual(768)
      expect(bodyScrollWidth).toBeLessThanOrEqual(768)
      continue
    }

    expect(JSON.stringify(snapshot, null, 2)).toMatchSnapshot(`${scenario.name}.json`)
  }
})

  test("공개와 인증 핵심 화면은 system light legacy 표면 계층을 유지한다", async ({ page }) => {
  test.setTimeout(60_000)
  await mockFeedEndpoints(page, {
    adminProfile: {
      blogDesign: "legacy",
      legacyBlogScheme: "light",
    },
  })
  await mockDetailRailEndpoint(page, 991)

  const publicScenarios = [
    { route: "/", viewport: { width: 1440, height: 900 } },
    { route: "/", viewport: { width: 393, height: 852 } },
    { route: "/", viewport: { width: 768, height: 1024 } },
    { route: "/posts/991", viewport: { width: 1440, height: 900 } },
    { route: "/posts/991", viewport: { width: 393, height: 852 } },
    { route: "/posts/991", viewport: { width: 768, height: 1024 } },
  ] as const
  const authScenarios = [
    { route: "/login", viewport: { width: 1440, height: 900 } },
    { route: "/login", viewport: { width: 393, height: 852 } },
    { route: "/login", viewport: { width: 768, height: 1024 } },
  ] as const

  for (const scenario of publicScenarios) {
    await applySchemePreference(page, "light")
    await page.setViewportSize(scenario.viewport)
    await gotoForPerf(page, scenario.route, {
      readyText: scenario.route === "/posts/991" ? "상세 레일 스티키 회귀 점검" : undefined,
    })
    await expect
      .poll(async () => (await getThemeSurfaceFingerprint(page)).bodyBg, {
        timeout: 8000,
      })
      .toBe("rgb(243, 245, 248)")

    const fingerprint = await getThemeSurfaceFingerprint(page)

    expect(fingerprint.route).toBe(scenario.route)
    expect(fingerprint.themeToggleLabel).toBe("다크 모드로 전환")
    expect(fingerprint.bodyBg).toBe("rgb(243, 245, 248)")
    expect(fingerprint.headerBg).not.toBeNull()
    expect(fingerprint.headerBg).not.toBe(fingerprint.bodyBg)

    if (scenario.route === "/") {
      expect(fingerprint.searchBg).toBe("rgb(255, 255, 255)")
      expect(fingerprint.searchBorder).not.toBeNull()
      expect(fingerprint.cardBg).not.toBe("rgb(22, 27, 34)")
      expect(fingerprint.cardBorder).not.toBeNull()
    }

    if (scenario.route === "/posts/991") {
      expect(fingerprint.summaryBg).toBeNull()
      expect(fingerprint.summaryBorder).toBeNull()
    }
  }

  for (const scenario of authScenarios) {
    await applySchemePreference(page, "light")
    await page.setViewportSize(scenario.viewport)
    await gotoForPerf(page, scenario.route)
    await expect
      .poll(async () => (await getThemeSurfaceFingerprint(page)).bodyBg, {
        timeout: 8000,
      })
      .toBe("rgb(243, 245, 248)")
    const fingerprint = await getThemeSurfaceFingerprint(page)
    expect(fingerprint.route).toBe(scenario.route)
    expect(fingerprint.bodyBg).toBe("rgb(243, 245, 248)")
    expect(fingerprint.headerBg).toBe("rgba(249, 251, 254, 0.94)")
    expect(fingerprint.themeToggleLabel).toBe("다크 모드로 전환")
    expect(fingerprint.authShellBg).toBe("rgb(255, 255, 255)")
    expect(fingerprint.authShellBorder).toBe("rgb(215, 224, 234)")
  }
})
})
