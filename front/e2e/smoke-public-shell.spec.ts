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
  test("system dark 공개 페이지는 hydration 첫 렌더와 bootstrap 동기화 경계를 분리한다", async () => {
    const useSchemeSource = readFileSync(path.resolve(__dirname, "../src/hooks/useScheme.ts"), "utf8")

    expect(useSchemeSource).toContain('CONFIG.blog.scheme === "system" ? "light" : CONFIG.blog.scheme')
    expect(useSchemeSource).toContain("const resolveBootstrapScheme = (): SchemeType | null =>")
    expect(useSchemeSource).toContain("initialData: fallbackScheme")
    expect(useSchemeSource).toContain("resolveBootstrapScheme() ??")
    expect(useSchemeSource).not.toContain("getCookie")
    expect(useSchemeSource).toContain("if (bootstrapScheme !== data)")
    expect(useSchemeSource).toContain("queryClient.setQueryData(queryKey.scheme(), bootstrapScheme)")
    expect(useSchemeSource).not.toContain("setScheme(bootstrapScheme)")
    expect(useSchemeSource).not.toMatch(/setScheme\(nextScheme\)\s*clearSchemeBootstrapAfterHydration\(\)/)
  })

  test("OS 다크 첫 로드는 hydration 전 surface dark guard를 먼저 삽입한다", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" })
    await mockFeedEndpoints(page)
    await page.route("**/member/api/v1/auth/me", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
      })
    })

    await page.addInitScript(() => {
      type BootstrapCaptureWindow = Window & { __aquilaBootstrapStyles?: string[] }

      const captureWindow = window as BootstrapCaptureWindow
      const originalAppendChild = Node.prototype.appendChild
      captureWindow.__aquilaBootstrapStyles = []
      Node.prototype.appendChild = function appendChildWithBootstrapCapture<T extends Node>(
        child: T
      ): T {
        if (
          child instanceof HTMLStyleElement &&
          child.getAttribute("data-aquila-scheme-bootstrap-style") === "true"
        ) {
          captureWindow.__aquilaBootstrapStyles?.push(child.textContent || "")
        }

        return originalAppendChild.call(this, child) as T
      }
    })

    await page.goto("/", { waitUntil: "domcontentloaded" })

    type FirstLoadSchemeCapture = {
      bodyBackground: string
      datasetScheme?: string
      styles: string[]
    }
    const readFirstLoadScheme = async (): Promise<FirstLoadSchemeCapture | null> => {
      try {
        return await page.evaluate(() => {
          type BootstrapCaptureWindow = Window & { __aquilaBootstrapStyles?: string[] }

          const captureWindow = window as BootstrapCaptureWindow
          return {
            bodyBackground: window.getComputedStyle(document.body).backgroundColor,
            datasetScheme: document.documentElement.dataset.aquilaScheme,
            styles: captureWindow.__aquilaBootstrapStyles ?? [],
          }
        })
      } catch {
        return null
      }
    }

    let firstLoadScheme: FirstLoadSchemeCapture | null = null
    for (let attempt = 0; attempt < 50; attempt += 1) {
      firstLoadScheme = await readFirstLoadScheme()
      if (firstLoadScheme?.styles[0]) break
      await page.waitForTimeout(100)
    }

    const bootstrapStyle = firstLoadScheme?.styles[0]
    if (!firstLoadScheme || !bootstrapStyle) {
      throw new Error("OS 다크 첫 로드 bootstrap style을 캡처하지 못했습니다.")
    }

    expect(firstLoadScheme.datasetScheme).toBe("dark")
    expect(["rgb(18, 18, 18)", "rgb(13, 17, 23)"]).toContain(firstLoadScheme.bodyBackground)
    expect(bootstrapStyle).toContain('html[data-aquila-scheme-bootstrap="dark"]')
    expect(bootstrapStyle).toContain("background-color:transparent!important")
    expect(bootstrapStyle).not.toContain("#f3f5f8")
  })

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
  expect(rootLayoutSource).toContain(
    'const effectiveBlogDesign = isAdminRoute ? adminProfile?.blogDesign || "legacy" : "legacy"'
  )
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
  await expect(page.locator('[data-ui="about-hero"] h1')).toHaveText("이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.")

  const profileBioStyle = await page.locator(".profile-copy p").evaluate((element) => {
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

  test("about 공개 프로필은 V4 stack 구조와 원형 avatar를 유지한다", async ({ page }) => {
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
  await expect(page.locator('[data-ui="about-hero"] h1')).toHaveText("이유를 먼저 따지고, 운영 가능한 시스템을 설계합니다.")
  await expect(page.locator('[data-ui="about-hero"]')).toBeVisible()
  await expect(page.locator(".profile-copy")).toContainText("안녕하세요, 백엔드 개발자 아퀼라입니다.")
  await expect(page.locator('[data-ui="about-projects"]')).toBeVisible()
  await expect(page.locator('[data-ui="about-project-list"] .stack-row').first()).toBeVisible()
  await expect(page.locator('[data-ui="about-timeline"] .stack-row').first()).toBeVisible()

  const aboutLayoutTone = await page.evaluate(() => {
    const parsePixel = (value: string) => Number.parseFloat(value.replace("px", ""))
    const avatar = document.querySelector('[data-ui="about-avatar"]') as HTMLElement | null
    const projectRow = document.querySelector('[data-ui="about-project-list"] .stack-row') as HTMLElement | null
    const stackList = document.querySelector('[data-ui="about-project-list"]') as HTMLElement | null
    const label = projectRow?.querySelector("strong") as HTMLElement | null
    const heroLabel = document.querySelector(".mono-label") as HTMLElement | null
    const avatarStyle = avatar ? window.getComputedStyle(avatar) : null
    const projectRowStyle = projectRow ? window.getComputedStyle(projectRow) : null
    const stackListStyle = stackList ? window.getComputedStyle(stackList) : null
    const labelStyle = label ? window.getComputedStyle(label) : null
    const heroLabelStyle = heroLabel ? window.getComputedStyle(heroLabel) : null

    return {
      heroLabelFontSize: heroLabelStyle ? parsePixel(heroLabelStyle.fontSize) : null,
      avatarBorderRadius: avatarStyle?.borderRadius ?? null,
      stackListBorderTopWidth: stackListStyle?.borderTopWidth ?? null,
      projectRowDisplay: projectRowStyle?.display ?? null,
      projectRowGridTemplateColumns: projectRowStyle?.gridTemplateColumns ?? null,
      projectRowBorderBottomWidth: projectRowStyle?.borderBottomWidth ?? null,
      projectRowPaddingLeft: projectRowStyle ? parsePixel(projectRowStyle.paddingLeft) : null,
      labelTextTransform: labelStyle?.textTransform ?? null,
    }
  })

  expect(aboutLayoutTone.heroLabelFontSize).toBeLessThanOrEqual(12)
  expect(aboutLayoutTone.avatarBorderRadius).toBe("50%")
  expect(aboutLayoutTone.stackListBorderTopWidth).toBe("1px")
  expect(aboutLayoutTone.projectRowDisplay).toBe("grid")
  expect(aboutLayoutTone.projectRowGridTemplateColumns).toContain("140px")
  expect(aboutLayoutTone.projectRowBorderBottomWidth).toBe("1px")
  expect(aboutLayoutTone.projectRowPaddingLeft).toBe(0)
  expect(aboutLayoutTone.labelTextTransform).toBe("uppercase")

  const timelineAlignment = await page.evaluate(() => {
    const row = document.querySelector('[data-ui="about-timeline"] .stack-row')
    const date = row?.querySelector("strong") as HTMLElement | null
    const label = row?.querySelector("span") as HTMLElement | null
    const rowStyle = row ? getComputedStyle(row) : null
    const dateStyle = date ? getComputedStyle(date) : null
    const labelStyle = label ? getComputedStyle(label) : null

    return {
      display: rowStyle?.display ?? null,
      dateLineHeight: dateStyle?.lineHeight ?? null,
      labelLineHeight: labelStyle?.lineHeight ?? null,
    }
  })

  expect(timelineAlignment.display).toBe("grid")
  expect(timelineAlignment.dateLineHeight).not.toBe("normal")
  expect(timelineAlignment.labelLineHeight).not.toBe("normal")

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
      links: read(".about-grid section:nth-of-type(2) .stack-list"),
    }
  })

  expect(linkStyles.links?.backgroundColor).toBe("rgba(0, 0, 0, 0)")
  expect(linkStyles.links?.borderTopWidth).toBe("1px")
  expect(linkStyles.links?.borderBottomWidth).toBe("0px")
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
