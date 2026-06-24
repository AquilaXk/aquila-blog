import { expect, test } from "@playwright/test"
import type { Page } from "@playwright/test"
import { addPublicAboutSnapshotCookie, mockAvatarAsset, mockFeedEndpoints } from "./helpers/smokeFixtures"

type SchemeCookie = "dark" | "light" | null

const prepareHomeThemePage = async (page: Page, schemeCookie: SchemeCookie = "dark") => {
  await mockAvatarAsset(page)
  await mockFeedEndpoints(page)
  await addPublicAboutSnapshotCookie(page)
  if (!schemeCookie) return
  await page.context().addCookies([
    {
      name: "scheme",
      value: schemeCookie,
      url: "http://127.0.0.1:3000",
    },
  ])
}

const readControlScheme = async (page: Page) =>
  page.evaluate(() => {
    const input = document.createElement("input")
    document.body.append(input)
    const result = {
      body: window.getComputedStyle(document.body).colorScheme,
      html: window.getComputedStyle(document.documentElement).colorScheme,
      input: window.getComputedStyle(input).colorScheme,
    }
    input.remove()
    return result
  })

const readLightFeedSurface = async (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector('[data-ui="feed-post-card"] article')
    const category = card?.querySelector(".category")
    const tag = card?.querySelector(".tag")
    const title = card?.querySelector("h2")
    const meta = card?.querySelector(".meta")
    const cardStyle = card ? window.getComputedStyle(card) : null
    const categoryStyle = category ? window.getComputedStyle(category) : null
    const tagStyle = tag ? window.getComputedStyle(tag) : null
    const titleStyle = title ? window.getComputedStyle(title) : null
    const metaStyle = meta ? window.getComputedStyle(meta) : null

    return {
      cardBackgroundColor: cardStyle?.backgroundColor ?? null,
      categoryColor: categoryStyle?.color ?? tagStyle?.color ?? null,
      titleColor: titleStyle?.color ?? null,
      metaColor: metaStyle?.color ?? null,
    }
  })

const expectLightFeedSurface = async (page: Page) => {
  await expect(page.locator('[data-ui="feed-post-card"] article').first()).toBeVisible()
  await expect(page.locator('[data-ui="feed-post-card"] .meta').first()).toBeVisible()
  await expect.poll(() => readLightFeedSurface(page)).toEqual({
    cardBackgroundColor: "rgb(243, 245, 248)",
    categoryColor: "rgb(86, 98, 115)",
    titleColor: "rgb(15, 23, 36)",
    metaColor: "rgb(86, 98, 115)",
  })
}

const installSchemeFrameSampler = async (page: Page) => {
  await page.addInitScript(() => {
    type SchemeFrameSample = {
      bootstrapStyleCount: number
      bodyBackground: string
      datasetScheme?: string
      feedBeforeBackground: string | null
      firstCardBackground: string | null
      firstCardBorder: string | null
      headerBackground: string | null
      headerBorder: string | null
      metaColor: string | null
      moonDisplay: string | null
      sunDisplay: string | null
      tagColor: string | null
      time: number
      titleColor: string | null
    }

    type SchemeFrameWindow = Window & {
      __aquilaSchemeFrameSamples?: SchemeFrameSample[]
    }

    const sampleWindow = window as SchemeFrameWindow
    sampleWindow.__aquilaSchemeFrameSamples = []
    const startedAt = performance.now()

    const sampleSchemeFrame = () => {
      const datasetScheme = document.documentElement.dataset.aquilaScheme
      const colorTarget = document.body ?? document.documentElement
      const feed = document.querySelector('[data-ui="feed-home-product-shell"]')
      const header = document.querySelector('[data-ui="app-header"]')
      const card = document.querySelector('[data-ui="feed-post-card"] article')
      const tag = card?.querySelector(".tag")
      const title = card?.querySelector("h2")
      const meta = card?.querySelector(".meta")
      const sunIcon = document.querySelector(".themeIconLight")
      const moonIcon = document.querySelector(".themeIconDark")
      const feedBeforeStyle = feed ? window.getComputedStyle(feed, "::before") : null
      const feedBeforeBackground = !feedBeforeStyle
        ? null
        : feedBeforeStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
          ? feedBeforeStyle.backgroundColor
          : feedBeforeStyle.backgroundImage && feedBeforeStyle.backgroundImage !== "none"
            ? feedBeforeStyle.backgroundImage
            : feedBeforeStyle.backgroundColor
      const headerStyle = header ? window.getComputedStyle(header) : null
      const cardStyle = card ? window.getComputedStyle(card) : null
      sampleWindow.__aquilaSchemeFrameSamples?.push({
        bootstrapStyleCount: document.querySelectorAll('style[data-aquila-scheme-bootstrap-style="true"]').length,
        bodyBackground: window.getComputedStyle(colorTarget).backgroundColor,
        datasetScheme,
        feedBeforeBackground,
        firstCardBackground: cardStyle?.backgroundColor ?? null,
        firstCardBorder: cardStyle?.borderBottomColor ?? null,
        headerBackground: headerStyle?.backgroundColor ?? null,
        headerBorder: headerStyle?.borderBottomColor ?? null,
        metaColor: meta ? window.getComputedStyle(meta).color : null,
        moonDisplay: moonIcon ? window.getComputedStyle(moonIcon).display : null,
        sunDisplay: sunIcon ? window.getComputedStyle(sunIcon).display : null,
        tagColor: tag ? window.getComputedStyle(tag).color : null,
        time: Math.round(performance.now() - startedAt),
        titleColor: title ? window.getComputedStyle(title).color : null,
      })

      if (performance.now() - startedAt < 3000) {
        requestAnimationFrame(sampleSchemeFrame)
      }
    }

    requestAnimationFrame(sampleSchemeFrame)
  })
}

const readSchemeFrameSamples = async (page: Page) =>
  page.evaluate(() => {
    type SchemeFrameSample = {
      bootstrapStyleCount: number
      bodyBackground: string
      datasetScheme?: string
      feedBeforeBackground: string | null
      firstCardBackground: string | null
      firstCardBorder: string | null
      headerBackground: string | null
      headerBorder: string | null
      metaColor: string | null
      moonDisplay: string | null
      sunDisplay: string | null
      tagColor: string | null
      time: number
      titleColor: string | null
    }

    type SchemeFrameWindow = Window & {
      __aquilaSchemeFrameSamples?: SchemeFrameSample[]
    }

    return (window as SchemeFrameWindow).__aquilaSchemeFrameSamples ?? []
  })

const readRuntimeRecoveryReasonCount = async (page: Page) =>
  page.evaluate(() => {
    let count = 0
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index) ?? ""
      if (key.startsWith("__aquila_client_runtime_recovery__") && key.endsWith(":reason")) {
        count += 1
      }
    }
    return count
  })

const expectStableUniqueValue = <T,>(values: T[], expected: T) => {
  expect(values.length).toBeGreaterThan(0)
  expect(new Set(values)).toEqual(new Set([expected]))
}

const assertHomeThemeToggleUsesLightFeedSurface = async (page: Page) => {
  await page.goto("/")
  const themeToggle = page.getByRole("button", { name: "테마 전환" })
  await expect(themeToggle).toBeVisible()

  await expect(readControlScheme(page)).resolves.toEqual({
    body: "dark",
    html: "dark",
    input: "dark",
  })

  await themeToggle.click()
  await expect(themeToggle).toBeVisible()

  const nextScheme = await page.evaluate(() => {
    const input = document.createElement("input")
    document.body.append(input)
    const result = {
      bootstrapScheme: document.documentElement.getAttribute("data-aquila-scheme-bootstrap"),
      bootstrapStyleCount: document.querySelectorAll('style[data-aquila-scheme-bootstrap-style="true"]').length,
      datasetScheme: document.documentElement.dataset.aquilaScheme,
      body: window.getComputedStyle(document.body).colorScheme,
      html: window.getComputedStyle(document.documentElement).colorScheme,
      inlineHtmlColorScheme: document.documentElement.style.colorScheme,
      input: window.getComputedStyle(input).colorScheme,
    }
    input.remove()
    return result
  })

  expect(nextScheme).toEqual({
    bootstrapScheme: null,
    bootstrapStyleCount: 0,
    datasetScheme: "light",
    body: "light",
    html: "light",
    inlineHtmlColorScheme: "light",
    input: "light",
  })

  await expectLightFeedSurface(page)
}

test.describe("theme color-scheme", () => {
  const firstPaintCases = [
    { expectedScheme: "dark", label: "쿠키 없음 + OS dark", osScheme: "dark", schemeCookie: null },
    { expectedScheme: "light", label: "쿠키 없음 + OS light", osScheme: "light", schemeCookie: null },
    { expectedScheme: "dark", label: "dark cookie + OS light", osScheme: "light", schemeCookie: "dark" },
    { expectedScheme: "light", label: "light cookie + OS dark", osScheme: "dark", schemeCookie: "light" },
  ] as const

  for (const firstPaintCase of firstPaintCases) {
    test(`${firstPaintCase.label} 새로고침은 public surface scheme이 흔들리지 않는다`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: firstPaintCase.osScheme })
      await prepareHomeThemePage(page, firstPaintCase.schemeCookie)
      await installSchemeFrameSampler(page)
      const hydrationErrors: string[] = []
      page.on("console", (message) => {
        if (message.type() !== "error") return
        const text = message.text()
        if (
          text.includes("Hydration failed") ||
          text.includes("There was an error while hydrating") ||
          text.includes("did not match") ||
          text.includes("Minified React error #418") ||
          text.includes("Minified React error #423") ||
          text.includes("Minified React error `#418`") ||
          text.includes("Minified React error `#423`")
        ) {
          hydrationErrors.push(text)
        }
      })

      await page.goto("/")
      await expect(page.getByRole("button", { name: "테마 전환" })).toBeVisible()
      await expect(page.locator('[data-ui="feed-post-card"] article').first()).toBeVisible()

      const samples = await readSchemeFrameSamples(page)
      const readySamples = samples.filter((sample) => sample.firstCardBackground !== null)
      const expectedBodyBackground = firstPaintCase.expectedScheme === "dark" ? "rgb(18, 18, 18)" : "rgb(243, 245, 248)"
      const expectedText = firstPaintCase.expectedScheme === "dark" ? "rgb(245, 245, 245)" : "rgb(15, 23, 36)"
      const expectedMuted = firstPaintCase.expectedScheme === "dark" ? "rgb(178, 178, 178)" : "rgb(86, 98, 115)"
      const expectedBorder = firstPaintCase.expectedScheme === "dark" ? "rgb(54, 54, 54)" : "rgb(200, 210, 222)"
      const expectedHeaderBackground = firstPaintCase.expectedScheme === "dark" ? "rgb(18, 18, 18)" : "rgb(255, 255, 255)"
      const expectedSunDisplay = firstPaintCase.expectedScheme === "dark" ? "none" : "flex"
      const expectedMoonDisplay = firstPaintCase.expectedScheme === "dark" ? "flex" : "none"

      expect(samples.length).toBeGreaterThan(0)
      expectStableUniqueValue(samples.map((sample) => sample.datasetScheme), firstPaintCase.expectedScheme)
      expectStableUniqueValue(samples.map((sample) => sample.bodyBackground), expectedBodyBackground)
      expectStableUniqueValue(readySamples.map((sample) => sample.feedBeforeBackground), expectedBodyBackground)
      expectStableUniqueValue(readySamples.map((sample) => sample.firstCardBackground), expectedBodyBackground)
      expectStableUniqueValue(readySamples.map((sample) => sample.firstCardBorder), expectedBorder)
      expectStableUniqueValue(readySamples.map((sample) => sample.headerBackground), expectedHeaderBackground)
      expectStableUniqueValue(readySamples.map((sample) => sample.headerBorder), expectedBorder)
      expectStableUniqueValue(readySamples.map((sample) => sample.titleColor), expectedText)
      expectStableUniqueValue(readySamples.map((sample) => sample.tagColor), expectedMuted)
      expectStableUniqueValue(readySamples.map((sample) => sample.metaColor), expectedMuted)
      expectStableUniqueValue(readySamples.map((sample) => sample.sunDisplay), expectedSunDisplay)
      expectStableUniqueValue(readySamples.map((sample) => sample.moonDisplay), expectedMoonDisplay)
      expect(readySamples.at(-1)?.bootstrapStyleCount).toBe(0)
      await expect(page.locator("html")).toHaveAttribute("data-aquila-scheme", firstPaintCase.expectedScheme)
      expect(await readRuntimeRecoveryReasonCount(page)).toBe(0)
      expect(hydrationErrors).toEqual([])
    })
  }

  test("헤더 테마 토글은 루트, form control, 메인 feed surface를 함께 전환한다", async ({ page }) => {
    await prepareHomeThemePage(page)
    await assertHomeThemeToggleUsesLightFeedSurface(page)
  })

  test("모바일 헤더 테마 토글도 메인 feed surface를 함께 전환한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await prepareHomeThemePage(page)
    await assertHomeThemeToggleUsesLightFeedSurface(page)
  })
})
