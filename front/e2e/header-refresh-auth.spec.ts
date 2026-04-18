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

const createPostDetail = () => ({
  id: 101,
  createdAt: "2026-03-16T00:00:00Z",
  modifiedAt: "2026-03-16T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImageDirectUrl: "/avatar.png",
  title: "관리자 상세 액션 회귀",
  content: "본문",
  tags: ["테스트태그"],
  category: ["백엔드"],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 0,
  hitCount: 0,
  actorHasLiked: false,
  actorCanModify: false,
  actorCanDelete: false,
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

const measureHeaderActionGap = async (page: Page, mode: "anonymous" | "authenticated") => {
  return page.evaluate(({ currentMode }) => {
    const aboutLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
      (link) => link.textContent?.trim() === "About"
    )
    const loginButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Login"
    )
    const adminLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
      (link) => link.textContent?.trim() === "Admin"
    )
    const logoutButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.trim() === "Logout"
    )

    const aboutRect = aboutLink?.getBoundingClientRect() ?? null
    const loginRect = loginButton?.getBoundingClientRect() ?? null
    const adminRect = adminLink?.getBoundingClientRect() ?? null
    const logoutRect = logoutButton?.getBoundingClientRect() ?? null

    return currentMode === "anonymous"
      ? {
          aboutRight: aboutRect?.right ?? 0,
          loginLeft: loginRect?.left ?? 0,
          gap: loginRect && aboutRect ? loginRect.left - aboutRect.right : Number.POSITIVE_INFINITY,
        }
      : {
          adminRight: adminRect?.right ?? 0,
          logoutLeft: logoutRect?.left ?? 0,
          gap: logoutRect && adminRect ? logoutRect.left - adminRect.right : Number.POSITIVE_INFINITY,
        }
  }, { currentMode: mode })
}

test("익명 snapshot이 있으면 delayed auth probe 동안에도 Login이 유지된다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.setViewportSize({ width: 1800, height: 900 })
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
  const anonymousGap = await measureHeaderActionGap(page, "anonymous")
  expect(anonymousGap.gap).toBeLessThanOrEqual(72)
  await page.waitForTimeout(300)
  await expect(page.getByRole("button", { name: "Login", exact: true })).toBeVisible()
  const anonymousGapAfterProbe = await measureHeaderActionGap(page, "anonymous")
  expect(anonymousGapAfterProbe.gap).toBeLessThanOrEqual(72)
})

test("인증 snapshot이 있으면 delayed auth probe 동안에도 Admin/Logout이 유지된다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.setViewportSize({ width: 1800, height: 900 })
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
  const authenticatedGap = await measureHeaderActionGap(page, "authenticated")
  expect(authenticatedGap.gap).toBeLessThanOrEqual(120)
  await page.waitForTimeout(300)
  await expect(page.getByRole("link", { name: "Admin", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "Logout", exact: true })).toBeVisible()
  const authenticatedGapAfterProbe = await measureHeaderActionGap(page, "authenticated")
  expect(authenticatedGapAfterProbe.gap).toBeLessThanOrEqual(120)
})

test("인증 snapshot이 있으면 delayed auth probe 동안에도 글 상세 수정/삭제 버튼이 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.addInitScript(
    ({ storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({ authenticated: true, admin: true })
      )
    },
    { storageKey: HEADER_AUTH_SHELL_STORAGE_KEY }
  )

  await page.route("**/post/api/v1/posts/101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createPostDetail()),
    })
  })

  await page.route("**/post/api/v1/posts/101/hit", async (route) => {
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

  await page.goto("/posts/101", { waitUntil: "domcontentloaded" })
  const editButton = page.getByRole("button", { name: "수정" }).first()
  const deleteButton = page.getByRole("button", { name: "삭제" }).first()

  await expect(editButton).toBeVisible()
  await expect(deleteButton).toBeVisible()
  await page.waitForTimeout(300)
  await expect(editButton).toBeVisible()
  await expect(deleteButton).toBeVisible()
})
