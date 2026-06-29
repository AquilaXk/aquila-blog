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
    const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")

    expect(useSchemeSource).toContain('CONFIG.blog.scheme === "system" ? "light" : CONFIG.blog.scheme')
    expect(useSchemeSource).toContain("const resolveBootstrapScheme = (): BootstrapScheme | null =>")
    expect(useSchemeSource).toContain('const userScheme = root.getAttribute("data-aquila-scheme-user")')
    expect(useSchemeSource).toContain('const bootstrapScheme = root.getAttribute("data-aquila-scheme-bootstrap")')
    expect(useSchemeSource).toContain("if (!source || !isScheme(bootstrapScheme)) return null")
    expect(useSchemeSource).toContain('if (source === "public" && isScheme(userScheme))')
    expect(useSchemeSource).toContain("return { scheme: userScheme, renderedScheme }")
    expect(useSchemeSource).toContain("return { scheme: bootstrapScheme, renderedScheme }")
    expect(useSchemeSource).toContain('const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect')
    expect(useSchemeSource).toContain("const resolvedInitialSchemeRef = useRef(false)")
    expect(useSchemeSource).toContain("let runtimeSchemeSeed: SchemeType | null = null")
    expect(useSchemeSource).toContain("runtimeSchemeSeed = scheme")
    expect(useSchemeSource).toContain("useIsomorphicLayoutEffect(() =>")
    expect(useSchemeSource).toContain("initialData: fallbackScheme")
    expect(useSchemeSource).toContain("const shouldResolveInitialScheme = !resolvedInitialSchemeRef.current")
    expect(useSchemeSource).toContain("const bootstrap = shouldResolveInitialScheme ? resolveBootstrapScheme() : null")
    expect(useSchemeSource).toContain(
      "runtimeSchemeSeed ?? (followsSystemTheme ? resolveSystemScheme() : fallbackScheme)"
    )
    expect(useSchemeSource).toContain("resolvedInitialSchemeRef.current = true")
    expect(useSchemeSource).not.toContain("getCookie")
    expect(useSchemeSource).toContain("if (bootstrapScheme !== data)")
    expect(useSchemeSource).toContain("queryClient.setQueryData(queryKey.scheme(), bootstrapScheme)")
    expect(useSchemeSource).toContain("clearSchemeBootstrapStyle(bootstrapScheme, renderedScheme)")
    expect(useSchemeSource).not.toContain("setScheme(bootstrapScheme)")
    expect(useSchemeSource).not.toMatch(/setScheme\(nextScheme\)\s*clearSchemeBootstrapAfterHydration\(\)/)
    expect(rootLayoutSource).toContain("const RootAdminProfileContext = React.createContext<AdminProfile | null>(null)")
    expect(rootLayoutSource).toContain("export const useRootAdminProfile = () => React.useContext(RootAdminProfileContext)")
    expect(rootLayoutSource).toContain("<RootAdminProfileContext.Provider value={adminProfile}>")
  })

  test("OS 다크 첫 로드는 bootstrap guard를 삽입하고 공개 V4 route는 light로 수렴한다", async ({ page }) => {
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

    expect(firstLoadScheme.datasetScheme).toBe("light")
    expect(firstLoadScheme.bodyBackground).toBe("rgb(247, 247, 245)")
    expect(bootstrapStyle).toContain("html[data-aquila-scheme-bootstrap]{background:#f7f7f5;color-scheme:light;}")
    expect(bootstrapStyle).toContain("html[data-aquila-scheme-bootstrap] body{background:#f7f7f5;color:#101214;color-scheme:light;}")
    expect(bootstrapStyle).not.toContain('html[data-aquila-scheme-bootstrap="dark"] *{color-scheme:dark!important;}')
    expect(bootstrapStyle).not.toContain("background-color:transparent!important")
    expect(bootstrapStyle).not.toContain("#121212")
  })

  test("public blog appearance는 V4 전역 theme와 sticky header 계약을 유지한다", async () => {
  const resolverSource = readFileSync(path.resolve(__dirname, "../src/libs/blogAppearance.ts"), "utf8")
  const rootLayoutSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/index.tsx"), "utf8")
  const headerSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/index.tsx"), "utf8")
  const navBarSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/NavBar.tsx"), "utf8")
  const logoSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/Logo.tsx"), "utf8")
  const themeToggleSource = readFileSync(path.resolve(__dirname, "../src/layouts/RootLayout/Header/ThemeToggle.tsx"), "utf8")
  const notificationBellStyleSource = readFileSync(
    path.resolve(__dirname, "../src/layouts/RootLayout/Header/NotificationBell.styles.ts"),
    "utf8"
  )
  const notificationBellStateSource = readFileSync(
    path.resolve(__dirname, "../src/layouts/RootLayout/Header/useNotificationBellState.ts"),
    "utf8"
  )
  const adminShellSource = readFileSync(path.resolve(__dirname, "../src/routes/Admin/AdminShell.tsx"), "utf8")
  const adminPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/adminPage.ts"), "utf8")
  const appSource = readFileSync(path.resolve(__dirname, "../src/pages/_app.tsx"), "utf8")
  const homePageSource = readFileSync(path.resolve(__dirname, "../src/pages/index.tsx"), "utf8")
  const aboutPageSource = readFileSync(path.resolve(__dirname, "../src/pages/about.tsx"), "utf8")
  const postDetailPageSource = readFileSync(path.resolve(__dirname, "../src/libs/server/postDetailPage.ts"), "utf8")
  const useAdminProfileSource = readFileSync(path.resolve(__dirname, "../src/hooks/useAdminProfile.ts"), "utf8")
  const themeSource = readFileSync(path.resolve(__dirname, "../src/styles/theme.ts"), "utf8")
  const globalSource = readFileSync(
    path.resolve(__dirname, "../src/layouts/RootLayout/ThemeProvider/Global/index.tsx"),
    "utf8"
  )

  expect(resolverSource).toContain('const normalizeBlogDesign = (_value: unknown): BlogDesignType => "legacy"')
  expect(resolverSource).not.toContain('blogDesign === "grid"')
  expect(resolverSource).not.toContain("src/libs/profileWorkspace")
  expect(rootLayoutSource).not.toContain("resolvePublicBlogAppearance")
  expect(rootLayoutSource).toContain("usePublicAdminProfile(initialAdminProfile")
  expect(headerSource).toContain("showThemeToggle")
  expect(headerSource).toContain('data-ui="app-header"')
  expect(headerSource).toContain("z-index: 50;")
  expect(headerSource).toContain("width: min(calc(100% - 40px), 1240px);")
  expect(headerSource).toContain("min-height: 64px;")
  expect(headerSource).toContain("gap: 32px;")
  expect(headerSource).toContain("@media (max-width: 820px)")
  expect(headerSource).toContain("width: min(calc(100% - 24px), 1240px);")
  expect(headerSource).toContain("min-height: 58px;")
  expect(headerSource).toContain("gap: 10px;")
  expect(themeSource).toContain('pageBackgroundImage: "none"')
  expect(themeSource).toContain('border: scheme === "light" ? "#dfe1e5" : schemeColors.gray6')
  expect(themeSource).toContain('borderStrong: scheme === "light" ? "#c8ccd2" : schemeColors.gray7')
  expect(themeSource).toContain('accent: scheme === "light" ? "#155eef" : "#78a7ff"')
  expect(themeSource).toContain('accentHover: scheme === "light" ? "#0d4ed8" : "#9bbdff"')
  expect(themeSource).toContain('accentMuted: scheme === "light" ? "#edf4ff" : "#17243d"')
  expect(globalSource).toContain(
    "--aq-header-bg: color-mix(in srgb, ${lightDesign.pageBackgroundColor} 92%, transparent);"
  )
  expect(headerSource).not.toContain("data-autohide")
  expect(headerSource).not.toContain("data-hidden")
  expect(headerSource).not.toContain("transform: translateY(0);")
  expect(headerSource).not.toContain("will-change: transform")
  expect(headerSource).not.toContain("backface-visibility")
  expect(headerSource).not.toContain("translateY(calc(-100%")
  expect(navBarSource).toContain("min-height: 34px;")
  expect(navBarSource).toContain("padding: 0 11px;")
  expect(navBarSource).toContain("gap: 7px;")
  expect(navBarSource).toContain("height: 36px;")
  expect(navBarSource).toContain("min-height: 36px;")
  expect(navBarSource).toContain("border-radius: 6px;")
  expect(navBarSource).toContain("const [activeHash, setActiveHash] = useState<string | null>(null)")
  expect(navBarSource).toContain("window.addEventListener(\"hashchange\", syncHash)")
  expect(navBarSource).toContain("return () => window.removeEventListener(\"hashchange\", syncHash)")
  expect(navBarSource).toContain('id === "notes" && router.pathname === "/" && activeHash !== "topics"')
  expect(navBarSource).toContain('id === "topics" && router.pathname === "/" && activeHash === "topics"')
  expect(navBarSource).not.toContain("theme.variables.navControl.height")
  expect(navBarSource).toContain("@media (max-width: 820px)")
  expect(navBarSource).not.toContain("@media (max-width: 860px)")
  expect(navBarSource).not.toContain("@media (max-width: 720px)")
  expect(navBarSource).toContain("const [mobileMenuOpen, setMobileMenuOpen] = useState(false)")
  expect(navBarSource).toContain('className="mobileMenuButton"')
  expect(navBarSource).toContain('className="mobileMenuPanel"')
  expect(navBarSource).toContain(".primaryLinks,")
  expect(navBarSource).toContain(".searchTrigger,\n    .loginLink,")
  expect(navBarSource).not.toContain(".bellSlot,\n    .loginLink,")
  expect(navBarSource).toContain(".logoutBtn {\n      display: none;")
  expect(navBarSource).toContain(".mobileMenuButton {\n      display: grid;")
  expect(navBarSource).toContain(".mobileMenuPanel {\n      display: grid;")
  expect(notificationBellStyleSource).toContain("@media (max-width: 820px)")
  expect(notificationBellStyleSource).toContain("width: 36px;")
  expect(notificationBellStyleSource).toContain("height: 36px;")
  expect(notificationBellStyleSource).toContain("border-radius: 6px;")
  expect(notificationBellStyleSource).not.toContain("@media (max-width: 720px)")
  expect(notificationBellStyleSource).not.toContain("transform: translateY(-1px);")
  expect(notificationBellStyleSource).not.toContain("theme.variables.navControl.height")
  expect(notificationBellStateSource).toContain('window.matchMedia("(max-width: 820px)")')
  expect(notificationBellStateSource).not.toContain('window.matchMedia("(max-width: 720px)")')
  expect(headerSource).not.toContain('blogDesign === "grid"')
  expect(logoSource).not.toContain("useAdminProfile")
  expect(logoSource).not.toContain('blogDesign === "grid"')
  expect(logoSource).not.toContain("@media (max-width: 720px)")
  expect(logoSource).toContain("blogTitle")
  expect(themeToggleSource).toContain("width: 36px;")
  expect(themeToggleSource).toContain("height: 36px;")
  expect(themeToggleSource).toContain("border-radius: 6px;")
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
  expect(homePageSource).toContain('initialAdminProfileSource === "static-fallback"')
  expect(aboutPageSource).toContain("initialAdminProfileSource")
  expect(aboutPageSource).toContain("resolvePublicAdminProfileCacheControl")
  expect(postDetailPageSource).toContain("queryKey.adminProfile()")
  expect(postDetailPageSource).toContain("initialAdminProfile")
  expect(postDetailPageSource).toContain('initialAdminProfileSource === "static-fallback"')
  expect(appSource).toContain("shouldRefetchAdminProfileSource")
  expect(appSource).toContain("initialAdminProfileShouldRefetch")
  expect(rootLayoutSource).toContain('pathname[1] !== "_"')
  expect(rootLayoutSource).toContain(
    'const effectiveBlogDesign = isAdminRoute ? adminProfile?.blogDesign || "legacy" : "legacy"'
  )
  expect(rootLayoutSource).not.toContain("@media (max-width: 768px)")
  expect(rootLayoutSource).toContain('const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect')
  expect(rootLayoutSource).toContain("useIsomorphicLayoutEffect(() =>")
  expect(rootLayoutSource).toContain('showThemeToggle={effectiveBlogDesign === "legacy"}')
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

  test("about fallback profile 응답은 public cache로 저장하지 않는다", async ({ page }) => {
  await page.route("**/member/api/v1/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "401-1", msg: "unauthorized" }),
    })
  })
  await page.route("**/member/api/v1/members/adminProfile", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ resultCode: "503-1", msg: "profile unavailable" }),
    })
  })

  const staticFallbackResponse = await page.goto("/about")
  expect(staticFallbackResponse?.headers()["cache-control"]).toBe("private, no-store")
  expect(staticFallbackResponse?.headers()["server-timing"]).toContain('desc="static-fallback"')

  await addPublicAboutSnapshotCookie(page)
  const cookieSnapshotResponse = await page.goto("/about")
  expect(cookieSnapshotResponse?.headers()["cache-control"]).toBe("private, no-store")
  expect(cookieSnapshotResponse?.headers()["server-timing"]).toContain('desc="cookie-snapshot"')
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

  expect(uniqueHeights.length).toBeGreaterThanOrEqual(1)
  expect(uniqueHeights.length).toBeLessThanOrEqual(2)
  for (const height of uniqueHeights) {
    expect(height).toBeGreaterThanOrEqual(34)
    expect(height).toBeLessThanOrEqual(40)
  }
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
  const viewStatChip = page.locator(".stats .statChip").filter({ hasText: "8 VIEWS" })
  await expect(viewStatChip).toBeVisible()
  await page.waitForTimeout(300)
  expect(runtimeErrors).toEqual([])
})
})
