import { expect, test, type Page, type Route, type TestInfo } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { mockAdminPostsWorkspaceEndpoints } from "./helpers/mobileLayoutFixtures"

const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
const AVATAR_PNG = Buffer.from(AVATAR_PNG_BASE64, "base64")
const testBaseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000"
const localDraftStorageKey = "admin.editor.localDraft.v1"
const adminMember = {
  id: 1,
  username: "qa-admin",
  nickname: "aquila",
  isAdmin: true,
}

const mockAvatarAsset = async (page: Page) => {
  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })
}

const mockAnonymousSession = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "로그인 후 이용해주세요.", data: null }),
    })
  })
}

const fulfillJson = async (route: Route, data: unknown) => {
  await route.fulfill({
    contentType: "application/json",
    body: JSON.stringify(data),
  })
}

const setSchemeCookie = async (page: Page, scheme: "light" | "dark") => {
  await page.context().addCookies([
    {
      name: "scheme",
      value: scheme,
      url: testBaseUrl,
      sameSite: "Lax",
    },
  ])
}

const mockAuthenticatedEditor = async (page: Page) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await fulfillJson(route, adminMember)
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await fulfillJson(route, [])
  })
  await page.route("**/post/api/v1/posts/temp", async (route) => {
    await fulfillJson(route, {
      resultCode: "200-1",
      msg: "temp draft",
      data: {
        id: 990,
        title: "임시글",
        content: "",
        published: false,
        listed: false,
        tempDraft: true,
      },
    })
  })
  await page.addInitScript(
    ({ storageKey }) => {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          title: "접근성 launch gate 작성 테스트",
          content: "# 접근성 Editor\n\nkeyboard-only 점검용 본문입니다.",
          summary: "접근성 editor gate",
          thumbnailUrl: "",
          thumbnailFocusX: 50,
          thumbnailFocusY: 50,
          thumbnailZoom: 1,
          tags: ["a11y"],
          category: "",
          visibility: "PUBLIC_UNLISTED",
          savedAt: "2026-06-20T10:00:00.000Z",
        })
      )
    },
    { storageKey: localDraftStorageKey }
  )
}

const mockFeedEndpoints = async (page: Page) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          {
            id: 1601,
            createdAt: "2026-03-22T00:00:00Z",
            modifiedAt: "2026-03-22T00:00:00Z",
            authorId: 1,
            authorName: "관리자",
            authorUsername: "aquila",
            authorProfileImgUrl: "/avatar.png",
            title: "접근성 점검용 피드 카드",
            summary: "A11y smoke",
            tags: ["a11y"],
            category: ["테스트"],
            published: true,
            listed: true,
            likesCount: 1,
            commentsCount: 1,
            hitCount: 10,
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

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 0,
          totalPages: 0,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 0,
          totalPages: 0,
        },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "a11y", count: 1 }]),
    })
  })
}

const mockEmptyFeedEndpoints = async (page: Page) => {
  const emptyPage = {
    content: [],
    pageable: {
      pageNumber: 0,
      pageSize: 30,
      totalElements: 0,
      totalPages: 0,
    },
  }

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await fulfillJson(route, emptyPage)
  })
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    await fulfillJson(route, emptyPage)
  })
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    await fulfillJson(route, emptyPage)
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await fulfillJson(route, [])
  })
}

const mockDetailEndpoint = async (page: Page) => {
  await page.route("**/post/api/v1/posts/991", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 991,
        createdAt: "2026-03-22T00:00:00Z",
        modifiedAt: "2026-03-22T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "접근성 상세 점검",
        content: "## 본문 제목\n\n접근성 점검용 문단입니다.",
        tags: ["a11y"],
        category: ["테스트"],
        published: true,
        listed: true,
        likesCount: 1,
        commentsCount: 1,
        hitCount: 10,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/991/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 11 },
      }),
    })
  })

  await page.route("**/post/api/v1/posts/991/comments", async (route) => {
    await fulfillJson(route, [])
  })
}

const expectLaunchGateAccessibility = async (page: Page, testInfo: TestInfo, label: string) => {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze()

  const criticalOrSerious = results.violations.filter((violation) =>
    ["critical", "serious"].includes(violation.impact || "")
  )
  const moderate = results.violations
    .filter((violation) => violation.impact === "moderate")
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    }))

  await testInfo.attach(`${label}-axe-moderate-triage.json`, {
    body: JSON.stringify(moderate, null, 2),
    contentType: "application/json",
  })

  expect(criticalOrSerious).toEqual([])
}

const expectPrimaryLandmarks = async (page: Page) => {
  await expect(page.locator("main").first()).toBeVisible()
  await expect.poll(async () => page.locator("h1").count()).toBeGreaterThanOrEqual(1)
}

const expectNoHorizontalOverflow = async (page: Page) => {
  const snapshot = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    htmlScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }))

  expect(snapshot.htmlScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
  expect(snapshot.bodyScrollWidth).toBeLessThanOrEqual(snapshot.viewportWidth)
}

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
  await mockAnonymousSession(page)
})

test("홈 피드 주요 영역은 reduced motion과 landmark 계약에서 심각도 높은 접근성 위반이 없다", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await mockFeedEndpoints(page)
  await page.goto("/")
  await expect(page.locator("main")).toBeVisible()
  await expect(page.getByRole("heading", { level: 1, name: "AquilaLog" })).toBeVisible()
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expectPrimaryLandmarks(page)
  await expectLaunchGateAccessibility(page, testInfo, "home-reduced-motion")
})

test("상세 댓글 composer와 200% zoom 상태는 심각도 높은 접근성 위반이 없다", async ({
  page,
}, testInfo) => {
  await mockDetailEndpoint(page)
  await page.goto("/posts/991")
  await expect(page.getByRole("heading", { name: "접근성 상세 점검" })).toBeVisible()
  await page.locator('[data-rum-section="comments"]').scrollIntoViewIfNeeded()
  await expect(page.getByText("첫 댓글을 남겨보세요.")).toBeVisible()
  await expect(page.getByRole("button", { name: "로그인하고 댓글 작성" })).toBeVisible()
  await page.addStyleTag({ content: "html { zoom: 2; }" })
  await expectNoHorizontalOverflow(page)
  await expectPrimaryLandmarks(page)
  await expectLaunchGateAccessibility(page, testInfo, "detail-comments-zoom")
})

test("모바일 menu와 login modal은 keyboard-only 진입에서 심각도 높은 접근성 위반이 없다", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await mockFeedEndpoints(page)
  await page.goto("/")

  const menuButton = page.getByRole("button", { name: "헤더 메뉴 열기" })
  await expect(menuButton).toBeVisible()
  await menuButton.focus()
  await page.keyboard.press("Enter")

  const mobileMenu = page.getByRole("menu", { name: "모바일 네비게이션" })
  await expect(mobileMenu).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(mobileMenu).toHaveCount(0)
  await expect(menuButton).toBeFocused()

  await page.keyboard.press("Enter")
  await expect(mobileMenu).toBeVisible()
  await mobileMenu.getByRole("menuitem", { name: "Login" }).click()

  const loginDialog = page.getByRole("dialog", { name: "로그인" })
  await expect(loginDialog).toBeVisible()
  await expect(loginDialog.getByLabel("이메일")).toBeVisible()
  await expectNoHorizontalOverflow(page)
  await expectLaunchGateAccessibility(page, testInfo, "mobile-menu-login-modal")
})

test("관리자 글 목록 surface는 심각도 높은 접근성 위반이 없다", async ({ page }, testInfo) => {
  await mockAdminPostsWorkspaceEndpoints(page)

  await page.goto("/admin/posts")
  await expect(page.getByRole("heading", { name: "글 목록" })).toBeVisible()
  await expect(page.getByRole("navigation").first()).toBeVisible()
  await expect(page.getByLabel("검색어")).toBeVisible()
  await expectPrimaryLandmarks(page)
  await expectLaunchGateAccessibility(page, testInfo, "admin-posts")
})

test("editor 작성 surface는 keyboard landmark와 심각도 높은 접근성 위반 gate를 통과한다", async ({
  page,
}, testInfo) => {
  await setSchemeCookie(page, "dark")
  await mockAuthenticatedEditor(page)

  await page.goto("/editor/new?source=local-draft")
  await expect(page.locator("html")).toHaveAttribute("data-aquila-scheme", "dark")
  await expect(page.getByPlaceholder("제목을 입력하세요").first()).toHaveValue("접근성 launch gate 작성 테스트")
  await expect(page.getByTestId("markdown-editor")).toBeVisible()
  await expect(page.getByLabel("Markdown 본문")).toBeVisible()
  await page.getByLabel("Markdown 본문").focus()
  await expect(page.getByLabel("Markdown 본문")).toBeFocused()
  await expectPrimaryLandmarks(page)
  await expectLaunchGateAccessibility(page, testInfo, "editor-authoring")
})

test("피드 empty state는 keyboard와 screen-reader landmark gate를 통과한다", async ({ page }, testInfo) => {
  await mockEmptyFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "아직 게시글이 없습니다." })).toBeVisible()
  await page.getByLabel("Search posts by keyword").fill("없는검색어")
  await expect(page.getByRole("heading", { name: "검색 결과가 없습니다." })).toBeVisible()
  await expectPrimaryLandmarks(page)
  await expectLaunchGateAccessibility(page, testInfo, "feed-empty-state")
})
