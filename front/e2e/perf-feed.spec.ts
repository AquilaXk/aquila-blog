import { expect, test } from "@playwright/test"
import {
  toRestoredPageParams,
  type FeedExplorerRestoreSnapshot,
} from "../src/routes/Feed/FeedExplorerRestoreModel"
import {
  buildMockExploreItem,
  mockFeedEndpoints,
  waitForPageReady,
} from "./helpers/perfFixtures"

test.describe("perf feed scroll budgets", () => {
  test("restore snapshot은 cursor pageParams를 cursor chain으로 복원한다", () => {
    const snapshot: FeedExplorerRestoreSnapshot = {
      savedAt: Date.now(),
      pages: [
        {
          posts: [],
          totalCount: 4,
          pageNumber: 1,
          pageSize: 2,
          hasNext: true,
          nextCursor: "cursor-2",
          paginationMode: "cursor",
        },
        {
          posts: [],
          totalCount: 4,
          pageNumber: 2,
          pageSize: 2,
          hasNext: false,
          nextCursor: null,
          paginationMode: "cursor",
        },
      ],
    }

    expect(toRestoredPageParams(snapshot)).toEqual([null, "cursor-2"])
    expect(toRestoredPageParams({ ...snapshot, pageParams: [1, "persisted-cursor-2"] })).toEqual([
      null,
      "cursor-2",
    ])
  })

  test("홈 피드는 다음 cursor 실패를 빈 결과로 숨기지 않고 재시도 버튼을 보여준다", async ({ page }) => {
  let nextCursorAttempts = 0
  const firstPageIds = Array.from({ length: 16 }, (_, index) => 1201 + index)
  const secondPageIds = [1251, 1252]

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const cursorParam = url.searchParams.get("cursor")
      const pageNumber = Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")

      if (isCursorEndpoint) {
        if (cursorParam) {
          nextCursorAttempts += 1
          if (nextCursorAttempts <= 2) {
            await route.fulfill({
              status: 503,
              contentType: "application/json",
              body: JSON.stringify({ message: "cursor page temporarily unavailable" }),
            })
            return
          }

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              content: secondPageIds.map(buildMockExploreItem),
              pageSize,
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
            content: firstPageIds.map(buildMockExploreItem),
            pageSize,
            hasNext: true,
            nextCursor: "cursor-2",
          }),
        })
        return
      }

      await route.fulfill({
        status: pageNumber === 1 ? 200 : 503,
        contentType: "application/json",
        body: JSON.stringify(
          pageNumber === 1
            ? {
                content: firstPageIds.map(buildMockExploreItem),
                pageable: {
                  pageNumber: 0,
                  pageSize,
                  totalElements: pageSize * 2,
                  totalPages: 2,
                },
              }
            : { message: "page fallback should not hide next cursor failure" }
        ),
      })
    },
  })

  await page.goto("/")
  await waitForPageReady(page)
  await expect(page.getByRole("heading", { name: "CLS 예산 점검 1201" })).toBeVisible()

  await page.getByRole("button", { name: "더보기" }).click()

  await expect(page.getByRole("heading", { name: "CLS 예산 점검 1201" })).toBeVisible()
  await expect(page.getByText("다음 글을 불러오지 못했습니다.")).toBeVisible()
  await expect(page.getByRole("button", { name: "다시 시도" })).toBeVisible()
  await expect(page.getByRole("button", { name: "더보기" })).toHaveCount(0)
  await page.waitForTimeout(500)
  expect(nextCursorAttempts).toBe(2)

  await page.getByRole("button", { name: "다시 시도" }).click()

  await expect(page.getByText("피드 18개")).toBeVisible()
  expect(nextCursorAttempts).toBe(3)
})

  test("홈 피드는 cursor 첫 요청 fallback 이후 다음 page를 page API로 이어간다", async ({ page }) => {
  const pageRequests: number[] = []
  const firstPageIds = Array.from({ length: 16 }, (_, index) => 1301 + index)
  const secondPageIds = [1351, 1352]

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const pageNumber = Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")

      if (isCursorEndpoint) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "cursor disabled for fallback regression" }),
        })
        return
      }

      pageRequests.push(pageNumber)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: (pageNumber === 1 ? firstPageIds : secondPageIds).map(buildMockExploreItem),
          pageable: {
            pageNumber: Math.max(pageNumber - 1, 0),
            pageSize,
            totalElements: pageSize * 2,
            totalPages: 2,
          },
        }),
      })
    },
  })

  await page.goto("/")
  await waitForPageReady(page)
  await expect(page.getByRole("heading", { name: "CLS 예산 점검 1301" })).toBeVisible()

  await page.getByRole("button", { name: "더보기" }).click()

  await expect(page.getByText("피드 18개")).toBeVisible()
  expect(pageRequests).toContain(2)
  expect(pageRequests.filter((value) => value === 2)).toHaveLength(1)
})

  test("홈 피드 page fallback은 빈 page에서 추가 요청을 멈춘다", async ({ page }) => {
  const pageRequests: number[] = []

  await mockFeedEndpoints(page, {
    feedHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const pageNumber = Number(url.searchParams.get("page") || "1")
      const pageSize = Number(url.searchParams.get("pageSize") || "24")

      if (isCursorEndpoint) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ message: "cursor disabled for empty-page guard regression" }),
        })
        return
      }

      pageRequests.push(pageNumber)
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: pageNumber === 1 ? [buildMockExploreItem(1351)] : [],
          pageable: {
            pageNumber: Math.max(pageNumber - 1, 0),
            pageSize,
            totalElements: pageSize * 3,
            totalPages: 3,
          },
        }),
      })
    },
  })

  await page.goto("/")
  await waitForPageReady(page)
  await expect(page.getByRole("heading", { name: "CLS 예산 점검 1351" })).toBeVisible()

  await page.getByRole("button", { name: "더보기" }).click()

  await expect(page.getByRole("button", { name: "더보기" })).toHaveCount(0)
  expect(pageRequests).toContain(2)
  expect(pageRequests).not.toContain(3)
})

  test("태그와 keyword 조합은 explore page API에 keyword를 보존한다", async ({ page }) => {
  const capturedExploreRequests: Array<{ isCursorEndpoint: boolean; kw: string; tag: string }> = []

  await mockFeedEndpoints(page, {
    exploreHandler: async (route) => {
      const url = new URL(route.request().url())
      const isCursorEndpoint = url.pathname.endsWith("/cursor")
      const kw = url.searchParams.get("kw") || ""
      const tag = url.searchParams.get("tag") || ""
      capturedExploreRequests.push({ isCursorEndpoint, kw, tag })

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          content: [buildMockExploreItem(1401)],
          pageable: {
            pageNumber: 0,
            pageSize: Number(url.searchParams.get("pageSize") || "24"),
            totalElements: 1,
            totalPages: 1,
          },
        }),
      })
    },
  })

  await page.goto("/?tag=perf")
  await waitForPageReady(page)

  capturedExploreRequests.length = 0
  await page.getByLabel("Search posts by keyword").fill("latency")

  await expect(page.getByRole("heading", { name: "CLS 예산 점검 1401" })).toBeVisible()
  await expect
    .poll(() =>
      capturedExploreRequests.some(
        (request) => !request.isCursorEndpoint && request.kw === "latency" && request.tag === "perf"
      )
    )
    .toBeTruthy()
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
  const duplicatedPages = Object.entries(callCounts).filter(
    ([signature, count]) => count > 1 && !["page:1", "cursor:1"].includes(signature)
  )
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
  const duplicatedPages = Object.entries(callCounts).filter(
    ([signature, count]) => count > 1 && !["page:1", "cursor:1"].includes(signature)
  )
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
})
