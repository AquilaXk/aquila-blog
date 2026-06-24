import { expect, test, type Page } from "@playwright/test"

const ADMIN_MEMBER_FIXTURE = {
  id: 1,
  username: "aquila",
  nickname: "aquila",
  isAdmin: true,
  profileImageUrl: "/avatar.png",
  profileImageDirectUrl: "/avatar.png",
}

const ADMIN_POST_FIXTURES = Array.from({ length: 6 }, (_, index) => ({
  id: 4200 + index,
  title: index === 0 ? "First fold 운영 점검" : `관리자 글 목록 회귀 ${index}`,
  authorName: "관리자",
  authorProfileImgUrl: "/avatar.png",
  published: index % 2 === 0,
  listed: index % 3 !== 0,
  tempDraft: false,
  createdAt: `2026-05-${String(10 + index).padStart(2, "0")}T01:00:00Z`,
  modifiedAt: `2026-05-${String(20 - index).padStart(2, "0")}T08:30:00Z`,
}))

const SYSTEM_HEALTH_FIXTURE = {
  status: "UP",
  details: {
    db: { status: "UP" },
    mail: { status: "READY" },
    queue: { status: "UP" },
    storage: { status: "UP" },
  },
}

const DASHBOARD_SNAPSHOT_FIXTURE = {
  generatedAt: "2026-05-21T09:45:00Z",
  taskQueue: {
    pendingCount: 5,
    readyPendingCount: 2,
    processingCount: 1,
    failedCount: 1,
    staleProcessingCount: 0,
    oldestReadyPendingAgeSeconds: 480,
    latestFailureAt: "2026-05-21T08:10:00Z",
    latestFailureMessage: "thumbnail refresh timeout",
  },
  signupMail: {
    status: "READY",
    queueLagSeconds: 35,
    latestFailureAt: null,
    latestFailureMessage: null,
  },
  authSecurity: {
    recentEventCount: 18,
    blockedEventCount: 2,
    latestEventAt: "2026-05-21T09:40:00Z",
    latestBlockedAt: "2026-05-21T08:55:00Z",
  },
  storageCleanup: {
    eligibleForPurgeCount: 12,
    blockedBySafetyThreshold: false,
    oldestEligiblePurgeAfter: "2026-05-21T10:20:00Z",
  },
}

const createAdminPostPage = () => ({
  content: ADMIN_POST_FIXTURES,
  pageable: {
    pageNumber: 0,
    pageSize: 20,
    totalElements: ADMIN_POST_FIXTURES.length,
    totalPages: 1,
  },
})

const mockAdminDashboardEndpoints = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route("**/system/api/v1/adm/bootstrap", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        member: ADMIN_MEMBER_FIXTURE,
        health: SYSTEM_HEALTH_FIXTURE,
        dashboard: DASHBOARD_SNAPSHOT_FIXTURE,
      }),
    })
  })

  await page.route("**/system/api/v1/adm/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SYSTEM_HEALTH_FIXTURE),
    })
  })

  await page.route("**/system/api/v1/adm/dashboard-snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DASHBOARD_SNAPSHOT_FIXTURE),
    })
  })
}

const mockAdminPostsWorkspaceEndpoints = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(ADMIN_MEMBER_FIXTURE),
    })
  })

  await page.route("**/post/api/v1/adm/posts**", async (route) => {
    const url = new URL(route.request().url())

    if (url.pathname.endsWith("/bootstrap")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          member: ADMIN_MEMBER_FIXTURE,
          firstPage: createAdminPostPage(),
        }),
      })
      return
    }

    if (url.pathname.includes("/deleted")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [],
          pageable: { pageNumber: 0, pageSize: 20, totalElements: 0, totalPages: 0 },
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createAdminPostPage()),
    })
  })
}

test("관리자 프로필 1440px 데스크톱은 간결한 heading 아래 편집 폼을 preview rail에 눌리지 않게 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/profile")

  await expect(page.getByRole("heading", { name: "프로필" })).toBeVisible()
  await expect(page.locator("#profile-display-name")).toBeVisible()

  const layoutSnapshot = await page.evaluate(() => {
    const displayName = document.querySelector<HTMLElement>("#profile-display-name")
    const role = document.querySelector<HTMLElement>("#profile-role")
    const bio = document.querySelector<HTMLElement>("#profile-bio")
    const sectionRail = document.querySelector<HTMLElement>('[aria-label="프로필 섹션"]')
    const rectOf = (element: HTMLElement | null) => {
      const rect = element?.getBoundingClientRect()
      return rect
        ? {
            left: rect.left,
            top: rect.top,
            width: rect.width,
          }
        : null
    }

    return {
      displayName: rectOf(displayName),
      role: rectOf(role),
      bio: rectOf(bio),
      sectionRail: rectOf(sectionRail),
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
    }
  })

  expect(layoutSnapshot.displayName?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.role?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.bio?.width ?? 0).toBeGreaterThanOrEqual(320)
  expect(layoutSnapshot.sectionRail?.width ?? 0).toBeGreaterThanOrEqual(240)
  expect(layoutSnapshot.bodyScrollWidth).toBeLessThanOrEqual(layoutSnapshot.viewportWidth)
})

const captureDashboardPrioritySnapshot = async (page: Page) =>
  page.evaluate(() => {
    const priorityHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "Steady-state guard",
    )
    const prioritySection = priorityHeading?.closest<HTMLElement>("section")
    const priorityRows = prioritySection?.querySelector<HTMLElement>("[data-ui='dashboard-guard-rows']")
    const headingRect = priorityHeading?.getBoundingClientRect()
    const sectionRect = prioritySection?.getBoundingClientRect()
    const rowsRect = priorityRows?.getBoundingClientRect()

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      headingTop: headingRect?.top ?? Number.POSITIVE_INFINITY,
      sectionTop: sectionRect?.top ?? Number.POSITIVE_INFINITY,
      rowsTop: rowsRect?.top ?? Number.POSITIVE_INFINITY,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })

test("관리자 대시보드 1440px 데스크톱은 V4 steady-state guard를 first fold 안에 노출한다", async ({ page }) => {
  await mockAdminDashboardEndpoints(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/dashboard")

  await expect(page.getByRole("heading", { name: "Steady-state guard" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Public read latency" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Live logs" })).toBeVisible()
  await expect(page.getByRole("link", { name: "도구 열기" })).toHaveAttribute("href", "/admin/tools")

  const snapshot = await captureDashboardPrioritySnapshot(page)

  expect(snapshot.rowsTop).toBeLessThanOrEqual(860)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})

test("관리자 대시보드 모바일은 V4 steady-state guard heading을 first fold 안에 노출한다", async ({ page }) => {
  await mockAdminDashboardEndpoints(page)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin/dashboard")

  await expect(page.getByRole("heading", { name: "Steady-state guard" })).toBeVisible()

  const snapshot = await captureDashboardPrioritySnapshot(page)

  expect(snapshot.headingTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.sectionTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
})

test("관리자 대시보드는 알림 snapshot 백그라운드 갱신을 유지한다", async ({ page }) => {
  let snapshotRequestCount = 0
  await page.addInitScript(() => {
    window.requestIdleCallback = (callback) => {
      window.setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 50 }), 0)
      return 1
    }
    window.cancelIdleCallback = () => {}
  })
  await mockAdminDashboardEndpoints(page)
  await page.route("**/member/api/v1/notifications/snapshot", async (route) => {
    snapshotRequestCount += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ items: [], unreadCount: 0 }),
    })
  })

  await page.goto("/admin/dashboard")
  await expect(page.getByRole("heading", { name: "Steady-state guard" })).toBeVisible()

  await expect.poll(() => snapshotRequestCount).toBeGreaterThan(0)
})

test("관리자 허브 모바일 first fold의 글 작성 진입점은 상단 V4 액션을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin")

  await expect(page.getByRole("heading", { name: /좋은 아침이에요/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible()

  const ctaSnapshot = await page.evaluate(() => {
    const cta = Array.from(document.querySelectorAll<HTMLAnchorElement>("header a")).find(
      (element) => element.textContent?.trim() === "새 글",
    )
    const rect = cta?.getBoundingClientRect()
    return rect
      ? {
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }
      : null
  })

  expect(ctaSnapshot).not.toBeNull()
  expect(ctaSnapshot?.top ?? Number.POSITIVE_INFINITY).toBeLessThan(140)
  expect(ctaSnapshot?.width ?? 0).toBeGreaterThanOrEqual(48)
  expect(ctaSnapshot?.height ?? 0).toBeGreaterThanOrEqual(36)
})

const capturePostsFirstFoldSnapshot = async (page: Page) =>
  page.evaluate(() => {
    const search = document.querySelector<HTMLElement>("#workspace-post-search")
    const listSection = search?.closest<HTMLElement>("section") ?? null
    const firstRow = Array.from(document.querySelectorAll<HTMLElement>("tbody tr, article")).find((element) =>
      element.textContent?.includes("First fold 운영 점검"),
    )
    const heading = Array.from((listSection ?? document).querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "글 목록",
    )
    const recentHeading = Array.from(document.querySelectorAll<HTMLElement>("h2")).find(
      (element) => element.textContent?.trim() === "최근 작업",
    )
    const headingRect = heading?.getBoundingClientRect()
    const searchRect = search?.getBoundingClientRect()
    const firstRowRect = firstRow?.getBoundingClientRect()
    const recentRect = recentHeading?.getBoundingClientRect()

    return {
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      headingTop: headingRect?.top ?? Number.POSITIVE_INFINITY,
      searchTop: searchRect?.top ?? Number.POSITIVE_INFINITY,
      firstRowTop: firstRowRect?.top ?? Number.POSITIVE_INFINITY,
      recentTop: recentRect?.top ?? Number.POSITIVE_INFINITY,
      bodyScrollWidth: document.body.scrollWidth,
    }
  })

const captureVisibleActionRects = async (page: Page, labels: string[]) =>
  page.evaluate((targetLabels) => {
    const firstPost = Array.from(document.querySelectorAll<HTMLElement>("tbody tr, article")).find((element) =>
      element.textContent?.includes("First fold 운영 점검"),
    )
    const controls = Array.from(firstPost?.querySelectorAll<HTMLElement>("button, a") ?? [])
    return targetLabels.map((label) => {
      const control = controls.find((element) => element.textContent?.trim() === label)
      const rect = control?.getBoundingClientRect()
      return {
        label,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      }
    })
  }, labels)

test("관리자 글 관리는 1440px 데스크톱에서 첫 글을 최근 작업보다 먼저 first fold에 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto("/admin/posts")

  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await page.getByRole("button", { name: "새로고침" }).click()
  await expect(page.locator("tbody tr, article").filter({ hasText: "First fold 운영 점검" }).first()).toBeVisible()

  const snapshot = await capturePostsFirstFoldSnapshot(page)

  expect(snapshot.searchTop).toBeLessThanOrEqual(560)
  expect(snapshot.firstRowTop).toBeLessThanOrEqual(760)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.recentTop)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)

  const actionRects = await captureVisibleActionRects(page, ["수정", "링크 복사", "삭제"])
  for (const rect of actionRects) {
    expect(rect.width, `${rect.label} width`).toBeGreaterThanOrEqual(32)
    expect(rect.height, `${rect.label} height`).toBeGreaterThanOrEqual(32)
  }
})

test("관리자 글 관리는 모바일에서 첫 글 카드를 최근 작업보다 먼저 first fold에 노출한다", async ({ page }) => {
  await mockAdminPostsWorkspaceEndpoints(page)
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin/posts")

  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await page.getByRole("button", { name: "새로고침" }).click()
  await expect(page.locator("tbody tr, article").filter({ hasText: "First fold 운영 점검" }).first()).toBeVisible()

  const snapshot = await capturePostsFirstFoldSnapshot(page)

  expect(snapshot.searchTop).toBeLessThanOrEqual(520)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.viewportHeight)
  expect(snapshot.firstRowTop).toBeLessThan(snapshot.recentTop)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)

  const actionRects = await captureVisibleActionRects(page, ["수정", "링크 복사", "삭제"])
  for (const rect of actionRects) {
    expect(rect.width, `${rect.label} width`).toBeGreaterThanOrEqual(32)
    expect(rect.height, `${rect.label} height`).toBeGreaterThanOrEqual(32)
  }
})

test("관리자 프로필 모바일 섹션 rail은 마지막 섹션 탭까지 같은 viewport 안에서 드러낸다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.goto("/admin/profile")

  await expect(page.getByRole("heading", { name: "프로필" })).toBeVisible()

  const sectionRailSnapshot = await page.evaluate(() => {
    const rail = document.querySelector<HTMLElement>('[aria-label="프로필 섹션"]')
    const lastButton = Array.from(rail?.querySelectorAll<HTMLElement>("button") ?? []).at(-1)
    const railRect = rail?.getBoundingClientRect()
    const buttonRect = lastButton?.getBoundingClientRect()

    return {
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      railOverflowX: rail ? getComputedStyle(rail).overflowX : "",
      railClientWidth: rail?.clientWidth ?? 0,
      railScrollWidth: rail?.scrollWidth ?? 0,
      railBottom: railRect?.bottom ?? 0,
      lastButtonRight: buttonRect?.right ?? Number.POSITIVE_INFINITY,
      lastButtonText: lastButton?.textContent?.trim() ?? "",
    }
  })

  expect(sectionRailSnapshot.lastButtonText).toBe("외부 링크")
  expect(sectionRailSnapshot.railOverflowX).not.toBe("auto")
  expect(sectionRailSnapshot.railScrollWidth).toBeLessThanOrEqual(sectionRailSnapshot.railClientWidth)
  expect(sectionRailSnapshot.lastButtonRight).toBeLessThanOrEqual(sectionRailSnapshot.viewportWidth - 14)
  expect(sectionRailSnapshot.railBottom).toBeLessThan(360)
  expect(sectionRailSnapshot.bodyScrollWidth).toBeLessThanOrEqual(sectionRailSnapshot.viewportWidth)
})
