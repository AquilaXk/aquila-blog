import { expect, test, type Page } from "@playwright/test"

const clsBudget = Number(process.env.CLS_BUDGET || 0.1)
const homeClsBudget = Number(process.env.CLS_BUDGET_HOME || 0.12)
const clsAssertionEpsilon = Number(process.env.CLS_ASSERTION_EPSILON || 0.005)
const jitterBudgetPx = Number(process.env.JITTER_BUDGET_PX || 2)
const refreshCheckRoutes = ["/", "/about", "/admin", "/admin/profile", "/admin/posts/new", "/admin/tools"]

const mockFeedEndpoints = async (page: Page) => {
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

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            id: 1001,
            createdAt: "2026-03-17T00:00:00Z",
            modifiedAt: "2026-03-17T00:00:00Z",
            authorId: 1,
            authorName: "관리자",
            authorUsername: "aquila",
            authorProfileImgUrl: "/avatar.png",
            title: "CLS 예산 점검",
            summary: "layout shift regression gate",
            tags: ["perf"],
            category: ["backend"],
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
    await page.waitForTimeout(300)
    const before = await getLayoutSnapshot(page)
    await page.evaluate(() => {
      ;(window as unknown as { __aqCls?: number }).__aqCls = 0
    })

    await page.reload({ waitUntil: "networkidle" })
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
