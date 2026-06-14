import { expect, test } from "@playwright/test"
import { readFileSync } from "fs"
import path from "path"
import { resolveStaticAdminProfileSeed } from "../src/libs/server/postDetailPage"
import {
  addPublicAboutSnapshotCookie,
  mockAvatarAsset,
  mockFeedEndpoints,
} from "./helpers/smokeFixtures"

test.beforeEach(async ({ page }) => {
  await mockAvatarAsset(page)
})

test.describe("core smoke public shell", () => {
  test("public blog appearance는 전역 theme와 legacy 디자인으로 고정된다", async () => {
  const resolverSource = readFileSync(path.resolve(__dirname, "../src/libs/blogAppearance.ts"), "utf8")
  const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")
  const headerSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/index.tsx"), "utf8")
  const logoSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/Logo.tsx"), "utf8")
  const adminShellSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")
  const adminPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/adminPage.ts"), "utf8")
  const appSource = readFileSync(path.resolve(__dirname, "../src/pages/_app.tsx"), "utf8")
  const homePageSource = readFileSync(path.resolve(__dirname, "../src/pages/index.tsx"), "utf8")
  const aboutPageSource = readFileSync(path.resolve(__dirname, "../src/pages/about.tsx"), "utf8")
  const postDetailPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/postDetailPage.ts"), "utf8")
  const useAdminProfileSource = readFileSync(path.resolve(__dirname, "../src/hooks/useAdminProfile.ts"), "utf8")

  expect(resolverSource).toContain('const normalizeBlogDesign = (_value: unknown): BlogDesignType => "legacy"')
  expect(resolverSource).not.toContain('blogDesign === "grid"')
  expect(resolverSource).not.toContain("src/libs/profileWorkspace")
  expect(rootLayoutSource).not.toContain("resolvePublicBlogAppearance")
  expect(rootLayoutSource).toContain("usePublicAdminProfile(initialAdminProfile")
  expect(headerSource).toContain("showThemeToggle")
  expect(headerSource).not.toContain('blogDesign === "grid"')
  expect(logoSource).not.toContain("useAdminProfile")
  expect(logoSource).not.toContain('blogDesign === "grid"')
  expect(logoSource).toContain("blogTitle")
  expect(adminShellSource).not.toContain("useAdminProfile")
  expect(adminPageSource).toContain("initialProfileSnapshot?: AdminProfile | null")
  expect(adminPageSource).toContain("fetchServerAdminProfile(req")
  expect(adminPageSource).toContain("resolvePublicAdminProfileSnapshot(req)")
  expect(appSource).toContain("initialAdminProfile={initialAdminProfile}")
  expect(appSource).toContain("initialProfileSnapshot?: AdminProfile | null")
  expect(appSource).toContain(
    "appPageProps.initialAdminProfile ?? appPageProps.initialProfileSnapshot ?? null"
  )
  expect(homePageSource).toContain("resolveStaticAdminProfileSeed")
  expect(homePageSource).toContain("initialAdminProfileSource")
  expect(aboutPageSource).toContain("initialAdminProfileSource")
  expect(postDetailPageSource).toContain("queryKey.adminProfile()")
  expect(postDetailPageSource).toContain("initialAdminProfile")
  expect(postDetailPageSource).toContain('initialAdminProfileSource === "static-fallback"')
  expect(appSource).toContain("initialAdminProfileShouldRefetch")
  expect(rootLayoutSource).toContain('pathname[1] !== "_"')
  expect(rootLayoutSource).toContain('const effectiveBlogDesign = "legacy"')
  expect(rootLayoutSource).toContain('showThemeToggle={effectiveBlogDesign === "legacy"}')
  expect(rootLayoutSource).not.toContain('showThemeToggle={effectiveBlogDesign === "legacy" && !isPublicBlogRoute}')
  expect(rootLayoutSource).toContain("refetchOnMount: isDesignAwareRoute")
  expect(rootLayoutSource).toContain("staleTimeMs: isDesignAwareRoute ? 0 : undefined")
  expect(rootLayoutSource).toContain('pathname[1] !== "_"')
  expect(rootLayoutSource).toContain('pathname !== "/sitemap.xml"')
  expect(appSource).toContain("initialProfileSnapshot?: AdminProfile | null")
  expect(readFileSync(path.resolve(__dirname, "../src/libs/server/guestPage.ts"), "utf8")).toContain(
    "initialProfileSnapshot"
  )
  expect(useAdminProfileSource).toContain("enabled?: boolean")
  expect(useAdminProfileSource).toContain("refetchOnMount?: boolean")
  expect(useAdminProfileSource).toContain("staleTimeMs?: number")
})

  test("post detail adminProfile seed는 published와 fallback source를 구분한다", async () => {
  const publishedProfile = {
    username: "aquila",
    name: "aquila",
    nickname: "aquila",
    profileImageUrl: "/avatar.png",
    blogDesign: "grid" as never,
    legacyBlogScheme: "light" as const,
  }

  await expect(resolveStaticAdminProfileSeed(async () => publishedProfile)).resolves.toMatchObject({
    profile: { blogDesign: "legacy", legacyBlogScheme: "light" },
    source: "published",
  })
  await expect(
    resolveStaticAdminProfileSeed(async () => {
      throw new Error("admin profile unavailable")
    })
  ).resolves.toMatchObject({
    profile: { blogDesign: "legacy", legacyBlogScheme: "dark" },
    source: "static-fallback",
  })
})

  test("about 자기소개 문구는 작성 개행을 유지하는 white-space 계약을 가진다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })

  await addPublicAboutSnapshotCookie(page)
  await page.goto("/about")
  await expect(page.locator('[data-ui="about-eyebrow"]')).toHaveText("Profile")

  const profileBioStyle = await page.locator(".profile-bio").evaluate((element) => {
    const styles = window.getComputedStyle(element as HTMLElement)
    return {
      whiteSpace: styles.whiteSpace,
      lineHeight: styles.lineHeight,
      text: element.textContent || "",
    }
  })

  expect(profileBioStyle.whiteSpace).toBe("pre-line")
  expect(profileBioStyle.lineHeight).not.toBe("normal")
  expect(profileBioStyle.text.length).toBeGreaterThan(0)
})

  test("about 공개 프로필은 intro/cta/project/timeline 구조로 재구성된다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })

  await addPublicAboutSnapshotCookie(page)
  await page.goto("/about")

  await expect(page.getByRole("heading", { level: 1, name: "About Me" })).toHaveCount(0)
  await expect(page.locator('[data-ui="about-eyebrow"]')).toHaveText("Profile")
  await expect(page.locator('[data-ui="about-hero"]')).toBeVisible()
  await expect(page.locator('[data-ui="about-cta-group"]').getByRole("link")).toHaveCount(2)
  await expect(page.locator('[data-ui="about-cta-group"]')).not.toContainText("대표 글 보기")
  await expect(page.locator('[data-ui="about-projects"]')).toBeVisible()
  await expect(page.locator('[data-ui="about-project-list"] li').first()).toBeVisible()
  await expect(page.locator('[data-ui="about-project-list"] li').first().locator('[data-ui="about-project-summary"]')).toBeVisible()
  await expect(page.locator('[data-ui="about-project-list"] li').first().locator('[data-ui="about-project-role"]')).toBeVisible()
  await expect(page.locator('[data-ui="about-timeline"] li').first()).toBeVisible()

  const aboutLayoutTone = await page.evaluate(() => {
    const parsePixel = (value: string) => Number.parseFloat(value.replace("px", ""))
    const ctaGroup = document.querySelector('[data-ui="about-cta-group"]') as HTMLElement | null
    const ctaLink = ctaGroup?.querySelector("a") as HTMLElement | null
    const projectRow = document.querySelector('[data-ui="about-project-list"] li') as HTMLElement | null
    const projectMeta = projectRow?.querySelector(".project-meta") as HTMLElement | null
    const eyebrow = document.querySelector('[data-ui="about-eyebrow"]') as HTMLElement | null
    const ctaGroupStyle = ctaGroup ? window.getComputedStyle(ctaGroup) : null
    const ctaLinkStyle = ctaLink ? window.getComputedStyle(ctaLink) : null
    const projectRowStyle = projectRow ? window.getComputedStyle(projectRow) : null
    const projectMetaStyle = projectMeta ? window.getComputedStyle(projectMeta) : null
    const eyebrowStyle = eyebrow ? window.getComputedStyle(eyebrow) : null

    return {
      eyebrowFontSize: eyebrowStyle ? parsePixel(eyebrowStyle.fontSize) : null,
      ctaDisplay: ctaGroupStyle?.display ?? null,
      ctaLinkBorderRadius: ctaLinkStyle ? parsePixel(ctaLinkStyle.borderTopLeftRadius) : null,
      projectRowBorderRadius: projectRowStyle ? parsePixel(projectRowStyle.borderTopLeftRadius) : null,
      projectRowPaddingLeft: projectRowStyle ? parsePixel(projectRowStyle.paddingLeft) : null,
      projectMetaJustifyItems: projectMetaStyle?.justifyItems ?? null,
    }
  })

  expect(aboutLayoutTone.eyebrowFontSize).toBeGreaterThanOrEqual(16)
  expect(aboutLayoutTone.ctaDisplay).toBe("flex")
  expect(aboutLayoutTone.ctaLinkBorderRadius).toBeGreaterThanOrEqual(999)
  expect(aboutLayoutTone.projectRowBorderRadius).toBeGreaterThanOrEqual(14)
  expect(aboutLayoutTone.projectRowPaddingLeft).toBeGreaterThanOrEqual(16)
  expect(aboutLayoutTone.projectMetaJustifyItems).toBe("start")

  const timelineAlignment = await page.evaluate(() => {
    const row = document.querySelector('[data-ui="about-timeline"] li')
    const date = row?.querySelector(".timeline-date") as HTMLElement | null
    const label = row?.querySelector("strong") as HTMLElement | null
    const rowStyle = row ? getComputedStyle(row) : null
    const dateStyle = date ? getComputedStyle(date) : null
    const labelStyle = label ? getComputedStyle(label) : null

    return {
      alignItems: rowStyle?.alignItems ?? null,
      dateLineHeight: dateStyle?.lineHeight ?? null,
      labelLineHeight: labelStyle?.lineHeight ?? null,
    }
  })

  expect(timelineAlignment.alignItems).toBe("baseline")
  expect(timelineAlignment.dateLineHeight).toBe(timelineAlignment.labelLineHeight)

  const linkStyles = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector) as HTMLElement | null
      if (!element) return null
      const styles = window.getComputedStyle(element)
      return {
        backgroundColor: styles.backgroundColor,
        borderTopWidth: styles.borderTopWidth,
        borderBottomWidth: styles.borderBottomWidth,
      }
    }

    return {
      contact: read('[data-ui="about-contact-links"]'),
      service: read('[data-ui="about-service-links"]'),
    }
  })

  expect(linkStyles.contact?.backgroundColor).toBe("rgba(0, 0, 0, 0)")
  expect(linkStyles.contact?.borderTopWidth).toBe("0px")
  expect(linkStyles.contact?.borderBottomWidth).toBe("1px")
  expect(linkStyles.service?.backgroundColor).toBe("rgba(0, 0, 0, 0)")
  expect(linkStyles.service?.borderTopWidth).toBe("0px")
  expect(linkStyles.service?.borderBottomWidth).toBe("1px")
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

  test("상세 페이지는 클라이언트 복구 요청으로 렌더되고 조회수 hit는 1회 반영된다", async ({ page }) => {
  let hitCountRequest = 0
  const runtimeErrors: string[] = []
  const isHydrationRuntimeSignal = (value: string) =>
    /minified react error|hydration|did not match/i.test(value)

  page.on("pageerror", (error) => {
    runtimeErrors.push(error.message)
  })

  page.on("console", (message) => {
    if (message.type() === "error" && isHydrationRuntimeSignal(message.text())) {
      runtimeErrors.push(message.text())
    }
  })

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
  await page.waitForTimeout(300)
  expect(runtimeErrors).toEqual([])
})
})
