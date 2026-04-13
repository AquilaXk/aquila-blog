import { expect, test, type Page } from "@playwright/test"

const HEADER_AUTH_SHELL_STORAGE_KEY = "header.auth-shell.v1"

const createExplorePage = (title: string) => ({
  content: [
    {
      id: 101,
      createdAt: "2026-03-16T00:00:00Z",
      modifiedAt: "2026-03-16T00:00:00Z",
      authorId: 1,
      authorName: "관리자",
      authorUsername: "aquila",
      authorProfileImgUrl: "/avatar.png",
      title,
      summary: "헤더 refresh auth 회귀",
      tags: ["테스트태그"],
      category: ["백엔드"],
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
      body: JSON.stringify(createExplorePage("헤더 인증 회귀")),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("헤더 인증 회귀")),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 1 }]),
    })
  })
}

const wait = async (ms: number) => {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

test("익명 snapshot이 있으면 delayed auth probe 동안에도 Login이 유지된다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.addInitScript(
    ({ storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ authenticated: false, admin: false })
      )
    },
    { storageKey: HEADER_AUTH_SHELL_STORAGE_KEY }
  )

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await wait(1500)
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible()
})

test("인증 snapshot이 있으면 delayed auth probe 동안에도 Admin/Logout이 유지된다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.addInitScript(
    ({ storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ authenticated: true, admin: true })
      )
    },
    { storageKey: HEADER_AUTH_SHELL_STORAGE_KEY }
  )

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await wait(1500)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        username: "aquila",
        nickname: "관리자",
        isAdmin: true,
      }),
    })
  })

  await page.goto("/", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible()
})
