import { readFileSync } from "node:fs"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset } from "./helpers/smokeFixtures"
test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke detail layout", () => {
  test("상세 shell은 V4 article layout 수치 계약을 유지한다", () => {
    const detailStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/PostDetail.styles.ts"),
      "utf8"
    )
    const sectionStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/PostDetailSection.styles.ts"),
      "utf8"
    )
    const commentStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/CommentBox/CommentBox.styles.ts"),
      "utf8"
    )
    const headerStyles = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/PostHeader.styles.ts"),
      "utf8"
    )
    const commentSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/CommentBox/index.tsx"),
      "utf8"
    )
    const relatedSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/PostDetailRelatedSection.tsx"),
      "utf8"
    )
    const detailSource = readFileSync(
      path.resolve(__dirname, "../src/routes/Detail/PostDetail/index.tsx"),
      "utf8"
    )

    expect(detailSource).toContain('className="detailReadProgress"')
    expect(detailSource).toContain('className="detailHero"')
    expect(detailSource.indexOf('className="detailHero"')).toBeLessThan(detailSource.indexOf('className="detailLayout"'))
    expect(detailSource).toContain("readProgressRef")
    expect(detailSource).toContain("documentElement.scrollHeight - window.innerHeight")
    expect(detailSource).not.toContain("./PostFooter")
    expect(detailSource).not.toContain('data-rum-section="footer"')
    expect(detailStyles).toContain(".detailReadProgress")
    expect(detailStyles).toContain("position: fixed;")
    expect(detailStyles).toContain("height: 2px;")
    expect(detailStyles).toContain("z-index: 90;")
    expect(detailStyles).toContain("transform-origin: left center;")
    expect(detailStyles).toContain("width: 100%;")
    expect(detailStyles).toContain("padding: 68px 20px 42px;")
    expect(detailStyles).toContain("border-bottom: 1px solid var(--detail-v4-line);")
    expect(detailStyles).toContain("width: min(100%, 1180px);")
    expect(detailStyles).toContain("grid-template-columns: 64px minmax(0, 760px) 240px;")
    expect(detailStyles).toContain("gap: 44px;")
    expect(detailStyles).toContain("padding: 54px 20px 100px;")
    expect(detailStyles).toContain("top: calc(var(--app-header-height, var(--app-header-mobile-height, 64px)) + 1.25rem);")
    expect(detailStyles).not.toContain("top: 94px;")
    expect(detailStyles).toContain("transition: border-color 0.18s ease, background-color 0.18s ease, color 0.18s ease;")
    expect(detailStyles).not.toContain("translateY(-1px)")
    expect(detailStyles).not.toContain("transform 0.18s ease")
    expect(detailStyles).toContain(".floatingLikeCount")
    expect(detailStyles).toContain("font-size: 10px;")
    expect(detailStyles).toContain("font-weight: 600;")
    expect(detailStyles).toContain("border-left: 1px solid var(--detail-v4-line);")
    expect(detailStyles).toContain("padding: 0 0 0 18px;")
    expect(detailStyles).toContain("margin-bottom: 14px;")
    expect(detailStyles).toContain("padding: 7px 0;")
    expect(detailStyles).toContain("font-size: 12px;")
    expect(detailStyles).toContain("font-weight: 750;")
    expect(detailStyles).not.toContain("button[data-active=\"true\"]::before")
    expect(detailStyles).toContain("@media (max-width: 1100px)")
    expect(detailStyles).toContain("grid-template-columns: 52px minmax(0, 1fr);")
    expect(detailStyles).not.toContain("width: min(100%, 864px);")
    expect(detailStyles).toContain("@media (max-width: 820px)")
    expect(detailStyles).toContain("padding: 44px 20px 28px;")
    expect(detailStyles).toContain("display: block;")
    expect(detailStyles).toContain("padding: 30px 20px 70px;")
    expect(detailStyles).not.toContain("@media (max-width: 768px)")
    expect(headerStyles).toContain("border-radius: 0;")
    expect(headerStyles).not.toContain("border-radius: 10px;")
    expect(sectionStyles).toContain("margin-bottom: 28px;")
    expect(sectionStyles).toContain("width: 42px;")
    expect(sectionStyles).toContain("height: 42px;")
    expect(relatedSource).toContain('data-rum-section="related"')
    expect(relatedSource).toContain("const getRelatedPostMeta = (post: TPost)")
    expect(relatedSource).toContain("post.tags?.[0] || post.category?.[0] || post.type?.[0]")
    expect(relatedSource).toContain("relatedByTagPosts, ...relatedByAuthorPosts")
    expect(relatedSource).toContain("posts.findIndex((item) => item.id === post.id) === index")
    expect(sectionStyles).toContain("margin-top: 64px;")
    expect(sectionStyles).toContain("padding-top: 40px;")
    expect(sectionStyles).toContain("grid-template-columns: minmax(0, 1fr) auto;")
    expect(sectionStyles).toContain("padding: 18px 0;")
    expect(sectionStyles).not.toContain("@media (max-width: 768px)")
    expect(sectionStyles).not.toContain("margin-top: 48px;")
    expect(sectionStyles).not.toContain("padding-top: 32px;")
    expect(sectionStyles).not.toContain("border-radius: 10px;")
    expect(sectionStyles).not.toContain("reasonChip")
    expect(commentStyles).toContain("margin-top: 64px;")
    expect(commentStyles).toContain("padding: 28px 0 0;")
    expect(commentStyles).toContain("border-top: 2px solid #111216;")
    expect(commentStyles).toContain("min-height: 110px;")
    expect(commentSource).toContain('placeholder="질문이나 의견을 남겨주세요."')
    expect(commentSource).toContain("const imageSrc = profileImageDirectUrl || profileImageUrl")
    expect(commentSource).toContain('<span className="avatarFallback" aria-hidden="true" />')
    expect(commentStyles).toContain(".avatarFallback::before")
    expect(commentStyles).toContain(".avatarFallback::after")
    expect(commentSource).not.toContain("CONFIG.profile.image")
  })

  test("404 robots 정책은 noindex이고 canonical은 생략하며 정상 페이지 기본값은 유지한다", async ({ page }) => {
  await page.goto("/404")
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, follow")
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0)

  await addPublicAboutSnapshotCookie(page)
  await page.goto("/about")
  await expect(page.locator('[data-ui="about-hero"] h1')).toHaveText("이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.")
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "follow, index")
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/about$/)
})

  test("게시글 상세 browser title은 글 제목을 포함하고 일반 페이지 title은 site suffix를 중복하지 않는다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })
  await page.route("**/post/api/v1/posts/924", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 924,
        createdAt: "2026-06-20T00:00:00Z",
        modifiedAt: "2026-06-20T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "브라우저 title 회귀 테스트",
        content: "게시글 상세 document title이 글 제목을 포함하는지 확인합니다.",
        type: "Post",
        tags: ["SEO"],
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
  await page.route("**/post/api/v1/posts/924/hit", async (route) => {
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

  await page.goto("/posts/924")
  await expect(page.getByRole("heading", { name: "브라우저 title 회귀 테스트" })).toBeVisible()
  await expect(page).toHaveTitle("브라우저 title 회귀 테스트 | AquilaLog")
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "브라우저 title 회귀 테스트")
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", "브라우저 title 회귀 테스트")

  await addPublicAboutSnapshotCookie(page)
  await page.goto("/about")
  await expect(page.locator('[data-ui="about-hero"] h1')).toHaveText("이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.")
  await expect(page).toHaveTitle("About - AquilaLog")
})

  test("상세 table hover 중 wheel 입력도 page scroll chain을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })

  const spacerParagraphs = Array.from({ length: 12 }, (_, index) =>
    `문단 ${index + 1}. 공개 상세 table hover 스크롤 체인이 유지되는지 확인하기 위한 충분히 긴 본문입니다. `.repeat(4).trim()
  )

  await page.route("**/post/api/v1/posts/468", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 468,
        createdAt: "2026-04-17T00:00:00Z",
        modifiedAt: "2026-04-17T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "table hover scroll chain 회귀 방지",
        content: [
          ...spacerParagraphs.slice(0, 6),
          [
            '<!-- aq-table {"overflowMode":"wide","columnWidths":[280,420]} -->',
            "| 항목 | 설명 |",
            "| --- | --- |",
            "| 문제 | table hover 상태에서 세로 스크롤 입력이 page scroll로 이어져야 합니다. |",
            "| 회귀 방지 | 가로 overflow는 table wrapper가 처리하되, 세로 wheel 입력은 본문 scroll chain을 막지 않습니다. |",
          ].join("\n"),
          ...spacerParagraphs.slice(6),
        ].join("\n\n"),
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

  await page.route("**/post/api/v1/posts/468/hit", async (route) => {
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

  await page.goto("/posts/468")
  await expect(page.getByText("table hover scroll chain 회귀 방지")).toBeVisible()

  const tableScroll = page.locator(".aq-table-scroll").first()
  await expect(tableScroll).toBeVisible()

  await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".aq-table-scroll")
    if (!shell) return
    const rect = shell.getBoundingClientRect()
    const targetTop = window.scrollY + rect.top - Math.round(window.innerHeight * 0.35)
    window.scrollTo({ top: Math.max(0, targetTop) })
  })

  await tableScroll.hover()
  const scrollBeforeWheel = await page.evaluate(() => window.scrollY)

  await page.mouse.wheel(0, 960)

  await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBeforeWheel + 120)
})

  test("상세 우측 목차 active는 스크롤 anchor를 지난 현재 섹션을 유지한다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  const leadParagraph = "목차 active scrollspy 회귀를 재현하기 위한 본문입니다. ".repeat(70).trim()
  const sectionBody = "짧은 섹션 본문입니다. ".repeat(8).trim()
  const content = [
    "## 계측 섹션 01",
    leadParagraph,
    "## 계측 섹션 02",
    sectionBody,
    "### 계측 섹션 03",
    sectionBody,
    "### 계측 섹션 04",
    sectionBody,
    "## 계측 섹션 05",
    leadParagraph,
  ].join("\n\n")

  await page.route("**/post/api/v1/posts/912", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 912,
        createdAt: "2026-05-14T00:00:00Z",
        modifiedAt: "2026-05-14T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "상세 목차 active 안정성 테스트",
        content,
        tags: ["목차"],
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

  await page.route("**/post/api/v1/posts/912/hit", async (route) => {
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

  await page.goto("/posts/912")
  await expect(page.getByRole("heading", { name: "상세 목차 active 안정성 테스트" })).toBeVisible()
  const rightToc = page.locator('aside.rightRail nav[aria-label="목차"]')
  await expect(rightToc.getByRole("button", { name: "계측 섹션 02" })).toBeVisible()

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll<HTMLElement>("article h2, article h3"))
      .find((heading) => heading.textContent?.trim() === "계측 섹션 02")
    if (!target) throw new Error("계측 섹션 02 heading을 찾지 못했습니다.")
    const targetTop = window.scrollY + target.getBoundingClientRect().top - 72
    window.scrollTo(0, targetTop)
  })

  await expect.poll(async () => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(0)
  await expect(rightToc.locator('button[data-active="true"]')).toHaveText("계측 섹션 02")
})

  test("상세 우측 목차는 긴 목록에서도 active 항목을 자동으로 드러낸다", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })

  const paragraph = "목차 자동 표시 회귀를 검증하기 위한 본문입니다. ".repeat(20).trim()
  const content = Array.from({ length: 32 }, (_, index) => {
    const sectionNumber = String(index + 1).padStart(2, "0")
    return [`## 자동 표시 섹션 ${sectionNumber}`, paragraph].join("\n\n")
  }).join("\n\n")

  await page.route("**/post/api/v1/posts/913", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 913,
        createdAt: "2026-05-14T00:00:00Z",
        modifiedAt: "2026-05-14T00:00:00Z",
        authorId: 1,
        authorName: "관리자",
        authorUsername: "aquila",
        authorProfileImageDirectUrl: "/avatar.png",
        title: "상세 목차 자동 표시 테스트",
        content,
        tags: ["목차"],
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

  await page.route("**/post/api/v1/posts/913/hit", async (route) => {
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

  await page.goto("/posts/913")
  await expect(page.getByRole("heading", { name: "상세 목차 자동 표시 테스트" })).toBeVisible()
  const rightToc = page.locator('aside.rightRail nav[aria-label="목차"]')
  await expect(rightToc.getByRole("button", { name: "자동 표시 섹션 32" })).toHaveCount(1)
  const tocDensityMetrics = await rightToc.locator("ol").evaluate((list) => {
    const listRect = list.getBoundingClientRect()
    const rowHeights = Array.from(list.querySelectorAll<HTMLElement>("button"))
      .slice(0, 8)
      .map((button) => button.getBoundingClientRect().height)
    const firstButton = list.querySelector<HTMLElement>("button")
    const firstButtonStyle = firstButton ? window.getComputedStyle(firstButton) : null

    return {
      listHeight: listRect.height,
      maxRowHeight: Math.max(...rowHeights),
      rowFontSize: firstButtonStyle ? Number.parseFloat(firstButtonStyle.fontSize) : 0,
    }
  })

  expect(tocDensityMetrics.listHeight).toBeLessThanOrEqual(560)
  expect(tocDensityMetrics.maxRowHeight).toBeLessThanOrEqual(34)
  expect(tocDensityMetrics.rowFontSize).toBeLessThanOrEqual(13.5)

  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll<HTMLElement>("article h2"))
      .find((heading) => heading.textContent?.trim() === "자동 표시 섹션 28")
    if (!target) throw new Error("자동 표시 섹션 28 heading을 찾지 못했습니다.")
    const targetTop = window.scrollY + target.getBoundingClientRect().top - 72
    window.scrollTo(0, targetTop)
  })

  await expect
    .poll(async () => page.evaluate(() => document.querySelector('aside.rightRail nav[aria-label="목차"] button[data-active="true"]')?.textContent?.trim()))
    .toBe("자동 표시 섹션 28")

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const list = document.querySelector<HTMLElement>('aside.rightRail nav[aria-label="목차"] ol')
          const activeButton = list?.querySelector<HTMLElement>('button[data-active="true"]') ?? null
          const listRect = list?.getBoundingClientRect()
          const activeRect = activeButton?.getBoundingClientRect()
          if (!list || !activeButton || !listRect || !activeRect) {
            return "missing"
          }

          const metrics = {
            activeText: activeButton.textContent?.trim() || "",
            scrollTop: Math.round(list.scrollTop),
            activeTop: Math.round(activeRect.top),
            activeBottom: Math.round(activeRect.bottom),
            listTop: Math.round(listRect.top),
            listBottom: Math.round(listRect.bottom),
          }
          const activeVisible =
            metrics.activeTop >= metrics.listTop - 1 && metrics.activeBottom <= metrics.listBottom + 1
          const revealComplete =
            metrics.activeText === "자동 표시 섹션 28" && metrics.scrollTop > 0 && activeVisible

          return revealComplete ? "ready" : JSON.stringify(metrics)
        }),
      { timeout: 5_000 }
    )
    .toBe("ready")
})

  test("모바일 상세는 V4 square 액션 rail만 노출하고 접이식 목차를 만들지 않는다", async ({ page }) => {
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
  const mobileTocContent = Array.from({ length: 12 }, (_, index) => {
    const sectionNumber = String(index + 1).padStart(2, "0")
    return [`## 모바일 목차 섹션 ${sectionNumber}`, "모바일 V4 상세 레이아웃 회귀를 검증하는 본문입니다."].join("\n\n")
  }).join("\n\n")

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
        content: mobileTocContent,
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
  const metaViewStat = page.locator(".stats .statChip").filter({ hasText: "6 VIEWS" })
  await expect(page.getByRole("button", { name: /공유/ })).toHaveCount(1)
  await expect(page.getByRole("button", { name: /^좋아요/ })).toHaveCount(1)
  await expect(engagementRow).toBeHidden()
  await expect(metaViewStat).toHaveText("6 VIEWS")
  await expect(metaViewStat).toBeHidden()
  await expect(compactActionBar.getByRole("button", { name: /^좋아요/ })).toBeVisible()
  await expect(compactActionBar.getByRole("button", { name: /^공유/ })).toBeVisible()
  await expect(compactActionBar.getByRole("button", { name: /^댓글/ })).toBeVisible()
  await expect(page.locator('[aria-label="접이식 목차"]')).toHaveCount(0)
  await expect(page.getByRole("button", { name: "모바일 목차 섹션 01" })).toHaveCount(0)
  const actionMetrics = await compactActionBar.evaluate((bar) => {
    const firstButton = bar.querySelector("button")
    const buttonBox = firstButton?.getBoundingClientRect()
    const barStyle = window.getComputedStyle(bar)
    return {
      position: barStyle.position,
      display: barStyle.display,
      width: Math.round(buttonBox?.width ?? 0),
      height: Math.round(buttonBox?.height ?? 0),
    }
  })
  expect(actionMetrics).toEqual({
    position: "static",
    display: "flex",
    width: 42,
    height: 42,
  })
  const compactShareButton = compactActionBar.getByRole("button", { name: /^공유/ })
  await compactShareButton.click()
  await expect(compactShareButton).toBeVisible()
})
})
