import { expect, test, type Page } from "@playwright/test"

const AVATAR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0WkAAAAASUVORK5CYII="
const AVATAR_PNG = Buffer.from(AVATAR_PNG_BASE64, "base64")

const mockAvatarAsset = async (page: Page) => {
  await page.route("**/avatar.png", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: AVATAR_PNG,
    })
  })
}

const createExplorePost = (overrides: Partial<Record<string, unknown>> & { title: string }) => ({
  id: 101,
  createdAt: "2026-03-16T00:00:00Z",
  modifiedAt: "2026-03-16T00:00:00Z",
  authorId: 1,
  authorName: "관리자",
  authorUsername: "aquila",
  authorProfileImgUrl: "/avatar.png",
  summary: "탐색 API 스모크",
  tags: ["테스트태그"],
  category: ["백엔드"],
  published: true,
  listed: true,
  likesCount: 0,
  commentsCount: 0,
  hitCount: 0,
  ...overrides,
})

const createExplorePage = (
  title: string,
  tag = "테스트태그",
  overrides: Partial<Record<string, unknown>> = {}
) => ({
  content: [
    createExplorePost({
      title,
      tags: [tag],
      ...overrides,
    }),
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
    const url = new URL(route.request().url())
    const sort = url.searchParams.get("sort") || "CREATED_AT"

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`정렬:${sort}`)),
    })
  })

  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "초기목록")),
    })
  })

  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    const tag = url.searchParams.get("tag") || ""
    const sort = url.searchParams.get("sort") || "CREATED_AT"
    const title = kw
      ? `검색:${kw}`
      : tag
        ? `태그:${tag}`
        : `정렬:${sort}`

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(title, tag || "테스트태그")),
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

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test("홈 피드 기본 UI가 렌더링된다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByLabel("Search posts by keyword")).toBeVisible()
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()
})

test("홈 새로고침 이후에도 레거시 기본 문구로 되돌아가지 않는다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1, name: "비밀스러운 IT 공작소" })).toBeVisible()
  await expect(page.getByText("비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다")).toBeVisible()
  await expect(page.getByText("aquilaXk's Blog")).toHaveCount(0)

  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "비밀스러운 IT 공작소" })).toBeVisible()
  await expect(page.getByText("비밀스러운 지식들을 탐구하는데 목적을 두고 있습니다")).toBeVisible()
  await expect(page.getByText("aquilaXk's Blog")).toHaveCount(0)
})

test("피드 카드 요약의 escaped quote는 화면에서 정리되어 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        createExplorePage("요약 정규화", "SSE", {
          summary: 'SSE 알림이 \\\\\\"잠깐 되다가 멈추는\\\\\\" 현상 추적',
        })
      ),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "SSE", count: 1 }]),
    })
  })

  await page.goto("/")
  await expect(page.getByText('SSE 알림이 "잠깐 되다가 멈추는" 현상 추적')).toBeVisible()
  await expect(page.getByText('\\"잠깐 되다가 멈추는\\"')).toHaveCount(0)
})

test("상단 내비 컨트롤은 공통 높이 토큰을 유지한다", async ({ page }) => {
  await mockFeedEndpoints(page)
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })

  await page.goto("/")
  await expect(page.locator("[data-ui='nav-control']").first()).toBeVisible()

  const uniqueHeights = await page.locator("[data-ui='nav-control']").evaluateAll((elements) => {
    const roundedHeights = elements
      .map((element) => Math.round(element.getBoundingClientRect().height))
      .filter((value) => value > 0)
    return Array.from(new Set(roundedHeights))
  })

  expect(uniqueHeights.length).toBe(1)
  expect(uniqueHeights[0]).toBeGreaterThanOrEqual(34)
  expect(uniqueHeights[0]).toBeLessThanOrEqual(40)
})

test("로그인 정책 토글값은 요청 바디에 반영되고 재진입 시 복원된다", async ({ page }) => {
  const loginBodies: Array<{ rememberMe?: boolean; ipSecurity?: boolean }> = []

  await page.route("**/member/api/v1/auth/login", async (route) => {
    const body = route.request().postData()
    if (body) loginBodies.push(JSON.parse(body))

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: {},
      }),
    })
  })

  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 1,
        username: "aquila",
        nickname: "aquila",
        profileImageUrl: "/avatar.png",
        profileImageDirectUrl: "/avatar.png",
        role: "ROLE_ADMIN",
      }),
    })
  })

  await page.goto("/login?next=%2Flogin")

  await page.locator("#email").fill("qa-login@example.com")
  await page.locator("#password").fill("Abcd1234!")

  await page.getByRole("button", { name: "로그인 상태 유지" }).click()
  await page.getByRole("button", { name: "IP보안 ON/OFF" }).click()
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect.poll(() => loginBodies.length).toBe(1)
  expect(loginBodies[0]?.rememberMe).toBe(false)
  expect(loginBodies[0]?.ipSecurity).toBe(true)

  await page.reload()

  await page.locator("#email").fill("qa-login@example.com")
  await page.locator("#password").fill("Abcd1234!")
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect.poll(() => loginBodies.length).toBe(2)
  expect(loginBodies[1]?.rememberMe).toBe(false)
  expect(loginBodies[1]?.ipSecurity).toBe(true)
})

test("검색 입력은 search API의 kw 파라미터를 통해 백엔드 탐색으로 동작한다", async ({ page }) => {
  const capturedKw: string[] = []

  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    capturedKw.push(kw)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(kw ? `검색:${kw}` : "초기목록")),
    })
  })

  await page.goto("/")
  const searchInput = page.getByLabel("Search posts by keyword")
  await searchInput.fill("alpha")

  await expect.poll(() => capturedKw.some((value) => value === "alpha")).toBeTruthy()
  await expect(page.getByText("검색:alpha")).toBeVisible()
})

test("검색 모드는 백엔드가 반환한 순서를 그대로 유지한다", async ({ page }) => {
  await mockAvatarAsset(page)
  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage("기본목록")),
    })
  })
  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 3 }]),
    })
  })
  await page.route("**/post/api/v1/posts/search**", async (route) => {
    const url = new URL(route.request().url())
    const kw = url.searchParams.get("kw") || ""
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: [
          createExplorePost({
            id: 301,
            title: "본문 exact phrase 매치",
            summary: `백엔드 순위 1: ${kw}`,
            tags: ["운영"],
            createdAt: "2026-01-01T00:00:00Z",
            modifiedAt: "2026-01-01T00:00:00Z",
          }),
          createExplorePost({
            id: 302,
            title: "alpha beta 제목 매치",
            summary: "클라이언트 재정렬이면 앞으로 오면 안 된다",
            tags: ["검색"],
            createdAt: "2026-03-16T00:00:00Z",
            modifiedAt: "2026-03-16T00:00:00Z",
            likesCount: 80,
            commentsCount: 20,
            hitCount: 4000,
          }),
          createExplorePost({
            id: 303,
            title: "태그 매치",
            summary: "태그로만 강한 문서",
            tags: ["alpha", "beta"],
            createdAt: "2026-03-15T00:00:00Z",
            modifiedAt: "2026-03-15T00:00:00Z",
          }),
        ],
        pageable: {
          pageNumber: 0,
          pageSize: 30,
          totalElements: 3,
          totalPages: 1,
        },
      }),
    })
  })

  await page.goto("/")
  const searchInput = page.getByLabel("Search posts by keyword")
  await searchInput.fill("alpha beta")

  await expect(page.getByText("본문 exact phrase 매치")).toBeVisible()
  const titles = await page.locator("a[href^='/posts/'] h2").evaluateAll((elements) =>
    elements.map((element) => element.textContent?.trim() || "").filter(Boolean)
  )
  expect(titles.slice(0, 3)).toEqual([
    "본문 exact phrase 매치",
    "alpha beta 제목 매치",
    "태그 매치",
  ])
})

test("태그 쿼리 파라미터는 explore API의 tag 파라미터로 백엔드 탐색을 요청한다", async ({ page }) => {
  const capturedTag: string[] = []

  await mockFeedEndpoints(page)
  await page.route("**/post/api/v1/posts/explore**", async (route) => {
    const url = new URL(route.request().url())
    const tag = url.searchParams.get("tag") || ""
    capturedTag.push(tag)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(tag ? `태그:${tag}` : "기본목록", tag || "테스트태그")),
    })
  })

  await page.goto("/?tag=%ED%85%8C%EC%8A%A4%ED%8A%B8%ED%83%9C%EA%B7%B8")

  await expect.poll(() => capturedTag.some((value) => value === "테스트태그")).toBeTruthy()
  await expect(page.getByText("태그:테스트태그")).toBeVisible()
})

test("메인 피드 탐색 요청은 최신순 정렬(sort=CREATED_AT)로 고정된다", async ({ page }) => {
  const capturedSort: string[] = []

  await page.route("**/post/api/v1/posts/feed**", async (route) => {
    const url = new URL(route.request().url())
    const sort = url.searchParams.get("sort") || "CREATED_AT"
    capturedSort.push(sort)

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(createExplorePage(`정렬:${sort}`)),
    })
  })

  await page.route("**/post/api/v1/posts/tags", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ tag: "테스트태그", count: 1 }]),
    })
  })

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()

  await expect.poll(() => capturedSort.some((value) => value === "CREATED_AT")).toBeTruthy()
  await expect(page.getByText("정렬:CREATED_AT")).toBeVisible()
})

test("상세 페이지는 클라이언트 복구 요청으로 렌더되고 조회수 hit는 1회 반영된다", async ({ page }) => {
  let hitCountRequest = 0

  await page.route("**/post/api/v1/posts/101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 101,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "상세 E2E 글",
        content: "본문 E2E",
        tags: ["테스트태그"],
        category: [],
        published: true,
        listed: true,
        likesCount: 3,
        commentsCount: 1,
        hitCount: 7,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/101/hit", async (route) => {
    hitCountRequest += 1
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 8 },
      }),
    })
  })

  await page.goto("/posts/101")
  await expect(page.getByText("상세 E2E 글")).toBeVisible()
  await expect.poll(() => hitCountRequest).toBe(1)
  const viewStatChip = page.locator('[aria-label="post engagement"] .viewStatChip')
  await expect(viewStatChip).toContainText("조회")
  await expect(viewStatChip).toContainText("8")
})

test("상세 코드블럭은 Prism fallback 토큰 하이라이팅을 유지한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/104", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 104,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "코드 하이라이트 회귀 방지",
        content: [
          "```javascript",
          "const count = 1",
          "function run() {",
          "  return \"ok\"",
          "}",
          "```",
        ].join("\n"),
        tags: ["테스트태그"],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/104/hit", async (route) => {
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

  await page.goto("/posts/104")

  const codeRoot = page.locator(".aq-code-block pre code").first()
  await expect(codeRoot).toBeVisible()
  await expect(page.locator(".aq-code-block pre code .token.keyword").first()).toBeVisible()
  await expect(page.locator(".aq-code-block pre code .token.string").first()).toBeVisible()

  const colors = await page.evaluate(() => {
    const code = document.querySelector<HTMLElement>(".aq-code-block pre code")
    const keyword = document.querySelector<HTMLElement>(".aq-code-block pre code .token.keyword")
    const stringToken = document.querySelector<HTMLElement>(".aq-code-block pre code .token.string")

    return {
      code: code ? window.getComputedStyle(code).color : "",
      keyword: keyword ? window.getComputedStyle(keyword).color : "",
      string: stringToken ? window.getComputedStyle(stringToken).color : "",
    }
  })

  expect(colors.code).toBeTruthy()
  expect(colors.keyword).toBeTruthy()
  expect(colors.string).toBeTruthy()
  expect(colors.keyword).not.toBe(colors.code)
  expect(colors.string).not.toBe(colors.code)
})

test("모바일 상세는 compact 액션과 접이식 목차를 노출한다", async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 852 })
  await page.addInitScript(() => {
    const clipboard = {
      writeText: async () => undefined,
    }
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    })
  })

  await page.route("**/post/api/v1/posts/909", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 909,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "모바일 상세 UX 테스트",
        content: ["## 첫 섹션", "본문", "### 둘째 섹션", "본문"].join("\n\n"),
        tags: ["모바일"],
        category: [],
        published: true,
        listed: true,
        likesCount: 2,
        commentsCount: 3,
        hitCount: 5,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/909/hit", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        resultCode: "200-1",
        msg: "ok",
        data: { hitCount: 6 },
      }),
    })
  })

  await page.goto("/posts/909")
  const compactActionBar = page.getByLabel("빠른 이동 및 반응")
  const engagementRow = page.locator('[aria-label="post engagement"]')
  await expect(page.getByRole("button", { name: /공유/ })).toHaveCount(1)
  await expect(page.getByRole("button", { name: /^좋아요/ })).toHaveCount(1)
  await expect(engagementRow.getByRole("button", { name: /^좋아요/ })).toBeVisible()
  await expect(engagementRow.locator(".commentStatChip")).toBeHidden()
  await expect(compactActionBar.getByRole("button", { name: /^공유/ })).toBeVisible()
  await expect(compactActionBar.getByRole("button", { name: /^댓글/ })).toBeVisible()
  const compactTocSummary = page.locator('[aria-label="접이식 목차"] summary')
  await expect(compactTocSummary).toBeVisible()
  await expect(compactTocSummary.getByText("목차")).toBeVisible()
  await expect(compactTocSummary.getByText("2개 섹션")).toBeVisible()
  const compactShareButton = compactActionBar.getByRole("button", { name: /^공유/ })
  await compactShareButton.click()
  await expect(compactShareButton).toBeVisible()

  await compactTocSummary.click()
  await expect(page.getByRole("button", { name: "첫 섹션" })).toBeVisible()
})

test("상세 페이지 머메이드 블록은 코드 텍스트가 아니라 다이어그램 SVG로 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/777**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 777,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 렌더링 테스트",
        content: [
          "```mermaid",
          "graph TD",
          "  A[요청] --> B[완료]",
          "```",
        ].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/777/hit**", async (route) => {
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

  await page.goto("/posts/777")
  await expect(page.getByText("머메이드 렌더링 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => await page.locator(".aq-mermaid-stage svg").count(), { timeout: 20_000 })
    .toBeGreaterThan(0)
  await expect(page.locator("pre code", { hasText: "graph TD" })).toHaveCount(0)
})

test("깃허브 호환용 mermaid info 블록도 렌더 경로를 탄다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/780**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 780,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 info 테스트",
        content: ["```mermaid", "info", "```"].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/780/hit**", async (route) => {
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

  await page.goto("/posts/780")
  await expect(page.getByText("머메이드 info 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect(page.locator(".aq-mermaid-stage")).toContainText("v10.")
  await expect(page.locator("pre code", { hasText: /^info$/ })).toHaveCount(0)
})

test("긴 Mermaid 라벨은 자동 줄바꿈 힌트를 적용해 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/781**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 781,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 긴 라벨 줄바꿈 테스트",
        content: [
          "```mermaid",
          "flowchart TD",
          '  A["SSE 알림이 잠깐 되다가 멈추는 현상을 추적한 트러블슈팅 기록입니다"] --> B{"20초 내 heartbeat 수신 여부와 재연결 누락 여부를 함께 확인해야 하나요?"}',
          "  B -->|Yes| C[정상]",
          "  B -->|No| D[점검]",
          "```",
        ].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/781/hit**", async (route) => {
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

  await page.goto("/posts/781")
  await expect(page.getByText("머메이드 긴 라벨 줄바꿈 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect
    .poll(async () => {
      return (
        (await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").first().getAttribute("data-mermaid-source")) ||
        ""
      )
    })
    .toContain("<br/>")
})

test("복잡한 Mermaid는 복잡도 가드를 표시하고 확대 버튼을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })

  const chainLines = Array.from({ length: 82 }, (_, index) => {
    return `  N${index}[노드 ${index}] --> N${index + 1}[노드 ${index + 1}]`
  })

  await page.route("**/post/api/v1/posts/782**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 782,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 복잡도 가드 테스트",
        content: ["```mermaid", "flowchart TD", ...chainLines, "```"].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/782/hit**", async (route) => {
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

  await page.goto("/posts/782")
  await expect(page.getByText("머메이드 복잡도 가드 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator("pre.aq-mermaid[data-mermaid-rendered='true']").count(), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await expect(page.locator("pre.aq-mermaid[data-mermaid-complexity='high']")).toHaveCount(1)
  await expect(page.locator("pre.aq-mermaid[data-mermaid-expandable='true'] .aq-mermaid-expand-btn")).toBeVisible()

  const overflow = await page.evaluate(() => {
    const html = document.documentElement
    const body = document.body
    return {
      htmlClientWidth: html.clientWidth,
      htmlScrollWidth: html.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
    }
  })
  expect(overflow.htmlScrollWidth).toBeLessThanOrEqual(overflow.htmlClientWidth + 1)
  expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.bodyClientWidth + 1)
})

test("잘못된 닫힘 fence(```4) 입력도 복구되어 머메이드와 후속 마크다운이 함께 정상 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/778**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 778,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "머메이드 fence 복구 테스트",
        content: [
          "```mermaid",
          "flowchart LR",
          "  A[시작] --> B[완료]",
          "```4",
          "",
          "이 문장은 **볼드**로 렌더되어야 합니다.",
        ].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/778/hit**", async (route) => {
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

  await page.goto("/posts/778")
  await expect(page.getByText("머메이드 fence 복구 테스트")).toBeVisible()
  await expect
    .poll(async () => await page.locator(".aq-mermaid-stage svg").count())
    .toBeGreaterThan(0)
  await expect(page.locator("pre code", { hasText: "flowchart LR" })).toHaveCount(0)
  await expect(page.locator("strong", { hasText: "볼드" })).toBeVisible()
})

test("상세 페이지 콜아웃과 토글 블록은 작성 문법대로 렌더된다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/779**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 779,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "콜아웃 토글 렌더링 테스트",
        content: [
          "> [!TIP]",
          "> **핵심 포인트**",
          "> 콜아웃 본문입니다.",
          "",
          "<aside>",
          "ℹ️",
          "**추가 정보**",
          '정확히는 **"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"**가 가장 적절한 선택이었습니다.',
          "</aside>",
          "",
          "<aside>",
          "ℹ️",
          "**Endpoint**는 연결을 여는 입구입니다.",
          "",
          "- **Prefix**는 메시지의 진입 방향과 배포 방향을 나누는 규칙입니다.",
          "- **Broker**는 구독자에게 메시지를 전달하는 우체국입니다.",
          "</aside>",
          "",
          ":::toggle 더 보기",
          "토글 내부 본문입니다.",
          ":::",
        ].join("\n"),
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
    })
  })

  await page.route("**/post/api/v1/posts/779/hit**", async (route) => {
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

  await page.goto("/posts/779")
  await expect(page.getByText("콜아웃 토글 렌더링 테스트")).toBeVisible()
  await expect(page.locator(".aq-callout.aq-admonition-tip")).toBeVisible()
  await expect(page.locator(".aq-callout.aq-admonition-tip .aq-callout-title")).toHaveText("핵심 포인트")
  await expect(page.locator(".aq-callout.aq-admonition-tip")).toContainText("콜아웃 본문입니다.")
  const infoCallout = page.locator(".aq-callout.aq-admonition-info").first()
  await expect(infoCallout).toBeVisible()
  await expect(infoCallout.locator(".aq-callout-title")).toHaveText("추가 정보")
  await expect(infoCallout).toContainText(
    '정확히는 "OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"가 가장 적절한 선택이었습니다.'
  )
  await expect(infoCallout.locator(".aq-markdown-text strong")).toHaveText(
    '"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"'
  )
  await expect(infoCallout).not.toContainText('**"OAuth 2.0 흐름을 사용하되, 인증 시나리오는 OIDC로 구현한다"**')
  const inlineBoldInfoCallout = page.locator(".aq-callout.aq-admonition-info").nth(1)
  await expect(inlineBoldInfoCallout).toBeVisible()
  await expect(inlineBoldInfoCallout.locator(".aq-callout-title")).toHaveCount(0)
  await expect(inlineBoldInfoCallout).toContainText("Endpoint는 연결을 여는 입구입니다.")
  await expect(inlineBoldInfoCallout.locator(".aq-markdown-text strong").first()).toHaveText("Endpoint")
  await expect(page.getByText(/^Tip$/)).toHaveCount(0)
  await expect(page.getByText(/^Information$/)).toHaveCount(0)
  await page.getByText("더 보기").click()
  await expect(page.getByText("토글 내부 본문입니다.")).toBeVisible()
})

test("비로그인 상태에서 좋아요 클릭 시 로그인 페이지로 이동한다", async ({ page }) => {
  await page.route("**/post/api/v1/posts/101", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 101,
        createdAt: "2026-03-16T00:00:00Z",
        modifiedAt: "2026-03-16T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "좋아요 이동 테스트",
        content: "본문",
        tags: [],
        category: [],
        published: true,
        listed: true,
        likesCount: 0,
        commentsCount: 0,
        hitCount: 0,
        actorHasLiked: false,
        actorCanModify: false,
        actorCanDelete: false,
      }),
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

  await page.goto("/posts/101")
  await page.locator('button[aria-label^="좋아요"]:visible').first().click()

  await expect(page).toHaveURL(/\/login\?/)
})

test("인증 사용자 알림 패널은 ESC로 닫히고 포커스가 트리거로 복귀한다", async ({ page }) => {
  await mockFeedEndpoints(page)

  await page.route("**/member/api/v1/auth/me", async (route) => {
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

  const snapshotPayload = {
    items: [
      {
        id: 1,
        type: "POST_COMMENT",
        createdAt: "2026-03-16T00:00:00Z",
        actorId: 2,
        actorName: "유저",
        actorProfileImageUrl: "/avatar.png",
        postId: 101,
        commentId: 77,
        postTitle: "알림 테스트 글",
        commentPreview: "테스트 댓글",
        message: "댓글이 등록되었습니다.",
        isRead: false,
      },
    ],
    unreadCount: 1,
  }

  await page.route("**/member/api/v1/notifications/snapshot", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotPayload),
    })
  })

  await page.route("**/member/api/v1/notifications/unread-count", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ unreadCount: 1 }),
    })
  })

  await page.route("**/member/api/v1/notifications", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(snapshotPayload.items),
    })
  })

  await page.route("**/member/api/v1/notifications/stream**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: "event: heartbeat\ndata: {}\n\n",
    })
  })

  await page.context().addCookies([
    {
      name: "apiKey",
      value: "e2e-session",
      url: "http://127.0.0.1:3000",
    },
  ])

  await page.goto("/")
  await expect(page.getByRole("button", { name: "전체보기" })).toBeVisible()

  const bellTrigger = page.getByRole("button", { name: "알림" })
  await expect(bellTrigger).toBeVisible()
  await bellTrigger.click()
  await expect(page.getByRole("dialog", { name: "알림 목록" })).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "알림 목록" })).toHaveCount(0)
  await expect(bellTrigger).toBeFocused()
})

test("로그인 실패 메시지가 상태코드 기준으로 표준화된다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "invalid credentials" }),
    })
  })

  await page.goto("/login")
  await page.getByLabel("이메일").fill("wrong-user@example.com")
  await page.locator("#password").fill("wrong-password")
  await page.getByRole("button", { name: "로그인", exact: true }).click()

  await expect(page.getByText("이메일 또는 비밀번호가 올바르지 않습니다.")).toBeVisible()
})

test("회원가입 메일 시작 실패 메시지가 표준화된다", async ({ page }) => {
  await page.route("**/member/api/v1/signup/email/start", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "500-1", msg: "smtp down" }),
    })
  })

  await page.goto("/signup")
  await page.getByLabel("이메일").fill("smoke@example.com")
  await page.getByRole("button", { name: "인증 메일 보내기" }).click()

  await expect(page.getByText("회원가입 메일 발송에 실패했습니다.")).toBeVisible()
})
